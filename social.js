// social.js
// KÖZÖSSÉG (v0.1.21): meghívás ("Hozd a barátod"), barátlista napi ajándékkal, csapatok közös heti céllal,
// közösségi oldalak jutalma, megosztás jutalma, nyilvános fa-lista.
'use strict';
const crypto = require('crypto');

const REF_LEVEL = 5;                                   // ennyi szintet kell elérnie a meghívottnak a jutalomhoz
const REF_REWARD_NEW = { money: 200, xp: 150 };
const REF_REWARD_INVITER = { money: 300, xp: 300 };
const REF_TITLES = [{ at: 1, key: 'title_recruiter' }, { at: 5, key: 'title_squad' }];
const FRIENDS_MAX = 50;
const GIFTS_PER_DAY = 5;                               // naponta ennyi barátnak küldhetsz ajándékot (mindegyiknek 1-et)
const GIFT_ITEMS = [{ key: 'bandage', count: 1 }, { key: 'canned_food', count: 1 }, { key: 'water_bottle', count: 1 }, { key: 'aa_batteries', count: 1 }, { key: 'rag', count: 2 }];
const TEAM_MAX = 15, TEAM_MIN_LEVEL = 3;
const TEAM_GOAL_PER_MEMBER = 15000, TEAM_GOAL_MAX = 150000; // heti közös séta (méter)
const TEAM_REWARD = { money: 150, xp: 250 };
const SOCIAL_REWARD = { money: 100, xp: 100 };        // közösségi oldal meglátogatása (egyszer platformonként)
const SHARE_REWARD = { money: 30, xp: 50 };            // megosztás (naponta egyszer)
const PLATFORMS = [
    { key: 'discord', name: 'Discord', env: 'SOCIAL_DISCORD', icon: '💬' },
    { key: 'facebook', name: 'Facebook', env: 'SOCIAL_FACEBOOK', icon: '📘' },
    { key: 'instagram', name: 'Instagram', env: 'SOCIAL_INSTAGRAM', icon: '📸' },
    { key: 'tiktok', name: 'TikTok', env: 'SOCIAL_TIKTOK', icon: '🎵' },
    { key: 'x', name: 'X (Twitter)', env: 'SOCIAL_X', icon: '✖️' },
    { key: 'youtube', name: 'YouTube', env: 'SOCIAL_YOUTUBE', icon: '▶️' }
];
const DAY = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const pairId = (a, b) => [a, b].sort().join('|');
const NAME_RE = /^[\p{L}\p{N} ._-]{3,24}$/u;
const TAG_RE = /^[A-Z0-9ÁÉÍÓÖŐÚÜŰ]{2,4}$/;

function makeModels() {
    const mongoose = require('mongoose');
    const friend = new mongoose.Schema({ _id: String, a: String, b: String, from: String, status: String, t: Number, gifts: mongoose.Schema.Types.Mixed });
    const team = new mongoose.Schema({ _id: String, name: String, tag: String, owner: String, members: [String], invites: [String], t: Number, week: String, meters: Number, done: Boolean });
    return {
        FriendModel: mongoose.models.SurvivalFriend || mongoose.model('SurvivalFriend', friend),
        TeamModel: mongoose.models.SurvivalTeam || mongoose.model('SurvivalTeam', team)
    };
}

