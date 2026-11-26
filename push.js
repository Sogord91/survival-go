// push.js
// TELEFONOS ÉRTESÍTÉSEK (Web Push, v0.1.19). Külső csomag nélkül: a VAPID aláírás és a titkosítás (RFC 8291, aes128gcm)
// a Node beépített crypto moduljával készül. A VAPID kulcspárt az első indításkor a szerver maga hozza létre és
// az adatbázisba menti (SurvivalSetting 'push'), így nem kell semmit beállítani. Ha mégis env-ből adnád meg:
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (base64url). PUSH_SUBJECT: kapcsolattartó (mailto: vagy https:), nem kötelező.
//
// Mikor megy értesítés?
//  - a stáb válaszol a játékosnak (Üzenet a stábnak / hibajelentés)
//  - az admin kézzel küld mindenkinek (Közlemények fül)
//  - naponta egyszer, 17:30-kor emlékeztető annak, aki aznap még nem járt a játékban (advent / ajándékvadászat / napi bónusz)
'use strict';
const crypto = require('crypto');
const https = require('https');
// az adatmodell csak a setup()-kor jön létre (így a titkosítás külön is tesztelhető)
function makeModel() {
    const mongoose = require('mongoose');
    const subSchema = new mongoose.Schema({
        _id: String,          // az endpoint hash-e
        user: String,
        endpoint: String,
        p256dh: String,
        auth: String,
        t: Number,
        ua: String,
        lastSent: Number
    });
    return mongoose.models.SurvivalPush || mongoose.model('SurvivalPush', subSchema);
}

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// ---- VAPID kulcsok ----
function makeVapidKeys() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
// a nyers (32 bájtos) privát kulcsból aláíró kulcs (JWK)
function signingKey(keys) {
    const pub = unb64u(keys.publicKey);
    return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}
function vapidHeader(endpoint, keys, subject, now) {
    const aud = new URL(endpoint).origin;
    const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64u(JSON.stringify({ aud, exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600, sub: subject }));
    const sig = crypto.sign('sha256', Buffer.from(header + '.' + claims), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
    return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---- titkosítás (RFC 8291 / RFC 8188, egyetlen rekord) ----
function encrypt(payload, p256dh, authSecret, opts) {
    opts = opts || {};
    const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
    const ecdh = crypto.createECDH('prime256v1');
    if (opts.asPrivate) ecdh.setPrivateKey(opts.asPrivate); else ecdh.generateKeys();
    const asPublic = ecdh.getPublicKey();
    const shared = ecdh.computeSecret(uaPublic);
    const prkKey = hmac(auth, shared);
    const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const salt = opts.salt || crypto.randomBytes(16);
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const head = Buffer.alloc(21);
    salt.copy(head, 0);
    head.writeUInt32BE(4096, 16);
    head.writeUInt8(asPublic.length, 20);
    return Buffer.concat([head, asPublic, body]);
}
// (a tesztekhez) visszafejtés a böngésző oldaláról nézve
function decrypt(buf, uaPrivate, uaPublicB64, authSecret) {
    const salt = buf.subarray(0, 16), idlen = buf.readUInt8(20), asPublic = buf.subarray(21, 21 + idlen), data = buf.subarray(21 + idlen);
    const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(uaPrivate);
    const uaPublic = unb64u(uaPublicB64), shared = ecdh.computeSecret(asPublic);
    const ikm = hmac(hmac(unb64u(authSecret), shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(data.subarray(data.length - 16));
    const out = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
    return out.subarray(0, out.lastIndexOf(2)).toString('utf8');
}

// HTTP POST a böngésző push-szolgáltatójának (Google, Mozilla, Apple…)
function defaultSend(endpoint, headers, body) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(endpoint); } catch (e) { return resolve({ status: 0 }); }
        if (u.protocol !== 'https:') return resolve({ status: 0 });
        const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: { ...headers, 'Content-Length': body.length }, timeout: 15000 }, (res) => {
            res.resume();
            res.on('end', () => resolve({ status: res.statusCode }));
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve({ status: 0 }));
        req.end(body);
    });
}

