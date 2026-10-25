const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MONGODB ATLAS KAPCSOLAT ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://snapyg91_db_user:A0HOaz0VBqIFeaB2@survival-go.hdkdhzk.mongodb.net/survival_go?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('[Adatbázis] Sikeres csatlakozás a MongoDB-hez!'))
    .catch(err => console.error('[Adatbázis Hiba] Nem sikerült csatlakozni:', err));

// --- ADATBÁZIS SÉMÁK ---
const playerSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: '🥷' },
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    hunger: { type: Number, default: 100 },
    thirst: { type: Number, default: 100 },
    fatigue: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    inventory: { type: Array, default: [] },
    equipment: {
        helmet: { type: String, default: null },
        torso: { type: String, default: null },
        armor: { type: String, default: null },
        legs: { type: String, default: null },
        shoes: { type: String, default: null },
        backpack: { type: String, default: null },
        weapon: { type: String, default: null }
    },
    lat: { type: Number, default: 47.4979 },
    lng: { type: Number, default: 19.0402 }
});

const worldBuildingSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, default: 'store' }, // store, military, hospital, bunker, residential
    lat: { type: Number, required: true },
    lng: { type: Number, required: true, unique: true },
    isLooted: { type: Boolean, default: false },
    lastLootedTime: { type: Date, default: null }
});

const Player = mongoose.model('Player', playerSchema);
const WorldBuilding = mongoose.model('WorldBuilding', worldBuildingSchema);

// --- EXPRESS MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTH ROUTE-OK ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, avatar } = req.body;
        const existing = await Player.findOne({ username });
        if (existing) {
            return res.json({ success: false, message: 'Ez a túlélő név már foglalt!' });
        }
        const newPlayer = new Player({ username, password, avatar: avatar || '🥷' });
        await newPlayer.save();
        res.json({ success: true, message: 'Sikeres regisztráció! Most már bejelentkezhetsz.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Hiba történt a regisztráció során.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const player = await Player.findOne({ username, password });
        if (!player) {
            return res.json({ success: false, message: 'Hibás név vagy jelszó!' });
        }
        res.json({ success: true, message: 'Sikeres bejelentkezés!', player });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Hiba történt a bejelentkezés során.' });
    }
});

// --- TÁRGY ADATBÁZIS ---
const itemDatabase = {
    'vodka': { name: 'Zóna Vodka', tier: 1, category: 'drink', icon: '🍾', weight: 0.5 },
    'canned_meat': { name: 'Konzerv Hús', tier: 1, category: 'food', icon: '🍖', weight: 0.4 },
    'bandage': { name: 'Elsősegély Kötszer', tier: 1, category: 'medical', icon: '🩹', weight: 0.1 },
    'rusty_pipe': { name: 'Rozsdás Cső', tier: 1, category: 'melee', icon: '🔧', weight: 2.0 },
    'leather_jacket': { name: 'Bőrdzseki', tier: 1, category: 'armor', def: 5, icon: '🧥', weight: 3.0 },
    
    'pm_pistol': { name: 'Makarov Pisztoly', tier: 2, category: 'weapon', icon: '🔫', weight: 1.2 },
    '9mm_ammo': { name: '9mm Lőszer', tier: 2, category: 'ammo', icon: '📦', weight: 0.2 },
    'military_medkit': { name: 'Katonai Egészségügyi Csomag', tier: 2, category: 'medical', icon: '💊', weight: 0.5 },
    
    'ak47': { name: 'AK-47 Gépkarabély', tier: 3, category: 'weapon', icon: '🔥', weight: 3.5 },
    'ballistic_vest': { name: 'Golyóálló Mellény', tier: 3, category: 'armor', def: 25, icon: '🛡️', weight: 6.0 },
    
    'exo_skeleton': { name: 'Exoskeleton Váz', tier: 5, category: 'military', def: 80, icon: '🦾', weight: 15.0 }
};

