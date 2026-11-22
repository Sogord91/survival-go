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
const annSchema = new mongoose.Schema({ title: String, body: String, createdAt: Number, active: { type: Boolean, default: true }, author: String });
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
    } catch (e) { /* a napló hibája nem állíthatja meg a mentést */ }
}
function snapshotBefore(p) {
    return {
        level: p.level, dead: !!p.dead, stats: { ...(p.stats || {}) },
        enemy: p.combat && p.combat.enemy ? p.combat.enemy.key : null,
        building: p.combat ? p.combat.buildingName : null
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

function setup(c) {
    ctx = c;
    const { app, io, PlayerModel, config, authToken, activePlayers } = c;

    SettingModel.findById('game').lean().then(d => { if (d) settings = normalizeSettings(d.value); }).catch(() => { });

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
        const a = await AnnouncementModel.create({ title, body, createdAt: Date.now(), active: true, author: req.admin });
        // akik most online vannak, azonnal megkapják
        for (const n of Object.keys(activePlayers)) io.to(activePlayers[n].socketId).emit('announcements', { list: [publicAnn(a)] });
        audit(req, 'announcement', null, { title });
        res.json({ success: true, message: 'Bejelentés közzétéve. Mindenki egyszer látja a következő belépéskor (aki online, az most).' });
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
        res.json({ success: true, message: a ? 'Elküldve (online, azonnal látja).' : 'Elküldve (a következő belépéskor látja).' });
    }, 'support');

    // ---- napló ----
    route('get', '/api/admin/events', async (req, res) => {
        const q = {};
        if (req.query.type) q.type = String(req.query.type);
        if (req.query.user) q.user = String(req.query.user);
        const limit = Math.min(1000, Math.max(10, num(req.query.limit, 200)));
        res.json({ success: true, events: await EventModel.find(q).sort({ t: -1 }).limit(limit).lean() });
    });

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
                const list = await AnnouncementModel.find({ active: true }).sort({ createdAt: 1 }).lean();
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
    setup, logEvent, onPlayerSaved, snapshotBefore, banInfo, isAdminName, roleOf, xpMultiplier, lootMultiplier, publicEvent,
    models: { EventModel, MetricModel, SettingModel, AnnouncementModel, ReportModel, SupportModel },
    _setSettings: (s) => { settings = normalizeSettings(s); }
};