function setup(ctx) {
    const { app, SettingModel, activePlayers, authToken } = ctx;
    const PushSubModel = makeModel();
    // (a tesztek a global.__sgPushSend-del elkaphatják a kimenő kérést)
    const send = (...a) => (ctx.send || global.__sgPushSend || defaultSend)(...a);
    const subject = process.env.PUSH_SUBJECT || 'mailto:info@survivalgo.hu';
    let keys = (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
    const ready = (async () => {
        if (keys) return keys;
        const doc = await SettingModel.findById('push').lean().catch(() => null);
        if (doc && doc.value && doc.value.publicKey) { keys = doc.value; return keys; }
        keys = makeVapidKeys();
        await SettingModel.updateOne({ _id: 'push' }, { value: keys }, { upsert: true }).catch(() => { });
        return keys;
    })();

    const idOf = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40);

    // A nyilvános kulcs a böngészőnek (feliratkozáshoz)
    app.get('/api/push/key', async (req, res) => {
        try { const k = await ready; res.json({ success: true, key: k.publicKey }); } catch (e) { res.json({ success: false }); }
    });

    // Egy feliratkozásnak küld; a megszűnt (404/410) feliratkozást törli
    async function sendTo(sub, msg) {
        const k = await ready;
        const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/', tag: msg.tag || 'sg' });
        let body;
        try { body = encrypt(payload, sub.p256dh, sub.auth); } catch (e) { await PushSubModel.deleteOne({ _id: sub._id }).catch(() => { }); return false; }
        const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: String(msg.ttl || 6 * 3600), Urgency: msg.urgency || 'normal',
            Authorization: vapidHeader(sub.endpoint, k, subject) };
        const r = await send(sub.endpoint, headers, body);
        if (r.status === 404 || r.status === 410) { await PushSubModel.deleteOne({ _id: sub._id }).catch(() => { }); return false; }
        if (r.status >= 200 && r.status < 300) { await PushSubModel.updateOne({ _id: sub._id }, { lastSent: Date.now() }).catch(() => { }); return true; }
        return false;
    }
    // Egy játékos összes eszközére
    async function notifyUser(user, msg) {
        const subs = await PushSubModel.find({ user }).lean();
        let ok = 0;
        for (const s of subs) if (await sendTo(s, msg)) ok++;
        return ok;
    }
    // Mindenkinek (vagy szűrve), apránként, hogy ne terheljük a szervert
    async function notifyAll(msg, filter) {
        const subs = await PushSubModel.find({}).lean();
        let ok = 0, tried = 0;
        for (const s of subs) {
            if (filter && !(await filter(s.user))) continue;
            tried++;
            if (await sendTo(s, msg)) ok++;
        }
        return { tried, ok, total: subs.length };
    }
    async function stats() {
        const subs = await PushSubModel.find({}).lean();
        return { subs: subs.length, users: new Set(subs.map(s => s.user)).size };
    }

    // a szerver a saját 'connection' kezelőjéből hívja (a belépett játékos socketjére)
    function attach(socket) {
        socket.on('push_subscribe', (data) => {
            const user = socket.data && socket.data.username;
            if (!user || !data || typeof data.endpoint !== 'string' || !data.keys || typeof data.keys.p256dh !== 'string' || typeof data.keys.auth !== 'string') return;
            if (data.endpoint.length > 1000 || !/^https:\/\//.test(data.endpoint)) return;
            const _id = idOf(data.endpoint);
            PushSubModel.updateOne({ _id }, { _id, user, endpoint: data.endpoint, p256dh: data.keys.p256dh.slice(0, 200), auth: data.keys.auth.slice(0, 100), t: Date.now(), ua: String(data.ua || '').slice(0, 200) }, { upsert: true })
                .then(() => socket.emit('push_result', { success: true, message: '🔔 Értesítések bekapcsolva ezen a telefonon.' }))
                .catch(() => socket.emit('push_result', { success: false, message: 'Nem sikerült bekapcsolni az értesítéseket.' }));
        });
        socket.on('push_unsubscribe', (data) => {
            if (!data || typeof data.endpoint !== 'string') return;
            PushSubModel.deleteOne({ _id: idOf(data.endpoint) }).then(() => socket.emit('push_result', { success: true, message: '🔕 Értesítések kikapcsolva ezen a telefonon.', off: true })).catch(() => { });
        });
    }

    // ---- napi emlékeztető 17:30-kor (magyar idő), annak, aki aznap még nem játszott ----
    const hmBudapest = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
    const dayBudapest = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    let lastReminderDay = null;
    async function dailyReminder(now, force) {
        now = now || Date.now();
        const day = dayBudapest(now);
        if (!force && (hmBudapest(now) < '17:30' || lastReminderDay === day)) return null;
        const doneDoc = await SettingModel.findById('push-reminder').lean().catch(() => null);
        if (!force && doneDoc && doneDoc.value === day) { lastReminderDay = day; return null; }
        lastReminderDay = day;
        await SettingModel.updateOne({ _id: 'push-reminder' }, { value: day }, { upsert: true }).catch(() => { });
        const msg = ctx.reminderText ? ctx.reminderText(now) : { title: 'Survival GO', body: 'A napi bónuszod vár a Zónában.' };
        if (!msg) return null;
        // csak akinek ma még nem volt belépése, és most nincs is bent
        const startOfDay = now - ((Number(hmBudapest(now).slice(0, 2)) * 60 + Number(hmBudapest(now).slice(3))) * 60000);
        return notifyAll({ ...msg, tag: 'daily', ttl: 5 * 3600 }, async (user) => {
            if (activePlayers && activePlayers[user]) return false;
            const u = await ctx.PlayerModel.findOne({ username: user }, { 'playerData.lastSeen': 1 }).lean().catch(() => null);
            const seen = u && u.playerData && u.playerData.lastSeen;
            return !seen || seen < startOfDay;
        });
    }
    if (!process.env.SG_NO_TIMERS) setInterval(() => { dailyReminder().catch(e => console.error('Push emlékeztető hiba:', e.message)); }, 5 * 60000);
    void authToken;

    return { attach, notifyUser, notifyAll, stats, dailyReminder, ready, PushSubModel };
}

module.exports = { setup, encrypt, decrypt, vapidHeader, makeVapidKeys, b64u, unb64u };
