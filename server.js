// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');
const craftingRecipes = require('./public/js/recipes');
const itemDatabase = require('./public/js/items');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/recipes.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/js/recipes.js'));
});
app.get('/items.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/js/items.js'));
});

// MongoDB Kapcsolat
mongoose.connect(config.MONGO_URI, {}).then(() => {
    console.log("🔥 MongoDB sikeresen csatlakoztatva!");
}).catch(err => {
    console.error("❌ MongoDB csatlakozási hiba:", err);
});

// Teljes körű Felhasználói Séma
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'avatar1.png' },
    playerData: {
        hp: { type: Number, default: 100 },
        maxHp: { type: Number, default: 100 },
        money: { type: Number, default: 100 },
        level: { type: Number, default: 1 },
        xp: { type: Number, default: 0 },
        fatigue: { type: Number, default: 0 },
        hunger: { type: Number, default: 100 },
        thirst: { type: Number, default: 100 },
        inventory: { type: Array, default: [] },
        equipment: { 
            weapon: { type: String, default: null },
            armor: { type: String, default: null },
            shoes: { type: String, default: null },
            helmet: { type: String, default: null },
            torso: { type: String, default: null },
            legs: { type: String, default: null },
            backpack: { type: String, default: null }
        }
    },
    buildings: { type: Array, default: [] }
});

const PlayerModel = mongoose.model('SurvivalUser', userSchema);

// --- REGISZTRÁCIÓS VÉGPONT ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, avatar } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Minden mezőt ki kell tölteni!' });
        }

        const existingUser = await PlayerModel.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Ez a felhasználónév már foglalt!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new PlayerModel({
            username,
            email,
            password: hashedPassword,
            avatar: avatar || 'avatar1.png',
            playerData: {
                hp: 100, maxHp: 100, money: 100, level: 1, xp: 0,
                fatigue: 0, hunger: 100, thirst: 100, inventory: [],
                equipment: { weapon: null, armor: null, shoes: null, helmet: null, torso: null, legs: null, backpack: null }
            },
            buildings: []
        });

        await newUser.save();
        res.json({ success: true, message: 'Sikeres regisztráció!' });
    } catch (e) {
        console.error("Hiba regisztrációnál:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a regisztráció során.' });
    }
});

// --- BEJELENTKEZÉSI VÉGPONT ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await PlayerModel.findOne({ username });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        res.json({
            success: true,
            username: user.username,
            avatar: user.avatar,
            player: user.playerData,
            buildings: user.buildings
        });
    } catch (e) {
        console.error("Hiba bejelentkezéskor:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a bejelentkezés során.' });
    }
});

const activePlayers = {};

// --- SZERVER OLDALI TÚLÉLÉSI CIKLUS ---
setInterval(async () => {
    for (let username in activePlayers) {
        try {
            const user = await PlayerModel.findOne({ username });
            if (!user || !user.playerData) continue;

            let p = user.playerData;
            p.hunger = Math.max(0, (Number(p.hunger) || 100) - 1);
            p.thirst = Math.max(0, (Number(p.thirst) || 100) - 1.5);

            let isCritical = false;
            if (p.hunger <= 0 && p.thirst <= 0) {
                p.hp = Math.max(0, (Number(p.hp) || 100) - 10);
                isCritical = true;
            } else if (p.hunger <= 0 || p.thirst <= 0) {
                p.hp = Math.max(0, (Number(p.hp) || 100) - 5);
                isCritical = true;
            }

            await PlayerModel.findOneAndUpdate({ username }, { playerData: p });

            const socketId = activePlayers[username].socketId;
            io.to(socketId).emit('server_status_update', {
                hunger: p.hunger,
                thirst: p.thirst,
                hp: p.hp,
                isCritical: isCritical
            });

            if (p.hp <= 0) {
                io.to(socketId).emit('game_over');
            }
        } catch (err) {
            console.error("Hiba a szerver oldali túlélési tick során:", err);
        }
    }
}, 40000);





