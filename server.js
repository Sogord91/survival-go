// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');
const authToken = require('./auth-token');
const craftingRecipes = require('./public/js/recipes');
const itemDatabase = require('./public/js/items');
const SurvivalStats = require('./public/js/stats'); // közös számítások (a kliens is ezt használja)
const SurvivalBuildings = require('./public/js/buildings'); // közös épülettípusok és loot-sorsolás
const Combat = require('./combat-engine'); // körös harc szabályai
const SurvivalSun = require('./public/js/sun'); // napkelte / napnyugta (éjszaka)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// A főoldal a szkriptek címéhez verziószámot fűz (pl. js/map.js?v=ab12cd34). Minden új telepítésnél
// más a szám, így a böngészők biztosan az új fájlokat töltik le, nem a régit veszik elő a gyorsítótárból.
const fs = require('fs');
const ASSET_VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 8) || Date.now().toString(36);
let indexHtmlCache = null;
function sendIndex(req, res) {
    if (!indexHtmlCache) {
        const raw = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
        indexHtmlCache = raw.replace(/(<script src="\/?js\/[^"?]+\.js)(")/g, `$1?v=${ASSET_VERSION}$2`);
    }
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(indexHtmlCache);
}
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(path.join(__dirname, 'public')));

// A Render (és a legtöbb tárhely) proxy mögött fut: a valódi IP-cím az X-Forwarded-For fejlécben van
app.set('trust proxy', 1);

// MongoDB Kapcsolat
mongoose.connect(config.MONGO_URI, {}).then(() => {
    console.log("🔥 MongoDB sikeresen csatlakoztatva!");
}).catch(err => {
    console.error("❌ MongoDB csatlakozási hiba:", err);
    process.exit(1); // adatbázis nélkül nincs értelme futni; a tárhely újraindítja a szervert
});

// Teljes körű Felhasználói Séma
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    usernameLower: { type: String, unique: true, sparse: true }, // a kis- és nagybetűtől független egyediséghez
    email: { type: String, required: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'avatar1.png' },
    earlySurvivor: { type: Boolean, default: false }, // "Korai túlélő" jelvény (végleges, a halál után is megmarad)
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
            backpack: { type: String, default: null },
            secondary: { type: String, default: null },  // másodlagos fegyver (pisztoly)
            melee: { type: String, default: null }       // közelharci fegyver (kés, macseta...)
        },
        lastSeen: { type: Number, default: null }, // utolsó online pillanat (az offline pihenéshez)
        dead: { type: Boolean, default: false },   // halott karakter: csak az újrakezdés (respawn) engedélyezett
        combat: { type: mongoose.Schema.Types.Mixed, default: null },     // folyamatban lévő harc (újracsatlakozás után is folytatódik)
        dangerUntil: { type: mongoose.Schema.Types.Mixed, default: {} }   // személyes zárak menekülés után: { épület-azonosító: lejárat }
    }
});

const PlayerModel = mongoose.model('SurvivalUser', userSchema);

// Egy friss túlélő adatai (regisztrációkor és a halál utáni újrakezdéskor), kezdőcsomaggal
// earlyKit: a korai túlélők első csomagja (dupla készlet, elemlámpa, felszerelt válltáska)
function newPlayerData(earlyKit) {
    const kit = earlyKit ? config.EARLY_SURVIVOR_KIT : config.STARTER_KIT;
    return {
        hp: 100, maxHp: 100, money: 100, level: 1, xp: 0,
        fatigue: 0, hunger: 100, thirst: 100,
        inventory: kit.map(s => ({ key: s.key, count: s.count })),
        equipment: { weapon: null, armor: null, shoes: null, helmet: null, torso: null, legs: null,
            backpack: earlyKit ? config.EARLY_SURVIVOR_BACKPACK : null, secondary: null, melee: null },
        lastSeen: null,
        dead: false,
        combat: null,
        dangerUntil: {}
    };
}

// --- FIÓKSZABÁLYOK ---
// Felhasználónév: 3-16 karakter, csak betűk (ékezetesek is) és számok. Jelszó: legalább 4 karakter.
const USERNAME_RE = new RegExp(`^[\\p{L}\\p{N}]{${config.USERNAME_MIN},${config.USERNAME_MAX}}$`, 'u');
function validateRegistration(username, email, password) {
    if (!USERNAME_RE.test(username)) return `A felhasználónév ${config.USERNAME_MIN}-${config.USERNAME_MAX} karakter lehet, csak betűkből és számokból.`;
    if (password.length < config.PASSWORD_MIN) return `A jelszó legalább ${config.PASSWORD_MIN} karakter legyen.`;
    if (password.length > config.PASSWORD_MAX) return `A jelszó legfeljebb ${config.PASSWORD_MAX} karakter lehet.`;
    if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Adj meg egy érvényes e-mail címet.';
    return null;
}

// --- BELÉPÉSI PRÓBÁLKOZÁSOK KORLÁTOZÁSA (jelszó-találgatás ellen) ---
const loginFails = new Map(); // IP -> { count, firstAt }
function loginBlocked(ip) {
    const entry = loginFails.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > config.LOGIN_WINDOW_MINUTES * 60000) { loginFails.delete(ip); return false; }
    return entry.count >= config.LOGIN_MAX_FAILS;
}
function recordLoginFail(ip) {
    const entry = loginFails.get(ip);
    if (!entry || Date.now() - entry.firstAt > config.LOGIN_WINDOW_MINUTES * 60000) loginFails.set(ip, { count: 1, firstAt: Date.now() });
    else entry.count += 1;
    if (loginFails.size > 10000) loginFails.clear(); // memória-védelem
}

// --- REGISZTRÁCIÓS VÉGPONT ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, avatar } = req.body || {};
        if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Minden mezőt ki kell tölteni!' });
        }
        const invalid = validateRegistration(username, email, password);
        if (invalid) return res.status(400).json({ success: false, message: invalid });

        // "Peti" és "peti" ne lehessen két külön játékos (megszemélyesítés ellen)
        const usernameLower = username.toLocaleLowerCase('hu');
        const existingUser = await PlayerModel.findOne({ username }) || await PlayerModel.findOne({ usernameLower });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Ez a felhasználónév már foglalt!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const early = config.EARLY_SURVIVOR_OPEN;
        const newUser = new PlayerModel({
            username,
            usernameLower,
            email,
            password: hashedPassword,
            avatar: safeAvatar(avatar),
            earlySurvivor: early,
            playerData: newPlayerData(early)
        });

        await newUser.save();
        res.json({ success: true, message: early ? 'Sikeres regisztráció! 🎖️ Korai túlélő vagy: extra felszereléssel indulsz.' : 'Sikeres regisztráció!' });
    } catch (e) {
        console.error("Hiba regisztrációnál:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a regisztráció során.' });
    }
});

// --- MUNKAMENET (TOKEN) SEGÉDFÜGGVÉNYEK ---
function issueToken(username) {
    return authToken.sign({ username }, config.JWT_SECRET, config.TOKEN_TTL_SECONDS);
}

// A belépés és a munkamenet-visszaállítás ugyanazt a választ adja, hogy a kliens egy helyen kezelhesse.
function buildSessionPayload(user, token) {
    return {
        success: true,
        username: user.username,
        avatar: safeAvatar(user.avatar),
        earlySurvivor: !!user.earlySurvivor,
        player: user.playerData,
        token
    };
}

// --- BEJELENTKEZÉSI VÉGPONT ---
app.post('/api/login', async (req, res) => {
    try {
        const ip = req.ip || 'unknown';
        if (loginBlocked(ip)) {
            return res.status(429).json({ success: false, message: `Túl sok sikertelen próbálkozás. Próbáld újra ${config.LOGIN_WINDOW_MINUTES} perc múlva!` });
        }
        const { username, password } = req.body || {};
        if (typeof username !== 'string' || typeof password !== 'string' || password.length > config.PASSWORD_MAX) {
            recordLoginFail(ip);
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }
        const user = await PlayerModel.findOne({ username });
        if (!user) {
            recordLoginFail(ip);
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            recordLoginFail(ip);
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }
        loginFails.delete(ip);

        res.json(buildSessionPayload(user, issueToken(user.username)));
    } catch (e) {
        console.error("Hiba bejelentkezéskor:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a bejelentkezés során.' });
    }
});

// --- MUNKAMENET VISSZAÁLLÍTÁSA TOKENNEL (automatikus belépés oldalfrissítés után) ---
app.get('/api/session', async (req, res) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';

        let payload;
        try {
            payload = authToken.verify(token, config.JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ success: false, code: e.code || 'TOKEN_INVALID', message: 'Érvénytelen vagy lejárt munkamenet.' });
        }
        if (typeof payload.username !== 'string') {
            return res.status(401).json({ success: false, code: 'TOKEN_INVALID', message: 'Érvénytelen vagy lejárt munkamenet.' });
        }

        const user = await PlayerModel.findOne({ username: payload.username });
        if (!user) {
            return res.status(401).json({ success: false, code: 'TOKEN_INVALID', message: 'Érvénytelen vagy lejárt munkamenet.' });
        }

        res.json(buildSessionPayload(user, token));
    } catch (e) {
        console.error("Hiba a munkamenet visszaállításakor:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a munkamenet visszaállítása során.' });
    }
});

