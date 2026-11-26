// wheel.js
// SZERENCSEKERÉK – Fagyos Csend (v0.1.19). Közös a kliensnek és a szervernek.
// - Pörgetés csak játékkal szerezhető (minden felakasztott dísz után 1), credittel soha.
// - Naponta legfeljebb DAILY_MAX pörgetés. A kerék cikkei egyformák; a valódi esélyek a kerék alatt mindig ki vannak írva.
// - Ha egy kinézet már megvan, helyette DUP_MONEY pénz jár.
(function (root) {
    const DAILY_MAX = 10;
    const DUP_MONEY = 200;
    // kind: item | xp | money | cosmetic | paint | credits
    const PRIZES = [
        { key: 'cocoa',    kind: 'item', item: 'hot_cocoa', count: 2,  chance: 0.134, label: 'Forró Kakaó ×2',   color: '#7a4a2a', icon: '☕' },
        { key: 'beans',    kind: 'item', item: 'canned_food', count: 2, chance: 0.14, label: 'Babkonzerv ×2',   color: '#3f5a2a', icon: '🥫' },
        { key: 'bandage',  kind: 'item', item: 'bandage', count: 2,    chance: 0.12,  label: 'Steril Kötszer ×2', color: '#8a2a24', icon: '🩹' },
        { key: 'xp50',     kind: 'xp', amount: 50,                     chance: 0.12,  label: '+50 XP',          color: '#2f4a6a', icon: '⭐' },
        { key: 'money100', kind: 'money', amount: 100,                 chance: 0.10,  label: '+100 $',          color: '#5a5320', icon: '💰' },
        { key: 'ammo',     kind: 'item', item: 'ammo_9mm', count: 10,  chance: 0.08,  label: '9 mm lőszer ×10', color: '#4a4a40', icon: '🎯' },
        { key: 'capstar',  kind: 'item', item: 'orn_capstar', count: 2, chance: 0.08, label: 'Kupakcsillag ×2', color: '#a5832a', icon: '⭐' },
        { key: 'xp150',    kind: 'xp', amount: 150,                    chance: 0.06,  label: '+150 XP',         color: '#24507a', icon: '🌟' },
        { key: 'batt',     kind: 'item', item: 'aa_batteries', count: 4, chance: 0.06, label: 'AA elem ×4',     color: '#3a3f4a', icon: '🔋' },
        { key: 'mre',      kind: 'item', item: 'mre_ration', count: 1, chance: 0.05,  label: 'Katonai MRE',     color: '#5a4a2a', icon: '🍱' },
        { key: 'f_storm',  kind: 'cosmetic', cosmetic: 'frame_blizzard26', chance: 0.03,  label: '„Hóvihar” keret',   color: '#5aa0e0', icon: '❄️', rare: 'rare' },
        { key: 't_helper', kind: 'cosmetic', cosmetic: 'title_elf26',      chance: 0.015, label: '„Télapó segédje”', color: '#b06ad8', icon: '🎅', rare: 'epic' },
        { key: 'f_heart',  kind: 'cosmetic', cosmetic: 'frame_iceheart26', chance: 0.005, label: '„Jégszív” keret',  color: '#e8b84a', icon: '💠', rare: 'legendary' },
        { key: 'p_weapon', kind: 'paint', paint: 'paint_frost_weapon', chance: 0.003, label: 'Fagyos festés – fegyver', color: '#9fd8f0', icon: '🔫', rare: 'legendary' },
        { key: 'p_jacket', kind: 'paint', paint: 'paint_frost_jacket', chance: 0.002, label: 'Fagyos festés – kabát',   color: '#bfe8ff', icon: '🧥', rare: 'legendary' },
        { key: 'jackpot',  kind: 'credits', amount: 100,               chance: 0.001, label: 'JACKPOT: 100 kristály', color: '#ffd24a', icon: '💎', rare: 'jackpot' }
    ];
    const BY_KEY = {};
    PRIZES.forEach(p => { BY_KEY[p.key] = p; });

    function roll(random) {
        let r = (random || Math.random)();
        for (const p of PRIZES) { if (r < p.chance) return p.key; r -= p.chance; }
        return PRIZES[0].key;
    }
    // A kerék cikkei: egyforma méretűek, a ritkák elosztva a kerék körül (a nyerést a szerver dönti el a fenti esélyekkel)
    const WHEEL_ORDER = ['cocoa', 'f_storm', 'beans', 'xp50', 'p_weapon', 'bandage', 'money100', 't_helper', 'ammo', 'jackpot', 'capstar', 'xp150', 'f_heart', 'batt', 'p_jacket', 'mre'];
    function segments() {
        const deg = 360 / WHEEL_ORDER.length;
        return WHEEL_ORDER.map((key, i) => ({ key, from: i * deg, to: (i + 1) * deg }));
    }

    const api = { DAILY_MAX, DUP_MONEY, PRIZES, BY_KEY, WHEEL_ORDER, roll, segments };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalWheel = api;
})(this);
