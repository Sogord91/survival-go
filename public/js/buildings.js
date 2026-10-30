// buildings.js
// KÖZÖS épület-adatok a kliensnek és a szervernek (mint az items.js és a stats.js).
// - BUILDING_TYPES: megjelenés (ikon, szín) és játékmenet (mi található benne, mennyire üres, mennyire veszélyes)
// - classifyBuilding(tags): OSM címkékből épülettípus. A SZERVER is ezt futtatja a saját OSM-lekérdezésén,
//   így a kliens nem tudja egy kisboltra ráfogni, hogy katonai bázis.
(function (root) {
    // groups:    loot-csoportok; az items.js "loot" mezője ezekre hivatkozik (pl. loot: { grocery: 10, household: 2 })
    // empty:     esély, hogy az épület üres
    // encounter: esély, hogy ellenséggel találkozol bent
    const BUILDING_TYPES = {
        'Élelmiszerbolt':                                { icon: '🛒', color: '#10b981', groups: ['grocery', 'drinks'], empty: 0.30, encounter: 0.05 },
        'Kisbolt / Trafik':                              { icon: '🏪', color: '#14b8a6', groups: ['grocery', 'drinks', 'smallgoods'], empty: 0.30, encounter: 0.05 },
        'Barkácsáruház':                                 { icon: '🛠️', color: '#d97706', groups: ['hardware', 'tools'], empty: 0.30, encounter: 0.05 },
        'Étterem / Kávézó / Fagyizó / Csárda':           { icon: '☕', color: '#ec4899', groups: ['kitchen', 'drinks'], empty: 0.30, encounter: 0.05 },
        'Benzinkút / Kút':                               { icon: '⛽', color: '#dc2626', groups: ['drinks', 'smallgoods', 'auto'], empty: 0.30, encounter: 0.05 },
        'Kocsma / Pub / Söröző':                         { icon: '🍺', color: '#f97316', groups: ['drinks', 'kitchen'], empty: 0.30, encounter: 0.05 },
        'Gyógyszertár':                                  { icon: '💊', color: '#ef4444', groups: ['medical'], empty: 0.30, encounter: 0.05 },
        'Kórház':                                        { icon: '🏥', color: '#dc2626', groups: ['medical', 'hospital'], empty: 0.40, encounter: 0.10 },
        'Rendőrség':                                     { icon: '🛡️', color: '#3b82f6', groups: ['police', 'office'], empty: 0.40, encounter: 0.10 },
        'Tűzoltóság':                                    { icon: '🚒', color: '#f97316', groups: ['fire', 'tools'], empty: 0.40, encounter: 0.05 },
        'Katonai bázis':                                 { icon: '⭐', color: '#b91c1c', groups: ['military'], empty: 0.40, encounter: 0.20 },
        'Kormányzati Bunker / Óvóhely':                  { icon: '☢️', color: '#7f1d1d', groups: ['military', 'hazmat', 'grocery'], empty: 0.40, encounter: 0.20 },
        'Elhagyatott Katonai Ellenőrzőpont / Blokád':    { icon: '🚧', color: '#b45309', groups: ['military'], empty: 0.45, encounter: 0.15 },
        'Katasztrófavédelmi / Vegyvédelmi Központ':      { icon: '☣️', color: '#047857', groups: ['hazmat', 'medical'], empty: 0.40, encounter: 0.15 },
        'Iskola / Óvoda':                                { icon: '🏫', color: '#0ea5e9', groups: ['office', 'household'], empty: 0.40, encounter: 0.05 },
        'Könyvtár':                                      { icon: '📚', color: '#8b5cf6', groups: ['office', 'culture'], empty: 0.45, encounter: 0.05 },
        'Templom / Kápolna':                             { icon: '⛪', color: '#eab308', groups: ['culture', 'valuables'], empty: 0.45, encounter: 0.02 },
        'Kolostor / Apátság':                            { icon: '⛪', color: '#ca8a04', groups: ['culture', 'kitchen', 'valuables'], empty: 0.45, encounter: 0.02 },
        'Városháza / Polgármesteri Hivatal':             { icon: '🏛️', color: '#6366f1', groups: ['office', 'valuables'], empty: 0.40, encounter: 0.05 },
        'Múzeum / Kiállítóterem':                        { icon: '🏛️', color: '#a855f7', groups: ['culture', 'valuables'], empty: 0.45, encounter: 0.05 },
        'Bíróság / Ügyvédi Iroda':                       { icon: '⚖️', color: '#4f46e5', groups: ['office', 'valuables'], empty: 0.45, encounter: 0.05 },
        'Mozi / Színház / Művelődési Ház':               { icon: '🎭', color: '#db2777', groups: ['culture', 'smallgoods'], empty: 0.45, encounter: 0.05 },
        'Elhagyatott raktár':                            { icon: '🏭', color: '#f59e0b', groups: ['warehouse', 'hardware'], empty: 0.40, encounter: 0.05 },
        'Ipari létesítmény / Gyár':                      { icon: '⚙️', color: '#7c2d12', groups: ['industrial', 'hardware'], empty: 0.40, encounter: 0.05 },
        'Autószerviz / Gumis':                           { icon: '🔧', color: '#b45309', groups: ['auto', 'tools'], empty: 0.30, encounter: 0.05 },
        'Autóbontó / Roncstelep':                        { icon: '🚗', color: '#78716c', groups: ['auto', 'scrap'], empty: 0.40, encounter: 0.05 },
        'Garázs':                                        { icon: '🚗', color: '#78716c', groups: ['auto', 'household', 'tools'], empty: 0.45, encounter: 0.05 },
        'Vasútállomás / Rendezőpályaudvar':              { icon: '🚂', color: '#374151', groups: ['industrial', 'smallgoods'], empty: 0.45, encounter: 0.05 },
        'Posta / Csomagátvevő pont':                     { icon: '📦', color: '#d97706', groups: ['office', 'smallgoods', 'warehouse'], empty: 0.40, encounter: 0.05 },
        'Mezőgazdasági Géptelep / Téesz':                { icon: '🚜', color: '#65a30d', groups: ['farm', 'tools', 'auto'], empty: 0.40, encounter: 0.05 },
        'Malom / Gabonasiló':                            { icon: '🌾', color: '#ca8a04', groups: ['farm'], empty: 0.45, encounter: 0.05 },
        'Állatfarm / Lovarda':                           { icon: '🐎', color: '#854d0e', groups: ['farm', 'kitchen'], empty: 0.45, encounter: 0.05 },
        'Víztorony / Vízmű':                             { icon: '💧', color: '#0284c7', groups: ['utility', 'drinks'], empty: 0.45, encounter: 0.05 },
        'Elektromos Alállomás / Trafóház':               { icon: '⚡', color: '#eab308', groups: ['utility', 'industrial'], empty: 0.45, encounter: 0.05 },
        'Romos ház':                                     { icon: '🏠', color: '#6b7280', groups: ['household'], empty: 0.50, encounter: 0.05 },
        'Szálloda / Hotel / Panzió':                     { icon: '🏨', color: '#9333ea', groups: ['household', 'kitchen', 'valuables'], empty: 0.40, encounter: 0.05 },
        'Motel / Kamionos pihenő':                       { icon: '🏨', color: '#793e75', groups: ['household', 'drinks', 'smallgoods'], empty: 0.40, encounter: 0.05 },
        'Sportcsarnok / Edzőterem':                      { icon: '🏋️', color: '#2563eb', groups: ['sport', 'drinks'], empty: 0.40, encounter: 0.05 },
        'Stadion / Futballpálya':                        { icon: '⚽', color: '#16a34a', groups: ['sport'], empty: 0.45, encounter: 0.05 },
        'Strand / Uszoda':                               { icon: '🏊', color: '#06b6d4', groups: ['sport', 'drinks'], empty: 0.45, encounter: 0.05 },
        'Temető':                                        { icon: '⚰️', color: '#3f3f46', groups: ['cemetery', 'valuables'], empty: 0.50, encounter: 0.05 }
    };

    const DEFAULT_TYPE = 'Romos ház';

    // Darabszám: 1 tárgy 60%, 2 tárgy 30%, 3 tárgy 10% (ha nem üres)
    const LOOT_COUNT_WEIGHTS = [[1, 60], [2, 30], [3, 10]];

    // Egyértelmű OSM azonosító: a node és a way azonosítók átfedhetnek, ezért a típus is benne van.
    function buildingId(element) {
        const prefix = element.type === 'way' ? 'w' : 'n';
        return `osm_${prefix}${element.id}`;
    }

    const ID_PATTERN = /^osm_([nw])(\d{1,15})$/;
    function parseBuildingId(id) {
        const m = typeof id === 'string' ? ID_PATTERN.exec(id) : null;
        return m ? { osmType: m[1] === 'w' ? 'way' : 'node', osmId: m[2] } : null;
    }

    // OSM címkék -> épülettípus (a régi map.js szabályai, változatlan sorrendben)
    function classifyBuilding(tags) {
        tags = tags || {};
        if (tags.shop === 'supermarket' || tags.shop === 'grocery') return 'Élelmiszerbolt';
        if (tags.shop === 'convenience' || tags.shop === 'kiosk' || tags.shop === 'general') return 'Kisbolt / Trafik';
        if (tags.shop === 'hardware' || tags.shop === 'doityourself' || tags.shop === 'houseware') return 'Barkácsáruház';
        if (tags.shop === 'car_repair' || tags.shop === 'tyres' || tags.shop === 'car_parts') return 'Autószerviz / Gumis';
        if (tags.shop === 'agrarian' || tags.shop === 'farm') return 'Mezőgazdasági Géptelep / Téesz';
        if (tags.shop === 'post' || tags.amenity === 'post_office') return 'Posta / Csomagátvevő pont';
        if (['restaurant', 'cafe', 'ice_cream', 'fast_food'].includes(tags.amenity)) return 'Étterem / Kávézó / Fagyizó / Csárda';
        if (['pub', 'bar', 'nightclub'].includes(tags.amenity)) return 'Kocsma / Pub / Söröző';
        if (tags.tourism === 'museum') return 'Múzeum / Kiállítóterem';
        if (['cinema', 'theatre', 'arts_centre', 'community_centre'].includes(tags.amenity)) return 'Mozi / Színház / Művelődési Ház';
        if (tags.amenity === 'pharmacy') return 'Gyógyszertár';
        if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'Kórház';
        if (tags.amenity === 'police') return 'Rendőrség';
        if (tags.amenity === 'fire_station') return 'Tűzoltóság';
        if (tags.military === 'bunker' || tags.bunker === 'yes') return 'Kormányzati Bunker / Óvóhely';
        if (tags.military === 'checkpoint' || tags.barrier === 'blockade') return 'Elhagyatott Katonai Ellenőrzőpont / Blokád';
        if (tags.military === 'danger_area' || tags.amenity === 'cbrn') return 'Katasztrófavédelmi / Vegyvédelmi Központ';
        if (tags.military) return 'Katonai bázis';
        if (['school', 'kindergarten', 'university', 'college'].includes(tags.amenity)) return 'Iskola / Óvoda';
        if (tags.amenity === 'library') return 'Könyvtár';
        if (tags.amenity === 'place_of_worship') {
            return (tags.religion === 'christian' && (tags.building === 'monastery' || tags.building === 'abbey'))
                ? 'Kolostor / Apátság' : 'Templom / Kápolna';
        }
        if (tags.amenity === 'townhall' || tags.amenity === 'public_building') return 'Városháza / Polgármesteri Hivatal';
        if (tags.amenity === 'court') return 'Bíróság / Ügyvédi Iroda';
        if (tags.building === 'warehouse' || tags.building === 'industrial') return 'Elhagyatott raktár';
        if (tags.industrial || tags.building === 'factory') return 'Ipari létesítmény / Gyár';
        if (tags.amenity === 'fuel') return 'Benzinkút / Kút';
        if (tags.building === 'garages' || tags.amenity === 'parking') return 'Garázs';
        if (tags.landuse === 'garages') return 'Autóbontó / Roncstelep';
        if (tags.railway === 'station' || tags.building === 'train_station') return 'Vasútállomás / Rendezőpályaudvar';
        if (tags.man_made === 'water_tower' || tags.utility === 'water') return 'Víztorony / Vízmű';
        if (tags.power === 'substation' || tags.building === 'transformer_tower') return 'Elektromos Alállomás / Trafóház';
        if (tags.building === 'windmill' || tags.man_made === 'windmill' || tags.building === 'silo') return 'Malom / Gabonasiló';
        if (['hotel', 'hostel', 'guest_house'].includes(tags.tourism)) return 'Szálloda / Hotel / Panzió';
        if (tags.tourism === 'motel') return 'Motel / Kamionos pihenő';
        if (tags.leisure === 'sports_centre' || tags.amenity === 'gym') return 'Sportcsarnok / Edzőterem';
        if (tags.leisure === 'stadium' || tags.pitch) return 'Stadion / Futballpálya';
        if (tags.leisure === 'water_park' || tags.amenity === 'swimming_pool') return 'Strand / Uszoda';
        if (tags.amenity === 'grave_yard' || tags.landuse === 'cemetery') return 'Temető';
        if (tags.landuse === 'farm' || tags.amenity === 'animal_shelter') return 'Állatfarm / Lovarda';
        return DEFAULT_TYPE;
    }

    // Megjelenő név: típus + (OSM név, ha van)
    function displayName(type, tags) {
        return tags && typeof tags.name === 'string' && tags.name ? `${type} (${tags.name})` : type;
    }

    // --- TÁVOLSÁG ---
    function haversine(aLat, aLng, bLat, bLng) {
        const R = 6371000;
        const rad = d => d * Math.PI / 180;
        const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
    }

    const MAX_BOUNDS_DIAGONAL_METERS = 10000; // ennél nagyobb (gyanús) területnél csak a középpont számít (egy nagy repülőtér is belefér)

    // Az OSM "bounds" (befoglaló téglalap) ellenőrzése és egységes formára hozása
    function cleanBounds(b) {
        if (!b || ![b.minlat, b.minlon, b.maxlat, b.maxlon].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
        if (b.minlat > b.maxlat || b.minlon > b.maxlon) return null;
        if (haversine(b.minlat, b.minlon, b.maxlat, b.maxlon) > MAX_BOUNDS_DIAGONAL_METERS) return null;
        return { minlat: b.minlat, minlon: b.minlon, maxlat: b.maxlat, maxlon: b.maxlon };
    }

    // Távolság az épülettől: nagy létesítménynél (repülőtér, gyár) a SZÉLÉTŐL, egyébként a középpontjától.
    // Ha a játékos a területen belül van, 0.
    function distanceToBuilding(point, building) {
        const b = building && cleanBounds(building.bounds);
        if (b) {
            const lat = Math.min(b.maxlat, Math.max(b.minlat, point.lat));
            const lng = Math.min(b.maxlon, Math.max(b.minlon, point.lng));
            return haversine(point.lat, point.lng, lat, lng);
        }
        return haversine(point.lat, point.lng, building.lat, building.lng);
    }

    function typeInfo(type) {
        return BUILDING_TYPES[type] || BUILDING_TYPES[DEFAULT_TYPE];
    }

    // Súlyozott sorsolás: [[érték, súly], ...]
    function weightedPick(entries, random) {
        const total = entries.reduce((sum, e) => sum + e[1], 0);
        if (total <= 0) return null;
        let r = random() * total;
        for (const [value, weight] of entries) {
            r -= weight;
            if (r < 0) return value;
        }
        return entries[entries.length - 1][0];
    }

    // Egy épülettípus loot-táblája az items.js "loot" mezőiből: [[tárgykulcs, súly], ...]
    function lootTable(type, itemDatabase) {
        const groups = typeInfo(type).groups;
        const table = [];
        for (const key in itemDatabase) {
            const loot = itemDatabase[key].loot;
            if (!loot) continue;
            const weight = groups.reduce((sum, g) => sum + (Number(loot[g]) || 0), 0);
            if (weight > 0) table.push([key, weight]);
        }
        return table;
    }

    // Az épület átkutatásának eredménye: [{ key, count }, ...] (üres, ha nem találtál semmit).
    // A darabszám a tárgy "lootCount" mezőjéből jön (pl. lőszer 5-15), alapból 1.
    // opts.emptyFactor: az üres esély szorzója (pl. 0.5 győzelem után)
    function rollLoot(type, itemDatabase, random, opts) {
        random = random || Math.random;
        const info = typeInfo(type);
        const table = lootTable(type, itemDatabase);
        const emptyFactor = opts && typeof opts.emptyFactor === 'number' ? opts.emptyFactor : 1;
        if (table.length === 0 || random() < info.empty * emptyFactor) return [];
        const picks = weightedPick(LOOT_COUNT_WEIGHTS, random);
        const found = [];
        for (let i = 0; i < picks; i++) {
            const key = weightedPick(table, random);
            const range = itemDatabase[key].lootCount;
            const count = Array.isArray(range)
                ? range[0] + Math.floor(random() * (range[1] - range[0] + 1))
                : 1;
            found.push({ key, count });
        }
        return found;
    }

    const api = {
        BUILDING_TYPES, DEFAULT_TYPE, LOOT_COUNT_WEIGHTS,
        buildingId, parseBuildingId, classifyBuilding, displayName, typeInfo, haversine, cleanBounds, distanceToBuilding,
        weightedPick, lootTable, rollLoot
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api; // szerver (Node.js)
    if (typeof window !== 'undefined') window.SurvivalBuildings = api;         // böngésző
})(this);
