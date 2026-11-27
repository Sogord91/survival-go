// season.js
// RANGLISTA ÉS HAVI SZEZON (v0.1.20). A szezonpont = a hónapban szerzett XP (séta, kutatás, harc, küldetések).
// A halál nem nullázza a szezont. A stáb nem kerül a ranglistára.
// December: próbaszezon (jutalom nélkül). 2027 januárjától a legjobbak a Rozsdás szettet kapják.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const FIRST_REWARD_MONTH = '2027-01';
    const BOARDS = [
        { key: 'xp', name: 'Szezonpont', icon: '🏆', unit: 'pont', desc: 'A hónapban szerzett XP: séta, kutatás, harc, küldetések. Ez dönti el a szezonjutalmat.' },
        { key: 'meters', name: 'Megtett út', icon: '🥾', unit: 'km', desc: 'A hónapban gyalog megtett út.' },
        { key: 'cells', name: 'Felfedezés', icon: '🗺️', unit: 'terület', desc: 'A hónapban felfedezett új (kb. 500 m-es) területek.' },
        { key: 'quests', name: 'Küldetések', icon: '📜', unit: 'db', desc: 'A hónapban teljesített napi és heti küldetések.' },
        { key: 'level', name: 'Szint', icon: '⭐', unit: 'szint', desc: 'A jelenlegi túlélő szintje (halálkor elölről kezdődik).' },
        { key: 'pvp', name: 'PvP', icon: '🔫', unit: 'győzelem', desc: 'A hónapban megnyert támadások (más túlélő legyőzése).' },
        { key: 'teams', name: 'Csapatok', icon: '🏕️', unit: 'pont', desc: 'A csapatok tagjainak összesített szezonpontja ebben a hónapban.' }
    ];
    // ÖSSZESÍTETT ranglista (v0.1.24): a játék kezdete óta, a halál sem nullázza
    const ALL_BOARDS = [
        { key: 'xp', name: 'Összes XP', icon: '🏆', unit: 'XP', desc: 'Az összes valaha megszerzett XP. A halál nem veszi el.' },
        { key: 'meters', name: 'Megtett út', icon: '🥾', unit: 'km', desc: 'Az összes gyalog megtett út a játék kezdete óta.' },
        { key: 'cells', name: 'Felfedezés', icon: '🗺️', unit: 'terület', desc: 'Az összes felfedezett (kb. 500 m-es) terület.' },
        { key: 'loot', name: 'Kutatás', icon: '🏚️', unit: 'épület', desc: 'Az összes átkutatott épület.' },
        { key: 'wins', name: 'Győzelmek', icon: '⚔️', unit: 'győzelem', desc: 'Az összes megnyert harc.' },
        { key: 'pvp', name: 'PvP', icon: '🔫', unit: 'győzelem', desc: 'Az összes legyőzött túlélő (támadásban).' },
        { key: 'level', name: 'Szint', icon: '⭐', unit: 'szint', desc: 'A jelenlegi túlélő szintje (halálkor elölről kezdődik).' }
    ];
    // a szinthez tartozó összes XP (1. szinttől): 100 + 200 + … + (L-1)·100
    function xpForLevel(level) { const L = Math.max(1, Math.floor(level || 1)); return 50 * L * (L - 1); }
    // A Rozsdás szett: helyezés szerint
    const REWARDS = [
        { from: 1, to: 3, items: ['frame_rust_s1', 'title_rust_s1', 'paint_rust_weapon'], label: 'Rozsdás Bajnok keret + „Rozsdás Bajnok” cím + Rozsdás fegyverfesték' },
        { from: 4, to: 10, items: ['frame_rust_s1', 'title_rust_vet'], label: 'Rozsdás Bajnok keret + „Rozsdás Veterán” cím' },
        { from: 11, to: 50, items: ['title_rust_s'], label: '„Rozsdás Túlélő” cím' }
    ];
    const MIN_XP_FOR_REWARD = 500; // ennyi szezonpont kell legalább a jutalomhoz (ne üres fiók nyerjen)

    function monthKey(ms) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).format(new Date(ms)).slice(0, 7);
    }
    function prevMonth(month) {
        const [y, m] = month.split('-').map(Number);
        return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
    function monthName(month) {
        const names = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
        const [y, m] = month.split('-').map(Number);
        return `${y}. ${names[m - 1]}`;
    }
    function rewarded(month) { return month >= FIRST_REWARD_MONTH; }
    function rewardFor(rank) { return REWARDS.find(r => rank >= r.from && rank <= r.to) || null; }
    // A hónap végéig hátralévő idő (ms), magyar idő szerint
    function msLeft(now) {
        const month = monthKey(now);
        let t = now;
        // a következő hónap első napjáig lépkedünk órákban (egyszerű és nyári/téli időtől független)
        let step = 86400000;
        while (monthKey(t + step) === month) t += step;
        while (step > 60000) { step = Math.floor(step / 2); if (monthKey(t + step) === month) t += step; }
        return Math.max(0, t + 60000 - now);
    }
    // A játékos szezon-számlálója (hónapváltáskor nulláz)
    function fresh(s, now) {
        const month = monthKey(now);
        if (!s || s.month !== month) return { month, xp: 0, meters: 0, cells: 0, quests: 0, pvp: 0 };
        return s;
    }
    function valueOf(entry, key) {
        if (key === 'meters') return Math.round((entry.meters || 0) / 100) / 10;
        return entry[key] || 0;
    }

    const api = { FIRST_REWARD_MONTH, BOARDS, ALL_BOARDS, xpForLevel, REWARDS, MIN_XP_FOR_REWARD, monthKey, prevMonth, monthName, rewarded, rewardFor, msLeft, fresh, valueOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalSeason = api;
})(this);
