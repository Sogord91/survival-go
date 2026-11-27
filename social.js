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
const SOCIAL_REWARD = { money: 100, xp: 100 };        // közösségi oldal meglátogatása (egyszer platformonként)
const SHARE_REWARD = { money: 30, xp: 50 };            // megosztás (naponta egyszer)
// MEGOSZTÁSI KAMPÁNY (v0.1.26.6): a nagy frissítés plakátja – aki a játékból megosztja, egyszer külön jutalmat kap (a Fagyos Csendig)
const CAMPAIGN = { key: 'upd2611', until: '2026-11-30', reward: { money: 250, xp: 250 }, img: '/images/promo/frissites-2611.jpg',
    text: 'Nagy frissítés a Survival GO-ban: támadás (PvP), profilok, privát üzenetek, csapatkassza és teljes ranglista! Gyere te is a Zónába – ezzel a linkkel mindketten jutalmat kapunk:' };
const campaignOn = (now) => DAY(now) <= CAMPAIGN.until;
const PLATFORMS = [
    { key: 'discord', name: 'Discord', env: 'SOCIAL_DISCORD', icon: '💬', url: 'https://discord.gg/PN4w2VACfh' },
    { key: 'facebook', name: 'Facebook', env: 'SOCIAL_FACEBOOK', icon: '📘', url: 'https://www.facebook.com/profile.php?id=61596336031862' },
    { key: 'instagram', name: 'Instagram', env: 'SOCIAL_INSTAGRAM', icon: '📸' },
    { key: 'tiktok', name: 'TikTok', env: 'SOCIAL_TIKTOK', icon: '🎵' },
    { key: 'x', name: 'X (Twitter)', env: 'SOCIAL_X', icon: '✖️' },
    { key: 'youtube', name: 'YouTube', env: 'SOCIAL_YOUTUBE', icon: '▶️' }
];
const DAY = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const pairId = (a, b) => [a, b].sort().join('|');

function makeModels() {
    const mongoose = require('mongoose');
    const friend = new mongoose.Schema({ _id: String, a: String, b: String, from: String, status: String, t: Number, gifts: mongoose.Schema.Types.Mixed });
    return {
        FriendModel: mongoose.models.SurvivalFriend || mongoose.model('SurvivalFriend', friend),
        TeamModel: require('./teams').makeModel()
    };
}

