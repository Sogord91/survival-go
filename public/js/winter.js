// winter.js
// FAGYOS CSEND – karácsonyfák minden településen, díszek, szerencsekerék (v0.1.19). Közös a kliensnek és a szervernek.
// - Dec. 6. és jan. 6. között minden településen (OSM place: város, falu, városrész) áll egy közös karácsonyfa.
// - A díszeket a fára akasztod (a fa 60 m-es körzetében). A pontok a település fáját díszítik, és minden dísz egy pörgetést ad.
// - A díszeket átkutatással találod (az esemény alatt), barkácsolod, vagy az adventi naptárból / a kerékről kapod.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const START = '2026-12-06';
    const END = '2027-01-06';          // ezen a napon még tart
    const RANGE_METERS = 60;           // ilyen közel kell lenni a fához
    const NEAR_KM = 12;                // ekkora körzetben látod a fákat a térképen
    const PLACE_TYPES = ['city', 'town', 'village', 'suburb'];
    // Mennyi pont kell a "félig díszített" és a "kész" állapothoz (a nagyobb település több díszt kíván)
    const STAGES = { village: [15, 50], suburb: [25, 80], town: [40, 140], city: [80, 300] };
    const LOOT_CHANCE = 0.12;          // sikeres átkutatáskor ennyi eséllyel dísz is akad (az esemény alatt)
    const LOOT_ORNAMENTS = [           // melyik dísz milyen súllyal jön átkutatásból
        { key: 'orn_capstar', w: 26 }, { key: 'orn_canball', w: 26 }, { key: 'orn_bell', w: 26 },
        { key: 'orn_angel', w: 6 }, { key: 'orn_icicle', w: 6 }, { key: 'orn_bulb', w: 6 },
        { key: 'orn_gasmask_santa', w: 3.6 }, { key: 'orn_radball', w: 0.4 }
    ];

    function dayKey(ms) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    }
    function active(now, test) { if (test) return true; const k = dayKey(now); return k >= START && k <= END; }
    function stageOf(points, placeType) {
        const s = STAGES[placeType] || STAGES.village;
        return points >= s[1] ? 2 : points >= s[0] ? 1 : 0;
    }
    function nextGoal(points, placeType) {
        const s = STAGES[placeType] || STAGES.village;
        return points < s[0] ? s[0] : points < s[1] ? s[1] : null;
    }
    function rollLootOrnament(random) {
        const total = LOOT_ORNAMENTS.reduce((a, o) => a + o.w, 0);
        let r = (random || Math.random)() * total;
        for (const o of LOOT_ORNAMENTS) { if (r < o.w) return o.key; r -= o.w; }
        return LOOT_ORNAMENTS[0].key;
    }
    // Pörgetések: naponta 1 ingyen + a díszekért kapottak ("bank"), naponta legfeljebb DAILY_MAX
    function spinStatus(w, now, dailyMax) {
        const today = dayKey(now);
        const st = w && typeof w === 'object' ? w : {};
        const usedToday = st.day === today ? (st.used || 0) : 0;
        const free = st.freeDay === today ? 0 : 1;
        const bank = Math.max(0, st.bank || 0);
        const left = Math.max(0, (dailyMax || 10) - usedToday);
        return { today, usedToday, free, bank, available: Math.min(left, free + bank), capReached: left === 0 };
    }

    const api = { TIME_ZONE, START, END, RANGE_METERS, NEAR_KM, PLACE_TYPES, STAGES, LOOT_CHANCE, LOOT_ORNAMENTS, dayKey, active, stageOf, nextGoal, rollLootOrnament, spinStatus };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalWinter = api;
})(this);
