// map.js
let map = null;
let playerMarker = null;
let isMapInitialized = false;
let lastFetchLat = null;
let lastFetchLng = null;
let savedBuildings = [];   // a környék épületei (OSM), csak a böngészőben élnek
let buildingLocks = {};    // épület-azonosító -> zár lejárata (a szervertől); a később betöltött épületekre is ráhúzzuk
let buildings = [];

// Egy épület zárolásának rögzítése. Ha az épület még nincs betöltve, csak megjegyezzük,
// és amikor az OSM-ből megérkezik, zároltként jelenik meg (így nem keletkezik név nélküli "csonk" bejegyzés).
// A zár lejárta után az épület magától újra lootolható lesz.
function applyBuildingLock(id, lockedUntil) {
    if (typeof id !== 'string') return;
    buildingLocks[id] = lockedUntil || null;
    const target = savedBuildings.find(sb => sb.id === id);
    if (target) target.lockedUntil = lockedUntil || null;
}

// A betöltött épületek zárállapotának lekérése a szervertől (kötegekben)
function requestBuildingStatus(ids) {
    if (typeof socket === 'undefined' || !socket || !socket.connected) return;
    for (let i = 0; i < ids.length; i += 500) {
        socket.emit('building_status', { ids: ids.slice(i, i + 500) });
    }
}

if (typeof socket !== 'undefined' && socket) {
    socket.on('building_status', (data) => {
        if (!data || !data.locks) return;
        Object.keys(data.locks).forEach(id => applyBuildingLock(id, data.locks[id]));
        refreshMapMarkers();
    });

    // (Újra)csatlakozáskor a már betöltött épületek zárállapotát is lekérjük
    socket.on('connect', () => requestBuildingStatus(savedBuildings.map(b => b.id)));
}

let otherPlayerMarkers = {};
let hasFetchedRealGPS = false;


// --- TÉRKÉPSTÍLUS ---
// A CSS szűrő csak a térképcsempékre kerül (.zone-tiles), ezért az épületek és a játékosok jelölői
// megtartják a saját színüket. A választás a Menüben állítható, és a böngésző megjegyzi.
const MAP_STYLES = {
    military: { label: 'Katonai zöld', filter: 'sepia(0.85) hue-rotate(50deg) saturate(1.6) brightness(0.95) contrast(1.1)' },
    olive:    { label: 'Tompa olajzöld', filter: 'sepia(0.6) hue-rotate(35deg) saturate(1.3) brightness(0.85) contrast(1.05)' },
    nightvision: { label: 'Éjjellátó', filter: 'sepia(1) hue-rotate(65deg) saturate(3) brightness(1.1) contrast(1.25)' },
    original: { label: 'Eredeti (sötét)', filter: 'none' }
};
const MAP_STYLE_KEY = 'survival_go_map_style';
const DEFAULT_MAP_STYLE = 'military';

function loadMapStyle() {
    try {
        const saved = localStorage.getItem(MAP_STYLE_KEY);
        if (saved && MAP_STYLES[saved]) return saved;
    } catch (e) { /* a böngésző tárolója nem elérhető */ }
    return DEFAULT_MAP_STYLE;
}

let currentMapStyle = DEFAULT_MAP_STYLE;

// A csempék szűrője: a választott stílus, éjszaka sötétebben
function applyTileFilter() {
    const base = (MAP_STYLES[currentMapStyle] || MAP_STYLES[DEFAULT_MAP_STYLE]).filter;
    const parts = [base === 'none' ? '' : base, nightState.night ? 'brightness(0.5)' : ''].filter(Boolean);
    document.documentElement.style.setProperty('--zone-tile-filter', parts.length ? parts.join(' ') : 'none');
}

function applyMapStyle(name) {
    currentMapStyle = MAP_STYLES[name] ? name : DEFAULT_MAP_STYLE;
    applyTileFilter();
    try { localStorage.setItem(MAP_STYLE_KEY, name); } catch (e) { /* nincs teendő */ }
    const select = document.getElementById('map-style-select');
    if (select && select.value !== name) select.value = name;
}