// Az online játékosok (felhasználónév -> { socketId, username, avatar, lat, lng }).
// A kapcsolat létrejöttekor kerülnek be, a pozíció (lat/lng) az első update_position után töltődik ki.
const activePlayers = {};

// Csak a térképen megjeleníthető adatokat adjuk ki másoknak: socket azonosítót és
// még pozíció nélküli játékost nem.
// Csak a fehérlistás avatar fogadható el (a többi játékosnál HTML-be kerül, így nem lehet benne kód)
function safeAvatar(avatar) {
    return config.AVATARS.includes(avatar) ? avatar : config.AVATARS[0];
}

// A néző látótávolsága: nappal 150 m; éjszaka (a néző helyén) működő fényforrás nélkül 30 m
function viewRadius(viewer) {
    if (viewer.lat === null) return 0;
    const night = SurvivalSun.isNight(viewer.lat, viewer.lng, new Date(Date.now()));
    return night && !viewer.hasLight ? config.PLAYER_VIEW_NIGHT_METERS : config.PLAYER_VIEW_METERS;
}

// A néző közelében lévő többi játékos (név, avatar, szint, hely) – a pontos helyet csak a közelieknek adjuk ki
function nearbyPlayers(viewerName) {
    const viewer = activePlayers[viewerName];
    const result = {};
    if (!viewer || viewer.lat === null) return result;
    const radius = viewRadius(viewer);
    for (const name in activePlayers) {
        if (name === viewerName) continue;
        const p = activePlayers[name];
        if (p.lat === null) continue;
        if (SurvivalBuildings.haversine(viewer.lat, viewer.lng, p.lat, p.lng) > radius) continue;
        result[name] = { username: p.username, avatar: p.avatar, level: p.level || 1, early: !!p.earlySurvivor, lat: p.lat, lng: p.lng };
    }
    return result;
}

function sendNearby(name) {
    const entry = activePlayers[name];
    if (entry) io.to(entry.socketId).emit('players_update', nearbyPlayers(name));
}

// Akiket érint egy mozgás / kilépés: mindenki, aki a régi vagy az új hely közelében van
function notifyAround(points, exceptName) {
    const maxRadius = config.PLAYER_VIEW_METERS;
    for (const name in activePlayers) {
        if (name === exceptName) continue;
        const p = activePlayers[name];
        if (p.lat === null) continue;
        if (points.some(pt => pt && SurvivalBuildings.haversine(pt.lat, pt.lng, p.lat, p.lng) <= maxRadius)) sendNearby(name);
    }
}

// ===================== JÁTÉKOS-ÁLLAPOT (A SZERVER AZ EGYETLEN IGAZSÁGFORRÁS) =====================
const { num } = SurvivalStats;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const REST_PER_MS = 100 / (config.FATIGUE_FULL_REST_MINUTES * 60 * 1000); // fáradtság-csökkenés ezredmásodpercenként

// A mentett adatok egységes formára hozása (hiányzó vagy régi mezők kitöltése)
function normalizePlayer(raw) {
    const p = raw || {};
    const eq = p.equipment || {};
    const equipment = {};
    SurvivalStats.EQUIPMENT_SLOTS.forEach(slot => {
        equipment[slot] = typeof eq[slot] === 'string' && eq[slot] ? eq[slot] : null;
    });
    const inventory = [];
    (Array.isArray(p.inventory) ? p.inventory : [])
        .filter(s => s && typeof s.key === 'string' && Math.floor(num(s.count, 0)) > 0)
        .forEach(s => {
            const count = Math.floor(num(s.count, 0));
            const item = itemDatabase[s.key];
            if (item && !item.stackable) {
                // nem stackelhető: darabonként; a kopó tárgyak (szerszámok) megtartják a tartósságukat
                for (let i = 0; i < count; i++) inventory.push(newSlot(s.key, s.dur));
            } else {
                const existing = inventory.find(x => x.key === s.key);
                if (existing) existing.count += count;
                else inventory.push({ key: s.key, count });
            }
        });
    return {
        hp: num(p.hp, 100),
        maxHp: num(p.maxHp, 100),
        money: num(p.money, 100),
        level: Math.max(1, Math.floor(num(p.level, 1))),
        xp: num(p.xp, 0),
        fatigue: clamp(num(p.fatigue, 0), 0, 100),
        hunger: clamp(num(p.hunger, 100), 0, 100),
        thirst: clamp(num(p.thirst, 100), 0, 100),
        inventory,
        equipment,
        lastSeen: (p.lastSeen === null || p.lastSeen === undefined) ? null : num(p.lastSeen, null),
        dead: !!p.dead,
        combat: p.combat && typeof p.combat === 'object' && p.combat.enemy ? p.combat : null,
        dangerUntil: activeDangerLocks(p.dangerUntil)
    };
}

// A még érvényes személyes zárak (a lejártak kimaradnak)
function activeDangerLocks(raw) {
    const now = Date.now();
    const result = {};
    if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(id => { if (num(raw[id], 0) > now) result[id] = num(raw[id], 0); });
    }
    return result;
}

// Halott karakter semmilyen akciót nem végezhet (csak újrakezdhet)
const DEAD_MESSAGE = 'Meghaltál. Indíts új túlélőt!';
function aliveOnly(fn) {
    return (p) => (p.dead ? { save: false, error: DEAD_MESSAGE } : fn(p));
}

// Harc közben a tárgyakkal, a felszereléssel és a lootolással nem lehet mást csinálni (csak a harcablakból)
function freeOnly(fn) {
    return aliveOnly((p) => (p.combat ? { save: false, error: 'Harc közben ezt nem teheted!' } : fn(p)));
}

function playerStats(p) {
    return SurvivalStats.computeStats(p, itemDatabase);
}

// Mentés előtt: a max HP mindig a szintből és a felszerelésből jön, a HP nem lépheti túl.
// (Felszereléskor a HP NEM nő automatikusan, különben fel-le vevéssel lehetne gyógyulni.)
function finalizePlayer(p) {
    const stats = playerStats(p);
    p.maxHp = stats.maxHp;
    p.hp = clamp(p.hp, 0, p.maxHp);
    p.fatigue = clamp(p.fatigue, 0, 100);
    p.hunger = clamp(p.hunger, 0, 100);
    p.thirst = clamp(p.thirst, 0, 100);
    if (p.hp <= 0) { p.dead = true; p.combat = null; } // bármi viszi 0-ra a HP-t (éhezés, harc), a karakter meghal
    return stats;
}

// A kliensnek küldött állapot (a belső mezők nélkül)
function publicPlayerData(p) {
    const { lastSeen, ...rest } = p;
    return rest;
}

// --- JÁTÉKOSONKÉNTI SOR ---
// Egy játékos összes művelete (tick, tárgyhasználat, loot, mozgás...) szigorúan egymás után fut,
// így nem írhatják felül egymás eredményét, és a gyors dupla kattintás sem duplikál tárgyat.
// fn(p) a friss adatokon dolgozik; ha { save: false }-t ad vissza, semmi nem mentődik.
// Visszatérés: { p, result } (vagy null, ha nincs ilyen játékos).
const playerQueues = new Map();
function withPlayer(username, fn) {
    const prev = playerQueues.get(username) || Promise.resolve();
    const run = prev.then(async () => {
        const user = await PlayerModel.findOne({ username });
        if (!user) return null;
        const raw = user.playerData && typeof user.playerData.toObject === 'function'
            ? user.playerData.toObject()
            : user.playerData;
        const p = normalizePlayer(raw);
        const result = (await fn(p)) || {};
        if (result.save !== false) {
            finalizePlayer(p);
            const update = { playerData: p };
            if (result.extraUpdate) Object.assign(update, result.extraUpdate);
            await PlayerModel.findOneAndUpdate({ username }, update);
        }
        return { p, result };
    });
    const tail = run.catch(() => {});
    playerQueues.set(username, tail);
    tail.then(() => { if (playerQueues.get(username) === tail) playerQueues.delete(username); });
    return run;
}

// A teljes, friss állapot elküldése a játékos aktív kapcsolatára
function sendPlayerState(username, p, extra) {
    const entry = activePlayers[username];
    if (!entry) return;
    entry.level = p.level;                                                  // a többiek ezt látják
    entry.hasLight = !!SurvivalStats.findUsableLight(p.inventory, itemDatabase); // éjszakai látótávolsághoz
    io.to(entry.socketId).emit('player_state', {
        player: publicPlayerData(p),
        stats: playerStats(p),
        ...(extra || {})
    });
}

