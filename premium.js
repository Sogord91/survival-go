// premium.js – PRÉMIUM CREDIT ÉS BOLT (v0.1.16)
// Credit vásárlása banki átutalással (a tulajdonos az admin oldalon írja jóvá), bolt (kinézet, kényelem),
// ládák nyilvános esélyekkel, credit-napló. A katalógus: public/js/shop.js.
// Bekapcsolás: PREMIUM_SHOP=on (mindenkinek) | staff (csak a stábnak – alapértelmezés, teszteléshez) | off
const mongoose = require('mongoose');
const Shop = require('./public/js/shop');
const Roles = require('./public/js/roles');

const DAY = 86400000;
const ORDER_EXPIRE_DAYS = 14;
const MAX_PENDING_ORDERS = 3;

const txSchema = new mongoose.Schema({ t: { type: Number, index: true }, user: { type: String, index: true }, delta: Number, balance: Number,
    reason: String, ref: String, by: String, note: String });
const TxModel = mongoose.models.SurvivalCreditTx || mongoose.model('SurvivalCreditTx', txSchema);
const orderSchema = new mongoose.Schema({ code: { type: String, index: true }, user: { type: String, index: true }, pkg: String, credits: Number, huf: Number,
    billing: mongoose.Schema.Types.Mixed, status: { type: String, index: true }, createdAt: Number, paidAt: Number, confirmedBy: String, invoiceNo: String, note: String,
    consents: mongoose.Schema.Types.Mixed });
const OrderModel = mongoose.models.SurvivalOrder || mongoose.model('SurvivalOrder', orderSchema);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const mode = () => { const m = String(process.env.PREMIUM_SHOP || 'staff').toLowerCase(); return ['on', 'off', 'staff'].includes(m) ? m : 'staff'; };
function enabledFor(role) { const m = mode(); return m === 'on' || (m === 'staff' && Roles.isStaff(role)); }

function normalizePremium(x) {
    x = x && typeof x === 'object' ? x : {};
    const counts = (o) => {
        const out = {};
        Object.entries(o && typeof o === 'object' ? o : {}).forEach(([k, v]) => {
            k = Shop.CRATE_ALIASES[k] || k;
            if (Shop.BY_KEY[k] && num(v) > 0) out[k] = (out[k] || 0) + Math.floor(num(v));
        });
        return out;
    };
    const owned = [...new Set((Array.isArray(x.owned) ? x.owned : []).filter(k => Shop.BY_KEY[k] && Shop.BY_KEY[k].kind))];
    const frame = owned.includes(x.frame) && Shop.BY_KEY[x.frame].kind === 'frame' ? x.frame : '';
    const title = owned.includes(x.title) && Shop.BY_KEY[x.title].kind === 'title' ? x.title : '';
    return { credits: Math.max(0, Math.floor(num(x.credits))), owned, crates: counts(x.crates), keys: counts(x.keys), frame, title, slotsBought: Math.max(0, Math.floor(num(x.slotsBought))) };
}
const cosmeticOf = (pr) => ({ frame: pr.frame || '', title: pr.title || '' });

const sellerInfo = () => ({
    name: process.env.PREMIUM_SELLER_NAME || '', address: process.env.PREMIUM_SELLER_ADDRESS || '', taxNo: process.env.PREMIUM_SELLER_TAXNO || '',
    regNo: process.env.PREMIUM_SELLER_REGNO || '', email: process.env.PREMIUM_SELLER_EMAIL || 'info@survivalgo.hu',
    payee: process.env.PREMIUM_PAYEE || '', account: process.env.PREMIUM_ACCOUNT || '', bank: process.env.PREMIUM_BANK || ''
});

function newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = 'SG-';
    for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
    return c;
}

