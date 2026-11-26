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
const { RecipeTools } = craftingRecipes;
const itemDatabase = require('./public/js/items');
const SurvivalStats = require('./public/js/stats'); // közös számítások (a kliens is ezt használja)
const SurvivalBuildings = require('./public/js/buildings'); // közös épülettípusok és loot-sorsolás
const Combat = require('./combat-engine'); // körös harc szabályai
const SurvivalSun = require('./public/js/sun'); // napkelte / napnyugta (éjszaka)
const SurvivalTutorial = require('./public/js/tutorial'); // Első lépések (v0.1.11)
const SurvivalDaily = require('./public/js/daily'); // napi bónusz (v0.1.11)
const SurvivalQuests = require('./public/js/quests'); // napi és heti küldetések (v0.1.20)
const SurvivalSkills = require('./public/js/skills'); // képességfa (v0.1.20)
const SurvivalSeason = require('./public/js/season'); // ranglista, havi szezon (v0.1.20)
const SurvivalAdvent = require('./public/js/advent'); // adventi naptár – Fagyos Csend (v0.1.18)
const SurvivalShop = require('./public/js/shop'); // a kinézetek nevei az adventi üzenethez
const SurvivalWinter = require('./public/js/winter'); // karácsonyfák, díszek (v0.1.19)
const SurvivalWheel = require('./public/js/wheel');   // szerencsekerék (v0.1.19)
const SurvivalGifts = require('./public/js/gifts');   // hétvégi ajándékvadászat (v0.1.19)
const Admin = require('./admin'); // admin oldal, eseménynapló, bejelentések, eventek, tiltás (v0.1.13)
const Premium = require('./premium'); // prémium credit, bolt, ládák (v0.1.16)
let adminHooks = null;           // a fájl végén áll össze (Admin.setup)
let pushHooks = null;            // telefonos értesítések (push.js, v0.1.19)
let premiumHooks = null;         // a fájl végén áll össze (Premium.setup)
const SurvivalShelter = require('./public/js/shelter'); // menedék: építmények, raktár (v0.1.12)

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
    privacyAcceptedAt: { type: Number, default: null }, // mikor fogadta el az adatkezelési tájékoztatót (v0.1.12)
    seenNotices: { type: [String], default: [] },      // az elolvasott bejelentések azonosítói (v0.1.13)
    bannedUntil: { type: Number, default: null },      // felfüggesztés vége (v0.1.13)
    banReason: { type: String, default: '' },
    role: { type: String, default: '' },
    premium: { type: mongoose.Schema.Types.Mixed, default: null }, // credit, megvett kinézetek, ládák (v0.1.16, premium.js)               // stáb rang (public/js/roles.js); a tulajdonos az ADMIN_USERS-ből jön (v0.1.14)
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
        equipmentDur: { type: mongoose.Schema.Types.Mixed, default: {} }, // a felvett tárgyak tartóssága: { slot: érték }
        walkMeters: { type: Number, default: 0 },  // gyaloglás a cipő legutóbbi kopása óta (méter)
        wearVersion: { type: Number, default: 0 }, // a kopási táblázat verziója (régi mentések arányos átszámításához)
        combat: { type: mongoose.Schema.Types.Mixed, default: null },     // folyamatban lévő harc (újracsatlakozás után is folytatódik)
        dangerUntil: { type: mongoose.Schema.Types.Mixed, default: {} },  // személyes zárak menekülés után: { épület-azonosító: lejárat }
        stats: { type: mongoose.Schema.Types.Mixed, default: {} },        // életre szóló statisztika (a halál után is megmarad; v0.1.10)
        lifeStartedAt: { type: Number, default: null },                   // a mostani túlélő mikor indult (a leghosszabb élethez)
        quickbar: { type: Array, default: [] },                           // gyorssáv: 3 kitűzött fogyasztható tárgy kulcsa (vagy null)
        tutorial: { type: mongoose.Schema.Types.Mixed, default: null },   // Első lépések: { introSeen, done: { lépés: időpont }, finalClaimed }
        quests: { type: mongoose.Schema.Types.Mixed, default: null },
        skills: { type: mongoose.Schema.Types.Mixed, default: null },
        season: { type: mongoose.Schema.Types.Mixed, default: null },     // havi szezon számlálói: { month, xp, meters, cells, quests } (v0.1.20; halálkor megmarad)     // képességfa: { ranks, freeUsed, respecs } (v0.1.20; halálkor elveszik)     // napi és heti küldetések, bejárt területek (v0.1.20)
        daily: { type: mongoose.Schema.Types.Mixed, default: null },      // napi bónusz: { lastDay: 'ÉÉÉÉ-HH-NN', streak }
        shelter: { type: mongoose.Schema.Types.Mixed, default: null }     // menedék: hely, építmények, raktár (a halál után is megmarad; v0.1.12)
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
        equipmentDur: {},   // a felvett tárgyak teljes tartóssággal indulnak (normalizePlayer tölti ki)
        walkMeters: 0,
        lifeStartedAt: Date.now(),
        wearVersion: WEAR_VERSION,
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

// --- ZÁRT TESZT: MEGHÍVÓKÓD ---
// A kód összevetése állandó idő alatt (ne lehessen az időzítésből kitalálni), kis- és nagybetűtől függetlenül
function registrationCodeOk(given) {
    const expected = config.REGISTRATION_CODE;
    if (!expected) return true;
    if (typeof given !== 'string') return false;
    const a = Buffer.from(given.trim().toLocaleLowerCase('hu'));
    const b = Buffer.from(expected.toLocaleLowerCase('hu'));
    return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}
// --- WIKI (v0.1.15): a játék szabályai és az ellenfelek a wiki oldalnak (a vörös zóna titkos marad) ---
app.get('/api/wiki', (req, res) => {
    const C = config;
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
        enemies: Object.entries(Combat.ENEMIES).filter(([, e]) => !e.redZoneOnly).map(([key, e]) => ({
            key, name: e.name, avatar: e.avatar, lvl: e.lvl, hp: e.hp, dmg: e.dmg, drops: e.drops, habitat: e.habitat || [],
            night: !!e.night, nightWeight: e.nightWeight || 1,
            xp: 15 + 10 * e.lvl, money: [5 * e.lvl, 5 * e.lvl + 10]
        })),
        combat: { ...Combat.RULES },
        rules: {
            hungerFullMinutes: C.HUNGER_FULL_MINUTES, thirstFullMinutes: C.THIRST_FULL_MINUTES, starveOneMinutes: C.STARVE_ONE_MINUTES, starveBothMinutes: C.STARVE_BOTH_MINUTES,
            regenAbovePercent: C.REGEN_ABOVE_PERCENT, regenFullMinutes: C.REGEN_FULL_MINUTES, warnBelowPercent: C.WARN_BELOW_PERCENT,
            fatiguePerKm: Math.round(C.FATIGUE_PER_METER * 1000 * 10) / 10, fatigueLoot: C.FATIGUE_LOOT, fatigueCombat: C.FATIGUE_COMBAT,
            fatigueFullRestMinutes: C.FATIGUE_FULL_REST_MINUTES, restIdleMinutes: C.REST_IDLE_MINUTES,
            lootLockHours: C.LOOT_LOCK_HOURS, lootCacheMinutes: C.LOOT_CACHE_MINUTES, lootRangeMeters: C.LOOT_RANGE_METERS, fleeLockMinutes: C.FLEE_LOCK_MINUTES,
            combatWinEmptyFactor: C.COMBAT_WIN_EMPTY_FACTOR, lockpickEmptyFactor: C.LOCKPICK_EMPTY_FACTOR,
            viewMeters: C.PLAYER_VIEW_METERS, viewNightMeters: C.PLAYER_VIEW_NIGHT_METERS, viewBinocularsMeters: C.PLAYER_VIEW_BINOCULARS_METERS,
            moveXpMeters: C.MOVE_XP_METERS, moveMaxSpeedKmh: C.MOVE_MAX_SPEED_KMH, walkXpBonusPerItem: C.WALK_XP_BONUS_PER_ITEM,
            shoeWearMeters: C.SHOE_WEAR_METERS, repairGear: C.REPAIR_GEAR_FRACTION, repairFirearm: C.REPAIR_FIREARM_FRACTION, repairOther: C.REPAIR_OTHER_FRACTION,
            thermosBonus: C.THERMOS_DRINK_BONUS, repairMachineOil: C.MACHINE_OIL_REPAIR_FRACTION, jumpLootBlockSeconds: C.JUMP_LOOT_BLOCK_SECONDS,
            starterKit: C.STARTER_KIT, earlyKit: C.EARLY_SURVIVOR_KIT, earlyBackpack: C.EARLY_SURVIVOR_BACKPACK, earlyLimit: C.EARLY_SURVIVOR_LIMIT,
            base: SurvivalStats.BASE, hpPerLevel: SurvivalStats.HP_PER_LEVEL, overweightHardCap: SurvivalStats.OVERWEIGHT_HARD_CAP, overweightFactor: SurvivalStats.OVERWEIGHT_FACTOR,
            usernameMin: C.USERNAME_MIN, usernameMax: C.USERNAME_MAX
        },
        event: Admin.publicEvent(),
        premiumMode: Premium.mode()
    });
});
app.get('/wiki', (req, res) => res.sendFile(path.join(__dirname, 'public', 'wiki.html')));
app.get('/aszf', (req, res) => res.sendFile(path.join(__dirname, 'public', 'aszf.html')));

// A kliens ebből tudja, kell-e mutatni a meghívókód mezőt (magát a kódot soha nem küldjük ki)
// earlyLeft: hány "Korai túlélő" hely maradt (null, ha a korai túlélő időszak nincs bekapcsolva). 30 mp-ig gyorsítótárazva.
let earlyLeftCache = { at: 0, value: null };
async function earlyLeft() {
    if (!config.EARLY_SURVIVOR_OPEN) return null;
    if (Date.now() - earlyLeftCache.at < 30000) return earlyLeftCache.value;
    const taken = await PlayerModel.countDocuments({ earlySurvivor: true });
    earlyLeftCache = { at: Date.now(), value: Math.max(0, config.EARLY_SURVIVOR_LIMIT - taken) };
    return earlyLeftCache.value;
}
app.get('/api/registration', async (req, res) => {
    let left = null;
    try { left = await earlyLeft(); } catch (e) { /* nem baj, akkor nem mutatjuk */ }
    res.json({ codeRequired: !!config.REGISTRATION_CODE, earlyLeft: left, earlyLimit: config.EARLY_SURVIVOR_LIMIT });
});

// --- REGISZTRÁCIÓS VÉGPONT ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, avatar, inviteCode, ageConfirmed, privacyAccepted } = req.body || {};
        // Zárt teszt: meghívókód nélkül nem lehet regisztrálni (a találgatást a belépési korlát fogja meg)
        if (config.REGISTRATION_CODE) {
            const ip = req.ip || 'unknown';
            if (loginBlocked(ip)) {
                return res.status(429).json({ success: false, message: 'Túl sok sikertelen próbálkozás. Próbáld újra később!' });
            }
            if (!registrationCodeOk(inviteCode)) {
                recordLoginFail(ip);
                return res.status(403).json({ success: false, message: 'A Survival GO jelenleg zárt tesztben van, regisztrálni csak érvényes meghívókóddal lehet. Kövesd a Discordot, hamarosan mindenki előtt megnyílunk!' });
            }
        }
        if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Minden mezőt ki kell tölteni!' });
        }
        // A játék 16 éven felülieknek szól (v0.1.11)
        if (ageConfirmed !== true) return res.status(400).json({ success: false, message: 'A regisztrációhoz igazolnod kell, hogy elmúltál 16 éves.' });
        if (privacyAccepted !== true) return res.status(400).json({ success: false, message: 'A regisztrációhoz el kell fogadnod az adatkezelési tájékoztatót.' });
        const invalid = validateRegistration(username, email, password);
        if (invalid) return res.status(400).json({ success: false, message: invalid });

        // "Peti" és "peti" ne lehessen két külön játékos (megszemélyesítés ellen)
        const usernameLower = username.toLocaleLowerCase('hu');
        const existingUser = await PlayerModel.findOne({ username }) || await PlayerModel.findOne({ usernameLower });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Ez a felhasználónév már foglalt!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Korai túlélő: amíg be van kapcsolva, az első EARLY_SURVIVOR_LIMIT regisztráló kapja meg
        const early = config.EARLY_SURVIVOR_OPEN && (await PlayerModel.countDocuments({ earlySurvivor: true })) < config.EARLY_SURVIVOR_LIMIT;
        earlyLeftCache.at = 0; // a számláló frissüljön
        const newUser = new PlayerModel({
            username,
            usernameLower,
            email,
            password: hashedPassword,
            avatar: safeAvatar(avatar),
            earlySurvivor: early,
            privacyAcceptedAt: Date.now(),
            playerData: newPlayerData(early)
        });

        await newUser.save();
        Admin.logEvent('register', username, { early });
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
        staffRole: Admin.roleOf(user),
        isAdmin: !!Admin.roleOf(user),
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
        const ban = Admin.banInfo(user);
        if (ban) return res.status(403).json({ success: false, banned: true, message: ban.message });

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
        const ban = Admin.banInfo(user);
        if (ban) return res.status(401).json({ success: false, code: 'BANNED', banned: true, message: ban.message });

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
    if (night && !viewer.hasLight) return config.PLAYER_VIEW_NIGHT_METERS;
    return viewer.hasBinoculars ? config.PLAYER_VIEW_BINOCULARS_METERS : config.PLAYER_VIEW_METERS;
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
        result[name] = { username: p.username, avatar: p.avatar, level: p.level || 1, early: !!p.earlySurvivor, role: p.role || '', cosmetic: p.cosmetic || null, lat: p.lat, lng: p.lng };
    }
    return result;
}

function sendNearby(name) {
    const entry = activePlayers[name];
    if (entry) io.to(entry.socketId).emit('players_update', nearbyPlayers(name));
}

// Akiket érint egy mozgás / kilépés: mindenki, aki a régi vagy az új hely közelében van
function notifyAround(points, exceptName) {
    const maxRadius = Math.max(config.PLAYER_VIEW_METERS, config.PLAYER_VIEW_BINOCULARS_METERS);
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
    migrateWear(p); // régi (gyorsabb) kopási táblázat szerinti tartósságok arányos átszámítása
    const eq = p.equipment || {};
    const equipment = {};
    SurvivalStats.EQUIPMENT_SLOTS.forEach(slot => {
        equipment[slot] = typeof eq[slot] === 'string' && eq[slot] ? eq[slot] : null;
    });
    const inventory = normalizeItemList(p.inventory);
    return normalizePlayerFields(p, equipment, inventory);
}

// Egy tárgylista (leltár vagy menedék-raktár) egységes formára hozása
function normalizeItemList(list) {
    const inventory = [];
    (Array.isArray(list) ? list : [])
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
                // stackelhető, de fogyó fény (gyertya, jelzőfény): a legfelső darab égési ideje megmarad
                const max = item && Number(item.durability);
                const d = Number(s.dur);
                if (max && s.dur !== undefined && s.dur !== null && Number.isFinite(d)) {
                    const slot = existing || inventory[inventory.length - 1];
                    slot.dur = Math.min(slot.dur === undefined ? max : slot.dur, Math.min(Math.max(d, 0), max));
                }
            }
        });
    return inventory;
}

function normalizePlayerFields(p, equipment, inventory) {
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
        equipmentDur: normalizeEquipmentDur(equipment, p.equipmentDur),
        walkMeters: Math.max(0, num(p.walkMeters, 0)),
        wearVersion: WEAR_VERSION,
        lastSeen: (p.lastSeen === null || p.lastSeen === undefined) ? null : num(p.lastSeen, null),
        dead: !!p.dead,
        combat: p.combat && typeof p.combat === 'object' && p.combat.enemy ? p.combat : null,
        dangerUntil: activeDangerLocks(p.dangerUntil),
        stats: normalizeStats(p.stats),
        quickbar: normalizeQuickbar(p.quickbar),
        tutorial: normalizeTutorial(p.tutorial),
        daily: normalizeDaily(p.daily),
        quests: normalizeQuests(p.quests),
        season: normalizeSeason(p.season),
        skills: SurvivalSkills.fit(SurvivalSkills.normalize(p.skills), Math.max(1, Math.floor(num(p.level, 1)))),
        advent: normalizeAdvent(p.advent),
        winter: normalizeWinter(p.winter),
        gifts: (p.gifts && typeof p.gifts === 'object' && typeof p.gifts.day === 'string') ? { day: p.gifts.day, opened: clamp(Math.floor(num(p.gifts.opened, 0)), 0, 1000) } : { day: null, opened: 0 },
        premiumSlots: Math.max(0, Math.min(6, Math.floor(num(p.premiumSlots, 0)))), // prémium: végleges +hely (v0.1.16)
        shelter: normalizeShelter(p.shelter),
        lifeStartedAt: (p.lifeStartedAt === null || p.lifeStartedAt === undefined) ? null : num(p.lifeStartedAt, null)
    };
}