// --- LELTÁR SEGÉDFÜGGVÉNYEK (slot = kemény határ, súly = 150%-os plafon) ---
// Stackelhető tárgyból egy slotban bármennyi lehet; a nem stackelhető minden darabja külön slot.
function isStackable(key) {
    const item = itemDatabase[key];
    return !!(item && item.stackable);
}

function findSlot(p, key) {
    return p.inventory.find(s => s.key === key);
}

// Az adott tárgy összes darabja (a nem stackelhetők több slotban is lehetnek)
function countItem(p, key) {
    return p.inventory.reduce((sum, s) => sum + (s.key === key ? s.count : 0), 0);
}

function removeItem(p, key, count) {
    if (countItem(p, key) < count) return false;
    let left = count;
    for (let i = p.inventory.length - 1; i >= 0 && left > 0; i--) {
        const slot = p.inventory[i];
        if (slot.key !== key) continue;
        const take = Math.min(slot.count, left);
        slot.count -= take;
        left -= take;
    }
    p.inventory = p.inventory.filter(s => s.count > 0);
    return true;
}

// Behelyezés kapacitás-ellenőrzés nélkül (csak a stackelhetőség szerint)
// Egy nem stackelhető tárgy új slotja; a kopó tárgyaknál (durability) a tartósság is (alapból teljes)
function newSlot(key, dur) {
    const item = itemDatabase[key];
    const max = item && Number(item.durability);
    if (!max) return { key, count: 1 };
    if (dur === undefined || dur === null) return { key, count: 1, dur: max }; // új tárgy: teljes
    const d = Number(dur);
    // a lemerült lámpa 0-n marad (a fény percben, törtszámmal fogy)
    return { key, count: 1, dur: Number.isFinite(d) ? Math.min(Math.max(d, 0), max) : max };
}

function pushItem(p, key, count) {
    if (isStackable(key)) {
        const slot = findSlot(p, key);
        if (slot) slot.count += count;
        else p.inventory.push({ key, count });
        return;
    }
    for (let i = 0; i < count; i++) p.inventory.push(newSlot(key));
}

function slotsNeeded(p, key, count) {
    return isStackable(key) ? (findSlot(p, key) ? 0 : 1) : count;
}

// Felvehető-e a tárgy? { ok: true } vagy { ok: false, reason: 'unknown' | 'slots' | 'weight' }
function canAddItem(p, key, count) {
    const item = itemDatabase[key];
    if (!item) return { ok: false, reason: 'unknown' };
    const stats = playerStats(p);
    if (p.inventory.length + slotsNeeded(p, key, count) > stats.slots) return { ok: false, reason: 'slots' };
    if (stats.weight + num(item.weight, 0) * count > stats.weightHardCap + 1e-9) return { ok: false, reason: 'weight' };
    return { ok: true };
}

function addItem(p, key, count) {
    const check = canAddItem(p, key, count);
    if (!check.ok) return check;
    pushItem(p, key, count);
    return check;
}

// Belefér-e a jelenlegi leltár (csere vagy levétel után)? null, 'slots' vagy 'weight'
function capacityProblem(p) {
    const stats = playerStats(p);
    if (p.inventory.length > stats.slots) return 'slots';
    if (stats.weight > stats.weightHardCap + 1e-9) return 'weight';
    return null;
}

const EFFECT_LABELS = { hunger: 'Éhség', thirst: 'Szomjúság', hp: 'Élet', fatigue: 'Fáradtság' };
function describeChanges(changes) {
    return Object.entries(changes)
        .map(([key, value]) => `${value > 0 ? '+' : ''}${Math.round(value)} ${EFFECT_LABELS[key]}`)
        .join(', ');
}

const CAPACITY_MESSAGES = {
    slots: 'A hátizsákod tele van!',
    weight: 'Túl nehéz! Ennyit már nem bírsz el.',
    unknown: 'Ismeretlen tárgy!'
};

// XP jóváírása (több szintlépés is lehet egyszerre). Szintlépéskor teljes gyógyulás.
function grantXp(p, amount) {
    p.xp += amount;
    let levels = 0;
    while (p.xp >= p.level * 100) {
        p.xp -= p.level * 100;
        p.level += 1;
        levels += 1;
    }
    if (levels > 0) p.hp = playerStats(p).maxHp;
    return levels;
}

// Fáradtság növelése: a felszerelés (pl. harci bakancs) és a túlsúly szorzójával
function addFatigue(p, amount) {
    const stats = playerStats(p);
    p.fatigue = clamp(p.fatigue + amount * stats.fatigueRate * stats.overweightMultiplier, 0, 100);
}

// Pihenés: 100%-ról 0-ra FATIGUE_FULL_REST_MINUTES alatt
function restFatigue(p, ms) {
    if (ms > 0) p.fatigue = clamp(p.fatigue - ms * REST_PER_MS, 0, 100);
}

// Két GPS pont távolsága méterben (haversine)
function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// --- TÚLÉLÉS: ms ezredmásodpercnyi online idő hatása ---
// Az éhség és a szomjúság időarányosan fogy. Ha valamelyik 0, a karakter a max HP-ja ARÁNYÁBAN sebződik
// (így a ~40 / ~20 perc mindenkire igaz, páncéltól függetlenül). Ha mindkettő 80% fölött van, lassan gyógyul.
function applySurvival(p, ms) {
    const minutes = Math.max(0, ms) / 60000;
    const maxHp = playerStats(p).maxHp;
    p.hunger = clamp(p.hunger - minutes * 100 / config.HUNGER_FULL_MINUTES, 0, 100);
    p.thirst = clamp(p.thirst - minutes * 100 / config.THIRST_FULL_MINUTES, 0, 100);

    const emptyBars = (p.hunger <= 0 ? 1 : 0) + (p.thirst <= 0 ? 1 : 0);
    if (emptyBars > 0) {
        const starveMinutes = emptyBars === 2 ? config.STARVE_BOTH_MINUTES : config.STARVE_ONE_MINUTES;
        p.hp = clamp(p.hp - minutes * maxHp / starveMinutes, 0, maxHp);
    } else if (p.hunger > config.REGEN_ABOVE_PERCENT && p.thirst > config.REGEN_ABOVE_PERCENT) {
        p.hp = clamp(p.hp + minutes * maxHp / config.REGEN_FULL_MINUTES, 0, maxHp);
    }
    return { critical: emptyBars > 0 };
}

// Egyszeri figyelmeztetés, amikor az éhség / szomjúság a küszöb alá esik (újra, ha előtte fölé ment)
function collectWarnings(entry, p) {
    const warnings = [];
    entry.warned = entry.warned || {};
    ['hunger', 'thirst'].forEach(key => {
        if (p[key] < config.WARN_BELOW_PERCENT) {
            if (!entry.warned[key]) warnings.push(key);
            entry.warned[key] = true;
        } else {
            entry.warned[key] = false;
        }
    });
    return warnings;
}

// --- FÉNYFORRÁSOK FOGYÁSA (éjszaka, online) ---
// A fény percben fogy. Lemerült lámpába automatikusan új elem / lámpaolaj kerül, ha van; a fáklya elég.
// Visszaadja az üzeneteket (pl. "Elégett a fáklyád").
function burnLight(p, minutes) {
    const notices = [];
    let remaining = minutes;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 20) {
        const light = SurvivalStats.findUsableLight(p.inventory, itemDatabase);
        if (!light) {
            notices.push('Nincs működő fényforrásod, sötétben vagy.');
            break;
        }
        const { slot, item } = light;
        if (light.needsRefill) {
            removeItem(p, item.light.fuel, 1);
            slot.dur = item.durability;
            notices.push(`${itemDatabase[item.light.fuel].name} került ebbe: ${item.name}.`);
        }
        const use = Math.min(remaining, slot.dur);
        slot.dur = Math.round((slot.dur - use) * 1000) / 1000;
        remaining -= use;
        if (slot.dur <= 0) {
            if (!item.light.fuel) {
                p.inventory = p.inventory.filter(s => s !== slot);
                notices.push(`Elégett: ${item.name}.`);
            } else {
                slot.dur = 0;
                notices.push(`Lemerült: ${item.name}.`);
            }
        }
    }
    // A "sötétben vagy" üzenet csak akkor kell, ha közben fogyott el az utolsó fény
    return notices.length === 1 && notices[0].startsWith('Nincs') && minutes === remaining ? [] : notices;
}

