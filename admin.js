// admin.js – ADMIN RENDSZER (v0.1.13)
// Az admin oldal (/admin) adatai és műveletei, az eseménynapló, a bejelentések, a hibajelentések,
// az élő játékbeállítások (eventek) és a tiltások. Admin az, akinek a neve szerepel az ADMIN_USERS
// környezeti változóban (vesszővel elválasztva) – a belépés a játék saját tokenjével történik.
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const XLSX = require('./xlsx');
const Roles = require('./public/js/roles');

const DAY = 86400000;
const TZ = 'Europe/Budapest';
const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
const hourOf = (ms) => Number(new Date(ms).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24;
const localTime = (ms) => ms ? new Date(ms).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16) : '';
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ---------------- adatmodellek ----------------
const EVENT_KEEP_DAYS = 180;
const eventSchema = new mongoose.Schema({
    t: { type: Number, index: true }, type: { type: String, index: true }, user: { type: String, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null }, at: { type: Date, expires: EVENT_KEEP_DAYS * 86400 }
});
const EventModel = mongoose.models.SurvivalEvent || mongoose.model('SurvivalEvent', eventSchema);
const metricSchema = new mongoose.Schema({ t: { type: Number, index: true }, online: Number, names: [String], at: { type: Date, expires: 400 * 86400 } });
const MetricModel = mongoose.models.SurvivalMetric || mongoose.model('SurvivalMetric', metricSchema);
const settingSchema = new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed });
const SettingModel = mongoose.models.SurvivalSetting || mongoose.model('SurvivalSetting', settingSchema);
const annSchema = new mongoose.Schema({ title: String, body: String, createdAt: Number, active: { type: Boolean, default: true }, author: String,
    publishAt: { type: Number, default: 0 }, published: { type: Boolean, default: true } }); // publishAt: időzített (éjféli) megjelenés (v0.1.36)
// a következő éjfél (magyar idő) időbélyege
function nextBudapestMidnight(now) {
    now = now || Date.now();
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
    const guess = Date.UTC(p[0], p[1] - 1, p[2] + 1);
    const off = (t) => Date.parse(new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Budapest' }).replace(' ', 'T') + 'Z') - t;
    return guess - off(guess);
}
const AnnouncementModel = mongoose.models.SurvivalAnnouncement || mongoose.model('SurvivalAnnouncement', annSchema);
const reportSchema = new mongoose.Schema({ t: Number, user: String, text: String, ua: String, status: { type: String, default: 'open' }, note: String, at: { type: Date, expires: 365 * 86400 } });
const ReportModel = mongoose.models.SurvivalReport || mongoose.model('SurvivalReport', reportSchema);
// csevegés a stábbal (v0.1.14): játékosonként egy beszélgetés
const supportSchema = new mongoose.Schema({ t: { type: Number, index: true }, user: { type: String, index: true }, from: String, staff: String, staffRole: String, text: String,
    readByStaff: { type: Boolean, default: false }, readByPlayer: { type: Boolean, default: false }, at: { type: Date, expires: 365 * 86400 } });
const SupportModel = mongoose.models.SurvivalSupport || mongoose.model('SurvivalSupport', supportSchema);

// ---------------- élő beállítások (eventek) ----------------
const DEFAULT_SETTINGS = { xpMultiplier: 1, lootMultiplier: 1, eventName: '', eventUntil: 0 };
let settings = { ...DEFAULT_SETTINGS };
function normalizeSettings(s) {
    s = s || {};
    return {
        xpMultiplier: Math.min(5, Math.max(1, num(s.xpMultiplier, 1))),
        lootMultiplier: Math.min(5, Math.max(1, num(s.lootMultiplier, 1))),
        eventName: String(s.eventName || '').slice(0, 60),
        eventUntil: Math.max(0, num(s.eventUntil, 0))
    };
}
// Lejárt event = alapértékek
function activeSettings() {
    if (settings.eventUntil && Date.now() > settings.eventUntil) return { ...DEFAULT_SETTINGS };
    return settings;
}
// Képesség-újraosztás ára (v0.1.20): nem jár le, mint az eventek
const Skills = require('./public/js/skills');
const Quests = require('./public/js/quests');
let skillPricesValue = { ...Skills.RESPEC_DEFAULTS };
function normalizeSkillPrices(v) {
    v = v || {};
    const clampN = (x, d, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(x, d))));
    return { moneyPerLevel: clampN(v.moneyPerLevel, 100, 0, 100000), crystalBase: clampN(v.crystalBase, 50, 0, 100000), crystalPerLevel: clampN(v.crystalPerLevel, 2, 0, 10000) };
}
function skillPrices() { return skillPricesValue; }
// Szolgáltatások ára (v0.1.23): csapat alapítás / címer / átnevezés / küldetéscsere, menedék költöztetése
const Prices = require('./public/js/prices');
let gamePricesValue = Prices.normalize(null);
function gamePrices() { return gamePricesValue; }
function xpMultiplier() { return activeSettings().xpMultiplier; }
function lootMultiplier() { return activeSettings().lootMultiplier; }
function publicEvent() {
    const s = activeSettings();
    if (!s.eventName && s.xpMultiplier === 1 && s.lootMultiplier === 1) return null;
    return { name: s.eventName, xp: s.xpMultiplier, loot: s.lootMultiplier, until: s.eventUntil || null };
}

// ---------------- eseménynapló ----------------
// Nem várunk rá: a játékot soha nem lassítja és nem állítja meg a naplózás hibája
function logEvent(type, user, data) {
    const t = Date.now();
    EventModel.create({ t, type, user: user || null, data: data || null, at: new Date(t) }).catch(() => { });
}
// A játékos mentésekor: mi változott (szintlépés, halál, átkutatás, barkács, győzelem)
function onPlayerSaved(username, before, p) {
    if (!before || !p) return;
    try {
        if (p.level > before.level) logEvent('level_up', username, { from: before.level, to: p.level });
        if (!before.dead && p.dead) logEvent('death', username, { level: p.level, by: before.enemy || null, building: before.building || null });
        const s = p.stats || {}, b = before.stats || {};
        if (num(s.buildingsLooted) > num(b.buildingsLooted)) logEvent('loot', username, { building: before.searchBuilding || null });
        if (num(s.itemsCrafted) > num(b.itemsCrafted)) logEvent('craft', username, { count: num(s.itemsCrafted) - num(b.itemsCrafted) });
        if (num(s.combatsWon) > num(b.combatsWon)) logEvent('combat_won', username, { enemy: before.enemy || null });
        if (before.dead && !p.dead) logEvent('respawn', username, null);
        // Fagyos Csend és napi dolgok (v0.1.18): a monitorozáshoz
        const d = p.daily || {};
        if (d.lastDay && d.lastDay !== before.dailyDay) logEvent('daily_claim', username, { day: num(d.streak), date: d.lastDay });
        const opened = (p.advent && Array.isArray(p.advent.opened)) ? p.advent.opened : [];
        if (!(p.advent && p.advent.test)) opened.filter(x => !before.adventOpened.includes(x)).forEach(day => logEvent('advent_open', username, { day, catchup: !!(p.advent.catchupDay && p.advent.catchupDay !== before.adventCatchup) }));
        const shId = p.shelter && p.shelter.buildingId;
        if (shId && shId !== before.shelterId) logEvent('shelter_claim', username, { building: p.shelter.name || null, move: !!before.shelterId });
    } catch (e) { /* a napló hibája nem állíthatja meg a mentést */ }
}
function snapshotBefore(p) {
    return {
        level: p.level, dead: !!p.dead, stats: { ...(p.stats || {}) },
        enemy: p.combat && p.combat.enemy ? p.combat.enemy.key : null,
        building: p.combat ? p.combat.buildingName : null,
        dailyDay: p.daily ? p.daily.lastDay || null : null,
        adventOpened: (p.advent && !p.advent.test && Array.isArray(p.advent.opened)) ? [...p.advent.opened] : [],
        adventCatchup: p.advent ? p.advent.catchupDay || null : null,
        shelterId: p.shelter ? p.shelter.buildingId || null : null
    };
}

