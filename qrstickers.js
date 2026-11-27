// qrstickers.js
// QR-MATRICÁK (v0.1.24): az admin oldalon legyártott, kinyomtatható egyedi kódok.
// Bármikor beolvashatók: a meglévő játékos matricánként egyszer jutalmat kap, az új játékos a regisztrációhoz jut
// (és a regisztrációval rögtön meg is kapja a matrica jutalmát). Minden matricáról statisztika: beolvasás, regisztráció, beváltás.
'use strict';
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nincs benne 0/O és 1/I, hogy kézzel is begépelhető legyen
const CODE_LEN = 7;
const CODE_RE = /^[A-Z2-9]{7}$/;
const DAILY_MAX = 5;            // naponta legfeljebb ennyi matricát válthat be egy játékos (a lefotózott kódok tömeges beváltása ellen)
const BATCH_MAX = 500;
const DEFAULT_REWARD = { money: 150, xp: 150 };

function makeModel() {
    const mongoose = require('mongoose');
    const qr = new mongoose.Schema({
        _id: String, batch: String, label: String, money: Number, xp: Number, active: Boolean, t: Number,
        scans: Number, regs: Number, claims: Number, lastScan: Number, lastClaim: Number,
        lat: Number, lng: Number, placedAt: Number, place: String // hova ragasztották ki (v0.1.26)
    });
    return mongoose.models.SurvivalQr || mongoose.model('SurvivalQr', qr);
}