// --- SZERVER OLDALI TÚLÉLÉSI CIKLUS ---
// A tényleg eltelt időt számoljuk (nem fix lépést), így a tick késése nem torzítja az ütemet.
const TICK_MS = 40000;
setInterval(() => {
    const now = Date.now();
    for (const username in activePlayers) {
        const entry = activePlayers[username];
        const dt = now - (entry.lastTickAt || now);
        entry.lastTickAt = now;

        withPlayer(username, (p) => {
            if (p.dead) return { save: false, skip: true }; // halott karakterrel már nem történik semmi

            const { critical } = applySurvival(p, dt);

            // Online pihenés: ha a játékos legalább REST_IDLE_MINUTES óta egy helyben van
            if (now - entry.lastMovedAt >= config.REST_IDLE_MINUTES * 60 * 1000) restFatigue(p, dt);

            // Éjszaka (a játékos helyén) ég a fényforrás
            let notices = [];
            if (entry.lat !== null && SurvivalSun.isNight(entry.lat, entry.lng, new Date(now))) notices = burnLight(p, dt / 60000);

            p.lastSeen = now;
            return { critical, warnings: collectWarnings(entry, p), notices };
        }).then(r => {
            if (!r || r.result.skip) return;
            sendPlayerState(username, r.p, { critical: r.result.critical, warnings: r.result.warnings, notices: r.result.notices });
            sendNearby(username); // időnként frissül a közeli játékosok listája (pl. ha leszáll az éj)
        }).catch(err => console.error("Hiba a szerver oldali túlélési tick során:", err));
    }
}, TICK_MS);

// ===================== ÉPÜLETEK: KÖZÖS (GLOBÁLIS) ÁLLAPOT =====================
// Minden épület egy dokumentum: a típusát és helyét a SZERVER kérdezi le az OSM-ből (a kliensnek nem hiszünk),
// a zár (lockedUntil) pedig mindenkire érvényes.
const buildingSchema = new mongoose.Schema({
    _id: { type: String },                 // pl. 'osm_n123456' vagy 'osm_w98765'
    type: { type: String },                // épülettípus (buildings.js)
    name: { type: String },
    lat: { type: Number },
    bounds: { type: mongoose.Schema.Types.Mixed, default: null }, // befoglaló téglalap (nagy létesítményeknél a széltől mérünk)
    lng: { type: Number },
    lockedUntil: { type: Number, default: 0 },
    lastLootedBy: { type: String, default: null },
    fetchedAt: { type: Number }
});
const BuildingModel = mongoose.model('SurvivalBuilding', buildingSchema);

const buildingCache = new Map();    // memória-gyorsítótár: id -> { id, type, name, lat, lng, bounds }
const missingBuildings = new Map(); // nem létező OSM azonosítók -> lejárat (ne kérdezzük le újra és újra)
const buildingFetches = new Map();  // folyamatban lévő lekérdezések (két játékos ne kérdezze le kétszer)
const BUILDING_CACHE_LIMIT = 30000;

function osmError(code) {
    const err = new Error(code);
    err.code = code;
    return err;
}

function rememberBuilding(building) {
    if (buildingCache.size >= BUILDING_CACHE_LIMIT) buildingCache.delete(buildingCache.keys().next().value);
    buildingCache.set(building.id, building);
}

// Egy Overpass lekérdezés a tartalék szerverekkel. Ha egy szerver nem válaszol OVERPASS_TIMEOUT_MS alatt,
// hibát ad, vagy félbeszakadt választ küld ("remark": időtúllépés, memória), a következőt kérdezzük.
async function overpassQuery(query, timeoutMs) {
    for (const url of config.OVERPASS_URLS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || config.OVERPASS_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SurvivalGO/1.0 (survivalgo.hu)' },
                body: 'data=' + encodeURIComponent(query),
                signal: controller.signal
            });
            if (!res.ok) continue;
            const json = await res.json();
            if (!json || !Array.isArray(json.elements)) continue;
            if (typeof json.remark === 'string' && /error|timed out|out of memory/i.test(json.remark)) continue;
            return json;
        } catch (err) {
            // hálózati hiba / időtúllépés / hibás válasz: jöhet a következő szerver
        } finally {
            clearTimeout(timer);
        }
    }
    throw osmError('OSM_UNAVAILABLE');
}

// Egy OSM elemből a játék épülete (vagy null, ha nincs helye)
function buildingFromElement(el) {
    if (!el || (el.type !== 'node' && el.type !== 'way') || typeof el.id !== 'number') return null;
    const pos = SurvivalBuildings.elementPosition(el); // pont: saját koordináta, épület: a téglalap közepe
    if (!pos) return null;
    const type = SurvivalBuildings.classifyBuilding(el.tags);
    return {
        id: SurvivalBuildings.buildingId(el), type, name: SurvivalBuildings.displayName(type, el.tags),
        lat: pos.lat, lng: pos.lng, bounds: SurvivalBuildings.cleanBounds(el.bounds)
    };
}

// Egy épület lekérdezése az OSM-ből (csak ha a környék még nem töltődött be a térképrácsból).
// A pontoknak (node) a "body" kimenet adja a koordinátát, az épületeknek (way) a "bb" a befoglaló téglalapot.
async function fetchBuildingFromOsm(id) {
    const parsed = SurvivalBuildings.parseBuildingId(id);
    if (!parsed) throw osmError('NOT_FOUND');
    const out = parsed.osmType === 'node' ? 'out body;' : 'out tags bb;';
    const json = await overpassQuery(`[out:json][timeout:10];${parsed.osmType}(${parsed.osmId});${out}`);
    const building = buildingFromElement(json.elements[0]);
    if (!building || building.id !== id) throw osmError('NOT_FOUND');
    return building;
}

// ===================== TÉRKÉPRÁCS: ÉPÜLETEK CELLÁNKÉNT =====================
// A kliens a körülötte lévő cellákat kéri (area_request). A szerver cellánként tárolja az épületeket
// (memóriában és az adatbázisban), így egy környéket csak egyszer kell az OSM-től lekérdezni,
// utána mindenki azonnal megkapja. AREA_CELL_TTL_DAYS után újra lekérdezzük (változhat a térkép).
const cellSchema = new mongoose.Schema({
    _id: { type: String },     // cellaazonosító, pl. '26166_7333'
    ids: { type: [String], default: [] },
    fetchedAt: { type: Number }
});
const CellModel = mongoose.model('SurvivalCell', cellSchema);

const cellCache = new Map();   // cellaazonosító -> { buildings: [...], fetchedAt }
const cellFetches = new Map(); // folyamatban lévő OSM-lekérdezések cellánként
const CELL_CACHE_LIMIT = 3000;
const CELL_FETCH_CHUNK = 9;    // egy Overpass lekérdezésben legfeljebb ennyi cella (kb. 600 x 600 m)

