// prices.js – JÁTÉKBELI SZOLGÁLTATÁSOK ÁRA (v0.1.23). A szerver, a játék és az admin oldal is ezt használja.
// Minden módosítás fizetős: játékbeli pénzért ($) és – ha a kristály be van kapcsolva – kristályért is.
// "free": az első alkalom ingyenes (csapatonként, illetve játékosonként egyszer).
// "from": ki fizeti a pénzt: a csapatkassza (bank) vagy a játékos maga (player).
// Az árakat az admin oldalon lehet módosítani (FEJLŐDÉS fül); itt az alapértékek vannak.
(function (root) {
    'use strict';
    const ITEMS = {
        team_create: { name: 'Csapat alapítása', icon: '🏕️', money: 500, crystals: 0, free: false, from: 'player' },
        team_emblem: { name: 'Új címer', icon: '🛡️', money: 300, crystals: 30, free: true, from: 'bank' },
        team_name: { name: 'Csapat átnevezése', icon: '✏️', money: 1000, crystals: 100, free: true, from: 'bank' },
        team_tag: { name: 'Új rövidítés', icon: '🏷️', money: 500, crystals: 50, free: true, from: 'bank' },
        team_reroll: { name: 'Másik csapatküldetés', icon: '🔄', money: 300, crystals: 30, free: true, from: 'bank' },
        shelter_move: { name: 'Menedék költöztetése', icon: '🏠', money: 500, crystals: 50, free: true, from: 'player' }
    };
    const KEYS = Object.keys(ITEMS);
    const LIMIT = 1000000;

    function clampN(v, d) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(LIMIT, n)) : d; }
    // admin által mentett árak + alapértékek -> teljes, ellenőrzött tábla
    function normalize(saved) {
        const s = saved && typeof saved === 'object' ? saved : {};
        const out = {};
        KEYS.forEach(k => {
            const d = ITEMS[k], x = s[k] && typeof s[k] === 'object' ? s[k] : {};
            out[k] = { ...d, money: clampN(x.money, d.money), crystals: clampN(x.crystals, d.crystals), free: x.free === undefined ? d.free : !!x.free };
        });
        return out;
    }
    // szöveg a gombokhoz: "ingyenes (első alkalom)" / "300 $ a csapatkasszából"
    function label(p, usedFree, crystalsOn) {
        if (p.free && !usedFree) return 'első alkalommal ingyenes';
        const parts = [];
        if (p.money) parts.push(`${p.money.toLocaleString('hu-HU')} $${p.from === 'bank' ? ' a csapatkasszából' : ''}`);
        if (crystalsOn && p.crystals) parts.push(`${p.crystals} 💎`);
        return parts.length ? parts.join(' vagy ') : 'ingyenes';
    }

    const api = { ITEMS, KEYS, normalize, label };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SurvivalPrices = api;
})(typeof window !== 'undefined' ? window : globalThis);