// ---------------- szerverhibák gyűjtése ----------------
const errorLog = []; let errorCount = 0; const startedAt = Date.now();
const origError = console.error.bind(console);
console.error = (...args) => {
    // a könyvtárak elavulási figyelmeztetései (pl. Mongoose "Warning: ... deprecated") nem valódi hibák
    const first = String(args[0] && args[0].message ? args[0].message : args[0] || '');
    if (/Warning:|DeprecationWarning/.test(first)) return origError(...args);
    errorCount++;
    errorLog.unshift({ t: Date.now(), text: args.map(a => (a && a.stack) ? a.stack.split('\n').slice(0, 3).join(' | ') : String(a)).join(' ').slice(0, 400) });
    if (errorLog.length > 100) errorLog.length = 100;
    origError(...args);
};

// ---------------- tiltás ----------------
function banInfo(user) {
    if (!user || !user.bannedUntil || user.bannedUntil < Date.now()) return null;
    const forever = user.bannedUntil > Date.now() + 50 * 365 * DAY;
    return {
        until: user.bannedUntil, reason: user.banReason || '',
        message: `A fiókodat ${forever ? 'véglegesen' : localTime(user.bannedUntil) + '-ig'} felfüggesztettük.${user.banReason ? ' Ok: ' + user.banReason : ''} Kérdés esetén: info@survivalgo.hu`
    };
}

// ---------------- összeállítás (setup) ----------------
let ctx = null;
const adminNames = () => String(process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLocaleLowerCase('hu')).filter(Boolean);
function isAdminName(name) { return !!name && adminNames().includes(String(name).toLocaleLowerCase('hu')); }
// a felhasználó stáb rangja: az ADMIN_USERS-ben szereplő mindig tulajdonos, a többieké az adatbázisból (role mező)
function roleOf(user) {
    if (!user) return '';
    if (isAdminName(user.username)) return 'owner';
    return Roles.isStaff(user.role) && user.role !== 'owner' ? user.role : '';
}

// A stáb nevei (a nyilvános toplistákból kimaradnak). 5 percenként frissül.
let staffSet = new Set();
async function refreshStaff() {
    try {
        const users = await ctx.PlayerModel.find({}).lean();
        staffSet = new Set(users.filter(u => roleOf(u)).map(u => String(u.username)));
    } catch (e) { /* marad a régi */ }
}
function isStaffName(name) { return !!name && (staffSet.has(String(name)) || isAdminName(name)); }