function cellIsFresh(fetchedAt, now) {
    return typeof fetchedAt === 'number' && now - fetchedAt < config.AREA_CELL_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function rememberCell(cellId, buildings, fetchedAt) {
    if (cellCache.size >= CELL_CACHE_LIMIT) cellCache.delete(cellCache.keys().next().value);
    cellCache.set(cellId, { buildings, fetchedAt });
    buildings.forEach(rememberBuilding);
}

// Néhány (szomszédos) cella lekérdezése egyetlen Overpass hívással, a cellák közös befoglaló téglalapjában.
// Minden épület abba a cellába kerül, amelyikbe a középpontja esik.
async function fetchCellsFromOsm(cellIds) {
    const parsed = cellIds.map(id => SurvivalBuildings.parseCellId(id));
    const s = Math.min(...parsed.map(c => c.south)), w = Math.min(...parsed.map(c => c.west));
    const n = Math.max(...parsed.map(c => c.north)), e = Math.max(...parsed.map(c => c.east));
    const bbox = [s, w, n, e].map(v => v.toFixed(6)).join(',');
    const query = `[out:json][timeout:25][bbox:${bbox}];` +
        '(node[shop];node[amenity];node[tourism];node[leisure];node[building];)->.n;' +
        '(way[building];way[shop];way[amenity];)->.w;' +
        '.n out body;.w out tags bb;';
    const json = await overpassQuery(query, config.AREA_OVERPASS_TIMEOUT_MS);

    const result = new Map(cellIds.map(id => [id, []]));
    const seen = new Set();
    json.elements.forEach(el => {
        const b = buildingFromElement(el);
        if (!b || seen.has(b.id)) return;
        const list = result.get(SurvivalBuildings.cellOf(b.lat, b.lng));
        if (!list) return; // a közös téglalap szélén, de nem a kért cellákban
        seen.add(b.id);
        list.push(b);
    });

    // Mentés: az épületek (a záruk megmarad) és a cellák épületlistája
    const now = Date.now();
    const all = [].concat(...result.values());
    if (all.length > 0) {
        await BuildingModel.bulkWrite(all.map(b => ({
            updateOne: {
                filter: { _id: b.id },
                update: { $set: { type: b.type, name: b.name, lat: b.lat, lng: b.lng, bounds: b.bounds, fetchedAt: now },
                          $setOnInsert: { lockedUntil: 0 } },
                upsert: true
            }
        })), { ordered: false });
    }
    await CellModel.bulkWrite([...result.entries()].map(([id, list]) => ({
        updateOne: { filter: { _id: id }, update: { $set: { ids: list.map(b => b.id), fetchedAt: now } }, upsert: true }
    })), { ordered: false });
    result.forEach((list, id) => rememberCell(id, list, now));
    return result;
}

// A kért cellák épületei: memóriából, adatbázisból, vagy (ha nincs, vagy elavult) az OSM-ből.
// Visszaad: { cells: Map(cellId -> épületek), failed: [cellId] }. Ha az OSM nem elérhető, de van
// régebbi tárolt változat, azt adjuk vissza (jobb, mint a semmi).
async function getCells(cellIds) {
    const now = Date.now();
    const cells = new Map();
    const stale = new Map();
    let missing = [];

    cellIds.forEach(id => {
        const c = cellCache.get(id);
        if (c && cellIsFresh(c.fetchedAt, now)) cells.set(id, c.buildings);
        else { if (c) stale.set(id, c.buildings); missing.push(id); }
    });

    if (missing.length > 0) {
        const docs = await CellModel.find({ _id: { $in: missing } });
        if (docs.length > 0) {
            const ids = [].concat(...docs.map(d => d.ids || []));
            const stored = ids.length > 0 ? await BuildingModel.find({ _id: { $in: ids } }, '_id type name lat lng bounds') : [];
            const byId = new Map(stored.map(d => [d._id, {
                id: d._id, type: d.type, name: d.name, lat: d.lat, lng: d.lng, bounds: SurvivalBuildings.cleanBounds(d.bounds)
            }]));
            docs.forEach(d => {
                const list = (d.ids || []).map(id => byId.get(id)).filter(b => b && typeof b.lat === 'number' && typeof b.name === 'string');
                if (cellIsFresh(d.fetchedAt, now)) {
                    rememberCell(d._id, list, d.fetchedAt);
                    cells.set(d._id, list);
                } else {
                    stale.set(d._id, list);
                }
            });
            missing = missing.filter(id => !cells.has(id));
        }
    }

    // Ami még hiányzik: OSM. A más kérés által már lekérdezés alatt álló cellákat megvárjuk.
    const waits = [];
    const toFetch = [];
    missing.forEach(id => (cellFetches.has(id) ? waits.push(id) : toFetch.push(id)));
    toFetch.sort();
    for (let i = 0; i < toFetch.length; i += CELL_FETCH_CHUNK) {
        const chunk = toFetch.slice(i, i + CELL_FETCH_CHUNK);
        const job = fetchCellsFromOsm(chunk);
        chunk.forEach(id => cellFetches.set(id, job));
        job.catch(() => {}).finally(() => chunk.forEach(id => { if (cellFetches.get(id) === job) cellFetches.delete(id); }));
        waits.push(...chunk);
    }

    const failed = [];
    await Promise.all(waits.map(async id => {
        try {
            const res = await cellFetches.get(id);
            if (res && res.has(id)) { cells.set(id, res.get(id)); return; }
        } catch (err) { /* OSM nem elérhető */ }
        const c = cellCache.get(id);
        if (c && cellIsFresh(c.fetchedAt, Date.now())) cells.set(id, c.buildings);
        else if (stale.has(id)) cells.set(id, stale.get(id));
        else failed.push(id);
    }));
    return { cells, failed };
}

// Az épületek közül az éppen zárva lévők (épület-azonosító -> lejárat)
async function activeLocks(ids, now) {
    const locks = {};
    for (let i = 0; i < ids.length; i += 1000) {
        const docs = await BuildingModel.find({ _id: { $in: ids.slice(i, i + 1000) }, lockedUntil: { $gt: now } }, '_id lockedUntil');
        docs.forEach(d => { locks[d._id] = d.lockedUntil; });
    }
    return locks;
}

// Az épület adatai: memóriából, adatbázisból, vagy (első alkalommal) az OSM-ből
async function getBuilding(id) {
    if (buildingCache.has(id)) return buildingCache.get(id);
    if ((missingBuildings.get(id) || 0) > Date.now()) throw osmError('NOT_FOUND');
    if (buildingFetches.has(id)) return buildingFetches.get(id);

    const job = (async () => {
        const stored = await BuildingModel.findOne({ _id: id });
        let building;
        if (stored && stored.type && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
            building = { id, type: stored.type, name: stored.name, lat: stored.lat, lng: stored.lng, bounds: SurvivalBuildings.cleanBounds(stored.bounds) };
        } else {
            try {
                building = await fetchBuildingFromOsm(id);
            } catch (err) {
                if (err.code === 'NOT_FOUND') {
                    if (missingBuildings.size >= BUILDING_CACHE_LIMIT) missingBuildings.clear();
                    missingBuildings.set(id, Date.now() + 60 * 60 * 1000);
                }
                throw err;
            }
            await BuildingModel.updateOne(
                { _id: id },
                { $set: { type: building.type, name: building.name, lat: building.lat, lng: building.lng, bounds: building.bounds, fetchedAt: Date.now() },
                  $setOnInsert: { lockedUntil: 0 } },
                { upsert: true }
            );
        }
        rememberBuilding(building);
        return building;
    })();

    buildingFetches.set(id, job);
    try {
        return await job;
    } finally {
        buildingFetches.delete(id);
    }
}

// ATOMI zárolás: csak akkor sikerül, ha az épület épp nincs zárva. Ha ketten egyszerre próbálják,
// az adatbázis csak az egyiküknek engedi (a másik null-t kap).
async function lockBuilding(id, username, now, until) {
    const doc = await BuildingModel.findOneAndUpdate(
        { _id: id, $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: null }] },
        { $set: { lockedUntil: until, lastLootedBy: username } },
        { new: true }
    );
    return !!doc;
}

async function currentLock(id) {
    const doc = await BuildingModel.findOne({ _id: id });
    return doc && typeof doc.lockedUntil === 'number' ? doc.lockedUntil : 0;
}

// ===================== HARC: SEGÉDFÜGGVÉNYEK =====================
// Menekülés után a globális zárat feloldjuk (csak ha még a mi zárunk), hogy mások lootolhassák az épületet.
async function releaseBuildingLock(id, username, lockedUntil) {
    const doc = await BuildingModel.findOneAndUpdate(
        { _id: id, lastLootedBy: username, lockedUntil },
        { $set: { lockedUntil: 0 } },
        { new: true }
    );
    return !!doc;
}

// Egy épület átkutatása (loot-sorsolás és jóváírás). emptyFactor < 1: kisebb eséllyel üres (pl. győzelem után)
function lootBuilding(p, building, emptyFactor) {
    const found = SurvivalBuildings.rollLoot(building.type, itemDatabase, Math.random, { emptyFactor });
    const added = [];
    const skipped = [];
    found.forEach(({ key, count }) => {
        if (addItem(p, key, count).ok) added.push({ key, count });
        else skipped.push({ key, count });
    });
    return { found, added, skipped };
}

// --- SOCKET HITELESÍTÉS ---
// Csak érvényes tokennel lehet csatlakozni. A játékos kilétét ezután mindig a token adja
// (socket.data.username), a kliens által küldött felhasználónevet a szerver nem veszi figyelembe.
io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));

    let payload;
    try {
        payload = authToken.verify(token, config.JWT_SECRET);
    } catch (e) {
        return next(new Error(e.code === 'TOKEN_EXPIRED' ? 'AUTH_EXPIRED' : 'AUTH_INVALID'));
    }
    if (typeof payload.username !== 'string') return next(new Error('AUTH_INVALID'));

    try {
        const user = await PlayerModel.findOne({ username: payload.username }, 'username avatar earlySurvivor');
        if (!user) return next(new Error('AUTH_INVALID'));
        socket.data.username = user.username;
        socket.data.avatar = safeAvatar(user.avatar);
        socket.data.earlySurvivor = !!user.earlySurvivor;
        next();
    } catch (err) {
        console.error("Hiba a socket hitelesítés közben:", err);
        next(new Error('SERVER_ERROR'));
    }
});

