// scripts/statisztika.js
// JÁTÉKOS-STATISZTIKA (v0.1.13): összesítő és táblázat a túlélőkről, csak olvas az adatbázisból.
// A szerveren: statisztika            (mindenki, szint szerint)
//              statisztika penz       (pénz szerint)   | olesek | epuletek | km | utoljara | reg
//              statisztika alice      (egy játékos részletesen)
// A MONGO_URI-t a /etc/survival-go.env-ből kapja (lásd a /usr/local/bin/statisztika parancsot).
const path = require('path');
const mongoose = require('mongoose');
let ENEMY_NAMES = {};
try { const { ENEMIES } = require(path.join(__dirname, '..', 'combat-engine')); Object.keys(ENEMIES).forEach(k => { ENEMY_NAMES[k] = ENEMIES[k].name; }); } catch (e) { }
const enemyName = (k) => ENEMY_NAMES[k] || k;

const RANKS = [['Újonc', 1], ['Kadét', 5], ['Őrvezető', 10], ['Tizedes', 15], ['Őrmester', 20], ['Törzsőrmester', 25], ['Zászlós', 30],
    ['Hadnagy', 35], ['Főhadnagy', 40], ['Százados', 45], ['Őrnagy', 50], ['Ezredes', 60], ['Zóna-parancsnok', 75]];
const rank = (lvl) => { let r = RANKS[0][0]; RANKS.forEach(([n, l]) => { if ((Number(lvl) || 1) >= l) r = n; }); return r; };

const TZ = 'Europe/Budapest';
const dt = (ms) => ms ? new Date(ms).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16) : '–';
const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
function ago(ms) {
    if (!ms) return '–';
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 2) return 'most';
    if (m < 60) return `${m} perce`;
    if (m < 1440) return `${Math.floor(m / 60)} órája`;
    return `${Math.floor(m / 1440)} napja`;
}
const num = (v) => Number(v) || 0;
const fmt = (v) => Math.round(num(v)).toLocaleString('hu-HU');
const pad = (s, n, right) => { s = String(s); if (s.length > n) s = s.slice(0, n - 1) + '…'; return right ? s.padStart(n) : s.padEnd(n); };

function row(u) {
    const p = u.playerData || {};
    const s = p.stats || {};
    const kills = Object.values(s.kills || {}).reduce((a, b) => a + num(b), 0) || num(s.killsTotal);
    return {
        name: u.username, early: !!u.earlySurvivor, level: num(p.level) || 1, xp: num(p.xp), money: num(p.money),
        hp: num(p.hp), maxHp: num(p.maxHp), dead: !!p.dead, deaths: num(s.deaths), kills, killsBy: s.kills || {},
        looted: num(s.buildingsLooted), crafted: num(s.itemsCrafted), won: num(s.combatsWon), km: num(s.walkedMeters) / 1000,
        longest: num(s.longestLifeMs), lastSeen: num(p.lastSeen), reg: u._id && u._id.getTimestamp ? u._id.getTimestamp().getTime() : 0,
        equipment: p.equipment || {}, inventory: p.inventory || [], tutorial: p.tutorial, daily: p.daily, email: u.email
    };
}

const SORTS = {
    szint: (a, b) => b.level - a.level || b.xp - a.xp, penz: (a, b) => b.money - a.money, olesek: (a, b) => b.kills - a.kills,
    epuletek: (a, b) => b.looted - a.looted, km: (a, b) => b.km - a.km, utoljara: (a, b) => b.lastSeen - a.lastSeen, reg: (a, b) => b.reg - a.reg
};