/*/ ---------------------------------------------------------------------------------------- TELJES, VALÓSÁGHŰ ÉS RÉSZLETES SZERVER OLDALI LOOT SORSOLÁS ---
function rollServerLoot(buildingName) {
    let possibleItems = [];
    let emptyChance = 0.50; // Alapértelmezetten kicsit barátságosabb esély, hogy mindenhol lehessen találni valamit

    if (buildingName.includes('Élelmiszerbolt')) {
        possibleItems = ['canned_food', 'tuna_can', 'mre_ration', 'energy_bar', 'water_bottle', 'kvass', 'energy_drink', 'cigarette'];
        emptyChance = 0.30;
    } else if (buildingName.includes('Kisbolt / Trafik')) {
        possibleItems = ['cigarette', 'energy_drink', 'canned_food', 'energy_bar', 'water_bottle', 'lighter'];
        emptyChance = 0.30;
    } else if (buildingName.includes('Barkácsáruház')) {
        possibleItems = ['scrap_metal', 'duct_tape', 'nails', 'wire', 'hammer', 'wrench', 'battery'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Étterem / Kávézó / Fagyizó / Csárda')) {
        possibleItems = ['energy_bar', 'water_bottle', 'canned_food', 'bottle_cap', 'rag'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Benzinkút / Kút')) {
        possibleItems = ['fuel_can', 'energy_drink', 'cigarette', 'canned_food', 'water_bottle', 'lighter'];
        emptyChance = 0.30;
    } else if (buildingName.includes('Kocsma / Pub / Söröző')) {
        possibleItems = ['kvass', 'alcohol', 'canned_food', 'energy_bar', 'rag', 'cigarette'];
        emptyChance = 0.30;
    } else if (buildingName.includes('Gyógyszertár')) {
        possibleItems = ['painkillers', 'bandage', 'rag_bandage', 'antibiotics', 'alcohol', 'medkit'];
        emptyChance = 0.25;
    } else if (buildingName.includes('Kórház')) {
        possibleItems = ['painkillers', 'bandage', 'rag_bandage', 'antibiotics', 'alcohol', 'medkit'];
        emptyChance = 0.25;
    } else if (buildingName.includes('Rendőrség')) {
        possibleItems = ['makarov', 'ammo_9mm', 'kevlar_vest', 'handcuffs', 'bandage'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Tűzoltóság')) {
        possibleItems = ['axe', 'rope', 'flashlight', 'water_bottle', 'rag'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Katonai bázis')) {
        possibleItems = ['ak47', 'makarov', 'ammo_9mm', 'ammo_762', 'kevlar_vest', 'military_helmet', 'gas_mask', 'mre_ration'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Kormányzati Bunker / Óvóhely')) {
        possibleItems = ['gas_mask', 'mre_ration', 'filter', 'water_bottle', 'ammo_762', 'medkit'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Elhagyatott Katonai Ellenőrzőpont / Blokád')) {
        possibleItems = ['makarov', 'ammo_9mm', 'barbed_wire', 'military_helmet', 'canned_food'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Katasztrófavédelmi / Vegyvédelmi Központ')) {
        possibleItems = ['gas_mask', 'filter', 'antibiotics', 'medkit', 'hazmat_suit'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Iskola / Óvoda')) {
        possibleItems = ['book', 'pencil', 'pen', 'paper', 'map', 'canned_food', 'flashlight'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Könyvtár')) {
        possibleItems = ['book', 'paper', 'pen', 'map', 'flashlight'];
        emptyChance = 0.30;
    } else if (buildingName.includes('Templom / Kápolna')) {
        possibleItems = ['candle', 'cross', 'wine', 'book', 'rag', 'old_coin'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Kolostor / Apátság')) {
        possibleItems = ['wine', 'book', 'candle', 'herbs', 'cross', 'rag'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Városháza / Polgármesteri Hivatal')) {
        possibleItems = ['key', 'document', 'pen', 'paper', 'old_coin', 'map'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Múzeum / Kiállítóterem')) {
        possibleItems = ['old_coin', 'antique_item', 'book', 'painting_fragment', 'rag'];
        emptyChance = 0.45;
    } else if (buildingName.includes('Bíróság / Ügyvédi Iroda')) {
        possibleItems = ['document', 'pen', 'paper', 'briefcase', 'book'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Mozi / Színház / Művelődési Ház')) {
        possibleItems = ['ticket', 'flashlight', 'energy_bar', 'rag', 'popcorn'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Elhagyatott raktár')) {
        possibleItems = ['scrap_metal', 'cardboard_box', 'duct_tape', 'crowbar', 'wire'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Ipari létesítmény / Gyár')) {
        possibleItems = ['scrap_metal', 'steel_plate', 'wrench', 'battery', 'engine_parts'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Autószerviz / Gumis')) {
        possibleItems = ['wrench', 'jack', 'fuel_can', 'tire', 'scrap_metal', 'engine_parts'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Autóbontó / Roncstelep')) {
        possibleItems = ['scrap_metal', 'tire', 'engine_parts', 'car_battery', 'metal_pipe'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Garázs')) {
        possibleItems = ['wrench', 'hammer', 'gas_can', 'scrap_metal', 'rag', 'flashlight'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Vasútállomás / Rendezőpályaudvar')) {
        possibleItems = ['metal_plate', 'coal', 'wrench', 'flashlight', 'map', 'rag'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Posta / Csomagátvevő pont')) {
        possibleItems = ['package', 'tape', 'letter', 'pen', 'scissors'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Mezőgazdasági Géptelep / Téesz')) {
        possibleItems = ['pitchfork', 'shovel', 'seeds', 'fertilizer', 'fuel_can', 'rope'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Malom / Gabonasiló')) {
        possibleItems = ['flour_bag', 'grain', 'shovel', 'rope', 'sack'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Állatfarm / Lovarda')) {
        possibleItems = ['pitchfork', 'rope', 'horseshoe', 'apple', 'bucket'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Víztorony / Vízmű')) {
        possibleItems = ['pipe', 'wrench', 'valve', 'water_bottle', 'filter'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Elektromos Alállomás / Trafóház')) {
        possibleItems = ['copper_wire', 'battery', 'pliers', 'fuse', 'insulator'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Szálloda / Hotel / Panzió')) {
        possibleItems = ['soap', 'towel', 'energy_bar', 'water_bottle', 'pillow', 'rag'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Motel / Kamionos pihenő')) {
        possibleItems = ['soap', 'towel', 'energy_drink', 'cigarette', 'canned_food', 'rag'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Sportcsarnok / Edzőterem')) {
        possibleItems = ['energy_drink', 'water_bottle', 'dumbbell', 'towel', 'energy_bar'];
        emptyChance = 0.35;
    } else if (buildingName.includes('Stadion / Futballpálya')) {
        possibleItems = ['football', 'water_bottle', 'energy_bar', 'whistle', 'rag'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Strand / Uszoda')) {
        possibleItems = ['swimsuit', 'towel', 'goggles', 'water_bottle', 'flip_flops'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Temető')) {
        possibleItems = ['bone', 'old_coin', 'rag', 'candle', 'wreath'];
        emptyChance = 0.50;
    } else {
        // Alapértelmezett (Romos ház / egyéb)
        possibleItems = ['rag', 'canned_food', 'stone', 'stick', 'water_bottle', 'bottle_cap'];
        emptyChance = 0.50;
    } 

    if (Math.random() < emptyChance) return [];
    
    let found = [];
    let dropCount = Math.random() < 0.3 ? 2 : 1; // Kicsit nagyobb esély 2 tárgyra is
    for (let i = 0; i < dropCount; i++) {
        found.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
    }
    return found;
}



------------------------------------------------00000000-------------------------------------------------------*/