function platformLinks() {
    return PLATFORMS.map(p => ({ key: p.key, name: p.name, icon: p.icon, url: String(process.env[p.env] || '').trim() })).filter(p => /^https:\/\//.test(p.url));
}

function setup(ctx) {
    const { PlayerModel, withPlayer, grantXp, addItem, pushItem, itemDatabase, sendPlayerState, activePlayers, io, Admin, queueNotice, weekKey, seasonMonth } = ctx;
    const { FriendModel, TeamModel } = makeModels();
    const prem = () => (ctx.premium ? ctx.premium() : null);
    const push = () => (ctx.push ? ctx.push() : null);
    const notify = (user, title, body) => { const p = push(); if (p && !activePlayers[user]) p.notifyUser(user, { title, body, url: '/', tag: 'social' }).catch(() => { }); };
    const emitTo = (user, evt, data) => { const a = activePlayers[user]; if (a) io.to(a.socketId).emit(evt, data); };

    // ---------- jutalom kiosztása (online és offline játékosnak is) ----------
    async function reward(user, r, note, extra) {
        const res = await withPlayer(user, (p) => {
            if (p.dead) return { save: false };
            p.money += r.money || 0;
            if (r.xp) grantXp(p, r.xp);
            if (extra) extra(p);
            queueNotice(user, `${note} +${r.xp || 0} XP, +${r.money || 0} $`);
            return {};
        }).catch(() => null);
        if (res && res.p && activePlayers[user]) sendPlayerState(user, res.p);
        return !!(res && res.p);
    }

    // ---------- MEGHÍVÁS ----------
    async function ensureCode(username) {
        const u = await PlayerModel.findOne({ username }, { refCode: 1 }).lean();
        if (u && u.refCode) return u.refCode;
        for (let i = 0; i < 6; i++) {
            const code = crypto.randomBytes(4).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
            if (code.length < 5) continue;
            if (await PlayerModel.findOne({ refCode: code }, { username: 1 }).lean()) continue;
            await PlayerModel.updateOne({ username }, { refCode: code });
            return code;
        }
        return null;
    }
    // regisztrációkor: kitől jött a meghívó (a meghívó és az új játékos automatikusan barátok lesznek)
    async function onRegister(username, ref) {
        const code = String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (!code) return null;
        const inviter = await PlayerModel.findOne({ refCode: code }, { username: 1 }).lean();
        if (!inviter || inviter.username === username) return null;
        await PlayerModel.updateOne({ username }, { refBy: inviter.username });
        await FriendModel.updateOne({ _id: pairId(username, inviter.username) }, { _id: pairId(username, inviter.username), a: [username, inviter.username].sort()[0], b: [username, inviter.username].sort()[1], from: inviter.username, status: 'ok', t: Date.now() }, { upsert: true });
        Admin.logEvent('referral_join', inviter.username, { invited: username });
        emitTo(inviter.username, 'player_notice', { message: `🤝 ${username} a meghívódra regisztrált! Ha eléri az ${REF_LEVEL}. szintet, mindketten jutalmat kaptok.` });
        return inviter.username;
    }
    // a meghívott elérte az 5. szintet: mindkettőjüknek jutalom (fiókonként egyszer)
    const refChecked = new Set();
    async function checkReferral(username, level) {
        if (level < REF_LEVEL || refChecked.has(username)) return;
        refChecked.add(username);
        const u = await PlayerModel.findOne({ username }, { refBy: 1, refRewarded: 1 }).lean();
        if (!u || !u.refBy || u.refRewarded) return;
        await PlayerModel.updateOne({ username }, { refRewarded: true });
        const inviter = u.refBy;
        await reward(username, REF_REWARD_NEW, `🤝 Elérted az ${REF_LEVEL}. szintet, ${inviter} meghívója jutalma:`);
        const iv = await PlayerModel.findOne({ username: inviter }, { refDone: 1 }).lean();
        const done = ((iv && iv.refDone) || 0) + 1;
        await PlayerModel.updateOne({ username: inviter }, { refDone: done });
        await reward(inviter, REF_REWARD_INVITER, `🤝 ${username} elérte az ${REF_LEVEL}. szintet, a meghívásod jutalma:`);
        const title = REF_TITLES.find(t => t.at === done);
        if (title && prem()) { try { await prem().grantCosmetic(inviter, title.key); emitTo(inviter, 'player_notice', { message: '🏅 Új cím a Gyűjteményedben a toborzásért!' }); } catch (e) { /* */ } }
        notify(inviter, '🤝 Megjött a meghívásod jutalma!', `${username} elérte az ${REF_LEVEL}. szintet: +${REF_REWARD_INVITER.xp} XP, +${REF_REWARD_INVITER.money} $.`);
        Admin.logEvent('referral_reward', inviter, { invited: username, done });
    }

    // ---------- BARÁTOK ----------
    async function friendsOf(username) {
        const [x, y] = await Promise.all([FriendModel.find({ a: username }).lean(), FriendModel.find({ b: username }).lean()]);
        return x.concat(y).map(f => ({ ...f, other: f.a === username ? f.b : f.a }));
    }
    async function friendList(username) {
        const list = await friendsOf(username);
        const names = list.map(f => f.other);
        const users = names.length ? await PlayerModel.find({ username: { $in: names } }, { username: 1, team: 1, 'playerData.level': 1, 'playerData.lastSeen': 1, 'playerData.season': 1, 'playerData.dead': 1 }).lean() : [];
        const byName = {}; users.forEach(u => { byName[u.username] = u; });
        const today = DAY(Date.now()), month = seasonMonth();
        const out = list.map(f => {
            const u = byName[f.other] || {}, pd = u.playerData || {};
            const se = pd.season && pd.season.month === month ? pd.season : {};
            const sentToday = f.gifts && f.gifts[username] === today;
            return { name: f.other, status: f.status, incoming: f.status === 'pending' && f.from !== username, outgoing: f.status === 'pending' && f.from === username,
                online: !!activePlayers[f.other], level: pd.level || 1, km: Math.round((se.meters || 0) / 100) / 10, points: se.xp || 0, lastSeen: pd.lastSeen || null, canGift: f.status === 'ok' && !sentToday };
        });
        out.sort((p, q) => (q.incoming - p.incoming) || (q.online - p.online) || (q.points - p.points));
        return out;
    }
    async function giftsSentToday(username) {
        const today = DAY(Date.now());
        return (await friendsOf(username)).filter(f => f.gifts && f.gifts[username] === today).length;
    }

    // ---------- CSAPATOK ----------
    const teamOf = new Map(); // username -> csapat id (gyorsítótár a heti közös sétához)
    async function myTeamId(username) {
        if (teamOf.has(username)) return teamOf.get(username);
        const u = await PlayerModel.findOne({ username }, { team: 1 }).lean();
        const id = (u && u.team) || null; teamOf.set(username, id); return id;
    }
    function teamGoal(t) { return Math.min(TEAM_GOAL_MAX, TEAM_GOAL_PER_MEMBER * Math.max(1, (t.members || []).length)); }
    function freshWeek(t) { const wk = weekKey(Date.now()); if (t.week !== wk) { t.week = wk; t.meters = 0; t.done = false; } return t; }
    async function teamInfo(username) {
        const id = await myTeamId(username);
        const u = await PlayerModel.findOne({ username }, { teamInvites: 1 }).lean();
        const inviteIds = (u && u.teamInvites) || [];
        const invites = [];
        for (const tid of inviteIds.slice(0, 5)) { const t = await TeamModel.findById(tid).lean(); if (t) invites.push({ id: t._id, name: t.name, tag: t.tag, members: t.members.length }); }
        if (!id) return { team: null, invites };
        const t = await TeamModel.findById(id).lean();
        if (!t) { teamOf.set(username, null); return { team: null, invites }; }
        freshWeek(t);
        const users = await PlayerModel.find({ username: { $in: t.members } }, { username: 1, 'playerData.level': 1, 'playerData.season': 1 }).lean();
        const month = seasonMonth();
        const members = t.members.map(n => { const x = users.find(v => v.username === n) || {}; const pd = x.playerData || {}; const se = pd.season && pd.season.month === month ? pd.season : {};
            return { name: n, level: pd.level || 1, online: !!activePlayers[n], points: se.xp || 0, owner: n === t.owner }; }).sort((a, b) => b.points - a.points);
        return { team: { id: t._id, name: t.name, tag: t.tag, owner: t.owner, members, invited: t.invites || [], meters: Math.round(t.meters || 0), goal: teamGoal(t), done: !!t.done, points: members.reduce((a, m) => a + m.points, 0), max: TEAM_MAX }, invites };
    }
    // séta: a csapat heti közös céljához (memóriában gyűjtjük, percenként mentjük)
    const pendingMeters = new Map();
    function onWalk(username, meters) {
        if (!(meters > 0)) return;
        const id = teamOf.get(username);
        if (id === undefined) { myTeamId(username).catch(() => { }); return; }
        if (!id) return;
        pendingMeters.set(id, (pendingMeters.get(id) || 0) + meters);
    }
    async function flushTeams() {
        const list = [...pendingMeters.entries()]; pendingMeters.clear();
        for (const [id, m] of list) {
            const t = await TeamModel.findById(id).lean(); if (!t) continue;
            freshWeek(t);
            const before = t.meters || 0; t.meters = before + m;
            const reached = !t.done && t.meters >= teamGoal(t);
            await TeamModel.updateOne({ _id: id }, { week: t.week, meters: t.meters, done: t.done || reached });
            if (reached) {
                Admin.logEvent('team_goal', t.owner, { team: t.name, members: t.members.length });
                for (const n of t.members) {
                    await reward(n, TEAM_REWARD, `🏕️ A(z) [${t.tag}] csapat teljesítette a heti közös célt!`);
                    notify(n, '🏕️ Megvan a csapat heti célja!', `A(z) ${t.name} együtt ${Math.round(t.meters / 1000)} km-t gyalogolt. Jutalmad: +${TEAM_REWARD.xp} XP, +${TEAM_REWARD.money} $.`);
                }
            }
        }
    }
    if (!process.env.SG_NO_TIMERS) setInterval(() => flushTeams().catch(e => console.error('Csapat mentés hiba:', e.message)), 60000);
    // csapat-ranglista: a tagok havi szezonpontjainak összege (a stáb pontja nem számít)
    async function teamBoard(rows) {
        const teams = await TeamModel.find({}).lean();
        const byUser = {}; rows.forEach(r => { byUser[r.name] = r; });
        return teams.map(t => ({ id: t._id, name: `[${t.tag}] ${t.name}`, tag: t.tag, members: t.members.length, xp: t.members.reduce((a, n) => a + ((byUser[n] && byUser[n].xp) || 0), 0), memberNames: t.members }))
            .filter(t => t.xp > 0).sort((a, b) => b.xp - a.xp);
    }

    // ---------- socket ----------
    function attach(socket) {
        const username = socket.data.username;
        const ok = (evt, message, extra) => socket.emit(evt, { success: true, message, ...(extra || {}) });
        const bad = (evt, message) => socket.emit(evt, { success: false, message });
        const guard = (fn) => (data) => { Promise.resolve(fn(data || {})).catch(e => { console.error('Közösség hiba:', e); bad('social_result', 'Hiba történt, próbáld újra.'); }); };
        myTeamId(username).catch(() => { });

        const sendAll = async () => {
            const [friends, team, code, u] = await Promise.all([friendList(username), teamInfo(username), ensureCode(username), PlayerModel.findOne({ username }, { refDone: 1, socialClaimed: 1, shareDay: 1 }).lean()]);
            const joined = await PlayerModel.countDocuments({ refBy: username });
            const host = (socket.handshake && socket.handshake.headers && socket.handshake.headers.host) || 'survivalgo.hu';
            socket.emit('social_state', {
                friends, team: team.team, teamInvites: team.invites, giftsLeft: Math.max(0, GIFTS_PER_DAY - await giftsSentToday(username)),
                ref: { code, link: `https://${host}/?ref=${code}`, joined, done: (u && u.refDone) || 0, level: REF_LEVEL, rewardNew: REF_REWARD_NEW, rewardInviter: REF_REWARD_INVITER },
                platforms: platformLinks().map(p => ({ ...p, claimed: ((u && u.socialClaimed) || []).includes(p.key) })), socialReward: SOCIAL_REWARD,
                share: { reward: SHARE_REWARD, done: !!(u && u.shareDay === DAY(Date.now())) },
                teamRules: { max: TEAM_MAX, minLevel: TEAM_MIN_LEVEL, perMember: TEAM_GOAL_PER_MEMBER, reward: TEAM_REWARD }
            });
        };
        socket.on('social_state', guard(sendAll));

        // --- barátok ---
        socket.on('friend_request', guard(async (d) => {
            const name = String(d.name || '').trim();
            if (!name || name === username) return bad('social_result', 'Adj meg egy másik játékosnevet.');
            const target = await PlayerModel.findOne({ username: name }, { username: 1 }).lean()
                || await PlayerModel.findOne({ usernameLower: name.toLocaleLowerCase('hu') }, { username: 1 }).lean();
            if (!target) return bad('social_result', 'Nincs ilyen nevű túlélő.');
            const other = target.username, id = pairId(username, other);
            const ex = await FriendModel.findById(id).lean();
            if (ex && ex.status === 'ok') return bad('social_result', `${other} már a barátod.`);
            if ((await friendsOf(username)).length >= FRIENDS_MAX) return bad('social_result', `Legfeljebb ${FRIENDS_MAX} barátod lehet.`);
            if (ex && ex.status === 'pending' && ex.from === other) {
                await FriendModel.updateOne({ _id: id }, { status: 'ok', t: Date.now() });
                Admin.logEvent('friend_add', username, { other });
                emitTo(other, 'player_notice', { message: `👥 ${username} elfogadta a barátkérésedet!` });
                ok('social_result', `👥 ${other} mostantól a barátod!`); return sendAll();
            }
            if (ex) return bad('social_result', 'A kérésed már elment, várd meg, amíg elfogadja.');
            const [a, b] = [username, other].sort();
            await FriendModel.updateOne({ _id: id }, { _id: id, a, b, from: username, status: 'pending', t: Date.now() }, { upsert: true });
            emitTo(other, 'player_notice', { message: `👥 ${username} barátnak jelölt! Fogadd el a Barátok gombon.` });
            emitTo(other, 'social_ping', {});
            notify(other, '👥 Barátkérés', `${username} barátnak jelölt a Survival GO-ban.`);
            ok('social_result', `Barátkérés elküldve neki: ${other}.`); return sendAll();
        }));
        socket.on('friend_accept', guard(async (d) => {
            const other = String(d.name || ''); const id = pairId(username, other);
            const ex = await FriendModel.findById(id).lean();
            if (!ex || ex.status !== 'pending' || ex.from === username) return bad('social_result', 'Nincs ilyen kérés.');
            await FriendModel.updateOne({ _id: id }, { status: 'ok', t: Date.now() });
            Admin.logEvent('friend_add', username, { other });
            emitTo(other, 'player_notice', { message: `👥 ${username} elfogadta a barátkérésedet!` });
            ok('social_result', `👥 ${other} mostantól a barátod!`); return sendAll();
        }));
        socket.on('friend_remove', guard(async (d) => {
            const other = String(d.name || '');
            await FriendModel.deleteOne({ _id: pairId(username, other) });
            ok('social_result', 'Eltávolítva.'); return sendAll();
        }));
        socket.on('friend_gift', guard(async (d) => {
            const other = String(d.name || ''); const id = pairId(username, other);
            const f = await FriendModel.findById(id).lean();
            if (!f || f.status !== 'ok') return bad('social_result', 'Csak barátnak küldhetsz ajándékot.');
            const today = DAY(Date.now());
            if (f.gifts && f.gifts[username] === today) return bad('social_result', 'Neki ma már küldtél. Holnap újra!');
            if (await giftsSentToday(username) >= GIFTS_PER_DAY) return bad('social_result', `Naponta ${GIFTS_PER_DAY} barátnak küldhetsz ajándékot.`);
            const g = GIFT_ITEMS[Math.floor(Math.random() * GIFT_ITEMS.length)];
            const name = itemDatabase[g.key] ? itemDatabase[g.key].name : g.key;
            const r = await withPlayer(other, (p) => {
                if (p.dead) return { save: false, error: 'dead' };
                if (!addItem(p, g.key, g.count).ok) {
                    if (p.shelter && Array.isArray(p.shelter.stash)) pushItem({ inventory: p.shelter.stash }, g.key, g.count); else p.money += 20;
                }
                queueNotice(other, `🎁 ${username} ajándékot küldött: ${g.count > 1 ? g.count + ' ' : ''}${name}!`);
                return {};
            });
            if (!r || r.result.error) return bad('social_result', 'Most nem tudod neki elküldeni.');
            if (activePlayers[other]) sendPlayerState(other, r.p);
            await FriendModel.updateOne({ _id: id }, { gifts: { ...(f.gifts || {}), [username]: today } });
            notify(other, '🎁 Ajándékot kaptál!', `${username} küldött neked: ${name}. Nézz be a Zónába!`);
            // napi küldetés: küldj ajándékot egy barátodnak
            await withPlayer(username, (p) => { ctx.questEvent(p, username, 'fgift'); return {}; }).then(x => { if (x && x.p) sendPlayerState(username, x.p); }).catch(() => { });
            Admin.logEvent('friend_gift', username, { other, item: g.key });
            ok('social_result', `🎁 Elküldted neki (${other}): ${name}.`); return sendAll();
        }));

        // --- csapat ---
        socket.on('team_create', guard(async (d) => {
            const name = String(d.name || '').trim().replace(/\s+/g, ' '), tag = String(d.tag || '').trim().toUpperCase();
            if (await myTeamId(username)) return bad('social_result', 'Már tagja vagy egy csapatnak.');
            const lv = (activePlayers[username] && activePlayers[username].level) || 1;
            if (lv < TEAM_MIN_LEVEL) return bad('social_result', `Csapatot a ${TEAM_MIN_LEVEL}. szinttől alapíthatsz.`);
            if (!NAME_RE.test(name)) return bad('social_result', 'A csapatnév 3–24 karakter: betű, szám, szóköz, pont, kötőjel.');
            if (!TAG_RE.test(tag)) return bad('social_result', 'A rövidítés 2–4 nagybetű vagy szám (pl. ZÓNA, ERD).');
            if (await TeamModel.findOne({ tag }).lean()) return bad('social_result', 'Ez a rövidítés már foglalt.');
            const id = 't' + crypto.randomBytes(5).toString('hex');
            await TeamModel.create({ _id: id, name, tag, owner: username, members: [username], invites: [], t: Date.now(), week: weekKey(Date.now()), meters: 0, done: false });
            await PlayerModel.updateOne({ username }, { team: id, teamInvites: [] });
            teamOf.set(username, id);
            Admin.logEvent('team_create', username, { name, tag });
            ok('social_result', `🏕️ Megalapítottad: [${tag}] ${name}! Hívd meg a barátaidat.`); return sendAll();
        }));
        socket.on('team_invite', guard(async (d) => {
            const id = await myTeamId(username); if (!id) return bad('social_result', 'Nem vagy csapatban.');
            const t = await TeamModel.findById(id).lean(); const other = String(d.name || '');
            if (t.members.length >= TEAM_MAX) return bad('social_result', `A csapat megtelt (${TEAM_MAX} fő).`);
            const u = await PlayerModel.findOne({ username: other }, { username: 1, team: 1, teamInvites: 1 }).lean();
            if (!u) return bad('social_result', 'Nincs ilyen nevű túlélő.');
            if (u.team) return bad('social_result', `${other} már egy másik csapat tagja.`);
            const inv = (u.teamInvites || []).filter(x => x !== id).concat([id]).slice(-5);
            await PlayerModel.updateOne({ username: other }, { teamInvites: inv });
            await TeamModel.updateOne({ _id: id }, { invites: [...new Set((t.invites || []).concat([other]))].slice(-30) });
            emitTo(other, 'player_notice', { message: `🏕️ ${username} meghívott a(z) [${t.tag}] ${t.name} csapatba! Barátok gomb → Csapat.` });
            emitTo(other, 'social_ping', {});
            notify(other, '🏕️ Csapatmeghívó', `${username} meghívott a(z) ${t.name} csapatba.`);
            ok('social_result', `Meghívó elküldve: ${other}.`); return sendAll();
        }));
        socket.on('team_join', guard(async (d) => {
            if (await myTeamId(username)) return bad('social_result', 'Már tagja vagy egy csapatnak.');
            const id = String(d.id || ''); const u = await PlayerModel.findOne({ username }, { teamInvites: 1 }).lean();
            if (!((u && u.teamInvites) || []).includes(id)) return bad('social_result', 'Ide nincs meghívód.');
            const t = await TeamModel.findById(id).lean(); if (!t) return bad('social_result', 'Ez a csapat már nem létezik.');
            if (t.members.length >= TEAM_MAX) return bad('social_result', 'A csapat megtelt.');
            await TeamModel.updateOne({ _id: id }, { members: t.members.concat([username]), invites: (t.invites || []).filter(x => x !== username) });
            await PlayerModel.updateOne({ username }, { team: id, teamInvites: [] });
            teamOf.set(username, id);
            t.members.forEach(n => emitTo(n, 'player_notice', { message: `🏕️ ${username} csatlakozott a csapathoz!` }));
            Admin.logEvent('team_join', username, { team: t.name });
            ok('social_result', `🏕️ Csatlakoztál: [${t.tag}] ${t.name}!`); return sendAll();
        }));
        socket.on('team_decline', guard(async (d) => {
            const u = await PlayerModel.findOne({ username }, { teamInvites: 1 }).lean();
            await PlayerModel.updateOne({ username }, { teamInvites: ((u && u.teamInvites) || []).filter(x => x !== String(d.id || '')) });
            return sendAll();
        }));
        const leave = async (who, byOwner) => {
            const id = await myTeamId(who); if (!id) return null;
            const t = await TeamModel.findById(id).lean(); if (!t) return null;
            const members = t.members.filter(n => n !== who);
            await PlayerModel.updateOne({ username: who }, { team: null });
            teamOf.set(who, null);
            if (!members.length) { await TeamModel.deleteOne({ _id: id }); return t; }
            await TeamModel.updateOne({ _id: id }, { members, owner: t.owner === who ? members[0] : t.owner });
            if (byOwner) emitTo(who, 'player_notice', { message: `🏕️ Kikerültél a(z) [${t.tag}] csapatból.` });
            return t;
        };
        socket.on('team_leave', guard(async () => { const t = await leave(username); if (!t) return bad('social_result', 'Nem vagy csapatban.'); ok('social_result', 'Kiléptél a csapatból.'); return sendAll(); }));
        socket.on('team_kick', guard(async (d) => {
            const id = await myTeamId(username); const t = id && await TeamModel.findById(id).lean();
            if (!t || t.owner !== username) return bad('social_result', 'Csak az alapító küldhet el tagot.');
            const other = String(d.name || ''); if (!t.members.includes(other) || other === username) return bad('social_result', 'Nincs ilyen tag.');
            await leave(other, true); ok('social_result', `${other} már nem tag.`); return sendAll();
        }));

        // --- közösségi oldalak és megosztás ---
        const visits = {};
        socket.on('social_visit', (d) => { const k = String((d && d.key) || ''); if (PLATFORMS.some(p => p.key === k)) visits[k] = Date.now(); });
        socket.on('social_claim', guard(async (d) => {
            const k = String(d.key || ''); const pl = platformLinks().find(p => p.key === k);
            if (!pl) return bad('social_result', 'Ismeretlen oldal.');
            if (!visits[k] || Date.now() - visits[k] < 8000) return bad('social_result', `Előbb nézz be: ${pl.name}, aztán gyere vissza a jutalomért!`);
            const u = await PlayerModel.findOne({ username }, { socialClaimed: 1 }).lean();
            const got = (u && u.socialClaimed) || [];
            if (got.includes(k)) return bad('social_result', 'Ezt a jutalmat már megkaptad.');
            await PlayerModel.updateOne({ username }, { socialClaimed: got.concat([k]) });
            await reward(username, SOCIAL_REWARD, `${pl.icon} Köszönjük, hogy benéztél: ${pl.name}!`);
            Admin.logEvent('social_claim', username, { platform: k });
            ok('social_result', `${pl.icon} Jutalom: +${SOCIAL_REWARD.xp} XP, +${SOCIAL_REWARD.money} $`); return sendAll();
        }));
        socket.on('share_done', guard(async (d) => {
            const kind = String(d.kind || 'card').slice(0, 20), today = DAY(Date.now());
            const u = await PlayerModel.findOne({ username }, { shareDay: 1 }).lean();
            Admin.logEvent('share', username, { kind });
            await withPlayer(username, (p) => { ctx.questEvent(p, username, 'share'); return {}; }).then(x => { if (x && x.p) sendPlayerState(username, x.p); }).catch(() => { });
            if (u && u.shareDay === today) return ok('social_result', '📸 Köszönjük a megosztást!');
            await PlayerModel.updateOne({ username }, { shareDay: today });
            await reward(username, SHARE_REWARD, '📸 Köszönjük a megosztást! Napi megosztási jutalom:');
            ok('social_result', `📸 Napi megosztási jutalom: +${SHARE_REWARD.xp} XP, +${SHARE_REWARD.money} $`); return sendAll();
        }));
    }

    return { attach, onRegister, checkReferral, onWalk, flushTeams, teamBoard, friendsOf, REF_LEVEL, models: { FriendModel, TeamModel } };
}

module.exports = { setup, PLATFORMS, REF_LEVEL, GIFT_ITEMS };
