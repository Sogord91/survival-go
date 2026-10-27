// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');
const craftingRecipes = require('./recipes');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const itemDatabase = require('./items');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/recipes.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'recipes.js'));
});
app.get('/items.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'items.js'));
});

// MongoDB Kapcsolat
mongoose.connect(config.MONGO_URI, {
}).then(() => {
    console.log("🔥 MongoDB sikeresen csatlakoztatva!");
}).catch(err => {
    console.error("❌ MongoDB csatlakozási hiba:", err);
});

// Teljes körű Felhasználói Séma (Minden adat egy helyen, biztonságosan)
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true }, // Titkosított jelszó (Hash)
    avatar: { type: String, default: 'avatar1.png' }, // Kiválasztott alap avatár kép
    
    // Karakter adatok (pénz, státusz, leltár, felszerelés)
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
    
    // Épületek állapota (loot, idők, zárolások) mentése
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

        // Jelszó biztonságos titkosítása
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new PlayerModel({
            username,
            email,
            password: hashedPassword,
            avatar: avatar || 'avatar1.png',
            playerData: {
                hp: 100,
                maxHp: 100,
                money: 100,
                level: 1,
                xp: 0,
                fatigue: 0,
                hunger: 100,
                thirst: 100,
                inventory: [],
                equipment: { 
                    weapon: null, 
                    armor: null, 
                    shoes: null, 
                    helmet: null, 
                    torso: null, 
                    legs: null, 
                    backpack: null 
                }
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

        // Jelszó összehasonlítása a hash-el
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        // Visszaküldjük a teljes mentett karakterállapotot és az épületeket
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


// --- VALÓS IDEJŰ MULTIPLAYER & MENTÉS SOCKET.IO-VAL ---
const activePlayers = {};

// --- SZERVER OLDALI TÚLÉLÉSI CIKLUS (Csalásmentes éhség/szomjúság tick) ---
setInterval(async () => {
    for (let username in activePlayers) {
        try {
            const user = await PlayerModel.findOne({ username });
            if (!user || !user.playerData) continue;

            let p = user.playerData;
            
            if (p.status) {
                if (p.hunger === undefined) p.hunger = p.status.food ?? 100;
                if (p.thirst === undefined) p.thirst = p.status.water ?? 100;
            }

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
}, 40000); // 40 másodpercenkénti tick

// --- TELJES, RÉSZLETES SZERVER OLDALI LOOT SORSOLÁS ---
function rollServerLoot(buildingName) {
    let possibleItems = [];
    let emptyChance = 0.60;

    // 1. Kereskedelmi / Boltok
    if (buildingName.includes('Élelmiszerbolt') || buildingName.includes('Kisbolt / Trafik')) {
        possibleItems = ['canned_food', 'tuna_can', 'mre_ration', 'energy_bar', 'water_bottle', 'kvass', 'energy_drink', 'cigarette'];
        emptyChance = 0.35;
    } 
    // 2. Barkács, Ipari, Műhelyek
    else if (buildingName.includes('Barkácsáruház') || buildingName.includes('Elhagyatott raktár') || buildingName.includes('Ipari létesítmény / Gyár')) {
        possibleItems = ['scrap_metal', 'duct_tape', 'nails', 'wire', 'hammer', 'wrench', 'battery'];
        emptyChance = 0.40;
    } 
    // 3. Autós témák / Szerviz / Roncstelep / Garázs
    else if (buildingName.includes('Autószerviz') || buildingName.includes('Autóbontó') || buildingName.includes('Garázs')) {
        possibleItems = ['scrap_metal', 'engine_parts', 'fuel_can', 'wrench', 'battery', 'duct_tape'];
        emptyChance = 0.45;
    } 
    // 4. Benzinkút
    else if (buildingName.includes('Benzinkút')) {
        possibleItems = ['fuel_can', 'energy_drink', 'cigarette', 'canned_food', 'water_bottle'];
        emptyChance = 0.40;
    } 
    // 5. Vendéglátás / Kocsma / Étterem
    else if (buildingName.includes('Étterem') || buildingName.includes('Kocsma / Pub')) {
        possibleItems = ['kvass', 'alcohol', 'canned_food', 'energy_bar', 'rag'];
        emptyChance = 0.40;
    } 
    // 6. Egészségügy (Gyógyszertár / Kórház)
    else if (buildingName.includes('Gyógyszertár') || buildingName.includes('Kórház')) {
        possibleItems = ['painkillers', 'bandage', 'rag_bandage', 'antibiotics', 'alcohol', 'medkit'];
        emptyChance = 0.30;
    } 
    // 7. Katonai / Rendőrség / Tűzoltóság / Bunker / Ellenőrzőpont
    else if (buildingName.includes('Rendőrség') || buildingName.includes('Katonai bázis') || buildingName.includes('Bunker') || buildingName.includes('Ellenőrzőpont') || buildingName.includes('Vegyvédelmi')) {
        possibleItems = ['makarov', 'ak47', 'ammo_9mm', 'ammo_762', 'kevlar_vest', 'military_helmet', 'gas_mask', 'mre_ration'];
        emptyChance = 0.45;
    } 
    // 8. Intézmények / Iskola / Könyvtár / Városháza / Múzeum / Bíróság
    else if (buildingName.includes('Iskola') || buildingName.includes('Könyvtár') || buildingName.includes('Városháza') || buildingName.includes('Múzeum') || buildingName.includes('Bíróság')) {
        possibleItems = ['book', 'map', 'flashlight', 'paper', 'pen', 'canned_food'];
        emptyChance = 0.55;
    } 
    // 9. Templom / Kolostor
    else if (buildingName.includes('Templom') || buildingName.includes('Kolostor')) {
        possibleItems = ['candle', 'cross', 'wine', 'book', 'rag'];
        emptyChance = 0.60;
    } 
    // 10. Infrastruktúra / Víztorony / Trafóház / Vasút / Posta
    else if (buildingName.includes('Víztorony') || buildingName.includes('Elektromos Alállomás') || buildingName.includes('Vasútállomás') || buildingName.includes('Posta')) {
        possibleItems = ['wire', 'battery', 'scrap_metal', 'flashlight', 'duct_tape'];
        emptyChance = 0.50;
    } 
    // 11. Mezőgazdaság / Téesz / Malom / Farm
    else if (buildingName.includes('Mezőgazdasági') || buildingName.includes('Malom') || buildingName.includes('Állatfarm')) {
        possibleItems = ['seeds', 'fertilizer', 'rope', 'canned_food', 'pitchfork'];
        emptyChance = 0.50;
    } 
    // 12. Szálloda / Motel / Sport / Temető / Egyéb
    else if (buildingName.includes('Szálloda') || buildingName.includes('Motel')) {
        possibleItems = ['soap', 'towel', 'energy_bar', 'canned_food', 'rag'];
        emptyChance = 0.50;
    } else if (buildingName.includes('Sportcsarnok') || buildingName.includes('Stadion') || buildingName.includes('Strand')) {
        possibleItems = ['energy_drink', 'water_bottle', 'energy_bar', 'rag'];
        emptyChance = 0.55;
    } else if (buildingName.includes('Temető')) {
        possibleItems = ['bone', 'old_coin', 'rag', 'candle'];
        emptyChance = 0.70;
    } 
    // Alapértelmezett (Romos ház és mindent fel nem sorolt)
    else {
        possibleItems = ['rag', 'canned_food', 'stone', 'stick', 'water_bottle', 'bottle_cap'];
        emptyChance = 0.75;
    }

    if (Math.random() < emptyChance) return [];
    
    let found = [];
    let dropCount = Math.random() < 0.2 ? 2 : 1;
    for(let i = 0; i < dropCount; i++) {
        found.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
    }
    return found;
}

io.on('connection', (socket) => {
    console.log(`🔌 Új kliens csatlakozott: ${socket.id}`);

    // --- BIZTONSÁGOS, SZERVER OLDALI TÁRGY HASZNÁLAT ---
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

            let message = '';
            let used = false;

            // Ételek / Italok / Gyógyszerek hatásai
            if (data.itemKey === 'canned_food' || data.itemKey === 'tuna_can' || data.itemKey === 'energy_bar' || data.itemKey === 'mre_ration') {
                p.hunger = Math.min(100, (p.hunger || 100) + 35);
                message = 'Megetted a tárgyat. Az éhséged csökkent.';
                used = true;
            } else if (data.itemKey === 'water_bottle' || data.itemKey === 'kvass' || data.itemKey === 'energy_drink') {
                p.thirst = Math.min(100, (p.thirst || 100) + 40);
                message = 'Megitrad a tárgyat. A szomjúságod csökkent.';
                used = true;
            } else if (data.itemKey === 'bandage' || data.itemKey === 'rag_bandage') {
                p.hp = Math.min(p.maxHp || 100, (p.hp || 100) + 25);
                message = 'Betapasztottad a sebed, visszanyertél 25 HP-t.';
                used = true;
            } else if (data.itemKey === 'painkillers' || data.itemKey === 'medkit' || data.itemKey === 'antibiotics') {
                p.hp = Math.min(p.maxHp || 100, (p.hp || 100) + 50);
                message = 'Használtad az orvosságot, visszanyertél 50 HP-t.';
                used = true;
            }

            if (!used) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Ezt a tárgyat nem lehet így használni!' });
                return;
            }

            // Leltárból levonás
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

    // --- BIZTONSÁGOS, SZERVER OLDALI FELSZERELÉS (EQUIP) ---
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

            // Ha már van valami abban a slotban, visszatesszük a leltárba
            let currentEquipped = p.equipment[data.slotType];
            if (currentEquipped) {
                let existingInv = p.inventory.find(slot => slot.key === currentEquipped);
                if (existingInv) {
                    existingInv.count += 1;
                } else {
                    p.inventory.push({ key: currentEquipped, count: 1 });
                }
            }

            // Levesszük 1 darabot a leltárból
            invSlot.count -= 1;
            if (invSlot.count <= 0) {
                p.inventory = p.inventory.filter(slot => slot.key !== data.itemKey);
            }

            // Beállítjuk az új felszerelést
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

// --- BIZTONSÁGOS, RUGALMAS SZERVER OLDALI TÁRGY HASZNÁLAT ---
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

            // Lekérjük a tárgy adatait a központi itemDatabase-ből
            const itemConfig = itemDatabase[data.itemKey];
            if (!itemConfig) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Ismeretlen tárgy!' });
                return;
            }

            let message = '';
            let used = false;

            // Típus alapú automatikus kezelés
            if (itemConfig.type === 'food') {
                p.hunger = Math.min(100, (p.hunger || 100) + 35);
                message = `Megetted ezt: ${itemConfig.name}. Az éhséged csökkent.`;
                used = true;
            } else if (itemConfig.type === 'water') {
                p.thirst = Math.min(100, (p.thirst || 100) + 40);
                message = `Megitrad ezt: ${itemConfig.name}. A szomjúságod csökkent.`;
                used = true;
            } else if (itemConfig.type === 'medical') {
                p.hp = Math.min(p.maxHp || 100, (p.hp || 100) + 35);
                message = `Használtad ezt: ${itemConfig.name}. Visszanyertél némi HP-t.`;
                used = true;
            }

            if (!used) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('item_use_result', { success: false, message: 'Ezt a tárgyat nem lehet így használni!' });
                return;
            }

            // Leltárból levonás
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

// --- BIZTONSÁGOS, SZERVER OLDALI FELSZERELÉS (EQUIP) ---
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

            // Ha már van valami abban a slotban, visszatesszük a leltárba
            let currentEquipped = p.equipment[data.slotType];
            if (currentEquipped) {
                let existingInv = p.inventory.find(slot => slot.key === currentEquipped);
                if (existingInv) {
                    existingInv.count += 1;
                } else {
                    p.inventory.push({ key: currentEquipped, count: 1 });
                }
            }

            // Levesszük 1 darabot a leltárból
            invSlot.count -= 1;
            if (invSlot.count <= 0) {
                p.inventory = p.inventory.filter(slot => slot.key !== data.itemKey);
            }

            // Beállítjuk az új felszerelést
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

// Biztonságos, szerver oldali harc levezénylése
    socket.on('resolve_combat', async (data) => {
        if (!data || !data.username) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            // Egyszerűsített, de biztonságos szerver oldali harc szimuláció
            // Fegyver és páncél bónuszok számítása a felszerelés alapján
            let weaponBonus = 5; // Alap sebzés kézzel
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

            // Ellenség ereje (pl. zombi vagy fosztogató)
            let enemyHp = 40 + (p.level * 5);
            let enemyDamage = 15;

            // Harc körök / szimuláció a szerveren
            let playerHp = p.hp || 100;
            let rounds = 0;
            let combatSuccess = false;

            while (enemyHp > 0 && playerHp > 0 && rounds < 10) {
                rounds++;
                // Játékos üt
                let pHit = Math.floor(Math.random() * 10) + weaponBonus;
                enemyHp -= pHit;

                if (enemyHp <= 0) {
                    combatSuccess = true;
                    break;
                }

                // Ellenség visszatámad (a páncél csökkenti a kapott sebzést)
                let eHit = Math.max(2, (Math.floor(Math.random() * 10) + enemyDamage) - armorBonus);
                playerHp -= eHit;
            }

            if (playerHp <= 0) {
                playerHp = 0;
                p.hp = 0;
                await PlayerModel.findOneAndUpdate({ username: data.username }, { playerData: p });

                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) {
                    io.to(socketId).emit('combat_result', {
                        success: false,
                        hp: 0,
                        message: 'Vereséget szenvedtél a harcban!'
                    });
                }
                return;
            }

            // Ha nyert a játékos: Jutalmak kiosztása (XP, Pénz, esély lootra)
            p.hp = playerHp;
            p.money = (p.money || 100) + 25;
            p.xp = (p.xp || 0) + 30;

            // Szintlépés ellenőrzés szerveren
            let nextLevelXp = (p.level || 1) * 100;
            let leveledUp = false;
            if (p.xp >= nextLevelXp) {
                p.level = (p.level || 1) + 1;
                p.xp -= nextLevelXp;
                leveledUp = true;
                p.maxHp = (p.maxHp || 100) + 10;
                p.hp = p.maxHp; // Teljes gyógyulás szintlépéskor
            }

            // Harc utáni jutalom tárgy esély (pl. lőszer vagy kötszer)
            let rewardItem = null;
            if (Math.random() < 0.4) {
                const possibleRewards = ['rag', 'canned_food', 'ammo_9mm', 'bandage'];
                rewardItem = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];
                
                let existing = p.inventory.find(slot => slot.key === rewardItem);
                if (existing) {
                    existing.count += 1;
                } else {
                    p.inventory.push({ key: rewardItem, count: 1 });
                }
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

    // Pozíció és avatár frissítés a többieknek
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

    // Biztonságos, szerver oldali craftolás validálás és végrehajtás
    socket.on('craft_item', async (data) => {
        if (!data || !data.username || !data.recipeKey) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;
            if (!Array.isArray(p.inventory)) p.inventory = [];

            // Megkeressük a receptet a központi craftingRecipes tömbből
            const recipe = craftingRecipes.find(r => r.key === data.recipeKey);
            if (!recipe) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('craft_result', { success: false, message: 'Ismeretlen recept!' });
                return;
            }

            // Ellenőrizzük, hogy megvannak-e a játékosnál az alapanyagok
            for (let [matKey, reqQty] of Object.entries(recipe.req)) {
                let invSlot = p.inventory.find(slot => slot.key === matKey);
                let totalHave = invSlot ? invSlot.count : 0;
                if (totalHave < reqQty) {
                    const socketId = activePlayers[data.username]?.socketId;
                    if (socketId) io.to(socketId).emit('craft_result', { success: false, message: `Nincs elég alapanyag: ${matKey} (Kellene: ${reqQty})` });
                    return;
                }
            }

            // Hely ellenőrzés a leltárban (ha teljesen új slot kell)
            let hasExistingSlot = p.inventory.some(slot => slot.key === recipe.key);
            let maxSlots = p.maxInv || 10;
            if (!hasExistingSlot && p.inventory.length >= maxSlots) {
                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) io.to(socketId).emit('craft_result', { success: false, message: 'A hátizsákod tele van!' });
                return;
            }

            // Alapanyagok levonása
            for (let [matKey, reqQty] of Object.entries(recipe.req)) {
                let invSlot = p.inventory.find(slot => slot.key === matKey);
                if (invSlot) {
                    invSlot.count -= reqQty;
                    if (invSlot.count <= 0) {
                        p.inventory = p.inventory.filter(slot => slot.key !== matKey);
                    }
                }
            }

            // Kész tárgy hozzáadása a leltárhoz
            let targetSlot = p.inventory.find(slot => slot.key === recipe.key);
            if (targetSlot) {
                targetSlot.count += 1;
            } else {
                p.inventory.push({ key: recipe.key, count: 1 });
            }

            // Mentés az adatbázisba
            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { playerData: p }
            );

            // Visszaküldjük a sikeres eredményt a kliensnek
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

    // Biztonságos, szerver oldali XP és szintlépés kezelés
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

    // Biztonságos, szerver oldali lootolás esemény
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
                if (socketId) {
                    io.to(socketId).emit('loot_result', { success: false, message: 'A hátizsákod tele van!' });
                }
                return;
            }

            const foundItems = rollServerLoot(data.buildingName || 'Romos ház');
            if (foundItems.length === 0) {
                const lockDuration = 4 * 60 * 60 * 1000;
                const lockedUntilTime = Date.now() + lockDuration;

                await PlayerModel.findOneAndUpdate(
                    { username: data.username },
                    { $addToSet: { buildings: { id: data.buildingId, lockedUntil: lockedUntilTime } } }
                );

                const socketId = activePlayers[data.username]?.socketId;
                if (socketId) {
                    io.to(socketId).emit('loot_result', { 
                        success: true, 
                        items: [], 
                        message: `Ez a(z) ${data.buildingName} üres volt.`,
                        buildingId: data.buildingId,
                        lockedUntil: lockedUntilTime
                    });
                }
                
                io.emit('building_looted_update', { id: data.buildingId, looted: true, lockedUntil: lockedUntilTime });
                return;
            }

            foundItems.forEach(itemKey => {
                let existing = p.inventory.find(slot => slot.key === itemKey);
                if (existing) {
                    existing.count += 1;
                } else {
                    p.inventory.push({ key: itemKey, count: 1 });
                }
            });

            const lockDuration = 4 * 60 * 60 * 1000;
            const lockedUntilTime = Date.now() + lockDuration;

            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { 
                    playerData: p,
                    $addToSet: { buildings: { id: data.buildingId, lockedUntil: lockedUntilTime } }
                }
            );

            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('loot_result', {
                    success: true,
                    items: foundItems,
                    inventory: p.inventory,
                    buildingId: data.buildingId,
                    lockedUntil: lockedUntilTime
                });
            }

            io.emit('building_looted_update', { 
                id: data.buildingId, 
                looted: true, 
                lockedUntil: lockedUntilTime 
            });

        } catch (err) {
            console.error("Hiba a szerver oldali lootolás során:", err);
        }
    });

    // Épület kirablásának szinkronizálása a többiekkel
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

            io.emit('building_looted_update', { 
                id: data.id, 
                looted: true, 
                lockedUntil: lockedUntilTime 
            });
        }
    });

    // Játékállás mentése adatbázisba
    socket.on('save_player', async (data) => {
        try {
            if (!data.username) return;
            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { 
                    playerData: data.player, 
                    buildings: data.buildings 
                },
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

// --- BIZTONSÁGOS SZERVER OLDALI MENTÉS ---
    socket.on('save_player', async (data) => {
        if (!data || !data.username) return;

        try {
            const user = await PlayerModel.findOne({ username: data.username });
            if (!user || !user.playerData) return;

            let p = user.playerData;

            // Csak a nem kritikus, kliens által vezérelt adatok frissülhetnek így (pl. pozíció, nézet)
            if (data.position) {
                p.lat = data.position.lat;
                p.lng = data.position.lng;
            }
            
            if (data.settings) {
                p.settings = data.settings;
            }

            // Megjegyzés: A pénzt, leltárt, XP-t, HP-t NEM engedjük a kliensről felülírni,
            // azt kizárólag a szerver oldali események (loot, craft, harc, tárgyhasználat) kezelik!

            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { playerData: p }
            );

            // Visszajelzés a kliensnek, hogy a mentés sikeres
            const socketId = activePlayers[data.username]?.socketId;
            if (socketId) {
                io.to(socketId).emit('save_result', { success: true });
            }

        } catch (err) {
            console.error("Hiba a játékos mentése során:", err);
        }
    });
    
server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO szerver fut a http://localhost:${config.PORT} porton.`);
});