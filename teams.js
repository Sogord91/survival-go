// teams.js
// CSAPATOK (v0.1.22): címer, csapatkereső, jelentkezés, vezető / helyettes / tag szerepek, kezelőfelület
// (jelentkezők, tagok aktivitása), heti csapatküldetések, csapat-csevegés, hirdetőtábla, napló, admin nézet.
// A social.js indítja (setup), a socket-eseményeket is ő köti be (attach).
'use strict';
const crypto = require('crypto');
const T = require('./public/js/teams');

const NAME_RE = /^[\p{L}\p{N} ._-]{3,24}$/u;
const TAG_RE = /^[A-Z0-9ÁÉÍÓÖŐÚÜŰ]{2,4}$/;
const CHAT_MAX = 80, LOG_MAX = 40, REQ_MAX = 30, APPS_MAX = 3;
const KINDS = Object.keys(T.QUESTS);

function makeModel() {
    const mongoose = require('mongoose');
    const Mixed = mongoose.Schema.Types.Mixed;
    const team = new mongoose.Schema({
        _id: String, name: String, tag: String, owner: String, officers: [String], members: [String], invites: [String],
        requests: Mixed, emblem: Mixed, desc: String, board: Mixed, mode: String, minLevel: Number, t: Number,
        week: String, prog: Mixed, qdone: Mixed, allDone: Boolean, contrib: Mixed, joined: Mixed,
        chat: Mixed, log: Mixed, stats: Mixed,
        meters: Number, done: Boolean // régi (v0.1.21) mezők: az első heti váltáskor átvesszük őket
    });
    return mongoose.models.SurvivalTeam || mongoose.model('SurvivalTeam', team);
}