// --- ÉJSZAKA ---
// A játékos SAJÁT helyén napnyugtától napkeltéig sötét van. Fényforrás (fáklya, elemlámpa, lámpás) nélkül
// csak NIGHT_VISIBILITY_METERS méterre látod az épületeket, fénnyel ugyanannyira, mint nappal.
const NIGHT_VISIBILITY_METERS = 30;
const nightState = { night: false, light: false };

// Van-e működő fényforrás (nem merült le, vagy van hozzá elem / lámpaolaj) – ugyanaz, mint a szerveren
function hasLightSource() {
    return !!SurvivalStats.findUsableLight(player.inventory, itemDatabase);
}

function updateNightState() {
    const pos = playerMarker ? playerMarker.getLatLng() : null;
    const night = !!(pos && SurvivalSun.isNight(pos.lat, pos.lng, new Date()));
    const light = hasLightSource();
    const changed = night !== nightState.night || light !== nightState.light;
    if (night !== nightState.night) {
        logMessage(night
            ? (light ? '🌙 Leszállt az éj. A fényforrásod világít.' : '🌙 Leszállt az éj. Fényforrás nélkül csak a közvetlen környezetedet látod!')
            : '☀️ Felkelt a nap.');
    }
    nightState.night = night;
    nightState.light = light;
    if (changed) applyTileFilter();
    const indicator = document.getElementById('night-indicator');
    if (indicator) {
        indicator.classList.toggle('hidden', !night);
        indicator.textContent = night ? (light ? '🌙🔦' : `🌙 ${NIGHT_VISIBILITY_METERS} m`) : '';
    }
}

// Látszik-e az épület (éjszaka fény nélkül csak a közelben)
function isBuildingVisible(bData) {
    if (!nightState.night || nightState.light || !playerMarker) return true;
    const pos = playerMarker.getLatLng();
    return SurvivalBuildings.distanceToBuilding({ lat: pos.lat, lng: pos.lng }, bData) <= NIGHT_VISIBILITY_METERS;
}

applyMapStyle(loadMapStyle());

