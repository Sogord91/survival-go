// advent.js
// ADVENTI NAPTÁR – a Fagyos Csend téli eseménysorozat része (v0.1.18). Közös a kliensnek és a szervernek.
// - December 1–24. között minden nap egy ablak nyílik (magyar idő szerint éjfélkor).
// - A kihagyott ablakot pótolni lehet: naponta legfeljebb egyet, december 26-ig.
// - A 6. (Mikulás) és a 24. (Szenteste) kiemelt nap: csak itt megszerezhető kinézet is jár.
// - A jövőbeli ablakok tartalma rejtett, csak a kinyitáskor derül ki.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const YEAR = 2026;
    const FIRST = `${YEAR}-12-01`;       // az első ablak napja
    const DAYS_TOTAL = 24;
    const CATCHUP_UNTIL = `${YEAR}-12-26`; // eddig lehet pótolni (ezen a napon még igen)

    // Jutalmak (a tárgykulcsok az items.js-ből; cosmetic: a shop.js COSMETICS listájából, csak itt szerezhető)
    const DAYS = [
        { day: 1,  items: [{ key: 'hot_cocoa', count: 2 }, { key: 'candle', count: 2 }], xp: 30 },
        { day: 2,  items: [{ key: 'canned_food', count: 2 }, { key: 'mineral_water', count: 2 }], xp: 30 },
        { day: 3,  items: [{ key: 'bandage', count: 2 }, { key: 'antiseptic_wipes', count: 2 }], xp: 40 },
        { day: 4,  items: [{ key: 'earflap_cap', count: 1 }], xp: 40 },
        { day: 5,  items: [{ key: 'soup_packets', count: 3 }, { key: 'coffee', count: 2 }], xp: 50 },
        { day: 6,  items: [{ key: 'honey_syrup', count: 1 }, { key: 'muffin', count: 3 }, { key: 'orn_capstar', count: 3 }], xp: 150, money: 200, cosmetic: 'title_santa26', special: 'Mikulás' },
        { day: 7,  items: [{ key: 'thermos', count: 1 }], xp: 50 },
        { day: 8,  items: [{ key: 'compression_bandage', count: 2 }, { key: 'painkillers', count: 2 }], xp: 60 },
        { day: 9,  items: [{ key: 'wool_trousers', count: 1 }], xp: 60 },
        { day: 10, items: [{ key: 'ferro_rod', count: 1 }, { key: 'orn_canball', count: 2 }], xp: 60 },
        { day: 11, items: [{ key: 'pemmican', count: 2 }, { key: 'honey_water', count: 2 }], xp: 70 },
        { day: 12, items: [{ key: 'led_lantern', count: 1 }], xp: 70 },
        { day: 13, items: [{ key: 'parka', count: 1 }], xp: 80 },
        { day: 14, items: [{ key: 'headlamp', count: 1 }, { key: 'aa_batteries', count: 4 }], xp: 80 },
        { day: 15, items: [{ key: 'mre_ration', count: 2 }, { key: 'orn_angel', count: 1 }], xp: 90 },
        { day: 16, items: [{ key: 'ushanka', count: 1 }], xp: 90 },
        { day: 17, items: [{ key: 'suture_kit', count: 1 }, { key: 'hemostatic_gauze', count: 2 }], xp: 100 },
        { day: 18, items: [{ key: 'hiking_boots', count: 1 }], xp: 100 },
        { day: 19, items: [{ key: 'ammo_9mm', count: 20 }], xp: 100 },
        { day: 20, items: [{ key: 'orn_bulb', count: 1 }], xp: 120, money: 150 },
        { day: 21, items: [{ key: 'medkit', count: 1 }], xp: 120 },
        { day: 22, items: [{ key: 'leather_backpack', count: 1 }], xp: 150 },
        { day: 23, items: [{ key: 'music_box', count: 1 }, { key: 'orn_icicle', count: 1 }], xp: 150 },
        { day: 24, items: [{ key: 'orn_gasmask_santa', count: 1 }], xp: 300, money: 500, cosmetic: 'frame_frost26', special: 'Szenteste' }
    ];

    // 'ÉÉÉÉ-HH-NN' a magyar naptár szerint
    function dayKey(ms) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    }
    // Hányadik adventi nap van ma: 0 = még nem kezdődött, 1–24, 25+ = már elmúlt (pótolni még lehet 26-ig)
    function todayNumber(now) {
        const k = dayKey(now);
        if (k < FIRST) return 0;
        if (k.slice(0, 7) !== `${YEAR}-12`) return 99;
        return Number(k.slice(8, 10));
    }
    // Teszt üzemmódban (csak a stáb, ADVENT_TEST=on) a teljes naptár nyitható, mintha 24-e lenne
    function status(adv, now, opts) {
        const test = !!(opts && opts.test);
        const today = dayKey(now);
        const n = test ? DAYS_TOTAL : todayNumber(now);
        const active = test || (today >= FIRST && today <= CATCHUP_UNTIL);
        const opened = new Set((adv && Array.isArray(adv.opened)) ? adv.opened : []);
        const catchupUsed = !test && !!adv && adv.catchupDay === today;
        const last = Math.min(n, DAYS_TOTAL);
        const todayOpen = active && n >= 1 && n <= DAYS_TOTAL && !opened.has(n);
        const missed = [];
        for (let d = 1; d <= last; d++) if (!opened.has(d) && !(d === n && n <= DAYS_TOTAL)) missed.push(d);
        const canCatchup = active && !catchupUsed && missed.length > 0;
        return { active, test, today, n, opened: [...opened], todayOpen, missed, catchupUsed, canCatchup, ended: !test && today > CATCHUP_UNTIL, notStarted: !test && today < FIRST };
    }
    // Kinyitható-e az adott ablak. catchup: pótlásként nyílik (aznapra elhasználja a pótlást)
    function canOpen(adv, day, now, opts) {
        const st = status(adv, now, opts);
        day = Math.floor(Number(day));
        if (!(day >= 1 && day <= DAYS_TOTAL)) return { ok: false, reason: 'Nincs ilyen ablak.' };
        if (st.notStarted) return { ok: false, reason: 'Az adventi naptár december 1-jén nyílik.' };
        if (!st.active) return { ok: false, reason: 'Az adventi naptár véget ért. Jövőre újra jön!' };
        if (st.opened.includes(day)) return { ok: false, reason: 'Ezt az ablakot már kinyitottad.' };
        if (day > st.n) return { ok: false, reason: `Ez az ablak december ${day}-jén nyílik.` };
        if (st.test) return { ok: true, catchup: false };
        if (day === st.n) return { ok: true, catchup: false };
        if (st.catchupUsed) return { ok: false, reason: 'Ma már pótoltál egy ablakot. Holnap pótolhatod a következőt!' };
        return { ok: true, catchup: true };
    }

    const api = { TIME_ZONE, YEAR, FIRST, DAYS_TOTAL, CATCHUP_UNTIL, DAYS, dayKey, todayNumber, status, canOpen };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalAdvent = api;
})(this);