// --- DINAMIKUS ÉS AUTOMATA SZERVER OLDALI LOOT SORSOLÁS ---
function rollServerLoot(buildingName) {
    let emptyChance = 0.40; // Alap üresen maradás esélye
    let matchingItems = [];

    // Végigfutunk a központi itemDatabase-en, amit a szerver betölt
    for (let key in itemDatabase) {
        let item = itemDatabase[key];
        
        // Ha a tárgynak van megadva lehetséges helye (canSpawnIn tömb)
        if (item.canSpawnIn && Array.isArray(item.canSpawnIn)) {
            // Megnézzük, hogy az épület neve vagy típusa illeszkedik-e valamelyik kulcsszóra
            let matches = item.canSpawnIn.some(locationKey => 
                buildingName.toLowerCase().includes(locationKey.toLowerCase())
            );
            
            if (matches) {
                matchingItems.push(key);
            }
        }
    }

    // Ha egyetlen tárgy sem illik az épülethez, visszatérünk egy alapértelmezett romos hájas listával
    if (matchingItems.length === 0) {
        matchingItems = ['rag', 'canned_food', 'stone', 'stick', 'water_bottle', 'bottle_cap'];
        emptyChance = 0.60;
    }

    // Dobás: üres lesz-e az épület?
    if (Math.random() < emptyChance) return [];
    
    let found = [];
    let dropCount = Math.random() < 0.25 ? 2 : 1; // Néha 2 tárgyat is dobhat
    for (let i = 0; i < dropCount; i++) {
        let randomKey = matchingItems[Math.floor(Math.random() * matchingItems.length)];
        found.push(randomKey);
    }
    
    return found;
}