function setup(ctx) {
    const { app, PlayerModel, Admin, reward, emitTo, activePlayers, haversine } = ctx;
    // Kereső segítség (v0.1.26): a kiragasztott matrica közelében (hintDist méteren belül) a térképen megjelenik egy kör,
    // amelyen belül a matrica van – a pontos helyet nem mutatjuk, meg kell keresni.
    const SettingModel = Admin.models && Admin.models.SettingModel;
    // v0.1.26.3: a napi beváltási korlát és a QR-event (szorzó, újra beváltás) is itt van, az adminban állítható
    let hint = { on: true, dist: 200, radius: 35, daily: DAILY_MAX, ev: { on: false } };
    const clampN = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
    const normEv = (e, prev) => {
        e = e || {}; prev = prev || {};
        const on = !!e.on;
        const until = Number(e.until) > 0 ? Number(e.until) : null;
        // új event-azonosító, ha most kapcsolták be (így az „újra beváltható” minden eventben újraindul)
        const id = on ? (prev.on && prev.id ? prev.id : 'e' + Date.now().toString(36)) : (prev.id || null);
        return { on, id, mult: clampN(e.mult, 1, 5, 2), repeat: !!e.repeat, until, name: String(e.name || '').trim().slice(0, 40) };
    };
    const normHint = (v, prev) => ({ on: !(v && v.on === false), dist: clampN(v && v.dist, 30, 2000, 200), radius: clampN(v && v.radius, 10, 200, 35),
        daily: clampN(v && v.daily, 1, 100, DAILY_MAX), ev: normEv(v && v.ev, prev && prev.ev) });
    const evNow = () => { const e = hint.ev; return e && e.on && (!e.until || Date.now() < e.until) ? e : null; };
    if (SettingModel) SettingModel.findById('qr').lean().then(d => { if (d && d.value) hint = normHint(d.value, d.value); }).catch(() => { });
    const QrModel = ctx.QrModel || makeModel();
    const norm = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    const today = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10); // magyar idő szerinti nap (nagyjából)
    const busy = new Set();

    // a matrica linkje: /q/KÓD -> számolja a beolvasást, és a játékba visz (?qr=KÓD)
    app.get('/q/:code', (req, res) => {
        const code = norm(req.params.code);
        if (!CODE_RE.test(code)) return res.redirect(302, '/');
        QrModel.updateOne({ _id: code }, { $inc: { scans: 1 }, $set: { lastScan: Date.now() } }).catch(() => { });
        res.redirect(302, '/?qr=' + code);
    });

    const hid = (code) => crypto.createHash('sha1').update('sgqr|' + code).digest('hex').slice(0, 10);
    // a kör középpontja a matrica körül, de nem pontosan rajta (kódonként mindig ugyanott)
    function circleOf(q) {
        const h = crypto.createHash('sha1').update('sgqrc|' + q._id).digest();
        const ang = (h[0] / 255) * Math.PI * 2, d = (h[1] / 255) * hint.radius * 0.6;
        const dLat = (d * Math.cos(ang)) / 111320, dLng = (d * Math.sin(ang)) / (111320 * Math.cos(q.lat * Math.PI / 180));
        return { lat: q.lat + dLat, lng: q.lng + dLng };
    }
    let placedCache = { t: 0, list: [] };
    async function placed() {
        if (Date.now() - placedCache.t < 60000) return placedCache.list;
        const all = await QrModel.find({}).lean();
        placedCache = { t: Date.now(), list: all.filter(q => q.active && Number.isFinite(q.lat) && Number.isFinite(q.lng)) };
        return placedCache.list;
    }
    async function near(username) {
        if (!hint.on || !activePlayers || !haversine) return { hints: [] };
        const e = activePlayers[username]; if (!e || e.lat === null || e.lat === undefined) return { hints: [] };
        const list = (await placed()).filter(q => haversine(e.lat, e.lng, q.lat, q.lng) <= hint.dist);
        if (!list.length) return { hints: [], dist: hint.dist };
        const u = await PlayerModel.findOne({ username }, { qrClaimed: 1, qrEv: 1 }).lean();
        const ev = evNow();
        // „újra beváltható” eventben csak az számít megtaláltnak, amit ebben az eventben váltott be
        const mine = new Set(ev && ev.repeat ? ((u && u.qrEv && u.qrEv.id === ev.id && u.qrEv.codes) || []) : ((u && u.qrClaimed) || []));
        return { dist: hint.dist, hints: list.filter(q => !mine.has(q._id)).map(q => { const c = circleOf(q); return { id: hid(q._id), lat: c.lat, lng: c.lng, r: hint.radius, dist: Math.round(haversine(e.lat, e.lng, q.lat, q.lng) / 10) * 10, label: q.label || '' }; }) };
    }

    async function claim(username, raw, how) {
        const code = norm(raw);
        if (!CODE_RE.test(code)) return { error: 'Ez nem érvényes matrica-kód.' };
        if (busy.has(username)) return { error: 'Egy pillanat…' };
        busy.add(username);
        try {
            const q = await QrModel.findById(code).lean();
            if (!q) return { error: 'Ilyen matrica nincs. Ellenőrizd a kódot!' };
            if (!q.active) return { error: 'Ez a matrica már nem aktív.' };
            const u = await PlayerModel.findOne({ username }, { qrClaimed: 1, qrDay: 1, qrEv: 1, 'playerData.dead': 1 }).lean();
            if (!u) return { error: 'Nincs ilyen játékos.' };
            const claimed = Array.isArray(u.qrClaimed) ? u.qrClaimed : [];
            const ev = evNow();
            const evCodes = ev && u.qrEv && u.qrEv.id === ev.id && Array.isArray(u.qrEv.codes) ? u.qrEv.codes : [];
            const again = claimed.includes(code);
            if (again && !(ev && ev.repeat)) return { error: 'Ezt a matricát már beváltottad. Keress másikat! 🔎', already: true };
            if (again && evCodes.includes(code)) return { error: 'Ezt a matricát ebben az eventben már újra beváltottad. Keress másikat! 🔎', already: true };
            const day = today(), qd = u.qrDay && u.qrDay.day === day ? u.qrDay : { day, n: 0 };
            if (qd.n >= hint.daily) return { error: `Ma már ${hint.daily} matricát beváltottál. Holnap folytathatod!` };
            if (u.playerData && u.playerData.dead) return { error: 'Előbb kezdj új túlélőt, utána váltsd be!' };
            const upd = { qrClaimed: again ? claimed : claimed.concat([code]).slice(-2000), qrDay: { day, n: qd.n + 1 } };
            if (ev) upd.qrEv = { id: ev.id, codes: evCodes.concat([code]).slice(-2000) };
            await PlayerModel.updateOne({ username }, upd);
            const mult = ev ? ev.mult : 1;
            const r = { money: Math.max(0, q.money || 0) * mult, xp: Math.max(0, q.xp || 0) * mult };
            const evTag = ev ? ` – ${ev.name || 'QR-event'}${mult > 1 ? ` ×${mult}` : ''}` : '';
            await reward(username, r, `📮 QR-matrica${q.label ? ` (${q.label})` : ''}${evTag}:`);
            await QrModel.updateOne({ _id: code }, { $inc: { claims: 1 }, $set: { lastClaim: Date.now() } });
            emitTo && emitTo(username, 'qr_near', await near(username).catch(() => ({ hints: [] }))); // a megtalált matrica köre eltűnik
            Admin.logEvent('qr_claim', username, { code, batch: q.batch, how: how || 'scan', ev: ev ? ev.id : undefined, again: again || undefined });
            return { ok: true, code, money: r.money, xp: r.xp, label: q.label || '', count: claimed.length + (again ? 0 : 1), mult, again, evName: ev ? (ev.name || 'QR-event') : '' };
        } finally { busy.delete(username); }
    }

    // regisztráció matricáról: feljegyezzük, honnan jött, és rögtön megkapja a jutalmat
    async function onRegister(username, raw) {
        const code = norm(raw);
        if (!CODE_RE.test(code)) return;
        const q = await QrModel.findById(code).lean();
        if (!q) return;
        await QrModel.updateOne({ _id: code }, { $inc: { regs: 1 } });
        await PlayerModel.updateOne({ username }, { qrFrom: code });
        if (q.active) await claim(username, code, 'register');
    }

    function attach(socket) {
        const username = socket.data.username;
        socket.on('qr_near', async () => { try { socket.emit('qr_near', await near(username)); } catch (e) { /* */ } });
        socket.on('qr_claim', async (d) => {
            try {
                const r = await claim(username, d && d.code);
                socket.emit('qr_result', r.ok ? { success: true, ...r, message: `📮 Matrica beváltva!${r.evName ? ` (${r.evName}${r.mult > 1 ? ` ×${r.mult}` : ''})` : ''} +${r.xp} XP, +${r.money} $` } : { success: false, message: r.error, already: !!r.already });
            } catch (e) { console.error('QR hiba:', e.message); socket.emit('qr_result', { success: false, message: 'Hiba történt.' }); }
        });
    }

    // ---------- admin ----------
    function newCode(taken) {
        for (;;) {
            const b = crypto.randomBytes(CODE_LEN);
            let c = ''; for (let i = 0; i < CODE_LEN; i++) c += ALPHA[b[i] % ALPHA.length];
            if (!taken.has(c)) { taken.add(c); return c; }
        }
    }
    async function adminCreate(admin, a) {
        const count = Math.floor(Number(a.count) || 0);
        if (count < 1 || count > BATCH_MAX) return { error: `1 és ${BATCH_MAX} közötti darabszámot adj meg.` };
        const label = String(a.label || '').trim().slice(0, 40);
        const money = Math.max(0, Math.min(100000, Math.floor(Number(a.money) || 0)));
        const xp = Math.max(0, Math.min(100000, Math.floor(Number(a.xp) || 0)));
        const taken = new Set((await QrModel.find({}, { _id: 1 }).lean()).map(x => x._id));
        const batch = 'b' + Date.now().toString(36), t = Date.now(), codes = [];
        for (let i = 0; i < count; i++) {
            const _id = newCode(taken); codes.push(_id);
            await QrModel.create({ _id, batch, label, money, xp, active: true, t, scans: 0, regs: 0, claims: 0, lastScan: null, lastClaim: null });
        }
        return { message: `${count} matrica elkészült.`, batch, codes };
    }
    async function adminList() {
        const all = await QrModel.find({}).lean();
        const batches = {};
        all.forEach(q => {
            const b = batches[q.batch] = batches[q.batch] || { batch: q.batch, label: q.label, money: q.money, xp: q.xp, t: q.t, count: 0, active: 0, scans: 0, regs: 0, claims: 0, lastScan: null, codes: [] };
            b.count++; if (q.active) b.active++;
            b.scans += q.scans || 0; b.regs += q.regs || 0; b.claims += q.claims || 0;
            if ((q.lastScan || 0) > (b.lastScan || 0)) b.lastScan = q.lastScan;
            b.codes.push({ code: q._id, active: !!q.active, scans: q.scans || 0, regs: q.regs || 0, claims: q.claims || 0, lastScan: q.lastScan || null,
                lat: Number.isFinite(q.lat) ? q.lat : null, lng: Number.isFinite(q.lng) ? q.lng : null, place: q.place || '', placedAt: q.placedAt || null });
            if (Number.isFinite(q.lat)) b.placed = (b.placed || 0) + 1;
        });
        const list = Object.values(batches).sort((a, b) => b.t - a.t);
        list.forEach(b => b.codes.sort((x, y) => y.scans - x.scans || x.code.localeCompare(y.code)));
        const tot = list.reduce((a, b) => ({ codes: a.codes + b.count, scans: a.scans + b.scans, regs: a.regs + b.regs, claims: a.claims + b.claims }), { codes: 0, scans: 0, regs: 0, claims: 0 });
        return { batches: list, total: tot, dailyMax: hint.daily, hint, evActive: !!evNow() };
    }
    async function adminUpdate(admin, a) {
        const set = {};
        if (a.active !== undefined) set.active = !!a.active;
        if (a.label !== undefined) set.label = String(a.label || '').trim().slice(0, 40);
        if (a.money !== undefined) set.money = Math.max(0, Math.min(100000, Math.floor(Number(a.money) || 0)));
        if (a.xp !== undefined) set.xp = Math.max(0, Math.min(100000, Math.floor(Number(a.xp) || 0)));
        // hely: hova ragasztották ki a matricát (csak egy kódra)
        if (a.code && a.lat !== undefined) {
            if (a.lat === null) { set.lat = null; set.lng = null; set.placedAt = null; set.place = ''; }
            else {
                const lat = Number(a.lat), lng = Number(a.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: 'Hibás koordináta.' };
                set.lat = lat; set.lng = lng; set.placedAt = Date.now();
            }
        }
        if (a.code && a.place !== undefined) set.place = String(a.place || '').trim().slice(0, 60);
        if (!Object.keys(set).length) return { error: 'Nincs mit menteni.' };
        placedCache.t = 0;
        if (a.code) { const c = norm(a.code); const r = await QrModel.findById(c).lean(); if (!r) return { error: 'Nincs ilyen kód.' }; await QrModel.updateOne({ _id: c }, { $set: set }); return { message: 'Mentve.' }; }
        if (a.batch) {
            const list = await QrModel.find({ batch: String(a.batch) }, { _id: 1 }).lean();
            if (!list.length) return { error: 'Nincs ilyen sorozat.' };
            for (const x of list) await QrModel.updateOne({ _id: x._id }, { $set: set });
            return { message: `Mentve (${list.length} matrica).` };
        }
        return { error: 'Hiányzik a kód vagy a sorozat.' };
    }

    async function adminHint(v) {
        // csak a megadott részt írjuk felül (a kereső kör, a napi korlát és az event külön is menthető)
        const prev = hint;
        hint = normHint({ ...prev, ...(v || {}), ev: v && v.ev !== undefined ? v.ev : prev.ev }, prev);
        if (SettingModel) await SettingModel.updateOne({ _id: 'qr' }, { value: hint }, { upsert: true });
        placedCache.t = 0;
        let message;
        if (v && v.ev !== undefined) {
            const e = hint.ev;
            message = e.on ? `QR-event bekapcsolva: ${e.mult > 1 ? `×${e.mult} jutalom` : 'normál jutalom'}${e.repeat ? ', a már beváltott matricák is újra beválthatók' : ''}${e.until ? `, eddig: ${new Date(e.until).toLocaleString('hu-HU')}` : ''}.` : 'QR-event kikapcsolva.';
        } else if (v && v.daily !== undefined && v.dist === undefined) message = `Napi korlát: ${hint.daily} matrica.`;
        else message = hint.on ? `Kereső segítség: ${hint.dist} m-ről látszik egy ${hint.radius} m-es kör.` : 'Kereső segítség kikapcsolva.';
        return { message, hint };
    }

    return { attach, claim, onRegister, adminCreate, adminList, adminUpdate, adminHint, near, evNow, info: () => ({ daily: hint.daily, ev: evNow() }), QrModel, DAILY_MAX, DEFAULT_REWARD };
}

module.exports = { setup, makeModel, CODE_RE, DAILY_MAX };