// --- KOPÁSI TÁBLÁZAT VERZIÓJA ---
// A v0.1.8 első kiadása gyorsabb kopással ment ki; a v0.1.8.1 lassabb táblázata után a már megkopott tárgyak
// tartósságát arányosan átszámoljuk (pl. 9/18 -> 13/25), így senki nem jár rosszul.
const WEAR_VERSION = 2;
const WEAR_TABLE_V1 = { melee: [30, 45, 65, 85, 100], ranged: [60, 90, 120, 150, 180], gear: [18, 28, 42, 60, 80] };
function oldWearMax(item) {
    const kind = item.type === 'weapon' ? (item.slot === 'melee' ? 'melee' : 'ranged') : 'gear';
    const tier = Math.min(5, Math.max(1, Math.round(Number(item.tier) || 2)));
    return WEAR_TABLE_V1[kind][tier - 1];
}
function migrateWear(raw) {
    if (!raw || num(raw.wearVersion, 0) >= WEAR_VERSION) return;
    const scale = (key, d) => {
        const item = itemDatabase[key];
        if (!item || !item.wear || d === undefined || d === null || !Number.isFinite(Number(d))) return d;
        const oldMax = oldWearMax(item);
        return Math.min(item.durability, Math.round(Number(d) / oldMax * item.durability));
    };
    if (Array.isArray(raw.inventory)) raw.inventory.forEach(s => { if (s && s.dur !== undefined) s.dur = scale(s.key, s.dur); });
    if (raw.equipmentDur && raw.equipment) {
        Object.keys(raw.equipmentDur).forEach(slot => { raw.equipmentDur[slot] = scale(raw.equipment[slot], raw.equipmentDur[slot]); });
    }
}

// A felvett kopó tárgyak tartóssága: hiányzó érték (régi mentés, új tárgy) = teljes; csak a felvett helyek maradnak
function normalizeEquipmentDur(equipment, raw) {
    const result = {};
    SurvivalStats.EQUIPMENT_SLOTS.forEach(slot => {
        const item = equipment[slot] && itemDatabase[equipment[slot]];
        if (!item || !item.durability) return;
        const d = raw && typeof raw === 'object' ? raw[slot] : undefined;
        result[slot] = (d === undefined || d === null || !Number.isFinite(Number(d)))
            ? item.durability
            : clamp(Number(d), 0, item.durability);
    });
    return result;
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
    // Gyorssáv: ami elfogyott, lekerül róla (v0.1.10.2)
    if (Array.isArray(p.quickbar)) p.quickbar = p.quickbar.map(k => (k && countItem(p, k) > 0 ? k : null));
    const stats = playerStats(p);
    p.maxHp = stats.maxHp;
    p.hp = clamp(p.hp, 0, p.maxHp);
    p.fatigue = clamp(p.fatigue, 0, 100);
    p.hunger = clamp(p.hunger, 0, 100);
    p.thirst = clamp(p.thirst, 0, 100);
    if (p.hp <= 0) { // bármi viszi 0-ra a HP-t (éhezés, harc), a karakter meghal
        if (!p.dead && p.stats) {
            p.stats.deaths += 1;
            if (p.lifeStartedAt) p.stats.longestLifeMs = Math.max(p.stats.longestLifeMs, Date.now() - p.lifeStartedAt);
        }
        p.dead = true; p.combat = null;
    }
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
        const before = Admin.snapshotBefore(p);
        const result = (await fn(p)) || {};
        if (result.save !== false) {
            finalizePlayer(p);
            const update = { playerData: p };
            if (result.extraUpdate) Object.assign(update, result.extraUpdate);
            await PlayerModel.findOneAndUpdate({ username }, update);
            Admin.onPlayerSaved(username, before, p);
            if (premiumHooks) premiumHooks.onPlayerSaved(username, before, p);
        }
        return { p, result };
    });
    const tail = run.catch(() => {});
    playerQueues.set(username, tail);
    tail.then(() => { if (playerQueues.get(username) === tail) playerQueues.delete(username); });
    return run;
}

// ===================== GYORSSÁV (v0.1.10) =====================
const QUICKBAR_SIZE = 3;
function normalizeQuickbar(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < QUICKBAR_SIZE; i++) {
        const k = list[i];
        out.push(typeof k === 'string' && itemDatabase[k] && SurvivalStats.isConsumable(itemDatabase[k]) && !out.includes(k) ? k : null);
    }
    return out;
}

// ===================== STATISZTIKA (v0.1.10) =====================
// Egyelőre csak gyűjtjük (nincs kijelezve): később ebből lesznek az eredmények és a profil statisztikája.
const STAT_NUMBERS = ['walkedMeters', 'buildingsLooted', 'itemsCrafted', 'combatsWon', 'killsTotal', 'deaths', 'longestLifeMs'];
function normalizeStats(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    STAT_NUMBERS.forEach(k => { out[k] = Math.max(0, Number(s[k]) || 0); });
    out.kills = {};
    if (s.kills && typeof s.kills === 'object') {
        Object.keys(s.kills).forEach(k => { const v = Number(s.kills[k]) || 0; if (v > 0) out.kills[k] = v; });
    }
    out.since = Number(s.since) || Date.now(); // mióta gyűjtjük
    return out;
}
// ===== ELSŐ LÉPÉSEK (v0.1.11) =====
function normalizeTutorial(raw) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const done = {};
    SurvivalTutorial.STEPS.forEach(s => { if (t.done && Number.isFinite(Number(t.done[s.key]))) done[s.key] = Number(t.done[s.key]); });
    return { introSeen: !!t.introSeen, done, finalClaimed: !!t.finalClaimed };
}
function normalizeWinter(raw) {
    const w = raw && typeof raw === 'object' ? raw : {};
    const dk = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return { bank: clamp(Math.floor(num(w.bank, 0)), 0, 100000), day: dk(w.day), used: clamp(Math.floor(num(w.used, 0)), 0, 1000), freeDay: dk(w.freeDay), hung: clamp(Math.floor(num(w.hung, 0)), 0, 1e7) };
}
function normalizeAdvent(raw) {
    const a = raw && typeof raw === 'object' ? raw : {};
    const opened = [...new Set((Array.isArray(a.opened) ? a.opened : []).map(d => Math.floor(num(d, 0))).filter(d => d >= 1 && d <= SurvivalAdvent.DAYS_TOTAL))].sort((x, y) => x - y);
    return {
        opened,
        catchupDay: typeof a.catchupDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.catchupDay) ? a.catchupDay : null,
        test: !!a.test // a stáb tesztnyitásai: az igazi kezdéskor törlődnek
    };
}
// ----- RANGLISTA (v0.1.20) -----
// Egy percig gyorsítótárazva; a stáb (Admin.isStaffName) nem kerül bele.
let boardCache = { t: 0, month: null, rows: null };
async function leaderboardRows(month) {
    const now = Date.now();
    if (boardCache.rows && boardCache.month === month && now - boardCache.t < 60000) return boardCache.rows;
    const users = await PlayerModel.find({}, { username: 1, premium: 1, earlySurvivor: 1, bannedUntil: 1, 'playerData.season': 1, 'playerData.level': 1, 'playerData.dead': 1 }).lean();
    const rows = users.filter(u => !Admin.isStaffName(u.username) && !(u.bannedUntil && u.bannedUntil > now)).map(u => {
        const pd = u.playerData || {};
        const se = pd.season && pd.season.month === month ? pd.season : {};
        const pr = u.premium || {};
        return { name: u.username, xp: se.xp || 0, meters: se.meters || 0, cells: se.cells || 0, quests: se.quests || 0, level: pd.level || 1,
            frame: pr.frame || '', title: pr.title || '', early: !!u.earlySurvivor };
    });
    boardCache = { t: now, month, rows };
    return rows;
}
function rankBoard(rows, key) {
    return rows.filter(r => (r[key] || 0) > 0).sort((a, b) => (b[key] - a[key]) || (b.xp - a.xp) || a.name.localeCompare(b.name));
}
// Hónapváltás után a lezárt szezon jutalmai (Rozsdás szett). Egyszer fut hónaponként (SettingModel-ben jelölve).
const SeasonDoneModel = mongoose.models.SurvivalSeasonDone || mongoose.model('SurvivalSeasonDone', new mongoose.Schema({ _id: String, at: Number, winners: mongoose.Schema.Types.Mixed }));
async function seasonCloseIfNeeded() {
    const month = SurvivalSeason.prevMonth(SurvivalSeason.monthKey(Date.now()));
    if (!SurvivalSeason.rewarded(month)) return null;
    const done = await SeasonDoneModel.findById(month).lean();
    if (done) return null;
    boardCache = { t: 0, month: null, rows: null };
    const ranked = rankBoard(await leaderboardRows(month), 'xp').filter(r => r.xp >= SurvivalSeason.MIN_XP_FOR_REWARD);
    const winners = [];
    ranked.forEach((r, i) => { const rw = SurvivalSeason.rewardFor(i + 1); if (rw) winners.push({ rank: i + 1, name: r.name, xp: r.xp, items: rw.items }); });
    // előbb jelöljük lezártnak (ha két szerverfolyamat futna, se adjunk kétszer)
    try { await SeasonDoneModel.create({ _id: month, at: Date.now(), winners }); } catch (e) { return null; }
    for (const w of winners) {
        for (const key of w.items) {
            try {
                const def = SurvivalShop.BY_KEY[key];
                if (def && def.kind) await premiumHooks.grantCosmetic(w.name, key);
                else await premiumHooks.grantKey(w.name, key, `Szezonjutalom (${SurvivalSeason.monthName(month)}, ${w.rank}. hely)`);
            } catch (e) { console.error('Szezonjutalom hiba:', w.name, key, e.message); }
        }
        Admin.logEvent('season_reward', w.name, { month, rank: w.rank, xp: w.xp, items: w.items });
    }
    console.log(`🏆 Szezon lezárva: ${month}, ${winners.length} jutalmazott`);
    return { month, winners };
}

function normalizeSeason(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.month !== 'string' || !/^\d{4}-\d{2}$/.test(raw.month)) return null;
    const n = (v) => Math.max(0, Math.floor(num(v, 0)));
    return { month: raw.month, xp: n(raw.xp), meters: n(raw.meters), cells: n(raw.cells), quests: n(raw.quests) };
}
// Szezon-számláló növelése (hónapváltáskor nulláz)
function seasonAdd(p, key, amount) {
    if (!(amount > 0)) return;
    p.season = { ...SurvivalSeason.fresh(p.season, Date.now()) };
    p.season[key] = (p.season[key] || 0) + amount;
}
function normalizeQuests(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const list = (a) => (Array.isArray(a) ? a : []).filter(x => x && SurvivalQuests.DEFS[x.kind]).slice(0, 6).map(x => ({
        kind: x.kind, target: Math.max(1, num(x.target, 1)), progress: Math.max(0, num(x.progress, 0)), done: !!x.done,
        ...(x.dist ? { dist: num(x.dist, 1000) } : {}), ...(x.group && SurvivalQuests.LANDMARKS[x.group] ? { group: x.group } : {}) }));
    const dk = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const lootCells = {};
    Object.entries(raw.lootCells && typeof raw.lootCells === 'object' ? raw.lootCells : {}).slice(0, 60).forEach(([k, v]) => { if (/^-?\d+:-?\d+$/.test(k)) lootCells[k] = Math.max(0, num(v, 0)); });
    return {
        day: dk(raw.day), daily: list(raw.daily), rerolled: !!raw.rerolled, dailyBonus: !!raw.dailyBonus,
        spread: (Array.isArray(raw.spread) ? raw.spread : []).filter(x => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite)).slice(-20),
        exploreXp: clamp(Math.floor(num(raw.exploreXp, 0)), 0, 1000),
        week: dk(raw.week), weekly: list(raw.weekly), weeklyBonus: !!raw.weeklyBonus,
        towns: (Array.isArray(raw.towns) ? raw.towns : []).filter(x => typeof x === 'string').slice(0, 30),
        cells: (Array.isArray(raw.cells) ? raw.cells : []).filter(x => typeof x === 'string' && /^-?\d+:-?\d+$/.test(x)).slice(-4000),
        lootCells
    };
}
// Küldetés-esemény: frissíti a napi/heti listát, jóváírja a jutalmat, és sorba teszi az üzeneteket (a sendPlayerState küldi ki)
const pendingNotices = new Map(); // username -> [szöveg]
function queueNotice(username, text) {
    if (!pendingNotices.has(username)) pendingNotices.set(username, []);
    pendingNotices.get(username).push(text);
}
const skillFx = (p) => SurvivalSkills.effects(p && p.skills);
const chance = (v) => v > 0 && Math.random() < v;
// Melyik decemberi esemény zajlik (a küldetések sorsolásához); test: a stáb bármikor kipróbálhatja
function questFlags(now, test) {
    const day = SurvivalAdvent.dayKey(now);
    const monday = Date.parse(SurvivalQuests.weekKey(now) + 'T12:00:00Z');
    const trees = SurvivalWinter.active(now, test);
    return {
        trees, winter: trees,
        advent: !!test || (day >= '2026-12-01' && day <= '2026-12-24'),
        gifts: SurvivalGifts.huntDay(now, test),
        giftWeek: !!test || SurvivalGifts.inSeason(monday + 5 * 86400000) || SurvivalGifts.inSeason(monday + 6 * 86400000)
    };
}
function questsFresh(p, username, flags) {
    p.quests = SurvivalQuests.refresh(p.quests, username, p.level, Date.now(), flags && typeof flags === 'object' ? flags : questFlags(Date.now(), false));
    return p.quests;
}
function questEvent(p, username, kind, data, winter) {
    const q = questsFresh(p, username, winter);
    const d = { ...(data || {}) };
    if (kind === 'loot' || kind === 'tree') d.home = SurvivalQuests.homeOf(q, p.shelter);
    const r = SurvivalQuests.event(q, kind, d, Date.now());
    let levels = 0;
    if (r.newCell) seasonAdd(p, 'cells', 1);
    if (r.completed.length) seasonAdd(p, 'quests', r.completed.length);
    const fx = skillFx(p);
    if (r.exploreXp) levels += grantXp(p, Math.round(r.exploreXp * (1 + (fx.exploreXp || 0))));
    const qb = 1 + (fx.questBonus || 0); // Megbízható (Felderítő)
    r.completed.forEach(quest => {
        const base = SurvivalQuests.describe(quest);
        const info = { ...base, xp: Math.round(base.xp * qb), money: Math.round(base.money * qb) };
        p.money += info.money;
        levels += grantXp(p, info.xp);
        const weekly = SurvivalQuests.DEFS[quest.kind].scope === 'weekly';
        queueNotice(username, `✅ ${weekly ? 'Heti' : 'Napi'} küldetés kész: ${info.title}! +${info.xp} XP, +${info.money} $`);
        Admin.logEvent('quest_done', username, { kind: quest.kind, scope: weekly ? 'weekly' : 'daily', target: quest.target, move: info.move });
    });
    r.bonus.forEach(b => {
        p.money += b.money;
        levels += grantXp(p, b.xp);
        const extra = '';
        queueNotice(username, b.scope === 'daily' ? `🏆 Mind a 3 napi küldetés kész! +${b.xp} XP, +${b.money} $${extra}` : `🏆 Mind a 4 heti küldetés kész! +${b.xp} XP, +${b.money} $`);
        Admin.logEvent('quest_bonus', username, { scope: b.scope });
    });
    return { levels, newCell: r.newCell };
}

function normalizeDaily(raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    return {
        lastDay: typeof d.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.lastDay) ? d.lastDay : null,
        streak: clamp(Math.floor(num(d.streak, 0)), 0, SurvivalDaily.REWARDS.length)
    };
}

// Egy lépés kipipálása (egyszer jár érte XP). A kliens a player_state-ből látja és jelzi.
function markTutorial(p, key) {
    if (!p.tutorial) p.tutorial = normalizeTutorial(null);
    if (p.tutorial.done[key]) return 0;
    const step = SurvivalTutorial.STEPS.find(s => s.key === key);
    if (!step) return 0;
    p.tutorial.done[key] = Date.now();
    return grantXp(p, step.xp);
}

function bumpStat(p, key, amount) {
    if (!p.stats) p.stats = normalizeStats(null);
    p.stats[key] = (p.stats[key] || 0) + (amount === undefined ? 1 : amount);
}

// ===================== MENEDÉK (v0.1.12) =====================
// A játékos adataiban él (playerData.shelter), így a raktár mozgatása a leltárral együtt, egy mentéssel történik.
// A térképes megjelenítéshez egy kis külön gyűjtemény (SurvivalShelterIndex) tartja a helyet és a szinteket.
function normalizeShelter(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') return null;
    const levels = {};
    SurvivalShelter.STRUCTURE_KEYS.forEach(k => {
        levels[k] = clamp(Math.floor(num(raw.levels && raw.levels[k], 0)), 0, SurvivalShelter.maxLevel(k));
    });
    let build = null;
    const b = raw.build;
    if (b && SurvivalShelter.STRUCTURES[b.key] && Number.isFinite(Number(b.until))) {
        const lvl = Math.floor(num(b.level, 0));
        if (lvl >= 1 && lvl <= SurvivalShelter.maxLevel(b.key)) build = { key: b.key, level: lvl, until: Number(b.until), startedAt: num(b.startedAt, 0) };
    }
    const shelter = {
        buildingId: typeof raw.buildingId === 'string' ? raw.buildingId : null,
        name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : 'Menedék',
        lat: raw.lat, lng: raw.lng,
        bounds: SurvivalBuildings.cleanBounds(raw.bounds),
        claimedAt: num(raw.claimedAt, Date.now()),
        levels, build,
        stash: normalizeItemList(raw.stash)
    };
    return SurvivalShelter.settle(shelter, Date.now());
}

const shelterIndexSchema = new mongoose.Schema({
    _id: { type: String },          // a tulajdonos felhasználóneve
    buildingId: String, name: String, lat: Number, lng: Number,
    levels: { type: mongoose.Schema.Types.Mixed, default: {} },
    build: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: Number
});
const ShelterIndexModel = mongoose.model('SurvivalShelterIndex', shelterIndexSchema);
const shelterIndex = new Map(); // tulajdonos -> { owner, buildingId, name, lat, lng, levels, build }
ShelterIndexModel.find({}).then(rows => {
    rows.forEach(r => shelterIndex.set(r._id, { owner: r._id, buildingId: r.buildingId, name: r.name, lat: r.lat, lng: r.lng, levels: r.levels || {}, build: r.build || null }));
    console.log(`🏚 Menedékek betöltve: ${rows.length}`);
}).catch(err => console.error('Hiba a menedékek betöltésekor:', err));