io.on('connection', (socket) => {
    console.log(`🔌 Új kliens csatlakozott: ${socket.id}`);

    // --- BIZTONSÁGOS TÁRGY HASZNÁLAT ---
    socket.on('use_item', async (data) => {
        if (!data || !data.username || !data.itemKey) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            let invSlot = p.inventory.find(slot => slot.key === data.itemKey);
            if (!invSlot || invSlot.count <= 0) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Nincs ilyen tárgy a leltáradban!' });
                return;
            }

            const itemConfig = itemDatabase[data.itemKey];
            if (!itemConfig) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Ismeretlen tárgy!' });
                return;
            }

            let message = '';
            let used = false;

            if (itemConfig.type === 'food') {
                p.hunger = Math.min(100, (p.hunger || 100) + 35);
                message = `Megetted ezt: ${itemConfig.name}.`;
                used = true;
            } else if (itemConfig.type === 'drink' || itemConfig.type === 'water') {
                p.thirst = Math.min(100, (p.thirst || 100) + 40);
                message = `Megitrad ezt: ${itemConfig.name}.`;
                used = true;
            } else if (itemConfig.type === 'medicine' || itemConfig.type === 'medical') {
                p.hp = Math.min(p.maxHp || 100, (p.hp || 100) + (itemConfig.value || 35));
                message = `Használtad ezt: ${itemConfig.name}.`;
                used = true;
            }

            if (!used) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Ezt a tárgyat nem lehet így használni!' });
                return;
            }

            invSlot.count -= 1;
            if (invSlot.count <= 0) {
                p.inventory = p.inventory.filter(slot => slot.key !== data.itemKey);
            }

            await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('item_use_result', {
                    success: true,
                    inventory: p.inventory,
                    player: p,
                    message: message
                });
            }
        } catch (err) {
            console.error("Hiba tárgy használat során:", err);
        }
    });

    // --- BIZTONSÁGOS FELSZERELÉS (EQUIP) ---
    socket.on('equip_item', async (data) => {
        if (!data || !data.username || !data.itemKey || !data.slotType) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];
            if (!p.equipment) p.equipment = {};

            let invSlot = p.inventory.find(slot => slot.key === data.itemKey);
            if (!invSlot || invSlot.count <= 0) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('equip_result', { success: false, message: 'A tárgy nincs a leltáradban!' });
                return;
            }

            let currentEquipped = p.equipment[data.slotType];
            if (currentEquipped) {
                let existingInv = p.inventory.find(slot => slot.key === currentEquipped);
                if (existingInv) {
                    existingInv.count += 1;
                } else {
                    p.inventory.push({ key: currentEquipped, count: 1 });
                }
            }

            invSlot.count -= 1;
            if (invSlot.count <= 0) {
                p.inventory = p.inventory.filter(slot => slot.key !== data.itemKey);
            }

            p.equipment[data.slotType] = data.itemKey;

            await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('equip_result', {
                    success: true,
                    inventory: p.inventory,
                    equipment: p.equipment,
                    message: `Sikeresen felszerelve!`
                });
            }
        } catch (err) {
            console.error("Hiba felszerelés során:", err);
        }
    });

    // --- HARC LEVEZÉNYLÉSE ---
    socket.on('resolve_combat', async (data) => {
        if (!data || !data.username) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            let weaponBonus = 5;
            if (p.equipment && p.equipment.weapon) {
                if (p.equipment.weapon === 'ak47') weaponBonus = 35;
                else if (p.equipment.weapon === 'makarov') weaponBonus = 18;
                else if (p.equipment.weapon === 'crowbar' || p.equipment.weapon === 'machete') weaponBonus = 12;
            }

            let armorBonus = 0;
            if (p.equipment && p.equipment.armor) {
                if (p.equipment.armor === 'kevlar_vest') armorBonus = 25;
                else if (p.equipment.armor === 'leather_jacket') armorBonus = 10;
            }

            let enemyHp = 40 + (p.level * 5);
            let enemyDamage = 15;
            let playerHp = p.hp || 100;
            let rounds = 0;

            while (enemyHp > 0 && playerHp > 0 && rounds < 10) {
                rounds++;
                let pHit = Math.floor(Math.random() * 10) + weaponBonus;
                enemyHp -= pHit;

                if (enemyHp <= 0) break;

                let eHit = Math.max(2, (Math.floor(Math.random() * 10) + enemyDamage) - armorBonus);
                playerHp -= eHit;
            }

            if (playerHp <= 0) {
                p.hp = 0;
                await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('combat_result', { success: false, hp: 0, message: 'Vereséget szenvedtél a harcban!' });
                return;
            }

            p.hp = playerHp;
            p.money = (p.money || 100) + 25;
            p.xp = (p.xp || 0) + 30;

            let nextLevelXp = (p.level || 1) * 100;
            let leveledUp = false;
            if (p.xp >= nextLevelXp) {
                p.level = (p.level || 1) + 1;
                p.xp -= nextLevelXp;
                leveledUp = true;
                p.maxHp = (p.maxHp || 100) + 10;
                p.hp = p.maxHp;
            }

            let rewardItem = null;
            if (Math.random() < 0.4) {
                const possibleRewards = ['rag', 'canned_food', 'ammo_9mm', 'bandage'];
                rewardItem = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];
                let existing = p.inventory.find(slot => slot.key === rewardItem);
                if (existing) existing.count += 1;
                else p.inventory.push({ key: rewardItem, count: 1 });
            }

            await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('combat_result', {
                    success: true,
                    player: p,
                    rewardItem: rewardItem,
                    leveledUp: leveledUp,
                    message: `Győzelem! Nyertél 30 XP-t, 25 pénzt${rewardItem ? ' és találtál egy tárgyat' : ''}!`
                });
            }
        } catch (err) {
            console.error("Hiba a szerver oldali harc során:", err);
        }
    });

    // --- POZÍCIÓ SZINKRON ---
    socket.on('update_position', (data) => {
        if (data && data.username && data.lat && data.lng) {
            activePlayers[data.username] = {
                socketId: socket.id,
                username: data.username,
                lat: data.lat,
                lng: data.lng,
                avatar: data.avatar || 'avatar1.png'
            };
            socket.broadcast.emit('players_update', activePlayers);
        }
    });

    // --- CRAFTOLÁS ---
    socket.on('craft_item', async (data) => {
        if (!data || !data.username || !data.recipeKey) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            const recipe = craftingRecipes.find(r => r.key === data.recipeKey);
            if (!recipe) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('craft_result', { success: false, message: 'Ismeretlen recept!' });
                return;
            }

            for (let [matKey, reqQty] of Object.entries(recipe.req)) {
                let invSlot = p.inventory.find(slot => slot.key === matKey);
                let totalHave = invSlot ? invSlot.count : 0;
                if (totalHave < reqQty) {
                    const socketId = activePlayers[data.username]?.socketId;
                    if (socketId) io.to(socketId).emit('craft_result', { success: false, message: `Nincs elég alapanyag: ${matKey} (Kellene: ${reqQty})` });
                    return;
                }
            }

            let hasExistingSlot = p.inventory.some(slot => slot.key === recipe.key);
            let maxSlots = p.maxInv || 10;
            if (!hasExistingSlot && p.inventory.length >= maxSlots) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('craft_result', { success: false, message: 'A hátizsákod tele van!' });
                return;
            }

            for (let [matKey, reqQty] of Object.entries(recipe.req)) {
                let invSlot = p.inventory.find(slot => slot.key === matKey);
                if (invSlot) {
                    invSlot.count -= reqQty;
                    if (invSlot.count <= 0) {
                        p.inventory = p.inventory.filter(slot => slot.key !== matKey);
                    }
                }
            }

            let targetSlot = p.inventory.find(slot => slot.key === recipe.key);
            let craftCount = recipe.count || 1;
            if (targetSlot) {
                targetSlot.count += craftCount;
            } else {
                p.inventory.push({ key: recipe.key, count: craftCount });
            }

            await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('craft_result', {
                    success: true,
                    inventory: p.inventory,
                    message: `Sikeresen megbarkácsoltad: ${recipe.name}!`
                });
            }
        } catch (err) {
            console.error("Hiba a szerver oldali craftolás során:", err);
        }
    });

    // --- XP JÓVÁÍRÁS ---
    socket.on('gain_xp', async (data) => {
        if (!data || !data.username || !data.amount) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            p.xp = (p.xp || 0) + Number(data.amount);
            let nextLevelXp = (p.level || 1) * 100;

            let leveledUp = false;
            if (p.xp >= nextLevelXp) {
                p.level = (p.level || 1) + 1;
                p.xp -= nextLevelXp;
                leveledUp = true;
            }

            await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('xp_updated', {
                    xp: p.xp,
                    level: p.level,
                    leveledUp: leveledUp
                });
            }
        } catch (err) {
            console.error("Hiba az XP növelésekor:", err);
        }
    });

    // --- LOOTOLÁS ---
    socket.on('loot_building', async (data) => {
        if (!data || !data.username || !data.buildingId) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            let maxSlots = p.maxInv || 10;
            if (p.inventory.length >= maxSlots) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('loot_result', { success: false, message: 'A hátizsákod tele van!' });
                return;
            }

            const foundItems = rollServerLoot(data.buildingName || 'Romos ház');
            const lockDuration = 4 * 60 * 60 * 1000;
            const lockedUntilTime = Date.now() + lockDuration;

            if (foundItems.length === 0) {
                await PlayerModel.findOneAndUpdate(
                    { username: data.username },
                    { $addToSet: { buildings: { id: data.buildingId, lockedUntil: lockedUntilTime } } }
                );

                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) {
                    io.to(socketId).emit('loot_result', { 
                        success: true, items: [], message: `Ez a(z) ${data.buildingName} üres volt.`,
                        buildingId: data.buildingId, lockedUntil: lockedUntilTime
                    });
                }
                io.emit('building_looted_update', { id: data.buildingId, looted: true, lockedUntil: lockedUntilTime });
                return;
            }

            foundItems.forEach(itemKey => {
                let existing = p.inventory.find(slot => slot.key === itemKey);
                if (existing) existing.count += 1;
                else p.inventory.push({ key: itemKey, count: 1 });
            });

            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { playerData: p, $addToSet: { buildings: { id: data.buildingId, lockedUntil: lockedUntilTime } } }
            );

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('loot_result', {
                    success: true, items: foundItems, inventory: p.inventory,
                    buildingId: data.buildingId, lockedUntil: lockedUntilTime
                });
            }

            io.emit('building_looted_update', { id: data.buildingId, looted: true, lockedUntil: lockedUntilTime });
        } catch (err) {
            console.error("Hiba a szerver oldali lootolás során:", err);
        }
    });

    socket.on('building_looted', async (data) => {
        if (data && data.id && data.username) {
            const lockDuration = 4 * 60 * 60 * 1000;
            const lockedUntilTime = Date.now() + lockDuration;
            try {
                await PlayerModel.findOneAndUpdate(
                    { username: data.username },
                    { $addToSet: { buildings: { id: data.id, lockedUntil: lockedUntilTime } } }
                );
            } catch (err) {
                console.error("Hiba a kifosztott épület mentésekor:", err);
            }
            io.emit('building_looted_update', { id: data.id, looted: true, lockedUntil: lockedUntilTime });
        }
    });

    // --- BIZTONSÁGOS MENTÉS ---
    socket.on('save_player', async (data) => {
        if (!data || !data.username) return;
        try {
            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { playerData: data.player, buildings: data.buildings },
                { upsert: true }
            );
            socket.emit('save_success');
        } catch (e) {
            console.error("Hiba mentéskor:", e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Kliens levált: ${socket.id}`);
        for (let username in activePlayers) {
            if (activePlayers[username].socketId === socket.id) {
                delete activePlayers[username];
                break;
            }
        }
        io.emit('players_update', activePlayers);
    });
});

server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO fut.`);
});