function platformLinks() {
    // az env felülírja a beépített linket (új oldal: elég az env fájlba írni, pl. SOCIAL_TIKTOK=https://...)
    return PLATFORMS.map(p => ({ key: p.key, name: p.name, icon: p.icon, url: String(process.env[p.env] || p.url || '').trim() })).filter(p => /^https:\/\//.test(p.url));
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
        await FriendModel.updateOne({ _id: pairId(username, inviter.username) }, { a: [username, inviter.username].sort()[0], b: [username, inviter.username].sort()[1], from: inviter.username, status: 'ok', t: Date.now() }, { upsert: true });
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
    // névkeresés: kis- és nagybetű, valamint ékezet nélkül is megtalálja (pl. "peti" → "Peti", "arpad" → "Árpád")
    const fold = (x) => String(x || '').toLocaleLowerCase('hu').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    async function findPlayer(name) {
        const exact = await PlayerModel.findOne({ username: name }, { username: 1 }).lean();
        if (exact) return exact;
        const f = fold(name);
        const all = await PlayerModel.find({}, { username: 1 }).lean();
        const ci = all.filter(u => u.username && u.username.toLocaleLowerCase('hu') === name.toLocaleLowerCase('hu'));
        if (ci.length === 1) return ci[0];
        const hit = all.filter(u => fold(u.username) === f);
        return hit.length === 1 ? hit[0] : null;
    }
    async function searchNames(q, me) {
        const f = fold(q); if (f.length < 2) return [];
        const all = await PlayerModel.find({}, { username: 1, 'playerData.level': 1 }).lean();
        const meF = fold(me);
        return all.filter(u => u.username && fold(u.username) !== meF && fold(u.username).includes(f))
            .sort((x, y) => (fold(x.username).startsWith(f) ? 0 : 1) - (fold(y.username).startsWith(f) ? 0 : 1) || x.username.length - y.username.length)
            .slice(0, 8).map(u => u.username);
    }
    async function friendsOf(username) {
        const [x, y] = await Promise.all([FriendModel.find({ a: username }).lean(), FriendModel.find({ b: username }).lean()]);
        return x.concat(y).map(f => ({ ...f, other: f.a === username ? f.b : f.a }));
    }
    async function friendList(username) {
        const list = await friendsOf(username);
        const names = list.map(f => f.other);
        const users = names.length ? await PlayerModel.find({ username: { $in: names } }, { username: 1, team: 1, avatar: 1, 'playerData.level': 1, 'playerData.lastSeen': 1, 'playerData.season': 1, 'playerData.dead': 1 }).lean() : [];
        const byName = {}; users.forEach(u => { byName[u.username] = u; });
        const today = DAY(Date.now()), month = seasonMonth();
        const out = list.map(f => {
            const u = byName[f.other] || {}, pd = u.playerData || {};
            const se = pd.season && pd.season.month === month ? pd.season : {};
            const sentToday = f.gifts && f.gifts[username] === today;
            return { name: f.other, status: f.status, incoming: f.status === 'pending' && f.from !== username, outgoing: f.status === 'pending' && f.from === username,
                online: !!activePlayers[f.other], avatar: /^avatar\d+\.png$/.test(u.avatar || '') ? u.avatar : 'avatar1.png', level: pd.level || 1, km: Math.round((se.meters || 0) / 100) / 10, points: se.xp || 0, lastSeen: pd.lastSeen || null, canGift: f.status === 'ok' && !sentToday };
        });
        out.sort((p, q) => (q.incoming - p.incoming) || (q.online - p.online) || (q.points - p.points));
        return out;
    }
    async function giftsSentToday(username) {
        const today = DAY(Date.now());
        return (await friendsOf(username)).filter(f => f.gifts && f.gifts[username] === today).length;
    }

    // ---------- CSAPATOK (teams.js, v0.1.22) ----------
    const teams = require('./teams').setup({ PlayerModel, activePlayers, Admin, weekKey, seasonMonth, reward, notify, emitTo, TeamModel, withPlayer, sendPlayerState, premium: ctx.premium });
    const onWalk = (u, m) => teams.onWalk(u, m);
    // ---------- JÁTÉKOSPROFIL (profile.js, v0.1.25) ----------
    const profile = require('./profile').setup({ PlayerModel, activePlayers, Admin, teams, FriendModel, pairId, seasonMonth, xpForLevel: ctx.xpForLevel || ((L) => 50 * Math.max(1, L || 1) * (Math.max(1, L || 1) - 1)) });
    // ---------- PRIVÁT ÜZENETEK (dm.js, v0.1.25) ----------
    const dm = require('./dm').setup({ PlayerModel, activePlayers, Admin, emitTo, notify,
        isFriend: async (a, b) => { const f = await FriendModel.findById(pairId(a, b)).lean(); return !!(f && f.status === 'ok'); },
        levelOf: async (n) => { const a = (activePlayers[n] && activePlayers[n].level) || 0; const u = await PlayerModel.findOne({ username: n }, { 'playerData.level': 1 }).lean(); return Math.max(a, (u && u.playerData && u.playerData.level) || 1); } });
    const flushTeams = () => teams.flush();
    const teamBoard = (rows) => teams.board(rows);

    // ---------- socket ----------
    function attach(socket) {
        const username = socket.data.username;
        const ok = (evt, message, extra) => socket.emit(evt, { success: true, message, ...(extra || {}) });
        const bad = (evt, message) => socket.emit(evt, { success: false, message });
        const guard = (fn) => (data) => { Promise.resolve(fn(data || {})).catch(e => { console.error('Közösség hiba:', e); bad('social_result', 'Hiba történt, próbáld újra.'); }); };
        const sendAll = async () => {
            const [friends, team, code, u] = await Promise.all([friendList(username), teams.info(username), ensureCode(username), PlayerModel.findOne({ username }, { refDone: 1, socialClaimed: 1, shareDay: 1 }).lean()]);
            const campDone = ((u && u.socialClaimed) || []).includes('camp:' + CAMPAIGN.key);
            const joined = await PlayerModel.countDocuments({ refBy: username });
            const host = (socket.handshake && socket.handshake.headers && socket.handshake.headers.host) || 'survivalgo.hu';
            socket.emit('social_state', {
                friends, team: team.team, teamInvites: team.invites, teamApps: team.apps, giftsLeft: Math.max(0, GIFTS_PER_DAY - await giftsSentToday(username)),
                ref: { code, link: `https://${host}/?ref=${code}`, joined, done: (u && u.refDone) || 0, level: REF_LEVEL, rewardNew: REF_REWARD_NEW, rewardInviter: REF_REWARD_INVITER },
                platforms: platformLinks().map(p => ({ ...p, claimed: ((u && u.socialClaimed) || []).includes(p.key) })), socialReward: SOCIAL_REWARD,
                share: { reward: SHARE_REWARD, done: !!(u && u.shareDay === DAY(Date.now())) },
                campaign: campaignOn(Date.now()) ? { key: CAMPAIGN.key, until: CAMPAIGN.until, reward: CAMPAIGN.reward, img: CAMPAIGN.img, text: CAMPAIGN.text, done: campDone } : null,
                teamRules: { ...team.rules, crystals: !!(ctx.premium && ctx.premium() && ctx.premium().enabledFor && ctx.premium().enabledFor(socket.data.role)) }
            });
        };
        socket.on('social_state', guard(sendAll));

        // --- barátok ---
        socket.on('friend_request', guard(async (d) => {
            const name = String(d.name || '').trim();
            if (!name || name === username) return bad('social_result', 'Adj meg egy másik játékosnevet.');
            const target = await findPlayer(name);
            if (!target) {
                const sug = await searchNames(name, username);
                return bad('social_result', sug.length ? `Nincs pontosan ilyen nevű túlélő. Erre gondoltál: ${sug.slice(0, 3).join(', ')}?` : 'Nincs ilyen nevű túlélő. Figyelj a pontos írásra!');
            }
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
            await FriendModel.updateOne({ _id: id }, { $set: { a, b, from: username, status: 'pending', t: Date.now() } }, { upsert: true });
            emitTo(other, 'player_notice', { message: `👥 ${username} barátnak jelölt! Fogadd el a Barátok gombon.` });
            emitTo(other, 'social_ping', {});
            notify(other, '👥 Barátkérés', `${username} barátnak jelölt a Survival GO-ban.`);
            ok('social_result', `Barátkérés elküldve neki: ${other}.`); return sendAll();
        }));
        socket.on('friend_search', guard(async (d) => {
            const q = String(d.q || '').trim().slice(0, 24);
            socket.emit('friend_search_result', { q, names: await searchNames(q, username) });
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

        // --- csapat (teams.js) ---
        teams.attach(socket, { ok, bad, guard, sendAll });
        dm.attach(socket);
        profile.attach(socket);

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
            // kampány: a frissítés plakátjának megosztásáért egyszer külön jutalom (a határidőig)
            if (kind === 'campaign' && campaignOn(Date.now())) {
                const ck = 'camp:' + CAMPAIGN.key;
                const cu = await PlayerModel.findOne({ username }, { socialClaimed: 1 }).lean();
                if (!((cu && cu.socialClaimed) || []).includes(ck)) {
                    const got = await reward(username, CAMPAIGN.reward, '📣 Köszönjük, hogy megosztottad a nagy frissítést!');
                    if (got) { await PlayerModel.updateOne({ username }, { $addToSet: { socialClaimed: ck } }); Admin.logEvent('campaign_share', username, { key: CAMPAIGN.key }); }
                }
            }
            await withPlayer(username, (p) => { ctx.questEvent(p, username, 'share'); return {}; }).then(x => { if (x && x.p) sendPlayerState(username, x.p); }).catch(() => { });
            if (u && u.shareDay === today) return ok('social_result', '📸 Köszönjük a megosztást!');
            await PlayerModel.updateOne({ username }, { shareDay: today });
            await reward(username, SHARE_REWARD, '📸 Köszönjük a megosztást! Napi megosztási jutalom:');
            ok('social_result', `📸 Napi megosztási jutalom: +${SHARE_REWARD.xp} XP, +${SHARE_REWARD.money} $`); return sendAll();
        }));
    }

    return { dm, reward, attach, onRegister, checkReferral, onWalk, flushTeams, teamBoard, friendsOf, teams, onTeamEvent: (u, k, n) => teams.onEvent(u, k, n), REF_LEVEL, models: { FriendModel, TeamModel } };
}

module.exports = { setup, CAMPAIGN, PLATFORMS, REF_LEVEL, GIFT_ITEMS };