io.on('connection', (socket) => {
    const username = socket.data.username;
    console.log(`🔌 Új kliens csatlakozott: ${socket.id} (${username})`);

    // Egy fiókhoz egyszerre egy munkamenet tartozhat: az újabb kapcsolat kidobja a régit.
    // A játékos a csatlakozás pillanatától online, így minden válasz és státuszfrissítés eljut hozzá;
    // a pozíció (lat/lng) az első update_position után töltődik ki.
    const now = Date.now();
    const previous = activePlayers[username];
    activePlayers[username] = {
        socketId: socket.id,
        username,
        avatar: socket.data.avatar,
        earlySurvivor: !!socket.data.earlySurvivor,
        lat: null,
        lng: null,
        anchor: null,          // az utolsó "valódi" mozgás helye (GPS-szórás szűréséhez)
        lastMovedAt: now,      // pihenéshez: mikor mozdult utoljára
        lastTickAt: now,
        xpMeters: 0            // a még XP-re nem váltott megtett méterek
    };
    if (previous && previous.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(previous.socketId);
        if (oldSocket) {
            oldSocket.emit('session_replaced');
            oldSocket.disconnect(true);
        }
    }

    // Offline pihenés jóváírása, majd a friss állapot elküldése
    withPlayer(username, (p) => {
        if (p.lastSeen !== null) restFatigue(p, now - p.lastSeen);
        p.lastSeen = now;
    }).then(r => { if (r) sendPlayerState(username, r.p); })
      .catch(err => console.error("Hiba a játékos betöltésekor:", err));

    // Egységes válasz: hiba esetén csak üzenet, siker esetén előbb a teljes állapot, aztán az üzenet
    const reply = (evt) => (r) => {
        if (!r) return;
        const { p, result } = r;
        if (result.error) {
            io.to(socket.id).emit(evt, { success: false, message: result.error });
            return;
        }
        sendPlayerState(username, p, { leveledUp: !!result.leveledUp });
        io.to(socket.id).emit(evt, { success: true, message: result.message, ...(result.payload || {}) });
    };
    const logError = (label) => (err) => console.error(label, err);

    // --- BIZTONSÁGOS TÁRGY HASZNÁLAT ---
    // (A tárgyak hatásait a 4. csoportban kötjük az items.js adataihoz.)
    socket.on('use_item', (data) => {
        if (!data || typeof data.itemKey !== 'string') return;

        withPlayer(username, freeOnly((p) => {
            const itemConfig = itemDatabase[data.itemKey];
            if (!itemConfig) return { save: false, error: 'Ismeretlen tárgy!' };
            if (countItem(p, data.itemKey) < 1) return { save: false, error: 'Nincs ilyen tárgy a leltáradban!' };
            if (!SurvivalStats.isConsumable(itemConfig)) return { save: false, error: 'Ezt a tárgyat nem lehet így használni!' };

            // A hatások az items.js "effects" mezőjéből jönnek (éhség, szomjúság, élet, fáradtság)
            const changes = SurvivalStats.applyEffects(p, itemConfig.effects, playerStats(p).maxHp);
            if (Object.keys(changes).length === 0) return { save: false, error: 'Most nincs rá szükséged.' };

            removeItem(p, data.itemKey, 1);
            const verb = itemConfig.type === 'food' ? 'Megetted' : itemConfig.type === 'drink' ? 'Megittad' : 'Használtad';
            return { message: `${verb}: ${itemConfig.name} (${describeChanges(changes)})` };
        })).then(reply('item_use_result')).catch(logError("Hiba tárgy használat során:"));
    });

    // --- BIZTONSÁGOS FELSZERELÉS (EQUIP) ---
    // A tárgy típusa adja a slotot (sisak csak a sisak helyére, fegyver csak a fegyver helyére).
    socket.on('equip_item', (data) => {
        if (!data || typeof data.itemKey !== 'string') return;
        if (data.slotType !== undefined && typeof data.slotType !== 'string') return;

        withPlayer(username, freeOnly((p) => {
            const item = itemDatabase[data.itemKey];
            if (!SurvivalStats.isEquippable(item)) return { save: false, error: 'Ezt a tárgyat nem lehet felvenni.' };
            const slot = SurvivalStats.equipSlot(item);
            if (data.slotType !== undefined && data.slotType !== slot) return { save: false, error: 'Ez a tárgy nem erre a helyre való.' };
            if (!removeItem(p, data.itemKey, 1)) return { save: false, error: 'A tárgy nincs a leltáradban!' };

            const currentEquipped = p.equipment[slot];
            if (currentEquipped) pushItem(p, currentEquipped, 1);
            p.equipment[slot] = data.itemKey;

            // Csere után is bele kell férnie (pl. kisebb hátizsákra cserélve)
            const problem = capacityProblem(p);
            if (problem === 'slots') return { save: false, error: 'A csere után nem férne el minden a hátizsákodban!' };
            if (problem === 'weight') return { save: false, error: 'A csere után túl nehéz lenne a csomagod!' };
            return { message: `Felszerelve: ${item.name}` };
        })).then(reply('equip_result')).catch(logError("Hiba felszerelés során:"));
    });

    // --- FELSZERELÉS LEVÉTELE ---
    socket.on('unequip_item', (data) => {
        if (!data || typeof data.slotType !== 'string') return;
        if (!SurvivalStats.EQUIPMENT_SLOTS.includes(data.slotType)) return;

        withPlayer(username, freeOnly((p) => {
            const key = p.equipment[data.slotType];
            if (!key) return { save: false, error: 'Ezen a helyen nincs semmi.' };

            p.equipment[data.slotType] = null;
            pushItem(p, key, 1);

            // A levétel után is bele kell férnie (pl. a hátizsák levétele csökkenti a helyet és a teherbírást)
            const stats = playerStats(p);
            if (p.inventory.length > stats.slots) {
                return { save: false, error: `Nem veheted le! Túl sok tárgy van nálad (${p.inventory.length}/${stats.slots}), pakolj ki előbb!` };
            }
            if (stats.weight > stats.weightHardCap + 1e-9) {
                return { save: false, error: 'Nem veheted le! Utána túl nehéz lenne a csomagod, pakolj ki előbb!' };
            }
            return { message: 'Tárgy levéve a slotról.' };
        })).then(reply('equip_result')).catch(logError("Hiba a levétel során:"));
    });

    // --- TÁRGY ELDOBÁSA (az eldobott tárgy eltűnik) ---
    socket.on('drop_item', (data) => {
        if (!data || typeof data.itemKey !== 'string') return;
        const count = data.count === undefined ? 1 : Math.floor(Number(data.count));
        if (!Number.isFinite(count) || count < 1) return;

        withPlayer(username, freeOnly((p) => {
            if (!removeItem(p, data.itemKey, count)) return { save: false, error: 'Nincs ennyi ebből a tárgyból!' };
            const item = itemDatabase[data.itemKey];
            return { message: `Eldobtál ${count} db-ot: ${item ? item.name : data.itemKey}` };
        })).then(reply('drop_result')).catch(logError("Hiba eldobás során:"));
    });

    // --- POZÍCIÓ SZINKRON + MOZGÁS (fáradtság, XP) ---
    socket.on('update_position', (data) => {
        if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
        if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return;
        if (Math.abs(data.lat) > 90 || Math.abs(data.lng) > 180) return;

        const entry = activePlayers[username];
        if (!entry || entry.socketId !== socket.id) return; // csak az aktív munkamenet mozgathatja a játékost

        const now = Date.now();
        const previousPosition = entry.lat === null ? null : { lat: entry.lat, lng: entry.lng };
        const previousAt = entry.positionAt;

        // GPS-ugrás (pl. hamisítás): pár száz méter szinte azonnal. Nem számít, és egy ideig nem lehet lootolni.
        let jumped = false;
        if (previousPosition && previousAt) {
            const jump = distanceMeters(previousPosition, data);
            const seconds = Math.max(1, (now - previousAt) / 1000);
            if (jump >= config.JUMP_MIN_METERS && (jump / seconds) * 3.6 >= config.JUMP_MIN_SPEED_KMH) {
                jumped = true;
                entry.lootBlockedUntil = now + config.JUMP_LOOT_BLOCK_SECONDS * 1000;
                entry.anchor = null; // a mozgás az új helytől számít tovább
                io.to(socket.id).emit('player_notice', {
                    message: `⚠️ A GPS-pozíciód hirtelen nagyot ugrott. ${Math.round(config.JUMP_LOOT_BLOCK_SECONDS / 60)} percig nem kutathatsz át épületet.`
                });
            }
        }

        entry.lat = data.lat;
        entry.lng = data.lng;
        entry.positionAt = now;
        // Csak a közelben lévők kapnak értesítést (a régi és az új hely körül), és a mozgó játékos is a saját listáját
        sendNearby(username);
        notifyAround([previousPosition, { lat: data.lat, lng: data.lng }], username);

        // Mozgásnak csak a pontos GPS jel számít
        const accuracy = typeof data.accuracy === 'number' && Number.isFinite(data.accuracy) ? data.accuracy : Infinity;
        if (accuracy > config.MOVE_MAX_ACCURACY_METERS) return;

        if (jumped) return;
        const here = { lat: data.lat, lng: data.lng };
        if (!entry.anchor) { entry.anchor = here; entry.anchorAt = now; return; }

        const moved = distanceMeters(entry.anchor, here);
        if (moved < config.MOVE_JITTER_METERS) return; // GPS-szórás, nem valódi mozgás

        const speedKmh = (moved / Math.max(1, (now - entry.anchorAt) / 1000)) * 3.6;
        entry.anchor = here;
        entry.anchorAt = now;
        entry.lastMovedAt = now;
        if (speedKmh > config.MOVE_MAX_SPEED_KMH) return; // járművel: nem jár érte XP és nem fáraszt

        entry.xpMeters += moved;
        const xp = Math.floor(entry.xpMeters / config.MOVE_XP_METERS);
        entry.xpMeters -= xp * config.MOVE_XP_METERS;

        withPlayer(username, aliveOnly((p) => {
            addFatigue(p, moved * config.FATIGUE_PER_METER);
            const levels = xp > 0 ? grantXp(p, xp) : 0;
            return { leveledUp: levels > 0 };
        })).then(r => {
            if (r) sendPlayerState(username, r.p, { leveledUp: !!r.result.leveledUp });
        }).catch(logError("Hiba a mozgás feldolgozásakor:"));
    });

    // --- CRAFTOLÁS ---
    socket.on('craft_item', (data) => {
        if (!data || typeof data.recipeKey !== 'string') return;

        withPlayer(username, freeOnly((p) => {
            const recipe = craftingRecipes.find(r => r.key === data.recipeKey);
            if (!recipe) return { save: false, error: 'Ismeretlen recept!' };
            if (recipe.station === 'workshop') return { save: false, error: 'Ezt csak műhelyben lehet elkészíteni (a műhelyek hamarosan jönnek).' };
            const itemName = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);

            for (const [matKey, reqQty] of Object.entries(recipe.req)) {
                if (countItem(p, matKey) < reqQty) {
                    return { save: false, error: `Nincs elég alapanyag: ${itemName(matKey)} (Kellene: ${reqQty})` };
                }
            }

            // Szerszámok: nem fogynak el, de kopnak. Több lehetőségnél a legkopottabbat használjuk el előbb.
            const usedTools = [];
            for (const entry of recipe.tools || []) {
                const options = Array.isArray(entry) ? entry : [entry];
                const candidates = p.inventory.filter(s => options.includes(s.key) && s.count > 0 && !usedTools.includes(s));
                if (candidates.length === 0) {
                    return { save: false, error: `Hiányzó szerszám: ${options.map(itemName).join(' vagy ')}` };
                }
                candidates.sort((a, b) => (a.dur ?? Infinity) - (b.dur ?? Infinity));
                usedTools.push(candidates[0]);
            }

            // Előbb elvesszük az alapanyagokat (ez helyet szabadíthat fel), aztán megnézzük, elfér-e a termék.
            // Ha nem fér el, semmi nem mentődik (save: false), így az alapanyagok sem vesznek el.
            for (const [matKey, reqQty] of Object.entries(recipe.req)) removeItem(p, matKey, reqQty);
            const result = recipe.result || recipe.key;
            const count = recipe.count || 1;
            const added = addItem(p, result, count);
            if (!added.ok) return { save: false, error: CAPACITY_MESSAGES[added.reason] };

            // Kopás: minden kopó szerszámból 1 tartósság; 0-nál eltörik
            const broken = [];
            usedTools.forEach(slot => {
                if (slot.dur === undefined) return;
                slot.dur -= 1;
                if (slot.dur <= 0) {
                    p.inventory = p.inventory.filter(s => s !== slot);
                    broken.push(itemName(slot.key));
                }
            });

            let message = `Sikeresen megbarkácsoltad: ${recipe.name}${count > 1 ? ` (${count} db)` : ''}!`;
            if (broken.length > 0) message += ` Eltört: ${broken.join(', ')}.`;
            return { message, payload: { broken } };
        })).then(reply('craft_result')).catch(logError("Hiba a szerver oldali craftolás során:"));
    });

    // --- LOOTOLÁS (csalásbiztos) ---
    // A kliens csak az épület azonosítóját küldi. A szerver:
    //  1. ellenőrzi a fáradtságot, a helyet és a friss GPS pozíciót,
    //  2. maga kérdezi le az épületet az OSM-ből (típus, hely), és megnézi a távolságot,
    //  3. atomi művelettel lezárja az épületet mindenki számára (ha már zárva van, elutasít),
    //  4. sorsol: találkozás (az épülettípus veszélyessége szerint), majd a loot-tábla alapján 1-3 tárgy.
    let lastLootRequestAt = 0;
    socket.on('loot_building', (data) => {
        if (!data || !SurvivalBuildings.parseBuildingId(data.buildingId)) return;
        const buildingId = data.buildingId;
        const requestedAt = Date.now();
        if (requestedAt - lastLootRequestAt < config.LOOT_COOLDOWN_MS) {
            io.to(socket.id).emit('loot_result', { success: false, message: 'Lassabban! Egyszerre csak egy épületet kutathatsz át.' });
            return;
        }
        lastLootRequestAt = requestedAt;

        withPlayer(username, freeOnly(async (p) => {
            if (p.fatigue >= 100) return { save: false, error: 'Teljesen kimerültél! Pihenned kell.' };
            if (p.inventory.length >= playerStats(p).slots) return { save: false, error: CAPACITY_MESSAGES.slots };

            const entry = activePlayers[username];
            const now = Date.now();
            if (entry && entry.lootBlockedUntil > now) {
                const seconds = Math.ceil((entry.lootBlockedUntil - now) / 1000);
                return { save: false, error: `A GPS-pozíciód nemrég hirtelen ugrott. Várj még ${seconds} másodpercet!` };
            }
            const dangerUntil = p.dangerUntil[buildingId];
            if (dangerUntil && dangerUntil > now) {
                const minutes = Math.max(1, Math.ceil((dangerUntil - now) / 60000));
                return { save: false, error: `Az ellenség még bent van, ahonnan elmenekültél. Gyere vissza később! (kb. ${minutes} perc)` };
            }

            if (!entry || entry.lat === null || !entry.positionAt || now - entry.positionAt > config.POSITION_MAX_AGE_SECONDS * 1000) {
                return { save: false, error: 'Várd meg a friss GPS pozíciót!' };
            }

            let building;
            try {
                building = await getBuilding(buildingId);
            } catch (err) {
                if (err.code === 'NOT_FOUND') return { save: false, error: 'Ez az épület nem található.' };
                return { save: false, error: 'Nem sikerült azonosítani az épületet. Próbáld újra egy kicsit később!' };
            }

            const distance = SurvivalBuildings.distanceToBuilding(entry, building); // nagy létesítménynél a szélétől
            if (distance > config.LOOT_RANGE_METERS + config.LOOT_RANGE_TOLERANCE_METERS) {
                return { save: false, error: `Túl messze vagy az épülettől! (${Math.round(distance)} m - menj ${config.LOOT_RANGE_METERS} méteren belülre)` };
            }

            const lockedUntil = now + config.LOOT_LOCK_HOURS * 60 * 60 * 1000;
            if (!(await lockBuilding(buildingId, username, now, lockedUntil))) {
                const until = await currentLock(buildingId);
                const minutes = Math.max(1, Math.ceil((until - now) / 60000));
                return { save: false, error: `Ezt az épületet nemrég kifosztották. Gyere vissza később! (kb. ${minutes} perc)`, lockInfo: { [buildingId]: until } };
            }

            const info = SurvivalBuildings.typeInfo(building.type);
            if (Math.random() < info.encounter) {
                // Körös harc indul: a lootot csak győzelem után kapja meg (menekülésnél semmit)
                p.combat = Combat.createCombat(p, { id: buildingId, name: building.name, type: building.type }, info);
                p.combat.lockedUntil = lockedUntil;
                return {
                    lockedUntil,
                    message: `Veszély! ${p.combat.enemy.avatar} ${p.combat.enemy.name} támadt rád az épületben!`,
                    payload: { items: [], skipped: [], buildingId, lockedUntil, buildingName: building.name, encounter: { started: true } }
                };
            }

            const { found, added, skipped } = lootBuilding(p, building, 1);
            addFatigue(p, config.FATIGUE_LOOT);

            const messages = [];
            if (found.length === 0) messages.push(`Ez a(z) ${building.name} üres volt.`);
            else if (skipped.length > 0) messages.push('Néhány talált tárgy már nem fért el.');

            return {
                lockedUntil,
                message: messages.join(' ') || undefined,
                payload: { items: added, skipped, buildingId, lockedUntil, buildingName: building.name, encounter: null }
            };
        })).then(r => {
            reply('loot_result')(r);
            if (!r) return;
            if (r.result.lockInfo) socket.emit('building_status', { locks: r.result.lockInfo });
            if (r.result.lockedUntil) {
                io.emit('building_looted_update', { id: buildingId, looted: true, lockedUntil: r.result.lockedUntil });
            }
        }).catch(logError("Hiba a szerver oldali lootolás során:"));
    });

    // --- ÉPÜLETEK ZÁRÁLLAPOTA ---
    // A kliens a betöltött épületek azonosítóit küldi, a szerver visszaadja, melyik van épp zárva.
    let statusWindowStart = 0;
    let statusCalls = 0;
    socket.on('building_status', async (data) => {
        if (!data || !Array.isArray(data.ids)) return;
        const now = Date.now();
        if (now - statusWindowStart > 10000) { statusWindowStart = now; statusCalls = 0; }
        if (++statusCalls > 10) return; // legfeljebb 10 kérés / 10 mp

        const ids = data.ids.filter(id => SurvivalBuildings.parseBuildingId(id)).slice(0, 500);
        if (ids.length === 0) return;
        try {
            const docs = await BuildingModel.find({ _id: { $in: ids }, lockedUntil: { $gt: now } }, '_id lockedUntil');
            const locks = {};
            docs.forEach(d => { locks[d._id] = d.lockedUntil; });
            socket.emit('building_status', { locks });
        } catch (err) {
            console.error("Hiba az épületek állapotának lekérdezésekor:", err);
        }
    });

    // --- ÉPÜLETEK BETÖLTÉSE (térképrács) ---
    // A kliens a körülötte lévő cellákat kéri; a szerver a tárolt (vagy most lekérdezett) épületeket
    // és azok zárállapotát küldi vissza. Csak a játékos közelében lévő cellákat adjuk ki.
    let areaWindowStart = 0;
    let areaCellsInWindow = 0;
    socket.on('area_request', async (data) => {
        if (!data || !Array.isArray(data.cells)) return;
        const requested = [...new Set(data.cells.filter(id => SurvivalBuildings.parseCellId(id)))]
            .slice(0, config.AREA_MAX_CELLS_PER_REQUEST);
        if (requested.length === 0) return;

        const entry = activePlayers[username];
        if (!entry || entry.socketId !== socket.id) return;
        // A pozíció nélküli kérést (pl. közvetlenül csatlakozás után) a kliens kicsit később megismétli
        if (entry.lat === null) { socket.emit('area_data', { cells: {}, locks: {}, failed: [], retry: requested }); return; }

        const here = { lat: entry.lat, lng: entry.lng };
        const near = requested.filter(id => distanceMeters(here, SurvivalBuildings.cellCenter(id)) <= config.AREA_MAX_DISTANCE_METERS);
        const far = requested.filter(id => !near.includes(id));
        if (near.length === 0) { socket.emit('area_data', { cells: {}, locks: {}, failed: far }); return; }

        const now = Date.now();
        if (now - areaWindowStart > 10000) { areaWindowStart = now; areaCellsInWindow = 0; }
        if (areaCellsInWindow + near.length > config.AREA_MAX_CELLS_PER_10S) {
            socket.emit('area_data', { cells: {}, locks: {}, failed: [], retry: near });
            return;
        }
        areaCellsInWindow += near.length;

        try {
            const { cells, failed } = await getCells(near);
            const out = {};
            const ids = [];
            cells.forEach((list, id) => {
                out[id] = list.map(b => ({ id: b.id, type: b.type, name: b.name, lat: b.lat, lng: b.lng, bounds: b.bounds }));
                list.forEach(b => ids.push(b.id));
            });
            const locks = await activeLocks(ids, Date.now());
            socket.emit('area_data', { cells: out, locks, failed: failed.concat(far) });
        } catch (err) {
            console.error("Hiba a környék épületeinek betöltésekor:", err);
            socket.emit('area_data', { cells: {}, locks: {}, failed: near.concat(far) });
        }
    });

    // --- KÖRÖS HARC ---
    // A kliens csak a választott lépést küldi (támadás / gyógyítás / menekülés), mindent a szerver számol.
    // A válasz eseménylistája (events) a harcnapló és később az animációk alapja.
    socket.on('combat_action', (data) => {
        if (!data || !['attack', 'heal', 'flee'].includes(data.action)) return;
        if (data.action === 'heal' && typeof data.itemKey !== 'string') return;
        if (data.action === 'attack' && data.slot !== undefined && !Combat.WEAPON_SLOTS.includes(data.slot)) return;
        let release = null;

        withPlayer(username, aliveOnly((p) => {
            const combat = p.combat;
            if (!combat) return { save: false, error: 'Nem harcolsz.' };

            let step;
            if (data.action === 'attack') step = Combat.attack(p, combat, itemDatabase, Math.random, data.slot || 'weapon');
            else if (data.action === 'heal') step = Combat.heal(p, combat, itemDatabase, data.itemKey);
            else step = Combat.flee(p, combat, itemDatabase);
            if (step.error) return { save: false, error: step.error };

            // Üres hüvely a lövés után (ha elfér)
            if (step.casing && addItem(p, 'empty_casing', 1).ok) step.events[0].casing = true;

            const payload = { events: step.events, outcome: step.outcome || null, enemy: combat.enemy };
            const building = { id: combat.buildingId, name: combat.buildingName, type: combat.buildingType };

            if (step.outcome === 'won') {
                p.combat = null;
                addFatigue(p, config.FATIGUE_COMBAT + config.FATIGUE_LOOT);
                const reward = Combat.rewards(combat);
                p.money += reward.money;
                const levels = grantXp(p, reward.xp);
                const messages = [`Legyőzted: ${combat.enemy.name}! +${reward.xp} XP, +${reward.money} pénz.`];
                if (reward.drop) {
                    messages.push(addItem(p, reward.drop, 1).ok
                        ? `Nála volt: ${itemDatabase[reward.drop].name}.`
                        : 'A nála lévő tárgy már nem fért el.');
                }
                // Győzelem után átkutatod az épületet (kisebb eséllyel üres)
                const loot = lootBuilding(p, building, config.COMBAT_WIN_EMPTY_FACTOR);
                if (loot.found.length === 0) messages.push('Az épületben nem találtál semmit.');
                else if (loot.skipped.length > 0) messages.push('Néhány talált tárgy már nem fért el.');
                Object.assign(payload, { items: loot.added, skipped: loot.skipped, xp: reward.xp, money: reward.money });
                return { leveledUp: levels > 0, message: messages.join(' '), payload };
            }

            if (step.outcome === 'fled') {
                // Nincs loot; az épület csak NEKED zárul FLEE_LOCK_MINUTES percre, másoknak feloldjuk
                p.combat = null;
                addFatigue(p, config.FATIGUE_COMBAT);
                p.dangerUntil[combat.buildingId] = Date.now() + config.FLEE_LOCK_MINUTES * 60000;
                release = { id: combat.buildingId, lockedUntil: combat.lockedUntil };
                return { message: `Sikerült elmenekülnöd! Ide ${config.FLEE_LOCK_MINUTES} percig nem érdemes visszamenni.`, payload };
            }

            if (step.outcome === 'lost') {
                // A finalizePlayer halottnak jelöli a karaktert és lezárja a harcot
                return { message: `${combat.enemy.name} legyőzött. Meghaltál a Zónában.`, payload };
            }
            return { payload };
        })).then(async (r) => {
            reply('combat_result')(r);
            if (release && await releaseBuildingLock(release.id, username, release.lockedUntil)) {
                io.emit('building_looted_update', { id: release.id, looted: false, lockedUntil: 0 });
            }
        }).catch(logError("Hiba a harc során:"));
    });

    // --- ÚJ TÚLÉLŐ INDÍTÁSA (csak halott karakterrel) ---
    // Minden elvész: szint, XP, pénz, leltár, felszerelés. A fiók (név, jelszó, avatar) megmarad.
    socket.on('respawn', () => {
        withPlayer(username, (p) => {
            if (!p.dead) return { save: false, error: 'A karaktered még él.' };
            Object.assign(p, newPlayerData(), { lastSeen: Date.now() });
            const entry = activePlayers[username];
            if (entry) { entry.warned = {}; entry.xpMeters = 0; entry.lastMovedAt = Date.now(); }
            return { message: 'Új túlélő indult a Zónában. Sok szerencsét!' };
        }).then(reply('respawn_result')).catch(logError("Hiba az újrakezdés során:"));
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Kliens levált: ${socket.id}`);
        // Csak akkor töröljük, ha a bejegyzés még ehhez a kapcsolathoz tartozik
        // (a kidobott régi munkamenet ne törölje az újat).
        const leaving = activePlayers[username];
        if (leaving && leaving.socketId === socket.id) {
            delete activePlayers[username];
            // a közelben lévőknél eltűnik a jelölője
            if (leaving.lat !== null) notifyAround([{ lat: leaving.lat, lng: leaving.lng }], username);
            // az offline pihenés ettől az időponttól számít
            withPlayer(username, (p) => { p.lastSeen = Date.now(); })
                .catch(logError("Hiba a kilépés mentésekor:"));
        }
    });
});

server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO fut.`);
});