function summary(rows) {
    const now = Date.now(), today = dayKey(now);
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    console.log('\n=== SURVIVAL GO – ÖSSZESÍTŐ ===   ' + dt(now));
    console.log(`Regisztrált túlélő:  ${rows.length}   (ma: ${rows.filter(r => r.reg && dayKey(r.reg) === today).length}, utolsó 7 nap: ${rows.filter(r => now - r.reg < 7 * 86400000).length})`);
    console.log(`Aktív:               utolsó 1 óra: ${rows.filter(r => now - r.lastSeen < 3600000).length}, 24 óra: ${rows.filter(r => now - r.lastSeen < 86400000).length}, 7 nap: ${rows.filter(r => now - r.lastSeen < 7 * 86400000).length}`);
    console.log(`Korai túlélő jelvény: ${rows.filter(r => r.early).length} / 100`);
    console.log(`Még sosem lépett be a játékba: ${rows.filter(r => !r.lastSeen).length}`);
    console.log(`Összesen: ${fmt(sum('looted'))} átkutatott épület, ${fmt(sum('kills'))} legyőzött ellenfél, ${fmt(sum('deaths'))} halál, ${sum('km').toFixed(1)} km gyaloglás, ${fmt(sum('crafted'))} barkácsolt tárgy`);
    console.log(`Pénz a játékban összesen: ${fmt(sum('money'))} $`);
    const killsBy = {};
    rows.forEach(r => Object.entries(r.killsBy).forEach(([k, v]) => { killsBy[k] = (killsBy[k] || 0) + num(v); }));
    const top = Object.entries(killsBy).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${enemyName(k)} ${v}`).join(', ');
    if (top) console.log(`Legtöbbször legyőzött: ${top}`);
}

function table(rows) {
    const head = pad('#', 3, true) + ' ' + pad('NÉV', 16) + pad('SZINT', 6, true) + '  ' + pad('RANG', 14) + pad('XP', 7, true) + pad('PÉNZ $', 9, true) +
        pad('ÉLET', 9, true) + pad('ÖLÉS', 6, true) + pad('HALÁL', 6, true) + pad('ÉPÜLET', 7, true) + pad('KM', 7, true) + '  ' + pad('UTOLJÁRA', 11) + 'REG.';
    console.log('\n' + head); console.log('-'.repeat(head.length + 6));
    rows.forEach((r, i) => {
        console.log(pad(i + 1, 3, true) + ' ' + pad((r.early ? '★' : '') + r.name, 16) + pad(r.level, 6, true) + '  ' + pad(rank(r.level), 14) + pad(fmt(r.xp), 7, true) +
            pad(fmt(r.money), 9, true) + pad(r.dead ? 'HALOTT' : `${Math.round(r.hp)}/${Math.round(r.maxHp)}`, 9, true) + pad(r.kills, 6, true) + pad(r.deaths, 6, true) +
            pad(r.looted, 7, true) + pad(r.km.toFixed(1), 7, true) + '  ' + pad(ago(r.lastSeen), 11) + dt(r.reg).slice(0, 10));
    });
    console.log('\n★ = Korai túlélő.   Rendezés: statisztika szint | penz | olesek | epuletek | km | utoljara | reg   ·   Egy játékos: statisztika <név>');
}

function detail(r) {
    console.log(`\n=== ${r.name} ${r.early ? '(★ Korai túlélő)' : ''} ===`);
    console.log(`Szint ${r.level} – ${rank(r.level)}, XP ${fmt(r.xp)}, pénz ${fmt(r.money)} $, élet ${r.dead ? 'HALOTT' : `${Math.round(r.hp)}/${Math.round(r.maxHp)}`}`);
    console.log(`Regisztrált: ${dt(r.reg)}   Utoljára: ${dt(r.lastSeen)} (${ago(r.lastSeen)})`);
    console.log(`Statisztika: ${r.looted} épület, ${r.won} megnyert harc, ${r.kills} ölés, ${r.deaths} halál, ${r.km.toFixed(2)} km, ${r.crafted} barkácsolt tárgy, leghosszabb élet ${(r.longest / 3600000).toFixed(1)} óra`);
    const kb = Object.entries(r.killsBy).map(([k, v]) => `${enemyName(k)} ${v}`).join(', ');
    if (kb) console.log(`Ölések: ${kb}`);
    const eq = Object.entries(r.equipment).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
    console.log(`Felszerelés: ${eq || '–'}`);
    console.log(`Hátizsák (${r.inventory.length} hely): ${r.inventory.map(s => `${s.key}×${s.count || 1}`).join(', ') || '–'}`);
    const t = r.tutorial || {};
    console.log(`Első lépések: ${Object.keys(t.done || {}).length}/6 lépés${t.finalClaimed ? ', jutalom átvéve' : ''}   Napi bónusz sorozat: ${(r.daily && r.daily.streak) || 0} (utoljára ${(r.daily && r.daily.lastDay) || '–'})`);
}

(async () => {
    if (!process.env.MONGO_URI) { console.error('Hiányzik a MONGO_URI.'); process.exit(1); }
    await mongoose.connect(process.env.MONGO_URI);
    const users = await mongoose.connection.db.collection('survivalusers').find({}, { projection: { password: 0 } }).toArray();
    const rows = users.map(row);
    const arg = (process.argv[2] || 'szint').toLowerCase();
    if (SORTS[arg]) {
        summary(rows);
        table(rows.sort(SORTS[arg]));
    } else {
        const r = rows.find(x => x.name.toLowerCase() === arg);
        if (r) detail(r); else console.log(`Nincs ilyen játékos: ${process.argv[2]}`);
    }
    await mongoose.disconnect();
})().catch(err => { console.error('Hiba:', err.message); process.exit(1); });