function updateShelterIndex(owner, shelter) {
    if (!shelter) {
        shelterIndex.delete(owner);
        return ShelterIndexModel.deleteOne({ _id: owner }).catch(err => console.error('Hiba a menedék törlésekor:', err));
    }
    const row = { owner, buildingId: shelter.buildingId, name: shelter.name, lat: shelter.lat, lng: shelter.lng, levels: shelter.levels, build: shelter.build };
    shelterIndex.set(owner, row);
    return ShelterIndexModel.updateOne({ _id: owner }, { $set: { buildingId: row.buildingId, name: row.name, lat: row.lat, lng: row.lng, levels: row.levels, build: row.build, updatedAt: Date.now() } }, { upsert: true })
        .catch(err => console.error('Hiba a menedék mentésekor:', err));
}

// A térképre: a környék menedékei (mindenki látja őket)
function sheltersAround(lat, lng, radius) {
    const now = Date.now();
    const out = [];
    shelterIndex.forEach(row => {
        if (SurvivalBuildings.haversine(lat, lng, row.lat, row.lng) > radius) return;
        const settled = SurvivalShelter.settle({ levels: row.levels, build: row.build }, now);
        out.push({ owner: row.owner, name: row.name, lat: row.lat, lng: row.lng, levels: settled.levels,
            hp: SurvivalShelter.structureHp(settled), building: !!settled.build });
    });
    return out;
}

// Milyen messze van a játékos (friss GPS-pozíció) a saját menedékétől? { distance } vagy { error }
function shelterDistance(entry, shelter) {
    if (!shelter) return { error: 'Még nincs menedéked.' };
    if (!entry || entry.lat === null || !entry.positionAt || Date.now() - entry.positionAt > config.POSITION_MAX_AGE_SECONDS * 1000) {
        return { error: 'Várd meg a friss GPS pozíciót!' };
    }
    return { distance: SurvivalBuildings.distanceToBuilding(entry, shelter) };
}
function atShelter(entry, shelter) {
    const d = shelterDistance(entry, shelter);
    if (d.error) return d;
    if (d.distance > SurvivalShelter.RANGE_METERS) return { error: `Ehhez a menedékednél kell lenned! (${Math.round(d.distance)} m)` };
    return { ok: true };
}

// A raktár darabszáma egy tárgyból, és az építéshez: leltár + raktár együtt
function stashCount(shelter, key) {
    return shelter ? shelter.stash.reduce((sum, s) => sum + (s.key === key ? s.count : 0), 0) : 0;
}
function takeFromStash(shelter, key, count) {
    let left = count;
    for (let i = shelter.stash.length - 1; i >= 0 && left > 0; i--) {
        const slot = shelter.stash[i];
        if (slot.key !== key) continue;
        const take = Math.min(slot.count, left);
        slot.count -= take;
        left -= take;
    }
    shelter.stash = shelter.stash.filter(s => s.count > 0);
}