function setup(c) {
    ctx = c;
    refreshStaff(); setInterval(refreshStaff, 5 * 60000);
    const { app, io, PlayerModel, config, authToken, activePlayers } = c;

    SettingModel.findById('game').lean().then(d => { if (d) settings = normalizeSettings(d.value); }).catch(() => { });
    SettingModel.findById('skills').lean().then(d => { if (d) skillPricesValue = normalizeSkillPrices(d.value); }).catch(() => { });
    SettingModel.findById('prices').lean().then(d => { if (d) gamePricesValue = Prices.normalize(d.value); }).catch(() => { });

    // 10 percenként rögzítjük, hányan vannak online (napszak-grafikonhoz, csúcsokhoz)
    const snap = () => {
        const names = Object.keys(activePlayers);
        const t = Date.now();
        MetricModel.create({ t, online: names.length, names, at: new Date(t) }).catch(() => { });
    };
    if (!c.noTimers) { setTimeout(snap, 30000); setInterval(snap, 10 * 60000); }

    // --- hitelesítés: a játék tokenje + ADMIN_USERS ---
    const needAdmin = (perm) => async (req, res, next) => {
        let payload;
        try {
            const header = req.headers.authorization || '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : String((req.query && req.query.token) || '');
            payload = authToken.verify(token, config.JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Jelentkezz be a stábhoz tartozó fiókoddal.' });
        }
        const user = payload && await PlayerModel.findOne({ username: payload.username }, { username: 1, role: 1, bannedUntil: 1 }).lean();
        const role = roleOf(user);
        if (!role || banInfo(user)) return res.status(403).json({ success: false, message: 'Ehhez a fiókhoz nincs admin jog.' });
        if (perm && !Roles.can(role, perm)) return res.status(403).json({ success: false, denied: true, message: `Ehhez a művelethez nincs jogod (${Roles.info(role).name}).` });
        req.admin = user.username; req.role = role;
        return next();
    };
    const route = (method, url, fn, perm) => app[method](url, needAdmin(perm || 'view'), async (req, res) => {
        try { await fn(req, res); } catch (e) { console.error('Admin hiba:', url, e); res.status(500).json({ success: false, message: 'Szerverhiba: ' + e.message }); }
    });
    const deny = (res, msg) => res.status(403).json({ success: false, denied: true, message: msg || 'Ehhez a művelethez nincs jogod.' });
    const audit = (req, action, target, data) => logEvent('admin', req.admin, { action, target, ...(data || {}) });

    app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

    route('get', '/api/admin/me', async (req, res) => res.json({ success: true, username: req.admin, role: req.role, roleName: Roles.info(req.role).name, perms: Roles.permsOf(req.role) }));

    // ---- áttekintés ----
    let overviewCache = null;
    route('get', '/api/admin/overview', async (req, res) => {
        if (overviewCache && Date.now() - overviewCache.t < 8000) return res.json(redact(overviewCache.data, req.role));
        const data = await buildOverview();
        overviewCache = { t: Date.now(), data };
        res.json(redact(data, req.role));
    });

    function redact(data, role) {
        if (Roles.can(role, 'server')) return data;
        return { ...data, server: { ...data.server, recentErrors: [] } };
    }
    async function allUsers() {
        return PlayerModel.find({}, { password: 0 }).lean();
    }
    const regTime = (u) => (u._id && u._id.getTimestamp ? u._id.getTimestamp().getTime() : 0);

    async function buildOverview() {
        const now = Date.now();
        const users = await allUsers();
        const since30 = now - 30 * DAY;
        const events = await EventModel.find({ t: { $gte: since30 } }, { type: 1, user: 1, t: 1, data: 1 }).lean();
        const metrics = await MetricModel.find({ t: { $gte: now - 14 * DAY } }, { t: 1, online: 1 }).lean();

        // napi regisztráció és napi aktív (30 nap)
        const days = [];
        for (let i = 29; i >= 0; i--) days.push(dayKey(now - i * DAY));
        const regs = Object.fromEntries(days.map(d => [d, 0]));
        users.forEach(u => { const k = dayKey(regTime(u)); if (k in regs) regs[k]++; });
        const activeByDay = Object.fromEntries(days.map(d => [d, new Set()]));
        events.forEach(e => { if (!e.user || e.type === 'admin') return; const k = dayKey(e.t); if (activeByDay[k]) activeByDay[k].add(e.user); });
        users.forEach(u => { const ls = u.playerData && u.playerData.lastSeen; if (ls) { const k = dayKey(ls); if (activeByDay[k]) activeByDay[k].add(u.username); } });
        const daily = days.map(d => ({ day: d, regs: regs[d], active: activeByDay[d].size }));

        // napszak: átlagos online óránként (14 nap mintavételéből)
        const hours = Array.from({ length: 24 }, () => ({ sum: 0, n: 0, max: 0 }));
        metrics.forEach(m => { const h = hours[hourOf(m.t)]; h.sum += m.online; h.n++; h.max = Math.max(h.max, m.online); });
        const byHour = hours.map((h, i) => ({ hour: i, avg: h.n ? +(h.sum / h.n).toFixed(2) : 0, max: h.max }));
        const peak = metrics.reduce((a, m) => (m.online > a.online ? m : a), { online: 0, t: 0 });

        // visszatérők: a regisztráció utáni napon (D1) és hetedik napon belül újra (D7)
        const activeDaysOf = new Map();
        events.forEach(e => { if (!e.user || e.type === 'admin') return; if (!activeDaysOf.has(e.user)) activeDaysOf.set(e.user, new Set()); activeDaysOf.get(e.user).add(dayKey(e.t)); });
        let d1Base = 0, d1Hit = 0, d7Base = 0, d7Hit = 0;
        users.forEach(u => {
            const r = regTime(u); if (!r) return;
            const set = activeDaysOf.get(u.username) || new Set();
            if (now - r > 2 * DAY) { d1Base++; if (set.has(dayKey(r + DAY))) d1Hit++; }
            if (now - r > 8 * DAY) { d7Base++; let hit = false; for (let i = 1; i <= 7; i++) if (set.has(dayKey(r + i * DAY))) hit = true; if (hit) d7Hit++; }
        });

        // Első lépések tölcsér
        const STEPS = ['loot', 'use', 'pin', 'equip', 'craft', 'combat'];
        const funnel = STEPS.map(k => ({ step: k, count: users.filter(u => u.playerData && u.playerData.tutorial && u.playerData.tutorial.done && u.playerData.tutorial.done[k]).length }));
        const playedOnce = users.filter(u => u.playerData && u.playerData.lastSeen).length;

        // gazdaság: pénz, tárgyak
        const items = {};
        let money = 0;
        users.forEach(u => {
            const p = u.playerData || {};
            money += num(p.money);
            (p.inventory || []).forEach(s => { if (s && s.key) items[s.key] = (items[s.key] || 0) + num(s.count, 1); });
            Object.values(p.equipment || {}).forEach(k => { if (k) items[k] = (items[k] || 0) + 1; });
        });
        const itemName = (k) => (ctx.itemDatabase[k] && ctx.itemDatabase[k].name) || k;
        const topItems = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ key: k, name: itemName(k), count: v }));
        const richest = users.map(u => ({ name: u.username, money: num(u.playerData && u.playerData.money) })).sort((a, b) => b.money - a.money).slice(0, 10);

        // ellenfelek: kit győztek le, ki öl
        const kills = {}, deathsBy = {};
        users.forEach(u => Object.entries((u.playerData && u.playerData.stats && u.playerData.stats.kills) || {}).forEach(([k, v]) => { kills[k] = (kills[k] || 0) + num(v); }));
        events.forEach(e => { if (e.type === 'death') { const k = (e.data && e.data.by) || 'egyéb (éhség, szomjúság…)'; deathsBy[k] = (deathsBy[k] || 0) + 1; } });
        const enemyName = (k) => (ctx.enemies && ctx.enemies[k] && ctx.enemies[k].name) || k;
        const enemies = [...new Set([...Object.keys(kills), ...Object.keys(deathsBy)])]
            .map(k => ({ key: k, name: enemyName(k), killed: kills[k] || 0, killedPlayers: deathsBy[k] || 0 }))
            .sort((a, b) => (b.killed + b.killedPlayers) - (a.killed + a.killedPlayers));

        // online most (pozícióval)
        const online = Object.values(activePlayers).map(a => {
            const u = users.find(x => x.username === a.username);
            const p = (u && u.playerData) || {};
            return { name: a.username, lat: a.lat, lng: a.lng, level: p.level || a.level || 1, hp: Math.round(num(p.hp)), maxHp: Math.round(num(p.maxHp)), combat: !!p.combat, dead: !!p.dead, early: !!a.earlySurvivor, role: roleOf(u) };
        });

        // szerver
        let lastBackup = null;
        try {
            const dir = process.env.BACKUP_DIR || '/var/backups/survival-go';
            const files = fs.readdirSync(dir).filter(f => /^sg-.*\.json\.gz$/.test(f)).map(f => ({ f, s: fs.statSync(path.join(dir, f)) })).sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
            if (files[0]) lastBackup = { file: files[0].f, t: files[0].s.mtimeMs, size: files[0].s.size };
        } catch (e) { /* nincs mentési mappa (pl. helyi gépen) */ }
        const mem = process.memoryUsage();
        const counts = {};
        for (const name of ['survivalbuildings', 'survivalcells', 'survivalevents']) {
            try { counts[name] = await mongoose.connection.db.collection(name).estimatedDocumentCount(); } catch (e) { counts[name] = null; }
        }

        const cutoff = (ms) => users.filter(u => u.playerData && u.playerData.lastSeen && now - u.playerData.lastSeen < ms).length;
        return {
            success: true, now,
            totals: {
                users: users.length, today: regs[dayKey(now)] || 0, week: users.filter(u => now - regTime(u) < 7 * DAY).length,
                online: online.length, active1h: Math.max(cutoff(3600000), online.length), active24h: cutoff(DAY), active7d: cutoff(7 * DAY),
                early: users.filter(u => u.earlySurvivor).length, earlyLimit: config.EARLY_SURVIVOR_LIMIT,
                neverPlayed: users.length - playedOnce, banned: users.filter(u => u.bannedUntil && u.bannedUntil > now).length,
                dead: users.filter(u => u.playerData && u.playerData.dead).length,
                looted: users.reduce((a, u) => a + num(u.playerData && u.playerData.stats && u.playerData.stats.buildingsLooted), 0),
                kills: Object.values(kills).reduce((a, b) => a + b, 0),
                deaths: users.reduce((a, u) => a + num(u.playerData && u.playerData.stats && u.playerData.stats.deaths), 0),
                km: +(users.reduce((a, u) => a + num(u.playerData && u.playerData.stats && u.playerData.stats.walkedMeters), 0) / 1000).toFixed(1),
                crafted: users.reduce((a, u) => a + num(u.playerData && u.playerData.stats && u.playerData.stats.itemsCrafted), 0),
                money, openReports: await ReportModel.countDocuments({ status: 'open' })
            },
            daily, byHour, peak: { online: peak.online, t: peak.t },
            retention: { d1: d1Base ? Math.round(100 * d1Hit / d1Base) : null, d1Base, d7: d7Base ? Math.round(100 * d7Hit / d7Base) : null, d7Base },
            funnel: { registered: users.length, played: playedOnce, steps: funnel, claimed: users.filter(u => u.playerData && u.playerData.tutorial && u.playerData.tutorial.finalClaimed).length },
            economy: { money, topItems, richest },
            enemies, online,
            server: {
                uptimeSec: Math.round((now - startedAt) / 1000), node: process.version, rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576),
                errors: errorCount, recentErrors: errorLog.slice(0, 20), lastBackup, counts, dbState: mongoose.connection ? mongoose.connection.readyState : null
            },
            settings: activeSettings(), savedSettings: settings
        };
    }

    // ---- játékosok ----
    function playerRow(u) {
        const p = u.playerData || {}, s = p.stats || {};
        const kills = Object.values(s.kills || {}).reduce((a, b) => a + num(b), 0);
        return {
            name: u.username, email: u.email, role: roleOf(u), early: !!u.earlySurvivor, level: num(p.level, 1), xp: num(p.xp), money: num(p.money),
            hp: Math.round(num(p.hp)), maxHp: Math.round(num(p.maxHp)), hunger: Math.round(num(p.hunger)), thirst: Math.round(num(p.thirst)), fatigue: Math.round(num(p.fatigue)),
            dead: !!p.dead, combat: !!p.combat, online: !!activePlayers[u.username],
            kills, deaths: num(s.deaths), looted: num(s.buildingsLooted), crafted: num(s.itemsCrafted), won: num(s.combatsWon), km: +(num(s.walkedMeters) / 1000).toFixed(2),
            longestH: +(num(s.longestLifeMs) / 3600000).toFixed(1), tutorial: Object.keys((p.tutorial && p.tutorial.done) || {}).length, dailyStreak: num(p.daily && p.daily.streak),
            lastSeen: num(p.lastSeen) || null, registered: regTime(u), banned: !!(u.bannedUntil && u.bannedUntil > Date.now()), bannedUntil: u.bannedUntil || null, banReason: u.banReason || ''
        };
    }
    route('get', '/api/admin/players', async (req, res) => {
        const users = await allUsers();
        const showEmail = Roles.can(req.role, 'emails');
        res.json({ success: true, players: users.map(playerRow).map(r => (showEmail ? r : { ...r, email: '' })) });
    });
    route('get', '/api/admin/player/:name', async (req, res) => {
        const u = await PlayerModel.findOne({ username: req.params.name }, { password: 0 }).lean();
        if (!u) return res.status(404).json({ success: false, message: 'Nincs ilyen játékos.' });
        const events = await EventModel.find({ user: u.username }).sort({ t: -1 }).limit(150).lean();
        const reports = await ReportModel.find({ user: u.username }).sort({ t: -1 }).limit(20).lean();
        const p = u.playerData || {};
        const itemName = (k) => (ctx.itemDatabase[k] && ctx.itemDatabase[k].name) || k;
        res.json({
            success: true, row: Roles.can(req.role, 'emails') ? playerRow(u) : { ...playerRow(u), email: '' }, events, reports,
            inventory: (p.inventory || []).map(s => ({ key: s.key, name: itemName(s.key), count: s.count || 1, dur: s.dur })),
            equipment: Object.fromEntries(Object.entries(p.equipment || {}).map(([k, v]) => [k, v ? itemName(v) : null])),
            stats: p.stats || {}, tutorial: p.tutorial || null, daily: p.daily || null,
            position: activePlayers[u.username] ? { lat: activePlayers[u.username].lat, lng: activePlayers[u.username].lng } : null,
            seenNotices: u.seenNotices || []
        });
    });

    // Fiók átnevezése mindenhol (admin és a prémium névváltoztatás is ezt használja)
    async function renameUser(id, name, newName) {
        await PlayerModel.updateOne({ _id: id }, { username: newName, usernameLower: newName.toLocaleLowerCase('hu') });
        await EventModel.updateMany({ user: name }, { user: newName }).catch(() => { });
        await ReportModel.updateMany({ user: name }, { user: newName }).catch(() => { });
        await SupportModel.updateMany({ user: name }, { user: newName }).catch(() => { });
        if (ctx.onRename) await ctx.onRename(name, newName).catch(() => { });
    }
    const kick = (name, message) => {
        const a = activePlayers[name];
        const s = a && io.sockets.sockets.get(a.socketId);
        if (s) { s.emit('kicked', { message }); setTimeout(() => s.disconnect(true), 300); }
    };

    route('post', '/api/admin/player/:name/:action', async (req, res) => {
        const name = req.params.name, action = req.params.action, body = req.body || {};
        const u = await PlayerModel.findOne({ username: name });
        if (!u) return res.status(404).json({ success: false, message: 'Nincs ilyen játékos.' });
        const targetRole = roleOf(u);
        if (!Roles.canActOn(req.role, targetRole)) return deny(res, `${name} rangja (${Roles.info(targetRole).name}) nem alacsonyabb a tiédnél, nem módosíthatod.`);
        const need = { ban: (num(body.hours, 0) > 0 && num(body.hours, 0) <= Roles.BAN_TEMP_MAX_HOURS) ? 'ban_temp' : 'ban_perm', unban: 'ban_temp', kick: 'kick',
            password: 'edit_player', rename: 'edit_player', gift: 'edit_player', heal: 'edit_player', set: 'edit_player', role: 'roles' }[action];
        if (need && !Roles.can(req.role, need)) return deny(res, need === 'ban_perm' ? `Legfeljebb ${Roles.BAN_TEMP_MAX_HOURS / 24} napra tilthatsz.` : 'Ehhez a művelethez nincs jogod.');
        if (action === 'role') {
            const role = String(body.role || '');
            setTimeout(refreshStaff, 500);
            if (role && (!Roles.isStaff(role) || role === 'owner')) return res.status(400).json({ success: false, message: 'Tulajdonost csak a szerver beállításában (ADMIN_USERS) lehet megadni.' });
            if (isAdminName(name)) return res.status(400).json({ success: false, message: 'A tulajdonos rangja nem változtatható itt.' });
            await PlayerModel.updateOne({ _id: u._id }, { role });
            const a = activePlayers[name];
            if (a) { a.role = role; io.to(a.socketId).emit('staff_role', { role }); }
            audit(req, 'role', name, { role: role || 'játékos' });
            return res.json({ success: true, message: role ? `${name} új rangja: ${Roles.info(role).name}.` : `${name} már nem a stáb tagja.` });
        }
        if (action === 'ban') {
            const hours = num(body.hours, 0);
            const until = hours > 0 ? Date.now() + hours * 3600000 : Date.now() + 100 * 365 * DAY;
            const reason = String(body.reason || '').slice(0, 200);
            await PlayerModel.updateOne({ _id: u._id }, { bannedUntil: until, banReason: reason });
            kick(name, banInfo({ bannedUntil: until, banReason: reason }).message);
            audit(req, 'ban', name, { hours, reason });
            return res.json({ success: true, message: `${name} felfüggesztve ${hours > 0 ? hours + ' órára' : 'véglegesen'}.` });
        }
        if (action === 'unban') {
            await PlayerModel.updateOne({ _id: u._id }, { bannedUntil: null, banReason: '' });
            audit(req, 'unban', name);
            return res.json({ success: true, message: `${name} tiltása feloldva.` });
        }
        if (action === 'kick') { kick(name, String(body.message || 'Az adminisztrátor kiléptetett. Lépj be újra.')); audit(req, 'kick', name); return res.json({ success: true, message: `${name} kiléptetve.` }); }
        if (action === 'password') {
            const pw = String(body.password || '');
            if (pw.length < config.PASSWORD_MIN || pw.length > config.PASSWORD_MAX) return res.status(400).json({ success: false, message: `A jelszó ${config.PASSWORD_MIN}-${config.PASSWORD_MAX} karakter legyen.` });
            await PlayerModel.updateOne({ _id: u._id }, { password: await ctx.bcrypt.hash(pw, 10) });
            audit(req, 'password', name);
            return res.json({ success: true, message: `${name} új jelszava beállítva. Közöld vele biztonságos módon.` });
        }
        if (action === 'rename') {
            const newName = String(body.newName || '').trim();
            if (!ctx.usernameValid(newName)) return res.status(400).json({ success: false, message: 'Érvénytelen név (3–16 betű vagy szám).' });
            const lower = newName.toLocaleLowerCase('hu');
            const taken = await PlayerModel.findOne({ $or: [{ username: newName }, { usernameLower: lower }], _id: { $ne: u._id } });
            if (taken) return res.status(400).json({ success: false, message: 'Ez a név már foglalt.' });
            kick(name, `Az adminisztrátor átnevezte a fiókodat erre: ${newName}. Ezzel a névvel lépj be újra.`);
            await renameUser(u._id, name, newName);
            audit(req, 'rename', name, { newName });
            return res.json({ success: true, message: `Átnevezve: ${name} → ${newName}`, newName });
        }
        if (action === 'gift' || action === 'heal' || action === 'set') {
            const r = await applyToPlayer(name, action, body);
            if (r.error) return res.status(400).json({ success: false, message: r.error });
            audit(req, action, name, body);
            return res.json({ success: true, message: r.message });
        }
        res.status(400).json({ success: false, message: 'Ismeretlen művelet.' });
    });

    // Ajándék / gyógyítás / érték beállítása egy játékoson (a játékos sorában, mentéssel és élő frissítéssel)
    function cleanGift(body) {
        const items = (Array.isArray(body.items) ? body.items : []).map(i => ({ key: String(i.key || ''), count: Math.max(1, Math.min(999, Math.floor(num(i.count, 1)))) }))
            .filter(i => ctx.itemDatabase[i.key]);
        return { items, money: Math.max(-1e7, Math.min(1e7, Math.floor(num(body.money)))), xp: Math.max(0, Math.min(1e6, Math.floor(num(body.xp)))), note: String(body.note || '').slice(0, 200) };
    }
    function applyToPlayer(name, action, body) {
        return ctx.withPlayer(name, (p) => {
            if (action === 'gift') {
                const g = cleanGift(body);
                if (!g.items.length && !g.money && !g.xp) return { save: false, error: 'Üres ajándék.' };
                g.items.forEach(i => ctx.pushItem(p, i.key, i.count));
                p.money = Math.max(0, num(p.money) + g.money);
                if (g.xp) ctx.grantXp(p, g.xp, true);
                const parts = [...g.items.map(i => `${ctx.itemDatabase[i.key].name} ×${i.count}`), g.money ? `${g.money} $` : '', g.xp ? `${g.xp} XP` : ''].filter(Boolean);
                return { message: `🎁 Ajándék az adminisztrátortól: ${parts.join(', ')}${g.note ? ' – ' + g.note : ''}` };
            }
            if (action === 'heal') {
                const st = ctx.playerStats(p);
                p.dead = false; p.combat = null; p.hp = st.maxHp; p.hunger = 100; p.thirst = 100; p.fatigue = 0;
                return { message: '❤️ Az adminisztrátor meggyógyított.' };
            }
            if (action === 'set') {
                const fields = ['level', 'xp', 'money', 'hp', 'hunger', 'thirst', 'fatigue'];
                const changed = [];
                fields.forEach(f => { if (body[f] !== undefined && body[f] !== '' && Number.isFinite(Number(body[f]))) { p[f] = Math.max(f === 'level' ? 1 : 0, Math.floor(Number(body[f]))); changed.push(f); } });
                if (!changed.length) return { save: false, error: 'Nincs megadott érték.' };
                return { message: `Az adminisztrátor módosította: ${changed.join(', ')}.`, quiet: true };
            }
            return { save: false, error: 'Ismeretlen művelet.' };
        }).then(r => {
            if (!r) return { error: 'Nincs ilyen játékos.' };
            if (r.result.error) return { error: r.result.error };
            ctx.sendPlayerState(name, r.p);
            const a = activePlayers[name];
            if (a && r.result.message && !r.result.quiet) io.to(a.socketId).emit('server_notice', { text: r.result.message });
            return { message: r.result.message || 'Kész.' };
        });
    }

    // Ajándék mindenkinek (pl. kárpótlás egy hiba után)
    route('post', '/api/admin/gift-all', async (req, res) => {
        const g = cleanGift(req.body || {});
        if (!g.items.length && !g.money && !g.xp) return res.status(400).json({ success: false, message: 'Üres ajándék.' });
        const names = (await PlayerModel.find({}, { username: 1 }).lean()).map(u => u.username);
        let ok = 0;
        for (const n of names) { const r = await applyToPlayer(n, 'gift', g); if (!r.error) ok++; }
        audit(req, 'gift_all', null, g);
        res.json({ success: true, message: `Ajándék elküldve ${ok} játékosnak.` });
    }, 'gift_all');

    // időzített bejelentések: amikor eljön az idejük, az online játékosok is megkapják (v0.1.36)
    setInterval(async () => {
        try {
            const due = await AnnouncementModel.find({ active: true, published: false, publishAt: { $lte: Date.now() } });
            for (const a of due) {
                a.published = true; await a.save();
                for (const n of Object.keys(activePlayers)) io.to(activePlayers[n].socketId).emit('announcements', { list: [publicAnn(a)] });
            }
        } catch (e) { console.error('Hiba az időzített bejelentésnél:', e.message); }
    }, 30000);

    // ---- bejelentések (üdvözlő üzenet és hírek) ----
    route('get', '/api/admin/announcements', async (req, res) => {
        const list = await AnnouncementModel.find({}).sort({ createdAt: -1 }).lean();
        const total = await PlayerModel.countDocuments({});
        for (const a of list) a.readCount = await PlayerModel.countDocuments({ seenNotices: String(a._id) });
        res.json({ success: true, announcements: list, players: total });
    });
    route('post', '/api/admin/announcements', async (req, res) => {
        const title = String((req.body && req.body.title) || '').trim().slice(0, 80);
        const body = String((req.body && req.body.body) || '').trim().slice(0, 3000);
        if (!title || !body) return res.status(400).json({ success: false, message: 'Cím és szöveg is kell.' });
        const atMidnight = !!(req.body && req.body.atMidnight);
        const publishAt = atMidnight ? nextBudapestMidnight() : 0;
        const a = await AnnouncementModel.create({ title, body, createdAt: Date.now(), active: true, author: req.admin, publishAt, published: !atMidnight });
        // akik most online vannak, azonnal megkapják (az időzítettet csak éjfélkor)
        if (!atMidnight) for (const n of Object.keys(activePlayers)) io.to(activePlayers[n].socketId).emit('announcements', { list: [publicAnn(a)] });
        audit(req, 'announcement', null, { title, atMidnight });
        res.json({ success: true, message: atMidnight ? 'Időzítve: éjfélkor jelenik meg (a frissítéssel együtt).' : 'Bejelentés közzétéve. Mindenki egyszer látja a következő belépéskor (aki online, az most).' });
    }, 'announce');
    route('post', '/api/admin/announcements/:id/toggle', async (req, res) => {
        const a = await AnnouncementModel.findById(req.params.id);
        if (!a) return res.status(404).json({ success: false, message: 'Nincs ilyen.' });
        a.active = !a.active; await a.save();
        audit(req, 'announcement_toggle', null, { id: req.params.id, active: a.active });
        res.json({ success: true, message: a.active ? 'Újra aktív.' : 'Kikapcsolva: többen már nem kapják meg.' });
    }, 'announce');
    route('post', '/api/admin/announcements/:id/edit', async (req, res) => {
        const a = await AnnouncementModel.findById(req.params.id);
        if (!a) return res.status(404).json({ success: false, message: 'Nincs ilyen.' });
        if (req.body.title) a.title = String(req.body.title).slice(0, 80);
        if (req.body.body) a.body = String(req.body.body).slice(0, 3000);
        await a.save();
        res.json({ success: true, message: 'Mentve. (Aki már olvasta, nem kapja meg újra.)' });
    }, 'announce');

    // ---- hibajelentések ----
    route('get', '/api/admin/reports', async (req, res) => {
        res.json({ success: true, reports: await ReportModel.find({}).sort({ t: -1 }).limit(300).lean() });
    });
    route('post', '/api/admin/reports/:id', async (req, res) => {
        const status = ['open', 'done', 'ignored'].includes(req.body.status) ? req.body.status : 'done';
        await ReportModel.updateOne({ _id: req.params.id }, { status, note: String(req.body.note || '').slice(0, 500) });
        res.json({ success: true, message: 'Mentve.' });
    }, 'reports');

    // ---- élő beállítások, eventek, üzenet mindenkinek ----
    route('post', '/api/admin/settings', async (req, res) => {
        settings = normalizeSettings(req.body || {});
        await SettingModel.updateOne({ _id: 'game' }, { value: settings }, { upsert: true });
        io.emit('game_event', { event: publicEvent() });
        audit(req, 'settings', null, settings);
        res.json({ success: true, message: 'Beállítások élesítve.', settings });
    }, 'events');
    route('post', '/api/admin/broadcast', async (req, res) => {
        const text = String((req.body && req.body.text) || '').trim().slice(0, 300);
        if (!text) return res.status(400).json({ success: false, message: 'Üres üzenet.' });
        io.emit('server_notice', { text: '📢 ' + text, big: true });
        audit(req, 'broadcast', null, { text });
        res.json({ success: true, message: `Elküldve ${Object.keys(activePlayers).length} online játékosnak.` });
    }, 'announce');

    // ---- csevegés a játékosokkal ----
    const supportStaffOnline = () => Object.values(activePlayers).filter(a => Roles.can(a.role, 'support'));
    route('get', '/api/admin/support', async (req, res) => {
        const msgs = await SupportModel.find({}).sort({ t: -1 }).limit(3000).lean();
        const conv = new Map();
        msgs.forEach(m => {
            if (!conv.has(m.user)) conv.set(m.user, { user: m.user, last: m, unread: 0, count: 0, online: !!activePlayers[m.user] });
            const c = conv.get(m.user); c.count++;
            if (m.from === 'player' && m.readByStaff !== true) c.unread++;
        });
        res.json({ success: true, conversations: [...conv.values()].sort((a, b) => b.last.t - a.last.t) });
    }, 'support');
    route('get', '/api/admin/support/:user', async (req, res) => {
        const user = req.params.user;
        const msgs = await SupportModel.find({ user }).sort({ t: 1 }).lean();
        await SupportModel.updateMany({ user, from: 'player', readByStaff: { $ne: true } }, { readByStaff: true });
        res.json({ success: true, user, online: !!activePlayers[user], messages: msgs.slice(-300) });
    }, 'support');
    route('post', '/api/admin/support/:user', async (req, res) => {
        const user = req.params.user;
        const text = String((req.body && req.body.text) || '').trim().slice(0, 1000);
        if (!text) return res.status(400).json({ success: false, message: 'Üres üzenet.' });
        if (!(await PlayerModel.findOne({ username: user }, { username: 1 }).lean())) return res.status(404).json({ success: false, message: 'Nincs ilyen játékos.' });
        const m = await SupportModel.create({ t: Date.now(), at: new Date(), user, from: 'staff', staff: req.admin, staffRole: req.role, text, readByStaff: true, readByPlayer: false });
        const a = activePlayers[user];
        if (a) io.to(a.socketId).emit('support_msg', { message: publicSupport(m) });
        // ha nincs bent, a telefonjára értesítés megy (ha bekapcsolta)
        let pushed = 0;
        if (!a && ctx.push) pushed = await ctx.push.notifyUser(user, { title: '📩 Üzenet a stábtól', body: text.slice(0, 140), url: '/?support=1', tag: 'support' }).catch(() => 0);
        res.json({ success: true, message: a ? 'Elküldve (online, azonnal látja).' : pushed ? 'Elküldve, és értesítést kapott a telefonjára.' : 'Elküldve (a következő belépéskor látja; értesítést nem kapcsolt be).' });
    }, 'support');

    // ---- csapatok (v0.1.22): lista, részletek (tagok aktivitása, küldetések, csevegés, napló), moderálás ----
    const teamsApi = () => (ctx.teams ? ctx.teams() : null);
    route('get', '/api/admin/teams', async (req, res) => {
        const T = teamsApi(); if (!T) return res.json({ success: true, teams: [] });
        res.json({ success: true, teams: await T.adminList() });
    });
    route('get', '/api/admin/team/:id', async (req, res) => {
        const T = teamsApi(); const d = T && await T.adminDetail(String(req.params.id));
        if (!d) return res.status(404).json({ success: false, message: 'Nincs ilyen csapat.' });
        res.json({ success: true, team: d });
    });
    route('get', '/api/admin/team/:id/chat', async (req, res) => {
        const T = teamsApi(); if (!T) return res.status(400).json({ success: false, message: 'Nem elérhető.' });
        res.json({ success: true, ...(await T.adminChat(String(req.params.id), Number(req.query.before) || 0)) });
    });
    route('post', '/api/admin/team/:id', async (req, res) => {
        const T = teamsApi(); if (!T) return res.status(400).json({ success: false, message: 'Nem elérhető.' });
        const r = await T.adminAction(req.admin, String(req.params.id), req.body || {});
        if (!r || r.error) return res.status(400).json({ success: false, message: (r && r.error) || 'Hiba.' });
        audit(req, 'team_' + String((req.body || {}).action || ''), String(req.params.id), { name: (req.body || {}).name || null });
        res.json({ success: true, message: r.message });
    }, 'kick');

    // ---- QR-matricák (v0.1.24): gyártás, statisztika, ki-/bekapcsolás ----
    const qrApi = () => (ctx.qr ? ctx.qr() : null);
    route('get', '/api/admin/qr', async (req, res) => {
        const Q = qrApi(); if (!Q) return res.json({ success: true, batches: [], total: {} });
        res.json({ success: true, ...(await Q.adminList()) });
    });
    route('post', '/api/admin/qr', async (req, res) => {
        const Q = qrApi(); if (!Q) return res.status(400).json({ success: false, message: 'Nem elérhető.' });
        const b = req.body || {};
        const r = b.action === 'create' ? await Q.adminCreate(req.admin, b) : b.action === 'hint' ? await Q.adminHint(b) : await Q.adminUpdate(req.admin, b);
        if (!r || r.error) return res.status(400).json({ success: false, message: (r && r.error) || 'Hiba.' });
        audit(req, 'qr_' + (b.action || 'update'), b.code || b.batch || r.batch || null, { count: b.count, label: b.label, money: b.money, xp: b.xp, active: b.active });
        res.json({ success: true, ...r });
    }, 'events');

    // ---- PvP (v0.1.26): ki-/bekapcsolás, biztonságos zónák, harcnapló ----
    const pvpApi = () => (ctx.pvp ? ctx.pvp() : null);
    route('get', '/api/admin/pvp', async (req, res) => {
        const P = pvpApi(); if (!P) return res.json({ success: true, settings: { enabled: false, safeZones: [], squares: { on: true, r: 100 } }, logs: [], fights: [], bandits: [] });
        res.json({ success: true, ...(await P.adminState()) });
    });
    route('post', '/api/admin/pvp', async (req, res) => {
        const P = pvpApi(); if (!P) return res.status(400).json({ success: false, message: 'Nem elérhető.' });
        const r = await P.adminSave(req.body || {});
        audit(req, 'pvp_settings', null, { enabled: (req.body || {}).enabled !== false, zones: ((req.body || {}).safeZones || []).length });
        res.json({ success: true, ...r });
    }, 'events');

    // ---- telefonos értesítés (push) mindenkinek ----
    route('get', '/api/admin/push', async (req, res) => {
        res.json({ success: true, ...(await ctx.push.stats()) });
    }, 'announce');
    route('post', '/api/admin/push', async (req, res) => {
        const title = String((req.body && req.body.title) || '').trim().slice(0, 60);
        const body = String((req.body && req.body.body) || '').trim().slice(0, 200);
        if (!title || !body) return res.status(400).json({ success: false, message: 'Cím és szöveg is kell.' });
        const r = await ctx.push.notifyAll({ title, body, url: '/', tag: 'news' });
        audit(req, 'push_all', null, { title, body, ok: r.ok, total: r.total });
        res.json({ success: true, message: `Elküldve: ${r.ok} / ${r.total} eszközre megérkezett.`, ...r });
    }, 'announce');

    // ---- napló ----
    route('get', '/api/admin/events', async (req, res) => {
        const q = {};
        if (req.query.type) q.type = String(req.query.type);
        if (req.query.user) q.user = String(req.query.user);
        const limit = Math.min(1000, Math.max(10, num(req.query.limit, 200)));
        res.json({ success: true, events: await EventModel.find(q).sort({ t: -1 }).limit(limit).lean() });
    });

    // ---- Fagyos Csend és napi dolgok monitorozása (v0.1.18) ----
    route('get', '/api/admin/winter', async (req, res) => {
        const now = Date.now(), since = now - 45 * 86400000;
        const ev = async (type) => EventModel.find({ type, t: { $gte: since } }).sort({ t: -1 }).limit(50000).lean();
        const dayKey = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
        const today = dayKey(now);
        const [daily, advent, spins, shelters] = await Promise.all([ev('daily_claim'), ev('advent_open'), ev('wheel_spin'), ev('shelter_claim')]);
        // napi bónusz: az utolsó 14 nap
        const days = []; for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * 86400000));
        const perDay = (list) => days.map(k => ({ day: k, n: list.filter(e => dayKey(e.t) === k).length }));
        const streaks = {}; daily.forEach(e => { const d = num(e.data && e.data.day); streaks[d] = (streaks[d] || 0) + 1; });
        // adventi naptár: ablakonként
        const windows = Array.from({ length: 24 }, (_, i) => ({ day: i + 1, n: 0, catchup: 0 }));
        advent.forEach(e => { const w = windows[num(e.data && e.data.day) - 1]; if (w) { w.n++; if (e.data.catchup) w.catchup++; } });
        // szerencsekerék
        const prizes = {}; let credits = 0; const jackpots = [];
        spins.forEach(e => { const k = e.data && e.data.prize; prizes[k] = (prizes[k] || 0) + 1; if (k === 'jackpot') { credits += num(e.data.credits, 100); jackpots.push({ t: e.t, user: e.user }); } });
        let trees = { total: 0, decorated: 0, top: [], hung: 0 };
        try {
            const TM = (mongoose.models && mongoose.models.SurvivalTree) || mongoose.model('SurvivalTree');
            const all = (await TM.find({}).lean()).filter(t => num(t.points) > 0);
            trees = { total: all.length, hung: all.reduce((a, t) => a + num(t.hung), 0), top: all.sort((a, b) => b.points - a.points).slice(0, 15).map(t => ({ name: t.name, place: t.place, points: t.points, hung: t.hung || 0, people: Object.keys(t.contributors || {}).length })) };
        } catch (e) { /* még nincs fa */ }
        const hangs = await ev('tree_hang');
        const giftEv = await ev('gift_open');
        const users = await allUsers();
        const shelterCount = users.filter(u => u.playerData && u.playerData.shelter && u.playerData.shelter.buildingId).length;
        res.json({ success: true, today,
            daily: { today: daily.filter(e => dayKey(e.t) === today).length, users7: new Set(daily.filter(e => e.t > now - 7 * 86400000).map(e => e.user)).size, perDay: perDay(daily), streaks },
            advent: { total: advent.length, today: advent.filter(e => dayKey(e.t) === today).length, users: new Set(advent.map(e => e.user)).size, catchups: advent.filter(e => e.data && e.data.catchup).length, windows, perDay: perDay(advent) },
            wheel: { total: spins.length, today: spins.filter(e => dayKey(e.t) === today).length, users: new Set(spins.map(e => e.user)).size, prizes, credits, jackpots: jackpots.slice(0, 20), perDay: perDay(spins) },
            gifts: { total: giftEv.length, today: giftEv.filter(e => dayKey(e.t) === today).length, gold: giftEv.filter(e => e.data && e.data.kind === 'gold').length, users: new Set(giftEv.map(e => e.user)).size, perDay: perDay(giftEv) },
            trees: { ...trees, hangsToday: hangs.filter(e => dayKey(e.t) === today).reduce((a, e) => a + num(e.data && e.data.count), 0), perDay: perDay(hangs) },
            shelter: { count: shelterCount, claims: shelters.length, today: shelters.filter(e => dayKey(e.t) === today).length }
        });
    }, 'events');

    // ---- FEJLŐDÉS (v0.1.20): képességek, újraosztás, küldetések ----
    route('get', '/api/admin/progress', async (req, res) => {
        const now = Date.now(), since = now - 30 * 86400000;
        const ev = async (type) => EventModel.find({ type, t: { $gte: since } }).sort({ t: -1 }).limit(50000).lean();
        const dayKey = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
        const days = []; for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * 86400000));
        const perDay = (list) => days.map(k => ({ day: k, n: list.filter(e => dayKey(e.t) === k).length }));
        const [learns, respecs, qdone, qbonus, rerolls] = await Promise.all([ev('skill_learn'), ev('skill_respec'), ev('quest_done'), ev('quest_bonus'), ev('quest_reroll')]);
        // a mostani karakterek képességei (a stáb nélkül)
        const users = (await allUsers()).filter(u => !isStaffName(u.username));
        const bySkill = {}, byBranch = {}; let withSkills = 0;
        Skills.SKILLS.forEach(sk => { bySkill[sk.key] = { key: sk.key, name: sk.name, branch: sk.branch, players: 0, ranks: 0 }; });
        users.forEach(u => {
            const sk = Skills.normalize(u.playerData && u.playerData.skills);
            const keys = Object.keys(sk.ranks);
            if (keys.length) withSkills++;
            keys.forEach(k => { bySkill[k].players++; bySkill[k].ranks += sk.ranks[k]; byBranch[Skills.BY_KEY[k].branch] = (byBranch[Skills.BY_KEY[k].branch] || 0) + sk.ranks[k]; });
        });
        const pay = { free: 0, money: 0, crystal: 0, moneySum: 0, crystalSum: 0 };
        respecs.forEach(e => { const d = e.data || {}; pay[d.pay] = (pay[d.pay] || 0) + 1; if (d.pay === 'money') pay.moneySum += num(d.price); if (d.pay === 'crystal') pay.crystalSum += num(d.price); });
        const kinds = {};
        qdone.forEach(e => { const k = e.data && e.data.kind; if (!kinds[k]) kinds[k] = { kind: k, title: (Quests.DEFS[k] ? Quests.DEFS[k].icon + ' ' + k : k), move: !!(e.data && e.data.move), n: 0 }; kinds[k].n++; });
        const moveDone = qdone.filter(e => e.data && e.data.move).length;
        res.json({ success: true, prices: skillPricesValue, defaults: Skills.RESPEC_DEFAULTS,
            skills: { players: users.length, withSkills, byBranch, bySkill: Object.values(bySkill).sort((a, b) => b.ranks - a.ranks), learns: learns.length, perDay: perDay(learns) },
            respec: { total: respecs.length, ...pay, recent: respecs.slice(0, 30).map(e => ({ t: e.t, user: e.user, ...(e.data || {}) })) },
            quests: { done: qdone.length, today: qdone.filter(e => dayKey(e.t) === dayKey(now)).length, users: new Set(qdone.map(e => e.user)).size,
                movePct: qdone.length ? Math.round(moveDone / qdone.length * 100) : 0, dailyBonus: qbonus.filter(e => e.data && e.data.scope === 'daily').length,
                weeklyBonus: qbonus.filter(e => e.data && e.data.scope === 'weekly').length, rerolls: rerolls.length, kinds: Object.values(kinds).sort((a, b) => b.n - a.n), perDay: perDay(qdone) },
            recentLearns: learns.slice(0, 40).map(e => ({ t: e.t, user: e.user, ...(e.data || {}) }))
        });
    }, 'events');
    // Szezon: a mostani állás (első 10) és a lezárt hónapok nyertesei; kézi lezárás (ha az automatikus valamiért elmaradt)
    route('get', '/api/admin/season', async (req, res) => {
        res.json({ success: true, ...(await ctx.season.status()) });
    }, 'events');
    route('post', '/api/admin/season-close', async (req, res) => {
        const r = await ctx.season.close();
        audit(req, 'season_close', null, r ? { month: r.month, winners: r.winners.length } : null);
        res.json({ success: true, message: r ? `${r.month} lezárva: ${r.winners.length} jutalmazott.` : 'Nincs lezárandó szezon (vagy már lezárult).', result: r });
    }, 'server');
    route('get', '/api/admin/game-prices', async (req, res) => res.json({ success: true, prices: gamePricesValue, defaults: Prices.ITEMS }));
    route('post', '/api/admin/game-prices', async (req, res) => {
        gamePricesValue = Prices.normalize(req.body || {});
        await SettingModel.updateOne({ _id: 'prices' }, { value: gamePricesValue }, { upsert: true });
        audit(req, 'game_prices', null, Object.fromEntries(Object.entries(gamePricesValue).map(([k, v]) => [k, `${v.money}$/${v.crystals}💎${v.free ? '/1x ingyen' : ''}`])));
        res.json({ success: true, message: 'Az árak mentve.', prices: gamePricesValue });
    }, 'events');
    route('post', '/api/admin/skill-prices', async (req, res) => {
        skillPricesValue = normalizeSkillPrices(req.body || {});
        await SettingModel.updateOne({ _id: 'skills' }, { value: skillPricesValue }, { upsert: true });
        audit(req, 'skill_prices', null, skillPricesValue);
        res.json({ success: true, message: 'Az újraosztás ára mentve.', prices: skillPricesValue });
    }, 'events');

    // ---- mentés most ----
    route('post', '/api/admin/backup', async (req, res) => {
        execFile(process.execPath, [path.join(__dirname, 'scripts', 'mentes.js')], { env: process.env, timeout: 120000 }, (err, stdout, stderr) => {
            audit(req, 'backup');
            if (err) return res.status(500).json({ success: false, message: 'Mentési hiba: ' + (stderr || err.message).slice(0, 300) });
            res.json({ success: true, message: stdout.trim().slice(0, 400) });
        });
    }, 'server');

    // ---- Excel ----
    route('get', '/api/admin/export.xlsx', async (req, res) => {
        const users = await allUsers();
        const rows = users.map(playerRow);
        const ov = await buildOverview();
        const events = await EventModel.find({}).sort({ t: -1 }).limit(20000).lean();
        const itemName = (k) => (ctx.itemDatabase[k] && ctx.itemDatabase[k].name) || k;
        const sheets = [
            { name: 'Játékosok', rows: [['Név', 'E-mail', 'Korai túlélő', 'Szint', 'XP', 'Pénz', 'Élet', 'Max élet', 'Étel %', 'Víz %', 'Fáradtság %', 'Halott', 'Online', 'Ölések', 'Halálok', 'Épületek', 'Barkácsolt', 'Megnyert harc', 'Km', 'Leghosszabb élet (óra)', 'Első lépések (6)', 'Napi sorozat', 'Utoljára', 'Regisztrált', 'Tiltva', 'Tiltás oka'],
                ...rows.map(r => [r.name, r.email, r.early ? 'igen' : '', r.level, r.xp, r.money, r.hp, r.maxHp, r.hunger, r.thirst, r.fatigue, r.dead ? 'igen' : '', r.online ? 'igen' : '', r.kills, r.deaths, r.looted, r.crafted, r.won, r.km, r.longestH, r.tutorial, r.dailyStreak, localTime(r.lastSeen), localTime(r.registered), r.banned ? localTime(r.bannedUntil) : '', r.banReason])] },
            { name: 'Napi', rows: [['Nap', 'Regisztráció', 'Aktív játékos'], ...ov.daily.map(d => [d.day, d.regs, d.active])] },
            { name: 'Napszak', rows: [['Óra', 'Átlag online', 'Max online'], ...ov.byHour.map(h => [h.hour, h.avg, h.max])] },
            { name: 'Ellenfelek', rows: [['Ellenfél', 'Legyőzve', 'Játékost ölt'], ...ov.enemies.map(e => [e.name, e.killed, e.killedPlayers])] },
            { name: 'Tárgyak', rows: [['Tárgy', 'Kulcs', 'Darab a játékosoknál'], ...ov.economy.topItems.map(i => [i.name, i.key, i.count])] },
            { name: 'Események', rows: [['Időpont', 'Típus', 'Játékos', 'Részletek'], ...events.map(e => [localTime(e.t), e.type, e.user || '', e.data ? JSON.stringify(e.data).replace(/[{}"]/g, '').slice(0, 300) : ''])] }
        ];
        const buf = XLSX.build(sheets);
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', `attachment; filename="survivalgo-${dayKey(Date.now())}.xlsx"`);
        res.send(buf);
        void itemName;
    }, 'export');

    // ---------------- játékos oldali socket események ----------------
    function publicSupport(m) {
        const r = Roles.info(m.staffRole);
        return { id: String(m._id), t: m.t, from: m.from, staff: m.from === 'staff' ? m.staff : null, staffRole: m.from === 'staff' ? (m.staffRole || '') : null, staffRoleName: r ? r.name : null, text: m.text };
    }
    function publicAnn(a) { return { id: String(a._id), title: a.title, body: a.body, createdAt: a.createdAt }; }
    return {
        route, renameUser, kick, audit: (admin, action, target, data) => logEvent('admin', admin, { action, target, ...(data || {}) }),
        onConnect(socket, username) {
            logEvent('login', username, null);
            const me = activePlayers[username];
            if (me) me.role = socket.data.role || '';
            // olvasatlan válasz a stábtól / a stábnak: olvasatlan üzenetek
            SupportModel.countDocuments({ user: username, from: 'staff', readByPlayer: { $ne: true } }).then(n => { if (n) socket.emit('support_unread', { count: n }); }).catch(() => { });
            if (Roles.can(socket.data.role, 'support')) SupportModel.countDocuments({ from: 'player', readByStaff: { $ne: true } }).then(n => { if (n) socket.emit('support_staff_unread', { count: n }); }).catch(() => { });
            socket.on('support_history', () => {
                SupportModel.find({ user: username }).sort({ t: 1 }).lean().then(async (msgs) => {
                    socket.emit('support_history', { messages: msgs.slice(-100).map(publicSupport) });
                    await SupportModel.updateMany({ user: username, from: 'staff', readByPlayer: { $ne: true } }, { readByPlayer: true });
                }).catch(err => console.error('Hiba a csevegés betöltésekor:', err));
            });
            let lastSupportAt = 0;
            socket.on('support_send', (data) => {
                const text = data && typeof data.text === 'string' ? data.text.trim().slice(0, 500) : '';
                if (!text) return;
                if (Date.now() - lastSupportAt < 3000) return socket.emit('support_error', { message: 'Lassabban, pár másodperc múlva küldheted.' });
                lastSupportAt = Date.now();
                SupportModel.create({ t: Date.now(), at: new Date(), user: username, from: 'player', text, readByPlayer: true, readByStaff: false }).then(m => {
                    socket.emit('support_msg', { message: publicSupport(m) });
                    supportStaffOnline().forEach(a => { if (a.username !== username) io.to(a.socketId).emit('support_staff_new', { user: username, text: text.slice(0, 80) }); });
                }).catch(() => socket.emit('support_error', { message: 'Nem sikerült elküldeni, próbáld újra.' }));
            });
            const ev = publicEvent();
            if (ev) socket.emit('game_event', { event: ev });
            PlayerModel.findOne({ username }, { seenNotices: 1 }).lean().then(async (u) => {
                const seen = (u && u.seenNotices) || [];
                const list = (await AnnouncementModel.find({ active: true }).sort({ createdAt: 1 }).lean()).filter(a => !a.publishAt || a.publishAt <= Date.now());
                const unseen = list.filter(a => !seen.includes(String(a._id))).map(publicAnn);
                if (unseen.length) socket.emit('announcements', { list: unseen });
            }).catch(err => console.error('Hiba a bejelentések küldésekor:', err));

            socket.on('announcement_seen', (data) => {
                const id = data && typeof data.id === 'string' && /^[0-9a-f]{24}$/.test(data.id) ? data.id : null;
                if (!id) return;
                PlayerModel.updateOne({ username }, { $addToSet: { seenNotices: id } }).catch(() => { });
            });
            let lastReportAt = 0;
            socket.on('bug_report', (data) => {
                const text = data && typeof data.text === 'string' ? data.text.trim().slice(0, 1500) : '';
                if (text.length < 3) return socket.emit('bug_report_result', { success: false, message: 'Írj le pár szót a hibáról.' });
                if (Date.now() - lastReportAt < 60000) return socket.emit('bug_report_result', { success: false, message: 'Egy perc múlva küldhetsz újat.' });
                lastReportAt = Date.now();
                ReportModel.create({ t: Date.now(), at: new Date(), user: username, text, ua: String((data && data.ua) || '').slice(0, 200), status: 'open' })
                    .then(() => socket.emit('bug_report_result', { success: true, message: 'Köszönjük! A hibajelentés megérkezett.' }))
                    .catch(() => socket.emit('bug_report_result', { success: false, message: 'Nem sikerült elküldeni, próbáld később.' }));
            });
        }
    };
}

module.exports = {
    isStaffName, refreshStaff,
    setup, logEvent, onPlayerSaved, skillPrices, gamePrices, snapshotBefore, banInfo, isAdminName, roleOf, xpMultiplier, lootMultiplier, publicEvent,
    models: { EventModel, MetricModel, SettingModel, AnnouncementModel, ReportModel, SupportModel },
    _setSettings: (s) => { settings = normalizeSettings(s); }
};
