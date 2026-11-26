// shop.js – PRÉMIUM BOLT KATALÓGUSA (v0.1.16). A szerver és a kliens is ezt használja.
// Árak creditben; 1 credit = CREDIT_HUF forint. Minden ár mellett a forintos összeg is látszik (EU fogyasztóvédelmi elv).
// A credit csak kinézetre és kényelemre költhető: harcban, zsákmányban nem ad előnyt.
(function (root) {
    const CREDIT_HUF = 10;

    // Credit csomagok átutalásos vásárláshoz (nincs "bónusz credit", így az ár mindig egyértelmű)
    const PACKAGES = [
        { key: 'p100', credits: 100, huf: 1000, name: 'Marék kristály', img: 'gem' },
        { key: 'p250', credits: 250, huf: 2500, name: 'Kristályzacskó', img: 'gem' },
        { key: 'p500', credits: 500, huf: 5000, name: 'Kristályláda', img: 'gem', popular: true },
        { key: 'p1000', credits: 1000, huf: 10000, name: 'Kristálykincs', img: 'gem' }
    ];

    const RARITY = {
        common:    { name: 'Gyakori',    color: '#b9b29c', weight: 60, dupRefund: 10 },
        rare:      { name: 'Ritka',      color: '#5aa0e0', weight: 28, dupRefund: 25 },
        epic:      { name: 'Epikus',     color: '#b06ad8', weight: 10, dupRefund: 60 },
        legendary: { name: 'Legendás',   color: '#e8b84a', weight: 2,  dupRefund: 150 }
    };

    // Kinézet: keret (avatar és térképjelölő körül) és cím (a név alatt a térképen). A többiek is látják.
    // price: null -> csak ládából szerezhető
    const COSMETICS = [
        { key: 'frame_rust',   kind: 'frame', name: 'Rozsdás keret',      rarity: 'common',    price: 80,  color: '#a4592f', desc: 'Kopott, rozsdás vaskeret.' },
        { key: 'frame_camo',   kind: 'frame', name: 'Terepmintás keret',  rarity: 'common',    price: 80,  color: '#6b7a3a', style: 'camo', desc: 'Katonai terepminta.' },
        { key: 'frame_bone',   kind: 'frame', name: 'Csontfehér keret',   rarity: 'rare',      price: 150, color: '#e6dcc2', desc: 'Kifehéredett csont színe.' },
        { key: 'frame_toxic',  kind: 'frame', name: 'Mérgező keret',      rarity: 'rare',      price: 150, color: '#9be33a', glow: true, desc: 'Halványan dereng, mint a vegyszeres hordó.' },
        { key: 'frame_ice',    kind: 'frame', name: 'Fagyott keret',      rarity: 'rare',      price: null, color: '#9fd8f0', glow: true, desc: 'Dér lepi. Csak ládából.' },
        { key: 'frame_blood',  kind: 'frame', name: 'Vérvörös keret',     rarity: 'epic',      price: 300, color: '#c0241c', glow: true, desc: 'Aki túlélte, tudja, mibe került.' },
        { key: 'frame_rad',    kind: 'frame', name: 'Sugárzó keret',      rarity: 'epic',      price: null, color: '#d6f24a', glow: true, pulse: true, desc: 'Lüktet, mint a Geiger-számláló. Csak ládából.' },
        { key: 'frame_gold',   kind: 'frame', name: 'Aranyozott keret',   rarity: 'legendary', price: null, color: '#f0c24a', glow: true, pulse: true, desc: 'A Zóna legritkább kerete. Csak ládából.' },
        { key: 'title_scav',   kind: 'title', name: 'Guberáló',           rarity: 'common',    price: 60,  color: '#c9c1a8', desc: 'Cím a neved alatt.' },
        { key: 'title_wander', kind: 'title', name: 'Vándor',             rarity: 'common',    price: 60,  color: '#c9c1a8', desc: 'Cím a neved alatt.' },
        { key: 'title_medic',  kind: 'title', name: 'Tábori felcser',     rarity: 'rare',      price: 120, color: '#7fc9a0', desc: 'Cím a neved alatt.' },
        { key: 'title_hunter', kind: 'title', name: 'Mutánsvadász',       rarity: 'rare',      price: null, color: '#d98a5a', desc: 'Cím a neved alatt. Csak ládából.' },
        { key: 'title_ghost',  kind: 'title', name: 'Szellem',            rarity: 'epic',      price: null, color: '#b7c4d8', desc: 'Cím a neved alatt. Csak ládából.' },
        { key: 'title_legend', kind: 'title', name: 'A Zóna legendája',   rarity: 'legendary', price: null, color: '#f0c24a', desc: 'Cím a neved alatt. Csak ládából.' },
        // eseménykinézetek (event): nem vehetők meg és ládából sem jönnek
        { key: 'title_santa26',  kind: 'title', name: 'Mikulás 2026',        rarity: 'epic',      price: null, event: true, color: '#e8645a', desc: 'Csak a 2026-os adventi naptár 6. ablakából.' },
        { key: 'frame_blizzard26', kind: 'frame', name: 'Hóvihar keret',      rarity: 'rare',      price: null, event: true, color: '#7fc4f0', glow: true, desc: 'Csak a 2026-os téli szerencsekerékről.' },
        { key: 'title_elf26',      kind: 'title', name: 'Télapó segédje',     rarity: 'epic',      price: null, event: true, color: '#e8645a', desc: 'Csak a 2026-os téli szerencsekerékről.' },
        { key: 'frame_iceheart26', kind: 'frame', name: 'Jégszív keret',      rarity: 'legendary', price: null, event: true, color: '#dff4ff', glow: true, pulse: true, desc: 'Csak a 2026-os téli szerencsekerékről.' },
        { key: 'frame_frost26',  kind: 'frame', name: 'Fagyos Csend 2026',   rarity: 'legendary', price: null, event: true, color: '#bfe8ff', glow: true, pulse: true, desc: 'Csak a 2026-os adventi naptár 24. ablakából. Soha többé nem szerezhető meg.' },
        // Rozsdás szett (v0.1.20): a havi ranglista-szezon jutalma, 2027 januárjától. Nem kerül ládába.
        { key: 'frame_rust_s1',  kind: 'frame', name: 'Rozsdás Bajnok keret', rarity: 'legendary', price: null, event: true, season: true, color: '#c0622a', glow: true, desc: 'Szezonjutalom: a havi ranglista első 10 helyezettje kapja.' },
        { key: 'title_rust_s1',  kind: 'title', name: 'Rozsdás Bajnok',       rarity: 'legendary', price: null, event: true, season: true, color: '#d9733a', desc: 'Szezonjutalom: a havi ranglista első 3 helyezettje kapja.' },
        { key: 'title_rust_vet', kind: 'title', name: 'Rozsdás Veterán',      rarity: 'epic',      price: null, event: true, season: true, color: '#b86a3c', desc: 'Szezonjutalom: a havi ranglista 4–10. helyezettje kapja.' },
        // Közösség (v0.1.21): toborzásért járó címek
        { key: 'title_recruiter', kind: 'title', name: 'Toborzó',          rarity: 'rare',      price: null, event: true, color: '#8fc06a', desc: 'Az első barátod, akit meghívtál, elérte az 5. szintet.' },
        { key: 'title_squad',     kind: 'title', name: 'Csapatvezér',      rarity: 'epic',      price: null, event: true, color: '#e0b04a', desc: 'Öt meghívott barátod érte el az 5. szintet.' },
        { key: 'title_rust_s',   kind: 'title', name: 'Rozsdás Túlélő',       rarity: 'rare',      price: null, event: true, season: true, color: '#a4592f', desc: 'Szezonjutalom: a havi ranglista 11–50. helyezettje kapja.' }
    ];

    // Kényelem: nem ad harci előnyt
    const COMFORT = [
        { key: 'slots_2', name: '+2 hátizsák hely', img: 'cache', price: 200, max: 3, desc: 'Végleges +2 hely a hátizsákodban (legfeljebb 3-szor, +6). Halál után is megmarad.' },
        { key: 'rename',  name: 'Névváltoztatás',   img: 'keyring', price: 300, desc: 'Új felhasználónevet választhatsz. Utána az új névvel lépsz be.' }
    ];

    // Ládák tartalom szerint. cat: mi van benne (a boltban ez látszik a láda neve alatt).
    // pool: csak ilyen fajta kinézet kerül bele (kind), ha nincs megadva, vegyes.
    // A boltban vett láda azonnal kinyílik (az ár a nyitást is tartalmazza).
    // A Kis ládát az épületekben is megtalálhatod (lootChance) – ezt kulccsal nyitod.
    // weights: ritkaságonkénti súly (gyakori, ritka, epikus, legendás) – az esélyek nyilvánosak.
    // Később: Fagyos láda (téli festések), Fegyverfestő láda (fegyver festések) – ugyanígy, saját pool-lal.
    const CRATES = [
        { key: 'crate_small',    name: 'Kis láda',      cat: 'Vegyes',          img: 'crate_small',    color: '#b8743a', price: 100, keyItem: 'key_basic', lootChance: 0.015,
          weights: { common: 70, rare: 24, epic: 5, legendary: 1 }, desc: 'Rozsdás kis vasláda, vegyesen keret vagy cím. Az épületekben is találhatsz ilyet – kulccsal nyílik.' },
        { key: 'crate_military', name: 'Címes láda',    cat: 'Csak címek',      img: 'crate_military', color: '#7f9a3e', price: 200, pool: 'title',
          weights: { common: 50, rare: 34, epic: 13, legendary: 3 }, desc: 'Lőszeres láda a kordon mögül. Csak címek: a neved alatt látszanak a térképen.' },
        { key: 'crate_iron',     name: 'Keretes láda',  cat: 'Csak keretek',    img: 'crate_iron',     color: '#5aa0e0', price: 350, popular: true, pool: 'frame',
          weights: { common: 30, rare: 42, epic: 22, legendary: 6 }, desc: 'Vasveretes tölgyláda. Csak keretek az avatarod és a jelölőd köré.' },
        { key: 'crate_carved',   name: 'Kincsesláda',   cat: 'Vegyes, legalább ritka', img: 'crate_carved', color: '#e8b84a', price: 700,
          weights: { common: 0, rare: 50, epic: 38, legendary: 12 }, desc: 'Faragott kincsesláda, vegyesen keret vagy cím: biztosan legalább ritka tárgy van benne.' }
    ];
    const KEYS = [
        { key: 'key_basic', name: 'Láda kulcs', img: 'key', price: 100, desc: 'A talált Kis láda kinyitásához.' }
    ];
    // Festékek (Fagyos Csend, v0.1.19): a fiókhoz tartoznak (halálkor nem vesznek el), a skinrendszerrel egy tárgyra festhetők
    const PAINTS = [
        { key: 'paint_rust_weapon', name: 'Rozsdás festék – fegyver', paint: true, slotKind: 'weapon', rarity: 'legendary', img: 'key', desc: 'Szezonjutalom (a havi ranglista első 3 helyezettje): rozsdás, kopott vas festés egy fegyveredre.' },
        { key: 'paint_frost_weapon', name: 'Fagyos festék – fegyver', paint: true, slotKind: 'weapon', rarity: 'legendary', img: 'key', desc: 'Jégkék, deres festés egy fegyveredre. A skinrendszerrel festheted rá (december közepétől).' },
        { key: 'paint_frost_jacket', name: 'Fagyos festék – kabát',   paint: true, slotKind: 'torso',  rarity: 'legendary', img: 'key', desc: 'Jégkék, deres festés egy kabátodra. A skinrendszerrel festheted rá (december közepétől).' }
    ];
    const CRATE_ALIASES = { crate_basic: 'crate_small' }; // régi név

    const BY_KEY = {};
    [...COSMETICS, ...COMFORT, ...CRATES, ...KEYS, ...PAINTS].forEach(x => { BY_KEY[x.key] = x; });

    const huf = (credits) => Math.round(credits * CREDIT_HUF);
    const fmtHuf = (n) => n.toLocaleString('hu-HU') + ' Ft';

    // Egy láda pontos esélyei: ritkaság szerinti súly, azon belül egyenlő esély
    function crateOdds(crateKey) {
        const crate = CRATES.find(c => c.key === (CRATE_ALIASES[crateKey] || crateKey)) || CRATES[0];
        const w = crate.weights;
        const pool = COSMETICS.filter(c => !c.event && (!crate.pool || c.kind === crate.pool));
        // csak azok a ritkaságok számítanak, amelyekből van tárgy a ládában
        const total = Object.keys(RARITY).reduce((a, r) => a + (pool.some(c => c.rarity === r) ? (w[r] || 0) : 0), 0);
        return pool.map(c => {
            const same = pool.filter(x => x.rarity === c.rarity).length;
            return { key: c.key, name: c.name, kind: c.kind, rarity: c.rarity, chance: (w[c.rarity] || 0) / total / same };
        }).filter(o => o.chance > 0);
    }
    function rarityChances(crateKey) {
        const odds = crateOdds(crateKey), out = {};
        odds.forEach(o => { out[o.rarity] = (out[o.rarity] || 0) + o.chance; });
        return out;
    }
    function rollCrate(crateKey, random) {
        if (typeof crateKey === 'function') { random = crateKey; crateKey = CRATES[0].key; }
        const odds = crateOdds(crateKey);
        let r = (random || Math.random)();
        for (const o of odds) { if (r < o.chance) return o.key; r -= o.chance; }
        return odds[odds.length - 1].key;
    }

    const api = { CREDIT_HUF, PACKAGES, RARITY, COSMETICS, COMFORT, CRATES, KEYS, PAINTS, CRATE_ALIASES, BY_KEY, huf, fmtHuf, crateOdds, rarityChances, rollCrate };
    root.SurvivalShop = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