// --- SZINT- ÉS ÉPÜLETTÍPUS-ALAPÚ LOOT MOTOR ---
function generateLootForPlayer(playerLevel, buildingType) {
    let maxTier = 1;
    if (playerLevel >= 10) maxTier = 5;
    else if (playerLevel >= 7) maxTier = 4;
    else if (playerLevel >= 4) maxTier = 3;
    else if (playerLevel >= 2) maxTier = 2;

    let categoryWeights = {};
    if (buildingType === 'military' || buildingType === 'bunker') {
        categoryWeights = { weapon: 35, ammo: 30, armor: 20, military: 10, medical: 5 };
    } else if (buildingType === 'hospital') {
        categoryWeights = { medical: 50, food: 20, drink: 20, misc: 10 };
    } else if (buildingType === 'store' || buildingType === 'gas_station') {
        categoryWeights = { food: 40, drink: 40, misc: 15, backpack: 5 };
    } else {
        categoryWeights = { food: 30, drink: 30, melee: 20, misc: 20 };
    }

    const eligibleItems = [];
    for (const key in itemDatabase) {
        const item = itemDatabase[key];
        if (item.tier <= maxTier && categoryWeights[item.category]) {
            const weight = categoryWeights[item.category] * (6 - item.tier);
            for (let i = 0; i < weight; i++) {
                eligibleItems.push({ key, ...item });
            }
        }
    }

    if (eligibleItems.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * eligibleItems.length);
    return eligibleItems[randomIndex];
}

// --- XP ÉS SZINTLÉPÉSI LOGIKA ---
function addExperienceAndCheckLevelUp(player, xpAmount) {
    player.xp = (player.xp || 0) + xpAmount;

    let xpNeededForNextLevel = player.level * 150; 
    if (player.level === 1) xpNeededForNextLevel = 100;
    else if (player.level === 2) xpNeededForNextLevel = 250;
    else if (player.level === 3) xpNeededForNextLevel = 500;
    else if (player.level === 4) xpNeededForNextLevel = 1000;

    let leveledUp = false;
    if (player.xp >= xpNeededForNextLevel) {
        player.level += 1;
        leveledUp = true;
    }

    return leveledUp;
}

// --- DINAMIKUS OPENSTREETMAP POI LEKÉRDEZŐ (OVERPASS API) ---
async function fetchAndSaveRealWorldPOIs(lat, lng) {
    try {
        const radius = 2000; // 2 km-es körzet
        const overpassQuery = `
            [out:json][timeout:25];
            (
              node["shop"](around:${radius},${lat},${lng});
              way["shop"](around:${radius},${lat},${lng});
              node["amenity"="hospital"](around:${radius},${lat},${lng});
              way["amenity"="hospital"](around:${radius},${lat},${lng});
              node["military"](around:${radius},${lat},${lng});
            );
            out body;
            >;
            out skel qt;
        `;

        const response = await axios.post('https://overpass-api.de/api/interpreter', overpassQuery, {
            headers: { 
                'Content-Type': 'text/plain',
                'User-Agent': 'SurvivalGOServer/1.0 (Contact: admin@survivalgo.local)'
            }
        });

        const elements = response.data.elements;
        if (!elements) return;

        for (const el of elements) {
            let elLat = el.lat;
            let elLng = el.lon;

            if (!elLat && el.center) {
                elLat = el.center.lat;
                elLng = el.center.lon;
            }

            if (elLat && elLng) {
                const exists = await WorldBuilding.findOne({ lat: elLat, lng: elLng });
                if (!exists) {
                    let type = 'store';
                    let name = el.tags?.name || 'Helyi Bolt';

                    if (el.tags?.amenity === 'hospital') {
                        type = 'hospital';
                        name = el.tags?.name || 'Helyi Kórház';
                    } else if (el.tags?.military) {
                        type = 'military';
                        name = el.tags?.name || 'Katonai Létesítmény';
                    }

                    await WorldBuilding.create({
                        name: name,
                        type: type,
                        lat: elLat,
                        lng: elLng,
                        isLooted: false
                    });
                }
            }
        }
    } catch (err) {
        console.error('Overpass API hiba:', err.message);
    }
}

// --- SOCKET.IO JÁTÉKOS KEZELÉS ---
const activePlayers = {};

