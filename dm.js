// dm.js
// PRIVÁT ÜZENETEK (v0.1.25): két játékos közötti beszélgetés.
// Védelem: tiltás (block), "csak barátok írhatnak" beállítás, ismeretlennek csak a 3. szinttől lehet írni,
// küldési korlát, jelentés a stábnak (a jelentett beszélgetés utolsó üzeneteivel). A stáb csak a jelentett beszélgetést látja.
'use strict';
const crypto = require('crypto');

const MSG_MAX = 500, KEEP = 200, LIST_MAX = 50;
const STRANGER_LEVEL = 3;       // ismeretlennek (nem barátnak) ettől a szinttől lehet írni
const PER_MIN = 20;             // percenként legfeljebb ennyi üzenet
const NEW_CONV_PER_DAY = 15;    // naponta legfeljebb ennyi új beszélgetést kezdhet valaki (kéretlen üzenetek ellen)
const PUSH_GAP = 10 * 60000;    // telefonos értesítés beszélgetésenként legfeljebb 10 percenként

function makeModel() {
    const mongoose = require('mongoose');
    const Mixed = mongoose.Schema.Types.Mixed;
    const conv = new mongoose.Schema({ _id: String, a: String, b: String, msgs: Mixed, lastT: Number, read: Mixed, t: Number, starter: String });
    return mongoose.models.SurvivalDm || mongoose.model('SurvivalDm', conv);
}

