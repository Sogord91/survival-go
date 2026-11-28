// profile.js
// JÁTÉKOSPROFIL (v0.1.25): bárki megnézheti a másik játékos profilját (szint, csapat, bemutatkozás, kiemelt statisztikák),
// a saját profilt pedig színesíteni lehet: szín, minta, jelvény, bemutatkozó szöveg, kiemelt statisztikák.
// Innen indul az üzenet, a barátkérés, a csapatmeghívás (később kereskedés, támadás).
'use strict';
const P = require('./public/js/profile-rules');

function setup(ctx) {
    const { PlayerModel, activePlayers, Admin, teams, FriendModel, pairId, xpForLevel } = ctx;
    const isStaff = (n) => (Admin.isStaffName ? Admin.isStaffName(n) : false);

    async function findUser(name) {
        name = String(name || '').trim(); if (!name) return null;
        const proj = { username: 1, avatar: 1, role: 1, earlySurvivor: 1, premium: 1, profile: 1, team: 1, dmBlocks: 1, bannedUntil: 1, _id: 1,
            'playerData.level': 1, 'playerData.xp': 1, 'playerData.stats': 1, 'playerData.season': 1, 'playerData.lastSeen': 1, 'playerData.dead': 1, 'playerData.lifeStartedAt': 1, 'playerData.quests.cells': 1 };
        let u = await PlayerModel.findOne({ username: name }, proj).lean();
        if (!u) {
            const lo = name.toLocaleLowerCase('hu');
            const hit = (await PlayerModel.find({}, { username: 1 }).lean()).filter(x => x.username && x.username.toLocaleLowerCase('hu') === lo);
            if (hit.length === 1) u = await PlayerModel.findOne({ username: hit[0].username }, proj).lean();
        }
        return u;
    }
    function joinedAt(u) {
        try { if (u._id && typeof u._id.getTimestamp === 'function') return u._id.getTimestamp().getTime(); } catch (e) { /* */ }
        return null;
    }
    async function view(viewer, name) {
        const u = await findUser(name);
        if (!u) return { error: 'Nincs ilyen nevű túlélő.' };
        const pd = u.playerData || {}, st = pd.stats || {}, pr = u.premium || {}, prof = P.normalize(u.profile);
        const me = viewer === u.username;
        const se = pd.season && pd.season.month === ctx.seasonMonth() ? pd.season : {};
        const stats = {
            xp: Math.max(st.xpTotal || 0, xpForLevel(pd.level) + (pd.xp || 0)), km: Math.round((st.walkedMeters || 0) / 100) / 10,
            cells: pd.quests && Array.isArray(pd.quests.cells) ? pd.quests.cells.length : 0, loot: st.buildingsLooted || 0, wins: st.combatsWon || 0,
            crafted: st.itemsCrafted || 0, kills: st.killsTotal || 0, deaths: st.deaths || 0,
            longestDays: Math.floor(Math.max(st.longestLifeMs || 0, pd.lifeStartedAt && !pd.dead ? Date.now() - pd.lifeStartedAt : 0) / 86400000),
            season: se.xp || 0,
            fish: Math.round((st.fishBestG || 0) / 100) / 10, fishCount: st.fishCaught || 0 // v0.1.45
        };
        // csapat
        let team = null;
        if (u.team && teams) { const t = await teams.TeamModel.findById(u.team).lean(); if (t && (!isStaff(t.owner) || isStaff(viewer))) team = { id: t._id, name: t.name, tag: t.tag, emblem: t.emblem || null }; }
        // kapcsolat a nézővel
        let friend = null;
        if (!me) { const f = await FriendModel.findById(pairId(viewer, u.username)).lean(); friend = !f ? null : f.status === 'ok' ? 'ok' : f.from === viewer ? 'out' : 'in'; }
        const friends = (await FriendModel.find({ a: u.username }).lean()).concat(await FriendModel.find({ b: u.username }).lean()).filter(f => f.status === 'ok').length;
        const v = await PlayerModel.findOne({ username: viewer }, { dmBlocks: 1, team: 1 }).lean();
        return {
            name: u.username, me, avatar: u.avatar || 'avatar1.png', level: pd.level || 1, dead: !!pd.dead, early: !!u.earlySurvivor,
            staff: isStaff(u.username), role: u.role || '', frame: pr.frame || '', title: pr.title || '',
            profile: prof, stats: prof.hideStats && !me ? null : stats, team, friends, friend,
            online: !!activePlayers[u.username], lastSeen: activePlayers[u.username] ? Date.now() : (pd.lastSeen || null), joined: joinedAt(u),
            blocked: !!(v && Array.isArray(v.dmBlocks) && v.dmBlocks.includes(u.username)),
            sameTeam: !!(v && v.team && u.team && v.team === u.team), viewerTeam: !!(v && v.team)
        };
    }

    function attach(socket) {
        const me = socket.data.username;
        let last = 0;
        socket.on('profile_get', async (d) => {
            try {
                if (Date.now() - last < 300) return; last = Date.now();
                const r = await view(me, d && d.name);
                socket.emit('profile_data', r.error ? { success: false, message: r.error } : { success: true, ...r });
            } catch (e) { console.error('Profil hiba:', e.message); socket.emit('profile_data', { success: false, message: 'Hiba történt.' }); }
        });
        socket.on('profile_set', async (d) => {
            try {
                const u = await PlayerModel.findOne({ username: me }, { profile: 1 }).lean();
                const cur = P.normalize(u && u.profile);
                const next = P.normalize({ ...cur, ...(d || {}) });
                await PlayerModel.updateOne({ username: me }, { profile: next });
                Admin.logEvent('profile_set', me, { color: next.color, pattern: next.pattern, badge: next.badge, bioLen: next.bio.length });
                socket.emit('profile_saved', { success: true, message: '✓ Profil mentve.', profile: next });
            } catch (e) { console.error('Profil mentés hiba:', e.message); socket.emit('profile_saved', { success: false, message: 'Hiba történt.' }); }
        });
        // sértő bemutatkozó szöveg jelentése a stábnak
        socket.on('profile_report', async (d) => {
            try {
                const u = await findUser(d && d.name); if (!u || u.username === me) return;
                const prof = P.normalize(u.profile), RM = Admin.models && Admin.models.ReportModel;
                if (RM) await RM.create({ t: Date.now(), at: new Date(), user: me, text: `[PROFIL JELENTÉSE] ${me} jelenti: ${u.username}\nIndok: ${String((d && d.reason) || '').slice(0, 300) || '(nincs megadva)'}\nBemutatkozás: ${prof.bio || '(üres)'}`, ua: 'profile_report', status: 'open' });
                Admin.logEvent('profile_report', me, { name: u.username });
                socket.emit('profile_saved', { success: true, message: '🛡️ Köszönjük, a stáb megnézi.' });
            } catch (e) { socket.emit('profile_saved', { success: false, message: 'Hiba történt.' }); }
        });
    }

    return { attach, view };
}

module.exports = { setup };