function initMap(lat, lng) {
    if (map) return;
    map = L.map('map').setView([lat, lng], 17);
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    className: 'zone-tiles', // a térképstílus szűrője csak erre a rétegre hat (a jelölőkre nem)
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

    const avatarFile = player.avatar || 'avatar1.png';
    const icon = L.divIcon({
        className: 'custom-player-icon',
        html: `
            <div style="width: 36px; height: 36px; background: #1e293b; border: 3px solid #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px rgba(16,185,129,0.7); overflow: hidden;">
                <img src="/images/avatars/${avatarFile}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/images/avatars/avatar1.png'">
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    playerMarker = L.marker([lat, lng], {icon: icon}).addTo(map);

    fetchRealPOIs(lat, lng);
    lastFetchLat = lat;
    lastFetchLng = lng;
    startTracking();

    initOtherPlayersListener();
    initBuildingSyncListener();

    // A lejárt zárak percenként eltűnnek a térképről
    setInterval(refreshMapMarkers, 60000);
}

function startTracking() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const currentLatLng = L.latLng(lat, lng);

            if (playerMarker) {
                // Ha ez az első valódi GPS jel, vagy még nem töltöttünk le POI-t a valós helyre:
                if (!hasFetchedRealGPS) {
                    map.setView([lat, lng], 17);
                    fetchRealPOIs(lat, lng);
                    lastFetchLat = lat;
                    lastFetchLng = lng;
                    hasFetchedRealGPS = true;
                    logMessage("[GPS] Valódi pozíció rögzítve, épületek betöltése...");
                }

                // A megtett távot, a fáradtságot és a mozgásért járó XP-t a szerver számolja
                // a beküldött pozíciókból (a GPS pontosságát is elküldjük a szűréshez).
                playerMarker.setLatLng([lat, lng]);

                sendMyPosition(lat, lng, accuracy);
                refreshMapMarkers(); // éjszaka a látható kör a játékossal együtt mozog

                // Távolság-alapú frissítés, ha odébb sétálsz (pl. 150 méter)
                if (lastFetchLat === null || lastFetchLng === null || L.latLng(lastFetchLat, lastFetchLng).distanceTo(currentLatLng) > 150) {
                    fetchRealPOIs(lat, lng);
                    lastFetchLat = lat;
                    lastFetchLng = lng;
                }
            }

            if (!isMapInitialized && map && hasFetchedRealGPS) {
                map.setView([lat, lng], 17);
                isMapInitialized = true;
            }
        }, error => {
            logMessage("GPS figyelmeztetés: Alapértelmezett koordináta használata.");
        }, { 
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        });
    }
}

function fetchRealPOIs(lat, lng) {
    const radius = 300;
    const query = `
        [out:json];
        (
            node(around:${radius},${lat},${lng})[shop];
            node(around:${radius},${lat},${lng})[amenity];
            node(around:${radius},${lat},${lng})[tourism];
            node(around:${radius},${lat},${lng})[leisure];
            node(around:${radius},${lat},${lng})[building];
            way(around:${radius},${lat},${lng})[building];
            way(around:${radius},${lat},${lng})[shop];
            way(around:${radius},${lat},${lng})[amenity];
        );
        out bb;
    `;

    // Itt vannak a tárcsifüleink (tartalék szerverek sorban)
    const overpassUrls = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.openstreetmap.fr/api/interpreter',
        'https://overpass-api.de/api/interpreter' // Hátul végvárként a hivatalos
    ];

    // Rekurzív vagy ciklikus próbálkozó függvény a szerverekre
    let tryFetchUrl = (index) => {
        if (index >= overpassUrls.length) {
            console.warn("Az összes Overpass szerver hibát jelzett vagy elérhetetlen.");
            logMessage("[Zóna] Most nem sikerült betölteni a környék épületeit. Kicsit odébb sétálva újra próbálkozik.");
            lastFetchLat = null; // a következő GPS-frissítésnél újrapróbálja
            return;
        }

        const url = overpassUrls[index] + '?data=' + encodeURIComponent(query);

        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP hiba! Státusz: ${response.status}`);
                return response.text();
            })
            .then(text => {
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    // Ha nem JSON jött vissza, próbáljuk a következőt
                    tryFetchUrl(index + 1);
                    return;
                }

                if (!data || !Array.isArray(data.elements)) {
                    // hibás / túlterhelt válasz (pl. "rate limited"): jöhet a következő szerver
                    tryFetchUrl(index + 1);
                    return;
                }

                const newIds = [];
                data.elements.forEach((element) => {
                    // Pontnál a saját koordináta, épületnél (way) a befoglaló téglalap közepe
                    const pos = SurvivalBuildings.elementPosition(element);
                    if (!pos) return;
                    const elLat = pos.lat;
                    const elLon = pos.lng;

                    // Egyértelmű azonosító (node / way) és a szerverrel KÖZÖS besorolás (buildings.js)
                    const uniqueId = SurvivalBuildings.buildingId(element);
                    const exists = savedBuildings.some(sb => sb.id === uniqueId);
                    if (exists) return;

                    const tags = element.tags || {};
                    const buildingType = SurvivalBuildings.classifyBuilding(tags);

                    // (A műhelyek – olvasztás, javítás – egy későbbi frissítésben jönnek; addig minden épület sima, lootolható épület.)

                    const knownLock = buildingLocks[uniqueId] || null;
                    savedBuildings.push({
                        id: uniqueId,
                        lat: elLat,
                        lng: elLon,
                        bounds: SurvivalBuildings.cleanBounds(element.bounds),
                        type: buildingType,
                        name: SurvivalBuildings.displayName(buildingType, tags),
                        lockedUntil: knownLock
                    });
                    newIds.push(uniqueId);
                });

            // A messze hagyott épületeket elfelejtjük, így séta közben sem nő a végtelenségig a jelölők száma
            pruneFarBuildings(lat, lng);

            if (newIds.length > 0) {
                refreshMapMarkers();
                requestBuildingStatus(newIds);
                logMessage("[Zóna] Térkép sikeresen feltöltve a környék épületeivel!");
            }
        })
        .catch(error => {
            console.warn(`Szerver hiba a(z) ${index}. címnél, próbáljuk a következőt...`, error);
            tryFetchUrl(index + 1); // Ez léptet át a következő szerverre, ha hiba történik!
        });
    };

    // Itt indul el az első szerver hívása
    tryFetchUrl(0);
}