function setup(ctx) {
    const { PlayerModel, activePlayers, Admin, emitTo, notify, isFriend, levelOf } = ctx;
    const DmModel = ctx.DmModel || makeModel();
    const pairId = (a, b) => [a, b].sort().join('|');
    const other = (c, me) => (c.a === me ? c.b : c.a);
    const isStaff = (n) => (Admin.isStaffName ? Admin.isStaffName(n) : false);
    const unreadOf = (c, me) => (Array.isArray(c.msgs) ? c.msgs : []).filter(m => m.from !== me && m.t > ((c.read && c.read[me]) || 0)).length;
    const pushAt = new Map(), sent = new Map(), started = new Map();

    async function markRead(id, me) {
        const c = await DmModel.findById(id).lean(); if (!c) return;
        await DmModel.updateOne({ _id: id }, { $set: { read: { ...(c.read || {}), [me]: Date.now() } } });
    }
    async function prefs(name) {
        name = String(name || '').trim(); if (!name) return null;
        let u = await PlayerModel.findOne({ username: name }, { username: 1, dmBlocks: 1, dmFriendsOnly: 1 }).lean();
        if (!u) { // kis- és nagybetű nem számít
            const lo = name.toLocaleLowerCase('hu');
            const hit = (await PlayerModel.find({}, { username: 1 }).lean()).filter(x => x.username && x.username.toLocaleLowerCase('hu') === lo);
            if (hit.length === 1) u = await PlayerModel.findOne({ username: hit[0].username }, { username: 1, dmBlocks: 1, dmFriendsOnly: 1 }).lean();
        }
        return u ? { name: u.username, blocks: Array.isArray(u.dmBlocks) ? u.dmBlocks : [], friendsOnly: !!u.dmFriendsOnly } : null;
    }
    async function convsOf(me) {
        const [x, y] = await Promise.all([DmModel.find({ a: me }).lean(), DmModel.find({ b: me }).lean()]);
        return x.concat(y).sort((p, q) => (q.lastT || 0) - (p.lastT || 0));
    }
    async function unreadTotal(me) { return (await convsOf(me)).reduce((a, c) => a + (unreadOf(c, me) ? 1 : 0), 0); }
    async function list(me) {
        const mine = await prefs(me);
        const convs = (await convsOf(me)).slice(0, LIST_MAX);
        return {
            list: convs.map(c => {
                const msgs = Array.isArray(c.msgs) ? c.msgs : [], last = msgs[msgs.length - 1];
                const o = other(c, me);
                return { name: o, online: !!activePlayers[o], last: last ? { from: last.from, text: last.text.slice(0, 80), t: last.t } : null, unread: unreadOf(c, me), blocked: !!(mine && mine.blocks.includes(o)), staff: isStaff(o) };
            }),
            blocks: mine ? mine.blocks : [], friendsOnly: !!(mine && mine.friendsOnly), strangerLevel: STRANGER_LEVEL
        };
    }

    // ki írhat kinek
    async function canSend(from, to) {
        if (from === to) return { error: 'Magadnak nem írhatsz. 🙂' };
        const [p, q] = await Promise.all([prefs(from), prefs(to)]);
        if (!q) return { error: 'Nincs ilyen nevű túlélő.' };
        if (p && p.blocks.includes(q.name)) return { error: `Letiltottad ${q.name}-t. Előbb oldd fel a tiltást.` };
        if (isStaff(from)) return { ok: true, to: q.name }; // a stáb bárkinek írhat (pl. segítség, válasz)
        if (q.blocks.includes(from)) return { error: `${q.name} nem fogad tőled üzenetet.` };
        const friend = await isFriend(from, q.name);
        if (!friend && !isStaff(q.name)) {
            const existing = await DmModel.findById(pairId(from, q.name)).lean();
            const answered = existing && (existing.msgs || []).some(m => m.from === q.name); // ha ő írt neked, válaszolhatsz
            if (q.friendsOnly && !answered) return { error: `${q.name} csak a barátaitól fogad üzenetet. Jelöld be barátnak!` };
            if (!answered && await levelOf(from) < STRANGER_LEVEL) return { error: `Ismeretlennek a ${STRANGER_LEVEL}. szinttől írhatsz. A barátaidnak már most is.` };
        }
        return { ok: true, to: q.name, friend };
    }

    function attach(socket) {
        const me = socket.data.username;
        const R = 'dm_result';
        const bad = (message) => socket.emit(R, { success: false, message });
        const guard = (fn) => async (d) => { try { await fn(d || {}); } catch (e) { console.error('Üzenet hiba:', e.message); bad('Hiba történt.'); } };
        setTimeout(() => { unreadTotal(me).then(n => socket.emit('dm_unread', { n })).catch(() => { }); }, 1500);

        socket.on('dm_list', guard(async () => socket.emit('dm_list', await list(me))));
        socket.on('dm_open', guard(async (d) => {
            const name = String(d.name || '').trim();
            const q = await prefs(name); if (!q) return bad('Nincs ilyen nevű túlélő.');
            const id = pairId(me, q.name);
            const c = await DmModel.findById(id).lean();
            if (c) await markRead(id, me);
            const mine = await prefs(me);
            const can = await canSend(me, q.name);
            socket.emit('dm_thread', { name: q.name, online: !!activePlayers[q.name], msgs: c ? (c.msgs || []).slice(-100) : [], blocked: !!(mine && mine.blocks.includes(q.name)),
                canSend: !can.error, why: can.error || null, staff: isStaff(q.name) });
            socket.emit('dm_unread', { n: await unreadTotal(me) });
        }));
        socket.on('dm_send', guard(async (d) => {
            const text = String(d.text || '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, MSG_MAX);
            if (!text) return;
            const now = Date.now();
            const times = (sent.get(me) || []).filter(t => now - t < 60000);
            if (times.length >= PER_MIN) return bad('Túl sok üzenet, várj egy kicsit.');
            const can = await canSend(me, String(d.to || '').trim());
            if (can.error) return bad(can.error);
            const to = can.to, id = pairId(me, to);
            const c = await DmModel.findById(id).lean();
            if (!c) {
                const day = new Date(now).toISOString().slice(0, 10), st = started.get(me);
                const n = st && st.day === day ? st.n : 0;
                if (n >= NEW_CONV_PER_DAY && !isStaff(me)) return bad('Ma már sok új beszélgetést kezdtél. Holnap folytathatod.');
                started.set(me, { day, n: n + 1 });
            }
            times.push(now); sent.set(me, times);
            const msg = { id: crypto.randomBytes(4).toString('hex'), t: now, from: me, text };
            if (!c) {
                const [a, b] = [me, to].sort();
                await DmModel.create({ _id: id, a, b, msgs: [msg], lastT: now, read: { [me]: now }, t: now, starter: me });
            } else {
                const msgs = (Array.isArray(c.msgs) ? c.msgs : []).concat([msg]).slice(-KEEP);
                await DmModel.updateOne({ _id: id }, { $set: { msgs, lastT: now, read: { ...(c.read || {}), [me]: now } } });
            }
            socket.emit('dm_msg', { with: to, msg });
            emitTo(to, 'dm_msg', { with: me, msg });
            if (activePlayers[to]) unreadTotal(to).then(n => emitTo(to, 'dm_unread', { n })).catch(() => { });
            else if (now - (pushAt.get(id + to) || 0) > PUSH_GAP) { pushAt.set(id + to, now); notify(to, `✉️ ${me} üzenetet küldött`, text.slice(0, 100)); }
            Admin.logEvent('dm_send', me, { to, len: text.length });
        }));
        socket.on('dm_read', guard(async (d) => {
            await markRead(pairId(me, String(d.name || '')), me);
            socket.emit('dm_unread', { n: await unreadTotal(me) });
        }));
        socket.on('dm_block', guard(async (d) => {
            const q = await prefs(String(d.name || '')); if (!q || q.name === me) return bad('Nincs ilyen nevű túlélő.');
            if (d.on && isStaff(q.name)) return bad('A stábot nem lehet letiltani.');
            const mine = await prefs(me);
            const blocks = (mine ? mine.blocks : []).filter(n => n !== q.name).concat(d.on ? [q.name] : []).slice(-200);
            await PlayerModel.updateOne({ username: me }, { dmBlocks: blocks });
            Admin.logEvent('dm_block', me, { name: q.name, on: !!d.on });
            socket.emit(R, { success: true, message: d.on ? `🚫 ${q.name} letiltva: nem tud neked írni.` : `${q.name} tiltása feloldva.` });
            socket.emit('dm_list', await list(me));
        }));
        socket.on('dm_settings', guard(async (d) => {
            await PlayerModel.updateOne({ username: me }, { dmFriendsOnly: !!d.friendsOnly });
            socket.emit(R, { success: true, message: d.friendsOnly ? 'Mostantól csak a barátaid írhatnak neked.' : 'Mostantól bárki írhat neked (a 3. szinttől).' });
            socket.emit('dm_list', await list(me));
        }));
        // jelentés a stábnak: a beszélgetés utolsó 20 üzenete a hibajelentések közé kerül
        socket.on('dm_report', guard(async (d) => {
            const q = await prefs(String(d.name || '')); if (!q) return bad('Nincs ilyen nevű túlélő.');
            const c = await DmModel.findById(pairId(me, q.name)).lean();
            if (!c || !(c.msgs || []).some(m => m.from === q.name)) return bad('Ettől a játékostól nincs üzeneted, nincs mit jelenteni.');
            const why = String(d.reason || '').trim().slice(0, 300);
            const log = (c.msgs || []).slice(-20).map(m => `[${new Date(m.t).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}] ${m.from}: ${m.text}`).join('\n');
            const RM = Admin.models && Admin.models.ReportModel;
            if (RM) await RM.create({ t: Date.now(), at: new Date(), user: me, text: `[PRIVÁT ÜZENET JELENTÉSE] ${me} jelenti: ${q.name}\nIndok: ${why || '(nincs megadva)'}\n\n--- utolsó üzenetek ---\n${log}`.slice(0, 6000), ua: 'dm_report', status: 'open' });
            Admin.logEvent('dm_report', me, { name: q.name });
            socket.emit(R, { success: true, message: '🛡️ Köszönjük, a stáb megnézi. Ha zavar, tiltsd is le!' });
        }));
    }

    // admin átnevezéskor a beszélgetések is az új nevet kapják
    async function renameUser(from, to) {
        const convs = await convsOf(from);
        for (const c of convs) {
            const o = other(c, from), [a, b] = [to, o].sort();
            const msgs = (c.msgs || []).map(m => (m.from === from ? { ...m, from: to } : m));
            const read = { ...(c.read || {}) }; if (read[from]) { read[to] = read[from]; delete read[from]; }
            await DmModel.deleteOne({ _id: c._id });
            await DmModel.create({ _id: pairId(to, o), a, b, msgs, lastT: c.lastT, read, t: c.t, starter: c.starter === from ? to : c.starter });
        }
        const users = (await PlayerModel.find({}, { username: 1, dmBlocks: 1 }).lean()).filter(u => Array.isArray(u.dmBlocks) && u.dmBlocks.includes(from));
        for (const u of users) await PlayerModel.updateOne({ username: u.username }, { dmBlocks: (u.dmBlocks || []).map(n => (n === from ? to : n)) });
    }

    return { attach, renameUser, unreadTotal, DmModel };
}

module.exports = { setup, makeModel };
