// gifts.js
// HÉTVÉGI AJÁNDÉKVADÁSZAT – Fagyos Csend (v0.1.19). Közös a kliensnek és a szervernek.
// - Szombaton és vasárnap (dec. 5. – jan. 6.), 9:00 és 19:00 között ajándékcsomagok jelennek meg a játékosok közelében,
//   mindig közterületen: az OSM utcák pontjain (lakóutca, gyalogút, sétány...). Magánterületen soha.
// - Oda kell sétálni (GIFT_RANGE m-en belülre). A kis csomagot mindenki egyszer kinyithatja, az arany ládát csak az első.
// - Egy játékos naponta legfeljebb DAILY_MAX csomagot nyithat.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const START = '2026-12-05';
    const END = '2027-01-06';
    const HOURS = [9, 19];             // 9:00-tól 19:00-ig (decemberben 16:00 után sötét van: figyelmeztetünk)
    const GIFT_RANGE = 30;             // ilyen közel kell menni
    const NEAR_METERS = 450;           // ennyin belül jelennek meg a csomagok
    const MIN_SPAWN_METERS = 80;       // ne a lábad elé essen
    const PER_PLAYER = 3;              // ennyi aktív csomag legyen a közeledben
    const LIFETIME_MIN = 40;           // ennyi percig marad egy csomag
    const GOLD_CHANCE = 0.05;          // ennyi eséllyel arany láda
    const DAILY_MAX = 12;              // naponta ennyit nyithat egy játékos
    const STREET_TYPES = ['residential', 'living_street', 'pedestrian', 'footway', 'unclassified', 'tertiary', 'service', 'path', 'cycleway', 'track'];

    // Tartalom: súlyozott sorsolás. Kis csomag: 1 tétel; arany: 3 tétel a jobb listából.
    const SMALL = [
        { w: 14, items: [{ key: 'hot_cocoa', count: 1 }] },
        { w: 12, items: [{ key: 'canned_food', count: 1 }] },
        { w: 12, items: [{ key: 'mineral_water', count: 1 }] },
        { w: 10, items: [{ key: 'bandage', count: 1 }] },
        { w: 8, items: [{ key: 'aa_batteries', count: 2 }] },
        { w: 8, items: [{ key: 'candle', count: 1 }] },
        { w: 10, money: 60 },
        { w: 10, xp: 40 },
        { w: 8, items: [{ key: 'orn_capstar', count: 1 }] },
        { w: 5, items: [{ key: 'orn_canball', count: 1 }] },
        { w: 3, items: [{ key: 'orn_angel', count: 1 }] }
    ];
    const GOLD = [
        { w: 12, items: [{ key: 'mre_ration', count: 2 }] },
        { w: 10, items: [{ key: 'medkit', count: 1 }] },
        { w: 10, items: [{ key: 'ammo_9mm', count: 15 }] },
        { w: 10, money: 300 },
        { w: 10, xp: 200 },
        { w: 10, items: [{ key: 'orn_bulb', count: 2 }] },
        { w: 8, items: [{ key: 'orn_icicle', count: 2 }] },
        { w: 5, items: [{ key: 'orn_gasmask_santa', count: 1 }] },
        { w: 1, items: [{ key: 'orn_radball', count: 1 }] }
    ];

    function dayKey(ms) { return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
    function localParts(ms) {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date(ms));
        const get = (t) => (parts.find(p => p.type === t) || {}).value;
        return { weekday: get('weekday'), hour: Number(get('hour')) % 24 };
    }
    // Most zajlik-e a vadászat (test: a stáb bármikor kipróbálhatja)
    function active(now, test) {
        if (test) return true;
        const k = dayKey(now);
        if (k < START || k > END) return false;
        const { weekday, hour } = localParts(now);
        return (weekday === 'Sat' || weekday === 'Sun') && hour >= HOURS[0] && hour < HOURS[1];
    }
    function roll(list, random) {
        const total = list.reduce((a, o) => a + o.w, 0);
        let r = (random || Math.random)() * total;
        for (const o of list) { if (r < o.w) return o; r -= o.w; }
        return list[0];
    }
    function rollContents(kind, random) {
        if (kind === 'gold') return [roll(GOLD, random), roll(GOLD, random), roll(GOLD, random)];
        return [roll(SMALL, random)];
    }

    const api = { TIME_ZONE, START, END, HOURS, GIFT_RANGE, NEAR_METERS, MIN_SPAWN_METERS, PER_PLAYER, LIFETIME_MIN, GOLD_CHANCE, DAILY_MAX, STREET_TYPES, SMALL, GOLD, dayKey, active, rollContents };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalGifts = api;
})(this);