// Menekülés utáni SZEMÉLYES zár (csak neked): az ellenség még bent van
function dangerUntilFor(id) {
    const until = player.dangerUntil && player.dangerUntil[id];
    return until && until > Date.now() ? until : 0;
}

// Egy épület jelölőjének kinézete:
//  'locked' (mindenkinek zárva, kifosztották): piros lakat
//  'danger' (csak neked, elmenekültél onnan): narancs figyelmeztető jel
//  'free': a típus ikonja és színe
function buildingMarkerIcon(bData, state) {
    let iconHtml;
    if (state === 'danger') {
        iconHtml = '<div style="background:#c2410c;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px dashed #fdba74;font-size:13px;box-shadow:0 0 10px rgba(249,115,22,0.7);">⚠️</div>';
    } else if (state === 'locked') {
        iconHtml = '<div style="background:#b91c1c;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #f87171;font-size:12px;box-shadow:0 0 10px rgba(239,68,68,0.7);">🔒</div>';
    } else {
        const config = SurvivalBuildings.typeInfo(bData.type);
        iconHtml = `<div style="position:relative;background:${config.color};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #111;font-size:13px;box-shadow:0 0 10px rgba(0,0,0,0.8);">${config.icon}</div>`;
    }
    return L.divIcon({ className: 'custom-icon', html: iconHtml, iconSize: [26, 26] });
}

// A jelölők FOKOZATOS frissítése: új épületnél új jelölő, zárállapot-változásnál csak az ikon cserélődik,
// az elfelejtett épületek jelölője eltűnik. (Eddig minden frissítés az összes jelölőt újraépítette.)
const markerById = new Map(); // épület-azonosító -> { id, lat, lng, name, type, looted, lockedUntil, marker }
function refreshMapMarkers() {
    if (!map) return;
    updateNightState();
    const now = Date.now();
    const alive = new Set();

    savedBuildings.forEach(bData => {
        // Csak a teljes (név + koordináta) épületek rajzolhatók ki
        if (!bData || typeof bData.name !== 'string' || typeof bData.lat !== 'number' || typeof bData.lng !== 'number') return;
        alive.add(bData.id);
        const locked = !!(bData.lockedUntil && now < bData.lockedUntil);
        const state = locked ? 'locked' : (dangerUntilFor(bData.id) ? 'danger' : 'free');

        let obj = markerById.get(bData.id);
        if (!obj) {
            const marker = L.marker([bData.lat, bData.lng], { icon: buildingMarkerIcon(bData, state) }).addTo(map);
            obj = { id: bData.id, lat: bData.lat, lng: bData.lng, bounds: bData.bounds, name: bData.name, type: bData.type, looted: locked, state, lockedUntil: bData.lockedUntil, marker };
            marker.on('click', () => interactWithBuilding(obj));
            markerById.set(bData.id, obj);
        } else if (obj.state !== state) {
            obj.marker.setIcon(buildingMarkerIcon(bData, state));
        }
        obj.looted = locked;
        obj.state = state;
        obj.lockedUntil = bData.lockedUntil;

        // Éjszakai láthatóság
        const visible = isBuildingVisible(bData);
        if (obj.visible === undefined) obj.visible = true;
        if (visible !== obj.visible) {
            if (visible) obj.marker.addTo(map);
            else map.removeLayer(obj.marker);
            obj.visible = visible;
        }
    });

    markerById.forEach((obj, id) => {
        if (alive.has(id)) return;
        if (obj.visible !== false) map.removeLayer(obj.marker);
        markerById.delete(id);
    });
    buildings = Array.from(markerById.values());
}