io.on('connection', async (socket) => {
    console.log(`[Kapcsolat] Új kliens csatlakozott: ${socket.id}`);

    socket.on('player_join', async (data) => {
        activePlayers[socket.id] = {
            username: data.username,
            avatar: data.avatar || '🥷',
            lat: data.lat,
            lng: data.lng
        };

        // Letöltjük az OpenStreetMap POI-kat a játékos aktuális pozíciója köré
        await fetchAndSaveRealWorldPOIs(data.lat, data.lng);

        // Elküldjük az összes épületet a kliensnek
        const buildings = await WorldBuilding.find({});
        socket.emit('sync_world', buildings);
        io.emit('update_players', activePlayers);
    });

    socket.on('player_move', async (data) => {
        if (activePlayers[socket.id]) {
            const oldLat = activePlayers[socket.id].lat;
            const oldLng = activePlayers[socket.id].lng;
            activePlayers[socket.id].lat = data.lat;
            activePlayers[socket.id].lng = data.lng;

            socket.broadcast.emit('update_players', activePlayers);

            // Ha a játékos sokat mozdult (pl. kb. 500+ métert), frissítjük a környék POI-kat az Overpass API-ból
            const distApprox = Math.abs(data.lat - oldLat) + Math.abs(data.lng - oldLng);
            if (distApprox > 0.005) {
                await fetchAndSaveRealWorldPOIs(data.lat, data.lng);
                const buildings = await WorldBuilding.find({});
                io.emit('sync_world', buildings);
            }
        }
    });

    // LOOTOLÁSI KÉRELEM 4 ÓRÁS RESPAWN ÉS VÉDELEM LOGIKÁVAL
    socket.on('request_loot', async (data) => {
        try {
            const player = await Player.findOne({ username: data.username });
            const building = await WorldBuilding.findById(data.buildingId);

            if (!player || !building) {
                socket.emit('loot_result', { success: false, message: 'Hiba: A túlélő vagy az épület nem található!' });
                return;
            }

            // 4 órás (4 * 3600 * 1000 ms) vizsgálat a loot visszaálláshoz
            const now = new Date();
            if (building.isLooted && building.lastLootedTime) {
                const hoursPassed = (now - new Date(building.lastLootedTime)) / (1000 * 60 * 60);
                if (hoursPassed < 4) {
                    const remainingMins = Math.ceil((4 - hoursPassed) * 60);
                    socket.emit('loot_result', { 
                        success: false, 
                        message: `⏳ Ezt az épületet már kirámolták! Újra teli lesz még ${remainingMins} perc múlva.` 
                    });
                    return;
                } else {
                    // Letelt a 4 óra, respawnolt az épület!
                    building.isLooted = false;
                }
            }

            const lootedItem = generateLootForPlayer(player.level, building.type);

            if (lootedItem) {
                const existingItem = player.inventory.find(i => i.key === lootedItem.key);
                if (existingItem) {
                    existingItem.count = (existingItem.count || 1) + 1;
                } else {
                    player.inventory.push({ key: lootedItem.key, count: 1 });
                }

                building.isLooted = true;
                building.lastLootedTime = now;

                const earnedXp = lootedItem.tier * 25;
                const didLevelUp = addExperienceAndCheckLevelUp(player, earnedXp);

                await player.save();
                await building.save();

                const allBuildings = await WorldBuilding.find({});
                io.emit('sync_world', allBuildings);

                let message = `🎉 Sikeres kutatás! Találtál: ${lootedItem.icon} ${lootedItem.name} (Tier ${lootedItem.tier}) | +${earnedXp} XP`;
                if (didLevelUp) {
                    message += ` 🌟 SZINTLÉPÉS! Elérted a(z) ${player.level}. szintet!`;
                }

                socket.emit('loot_result', {
                    success: true,
                    message: message,
                    player: {
                        level: player.level,
                        xp: player.xp,
                        inventory: player.inventory
                    }
                });
            } else {
                socket.emit('loot_result', { success: false, message: '🔍 Itt most nem találtál semmi hasznosat.' });
            }
        } catch (err) {
            console.error('Loot hiba:', err);
            socket.emit('loot_result', { success: false, message: 'Szerverhiba történt a lootolás közben.' });
        }
    });

    socket.on('disconnect', () => {
        delete activePlayers[socket.id];
        io.emit('update_players', activePlayers);
    });
});

// --- SZERVER INDÍTÁSA ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Survival GO] Szerver fut a ${PORT}-es porton!`);
});