// A teljes, friss állapot elküldése a játékos aktív kapcsolatára
function sendPlayerState(username, p, extra) {
    const entry = activePlayers[username];
    if (!entry) return;
    entry.level = p.level;                                                  // a többiek ezt látják
    entry.hasLight = !!SurvivalStats.findUsableLight(p.inventory, itemDatabase); // éjszakai látótávolsághoz
    entry.hasBinoculars = hasItem(p, 'binoculars');                          // messzebbre látsz
    entry.walkXpBonus = ['pocket_compass', 'topo_map'].filter(k => hasItem(p, k)).length * config.WALK_XP_BONUS_PER_ITEM + (skillFx(p).walkXp || 0);
    const pub = publicPlayerData(p);
    pub.quests = SurvivalQuests.publicView(SurvivalQuests.refresh(p.quests, username, p.level, Date.now(), questFlags(Date.now(), false)));
    io.to(entry.socketId).emit('player_state', {
        player: pub,
        stats: playerStats(p),
        ...(extra || {})
    });
    const notes = pendingNotices.get(username);
    if (notes) { pendingNotices.delete(username); notes.forEach(message => io.to(entry.socketId).emit('player_notice', { message })); }
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

// A kopó tárgyakból mindig a legjobban elhasznált darab megy előbb, bárhol van a hátizsákban (v0.1.19.1).
// A teljes (még nem kopott, dur nélküli) darab számít a legépebbnek.
function wornness(s) {
    const item = itemDatabase[s.key];
    const max = item && Number(item.durability);
    if (!max) return 1;
    return s.dur === undefined || s.dur === null ? 1 : Number(s.dur) / max;
}
function mostWorn(p, key, extra) {
    const list = p.inventory.filter(s => s.key === key && s.count > 0 && (!extra || extra(s)));
    list.sort((a, b) => wornness(a) - wornness(b));
    return list[0] || null;
}

function removeItem(p, key, count) {
    if (countItem(p, key) < count) return false;
    let left = count;
    // a legkopottabb darabok fogynak el előbb (egyforma kopásnál a hátizsák végéről, mint eddig)
    const order = p.inventory.map((s, i) => i).filter(i => p.inventory[i].key === key)
        .sort((a, b) => (wornness(p.inventory[a]) - wornness(p.inventory[b])) || (b - a));
    for (const i of order) {
        if (left <= 0) break;
        const slot = p.inventory[i];
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

// --- FELSZERELÉS KOPÁSA ---
// A felvett tárgy kopása. Visszaad egy figyelmeztető szöveget, ha most lett kritikus vagy most ment tönkre.
function wearEquipment(p, slot, amount) {
    const key = p.equipment[slot];
    const item = key && itemDatabase[key];
    if (!item || !item.durability || !(slot in p.equipmentDur)) return null;
    const before = p.equipmentDur[slot];
    if (before <= 0) return null;
    if (chance(skillFx(p).wearSave)) return null; // Gondos kéz (Mesterember)
    const after = Math.max(0, before - amount);
    p.equipmentDur[slot] = after;
    if (after <= 0) return `💥 Tönkrement: ${item.name}! Rajtad maradt, de amíg meg nem javítod, nem ad semmilyen bónuszt.`;
    const warnAt = item.durability * config.WEAR_WARN_FRACTION;
    if (before > warnAt && after <= warnAt) return `⚠️ A(z) ${item.name} hamarosan tönkremegy (${after}/${item.durability}). Javítsd meg!`;
    return null;
}

// Egy kapott találat: minden felvett védőfelszerelés és a táska 1-et kopik
const GEAR_SLOTS = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack'];
function wearGearOnHit(p) {
    return GEAR_SLOTS.map(slot => wearEquipment(p, slot, 1)).filter(Boolean);
}

function pushItem(p, key, count, dur) {
    if (isStackable(key)) {
        const slot = findSlot(p, key);
        if (slot) slot.count += count;
        else p.inventory.push({ key, count });
        return;
    }
    for (let i = 0; i < count; i++) p.inventory.push(newSlot(key, dur)); // dur: a levett felszerelés kopottsága
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

// A fáradtságot a játékos "Energia"-ként látja (100-ról fogy), ezért annak előjele fordított
const EFFECT_LABELS = { hunger: 'Éhség', thirst: 'Szomjúság', hp: 'Élet', fatigue: 'Energia' };
function describeChanges(changes) {
    return Object.entries(changes)
        .map(([key, raw]) => {
            const value = key === 'fatigue' ? -raw : raw;
            return `${value > 0 ? '+' : ''}${Math.round(value)} ${EFFECT_LABELS[key]}`;
        })
        .join(', ');
}

const CAPACITY_MESSAGES = {
    slots: 'A hátizsákod tele van!',
    weight: 'Túl nehéz! Ennyit már nem bírsz el.',
    unknown: 'Ismeretlen tárgy!'
};

// XP jóváírása (több szintlépés is lehet egyszerre). Szintlépéskor teljes gyógyulás.
function grantXp(p, amount, raw) {
    // event (pl. dupla XP hétvége): az admin oldalon állítható szorzó; az admin ajándéka (raw) nem szorzódik
    if (!raw) amount = Math.round(amount * Admin.xpMultiplier());
    p.xp += amount;
    if (!raw) seasonAdd(p, 'xp', amount); // a szezonpont = a hónapban szerzett XP (az admin ajándéka nem számít)
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
    if (ms > 0) p.fatigue = clamp(p.fatigue - ms * REST_PER_MS * (1 + (skillFx(p).restPct || 0)), 0, 100);
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
    const needs = 1 - Math.min(0.5, skillFx(p).needSave || 0); // Takarékos szervezet (Túlélő)
    p.hunger = clamp(p.hunger - needs * minutes * 100 / config.HUNGER_FULL_MINUTES, 0, 100);
    p.thirst = clamp(p.thirst - needs * minutes * 100 / config.THIRST_FULL_MINUTES, 0, 100);

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
// A fény percben fogy. A lemerült lámpába a játékos teszi be kézzel az elemet / olajat, vagy powerbankkal tölti fel
// (refuel_light) – automatikus csere nincs (v0.1.19). A fáklya, gyertya elég.
// Lámpa feltöltése: 'fuel' = elem / lámpaolaj (1 db), 'power_bank' = a powerbank 1 töltése (csak elemes lámpa)
function refuelLight(p, index, how) {
    const lamp = p.inventory[index];
    const item = lamp && itemDatabase[lamp.key];
    if (!item || !item.light || !item.light.fuel) return { error: 'Ezt nem lehet feltölteni.' };
    const full = item.durability;
    const cur = lamp.dur === undefined ? full : num(lamp.dur, 0);
    if (cur >= full - 0.5) return { error: `${item.name}: tele van.` };
    if (how === 'power_bank') {
        if (item.light.fuel !== 'aa_batteries') return { error: 'A powerbank csak elemes lámpát tud tölteni.' };
        const bank = mostWorn(p, 'power_bank', s => s.dur === undefined || s.dur > 0); // a legjobban lemerült powerbank előbb
        if (!bank) return { error: 'Nincs nálad feltöltött powerbank.' };
        lamp.dur = full;
        bank.dur = (bank.dur === undefined ? itemDatabase.power_bank.durability : bank.dur) - 1;
        let msg = `🔋 A powerbank feltöltötte: ${item.name}.`;
        if (bank.dur <= 0) { p.inventory = p.inventory.filter(s => s !== bank); msg += ` Elhasználódott: ${itemDatabase.power_bank.name}.`; }
        return { message: msg };
    }
    const fuel = itemDatabase[item.light.fuel];
    if (!removeItem(p, item.light.fuel, 1)) return { error: `Nincs nálad ${fuel ? fuel.name : 'töltet'}.` };
    lamp.dur = full;
    return { message: `${fuel.name} került ebbe: ${item.name}.` };
}

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
        if (slot.dur === undefined) slot.dur = item.durability; // stackelt gyertya / jelzőfény: a legfelső darab még ép
        const use = Math.min(remaining, slot.dur);
        slot.dur = Math.round((slot.dur - use) * 1000) / 1000;
        remaining -= use;
        if (slot.dur <= 0) {
            if (!item.light.fuel) {
                // fogyó fény: a köteg következő darabja jön (gyertya, jelzőfény), az utolsó után eltűnik
                if (slot.count > 1) { slot.count -= 1; delete slot.dur; }
                else p.inventory = p.inventory.filter(s => s !== slot);
                notices.push(`Elégett: ${item.name}.`);
            } else {
                slot.dur = 0;
                const hasFuel = p.inventory.some(x => x.key === item.light.fuel) || (item.light.fuel === 'aa_batteries' && p.inventory.some(x => x.key === 'power_bank'));
                notices.push(`Lemerült: ${item.name}.${hasFuel ? ' Koppints rá a hátizsákban, és tegyél bele újat!' : ''}`);
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
            if (now - entry.lastMovedAt >= config.REST_IDLE_MINUTES * 60 * 1000) {
                // a menedék fekhelye mellett gyorsabban (v0.1.12)
                // (pihenéskor a telefon gyakran nem küld friss GPS-t, ezért az utolsó ismert hely számít)
                const onBed = SurvivalShelter.level(p.shelter, 'bed') >= 1 && entry.lat !== null
                    && SurvivalBuildings.distanceToBuilding(entry, p.shelter) <= SurvivalShelter.RANGE_METERS;
                restFatigue(p, dt * (onBed ? SurvivalShelter.BED_REST_MULTIPLIER : 1));
            }

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
    cache: { type: mongoose.Schema.Types.Mixed, default: null }, // otthagyott zsákmány: { owner, items, until, visitors }
    fetchedAt: { type: Number }
});
const BuildingModel = mongoose.model('SurvivalBuilding', buildingSchema);

// ===== KARÁCSONYFÁK (v0.1.19): minden településen egy közös fa (OSM place pont) =====
const treeSchema = new mongoose.Schema({
    _id: { type: String },          // 'place_n123'
    name: String, place: String, lat: Number, lng: Number, cell: { type: String, index: true },
    points: { type: Number, default: 0 }, hung: { type: Number, default: 0 },
    ornaments: { type: mongoose.Schema.Types.Mixed, default: {} },   // díszkulcs -> darab
    contributors: { type: mongoose.Schema.Types.Mixed, default: {} }, // név -> pont
    updatedAt: Number
});
const TreeModel = mongoose.models.SurvivalTree || mongoose.model('SurvivalTree', treeSchema);
const TREE_CELL_DEG = 0.2;
const treeCellOf = (lat, lng) => `${Math.floor(lat / TREE_CELL_DEG)}:${Math.floor(lng / TREE_CELL_DEG)}`;
const treeCells = new Map(); // cella -> { at, ids:[] } (memória: mikor kérdeztük le az OSM-et)
async function treeCellLoad(cell) {
    const c = treeCells.get(cell);
    if (c && (c.pending || Date.now() - c.at < 24 * 3600000)) return c.pending || null;
    const [a, b] = cell.split(':').map(Number);
    const S = a * TREE_CELL_DEG, W = b * TREE_CELL_DEG, N = S + TREE_CELL_DEG, E = W + TREE_CELL_DEG;
    const run = (async () => {
        try {
            const bbox = [S, W, N, E].map(v => v.toFixed(5)).join(',');
            const json = await overpassQuery(`[out:json][timeout:20][bbox:${bbox}];node[place~"^(${SurvivalWinter.PLACE_TYPES.join('|')})$"][name];out body;`, config.AREA_OVERPASS_TIMEOUT_MS);
            const places = json.elements.filter(el => el.type === 'node' && el.tags && SurvivalWinter.PLACE_TYPES.includes(el.tags.place) && el.tags.name
                && el.lat >= S && el.lat < N && el.lon >= W && el.lon < E);
            if (places.length) await TreeModel.bulkWrite(places.map(el => ({ updateOne: {
                filter: { _id: 'place_n' + el.id },
                update: { $set: { name: String(el.tags.name).slice(0, 60), place: el.tags.place, lat: el.lat, lng: el.lon, cell }, $setOnInsert: { points: 0, hung: 0, ornaments: {}, contributors: {}, updatedAt: Date.now() } },
                upsert: true } })));
            treeCells.set(cell, { at: Date.now() });
        } catch (e) { treeCells.set(cell, { at: Date.now() - 23 * 3600000 }); } // hiba: egy óra múlva újra próbáljuk
    })();
    treeCells.set(cell, { at: Date.now(), pending: run });
    await run;
}
async function treesNear(lat, lng) {
    const km = SurvivalWinter.NEAR_KM, dLat = km / 111, dLng = km / (111 * Math.cos(lat * Math.PI / 180));
    const cells = new Set();
    for (const y of [lat - dLat, lat, lat + dLat]) for (const x of [lng - dLng, lng, lng + dLng]) cells.add(treeCellOf(y, x));
    await Promise.all([...cells].map(treeCellLoad));
    const list = [];
    for (const cell of cells) list.push(...await TreeModel.find({ cell }).lean());
    return list.filter(t => SurvivalBuildings.distanceToBuilding({ lat, lng }, t) <= km * 1000);
}
function treePublic(t, username) {
    // a stáb (tesztelés) nem kerül a nyilvános toplistába
    const contrib = Object.entries(t.contributors || {}).filter(([name]) => !Admin.isStaffName(name)).sort((a, b) => b[1] - a[1]);
    return { id: t._id, name: t.name, place: t.place, lat: t.lat, lng: t.lng, points: t.points || 0, hung: t.hung || 0,
        stage: SurvivalWinter.stageOf(t.points || 0, t.place), goal: SurvivalWinter.nextGoal(t.points || 0, t.place),
        top: contrib.slice(0, 5).map(([name, pts]) => ({ name, pts })), mine: username ? ((t.contributors || {})[username] || 0) : 0, ornaments: t.ornaments || {} };
}

// ===== HÉTVÉGI AJÁNDÉKVADÁSZAT (v0.1.19): csomagok az utcákon (OSM utcapontok), a memóriában =====
const STREET_CELL_DEG = 0.02;
const streetCells = new Map(); // cella -> { at, pts: [[lat, lng]...], pending }
async function streetPoints(lat, lng) {
    const cell = `${Math.floor(lat / STREET_CELL_DEG)}:${Math.floor(lng / STREET_CELL_DEG)}`;
    const c = streetCells.get(cell);
    if (c && c.pts && Date.now() - c.at < 7 * 24 * 3600000) return c.pts;
    if (c && c.pending) return c.pending;
    const [a, b] = cell.split(':').map(Number);
    const S = a * STREET_CELL_DEG, W = b * STREET_CELL_DEG, N = S + STREET_CELL_DEG, E = W + STREET_CELL_DEG;
    const pending = (async () => {
        try {
            const bbox = [S, W, N, E].map(v => v.toFixed(5)).join(',');
            const json = await overpassQuery(`[out:json][timeout:20][bbox:${bbox}];way[highway~"^(${SurvivalGifts.STREET_TYPES.join('|')})$"][access!=private];out geom;`, config.AREA_OVERPASS_TIMEOUT_MS);
            const pts = [];
            json.elements.forEach(el => {
                if (el.type !== 'way' || !el.tags || !SurvivalGifts.STREET_TYPES.includes(el.tags.highway) || el.tags.access === 'private' || !Array.isArray(el.geometry)) return;
                el.geometry.forEach(g => { if (g && isFinite(g.lat) && isFinite(g.lon) && pts.length < 8000) pts.push([g.lat, g.lon]); });
            });
            streetCells.set(cell, { at: Date.now(), pts });
            return pts;
        } catch (e) { streetCells.delete(cell); return []; }
    })();
    streetCells.set(cell, { at: Date.now(), pending });
    return pending;
}
// A játékos körüli ~500 m-es négyzetet lefedő cellák utcapontjai (a cellahatár közelében a szomszéd cella is kell)
async function streetPointsAround(lat, lng) {
    const dLat = 0.005, dLng = 0.0075, cells = new Map();
    for (const y of [lat - dLat, lat + dLat]) for (const x of [lng - dLng, lng + dLng]) cells.set(`${Math.floor(y / STREET_CELL_DEG)}:${Math.floor(x / STREET_CELL_DEG)}`, [y, x]);
    const lists = await Promise.all([...cells.values()].map(([y, x]) => streetPoints(y, x)));
    return [].concat(...lists);
}
const gifts = new Map(); // id -> { id, lat, lng, kind, expiresAt, openedBy: [], taken }
let giftSeq = 0;
function giftsCleanup(now) { for (const [id, g] of gifts) if (g.expiresAt <= now || g.taken) gifts.delete(id); }

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
async function activeLocks(ids, now, caches) {
    const locks = {};
    for (let i = 0; i < ids.length; i += 1000) {
        const docs = await BuildingModel.find({ _id: { $in: ids.slice(i, i + 1000) }, lockedUntil: { $gt: now } }, '_id lockedUntil cache');
        docs.forEach(d => {
            locks[d._id] = d.lockedUntil;
            if (caches && cacheActive(d.cache, now)) caches[d._id] = d.cache.until; // 📦 a térképen
        });
    }
    return locks;
}

// --- OTTHAGYOTT ZSÁKMÁNY (📦) ---
// Kutatáskor a talált holmi nem kerül egyből a leltárba: az épületben marad LOOT_CACHE_MINUTES percig,
// és a Zsákmány ablakban lehet elvenni. Bárki elviheti; a megtalálójának a visszatérés ingyenes,
// másnak egy kutatásnyi fáradtság. Lejárat után eltűnik, az épület a 4 órás zár végéig zárva marad.
function cacheActive(cache, now) {
    return !!(cache && Array.isArray(cache.items) && cache.items.length > 0 && Number(cache.until) > now);
}

// Épületenkénti sor: két játékos ne vihesse el ugyanazt a tárgyat egyszerre
const buildingQueues = new Map();
function withBuilding(id, fn) {
    const prev = buildingQueues.get(id) || Promise.resolve();
    const run = prev.then(fn);
    const tail = run.catch(() => {});
    buildingQueues.set(id, tail);
    tail.then(() => { if (buildingQueues.get(id) === tail) buildingQueues.delete(id); });
    return run;
}

async function setBuildingCache(id, cache) {
    await BuildingModel.findOneAndUpdate({ _id: id }, { $set: { cache } }, { returnDocument: 'after' });
}

// A kliensnek küldött zsákmánylista (a tárgyak és a lejárat; a látogatók listája nem)
function publicCache(cache, username) {
    return { items: cache.items.map(it => ({ key: it.key, count: it.count })), until: cache.until, mine: cache.owner === username };
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
        { returnDocument: 'after' }
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
        { returnDocument: 'after' }
    );
    return !!doc;
}

// Egy épület átkutatása (loot-sorsolás és jóváírás). emptyFactor < 1: kisebb eséllyel üres (pl. győzelem után)
// A talált holmi (még nem kerül a leltárba: a Zsákmány ablakban lehet elvenni)
// Leltár sorrend: fegyver, lőszer, felszerelés, gyógyszer, étel, ital, eszköz, alapanyag, értéktárgy
const INVENTORY_TYPE_ORDER = ['weapon', 'ammo', 'helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack',
    'medicine', 'food', 'drink', 'tool', 'material', 'mod', 'valuable', 'collectible', 'artifact'];
function sortInventory(inventory) {
    const rank = (s) => {
        const item = itemDatabase[s.key];
        const i = item ? INVENTORY_TYPE_ORDER.indexOf(item.type) : -1;
        return i < 0 ? INVENTORY_TYPE_ORDER.length : i;
    };
    const label = (s) => (itemDatabase[s.key] ? itemDatabase[s.key].name : s.key);
    return inventory.slice().sort((a, b) => (rank(a) - rank(b))
        || label(a).localeCompare(label(b), 'hu')
        || ((b.dur ?? Infinity) - (a.dur ?? Infinity)));
}

function hasItem(p, key) {
    return p.inventory.some(s => s.key === key && s.count > 0);
}

// Álkulcs: ha nálad van, ritkábban üres az épület; minden kutatás 1-et koptat rajta. { factor, broke }
function useLockpick(p) {
    const slot = mostWorn(p, 'lockpick'); // a legkopottabb álkulcs előbb
    if (!slot) return { factor: 1, broke: false };
    if (chance(skillFx(p).pickSave)) return { factor: config.LOCKPICK_EMPTY_FACTOR, broke: false }; // Lakatos
    slot.dur = (slot.dur === undefined ? itemDatabase.lockpick.durability : slot.dur) - 1;
    const broke = slot.dur <= 0;
    if (broke) p.inventory = p.inventory.filter(s => s !== slot);
    return { factor: config.LOCKPICK_EMPTY_FACTOR, broke };
}

function rollBuildingLoot(building, emptyFactor, fx) {
    fx = fx || {};
    // event: több zsákmány szorzó (kevesebb üres épület, több darab)
    const mult = Admin.lootMultiplier();
    emptyFactor = emptyFactor * (1 - Math.min(0.6, fx.emptySave || 0)); // Éles szem (Felderítő)
    const roll = () => SurvivalBuildings.rollLoot(building.type, itemDatabase, Math.random, { emptyFactor: emptyFactor / mult })
        .map(({ key, count }) => ({ key, count: mult > 1 ? Math.max(1, Math.round(count * mult)) : count }));
    const found = roll();
    if (chance(fx.extraLoot)) roll().forEach(it => { const same = found.find(f => f.key === it.key); if (same) same.count += it.count; else found.push(it); }); // Kincsvadász
    if (chance(fx.scrapFind)) { // Hulladékgyűjtő: +1 alapanyag (a talált anyagokból, vagy egy rongy)
        const mat = found.find(f => itemDatabase[f.key] && itemDatabase[f.key].type === 'material');
        if (mat) mat.count += 1; else found.push({ key: 'rag', count: 1 });
    }
    // Fagyos Csend: az esemény alatt dísz is akadhat
    if (SurvivalWinter.active(Date.now()) && Math.random() < SurvivalWinter.LOOT_CHANCE) found.push({ key: SurvivalWinter.rollLootOrnament(Math.random), count: 1 });
    return found;
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
        const user = await PlayerModel.findOne({ username: payload.username }, 'username avatar earlySurvivor bannedUntil banReason role');
        if (!user) return next(new Error('AUTH_INVALID'));
        const ban = Admin.banInfo(user);
        if (ban) { const err = new Error('BANNED'); err.data = { message: ban.message }; return next(err); }
        socket.data.username = user.username;
        socket.data.avatar = safeAvatar(user.avatar);
        socket.data.earlySurvivor = !!user.earlySurvivor;
        socket.data.role = Admin.roleOf(user);
        next();
    } catch (err) {
        console.error("Hiba a socket hitelesítés közben:", err);
        next(new Error('SERVER_ERROR'));
    }
});

io.on('connection', (socket) => {
    const username = socket.data.username;
    console.log(`🔌 Új kliens csatlakozott: ${socket.id} (${username})`);
    if (pushHooks) pushHooks.attach(socket); // telefonos értesítés fel/leiratkozás (v0.1.19)

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

    if (adminHooks) adminHooks.onConnect(socket, username); // bejelentések, event, hibajelentés, napló
    if (premiumHooks) premiumHooks.onConnect(socket, username); // prémium bolt

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
            // Termosz a leltárban: az italok jobban oltják a szomjat
            let effects = itemConfig.effects;
            if (itemConfig.type === 'drink' && effects && effects.thirst > 0 && hasItem(p, 'thermos')) {
                effects = { ...effects, thirst: Math.round(effects.thirst * (1 + config.THERMOS_DRINK_BONUS)) };
            }
            // Képességek: Elsősegély (több gyógyulás), Jó étvágy (az étel és ital többet ér)
            const ufx = skillFx(p);
            if (effects && (ufx.healPct || ufx.foodPct)) {
                effects = { ...effects };
                if (ufx.healPct && effects.hp > 0) effects.hp = Math.round(effects.hp * (1 + ufx.healPct));
                if (ufx.foodPct) ['hunger', 'thirst'].forEach(k => { if (effects[k] > 0) effects[k] = Math.round(effects[k] * (1 + ufx.foodPct)); });
            }
            const changes = SurvivalStats.applyEffects(p, effects, playerStats(p).maxHp);
            if (Object.keys(changes).length === 0) return { save: false, error: 'Most nincs rá szükséged.' };

            removeItem(p, data.itemKey, 1);
            markTutorial(p, 'use');
            questEvent(p, username, 'use', null, qFlags());
            const verb = itemConfig.type === 'food' ? 'Megetted' : itemConfig.type === 'drink' ? 'Megittad' : 'Használtad';
            return { message: `${verb}: ${itemConfig.name} (${describeChanges(changes)})` };
        })).then(reply('item_use_result')).catch(logError("Hiba tárgy használat során:"));
    });

    // --- BIZTONSÁGOS FELSZERELÉS (EQUIP) ---
    // A tárgy típusa adja a slotot (sisak csak a sisak helyére, fegyver csak a fegyver helyére).
    socket.on('equip_item', (data) => {
        if (!data || typeof data.itemKey !== 'string') return;
        if (data.slotType !== undefined && typeof data.slotType !== 'string') return;
        if (data.index !== undefined && !Number.isInteger(data.index)) return;

        withPlayer(username, freeOnly((p) => {
            const item = itemDatabase[data.itemKey];
            if (!SurvivalStats.isEquippable(item)) return { save: false, error: 'Ezt a tárgyat nem lehet felvenni.' };
            const slot = SurvivalStats.equipSlot(item);
            if (data.slotType !== undefined && data.slotType !== slot) return { save: false, error: 'Ez a tárgy nem erre a helyre való.' };

            // Melyik darabot vesszük fel: amelyikre a játékos koppintott (index), különben a legkevésbé kopottat.
            // A darab a tartósságát magával viszi.
            let invIndex = Number.isInteger(data.index) && p.inventory[data.index] && p.inventory[data.index].key === data.itemKey ? data.index : -1;
            if (invIndex < 0) {
                p.inventory.forEach((s, i) => {
                    if (s.key !== data.itemKey) return;
                    if (invIndex < 0 || (s.dur ?? Infinity) > (p.inventory[invIndex].dur ?? Infinity)) invIndex = i;
                });
            }
            if (invIndex < 0) return { save: false, error: 'A tárgy nincs a leltáradban!' };
            const taken = p.inventory[invIndex];
            if (taken.count > 1) taken.count -= 1; else p.inventory.splice(invIndex, 1);

            const currentEquipped = p.equipment[slot];
            if (currentEquipped) pushItem(p, currentEquipped, 1, p.equipmentDur[slot]);
            p.equipment[slot] = data.itemKey;
            if (item.durability) p.equipmentDur[slot] = taken.dur === undefined ? item.durability : clamp(Number(taken.dur), 0, item.durability);
            else delete p.equipmentDur[slot];

            // Csere után is bele kell férnie (pl. kisebb hátizsákra cserélve)
            const problem = capacityProblem(p);
            if (problem === 'slots') return { save: false, error: 'A csere után nem férne el minden a hátizsákodban!' };
            if (problem === 'weight') return { save: false, error: 'A csere után túl nehéz lenne a csomagod!' };
            markTutorial(p, 'equip');
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
            pushItem(p, key, 1, p.equipmentDur[data.slotType]); // a levett tárgy megtartja a kopottságát
            delete p.equipmentDur[data.slotType];

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

    // --- FELSZERELÉS JAVÍTÁSA (műhely nélkül, a meglévő készletekkel) ---
    // Ruha, páncél, táska: varrókészlet + 1 rongy (+50%). Lőfegyver: fegyverpucoló készlet (+50%).
    // Közelharci fegyver, íj, parittya: 1 ragasztószalag + kalapács / fogó / multitool (+40%).
    // A készletek (szerszámok) közben 1-et kopnak; ha elfogynak, eltörnek.
    socket.on('repair_item', (data) => {
        if (!data || !['eq', 'inv'].includes(data.source)) return;
        if (data.source === 'eq' && !SurvivalStats.EQUIPMENT_SLOTS.includes(data.slot)) return;
        if (data.source === 'inv' && !Number.isInteger(data.index)) return;

        withPlayer(username, freeOnly((p) => {
            // A javítandó darab: felvett tárgy (equipmentDur) vagy a leltár egy slotja (dur)
            let key, current, setDur;
            if (data.source === 'eq') {
                key = p.equipment[data.slot];
                if (!key) return { save: false, error: 'Ezen a helyen nincs semmi.' };
                current = p.equipmentDur[data.slot];
                setDur = (v) => { p.equipmentDur[data.slot] = v; };
            } else {
                const slot = p.inventory[data.index];
                if (!slot) return { save: false, error: 'Ez a tárgy már nincs nálad.' };
                key = slot.key;
                current = slot.dur;
                setDur = (v) => { slot.dur = v; };
            }
            const item = itemDatabase[key];
            if (!item || !item.wear || !item.durability) return { save: false, error: 'Ezt a tárgyat nem lehet javítani.' };
            const max = item.durability;
            if (current === undefined || current >= max) return { save: false, error: 'Ez a tárgy nem szorul javításra.' };

            const isGear = GEAR_SLOTS.includes(item.type);
            const isFirearm = item.type === 'weapon' && typeof item.reqAmmo === 'string' && item.reqAmmo.startsWith('ammo_');
            const itemName = (k) => (itemDatabase[k] ? itemDatabase[k].name : k);
            let toolKeys, materials, fraction;
            if (isGear) { toolKeys = ['sewing_kit']; materials = { rag: 1 }; fraction = config.REPAIR_GEAR_FRACTION; }
            else if (isFirearm && countItem(p, 'gun_cleaning_kit') === 0) {
                // Pucolókészlet nélkül: gépolaj + rongy gyorsjavítás (kisebb hatás, nem kell szerszám)
                if (countItem(p, 'machine_oil') < 1 || countItem(p, 'rag') < 1) {
                    return { save: false, error: `A javításhoz kell: ${itemName('gun_cleaning_kit')}, vagy 1 ${itemName('machine_oil')} + 1 ${itemName('rag')}.` };
                }
                toolKeys = []; materials = { machine_oil: 1, rag: 1 }; fraction = config.MACHINE_OIL_REPAIR_FRACTION;
            }
            else if (isFirearm) { toolKeys = ['gun_cleaning_kit']; materials = {}; fraction = config.REPAIR_FIREARM_FRACTION; }
            else { toolKeys = ['claw_hammer', 'pliers', 'multitool', 'toolbox']; materials = { duct_tape: 1 }; fraction = config.REPAIR_OTHER_FRACTION; }

            const tools = p.inventory.filter(s => toolKeys.includes(s.key) && s.count > 0)
                .sort((a, b) => ((a.key === 'toolbox') - (b.key === 'toolbox')) || ((a.dur ?? Infinity) - (b.dur ?? Infinity)));
            if (toolKeys.length > 0 && tools.length === 0) return { save: false, error: `A javításhoz kell: ${toolKeys.map(itemName).join(' vagy ')}.` };
            for (const [mat, qty] of Object.entries(materials)) {
                if (countItem(p, mat) < qty) return { save: false, error: `A javításhoz kell: ${qty}× ${itemName(mat)}.` };
            }

            for (const [mat, qty] of Object.entries(materials)) removeItem(p, mat, qty);
            const after = Math.min(max, current + Math.ceil(max * fraction * (1 + (skillFx(p).repairPct || 0)))); // Szerelő
            setDur(after);
            let message = `🔧 Megjavítottad: ${item.name} (${after}/${max}).`;
            const tool = tools[0];
            if (tool && tool.dur !== undefined) {
                tool.dur -= 1;
                if (tool.dur <= 0) {
                    p.inventory = p.inventory.filter(s => s !== tool);
                    message += ` Eltört: ${itemName(tool.key)}.`;
                }
            }
            return { message };
        })).then(reply('repair_result')).catch(logError("Hiba a javítás során:"));
    });

    // --- TÁRGY ELDOBÁSA (az eldobott tárgy eltűnik) ---
    socket.on('drop_item', (data) => {
        if (!data || typeof data.itemKey !== 'string') return;
        const count = data.count === undefined ? 1 : Math.floor(Number(data.count));
        if (!Number.isFinite(count) || count < 1) return;

        withPlayer(username, freeOnly((p) => {
            // Ha a kliens megmondja, melyik helyről (pl. a kopott zseblámpát, nem az újat), pontosan azt dobjuk el
            if (Number.isInteger(data.index)) {
                const slot = p.inventory[data.index];
                if (!slot || slot.key !== data.itemKey) return { save: false, error: 'A leltár közben megváltozott, próbáld újra!' };
                if (slot.count < count) return { save: false, error: 'Nincs ennyi ebből a tárgyból!' };
                slot.count -= count;
                p.inventory = p.inventory.filter(s => s.count > 0);
            } else if (!removeItem(p, data.itemKey, count)) return { save: false, error: 'Nincs ennyi ebből a tárgyból!' };
            const item = itemDatabase[data.itemKey];
            return { message: `Eldobtál ${count} db-ot: ${item ? item.name : data.itemKey}` };
        })).then(reply('drop_result')).catch(logError("Hiba eldobás során:"));
    });

    // --- TÖBB TÁRGY ELDOBÁSA EGYSZERRE (Kidobás mód) ---
    // A kliens a kijelölt helyeket küldi: [{ index, key }]; minden hely teljes egészében (az egész köteg) eltűnik.
    // A kulcs ellenőrzése miatt egy közben megváltozott leltárnál nem dobunk el rossz tárgyat.
    socket.on('drop_items', (data) => {
        if (!data || !Array.isArray(data.slots) || data.slots.length === 0 || data.slots.length > 200) return;
        if (!data.slots.every(x => x && Number.isInteger(x.index) && typeof x.key === 'string')) return;

        withPlayer(username, freeOnly((p) => {
            const indices = [...new Set(data.slots.map(x => x.index))];
            if (indices.length !== data.slots.length) return { save: false, error: 'Hibás kijelölés.' };
            for (const x of data.slots) {
                const slot = p.inventory[x.index];
                if (!slot || slot.key !== x.key) return { save: false, error: 'A leltár közben megváltozott, jelöld ki újra!' };
            }
            const dropped = data.slots.map(x => p.inventory[x.index]);
            p.inventory = p.inventory.filter(s => !dropped.includes(s));
            const pieces = dropped.reduce((sum, s) => sum + s.count, 0);
            return { message: `Kidobtál ${dropped.length} helyet (${pieces} db tárgy).`, payload: { dropped: dropped.length } };
        })).then(reply('drop_result')).catch(logError("Hiba a több tárgy eldobása során:"));
    });

    // --- LELTÁR RENDEZÉSE (típus, majd név szerint) ---
    // --- ÁTHELYEZÉS A HÁTIZSÁKON BELÜL (húzással): két hely cseréje, vagy a lista végére üres helyre ---
    socket.on('move_item', (data) => {
        if (!data || !Number.isInteger(data.from) || !Number.isInteger(data.to)) return;
        if (data.from < 0 || data.to < 0 || data.from === data.to) return;

        withPlayer(username, freeOnly((p) => {
            const inv = p.inventory;
            if (data.from >= inv.length) return { save: false, error: 'Ez a hely már üres.' };
            if (data.to < inv.length) {
                const tmp = inv[data.from]; inv[data.from] = inv[data.to]; inv[data.to] = tmp;
            } else {
                inv.push(inv.splice(data.from, 1)[0]); // üres helyre: a végére kerül
            }
            return {};
        })).then(reply('move_result')).catch(logError("Hiba a tárgy áthelyezése során:"));
    });

    socket.on('sort_inventory', () => {
        withPlayer(username, freeOnly((p) => {
            p.inventory = sortInventory(p.inventory);
            return { message: 'Leltár rendezve.' };
        })).then(reply('sort_result')).catch(logError("Hiba a leltár rendezése során:"));
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

        entry.xpMeters += moved * (1 + (entry.walkXpBonus || 0)); // iránytű / térkép: több XP
        const xp = Math.floor(entry.xpMeters / config.MOVE_XP_METERS);
        entry.xpMeters -= xp * config.MOVE_XP_METERS;

        withPlayer(username, aliveOnly((p) => {
            addFatigue(p, moved * config.FATIGUE_PER_METER);
            bumpStat(p, 'walkedMeters', moved);
            if (!p.lifeStartedAt) p.lifeStartedAt = Date.now();
            let levels = xp > 0 ? grantXp(p, xp) : 0;
            // Első lépések: "sétálj 100 métert" (v0.1.19)
            if (p.stats && p.stats.walkedMeters >= SurvivalTutorial.WALK_METERS) levels += markTutorial(p, 'walk');
            // Küldetések (v0.1.20): séta és új területek
            seasonAdd(p, 'meters', moved);
            const qr = questEvent(p, username, 'move', { meters: moved, lat: here.lat, lng: here.lng }, qFlags());
            levels += qr.levels;
            if (qr.newCell && p.quests.weekly.some(x => x.kind === 'w_towns' && !x.done)) townCheck(here);
            // A cipő a gyaloglástól is kopik (5 km-enként 1)
            const notices = [];
            if (p.equipment.shoes && !SurvivalStats.isBroken(p, 'shoes')) {
                p.walkMeters += moved;
                while (p.walkMeters >= config.SHOE_WEAR_METERS) {
                    p.walkMeters -= config.SHOE_WEAR_METERS;
                    const notice = wearEquipment(p, 'shoes', 1);
                    if (notice) notices.push(notice);
                }
            }
            return { leveledUp: levels > 0, notices };
        })).then(r => {
            if (!r) return;
            (r.result.notices || []).forEach(message => io.to(socket.id).emit('player_notice', { message }));
            sendPlayerState(username, r.p, { leveledUp: !!r.result.leveledUp });
        }).catch(logError("Hiba a mozgás feldolgozásakor:"));
    });

    // --- CRAFTOLÁS ---
    socket.on('craft_item', (data) => {
        if (!data || typeof data.recipeKey !== 'string') return;

        withPlayer(username, freeOnly((p) => {
            const recipe = craftingRecipes.find(r => r.key === data.recipeKey);
            if (!recipe) return { save: false, error: 'Ismeretlen recept!' };
            if (recipe.station) return { save: false, error: 'Ezt csak műhelyben vagy olvasztóban lehet elkészíteni (hamarosan jönnek).' };
            if (recipe.event === 'winter' && !SurvivalWinter.active(Date.now(), winterTest())) return { save: false, error: 'A díszeket csak a Fagyos Csend alatt (dec. 6. – jan. 6.) lehet barkácsolni.' };
            const itemName = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);

            for (const [matKey, reqQty] of Object.entries(recipe.req)) {
                if (countItem(p, matKey) < reqQty) {
                    return { save: false, error: `Nincs elég alapanyag: ${itemName(matKey)} (Kellene: ${reqQty})` };
                }
            }

            // Szétszedés a tárgy lapjáról: a kiválasztott leltárhely darabja fogy (pl. épp a tönkrement póló)
            let chosen = null;
            if (Number.isInteger(data.index) && recipe.cat === 'Szétszerelés') {
                const sl = p.inventory[data.index];
                if (sl && recipe.req[sl.key] && sl.count >= recipe.req[sl.key]) chosen = sl;
            }

            // Szerszámok: nem fogynak el, de kopnak. Több lehetőségnél a legkopottabbat használjuk el előbb,
            // a szerszámosládát (ami mindent pótol) csak akkor, ha nincs más.
            const usedTools = [];
            for (const entry of recipe.tools || []) {
                const options = RecipeTools.toolOptions(entry);
                const candidates = p.inventory.filter(s => options.includes(s.key) && s.count > 0 && !usedTools.includes(s) && s !== chosen);
                if (candidates.length === 0) {
                    return { save: false, error: `Hiányzó szerszám: ${options.map(itemName).join(' vagy ')}` };
                }
                candidates.sort((a, b) => ((a.key === 'toolbox') - (b.key === 'toolbox')) || ((a.dur ?? Infinity) - (b.dur ?? Infinity)));
                usedTools.push(candidates[0]);
            }

            // Víz: bármilyen víz jó, a legolcsóbbat használjuk (szennyezett csapvíz előbb)
            let waterKey = null;
            if (recipe.water) {
                waterKey = RecipeTools.WATER_SOURCES.find(k => countItem(p, k) >= recipe.water + (recipe.req[k] || 0)) || null;
                if (!waterKey) return { save: false, error: `Víz kell hozzá: ${recipe.water} adag (bármilyen, a szennyezett is jó).` };
            }

            // Tűzgyújtás: gyufa (elfogy), ha nincs, a tűzgyújtó rúd (kopik)
            let fireMatch = false;
            // A menedék tűzhelyénél nem kell tüzet gyújtani (v0.1.12)
            const atHearth = recipe.fire && SurvivalShelter.level(p.shelter, 'hearth') >= 1 && atShelter(activePlayers[username], p.shelter).ok;
            if (recipe.fire && !atHearth) {
                const [match, rod] = RecipeTools.FIRE_STARTERS;
                if (countItem(p, match) >= 1 + (recipe.req[match] || 0)) fireMatch = true;
                else {
                    const rodSlot = mostWorn(p, rod, s => !usedTools.includes(s));
                    if (!rodSlot) return { save: false, error: `Tüzet kell gyújtani: ${itemName(match)} vagy ${itemName(rod)} kell hozzá.` };
                    usedTools.push(rodSlot);
                }
            }

            // Előbb elvesszük az alapanyagokat (ez helyet szabadíthat fel), aztán megnézzük, elfér-e a termék.
            // Ha nem fér el, semmi nem mentődik (save: false), így az alapanyagok sem vesznek el.
            for (const [matKey, reqQty] of Object.entries(recipe.req)) {
                if (chosen && chosen.key === matKey) {
                    chosen.count -= reqQty;
                    if (chosen.count <= 0) p.inventory = p.inventory.filter(s => s !== chosen);
                } else removeItem(p, matKey, reqQty);
            }
            if (fireMatch) removeItem(p, RecipeTools.FIRE_STARTERS[0], 1);
            if (waterKey) removeItem(p, waterKey, recipe.water);
            const result = recipe.result || recipe.key;
            let count = recipe.count || 1;
            const added = addItem(p, result, count);
            if (!added.ok) return { save: false, error: CAPACITY_MESSAGES[added.reason] };
            const cfx = skillFx(p);
            // Bőkezű kéz / Feltaláló: dupla adag (ha elfér)
            if (chance(cfx.craftDouble) && addItem(p, result, count).ok) count *= 2;

            // Kopás: minden kopó szerszámból 1 tartósság; 0-nál eltörik
            const broken = [];
            usedTools.forEach(slot => {
                if (slot.dur === undefined) return;
                if (chance(cfx.toolSave)) return; // Szerszámkímélés
                slot.dur -= 1;
                if (slot.dur <= 0) {
                    p.inventory = p.inventory.filter(s => s !== slot);
                    broken.push(itemName(slot.key));
                }
            });

            bumpStat(p, 'itemsCrafted', count);
            markTutorial(p, 'craft');
            questEvent(p, username, 'craft', { count, ornament: recipe.event === 'winter' }, qFlags());
            if (cfx.craftXp) grantXp(p, cfx.craftXp); // Mesterremek
            let message = `Sikeresen megbarkácsoltad: ${recipe.name}${count > 1 ? ` (${count} db)` : ''}!${count > (recipe.count || 1) ? ' ✨ Dupla adag!' : ''}`;
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
    let activeSearch = null; // folyamatban lévő átkutatás ezen a kapcsolaton: { buildingId, readyAt }

    // Közös ellenőrzés a kutatás kezdetéhez és befejezéséhez. Hibánál { error }, különben { entry, building, now }.
    async function lootPrecheck(p, buildingId) {
        if (p.fatigue >= 100) return { error: 'Teljesen kimerültél! Pihenned kell.' };
        const entry = activePlayers[username];
        const now = Date.now();
        if (entry && entry.lootBlockedUntil > now) {
            const seconds = Math.ceil((entry.lootBlockedUntil - now) / 1000);
            return { error: `A GPS-pozíciód nemrég hirtelen ugrott. Várj még ${seconds} másodpercet!` };
        }
        const dangerUntil = p.dangerUntil[buildingId];
        if (dangerUntil && dangerUntil > now) {
            const minutes = Math.max(1, Math.ceil((dangerUntil - now) / 60000));
            return { error: `Az ellenség még bent van, ahonnan elmenekültél. Gyere vissza később! (kb. ${minutes} perc)` };
        }
        if (!entry || entry.lat === null || !entry.positionAt || now - entry.positionAt > config.POSITION_MAX_AGE_SECONDS * 1000) {
            return { error: 'Várd meg a friss GPS pozíciót!' };
        }
        let building;
        try {
            building = await getBuilding(buildingId);
        } catch (err) {
            if (err.code === 'NOT_FOUND') return { error: 'Ez az épület nem található.' };
            return { error: 'Nem sikerült azonosítani az épületet. Próbáld újra egy kicsit később!' };
        }
        const distance = SurvivalBuildings.distanceToBuilding(entry, building); // nagy létesítménynél a szélétől
        const range = config.LOOT_RANGE_METERS + (skillFx(p).lootRange || 0); // Hosszú kar (Felderítő)
        if (distance > range + config.LOOT_RANGE_TOLERANCE_METERS) {
            return { error: `Túl messze vagy az épülettől! (${Math.round(distance)} m - menj ${range} méteren belülre)` };
        }
        return { entry, building, now };
    }

    // --- ÁTKUTATÁS KEZDETE (v0.1.10) ---
    // Az átkutatás időbe telik (épülettípustól függően 15/30/60 mp). A kliens a csík végén küldi a loot_building-et;
    // a szerver csak akkor fogadja el, ha ugyanennél az épületnél elkezdte, és letelt az idő.
    socket.on('search_start', (data) => {
        if (!data || !SurvivalBuildings.parseBuildingId(data.buildingId)) return;
        const buildingId = data.buildingId;
        withPlayer(username, freeOnly(async (p) => {
            const check = await lootPrecheck(p, buildingId);
            if (check.error) return { save: false, error: check.error, payload: { buildingId } };
            const until = await currentLock(buildingId);
            if (until > check.now) {
                const minutes = Math.max(1, Math.ceil((until - check.now) / 60000));
                return { save: false, error: `Ezt az épületet nemrég kifosztották. Gyere vissza később! (kb. ${minutes} perc)`, payload: { buildingId }, lockInfo: { [buildingId]: until } };
            }
            const seconds = Math.round(SurvivalBuildings.searchSeconds(check.building.type) * config.SEARCH_TIME_SCALE * (1 - Math.min(0.5, skillFx(p).searchFast || 0)) * 10) / 10; // Gyakorlott kutató
            activeSearch = { buildingId, readyAt: check.now + seconds * 1000 };
            return { save: false, payload: { buildingId, seconds, buildingName: check.building.name } };
        })).then(r => {
            if (!r) return;
            if (r.result && r.result.lockInfo) socket.emit('building_status', { locks: r.result.lockInfo });
            socket.emit('search_started', r.result.error
                ? { success: false, message: r.result.error, buildingId }
                : { success: true, ...r.result.payload });
        }).catch(logError("Hiba az átkutatás indításakor:"));
    });

    socket.on('search_cancel', () => { activeSearch = null; });

    // --- GYORSSÁV: tárgy kitűzése / levétele ---
    // { slot: 0..2, key: tárgykulcs | null }. Csak fogyasztható tárgy tűzhető ki; egy tárgy csak egy helyen lehet.
    socket.on('set_quickbar', (data) => {
        if (!data || !Number.isInteger(data.slot) || data.slot < 0 || data.slot >= QUICKBAR_SIZE) return;
        const key = data.key === null ? null : data.key;
        if (key !== null && (typeof key !== 'string' || !itemDatabase[key] || !SurvivalStats.isConsumable(itemDatabase[key]))) return;
        withPlayer(username, (p) => {
            const bar = normalizeQuickbar(p.quickbar);
            if (key !== null) { const i = bar.indexOf(key); if (i >= 0) bar[i] = null; }
            bar[data.slot] = key;
            p.quickbar = bar;
            if (key) markTutorial(p, 'pin');
            return { message: key ? `Kitűzve a gyorssávra: ${itemDatabase[key].name}` : 'Levetted a gyorssávról.' };
        }).then(reply('quickbar_result')).catch(logError("Hiba a gyorssáv beállításakor:"));
    });

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
            // (Teli táskával is lehet kutatni: a talált holmi az épületben marad, a Zsákmány ablakból lehet elvenni)
            // Átkutatási idő: csak az előbb elkezdett és letelt kutatást fogadjuk el
            if (config.SEARCH_TIME_SCALE > 0) {
                if (!activeSearch || activeSearch.buildingId !== buildingId) {
                    return { save: false, error: 'Előbb kezdd el az épület átkutatását!' };
                }
                if (Date.now() + config.SEARCH_GRACE_MS < activeSearch.readyAt) {
                    return { save: false, error: 'Még nem végeztél az átkutatással!' };
                }
            }
            const check = await lootPrecheck(p, buildingId);
            if (check.error) { activeSearch = null; return { save: false, error: check.error }; }
            activeSearch = null;
            const { building, now } = check;

            const lockedUntil = now + config.LOOT_LOCK_HOURS * 60 * 60 * 1000;
            if (!(await lockBuilding(buildingId, username, now, lockedUntil))) {
                const until = await currentLock(buildingId);
                const minutes = Math.max(1, Math.ceil((until - now) / 60000));
                return { save: false, error: `Ezt az épületet nemrég kifosztották. Gyere vissza később! (kb. ${minutes} perc)`, lockInfo: { [buildingId]: until } };
            }

            const info = SurvivalBuildings.typeInfo(building.type);
            if (Math.random() < info.encounter * (1 - Math.min(0.6, skillFx(p).encounterSave || 0))) { // Csendes léptek
                // Körös harc indul: a lootot csak győzelem után kapja meg (menekülésnél semmit)
                const night = SurvivalSun.isNight(building.lat, building.lng, new Date(Date.now())); // éjjel Árnyék is jöhet
                p.combat = Combat.createCombat(p, { id: buildingId, name: building.name, type: building.type }, info, undefined, { night });
                p.combat.lockedUntil = lockedUntil;
                return {
                    lockedUntil,
                    message: `Veszély! ${p.combat.enemy.avatar} ${p.combat.enemy.name} támadt rád az épületben!`,
                    payload: { items: [], skipped: [], buildingId, lockedUntil, buildingName: building.name, encounter: { started: true } }
                };
            }

            const pick = useLockpick(p);
            const found = rollBuildingLoot(building, pick.factor, skillFx(p));
            addFatigue(p, config.FATIGUE_LOOT);
            bumpStat(p, 'buildingsLooted');
            markTutorial(p, 'loot');
            questEvent(p, username, 'loot', { lat: building.lat, lng: building.lng, type: building.type }, qFlags());
            const pickNote = pick.broke ? ` Eltört: ${itemDatabase.lockpick.name}.` : '';

            if (found.length === 0) {
                return {
                    lockedUntil,
                    message: `Ez a(z) ${building.name} üres volt.${pickNote}`,
                    payload: { items: [], buildingId, lockedUntil, buildingName: building.name, encounter: null, cache: null }
                };
            }
            // A talált holmi az épületben vár (Zsákmány ablak); amit nem teszel el, az LOOT_CACHE_MINUTES percig ott marad
            const cache = { owner: username, items: found, until: now + config.LOOT_CACHE_MINUTES * 60000, visitors: [] };
            await setBuildingCache(buildingId, cache);
            return {
                lockedUntil,
                cacheUntil: cache.until,
                ...(pickNote ? { message: pickNote.trim() } : {}),
                payload: { items: found, buildingId, lockedUntil, buildingName: building.name, encounter: null, cache: publicCache(cache, username) }
            };
        })).then(r => {
            reply('loot_result')(r);
            if (!r) return;
            if (r.result.lockInfo) socket.emit('building_status', { locks: r.result.lockInfo });
            if (r.result.lockedUntil) {
                io.emit('building_looted_update', { id: buildingId, looted: true, lockedUntil: r.result.lockedUntil, cacheUntil: r.result.cacheUntil || 0 });
            }
        }).catch(logError("Hiba a szerver oldali lootolás során:"));
    });

    // --- OTTHAGYOTT ZSÁKMÁNY: KINYITÁS ÉS ELVÉTEL ---
    // Az épületnél kell lenni (ugyanaz a távolság, mint a kutatásnál). A megtalálónak ingyenes;
    // másnak az első kinyitás egy kutatásnyi fáradtság (utána ennél a zsákmánynál már nem).
    function cacheReach(p, building) {
        const entry = activePlayers[username];
        const now = Date.now();
        if (!entry || entry.lat === null || !entry.positionAt || now - entry.positionAt > config.POSITION_MAX_AGE_SECONDS * 1000) {
            return 'Várd meg a friss GPS pozíciót!';
        }
        const distance = SurvivalBuildings.distanceToBuilding(entry, building);
        const range = config.LOOT_RANGE_METERS + (skillFx(p).lootRange || 0);
        if (distance > range + config.LOOT_RANGE_TOLERANCE_METERS) {
            return `Túl messze vagy az épülettől! (${Math.round(distance)} m - menj ${range} méteren belülre)`;
        }
        return null;
    }

    // action: 'open' (megnézés) | 'take' (index: egy tétel, all: mind)
    function handleCache(data, action) {
        if (!data || !SurvivalBuildings.parseBuildingId(data.buildingId)) return;
        if (action === 'take' && !data.all && !Number.isInteger(data.index)) return;
        const buildingId = data.buildingId;
        let emptied = false;
        let lockedUntil = 0;

        withBuilding(buildingId, async () => {
            const doc = await BuildingModel.findOne({ _id: buildingId });
            lockedUntil = (doc && doc.lockedUntil) || 0;
            const now = Date.now();
            const cache = doc && doc.cache;
            const r = await withPlayer(username, freeOnly(async (p) => {
                if (!cacheActive(cache, now)) return { save: false, error: 'Itt már nincs semmi. Valaki elvitte, vagy lejárt az idő.', payload: { buildingId, gone: true } };
                let building;
                try { building = await getBuilding(buildingId); } catch (e) { return { save: false, error: 'Ez az épület nem található.' }; }
                const far = cacheReach(p, building);
                if (far) return { save: false, error: far };

                // Idegen zsákmány: az első kinyitás fáraszt (a megtalálónak soha)
                const visitors = Array.isArray(cache.visitors) ? cache.visitors : [];
                let charged = false;
                if (cache.owner !== username && !visitors.includes(username)) {
                    if (p.fatigue >= 100) return { save: false, error: 'Teljesen kimerültél! Pihenned kell.' };
                    addFatigue(p, config.FATIGUE_LOOT);
                    cache.visitors = visitors.concat(username);
                    charged = true;
                }

                let message;
                if (action === 'take') {
                    const indexes = data.all ? cache.items.map((_, i) => i) : [data.index];
                    if (!data.all && !cache.items[data.index]) return { save: false, error: 'Ez a tárgy már nincs itt.' };
                    const taken = [];
                    let problem = null;
                    indexes.forEach(i => {
                        const it = cache.items[i];
                        // egyesével tesszük el, így ami elfér, az bekerül
                        while (it.count > 0) {
                            const added = addItem(p, it.key, 1);
                            if (!added.ok) { problem = added.reason; break; }
                            it.count -= 1;
                            const prev = taken.find(t => t.key === it.key);
                            if (prev) prev.count += 1; else taken.push({ key: it.key, count: 1 });
                        }
                    });
                    cache.items = cache.items.filter(it => it.count > 0);
                    const names = taken.map(t => `${t.count > 1 ? t.count + '× ' : ''}${(itemDatabase[t.key] || {}).name || t.key}`);
                    message = names.length ? `Eltetted: ${names.join(', ')}.` : '';
                    if (problem) message += (message ? ' ' : '') + CAPACITY_MESSAGES[problem] + ' A többi itt marad.';
                    if (!taken.length && !charged) return { save: false, error: CAPACITY_MESSAGES[problem] || 'Nem sikerült elvenni.' };
                }
                emptied = cache.items.length === 0;
                return { message, payload: { buildingId, buildingName: building.name, cache: publicCache(cache, username) } };
            }));
            // A változás csak akkor kerül az épületre, ha a játékos oldala is mentődött
            if (r && r.result && r.result.save !== false && !r.result.error) {
                await setBuildingCache(buildingId, emptied ? null : cache);
            }
            return r;
        }).then(r => {
            if (!r) return;
            if (r.result.error) {
                io.to(socket.id).emit('cache_result', { success: false, message: r.result.error, ...(r.result.payload || {}) });
                return;
            }
            sendPlayerState(username, r.p);
            io.to(socket.id).emit('cache_result', { success: true, message: r.result.message, ...(r.result.payload || {}) });
            if (emptied) io.emit('building_looted_update', { id: buildingId, looted: true, lockedUntil, cacheUntil: 0 });
        }).catch(logError("Hiba az otthagyott zsákmány kezelésekor:"));
    }
    socket.on('cache_open', (data) => handleCache(data, 'open'));
    socket.on('cache_take', (data) => handleCache(data, 'take'));

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
            const caches = {};
            const locks = await activeLocks(ids, now, caches);
            socket.emit('building_status', { locks, caches });
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
            const caches = {};
            const locks = await activeLocks(ids, Date.now(), caches);
            socket.emit('area_data', { cells: out, locks, caches, failed: failed.concat(far) });
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
        let cacheNotice = null; // győzelem után: a térképen 📦 jelzi az otthagyható zsákmányt

        withPlayer(username, aliveOnly(async (p) => {
            const combat = p.combat;
            if (!combat) return { save: false, error: 'Nem harcolsz.' };

            let step;
            if (data.action === 'attack') step = Combat.attack(p, combat, itemDatabase, Math.random, data.slot || 'weapon');
            else if (data.action === 'heal') step = Combat.heal(p, combat, itemDatabase, data.itemKey);
            else step = Combat.flee(p, combat, itemDatabase);
            if (step.error) return { save: false, error: step.error };

            // Lövés után visszaszedett hüvely / nyílvessző (ha elfér)
            if (step.recovered && addItem(p, step.recovered, 1).ok) {
                step.events[0].recovered = (itemDatabase[step.recovered] || {}).name || step.recovered;
                if (step.recovered === 'empty_casing') step.events[0].casing = true;
            }

            // Kopás: a használt fegyver támadásonként 1-et, a védőfelszerelés és a táska minden kapott találatnál 1-et
            const wearNotices = [];
            if (data.action === 'attack') {
                const usedSlot = data.slot || 'weapon';
                if (p.equipment[usedSlot]) wearNotices.push(wearEquipment(p, usedSlot, 1));
            }
            step.events.filter(ev => ev.actor === 'enemy' && ev.type === 'hit' && ev.amount > 0)
                .forEach(() => wearNotices.push(...wearGearOnHit(p)));
            wearNotices.filter(Boolean).forEach(text => step.events.push({ actor: 'system', type: 'notice', text }));

            const payload = { events: step.events, outcome: step.outcome || null, enemy: combat.enemy, buildingId: combat.buildingId };
            const building = { id: combat.buildingId, name: combat.buildingName, type: combat.buildingType };

            if (step.outcome === 'won') {
                p.combat = null;
                bumpStat(p, 'combatsWon');
                bumpStat(p, 'killsTotal');
                markTutorial(p, 'combat');
                questEvent(p, username, 'win', null, qFlags());
                try { // a győzelem után átkutatott épület is számít
                    const b = await getBuilding(combat.buildingId);
                    if (b) questEvent(p, username, 'loot', { lat: b.lat, lng: b.lng, type: b.type }, qFlags());
                } catch (e) { /* nem baj, ha nincs meg */ }
                const enemyKey = (combat.enemy && (combat.enemy.key || combat.enemy.name)) || 'ismeretlen';
                p.stats.kills[enemyKey] = (p.stats.kills[enemyKey] || 0) + 1;
                addFatigue(p, config.FATIGUE_COMBAT + config.FATIGUE_LOOT);
                const reward = Combat.rewards(combat);
                const cfx = skillFx(p);
                if (cfx.combatMoney) reward.money = Math.round(reward.money * (1 + cfx.combatMoney)); // Hadizsákmány
                if (cfx.winHeal) p.hp = Math.min(playerStats(p).maxHp, p.hp + playerStats(p).maxHp * cfx.winHeal); // Harci láz
                p.money += reward.money;
                const levels = grantXp(p, reward.xp);
                const messages = [`Legyőzted: ${combat.enemy.name}! +${reward.xp} XP, +${reward.money} pénz.`];
                // Győzelem után átkutatod az épületet (kisebb eséllyel üres); az ellenfélnél lévő tárgy is a zsákmányba kerül.
                // Minden a Zsákmány ablakba megy, amit nem teszel el, az LOOT_CACHE_MINUTES percig az épületben marad.
                const pick = useLockpick(p);
                const found = rollBuildingLoot(building, config.COMBAT_WIN_EMPTY_FACTOR * pick.factor, skillFx(p));
                if (pick.broke) messages.push(`Eltört: ${itemDatabase.lockpick.name}.`);
                if (reward.drop) {
                    found.unshift({ key: reward.drop, count: 1 });
                    messages.push(`Nála volt: ${itemDatabase[reward.drop].name}.`);
                }
                let cache = null;
                if (found.length === 0) messages.push('Az épületben nem találtál semmit.');
                else {
                    cache = { owner: username, items: found, until: Date.now() + config.LOOT_CACHE_MINUTES * 60000, visitors: [] };
                    await setBuildingCache(combat.buildingId, cache);
                    cacheNotice = { id: combat.buildingId, lockedUntil: combat.lockedUntil, cacheUntil: cache.until };
                }
                Object.assign(payload, { items: found, xp: reward.xp, money: reward.money, buildingName: combat.buildingName, cache: cache ? publicCache(cache, username) : null });
                return { leveledUp: levels > 0, message: messages.join(' '), payload };
            }

            if (step.outcome === 'fled') {
                // Nincs loot; az épület csak NEKED zárul FLEE_LOCK_MINUTES percre, másoknak feloldjuk
                p.combat = null;
                addFatigue(p, config.FATIGUE_COMBAT);
                markTutorial(p, 'combat');
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
            if (cacheNotice) io.emit('building_looted_update', { id: cacheNotice.id, looted: true, lockedUntil: cacheNotice.lockedUntil, cacheUntil: cacheNotice.cacheUntil });
            if (release && await releaseBuildingLock(release.id, username, release.lockedUntil)) {
                io.emit('building_looted_update', { id: release.id, looted: false, lockedUntil: 0 });
            }
        }).catch(logError("Hiba a harc során:"));
    });

    // ===== ELSŐ LÉPÉSEK (v0.1.11) =====
    socket.on('tutorial_intro_seen', () => {
        withPlayer(username, (p) => {
            if (p.tutorial.introSeen) return { save: false };
            p.tutorial.introSeen = true;
            return {};
        }).then(reply('tutorial_result')).catch(logError('Hiba a bevezetőnél:'));
    });
    // A végső jutalom átvétele: csak ha minden lépés kész, és minden elfér a hátizsákban
    socket.on('tutorial_claim', () => {
        withPlayer(username, freeOnly((p) => {
            if (p.tutorial.finalClaimed) return { save: false, error: 'Ezt a jutalmat már átvetted.' };
            if (!SurvivalTutorial.allDone(p.tutorial)) return { save: false, error: 'Előbb teljesítsd az összes lépést!' };
            const trial = JSON.parse(JSON.stringify(p));
            for (const r of SurvivalTutorial.FINAL_REWARD) {
                const res = addItem(trial, r.key, r.count);
                if (!res.ok) return { save: false, error: `${CAPACITY_MESSAGES[res.reason]} Csinálj helyet a jutalomnak!` };
            }
            SurvivalTutorial.FINAL_REWARD.forEach(r => addItem(p, r.key, r.count));
            const levels = grantXp(p, SurvivalTutorial.FINAL_XP);
            p.tutorial.finalClaimed = true;
            return { leveledUp: levels > 0, message: `Teljesítetted az Első lépéseket! Megkaptad a túlélőcsomagot és +${SurvivalTutorial.FINAL_XP} XP-t. Sok szerencsét a Zónában!` };
        })).then(reply('tutorial_result')).catch(logError('Hiba a bevezető jutalmánál:'));
    });

    // ===== NAPI BÓNUSZ (v0.1.11) =====
    // ----- Képességfa (v0.1.20) -----
    const crystalsOn = () => !!(premiumHooks && premiumHooks.enabledFor(socket.data.role));
    socket.on('skills_info', () => {
        withPlayer(username, (p) => ({ save: false, payload: { price: SurvivalSkills.respecPrice(p.skills, p.level, Admin.skillPrices()), crystals: crystalsOn() } }))
            .then(r => { if (r) io.to(socket.id).emit('skills_info', r.result.payload); }).catch(logError('Hiba a képességek lekérésekor:'));
    });
    socket.on('skill_learn', (data) => {
        const key = data && typeof data.key === 'string' ? data.key : '';
        withPlayer(username, freeOnly((p) => {
            p.skills = SurvivalSkills.normalize(p.skills);
            const r = SurvivalSkills.learn(p.skills, p.level, key);
            if (r.error) return { save: false, error: r.error };
            Admin.logEvent('skill_learn', username, { key, name: r.skill.name, branch: r.skill.branch, rank: r.rank, level: p.level });
            return { message: `${r.skill.name}: ${r.rank}. rang`, payload: { key, rank: r.rank } };
        })).then(reply('skill_result')).catch(logError('Hiba a képesség tanulásakor:'));
    });
    // Újraosztás: pay = 'free' (az első) | 'money' | 'crystal'
    socket.on('skill_respec', (data) => { skillRespec(data).catch(logError('Hiba a képességek újraosztásakor:')); });
    async function skillRespec(data) {
        const pay = data && ['free', 'money', 'crystal'].includes(data.pay) ? data.pay : '';
        const fail = (message) => io.to(socket.id).emit('skill_result', { success: false, message });
        if (!pay) return fail('Válaszd ki, hogyan fizetsz.');
        let price = 0;
        if (pay === 'crystal') {
            if (!crystalsOn()) return fail('A kristályos fizetés még nem elérhető.');
            const pre = await withPlayer(username, freeOnly((p) => {
                if (!SurvivalSkills.spent(p.skills)) return { save: false, error: 'Még nincs elosztott pontod.' };
                return { save: false, price: SurvivalSkills.respecPrice(p.skills, p.level, Admin.skillPrices()).crystals };
            }));
            if (!pre || pre.result.error) return reply('skill_result')(pre);
            price = pre.result.price;
            const paid = await premiumHooks.spendCredits(username, price, 'Képességek újraosztása');
            if (!paid || paid.error) return fail((paid && paid.error) || 'Nem sikerült a fizetés.');
        }
        const r = await withPlayer(username, freeOnly((p) => {
            p.skills = SurvivalSkills.normalize(p.skills);
            const spentPts = SurvivalSkills.spent(p.skills);
            if (!spentPts) return { save: false, error: 'Még nincs elosztott pontod.' };
            const pr = SurvivalSkills.respecPrice(p.skills, p.level, Admin.skillPrices());
            if (pay === 'free' && !pr.free) return { save: false, error: 'Az ingyenes újraosztást már felhasználtad.' };
            if (pay === 'money') {
                if (p.money < pr.money) return { save: false, error: `Ehhez ${pr.money} $ kell, neked ${Math.floor(p.money)} $ van.` };
                p.money -= pr.money;
                price = pr.money;
            }
            const before = p.skills.ranks;
            p.skills = { ranks: {}, freeUsed: p.skills.freeUsed || pay === 'free', respecs: p.skills.respecs + 1 };
            p.hp = Math.min(p.hp, playerStats(p).maxHp);
            Admin.logEvent('skill_respec', username, { pay, price, level: p.level, points: spentPts, before });
            return { message: `Képességek visszaállítva: ${spentPts} pont újra szabad.${pay === 'free' ? ' (ingyenes)' : ''}` };
        }));
        // ha a kristályt már levontuk, de a visszaállítás nem sikerült (pl. közben harcba kerültél), visszaadjuk
        if (pay === 'crystal' && (!r || r.result.error)) await premiumHooks.grantCredits(username, price, 'Visszatérítés: sikertelen újraosztás');
        reply('skill_result')(r);
        if (r && !r.result.error) io.to(socket.id).emit('skills_info', { price: SurvivalSkills.respecPrice(r.p.skills, r.p.level, Admin.skillPrices()), crystals: crystalsOn() });
   }

    // ----- Ranglista (v0.1.20) -----
    socket.on('leaderboard', (data) => {
        const board = data && SurvivalSeason.BOARDS.some(b => b.key === data.board) ? data.board : 'xp';
        (async () => {
            const now = Date.now(), month = SurvivalSeason.monthKey(now);
            const ranked = rankBoard(await leaderboardRows(month), board);
            const meIdx = ranked.findIndex(r => r.name === username);
            const pick = (r, i) => ({ rank: i + 1, name: r.name, value: SurvivalSeason.valueOf(r, board), level: r.level, frame: r.frame, title: r.title, early: r.early });
            io.to(socket.id).emit('leaderboard', {
                board, month, monthName: SurvivalSeason.monthName(month), rewarded: SurvivalSeason.rewarded(month), msLeft: SurvivalSeason.msLeft(now),
                total: ranked.length, top: ranked.slice(0, 50).map(pick),
                me: meIdx >= 0 ? pick(ranked[meIdx], meIdx) : null, staff: Admin.isStaffName(username)
            });
        })().catch(logError('Hiba a ranglistánál:'));
    });

    // ----- Napi és heti küldetések (v0.1.20) -----
    socket.on('quest_reroll', (data) => {
        const index = data && Number.isInteger(data.index) ? data.index : -1;
        withPlayer(username, (p) => {
            const q = questsFresh(p, username, qFlags());
            const r = SurvivalQuests.reroll(q, index, username, p.level, qFlags());
            if (r.error) return { save: false, error: r.error };
            Admin.logEvent('quest_reroll', username, { index, to: r.quest.kind });
            return { message: `Új küldetés: ${SurvivalQuests.describe(r.quest).title}` };
        }).then(reply('quest_result')).catch(logError('Hiba a küldetéscserénél:'));
    });
    // Új területre lépve: melyik településen / városrészben jár (a heti "járj N településen" küldetéshez)
    let townBusy = false;
    function townCheck(here) {
        if (townBusy) return;
        townBusy = true;
        (async () => {
            const places = await treesNear(here.lat, here.lng);
            let best = null, bestD = Infinity;
            places.forEach(t => { const d = SurvivalQuests.dist(here, t); if (d < bestD) { bestD = d; best = t; } });
            if (!best || bestD > 4000) return;
            const r = await withPlayer(username, aliveOnly((p) => { questEvent(p, username, 'town', { name: best.name }, qFlags()); return {}; }));
            if (r && r.p) sendPlayerState(username, r.p);
        })().catch(logError('Hiba a település keresésekor:')).finally(() => { townBusy = false; });
    }

    socket.on('daily_claim', () => {
        withPlayer(username, freeOnly((p) => {
            const st = SurvivalDaily.status(p.daily, Date.now());
            if (!st.available) return { save: false, error: 'A mai bónuszt már átvetted. Holnap jön a következő!' };
            const reward = SurvivalDaily.REWARDS[st.day - 1];
            const trial = JSON.parse(JSON.stringify(p));
            for (const r of reward.items) {
                const res = addItem(trial, r.key, r.count);
                if (!res.ok) return { save: false, error: `${CAPACITY_MESSAGES[res.reason]} Csinálj helyet a napi bónusznak!` };
            }
            reward.items.forEach(r => addItem(p, r.key, r.count));
            if (reward.money) p.money += reward.money;
            const levels = grantXp(p, reward.xp);
            p.daily = { lastDay: st.today, streak: st.day };
            const names = reward.items.map(r => `${r.count > 1 ? r.count + ' ' : ''}${itemDatabase[r.key].name}`).join(', ');
            return { leveledUp: levels > 0, message: `Napi bónusz (${st.day}. nap): ${names}, +${reward.xp} XP${reward.money ? `, +${reward.money} pénz` : ''}.`, payload: { day: st.day } };
        })).then(reply('daily_result')).catch(logError('Hiba a napi bónusznál:'));
    });

    // Lámpa feltöltése kézzel: elem / olaj, vagy powerbank (v0.1.19)
    socket.on('refuel_light', (data) => {
        const index = Math.floor(num(data && data.index, -1));
        const how = data && data.with === 'power_bank' ? 'power_bank' : 'fuel';
        withPlayer(username, freeOnly((p) => {
            const r = refuelLight(p, index, how);
            if (r.error) return { save: false, error: r.error };
            return { message: r.message };
        })).then(reply('refuel_result')).catch(logError('Hiba a lámpa feltöltésénél:'));
    });

    // ===== ADVENTI NAPTÁR – FAGYOS CSEND (v0.1.18) =====
    // Dec. 1–24. naponta egy ablak; kihagyott ablak naponta egy pótolható dec. 26-ig. A szerver dönti el, mi nyitható.
    // ADVENT_TEST=on: a stáb előre kipróbálhatja (minden ablak nyitható); ezek a nyitások az igazi kezdéskor törlődnek.
    const adventTest = () => process.env.ADVENT_TEST === 'on' && !!socket.data.role;
    socket.emit('advent_config', { test: adventTest() });
    socket.on('advent_open', (data) => {
        const day = Math.floor(num(data && data.day, 0));
        const test = adventTest();
        withPlayer(username, freeOnly((p) => {
            const now = Date.now();
            let adv = p.advent || { opened: [], catchupDay: null, test: false };
            if (adv.test && !test) adv = { opened: [], catchupDay: null, test: false }; // tesztnyitások nem számítanak
            const chk = SurvivalAdvent.canOpen(adv, day, now, { test });
            if (!chk.ok) return { save: false, error: chk.reason };
            const reward = SurvivalAdvent.DAYS[day - 1];
            // Ami nem fér el nálad (hely vagy súly), az a menedéked raktárába kerül. Ha az sincs / tele van, az ablak zárva marad,
            // de nem vész el: helyet csinálva ma kinyithatod, később pedig pótolhatod.
            const place = (target) => {
                const toStash = [];
                for (const r of reward.items) if (!addItem(target, r.key, r.count).ok) toStash.push(r);
                if (!toStash.length) return { ok: true, toStash };
                if (!target.shelter) return { ok: false, toStash };
                const box = { inventory: target.shelter.stash };
                toStash.forEach(r => pushItem(box, r.key, r.count));
                return { ok: target.shelter.stash.length <= SurvivalShelter.stashSlots(target.shelter), toStash };
            };
            const trial = JSON.parse(JSON.stringify(p));
            const test1 = place(trial);
            if (!test1.ok) return { save: false, error: p.shelter
                ? 'Nincs nálad elég hely (vagy túl nehéz lenne), és a menedéked raktára is tele van. Csinálj helyet, és nyisd ki újra – az ablak nem vész el!'
                : 'Nincs nálad elég hely, vagy túl nehéz lenne. Csinálj helyet, és nyisd ki újra – az ablak nem vész el!' };
            const placed = place(p);
            if (reward.money) p.money += reward.money;
            const levels = grantXp(p, reward.xp);
            p.advent = { opened: [...adv.opened, day].sort((x, y) => x - y), catchupDay: chk.catchup ? SurvivalAdvent.dayKey(now) : adv.catchupDay, test: test || adv.test };
            if (!chk.catchup) questEvent(p, username, 'advent', null, qFlags()); // napi küldetés: a mai ablak
            const names = reward.items.map(r => `${r.count > 1 ? r.count + ' ' : ''}${itemDatabase[r.key].name}`).join(', ');
            const stashNote = placed.toStash.length ? ` (Nem fért el nálad, a menedéked raktárába került: ${placed.toStash.map(r => itemDatabase[r.key].name).join(', ')}.)` : '';
            const cos = reward.cosmetic && SurvivalShop.BY_KEY[reward.cosmetic];
            return { leveledUp: levels > 0, message: `Adventi naptár, ${day}. ablak${chk.catchup ? ' (pótlás)' : ''}: ${names}${reward.money ? `, +${reward.money} pénz` : ''}, +${reward.xp} XP${cos ? `, és a(z) „${cos.name}” ${cos.kind === 'frame' ? 'keret' : 'cím'}` : ''}!${stashNote}`,
                payload: { day, items: reward.items, xp: reward.xp, money: reward.money || 0, cosmetic: reward.cosmetic || null, toStash: placed.toStash.map(r => r.key) } };
        })).then(async (r) => {
            if (r && !r.result.error && r.result.payload && r.result.payload.cosmetic && premiumHooks && premiumHooks.grantCosmetic) {
                await premiumHooks.grantCosmetic(username, r.result.payload.cosmetic).catch(logError('Hiba az adventi kinézetnél:'));
            }
            reply('advent_result')(r);
        }).catch(logError('Hiba az adventi naptárnál:'));
    });

    // ===== FAGYOS CSEND: KARÁCSONYFÁK, DÍSZEK, SZERENCSEKERÉK (v0.1.19) =====
    // ADVENT_TEST=on mellett a stáb előre kipróbálhatja (a fák és a kerék is működik).
    function winterTest() { return adventTest(); }
    const winterOn = () => SurvivalWinter.active(Date.now(), winterTest());
    const qFlags = () => questFlags(Date.now(), winterTest()); // a küldetésekhez (v0.1.20)
    const freshPos = () => { const e = activePlayers[username]; return e && e.lat !== null && e.positionAt && Date.now() - e.positionAt <= config.POSITION_MAX_AGE_SECONDS * 1000 ? e : null; };
    socket.emit('winter_config', { active: winterOn(), test: winterTest() });

    socket.on('trees_near', async () => {
        if (!winterOn()) return socket.emit('trees_data', { active: false, trees: [] });
        const e = freshPos();
        if (!e) return;
        try { socket.emit('trees_data', { active: true, trees: (await treesNear(e.lat, e.lng)).map(t => treePublic(t, username)) }); }
        catch (err) { logError('Hiba a fák betöltésekor:')(err); }
    });
    socket.on('tree_info', async (data) => {
        const id = data && typeof data.treeId === 'string' ? data.treeId : '';
        const t = id && await TreeModel.findById(id).lean();
        if (t) socket.emit('tree_info', treePublic(t, username));
    });
    socket.on('tree_top', async () => {
        const all = await TreeModel.find({ points: { $gt: 0 } }).lean();
        socket.emit('tree_top', all.sort((a, b) => b.points - a.points).slice(0, 10).map(t => ({ id: t._id, name: t.name, points: t.points, hung: t.hung || 0, stage: SurvivalWinter.stageOf(t.points, t.place) })));
    });

    // Díszek felakasztása: a fa 60 m-es körzetében; pontot ad a fának, pörgetést neked
    socket.on('tree_hang', async (data) => {
        const id = data && typeof data.treeId === 'string' ? data.treeId : '';
        const key = data && typeof data.key === 'string' ? data.key : '';
        const count = Math.max(1, Math.min(50, Math.floor(num(data && data.count, 1))));
        const fail = (message) => io.to(socket.id).emit('tree_result', { success: false, message });
        if (!winterOn()) return fail('A karácsonyfák december 6-tól állnak.');
        const def = itemDatabase[key];
        if (!def || !def.ornament) return fail('Ez nem karácsonyfadísz.');
        const tree = id && await TreeModel.findById(id).lean();
        if (!tree) return fail('Nincs ilyen fa.');
        const e = freshPos();
        if (!e) return fail('Várd meg a friss GPS pozíciót!');
        const dist = SurvivalBuildings.distanceToBuilding(e, tree);
        if (dist > SurvivalWinter.RANGE_METERS + 15) return fail(`Ehhez a fánál kell lenned! (${Math.round(dist)} m)`);
        const pts = def.ornament.points * count;
        const r = await withPlayer(username, freeOnly((p) => {
            if (!removeItem(p, key, count)) return { save: false, error: `Nincs nálad ennyi: ${def.name}.` };
            p.winter = { ...(p.winter || {}), bank: num(p.winter && p.winter.bank, 0) + count, hung: num(p.winter && p.winter.hung, 0) + count };
            questEvent(p, username, 'tree', { lat: tree.lat, lng: tree.lng, count }, qFlags());
            return { message: `Felakasztottad: ${count > 1 ? count + ' ' : ''}${def.name} (+${pts} pont a(z) ${tree.name} fájának, +${count} pörgetés).`, payload: { treeId: id, key, count, points: pts } };
        }));
        if (!r || r.result.error) return reply('tree_result')(r);
        await TreeModel.updateOne({ _id: id }, { $inc: { points: pts, hung: count, [`ornaments.${key}`]: count, [`contributors.${username}`]: pts }, $set: { updatedAt: Date.now() } });
        Admin.logEvent('tree_hang', username, { tree: id, name: tree.name, key, count, points: pts });
        reply('tree_result')(r);
        const t2 = await TreeModel.findById(id).lean();
        if (t2) {
            const st = treePublic(t2, username);
            socket.emit('tree_info', st);
            if (st.stage > SurvivalWinter.stageOf(tree.points || 0, tree.place)) io.emit('server_notice', { text: `🎄 ${tree.name} fája ${st.stage === 2 ? 'teljesen fel van díszítve!' : 'már félig fel van díszítve!'} Köszönjük, túlélők!` });
        }
    });

    // ----- Hétvégi ajándékvadászat -----
    const giftsOn = () => SurvivalGifts.active(Date.now(), winterTest());
    socket.on('gifts_near', async () => {
        if (!giftsOn()) return socket.emit('gifts_data', { active: false, gifts: [] });
        const e = freshPos();
        if (!e) return;
        const now = Date.now();
        giftsCleanup(now);
        const here = { lat: e.lat, lng: e.lng };
        const near = () => [...gifts.values()].filter(g => distanceMeters(here, g) <= SurvivalGifts.NEAR_METERS);
        let mine = near().filter(g => !g.openedBy.includes(username));
        if (mine.length < SurvivalGifts.PER_PLAYER && gifts.size < 5000) {
            try {
                const pts = (await streetPointsAround(e.lat, e.lng)).filter(pt => { const d = distanceMeters(here, { lat: pt[0], lng: pt[1] }); return d >= SurvivalGifts.MIN_SPAWN_METERS && d <= SurvivalGifts.NEAR_METERS - 30; });
                for (let i = mine.length; i < SurvivalGifts.PER_PLAYER && pts.length; i++) {
                    const pt = pts[Math.floor(Math.random() * pts.length)];
                    const g = { id: 'g' + (++giftSeq) + '_' + Math.floor(Math.random() * 1e6).toString(36), lat: pt[0], lng: pt[1], kind: Math.random() < SurvivalGifts.GOLD_CHANCE ? 'gold' : 'small', expiresAt: now + SurvivalGifts.LIFETIME_MIN * 60000, openedBy: [], taken: false };
                    gifts.set(g.id, g);
                }
            } catch (err) { logError('Hiba az ajándékok elhelyezésekor:')(err); }
        }
        socket.emit('gifts_data', { active: true, gifts: near().map(g => ({ id: g.id, lat: g.lat, lng: g.lng, kind: g.kind, opened: g.openedBy.includes(username), expiresAt: g.expiresAt })) });
    });
    socket.on('gift_open', async (data) => {
        const id = data && typeof data.id === 'string' ? data.id : '';
        const fail = (message, extra) => io.to(socket.id).emit('gift_result', { success: false, message, ...(extra || {}) });
        if (!giftsOn()) return fail('Az ajándékvadászat most nem zajlik (hétvégén 9 és 19 óra között).');
        const g = gifts.get(id);
        if (!g || g.expiresAt <= Date.now()) return fail('Ez a csomag már eltűnt.', { id, gone: true });
        if (g.taken) return fail('Valaki megelőzött: az arany ládát már elvitték!', { id, gone: true });
        if (g.openedBy.includes(username)) return fail('Ezt a csomagot már kinyitottad.', { id });
        const e = freshPos();
        if (!e) return fail('Várd meg a friss GPS pozíciót!');
        const dist = distanceMeters(e, g);
        if (dist > SurvivalGifts.GIFT_RANGE + 15) return fail(`Sétálj oda a csomaghoz! (${Math.round(dist)} m – menj ${SurvivalGifts.GIFT_RANGE} m-en belülre)`);
        const contents = SurvivalGifts.rollContents(g.kind, Math.random);
        const r = await withPlayer(username, aliveOnly((p) => {
            const today = SurvivalGifts.dayKey(Date.now());
            const st = p.gifts && p.gifts.day === today ? p.gifts : { day: today, opened: 0 };
            if (st.opened >= SurvivalGifts.DAILY_MAX) return { save: false, error: `Ma már ${SurvivalGifts.DAILY_MAX} csomagot kinyitottál. Holnap folytathatod!` };
            if (g.taken || g.openedBy.includes(username)) return { save: false, error: 'Valaki megelőzött!' };
            const got = [];
            contents.forEach(c => {
                if (c.money) { p.money += c.money; got.push(`${c.money} $`); }
                if (c.xp) { grantXp(p, c.xp); got.push(`${c.xp} XP`); }
                (c.items || []).forEach(it => {
                    if (!addItem(p, it.key, it.count).ok) {
                        if (p.shelter && p.shelter.stash.length < SurvivalShelter.stashSlots(p.shelter)) pushItem({ inventory: p.shelter.stash }, it.key, it.count);
                        else { p.money += 25; got.push('(+25 $, mert nem fért el)'); return; }
                    }
                    got.push(`${it.count > 1 ? it.count + ' ' : ''}${itemDatabase[it.key].name}`);
                });
            });
            p.gifts = { day: today, opened: st.opened + 1 };
            questEvent(p, username, 'gift', null, qFlags());
            g.openedBy.push(username);
            if (g.kind === 'gold') g.taken = true;
            return { message: `${g.kind === 'gold' ? '🏆 ARANY LÁDA' : '🎁 Ajándékcsomag'}: ${got.join(', ')}!`, payload: { id, kind: g.kind, contents } };
        }));
        if (r && !r.result.error) Admin.logEvent('gift_open', username, { kind: g.kind });
        reply('gift_result')(r);
    });

    // Szerencsekerék: a nyereményt itt sorsoljuk; a kliens ide pörög
    socket.on('wheel_spin', async () => {
        const fail = (message) => io.to(socket.id).emit('wheel_result', { success: false, message });
        if (!winterOn()) return fail('A szerencsekerék december 6-tól pörög.');
        const prizeKey = SurvivalWheel.roll(Math.random);
        const prize = SurvivalWheel.BY_KEY[prizeKey];
        const r = await withPlayer(username, aliveOnly((p) => {
            const st = SurvivalWinter.spinStatus(p.winter, Date.now(), SurvivalWheel.DAILY_MAX);
            if (st.available <= 0) return { save: false, error: st.capReached ? `Ma már ${SurvivalWheel.DAILY_MAX}-szer pörgettél. Holnap folytathatod!` : 'Nincs pörgetésed. Akassz fel egy díszt egy karácsonyfára, és jár egy pörgetés!' };
            const w = { ...(p.winter || {}) };
            if (w.day !== st.today) { w.day = st.today; w.used = 0; }
            w.used = (w.used || 0) + 1;
            if (st.free) w.freeDay = st.today; else w.bank = Math.max(0, (w.bank || 0) - 1);
            p.winter = w;
            let note = '';
            if (prize.kind === 'item') {
                if (!addItem(p, prize.item, prize.count).ok) {
                    if (p.shelter && p.shelter.stash.length < SurvivalShelter.stashSlots(p.shelter)) { pushItem({ inventory: p.shelter.stash }, prize.item, prize.count); note = ' (nem fért el nálad, a menedéked raktárába került)'; }
                    else { p.money += 50; note = ' (nem fért el, helyette +50 $)'; }
                }
            } else if (prize.kind === 'xp') { grantXp(p, prize.amount); }
            else if (prize.kind === 'money') { p.money += prize.amount; }
            questEvent(p, username, 'spin', null, qFlags());
            return { message: `Szerencsekerék: ${prize.label}${note}!`, payload: { prize: prizeKey, note } };
        }));
        if (!r || r.result.error) return reply('wheel_result')(r);
        let dup = false;
        try {
            if (prize.kind === 'cosmetic' && premiumHooks) {
                const g = await premiumHooks.grantCosmetic(username, prize.cosmetic);
                if (g && g.dup) { dup = true; const d2 = await withPlayer(username, (p) => { p.money += SurvivalWheel.DUP_MONEY; return {}; }); if (d2 && d2.p) r.p = d2.p; }
            } else if (prize.kind === 'paint' && premiumHooks) await premiumHooks.grantKey(username, prize.paint, 'Szerencsekerék');
            else if (prize.kind === 'credits' && premiumHooks) {
                await premiumHooks.grantCredits(username, prize.amount, 'Ajándék (szerencsekerék jackpot)');
                io.emit('server_notice', { text: `💎 ${username} megütötte a JACKPOTOT a szerencsekeréken: ${prize.amount} kristály!`, big: true });
            }
        } catch (err) { logError('Hiba a kerék nyereményénél:')(err); }
        Admin.logEvent('wheel_spin', username, { prize: prizeKey, credits: prize.kind === 'credits' ? prize.amount : 0, dup });
        if (dup) r.result.payload.dup = SurvivalWheel.DUP_MONEY;
        reply('wheel_result')(r);
    });

    // ===================== MENEDÉK (v0.1.12) =====================
    // Elfoglalás: egy valódi épület a közelben. Költözni hetente egyszer lehet; a raktár és az építmények költöznek.
    socket.on('shelter_claim', (data) => {
        if (!data || !SurvivalBuildings.parseBuildingId(data.buildingId)) return;
        const buildingId = data.buildingId;
        withPlayer(username, freeOnly(async (p) => {
            const now = Date.now();
            if (p.shelter && p.shelter.buildingId === buildingId) return { save: false, error: 'Ez már a menedéked.' };
            if (p.shelter) {
                const nextMove = p.shelter.claimedAt + SurvivalShelter.MOVE_COOLDOWN_DAYS * 86400000;
                if (now < nextMove) {
                    const days = Math.ceil((nextMove - now) / 86400000);
                    return { save: false, error: `Csak hetente egyszer költözhetsz. Legközelebb ${days} nap múlva.` };
                }
                if (p.shelter.build && p.shelter.build.until > now) return { save: false, error: 'Építkezés közben nem költözhetsz.' };
            }
            for (const [owner, row] of shelterIndex) {
                if (owner !== username && row.buildingId === buildingId) return { save: false, error: 'Ezt az épületet már más választotta menedéknek.' };
            }
            const entry = activePlayers[username];
            if (!entry || entry.lat === null || !entry.positionAt || now - entry.positionAt > config.POSITION_MAX_AGE_SECONDS * 1000) {
                return { save: false, error: 'Várd meg a friss GPS pozíciót!' };
            }
            let building;
            try { building = await getBuilding(buildingId); }
            catch (err) { return { save: false, error: err.code === 'NOT_FOUND' ? 'Ez az épület nem található.' : 'Nem sikerült azonosítani az épületet. Próbáld újra később!' }; }
            const distance = SurvivalBuildings.distanceToBuilding(entry, building);
            if (distance > SurvivalShelter.RANGE_METERS) return { save: false, error: `Menj közelebb az épülethez! (${Math.round(distance)} m)` };
            // Az elfoglaláshoz kell egy Menedékalapító Csomag (elfogy)
            if (countItem(p, SurvivalShelter.CLAIM_ITEM) < 1) return { save: false, error: `Ehhez kell egy ${itemDatabase[SurvivalShelter.CLAIM_ITEM].name} a hátizsákodban.` };
            removeItem(p, SurvivalShelter.CLAIM_ITEM, 1);
            const moving = !!p.shelter;
            const old = p.shelter || { levels: {}, stash: [], build: null };
            p.shelter = normalizeShelter({ ...old, buildingId, name: building.name,
                lat: building.lat, lng: building.lng, bounds: building.bounds, claimedAt: now });
            updateShelterIndex(username, p.shelter);
            return { message: moving ? `Átköltöztél: ${building.name}. A raktárad és az építményeid veled jöttek.` : `Mostantól ez a menedéked: ${building.name}.`, payload: { shelter: true } };
        })).then(reply('shelter_result')).catch(logError('Hiba a menedék elfoglalásakor:'));
    });

    // Betevés a raktárba: a leltár egy helyéről (stackelhetőnél count darab, alapból mind)
    socket.on('shelter_deposit', (data) => {
        if (!data || !Number.isInteger(data.index)) return;
        withPlayer(username, freeOnly((p) => {
            const at = atShelter(activePlayers[username], p.shelter);
            if (at.error) return { save: false, error: at.error };
            const slot = p.inventory[data.index];
            if (!slot) return { save: false, error: 'Ez a tárgy már nincs nálad.' };
            const count = Number.isInteger(data.count) && data.count > 0 ? Math.min(data.count, slot.count) : slot.count;
            const stash = p.shelter.stash;
            const name = itemDatabase[slot.key] ? itemDatabase[slot.key].name : slot.key;
            if (isStackable(slot.key)) {
                const existing = stash.find(s => s.key === slot.key);
                if (!existing && stash.length >= SurvivalShelter.stashSlots(p.shelter)) return { save: false, error: 'Megtelt a raktár!' };
                if (existing) existing.count += count;
                else stash.push(slot.dur !== undefined ? { key: slot.key, count, dur: slot.dur } : { key: slot.key, count });
                slot.count -= count;
                if (slot.count <= 0) p.inventory.splice(data.index, 1);
            } else {
                if (stash.length >= SurvivalShelter.stashSlots(p.shelter)) return { save: false, error: 'Megtelt a raktár!' };
                stash.push({ ...slot });
                p.inventory.splice(data.index, 1);
            }
            return { message: `Raktárba tetted: ${name}${count > 1 ? ` (${count} db)` : ''}.` };
        })).then(reply('shelter_result')).catch(logError('Hiba a raktárba tételkor:'));
    });

    // Kivétel a raktárból a hátizsákba (ha elfér)
    socket.on('shelter_withdraw', (data) => {
        if (!data || !Number.isInteger(data.index)) return;
        withPlayer(username, freeOnly((p) => {
            const at = atShelter(activePlayers[username], p.shelter);
            if (at.error) return { save: false, error: at.error };
            const slot = p.shelter.stash[data.index];
            if (!slot) return { save: false, error: 'Ez a tárgy már nincs a raktárban.' };
            const count = Number.isInteger(data.count) && data.count > 0 ? Math.min(data.count, slot.count) : slot.count;
            const check = canAddItem(p, slot.key, isStackable(slot.key) ? count : 1);
            if (!check.ok) return { save: false, error: CAPACITY_MESSAGES[check.reason] };
            const name = itemDatabase[slot.key] ? itemDatabase[slot.key].name : slot.key;
            if (isStackable(slot.key)) {
                pushItem(p, slot.key, count);
                slot.count -= count;
                if (slot.count <= 0) p.shelter.stash.splice(data.index, 1);
            } else {
                p.inventory.push({ ...slot });
                p.shelter.stash.splice(data.index, 1);
            }
            return { message: `Kivetted: ${name}${count > 1 ? ` (${count} db)` : ''}.` };
        })).then(reply('shelter_result')).catch(logError('Hiba a raktárból kivételkor:'));
    });

    // Építés / fejlesztés: az alapanyag a leltárból, ha ott nincs elég, a raktárból fogy. Valódi időben készül el.
    socket.on('shelter_build', (data) => {
        if (!data || typeof data.key !== 'string' || !SurvivalShelter.STRUCTURES[data.key]) return;
        withPlayer(username, freeOnly((p) => {
            const at = atShelter(activePlayers[username], p.shelter);
            if (at.error) return { save: false, error: at.error };
            const now = Date.now();
            const blocker = SurvivalShelter.buildBlocker(p.shelter, data.key, now);
            if (blocker) return { save: false, error: blocker };
            const nextLevel = SurvivalShelter.level(p.shelter, data.key) + 1;
            const def = SurvivalShelter.STRUCTURES[data.key].levels[nextLevel];
            const itemName = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);
            for (const [key, need] of Object.entries(def.req || {})) {
                if (countItem(p, key) + stashCount(p.shelter, key) < need) return { save: false, error: `Nincs elég alapanyag: ${itemName(key)} (kellene: ${need})` };
            }
            for (const [key, need] of Object.entries(def.req || {})) {
                const fromBag = Math.min(countItem(p, key), need);
                if (fromBag > 0) removeItem(p, key, fromBag);
                if (need - fromBag > 0) takeFromStash(p.shelter, key, need - fromBag);
            }
            const minutes = def.minutes * (config.SHELTER_TIME_SCALE ?? 1);
            p.shelter.build = { key: data.key, level: nextLevel, startedAt: now, until: now + Math.round(minutes * 60000) };
            updateShelterIndex(username, p.shelter);
            return { message: `Elkezdted: ${def.name}. Kb. ${def.minutes >= 60 ? `${Math.round(def.minutes / 60)} óra` : `${def.minutes} perc`} múlva kész.` };
        })).then(reply('shelter_result')).catch(logError('Hiba az építéskor:'));
    });

    // A környék menedékei a térképre (mindenki látja őket)
    socket.on('shelters_request', (data) => {
        const entry = activePlayers[username];
        const lat = data && Number(data.lat), lng = data && Number(data.lng);
        const at = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : (entry && entry.lat !== null ? entry : null);
        if (!at) return;
        io.to(socket.id).emit('shelters_list', { shelters: sheltersAround(at.lat, at.lng, config.SHELTER_VIEW_METERS || 3000), me: username });
    });

    // --- ÚJ TÚLÉLŐ INDÍTÁSA (csak halott karakterrel) ---
    // Minden elvész: szint, XP, pénz, leltár, felszerelés. A fiók (név, jelszó, avatar) megmarad.
    socket.on('respawn', () => {
        withPlayer(username, (p) => {
            if (!p.dead) return { save: false, error: 'A karaktered még él.' };
            const keepStats = p.stats; // a statisztika életre szól, az újrakezdés nem törli
            const keepTutorial = p.tutorial; // az Első lépések a fiókhoz tartozik
            const keepDaily = p.daily;
            const keepQuests = p.quests;     // a küldetések is (a halál nem nullázza a napi haladást)
            const keepSeason = p.season;     // a szezonpont is (a ranglista a hónapot méri, nem az életet)
            const keepAdvent = p.advent;     // az adventi naptár ablakai is
            const keepWinter = p.winter;     // a téli pörgetések is
            const keepSlots = p.premiumSlots; // a megvett prémium hátizsák-hely is
            const keepShelter = p.shelter;   // a menedék és a raktára is megmarad (v0.1.12)
            Object.assign(p, newPlayerData(), { lastSeen: Date.now(), stats: keepStats, tutorial: keepTutorial, daily: keepDaily, quests: keepQuests, season: keepSeason, advent: keepAdvent, winter: keepWinter, premiumSlots: keepSlots, shelter: keepShelter, lifeStartedAt: Date.now() });
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

// ===== ADMIN (v0.1.13) =====
adminHooks = Admin.setup({
    app, io, PlayerModel, config, authToken, activePlayers, itemDatabase, bcrypt, enemies: Combat.ENEMIES,
    withPlayer, pushItem, grantXp, playerStats, sendPlayerState,
    push: {
        notifyUser: (user, msg) => (pushHooks ? pushHooks.notifyUser(user, msg) : Promise.resolve(0)),
        notifyAll: (msg) => (pushHooks ? pushHooks.notifyAll(msg) : Promise.resolve({ tried: 0, ok: 0, total: 0 })),
        stats: () => (pushHooks ? pushHooks.stats() : Promise.resolve({ subs: 0, users: 0 }))
    },
    usernameValid: (n) => USERNAME_RE.test(n),
    season: {
        close: seasonCloseIfNeeded,
        status: async () => {
            const month = SurvivalSeason.monthKey(Date.now());
            boardCache = { t: 0, month: null, rows: null };
            const top = rankBoard(await leaderboardRows(month), 'xp').slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, xp: r.xp, km: SurvivalSeason.valueOf(r, 'meters'), cells: r.cells, quests: r.quests }));
            const closed = await SeasonDoneModel.find({}).sort({ _id: -1 }).limit(12).lean();
            return { month, monthName: SurvivalSeason.monthName(month), rewarded: SurvivalSeason.rewarded(month), top, closed };
        }
    },
    onRename: async (from, to) => {
        // minden lépés külön: ha az egyik nem sikerül, a többi még lefut
        const steps = [
            () => BuildingModel.updateMany({ lastLootedBy: from }, { lastLootedBy: to }),
            () => Premium.models.OrderModel.updateMany({ user: from }, { user: to }),
            () => Premium.models.TxModel.updateMany({ user: from }, { user: to })
        ];
        for (const step of steps) { try { await step(); } catch (e) { /* folytatjuk */ } }
    },
    noTimers: !!process.env.SG_TEST
});
// Telefonos értesítések (v0.1.19). A napi emlékeztető szövege a mai naptól függ.
pushHooks = require('./push').setup({
    app, io, PlayerModel, activePlayers, SettingModel: Admin.models.SettingModel,
    reminderText: (now) => {
        const day = SurvivalAdvent.dayKey(now), md = day.slice(5);
        if (md >= '12-01' && md <= '12-24') return { title: '🎁 Kinyílt a mai adventi ablak', body: `A Fagyos Csend naptárában ma a ${Number(md.slice(3))}. ablak vár rád. Ne hagyd ki!`, url: '/' };
        if (SurvivalGifts.active(now, false)) return { title: '🎁 Ajándékvadászat a környékeden', body: 'Ma 19 óráig ajándékcsomagok rejtőznek az utcákon. Indulj el, és keresd meg őket!', url: '/' };
        return { title: '☀️ Új napi küldetések', body: 'Három új küldetés és a napi bónuszod vár. Indulj el, és fedezz fel új területeket!', url: '/' };
    }
});

premiumHooks = Premium.setup({
    app, io, PlayerModel, activePlayers, adminHooks, withPlayer, sendPlayerState,
    usernameValid: (n) => USERNAME_RE.test(n), lootMultiplier: Admin.lootMultiplier
});

// Szezonzárás: indulás után és óránként megnézi, ki kell-e osztani az előző hónap jutalmait
if (!process.env.SG_NO_TIMERS) {
    setTimeout(() => seasonCloseIfNeeded().catch(e => console.error('Szezonzárás hiba:', e.message)), 30000);
    setInterval(() => seasonCloseIfNeeded().catch(e => console.error('Szezonzárás hiba:', e.message)), 3600000);
}

server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO fut.`);
});