// A játékostól BUILDING_KEEP_RADIUS_METERS-nél messzebb lévő épületek törlése a listából
const BUILDING_KEEP_RADIUS_METERS = 1500;
function pruneFarBuildings(lat, lng) {
    const here = L.latLng(lat, lng);
    savedBuildings = savedBuildings.filter(b => here.distanceTo([b.lat, b.lng]) <= BUILDING_KEEP_RADIUS_METERS);
}

function closeWorkshopModal() {
    const modal = document.getElementById('workshop-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function interactWithBuilding(b) {
    if (!playerMarker) {
        logMessage("Várd meg a GPS pozíciót!");
        return;
    }
    const pLatLng = playerMarker.getLatLng();
    const distance = SurvivalBuildings.distanceToBuilding({ lat: pLatLng.lat, lng: pLatLng.lng }, b); // nagy létesítménynél a szélétől

    if (distance > 45) { // a szerver is 30 m + 15 m GPS-tűréssel számol
        logMessage(`Túl messze vagy az épülettől! (${Math.round(distance)}m - Menj 30 méteren belülre)`);
        return;
    }

if (b.lockedUntil && Date.now() < b.lockedUntil) {
        const remainingMin = Math.ceil((b.lockedUntil - Date.now()) / 60000);
        logMessage(`Ezt az épületet nemrég kifosztották. Gyere vissza később! (Kb. ${remainingMin} perc)`);
        playSound('hit');
        return;
    }

    const danger = dangerUntilFor(b.id);
    if (danger) {
        const remainingMin = Math.ceil((danger - Date.now()) / 60000);
        logMessage(`Az ellenség még bent van, ahonnan elmenekültél. Gyere vissza később! (Kb. ${remainingMin} perc)`);
        playSound('hit');
        return;
    }

    if (player.combat) {
        logMessage("Harc közben nem kutathatsz át másik épületet!");
        return;
    }

    if ((player.fatigue || 0) >= 100) {
        logMessage("Teljesen kimerültél! Pihenned kell.");
        playSound('hit');
        return;
    }

    if (player.inventory.length >= (player.maxInv || 10)) {
        logMessage("A hátizsákod tele van!");
        playSound('hit');
        return;
    }

    // A döntés a szerveré: ő kérdezi le az épületet, ellenőrzi a távolságot és a zárat,
    // és ő sorsolja a találkozást és a lootot. A kliens csak az azonosítót küldi.
    // Amíg a szerver válaszára várunk, ne lehessen újra rákoppintani (első alkalommal 1-2 mp is lehet)
    if (lootPending && Date.now() - lootPending.at < LOOT_PENDING_TIMEOUT_MS) {
        logMessage(`Már átkutatod: ${lootPending.name}...`);
        return;
    }

    if (typeof socket !== 'undefined' && socket) {
        lootPending = { id: b.id, name: b.name, at: Date.now() };
        logMessage(`Átkutatod: ${b.name}...`);
        socket.emit('loot_building', { buildingId: b.id });
    }
}

// A folyamatban lévő átkutatás (a szerver válaszáig). Ha válasz nem jön (pl. megszakadt a kapcsolat),
// a megadott idő után újra lehet próbálkozni.
let lootPending = null;
const LOOT_PENDING_TIMEOUT_MS = 15000;



// Saját pozíció küldése a szervernek
function sendMyPosition(lat, lng, accuracy) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('update_position', {
            lat: lat,
            lng: lng,
            accuracy: typeof accuracy === 'number' ? accuracy : null
        });
    }
}

