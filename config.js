// config.js
const crypto = require('crypto');

// A belépési tokenek aláíró kulcsa. ÉLESBEN KÖTELEZŐ környezeti változóként megadni (pl. Render: Environment),
// különben a szerver (NODE_ENV=production esetén) nem indul el. Fejlesztéskor ideiglenes kulcs készül.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('A JWT_SECRET környezeti változó megadása kötelező production módban!');
    }
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ JWT_SECRET nincs beállítva: ideiglenes kulcs készült, újraindításkor minden belépési token érvénytelen lesz.');
} else if (jwtSecret.length < 32) {
    console.warn('⚠️ A JWT_SECRET túl rövid, használj legalább 32 karaktert!');
}

module.exports = {
    PORT: process.env.PORT || 3000,
    MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/survival_go",
    JWT_SECRET: jwtSecret,
    TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60, // a belépési token 7 napig érvényes

    // --- TÚLÉLÉS (csak online fogy; az idők ONLINE játékidőben értendők) ---
    HUNGER_FULL_MINUTES: 180,       // teli éhség-sáv kb. 3 óra alatt fogy el
    THIRST_FULL_MINUTES: 120,       // teli szomjúság-sáv kb. 2 óra alatt fogy el
    STARVE_ONE_MINUTES: 40,         // ha az egyik sáv 0: ennyi perc alatt fogy el a teljes max HP
    STARVE_BOTH_MINUTES: 20,        // ha mindkét sáv 0: ennyi perc alatt
    REGEN_ABOVE_PERCENT: 80,        // természetes HP-visszatöltődés, ha az éhség ÉS a szomjúság e fölött van
    REGEN_FULL_MINUTES: 180,        // ennyi idő alatt töltődik vissza 0-ról a teljes max HP
    WARN_BELOW_PERCENT: 20,         // ez alatt egyszer figyelmeztet a játék
    STARTER_KIT: [                  // az új túlélő kezdőcsomagja (regisztráció és halál utáni újrakezdés)
        { key: 'knife', count: 1 },
        { key: 'bandage', count: 1 },
        { key: 'water_bottle', count: 1 },
        { key: 'canned_food', count: 1 }
    ],

    // --- KORAI TÚLÉLŐ (a megjelenés előtt regisztrálók jutalma) ---
    // Amíg a Renderen az EARLY_SURVIVOR környezeti változó értéke "on", minden új regisztráló
    // végleges "Korai túlélő" jelvényt és egyszeri, bővebb kezdőcsomagot kap. Lezárás: a változó törlése.
    EARLY_SURVIVOR_OPEN: process.env.EARLY_SURVIVOR === 'on',
    EARLY_SURVIVOR_KIT: [               // csak az ELSŐ indulásnál (halál után a sima kezdőcsomag jár)
        { key: 'knife', count: 1 },
        { key: 'bandage', count: 2 },
        { key: 'water_bottle', count: 2 },
        { key: 'canned_food', count: 2 },
        { key: 'flashlight', count: 1 },
        { key: 'aa_batteries', count: 1 }
    ],
    EARLY_SURVIVOR_BACKPACK: 'field_satchel', // rögtön felszerelve

    // --- FÁRADTSÁG (0 = kipihent, 100 = teljesen kimerült, nem lehet lootolni) ---
    FATIGUE_PER_METER: 0.01,        // séta: 100% / 10 km
    FATIGUE_LOOT: 2,                // épület átkutatása
    FATIGUE_COMBAT: 5,              // harc (győzelem vagy menekülés)
    FATIGUE_FULL_REST_MINUTES: 90,  // ennyi idő alatt pihen ki 100%-ról 0-ra (offline vagy egy helyben állva)
    REST_IDLE_MINUTES: 5,           // ennyi mozdulatlanság után kezd pihenni online is

    // --- LOOT ÉS ÉPÜLETEK ---
    LOOT_LOCK_HOURS: 4,                 // kifosztás után ennyi óráig senki nem fosztogathatja (globális zár)
    LOOT_RANGE_METERS: 30,              // ennyire kell megközelíteni az épületet
    LOOT_RANGE_TOLERANCE_METERS: 15,    // + GPS-pontatlanság tűrése (a szerver 45 m-ig fogadja el)
    POSITION_MAX_AGE_SECONDS: 120,      // ennél régebbi GPS pozícióval nem lehet lootolni
    LOOT_COOLDOWN_MS: 1500,             // két lootolási kérés között legalább ennyi idő (az OSM-lekérdezések védelme)
    OVERPASS_URLS: [                    // OSM (Overpass) szerverek sorrendben; ha az egyik nem válaszol időben, jön a következő
        'https://overpass.private.coffee/api/interpreter',          // korábban overpass.kumi.systems, nincs kérés-korlát
        'https://overpass-api.de/api/interpreter',                   // a hivatalos (gyakran túlterhelt)
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'    // tartalék
    ],
    OVERPASS_TIMEOUT_MS: 12000,         // ennyi ideig várunk egy Overpass szerverre, utána a következő jön

    // --- ÉPÜLETEK BETÖLTÉSE (térképrács, lásd buildings.js) ---
    AREA_OVERPASS_TIMEOUT_MS: 25000,    // egy környék (max. 9 cella) lekérdezése tovább tarthat, mint egy épületé
    AREA_CELL_TTL_DAYS: 7,              // ennyi ideig használjuk a tárolt cellát, utána újra lekérdezzük az OSM-ből
    AREA_MAX_CELLS_PER_REQUEST: 25,     // egy kérésben legfeljebb ennyi cella
    AREA_MAX_DISTANCE_METERS: 1500,     // csak a játékos közelében lévő cellákat adjuk ki (ne lehessen az egész országot letölteni)
    AREA_MAX_CELLS_PER_10S: 60,         // kéréskorlát játékosonként

    // --- HARC (a részletes harcszabályok a combat-engine.js-ben) ---
    FLEE_LOCK_MINUTES: 10,              // menekülés után ennyi percig NEKED zárva az épület (másoknak nem)
    COMBAT_WIN_EMPTY_FACTOR: 0.5,       // győzelem után feleakkora eséllyel üres az épület

    // --- FIÓKOK ---
    USERNAME_MIN: 3,
    USERNAME_MAX: 16,                   // csak betűk (ékezetesek is) és számok
    PASSWORD_MIN: 4,
    PASSWORD_MAX: 64,
    LOGIN_MAX_FAILS: 10,                // ennyi sikertelen belépés után...
    LOGIN_WINDOW_MINUTES: 15,           // ...ennyi ideig nem lehet próbálkozni (IP-címenként)

    // --- TÖBBI JÁTÉKOS ---
    PLAYER_VIEW_METERS: 150,            // ennyire látod a többi játékost
    PLAYER_VIEW_NIGHT_METERS: 30,       // éjszaka, működő fényforrás nélkül
    AVATARS: ['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png'], // csak ezek választhatók (a public/images/avatars mappából)

    // --- MOZGÁS (GPS) ---
    MOVE_JITTER_METERS: 30,         // ennél kisebb elmozdulást GPS-szórásnak veszünk (nem mozgás)
    MOVE_MAX_ACCURACY_METERS: 60,   // ennél pontatlanabb GPS jelet nem számolunk mozgásnak
    MOVE_MAX_SPEED_KMH: 15,         // ennél gyorsabb mozgás (autó, busz) nem ad XP-t és nem fáraszt
    JUMP_MIN_METERS: 300,           // GPS-ugrás: legalább ekkora elmozdulás két jelentés között...
    JUMP_MIN_SPEED_KMH: 180,        // ...ennél nagyobb sebességgel (pl. GPS-hamisítás, rossz jel)
    JUMP_LOOT_BLOCK_SECONDS: 120,   // ugrás után ennyi ideig nem lehet lootolni
    MOVE_XP_METERS: 100             // ennyi megtett méterenként jár +1 XP
};
