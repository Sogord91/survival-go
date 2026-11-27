// newyear.js – SZILVESZTER: az év zárása (v0.1.35); a Fagyos Csend jan. 6-ig tart. Közös a kliensnek és a szervernek.
// - Dec. 31. és jan. 1. (magyar idő) között: szilveszteri tárgyak esnek, tűzijátékot lehet lőni.
// - Aki ilyenkor belép, egyszer szilveszteri csomagot kap.
// - Éjfélkor (jan. 1. 00:00 magyar idő) mindenkinél tűzijáték és újévi köszöntő.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const START = '2026-12-31';
    const END = '2027-01-01';                       // ezen a napon még tart
    const MIDNIGHT = Date.UTC(2026, 11, 31, 23, 0, 0); // 2027. jan. 1. 00:00 magyar idő (UTC+1)
    const YEAR = 2027;
    const SHOW_SECONDS = 90;                        // ennyi ideig tart az éjféli nagy tűzijáték
    const FIREWORK_RANGE_M = 3000;                  // ilyen messziről látszik egy kilőtt rakéta
    const GIFT = [{ key: 'firework_rocket', count: 3 }, { key: 'sparkler', count: 2 }, { key: 'champagne', count: 1 }, { key: 'lucky_pig', count: 1 }, { key: 'party_hat', count: 1 }];

    function dayKey(now) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
    }
    function active(now, test) { if (test) return true; const k = dayKey(now); return k >= START && k <= END; }
    // az éjféli műsor ideje alatt igaz (teszt módban: minden óra első 2 percében)
    function showOn(now, test) {
        if (test) return new Date(now).getMinutes() < 2;
        return now >= MIDNIGHT && now < MIDNIGHT + SHOW_SECONDS * 1000;
    }

    const GREETING = {
        title: `BOLDOG ÚJ ÉVET, TÚLÉLŐK!`,
        lines: [
            'Köszönjük, hogy velünk vagytok! Minden megtett kilométer, minden átkutatott épület és minden ötlet, amit küldtetek, a játék része lett.',
            'Elképesztő érzés látni, hogy a Zóna napról napra népesebb. Nélkületek ez csak egy térkép lenne.',
            `${YEAR}-ben még több tárgy, új helyek, kereskedők és közös kalandok jönnek. Azon dolgozunk, hogy még jobb legyen a játék.`,
            'Vigyázzatok magatokra, és találkozunk a Zónában!'
        ],
        sign: 'A Survival GO csapata'
    };

    const api = { TIME_ZONE, START, END, MIDNIGHT, YEAR, SHOW_SECONDS, FIREWORK_RANGE_M, GIFT, GREETING, dayKey, active, showOn };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalNewYear = api;
})(this);