// GPS alapú térkép és játék inicializálás a bejelentkezés után
function initMapAndGame() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Térkép indítása a valós GPS pozícióval
            initMap(lat, lng);
            logMessage(`[GPS] Pozíció rögzítve: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }, error => {
            console.warn("GPS hiba, alapértelmezett koordináta használata.");
            // Ha letiltod a GPS-t, fallbackként betölti Budapestet
            initMap(47.4979, 19.0402);
            logMessage("[GPS] Nem sikerült lekérni a helyzetet, alapértelmezett zóna betöltve.");
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } else {
        console.warn("A böngésző nem támogatja a geolokációt.");
        initMap(47.4979, 19.0402);
    }
}

// A többi játékos: a szerver CSAK a közelben lévőket küldi (nappal 150 m, éjszaka fény nélkül 30 m),
// mindig a teljes listát. Ami nincs benne, annak a jelölője eltűnik (így nem maradnak "szellem" jelölők).
const SAFE_AVATAR = /^avatar[1-9]\.png$/;

function otherPlayerIcon(pData) {
    const avatarFile = SAFE_AVATAR.test(pData.avatar || '') ? pData.avatar : 'avatar1.png';
    return L.divIcon({
        className: 'other-player-icon',
        html: `
            <div style="width: 36px; height: 36px; background: #1e293b; border: 2px solid #940e0e; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(0,0,0,0.8); overflow: hidden;">
                <img src="/images/avatars/${avatarFile}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/images/avatars/avatar1.png'">
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

function initOtherPlayersListener() {
    if (typeof socket === 'undefined' || !socket) return;

    socket.on('players_update', (playersData) => {
        if (!map || !playersData || typeof playersData !== 'object') return;
        const present = new Set();

        Object.keys(playersData).forEach(name => {
            const pData = playersData[name];
            if (!pData || pData.username === player.username) return;
            if (typeof pData.lat !== 'number' || typeof pData.lng !== 'number') return;
            present.add(name);

            const existing = otherPlayerMarkers[name];
            if (existing) {
                existing.marker.setLatLng([pData.lat, pData.lng]);
                existing.data = pData;
            } else {
                const marker = L.marker([pData.lat, pData.lng], { icon: otherPlayerIcon(pData) }).addTo(map);
                const entry = { marker, data: pData };
                // Kattintásra a játékos neve és szintje (később innen indulhat a PvP)
                marker.on('click', () => showOtherPlayer(entry.data));
                otherPlayerMarkers[name] = entry;
            }
        });

        Object.keys(otherPlayerMarkers).forEach(name => {
            if (present.has(name)) return;
            map.removeLayer(otherPlayerMarkers[name].marker);
            delete otherPlayerMarkers[name];
        });
    });
}

function showOtherPlayer(pData) {
    logMessage(`👤 ${pData.username} – ${pData.level || 1}. szintű túlélő`);
}

// --- BIZTONSÁGOS LOOT EREDMÉNY FOGADÁSA A SZERVERTŐL ---
if (typeof socket !== 'undefined' && socket) {
    socket.on('loot_result', (data) => {
        lootPending = null;
        if (!data.success) {
            logMessage(data.message || "Hiba a lootolás során.");
            playSound('hit');
            return;
        }

        // Az új leltár és fáradtság a player_state üzenettel érkezik.
        // A szerver üzenete (pl. találkozás az ellenséggel, üres épület) elöl áll.
        const parts = [];
        if (data.message) parts.push(data.message);
        if (data.items && data.items.length > 0) {
            const list = data.items.map(it => {
                const cfg = itemDatabase[it.key] || { name: it.key, icon: '📦' };
                return `${cfg.icon} ${it.count > 1 ? it.count + '× ' : ''}${cfg.name}`;
            }).join(', ');
            parts.push(`Találtál: ${list}`);
            playSound('loot');
        } else if (!data.message) {
            parts.push('Semmi hasznosat nem találtál.');
        }
        logMessage(parts.join(' '));

        // Épület zárolása lokálisan is (a többiek a building_looted_update üzenetből tudják meg)
        applyBuildingLock(data.buildingId, data.lockedUntil);
        refreshMapMarkers();
    });
}

function initBuildingSyncListener() {
    if (typeof socket === 'undefined' || !socket) return;

    socket.on('building_looted_update', (data) => {
        if (!data) return;
        // Ha az épület még nincs betöltve, csak megjegyezzük a zárat (nem hozunk létre név nélküli bejegyzést)
        applyBuildingLock(data.id, data.lockedUntil);

        // Azonnal frissítjük a térkép jelölőit (így azonnal piros lakat lesz rajta bárkinél, aki látja)
        refreshMapMarkers();
    });
}