function setup(ctx) {
    const { PlayerModel, activePlayers, Admin, weekKey, seasonMonth, reward, notify, emitTo } = ctx;
    const TeamModel = ctx.TeamModel || makeModel();
    const isStaff = (n) => (Admin.isStaffName ? Admin.isStaffName(n) : false);
    // a stáb csapata (a vezetője stábtag): csak a stáb látja, csak stábtag lehet benne, a ranglistán sincs
    const staffTeam = (t) => !!t && isStaff(t.owner);
    const STAFF_ONLY = 'A stáb csapatába csak stábtag kerülhet.';

    // ---------- csapatonként sorban futó módosítás (nincs két egyszerre futó írás ugyanarra a csapatra) ----------
    const locks = new Map();
    function withTeam(id, fn) {
        const prev = locks.get(id) || Promise.resolve();
        const run = prev.catch(() => { }).then(async () => {
            const doc = await TeamModel.findById(id).lean();
            if (!doc) { const o = await fn(null); return { t: null, out: o && (o.__nosave || o.__delete) ? o.value : o }; }
            const t = normalize(doc);
            const out = await fn(t);
            if (out && out.__delete) { await TeamModel.deleteOne({ _id: id }); return { t: null, out: out.value }; }
            if (!(out && out.__nosave)) {
                const { _id, __v, meters, done, ...rest } = t;
                await TeamModel.updateOne({ _id: id }, { $set: rest });
            }
            return { t, out: out && (out.__nosave || out.__delete) ? out.value : out };
        });
        locks.set(id, run.finally(() => { if (locks.get(id) === run) locks.delete(id); }));
        return run;
    }
    const nosave = (value) => ({ __nosave: true, value });

    function normalize(d) {
        const t = { ...d };
        t.members = Array.isArray(t.members) ? t.members : [];
        t.officers = (Array.isArray(t.officers) ? t.officers : []).filter(n => t.members.includes(n) && n !== t.owner);
        t.invites = Array.isArray(t.invites) ? t.invites : [];
        t.requests = Array.isArray(t.requests) ? t.requests : [];
        t.emblem = T.normEmblem(t.emblem);
        t.desc = typeof t.desc === 'string' ? t.desc : '';
        t.board = t.board && typeof t.board === 'object' && t.board.text ? t.board : null;
        t.mode = T.MODES.some(m => m.key === t.mode) ? t.mode : 'request';
        t.minLevel = Math.max(1, Math.min(99, Math.floor(Number(t.minLevel) || 1)));
        t.joined = t.joined && typeof t.joined === 'object' ? t.joined : {};
        t.chat = Array.isArray(t.chat) ? t.chat : [];
        t.log = Array.isArray(t.log) ? t.log : [];
        t.stats = t.stats && typeof t.stats === 'object' ? t.stats : { quests: 0, weeks: 0, km: 0 };
        if (!t.prog || typeof t.prog !== 'object') { // átállás a régi heti séta-célról
            t.prog = { walk: Number(t.meters) || 0 };
            t.qdone = { walk: !!t.done };
        }
        t.qdone = t.qdone && typeof t.qdone === 'object' ? t.qdone : {};
        t.contrib = t.contrib && typeof t.contrib === 'object' ? t.contrib : {};
        freshWeek(t);
        return t;
    }
    function freshWeek(t) {
        const wk = weekKey(Date.now());
        if (t.week === wk) return t;
        if (t.week) { t.stats.weeks = (t.stats.weeks || 0) + 1; }
        t.week = wk; t.prog = {}; t.qdone = {}; t.allDone = false; t.contrib = {};
        return t;
    }
    const kindsOf = (t) => T.questKinds(t._id, t.week);
    const roleOf = (t, n) => (n === t.owner ? 'owner' : t.officers.includes(n) ? 'officer' : t.members.includes(n) ? 'member' : null);
    const isLeader = (t, n) => { const r = roleOf(t, n); return r === 'owner' || r === 'officer'; };
    const addLog = (t, text) => { t.log.push({ t: Date.now(), text }); if (t.log.length > LOG_MAX) t.log = t.log.slice(-LOG_MAX); };
    const tell = (t, msg, except) => t.members.forEach(n => { if (n !== except) { emitTo(n, 'player_notice', { message: msg }); emitTo(n, 'social_ping', {}); } });
    const ping = (t) => t.members.forEach(n => emitTo(n, 'social_ping', {}));
    const leaders = (t) => [t.owner, ...t.officers];

    // ---------- a játékos csapata (gyorsítótár) ----------
    const teamOf = new Map();
    async function myTeamId(username) {
        if (teamOf.has(username)) return teamOf.get(username);
        const u = await PlayerModel.findOne({ username }, { team: 1 }).lean();
        const id = (u && u.team) || null; teamOf.set(username, id); return id;
    }
    async function setTeam(username, id) {
        teamOf.set(username, id);
        const u = await PlayerModel.findOne({ username }, { teamApps: 1 }).lean();
        const apps = (u && u.teamApps) || [];
        await PlayerModel.updateOne({ username }, id ? { team: id, teamInvites: [], teamApps: [] } : { team: null });
        if (id) for (const other of apps) if (other !== id) await withTeam(other, (o) => { if (!o) return nosave(); o.requests = o.requests.filter(r => r.name !== username); });
    }

    // ---------- heti küldetések: számlálás memóriában, percenként mentés ----------
    const pending = new Map(); // id -> { kind: n, by: { user: { kind: n } } }
    function bump(username, kind, n) {
        if (!(n > 0) || !T.QUESTS[kind]) return;
        const id = teamOf.get(username);
        if (id === undefined) { myTeamId(username).catch(() => { }); return; }
        if (!id) return;
        const p = pending.get(id) || { sum: {}, by: {} };
        p.sum[kind] = (p.sum[kind] || 0) + n;
        p.by[username] = p.by[username] || {};
        p.by[username][kind] = (p.by[username][kind] || 0) + n;
        pending.set(id, p);
    }
    function onWalk(username, meters) { bump(username, 'walk', meters); }
    // a server.js questEvent-jéből: loot / win / craft / új terület / teljesített egyéni küldetés
    function onEvent(username, kind, n) {
        const map = { loot: 'loot', win: 'win', craft: 'craft', cell: 'cells', quest: 'quests' };
        if (map[kind]) bump(username, map[kind], n || 1);
    }
    async function flush() {
        const list = [...pending.entries()]; pending.clear();
        for (const [id, p] of list) {
            const done = [];
            const res = await withTeam(id, (t) => {
                if (!t) return nosave();
                const kinds = kindsOf(t), n = t.members.length;
                for (const [user, by] of Object.entries(p.by)) {
                    if (!t.members.includes(user)) continue;
                    const c = t.contrib[user] = t.contrib[user] || {};
                    for (const [k, v] of Object.entries(by)) c[k] = (c[k] || 0) + v;
                    c.last = Date.now();
                }
                for (const [k, v] of Object.entries(p.sum)) {
                    t.prog[k] = (t.prog[k] || 0) + v;
                    if (k === 'walk') t.stats.km = Math.round(((t.stats.km || 0) + v / 1000) * 10) / 10;
                }
                const need = T.helpersNeeded(n), helpers = (k) => t.members.filter(m => t.contrib[m] && t.contrib[m][k] > 0).length;
                kinds.forEach(k => { if (!t.qdone[k] && (t.prog[k] || 0) >= T.target(k, n) && helpers(k) >= need) { t.qdone[k] = true; t.stats.quests = (t.stats.quests || 0) + 1; done.push(k); addLog(t, `✅ Kész a csapatküldetés: ${T.QUESTS[k].icon} ${T.QUESTS[k].title}`); } });
                let all = false;
                if (!t.allDone && kinds.every(k => t.qdone[k])) { t.allDone = true; all = true; addLog(t, '🏆 Mind a 3 heti csapatküldetés kész!'); }
                if (!done.length && !all) return {};
                return { all };
            });
            const t = res.t; if (!t || (!done.length && !(res.out && res.out.all))) continue;
            // jutalom: aki a héten bármivel hozzájárult (a stáb is kap, de a ranglistán nem szerepel)
            const active = t.members.filter(n => t.contrib[n]);
            for (const k of done) {
                const q = T.QUESTS[k];
                Admin.logEvent('team_quest', t.owner, { team: t.name, kind: k, members: t.members.length, active: active.length });
                for (const n of active) {
                    await reward(n, q.reward, `🏕️ [${t.tag}] csapatküldetés kész: ${q.icon} ${q.title}!`);
                    notify(n, `🏕️ ${q.title}: kész!`, `A(z) ${t.name} teljesítette a heti csapatküldetést. Jutalmad: +${q.reward.xp} XP, +${q.reward.money} $.`);
                }
                t.members.filter(n => !t.contrib[n]).forEach(n => emitTo(n, 'player_notice', { message: `🏕️ A csapatod teljesítette: ${q.title}. Jutalmat az kap, aki a héten segített – indulj el te is!` }));
            }
            if (res.out && res.out.all) for (const n of active) await reward(n, T.ALL_BONUS, `🏆 [${t.tag}] mind a 3 heti csapatküldetés kész!`);
            ping(t);
        }
    }
    if (!process.env.SG_NO_TIMERS) setInterval(() => flush().catch(e => console.error('Csapat mentés hiba:', e.message)), 60000);

    // ---------- adatok a kliensnek ----------
    function questView(t) {
        const n = t.members.length;
        const need = T.helpersNeeded(n);
        return kindsOf(t).map(k => { const q = T.QUESTS[k]; return { kind: k, icon: q.icon, title: q.title, unit: q.unit, desc: q.desc, div: q.div || 1, progress: Math.round(t.prog[k] || 0), target: T.target(k, n), done: !!t.qdone[k], reward: q.reward,
            helpers: t.members.filter(m => t.contrib[m] && t.contrib[m][k] > 0).length, need }; });
    }
    function brief(t, extra) {
        return { id: t._id, name: t.name, tag: t.tag, emblem: t.emblem, members: t.members.length, max: T.MAX, mode: t.mode, minLevel: t.minLevel, desc: t.desc, owner: t.owner, ...(extra || {}) };
    }
    async function memberRows(t) {
        const users = await PlayerModel.find({ username: { $in: t.members } }, { username: 1, 'playerData.level': 1, 'playerData.season': 1, 'playerData.lastSeen': 1, 'playerData.dead': 1 }).lean();
        const month = seasonMonth();
        return t.members.map(n => {
            const x = users.find(v => v.username === n) || {}, pd = x.playerData || {};
            const se = pd.season && pd.season.month === month ? pd.season : {};
            const c = t.contrib[n] || {};
            return { name: n, role: roleOf(t, n), level: pd.level || 1, online: !!activePlayers[n], lastSeen: activePlayers[n] ? Date.now() : (pd.lastSeen || null),
                points: se.xp || 0, joined: t.joined[n] || null, staff: isStaff(n),
                week: { km: Math.round((c.walk || 0) / 100) / 10, loot: c.loot || 0, win: c.win || 0, cells: c.cells || 0, craft: c.craft || 0, quests: c.quests || 0, last: c.last || null, active: !!t.contrib[n] } };
        }).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0) || (b.role === 'officer') - (a.role === 'officer') || b.points - a.points);
    }
    async function info(username) {
        const id = await myTeamId(username);
        const u = await PlayerModel.findOne({ username }, { teamInvites: 1, teamApps: 1 }).lean();
        const invites = [], apps = [];
        for (const tid of ((u && u.teamInvites) || []).slice(0, 5)) { const d = await TeamModel.findById(tid).lean(); if (d) invites.push(brief(normalize(d))); }
        for (const tid of ((u && u.teamApps) || []).slice(0, APPS_MAX)) { const d = await TeamModel.findById(tid).lean(); if (d) apps.push(brief(normalize(d))); }
        const base = { invites, apps, rules: { max: T.MAX, minLevel: T.MIN_LEVEL, appsMax: APPS_MAX, allBonus: T.ALL_BONUS } };
        if (!id) return { ...base, team: null };
        const doc = await TeamModel.findById(id).lean();
        if (!doc) { teamOf.set(username, null); return { ...base, team: null }; }
        const t = normalize(doc);
        const members = await memberRows(t);
        const me = roleOf(t, username);
        const lead = me === 'owner' || me === 'officer';
        return { ...base, team: {
            ...brief(t), role: me, officers: t.officers, board: t.board, week: t.week,
            quests: questView(t), allDone: !!t.allDone, members, points: members.filter(m => !m.staff).reduce((a, m) => a + m.points, 0),
            stats: t.stats, log: t.log.slice(-20).reverse(),
            requests: lead ? t.requests : [], invited: t.invites,
            chatLast: t.chat.length ? t.chat[t.chat.length - 1].t : 0
        } };
    }
    // csapat-ranglista: a tagok havi szezonpontjainak összege (a stáb pontja nem számít)
    async function board(rows) {
        // a stáb csapata (a vezetője stábtag) nem kerül a ranglistára
        const teams = (await TeamModel.find({}).lean()).map(normalize).filter(t => !isStaff(t.owner));
        const byUser = {}; rows.forEach(r => { byUser[r.name] = r; });
        return teams.map(t => ({ id: t._id, name: `[${t.tag}] ${t.name}`, tag: t.tag, emblem: t.emblem, members: t.members.length, xp: t.members.reduce((a, n) => a + ((byUser[n] && byUser[n].xp) || 0), 0), memberNames: t.members }))
            .filter(t => t.xp > 0).sort((a, b) => b.xp - a.xp);
    }

    // ---------- belépés / kilépés ----------
    async function join(username, id, how) {
        const lv = await levelOf(username);
        const r = await withTeam(id, (t) => {
            if (!t) return nosave({ error: 'Ez a csapat már nem létezik.' });
            if (staffTeam(t) && !isStaff(username)) return nosave({ error: STAFF_ONLY });
            if (t.members.includes(username)) return nosave({ error: 'Már tagja vagy.' });
            if (t.members.length >= T.MAX) return nosave({ error: `A csapat megtelt (${T.MAX} fő).` });
            t.members.push(username); t.joined[username] = Date.now();
            t.invites = t.invites.filter(x => x !== username); t.requests = t.requests.filter(x => x.name !== username);
            addLog(t, `➕ ${username} csatlakozott (${how}, ${lv}. szint)`);
            return { ok: true };
        });
        if (!r.out || r.out.error) return r.out || { error: 'Ez a csapat már nem létezik.' };
        await setTeam(username, id);
        tell(r.t, `🏕️ ${username} csatlakozott a csapathoz!`, username);
        Admin.logEvent('team_join', username, { team: r.t.name, how });
        return { ok: true, t: r.t };
    }
    async function leave(who, by) {
        const id = await myTeamId(who); if (!id) return null;
        const r = await withTeam(id, (t) => {
            if (!t) return nosave(null);
            t.members = t.members.filter(n => n !== who); t.officers = t.officers.filter(n => n !== who);
            delete t.joined[who];
            if (!t.members.length) return { __delete: true, value: { name: t.name, tag: t.tag, deleted: true } };
            if (t.owner === who) { // új vezető: a helyettes, különben a legrégebbi tag
                const next = t.officers[0] || t.members.slice().sort((a, b) => (t.joined[a] || 0) - (t.joined[b] || 0))[0];
                t.owner = next; t.officers = t.officers.filter(n => n !== next);
                addLog(t, `👑 Új vezető: ${next}`);
            }
            addLog(t, by ? `➖ ${who}-t elküldte: ${by}` : `➖ ${who} kilépett`);
            return { name: t.name, tag: t.tag };
        });
        await PlayerModel.updateOne({ username: who }, { team: null }); teamOf.set(who, null);
        if (r.t) tell(r.t, by ? `🏕️ ${who} kikerült a csapatból.` : `🏕️ ${who} kilépett a csapatból.`, who);
        if (by && r.out) { emitTo(who, 'player_notice', { message: `🏕️ Kikerültél a(z) [${r.out.tag}] csapatból.` }); emitTo(who, 'social_ping', {}); }
        Admin.logEvent('team_leave', who, { team: r.out && r.out.name, by: by || null, deleted: !!(r.out && r.out.deleted) });
        return r.out;
    }
    async function levelOf(username) {
        const a = (activePlayers[username] && activePlayers[username].level) || 0;
        const u = await PlayerModel.findOne({ username }, { 'playerData.level': 1 }).lean();
        return Math.max(a, (u && u.playerData && u.playerData.level) || 1);
    }
    const fold = (x) => String(x || '').toLocaleLowerCase('hu').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    // ---------- socket ----------
    const chatPushAt = new Map();
    function attach(socket, h) {
        const username = socket.data.username;
        const { ok, bad, guard, sendAll } = h;
        const R = 'social_result';
        myTeamId(username).catch(() => { });
        const mine = async () => { const id = await myTeamId(username); return id; };

        socket.on('team_create', guard(async (d) => {
            const name = String(d.name || '').trim().replace(/\s+/g, ' '), tag = String(d.tag || '').trim().toUpperCase();
            if (await mine()) return bad(R, 'Már tagja vagy egy csapatnak.');
            if (await levelOf(username) < T.MIN_LEVEL) return bad(R, `Csapatot a ${T.MIN_LEVEL}. szinttől alapíthatsz.`);
            if (!NAME_RE.test(name)) return bad(R, 'A csapatnév 3–24 karakter: betű, szám, szóköz, pont, kötőjel.');
            if (!TAG_RE.test(tag)) return bad(R, 'A rövidítés 2–4 nagybetű vagy szám (pl. ZÓNA, ERD).');
            if (await TeamModel.findOne({ tag }).lean()) return bad(R, 'Ez a rövidítés már foglalt.');
            const all = await TeamModel.find({}, { name: 1 }).lean();
            if (all.some(x => fold(x.name) === fold(name))) return bad(R, 'Ilyen nevű csapat már van.');
            const id = 't' + crypto.randomBytes(5).toString('hex'), now = Date.now();
            const mode = T.MODES.some(m => m.key === d.mode) ? d.mode : 'request';
            await TeamModel.create({ _id: id, name, tag, owner: username, officers: [], members: [username], invites: [], requests: [], emblem: T.normEmblem(d.emblem), desc: '', board: null, mode, minLevel: 1,
                t: now, week: weekKey(now), prog: {}, qdone: {}, allDone: false, contrib: {}, joined: { [username]: now }, chat: [], log: [{ t: now, text: `🏕️ ${username} megalapította a csapatot` }], stats: { quests: 0, weeks: 0, km: 0 } });
            await setTeam(username, id);
            Admin.logEvent('team_create', username, { name, tag });
            ok(R, `🏕️ Megalapítottad: [${tag}] ${name}! Állítsd be a címert, és hívd meg a barátaidat.`); return sendAll();
        }));

        // csapatkereső: név vagy rövidítés alapján; üres keresésre a legnagyobb, még nem teli csapatok
        socket.on('team_search', guard(async (d) => {
            const q = fold(String(d.q || '').slice(0, 24));
            const u = await PlayerModel.findOne({ username }, { teamApps: 1 }).lean();
            const apps = (u && u.teamApps) || [];
            const teams = (await TeamModel.find({}).lean()).map(normalize)
                .filter(t => !staffTeam(t) || isStaff(username))
                .filter(t => !q || fold(t.name).includes(q) || fold(t.tag).includes(q))
                .sort((a, b) => (a.mode === 'invite') - (b.mode === 'invite') || (a.members.length >= T.MAX) - (b.members.length >= T.MAX) || b.members.length - a.members.length)
                .slice(0, 20);
            socket.emit('team_search_result', { q: String(d.q || ''), teams: teams.map(t => brief(t, { applied: apps.includes(t._id), full: t.members.length >= T.MAX, km: Math.round(t.stats.km || 0), quests: t.stats.quests || 0 })) });
        }));
        // jelentkezés: nyitott csapatba azonnal belép, jelentkezősbe kérelem megy, zártba nem lehet
        socket.on('team_apply', guard(async (d) => {
            if (await mine()) return bad(R, 'Már tagja vagy egy csapatnak. Előbb lépj ki belőle.');
            const id = String(d.id || ''), msg = String(d.msg || '').trim().slice(0, 120);
            const doc = await TeamModel.findById(id).lean(); if (!doc) return bad(R, 'Ez a csapat már nem létezik.');
            const t0 = normalize(doc), lv = await levelOf(username);
            if (staffTeam(t0) && !isStaff(username)) return bad(R, 'Ez a csapat már nem létezik.');
            if (t0.mode === 'invite' && !t0.invites.includes(username)) return bad(R, 'Ez zárt csapat: csak meghívóval lehet belépni.');
            if (lv < t0.minLevel) return bad(R, `Ehhez a csapathoz legalább ${t0.minLevel}. szint kell.`);
            if (t0.members.length >= T.MAX) return bad(R, 'A csapat megtelt.');
            if (t0.mode === 'open' || t0.invites.includes(username)) {
                const r = await join(username, id, t0.mode === 'open' ? 'nyitott csapat' : 'meghívó');
                if (r.error) return bad(R, r.error);
                ok(R, `🏕️ Csatlakoztál: [${r.t.tag}] ${r.t.name}!`); return sendAll();
            }
            const u = await PlayerModel.findOne({ username }, { teamApps: 1 }).lean();
            const apps = ((u && u.teamApps) || []).filter(x => x !== id);
            if (apps.length >= APPS_MAX) return bad(R, `Egyszerre legfeljebb ${APPS_MAX} csapathoz jelentkezhetsz. Vond vissza valamelyiket.`);
            const r = await withTeam(id, (t) => {
                if (!t) return nosave({ error: 'Ez a csapat már nem létezik.' });
                if (t.requests.some(x => x.name === username)) return nosave({ error: 'Már jelentkeztél ide, várd meg a választ.' });
                t.requests.push({ name: username, t: Date.now(), msg, level: lv });
                if (t.requests.length > REQ_MAX) t.requests = t.requests.slice(-REQ_MAX);
                return { ok: true };
            });
            if (r.out.error) return bad(R, r.out.error);
            await PlayerModel.updateOne({ username }, { teamApps: apps.concat([id]) });
            leaders(r.t).forEach(n => { emitTo(n, 'player_notice', { message: `🏕️ ${username} (${lv}. szint) jelentkezett a csapatba! Barátok → Csapat → Kezelés.` }); emitTo(n, 'social_ping', {}); notify(n, '🏕️ Új jelentkező', `${username} (${lv}. szint) csatlakozna a(z) ${r.t.name} csapathoz.`); });
            Admin.logEvent('team_apply', username, { team: r.t.name });
            ok(R, `📨 Jelentkeztél ide: [${r.t.tag}] ${r.t.name}. Értesítünk, ha elfogadják.`); return sendAll();
        }));
        socket.on('team_unapply', guard(async (d) => {
            const id = String(d.id || '');
            const u = await PlayerModel.findOne({ username }, { teamApps: 1 }).lean();
            await PlayerModel.updateOne({ username }, { teamApps: ((u && u.teamApps) || []).filter(x => x !== id) });
            await withTeam(id, (t) => { if (!t) return nosave(); t.requests = t.requests.filter(x => x.name !== username); });
            ok(R, 'Jelentkezés visszavonva.'); return sendAll();
        }));
        // meghívó elfogadása / elutasítása
        socket.on('team_join', guard(async (d) => {
            if (await mine()) return bad(R, 'Már tagja vagy egy csapatnak.');
            const id = String(d.id || ''); const u = await PlayerModel.findOne({ username }, { teamInvites: 1 }).lean();
            if (!((u && u.teamInvites) || []).includes(id)) return bad(R, 'Ide nincs meghívód.');
            const r = await join(username, id, 'meghívó');
            if (r.error) return bad(R, r.error);
            ok(R, `🏕️ Csatlakoztál: [${r.t.tag}] ${r.t.name}!`); return sendAll();
        }));
        socket.on('team_decline', guard(async (d) => {
            const u = await PlayerModel.findOne({ username }, { teamInvites: 1 }).lean();
            await PlayerModel.updateOne({ username }, { teamInvites: ((u && u.teamInvites) || []).filter(x => x !== String(d.id || '')) });
            return sendAll();
        }));

        // --- vezetőknek ---
        const asLeader = async (fn, ownerOnly) => {
            const id = await mine(); if (!id) return { error: 'Nem vagy csapatban.' };
            const r = await withTeam(id, async (t) => {
                if (!t) return nosave({ error: 'Nem vagy csapatban.' });
                const role = roleOf(t, username);
                if (ownerOnly ? role !== 'owner' : !(role === 'owner' || role === 'officer')) return nosave({ error: ownerOnly ? 'Ezt csak a csapat vezetője teheti meg.' : 'Ezt csak a vezető vagy a helyettes teheti meg.' });
                return fn(t, role);
            });
            return { ...(r.out || {}), t: r.t };
        };
        socket.on('team_accept', guard(async (d) => {
            const other = String(d.name || '');
            const pre = await asLeader((t) => {
                const req = t.requests.find(x => x.name === other);
                if (!req) return nosave({ error: 'Nincs ilyen jelentkező.' });
                if (t.members.length >= T.MAX) return nosave({ error: 'A csapat megtelt.' });
                t.requests = t.requests.filter(x => x.name !== other);
                return { ok: true };
            });
            if (pre.error) return bad(R, pre.error);
            if (await myTeamId(other)) return bad(R, `${other} közben másik csapatba lépett.`);
            const r = await join(other, pre.t._id, `elfogadta: ${username}`);
            if (r.error) return bad(R, r.error);
            emitTo(other, 'player_notice', { message: `🏕️ Felvettek a(z) [${r.t.tag}] ${r.t.name} csapatba!` }); emitTo(other, 'social_ping', {});
            notify(other, '🏕️ Felvettek a csapatba!', `Mostantól a(z) ${r.t.name} tagja vagy. Nézd meg a heti csapatküldetéseket!`);
            ok(R, `✓ ${other} felvéve.`); return sendAll();
        }));
        socket.on('team_reject', guard(async (d) => {
            const other = String(d.name || '');
            const r = await asLeader((t) => { if (!t.requests.some(x => x.name === other)) return nosave({ error: 'Nincs ilyen jelentkező.' }); t.requests = t.requests.filter(x => x.name !== other); return { ok: true }; });
            if (r.error) return bad(R, r.error);
            const u = await PlayerModel.findOne({ username: other }, { teamApps: 1 }).lean();
            await PlayerModel.updateOne({ username: other }, { teamApps: ((u && u.teamApps) || []).filter(x => x !== r.t._id) });
            emitTo(other, 'player_notice', { message: `🏕️ A(z) [${r.t.tag}] csapat most nem fogadta el a jelentkezésedet. Keress másikat a csapatkeresőben!` }); emitTo(other, 'social_ping', {});
            ok(R, `${other} jelentkezése elutasítva.`); return sendAll();
        }));
        // meghívás: bármelyik tag hívhat, kivéve zárt csapatban (ott csak a vezetők)
        socket.on('team_invite', guard(async (d) => {
            const id = await mine(); if (!id) return bad(R, 'Nem vagy csapatban.');
            const other = String(d.name || '').trim();
            const u = await PlayerModel.findOne({ username: other }, { username: 1, team: 1, teamInvites: 1 }).lean();
            if (!u) return bad(R, 'Nincs ilyen nevű túlélő.');
            if (u.team) return bad(R, `${other} már egy másik csapat tagja.`);
            const r = await withTeam(id, (t) => {
                if (!t) return nosave({ error: 'Nem vagy csapatban.' });
                if (staffTeam(t) && !isStaff(u.username)) return nosave({ error: STAFF_ONLY });
                if (t.mode === 'invite' && !isLeader(t, username)) return nosave({ error: 'Zárt csapatban csak a vezető és a helyettes hívhat meg.' });
                if (t.members.length >= T.MAX) return nosave({ error: `A csapat megtelt (${T.MAX} fő).` });
                t.invites = [...new Set(t.invites.concat([other]))].slice(-30);
                return { ok: true };
            });
            if (r.out.error) return bad(R, r.out.error);
            const inv = (u.teamInvites || []).filter(x => x !== id).concat([id]).slice(-5);
            await PlayerModel.updateOne({ username: other }, { teamInvites: inv });
            emitTo(other, 'player_notice', { message: `🏕️ ${username} meghívott a(z) [${r.t.tag}] ${r.t.name} csapatba! Barátok gomb → Csapat.` });
            emitTo(other, 'social_ping', {});
            notify(other, '🏕️ Csapatmeghívó', `${username} meghívott a(z) ${r.t.name} csapatba.`);
            ok(R, `Meghívó elküldve: ${other}.`); return sendAll();
        }));
        socket.on('team_kick', guard(async (d) => {
            const other = String(d.name || '');
            const id = await mine(); const doc = id && await TeamModel.findById(id).lean();
            if (!doc) return bad(R, 'Nem vagy csapatban.');
            const t = normalize(doc), me = roleOf(t, username), them = roleOf(t, other);
            if (!them || other === username) return bad(R, 'Nincs ilyen tag.');
            if (!(me === 'owner' || (me === 'officer' && them === 'member'))) return bad(R, me === 'officer' ? 'Helyettesként csak sima tagot küldhetsz el.' : 'Ezt csak a vezető vagy a helyettes teheti meg.');
            await leave(other, username); ok(R, `${other} már nem tag.`); return sendAll();
        }));
        socket.on('team_role', guard(async (d) => {
            const other = String(d.name || ''), role = String(d.role || '');
            if (!['officer', 'member', 'owner'].includes(role)) return bad(R, 'Ismeretlen szerep.');
            const r = await asLeader((t) => {
                if (!t.members.includes(other) || other === username) return nosave({ error: 'Nincs ilyen tag.' });
                t.officers = t.officers.filter(n => n !== other);
                if (role === 'officer') t.officers.push(other);
                if (role === 'owner') { t.officers.push(username); t.owner = other; t.officers = t.officers.filter(n => n !== other); }
                addLog(t, role === 'owner' ? `👑 ${username} átadta a vezetést neki: ${other}` : role === 'officer' ? `⭐ ${other} helyettes lett` : `${other} újra sima tag`);
                return { ok: true };
            }, true);
            if (r.error) return bad(R, r.error);
            emitTo(other, 'player_notice', { message: role === 'owner' ? `👑 Te lettél a(z) [${r.t.tag}] csapat vezetője!` : role === 'officer' ? `⭐ Helyettes lettél a(z) [${r.t.tag}] csapatban!` : `A(z) [${r.t.tag}] csapatban újra sima tag vagy.` });
            ping(r.t);
            ok(R, role === 'owner' ? `👑 Átadtad a vezetést: ${other}.` : 'Szerep módosítva.'); return sendAll();
        }));
        socket.on('team_settings', guard(async (d) => {
            const r = await asLeader(async (t, role) => {
                const ch = [];
                if (d.emblem) { t.emblem = T.normEmblem(d.emblem); ch.push('címer'); }
                if (typeof d.desc === 'string') { t.desc = d.desc.trim().replace(/\s+/g, ' ').slice(0, 140); ch.push('leírás'); }
                if (d.mode !== undefined) { if (role !== 'owner') return nosave({ error: 'A csatlakozás módját csak a vezető állíthatja.' }); if (T.MODES.some(m => m.key === d.mode)) { t.mode = d.mode; ch.push('csatlakozás'); } }
                if (d.minLevel !== undefined) { if (role !== 'owner') return nosave({ error: 'A minimum szintet csak a vezető állíthatja.' }); t.minLevel = Math.max(1, Math.min(99, Math.floor(Number(d.minLevel) || 1))); ch.push('min. szint'); }
                if (d.name !== undefined && String(d.name).trim() !== t.name) {
                    if (role !== 'owner') return nosave({ error: 'A nevet csak a vezető változtathatja meg.' });
                    const name = String(d.name).trim().replace(/\s+/g, ' ');
                    if (!NAME_RE.test(name)) return nosave({ error: 'A csapatnév 3–24 karakter: betű, szám, szóköz, pont, kötőjel.' });
                    const all = await TeamModel.find({}, { name: 1 }).lean();
                    if (all.some(x => x._id !== t._id && fold(x.name) === fold(name))) return nosave({ error: 'Ilyen nevű csapat már van.' });
                    addLog(t, `✏️ Új név: ${name} (korábban ${t.name})`); t.name = name; ch.push('név');
                }
                if (d.tag !== undefined && String(d.tag).trim().toUpperCase() !== t.tag) {
                    if (role !== 'owner') return nosave({ error: 'A rövidítést csak a vezető változtathatja meg.' });
                    const tag = String(d.tag).trim().toUpperCase();
                    if (!TAG_RE.test(tag)) return nosave({ error: 'A rövidítés 2–4 nagybetű vagy szám.' });
                    const other = await TeamModel.findOne({ tag }).lean();
                    if (other && other._id !== t._id) return nosave({ error: 'Ez a rövidítés már foglalt.' });
                    t.tag = tag; ch.push('rövidítés');
                }
                if (!ch.length) return nosave({ error: 'Nincs mit menteni.' });
                return { ok: true, ch };
            });
            if (r.error) return bad(R, r.error);
            ping(r.t); ok(R, `✓ Mentve (${r.ch.join(', ')}).`); return sendAll();
        }));
        socket.on('team_board', guard(async (d) => {
            const text = String(d.text || '').trim().slice(0, 200);
            const r = await asLeader((t) => { t.board = text ? { text, by: username, t: Date.now() } : null; return { ok: true }; });
            if (r.error) return bad(R, r.error);
            if (text) tell(r.t, `📌 [${r.t.tag}] ${username}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`, username); else ping(r.t);
            ok(R, text ? '📌 Kitűzve a hirdetőtáblára.' : 'Hirdetőtábla törölve.'); return sendAll();
        }));
        socket.on('team_disband', guard(async () => {
            const r = await asLeader((t) => ({ ok: true, members: t.members.slice() }), true);
            if (r.error) return bad(R, r.error);
            for (const n of r.members) if (n !== username) await leave(n, username);
            await leave(username);
            Admin.logEvent('team_disband', username, { team: r.t.name });
            ok(R, 'A csapat feloszlott.'); return sendAll();
        }));
        socket.on('team_leave', guard(async () => { const t = await leave(username); if (!t) return bad(R, 'Nem vagy csapatban.'); ok(R, 'Kiléptél a csapatból.'); return sendAll(); }));

        // --- csapat-csevegés ---
        let lastChat = 0;
        socket.on('team_chat_load', guard(async () => {
            const id = await mine(); if (!id) return socket.emit('team_chat', { all: true, list: [] });
            const d = await TeamModel.findById(id).lean();
            socket.emit('team_chat', { all: true, list: d ? normalize(d).chat.slice(-50) : [] });
        }));
        socket.on('team_chat_send', guard(async (d) => {
            const text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!text) return;
            if (Date.now() - lastChat < 1500) return bad(R, 'Lassabban írj. 🙂');
            lastChat = Date.now();
            const id = await mine(); if (!id) return bad(R, 'Nem vagy csapatban.');
            const msg = { id: crypto.randomBytes(4).toString('hex'), t: Date.now(), from: username, text };
            const r = await withTeam(id, (t) => { if (!t) return nosave(null); t.chat.push(msg); if (t.chat.length > CHAT_MAX) t.chat = t.chat.slice(-CHAT_MAX); return { ok: true }; });
            if (!r.t) return;
            r.t.members.forEach(n => emitTo(n, 'team_chat', { msg }));
            // telefonos értesítés a nem online tagoknak: tagonként legfeljebb félóránként egy
            r.t.members.filter(n => n !== username && !activePlayers[n] && Date.now() - (chatPushAt.get(n) || 0) > 30 * 60000).forEach(n => { chatPushAt.set(n, Date.now()); notify(n, `💬 [${r.t.tag}] ${username}`, text.slice(0, 100)); });
        }));
    }

    // ---------- admin ----------
    async function adminList() {
        const teams = (await TeamModel.find({}).lean()).map(normalize);
        const month = seasonMonth();
        const users = await PlayerModel.find({ team: { $in: teams.map(t => t._id) } }, { username: 1, 'playerData.season': 1, 'playerData.lastSeen': 1 }).lean();
        const byName = {}; users.forEach(u => { byName[u.username] = u; });
        const week = Date.now() - 7 * 86400000;
        return teams.map(t => {
            const pts = t.members.reduce((a, n) => { const se = byName[n] && byName[n].playerData && byName[n].playerData.season; return a + (se && se.month === month && !isStaff(n) ? se.xp || 0 : 0); }, 0);
            const active7 = t.members.filter(n => activePlayers[n] || ((byName[n] && byName[n].playerData && byName[n].playerData.lastSeen) || 0) > week).length;
            return { ...brief(t), points: pts, active7, online: t.members.filter(n => activePlayers[n]).length, created: t.t, quests: questView(t), stats: t.stats, requests: t.requests.length, chat: t.chat.length, lastChat: t.chat.length ? t.chat[t.chat.length - 1].t : null };
        }).sort((a, b) => b.points - a.points || b.members - a.members);
    }
    async function adminDetail(id) {
        const d = await TeamModel.findById(id).lean(); if (!d) return null;
        const t = normalize(d);
        return { ...brief(t), officers: t.officers, board: t.board, created: t.t, week: t.week, quests: questView(t), allDone: t.allDone, stats: t.stats,
            members: await memberRows(t), requests: t.requests, invites: t.invites, chat: t.chat.slice(-80), log: t.log.slice().reverse() };
    }
    async function adminAction(admin, id, a) {
        const act = String(a.action || '');
        if (act === 'kick') { const doc = await TeamModel.findById(id).lean(); if (!doc || !doc.members.includes(a.name)) return { error: 'Nincs ilyen tag.' }; await leave(String(a.name), `stáb (${admin})`); return { message: `${a.name} eltávolítva.` }; }
        if (act === 'disband') {
            const doc = await TeamModel.findById(id).lean(); if (!doc) return { error: 'Nincs ilyen csapat.' };
            for (const n of doc.members) await leave(n, `stáb (${admin})`);
            await TeamModel.deleteOne({ _id: id });
            return { message: `A(z) ${doc.name} csapat feloszlatva.` };
        }
        const r = await withTeam(id, (t) => {
            if (!t) return nosave({ error: 'Nincs ilyen csapat.' });
            if (act === 'chat_del') { t.chat = t.chat.filter(m => m.id !== a.msg); addLog(t, '🛡️ A stáb törölt egy üzenetet'); return { message: 'Üzenet törölve.' }; }
            if (act === 'board_clear') { t.board = null; return { message: 'Hirdetőtábla törölve.' }; }
            if (act === 'desc_clear') { t.desc = ''; return { message: 'Leírás törölve.' }; }
            if (act === 'rename') {
                const name = String(a.name || '').trim(), tag = String(a.tag || '').trim().toUpperCase();
                if (name && !NAME_RE.test(name)) return nosave({ error: 'Érvénytelen név.' });
                if (tag && !TAG_RE.test(tag)) return nosave({ error: 'Érvénytelen rövidítés.' });
                if (name) t.name = name; if (tag) t.tag = tag; addLog(t, '🛡️ A stáb átnevezte a csapatot'); return { message: 'Átnevezve.' };
            }
            if (act === 'owner') { if (!t.members.includes(a.name)) return nosave({ error: 'Nincs ilyen tag.' }); t.officers = t.officers.filter(n => n !== a.name); if (t.owner !== a.name) t.officers.push(t.owner); t.owner = a.name; addLog(t, `🛡️ A stáb kinevezte vezetőnek: ${a.name}`); return { message: 'Új vezető beállítva.' }; }
            return nosave({ error: 'Ismeretlen művelet.' });
        });
        if (r.t) ping(r.t);
        return r.out;
    }

    // admin átnevezés: a csapatokban is az új név szerepeljen
    async function renameUser(from, to) {
        const id = await myTeamId(from); teamOf.delete(from); teamOf.delete(to);
        if (!id) return;
        await withTeam(id, (t) => {
            if (!t) return nosave();
            const sw = (n) => (n === from ? to : n);
            t.members = t.members.map(sw); t.officers = t.officers.map(sw); t.owner = sw(t.owner);
            if (t.joined[from]) { t.joined[to] = t.joined[from]; delete t.joined[from]; }
            if (t.contrib[from]) { t.contrib[to] = t.contrib[from]; delete t.contrib[from]; }
        });
    }

    return { renameUser, attach, info, onWalk, onEvent, flush, board, myTeamId, adminList, adminDetail, adminAction, TeamModel };
}

module.exports = { setup, makeModel, NAME_RE, TAG_RE };