function setup(ctx) {
    const { io, PlayerModel, activePlayers, adminHooks } = ctx;

    // --- játékosonkénti sor: a credit-műveletek egymás után futnak (nincs dupla költés) ---
    const queues = new Map();
    function withPremium(username, fn) {
        const prev = queues.get(username) || Promise.resolve();
        const run = prev.catch(() => { }).then(async () => {
            const u = await PlayerModel.findOne({ username }, { username: 1, premium: 1, role: 1, email: 1 }).lean();
            if (!u) return { error: 'Nincs ilyen játékos.' };
            const pr = normalizePremium(u.premium);
            const txs = [];
            const result = (await fn(pr, u, txs)) || {};
            if (result.error) return result;
            await PlayerModel.updateOne({ username }, { premium: pr });
            for (const tx of txs) await TxModel.create({ t: Date.now(), user: username, balance: pr.credits, ...tx }).catch(() => { });
            const a = activePlayers[username];
            if (a) {
                a.cosmetic = cosmeticOf(pr);
                const s = io.sockets.sockets.get(a.socketId);
                if (s) sendState(s, username, u.role, pr).catch(() => { });
            }
            return { ...result, premium: pr };
        });
        queues.set(username, run);
        return run;
    }

    async function sendState(socket, username, role, pr) {
        const enabled = enabledFor(role !== undefined ? role : socket.data.role);
        if (!pr) { const u = await PlayerModel.findOne({ username }, { premium: 1 }).lean(); pr = normalizePremium(u && u.premium); }
        // Zárt bolt mellett is: a nyert kinézetek (advent, kerék) és kristályok a Gyűjteményben (v0.1.19.1)
        if (!enabled) return socket.emit('premium_state', { enabled: false, collection: true, owned: pr.owned, frame: pr.frame, title: pr.title, credits: pr.credits, keys: pr.keys, crates: {}, orders: [] });
        const orders = await OrderModel.find({ user: username }).sort({ createdAt: -1 }).limit(10).lean();
        const s = sellerInfo();
        socket.emit('premium_state', {
            enabled: true, mode: mode(), ...pr,
            orders: orders.map(o => ({ code: o.code, credits: o.credits, huf: o.huf, status: expired(o) ? 'expired' : o.status, createdAt: o.createdAt, paidAt: o.paidAt || null })),
            bank: { payee: s.payee, account: s.account, bank: s.bank }, sellerReady: !!(s.name && s.taxNo && s.account)
        });
    }
    const expired = (o) => o.status === 'pending' && Date.now() - o.createdAt > ORDER_EXPIRE_DAYS * DAY;

    const route = adminHooks.route;

    // ---------------- admin: rendelések, credit, napló ----------------
    route('get', '/api/admin/premium', async (req, res) => {
        const orders = await OrderModel.find({}).sort({ createdAt: -1 }).limit(500).lean();
        orders.forEach(o => { if (expired(o)) o.status = 'expired'; });
        const paid = orders.filter(o => o.status === 'paid');
        const users = await PlayerModel.find({}, { username: 1, premium: 1 }).lean();
        const holders = users.map(u => ({ name: u.username, ...normalizePremium(u.premium) })).filter(x => x.credits || x.owned.length || Object.keys(x.crates).length || Object.keys(x.keys).length);
        res.json({
            success: true, mode: mode(), seller: sellerInfo(), orders,
            totals: { paidHuf: paid.reduce((a, o) => a + o.huf, 0), paidCount: paid.length, pendingHuf: orders.filter(o => o.status === 'pending').reduce((a, o) => a + o.huf, 0),
                pendingCount: orders.filter(o => o.status === 'pending').length, creditsOutstanding: holders.reduce((a, h) => a + h.credits, 0) },
            holders: holders.sort((a, b) => b.credits - a.credits).slice(0, 100)
        });
    }, 'premium');
    route('post', '/api/admin/premium/orders/:code/:action', async (req, res) => {
        const o = await OrderModel.findOne({ code: req.params.code });
        if (!o) return res.status(404).json({ success: false, message: 'Nincs ilyen rendelés.' });
        if (req.params.action === 'confirm') {
            if (o.status === 'paid') return res.status(400).json({ success: false, message: 'Ez már jóvá van írva.' });
            if (o.status === 'cancelled') return res.status(400).json({ success: false, message: 'Ez a rendelés törölve van.' });
            const r = await withPremium(o.user, (pr, u, txs) => {
                pr.credits += o.credits;
                txs.push({ delta: o.credits, reason: 'order', ref: o.code, by: req.admin, note: `${o.huf} Ft átutalás` });
            });
            if (r.error) return res.status(400).json({ success: false, message: r.error });
            await OrderModel.updateOne({ code: o.code }, { status: 'paid', paidAt: Date.now(), confirmedBy: req.admin, invoiceNo: String((req.body && req.body.invoiceNo) || '').slice(0, 60) });
            notify(o.user, `💎 Megérkezett az utalásod: +${o.credits} credit jóváírva (${o.code}). Köszönjük!`);
            adminHooks.audit(req.admin, 'premium_confirm', o.user, { code: o.code, huf: o.huf });
            return res.json({ success: true, message: `${o.user}: +${o.credits} credit jóváírva.` });
        }
        if (req.params.action === 'cancel') {
            if (o.status === 'paid') return res.status(400).json({ success: false, message: 'Jóváírt rendelést nem lehet törölni; ha kell, vond le a creditet kézzel.' });
            await OrderModel.updateOne({ code: o.code }, { status: 'cancelled', note: String((req.body && req.body.reason) || '').slice(0, 200) });
            notify(o.user, `A(z) ${o.code} rendelésed törölve.${req.body && req.body.reason ? ' Ok: ' + req.body.reason : ''}`);
            adminHooks.audit(req.admin, 'premium_cancel', o.user, { code: o.code });
            return res.json({ success: true, message: 'Rendelés törölve.' });
        }
        if (req.params.action === 'invoice') {
            await OrderModel.updateOne({ code: o.code }, { invoiceNo: String((req.body && req.body.invoiceNo) || '').slice(0, 60) });
            return res.json({ success: true, message: 'Számlaszám mentve.' });
        }
        res.status(400).json({ success: false, message: 'Ismeretlen művelet.' });
    }, 'premium');
    route('post', '/api/admin/premium/credits/:user', async (req, res) => {
        const delta = Math.trunc(num(req.body && req.body.delta));
        const note = String((req.body && req.body.note) || '').trim().slice(0, 200);
        if (!delta || Math.abs(delta) > 100000) return res.status(400).json({ success: false, message: 'Adj meg egy összeget (pl. 100 vagy -50).' });
        if (!note) return res.status(400).json({ success: false, message: 'Írd be az okát is (a naplóba kerül).' });
        const r = await withPremium(req.params.user, (pr, u, txs) => {
            if (pr.credits + delta < 0) return { error: `Nincs ennyi creditje (${pr.credits}).` };
            pr.credits += delta;
            txs.push({ delta, reason: 'admin', by: req.admin, note });
        });
        if (r.error) return res.status(400).json({ success: false, message: r.error });
        if (delta > 0) notify(req.params.user, `💎 +${delta} credit az adminisztrátortól. ${note}`);
        adminHooks.audit(req.admin, 'premium_credits', req.params.user, { delta, note });
        res.json({ success: true, message: `${req.params.user} új egyenlege: ${r.premium.credits} credit.` });
    }, 'premium');
    route('post', '/api/admin/premium/give/:user', async (req, res) => {
        const key0 = String((req.body && req.body.key) || '');
        const key = Shop.CRATE_ALIASES[key0] || key0;
        const count = Math.max(1, Math.min(50, Math.floor(num(req.body && req.body.count, 1))));
        const def = Shop.BY_KEY[key];
        if (!def) return res.status(400).json({ success: false, message: 'Ismeretlen tárgy.' });
        const r = await withPremium(req.params.user, (pr, u, txs) => {
            if (def.kind) { if (!pr.owned.includes(key)) pr.owned.push(key); }
            else if (key.startsWith('crate_')) pr.crates[key] = (pr.crates[key] || 0) + count;
            else if (key.startsWith('key_')) pr.keys[key] = (pr.keys[key] || 0) + count;
            else return { error: 'Ez nem adható így.' };
            txs.push({ delta: 0, reason: 'admin_give', ref: key, by: req.admin, note: `${def.name} ×${def.kind ? 1 : count}` });
        });
        if (r.error) return res.status(400).json({ success: false, message: r.error });
        notify(req.params.user, `🎁 Ajándék az adminisztrátortól: ${def.name}${def.kind ? '' : ' ×' + count}`);
        adminHooks.audit(req.admin, 'premium_give', req.params.user, { key, count });
        res.json({ success: true, message: 'Elküldve.' });
    }, 'premium');
    route('get', '/api/admin/premium/ledger', async (req, res) => {
        const q = req.query && req.query.user ? { user: String(req.query.user) } : {};
        res.json({ success: true, ledger: await TxModel.find(q).sort({ t: -1 }).limit(500).lean() });
    }, 'premium');
    route('get', '/api/admin/premium/player/:user', async (req, res) => {
        const u = await PlayerModel.findOne({ username: req.params.user }, { premium: 1 }).lean();
        if (!u) return res.status(404).json({ success: false, message: 'Nincs ilyen játékos.' });
        res.json({ success: true, premium: normalizePremium(u.premium), orders: await OrderModel.find({ user: req.params.user }).sort({ createdAt: -1 }).limit(20).lean() });
    }, 'premium');

    // nyilvános: az ÁSZF oldal adatai
    ctx.app.get('/api/premium/info', (req, res) => {
        const s = sellerInfo();
        res.json({ seller: { name: s.name, address: s.address, taxNo: s.taxNo, regNo: s.regNo, email: s.email }, creditHuf: Shop.CREDIT_HUF, packages: Shop.PACKAGES, mode: mode() });
    });

    function notify(username, text) {
        const a = activePlayers[username];
        if (a) io.to(a.socketId).emit('server_notice', { text });
    }

    // ---------------- játékos oldal ----------------
    function onConnect(socket, username) {
        PlayerModel.findOne({ username }, { premium: 1 }).lean().then(u => {
            const pr = normalizePremium(u && u.premium);
            if (activePlayers[username]) activePlayers[username].cosmetic = cosmeticOf(pr);
            return sendState(socket, username, socket.data.role, pr);
        }).catch(err => console.error('Hiba a prémium állapot küldésekor:', err));

        const guard = (fn) => (data) => {
            if (!enabledFor(socket.data.role)) return socket.emit('premium_result', { success: false, message: 'A prémium bolt még nem érhető el.' });
            fn(data || {});
        };
        const done = (p) => p.then(r => socket.emit('premium_result', r.error ? { success: false, message: r.error } : { success: true, message: r.message || 'Kész.', reveal: r.reveal || null }))
            .catch(err => { console.error('Prémium hiba:', err); socket.emit('premium_result', { success: false, message: 'Hiba történt, próbáld újra.' }); });

        socket.on('premium_state', () => sendState(socket, username).catch(() => { })); // zárt boltnál a Gyűjteményt küldi

        socket.on('premium_buy', guard((data) => done(withPremium(username, async (pr, u, txs) => {
            const def = Shop.BY_KEY[String(data.key)];
            if (!def || !def.price) return { error: 'Ez nem vásárolható meg.' };
            if (pr.credits < def.price) return { error: `Ehhez ${def.price} credit kell, neked ${pr.credits} van.` };
            if (def.kind) {
                if (pr.owned.includes(def.key)) return { error: 'Ez már a tiéd.' };
                pr.owned.push(def.key);
            } else if (def.key === 'slots_2') {
                if (pr.slotsBought >= def.max) return { error: 'Ebből már a maximumot megvetted.' };
                const r = await ctx.withPlayer(username, (p) => { p.premiumSlots = (num(p.premiumSlots) || 0) + 2; return {}; });
                if (r) ctx.sendPlayerState(username, r.p);
                pr.slotsBought++;
            } else if (def.key === 'rename') {
                pr.keys.rename = (pr.keys.rename || 0) + 1; // névváltoztatási jog: a Gyűjteményben használható
            } else if (def.key.startsWith('crate_')) {
                // a boltban vett láda azonnal kinyílik
                pr.credits -= def.price;
                txs.push({ delta: -def.price, reason: 'purchase', ref: def.key, note: def.name });
                return openCrate(pr, def, txs);
            } else if (def.key.startsWith('key_')) {
                pr.keys[def.key] = (pr.keys[def.key] || 0) + 1;
            } else return { error: 'Ez nem vásárolható meg.' };
            pr.credits -= def.price;
            txs.push({ delta: -def.price, reason: 'purchase', ref: def.key, note: def.name });
            return { message: `Megvetted: ${def.name} (−${def.price} credit).` };
        }))));

        socket.on('premium_equip', (data) => { data = data || {}; done(withPremium(username, (pr) => { // zárt boltnál is felvehető
            const kind = data.kind === 'title' ? 'title' : 'frame';
            const key = String(data.key || '');
            if (key && (!pr.owned.includes(key) || Shop.BY_KEY[key].kind !== kind)) return { error: 'Ez nincs meg neked.' };
            pr[kind] = key;
            return { message: key ? `Felvéve: ${Shop.BY_KEY[key].name}` : (kind === 'frame' ? 'Keret levéve.' : 'Cím levéve.') };
        })); });

        socket.on('premium_open_crate', guard((data) => done(withPremium(username, (pr, u, txs) => {
            const ck = Shop.CRATE_ALIASES[data.key] || String(data.key);
            const crate = Shop.CRATES.find(c => c.key === ck);
            if (!crate) return { error: 'Ismeretlen láda.' };
            if (!(pr.crates[crate.key] > 0)) return { error: 'Nincs ilyen ládád.' };
            if (crate.keyItem && !(pr.keys[crate.keyItem] > 0)) return { error: 'Ehhez kulcs kell (a Boltban veheted meg).' };
            pr.crates[crate.key]--; if (!pr.crates[crate.key]) delete pr.crates[crate.key];
            if (crate.keyItem) { pr.keys[crate.keyItem]--; if (!pr.keys[crate.keyItem]) delete pr.keys[crate.keyItem]; }
            return openCrate(pr, crate, txs);
        }))));

        socket.on('premium_rename', guard((data) => done(withPremium(username, async (pr, u, txs) => {
            if (!(pr.keys.rename > 0)) return { error: 'Ehhez névváltoztatási jog kell (Bolt → Kényelem).' };
            const newName = String(data.newName || '').trim();
            if (!ctx.usernameValid(newName)) return { error: 'Érvénytelen név (3–16 betű vagy szám).' };
            const lower = newName.toLocaleLowerCase('hu');
            const taken = await PlayerModel.findOne({ $or: [{ username: newName }, { usernameLower: lower }] });
            if (taken) return { error: 'Ez a név már foglalt.' };
            pr.keys.rename--; if (!pr.keys.rename) delete pr.keys.rename;
            txs.push({ delta: 0, reason: 'rename', ref: newName, note: `${username} → ${newName}` });
            // a mentés után nevezzük át (a sor a régi néven ment)
            setTimeout(async () => {
                try {
                    adminHooks.kick(username, `Az új neved: ${newName}. Ezzel a névvel lépj be újra.`);
                    await adminHooks.renameUser(u._id, username, newName);
                } catch (e) { console.error('Hiba a névváltoztatáskor:', e); }
            }, 50);
            return { message: `Új neved: ${newName}. Lépj be újra ezzel a névvel.` };
        }))));

        socket.on('premium_order', guard((data) => {
            const pkg = Shop.PACKAGES.find(p => p.key === String(data.pkg));
            const b = data.billing || {};
            const clean = (v, max) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);
            const billing = { name: clean(b.name, 80), zip: clean(b.zip, 10), city: clean(b.city, 60), address: clean(b.address, 120), country: clean(b.country || 'Magyarország', 40), email: clean(b.email, 120) };
            const c = data.consents || {};
            const fail = (m) => socket.emit('premium_order_result', { success: false, message: m });
            if (!pkg) return fail('Válassz csomagot.');
            if (billing.name.length < 3 || billing.zip.length < 3 || billing.city.length < 2 || billing.address.length < 3) return fail('A számlához add meg a neved és a teljes címed.');
            if (billing.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email)) return fail('Az e-mail cím nem jó.');
            if (c.terms !== true || c.immediate !== true) return fail('Fogadd el a feltételeket.');
            OrderModel.countDocuments({ user: username, status: 'pending', createdAt: { $gte: Date.now() - ORDER_EXPIRE_DAYS * DAY } }).then(async (n) => {
                if (n >= MAX_PENDING_ORDERS) return fail(`Egyszerre legfeljebb ${MAX_PENDING_ORDERS} függő rendelésed lehet. Várd meg a jóváírást, vagy írj a stábnak.`);
                let code = newCode();
                for (let i = 0; i < 5 && await OrderModel.findOne({ code }); i++) code = newCode();
                await OrderModel.create({ code, user: username, pkg: pkg.key, credits: pkg.credits, huf: pkg.huf, billing, status: 'pending', createdAt: Date.now(),
                    consents: { terms: true, immediate: true, at: Date.now() } });
                const s = sellerInfo();
                socket.emit('premium_order_result', { success: true, order: { code, credits: pkg.credits, huf: pkg.huf, payee: s.payee, account: s.account, bank: s.bank, expiresDays: ORDER_EXPIRE_DAYS } });
                sendState(socket, username).catch(() => { });
                // az online tulajdonos(ok) értesítése
                Object.values(activePlayers).filter(a => Roles.can(a.role, 'premium')).forEach(a => io.to(a.socketId).emit('server_notice', { text: `💎 Új rendelés: ${username} – ${pkg.huf.toLocaleString('hu-HU')} Ft (${code})` }));
            }).catch(err => { console.error('Hiba a rendeléskor:', err); fail('Nem sikerült a rendelés, próbáld újra.'); });
        }));
    }

    // Láda kinyitása: sorsolás a láda esélyei szerint; ami már megvan, helyett credit
    function openCrate(pr, crate, txs) {
        const won = Shop.rollCrate(crate.key, Math.random);
        const def = Shop.BY_KEY[won];
        let refund = 0;
        if (pr.owned.includes(won)) { refund = Shop.RARITY[def.rarity].dupRefund; pr.credits += refund; }
        else pr.owned.push(won);
        txs.push({ delta: refund, reason: refund ? 'crate_duplicate' : 'crate', ref: won, note: `${crate.name}: ${def.name}${refund ? ' (már megvolt)' : ''}` });
        return { message: refund ? `${def.name} – ez már megvolt, helyette +${refund} credit.` : `Új: ${def.name}!`, reveal: { key: won, refund, crate: crate.key } };
    }

    // Zsákmány közben ritkán láda: ha a játékos egy épületet sikeresen átkutatott
    function onPlayerSaved(username, before, p) {
        try {
            const a = activePlayers[username];
            if (!a || !enabledFor(a.role)) return;
            if (num(p.stats && p.stats.buildingsLooted) <= num(before.stats && before.stats.buildingsLooted)) return;
            Shop.CRATES.filter(c => c.lootChance).forEach(crate => {
                if (Math.random() >= crate.lootChance * (ctx.lootMultiplier ? ctx.lootMultiplier() : 1)) return;
                withPremium(username, (pr, u, txs) => {
                    pr.crates[crate.key] = (pr.crates[crate.key] || 0) + 1;
                    txs.push({ delta: 0, reason: 'crate_found', ref: crate.key, note: 'épületben találta' });
                }).then(() => notify(username, `📦 Találtál egy ${crate.name}t! (Menü → Prémium → Gyűjteményem)`)).catch(() => { });
            });
        } catch (e) { /* a láda nem állíthatja meg a mentést */ }
    }

    async function onRename(from, to) {
        await OrderModel.updateMany({ user: from }, { user: to }).catch(() => { });
        await TxModel.updateMany({ user: from }, { user: to }).catch(() => { });
    }

    // Eseményből járó kinézet (pl. adventi naptár): ingyen a gyűjteménybe, ha még nincs meg
    function grantCosmetic(username, key) {
        const def = Shop.BY_KEY[key];
        if (!def || !def.kind) return Promise.resolve({ error: 'Ismeretlen kinézet.' });
        return withPremium(username, (pr, u, txs) => {
            const dup = pr.owned.includes(key);
            if (!dup) pr.owned.push(key);
            txs.push({ reason: 'event', delta: 0, note: `Esemény: ${def.name}${dup ? ' (már megvolt)' : ''}` });
            return { message: `Új kinézet: ${def.name}`, dup };
        });
    }
    // Játékban nyert kristály (pl. szerencsekerék jackpot): a naplóban "ajándék" okkal
    function grantCredits(username, amount, note) {
        amount = Math.max(0, Math.floor(num(amount)));
        return withPremium(username, (pr, u, txs) => {
            pr.credits += amount;
            txs.push({ reason: 'gift', delta: amount, note: note || 'Ajándék' });
            return { message: `+${amount} kristály` };
        });
    }
    // Kristály költése játékbeli szolgáltatásra (pl. képesség-újraosztás, v0.1.20)
    function spendCredits(username, amount, note) {
        amount = Math.max(0, Math.floor(num(amount)));
        return withPremium(username, (pr, u, txs) => {
            if (pr.credits < amount) return { error: `Ehhez ${amount} kristály kell, neked ${pr.credits} van.` };
            pr.credits -= amount;
            txs.push({ reason: 'spend', delta: -amount, note: note || 'Költés' });
            return { message: `-${amount} kristály` };
        });
    }
    // Festék vagy kulcs a fiókba (nem vész el halálkor)
    function grantKey(username, key, note) {
        if (!Shop.BY_KEY[key]) return Promise.resolve({ error: 'Ismeretlen.' });
        return withPremium(username, (pr, u, txs) => {
            pr.keys[key] = (pr.keys[key] || 0) + 1;
            txs.push({ reason: 'event', delta: 0, note: note || Shop.BY_KEY[key].name });
            return { message: Shop.BY_KEY[key].name };
        });
    }

    return { onConnect, onPlayerSaved, onRename, enabledFor, grantCosmetic, grantCredits, grantKey, spendCredits };
}

module.exports = { setup, normalizePremium, mode, enabledFor, models: { TxModel, OrderModel } };
