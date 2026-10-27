// map.js
let map = null;
let playerMarker = null;
let lastLat = null;
let lastLng = null;
let isMapInitialized = false;
let lastFetchLat = null;
let lastFetchLng = null;
let savedBuildings = [];
let buildings = [];
let otherPlayerMarkers = {};

const buildingTypesConfig = {
    'Élelmiszerbolt': { icon: '🛒', color: '#10b981' },
    'Kisbolt / Trafik': { icon: '🏪', color: '#14b8a6' },
    'Barkácsáruház': { icon: '🛠️', color: '#d97706' },
    'Étterem / Kávézó / Fagyizó / Csárda': { icon: '☕', color: '#ec4899' },
    'Benzinkút / Kút': { icon: '⛽', color: '#dc2626' },
    'Kocsma / Pub / Söröző': { icon: '🍺', color: '#f97316' },
    'Gyógyszertár': { icon: '💊', color: '#ef4444' },
    'Kórház': { icon: '🏥', color: '#dc2626' },
    'Rendőrség': { icon: '🛡️', color: '#3b82f6' },
    'Tűzoltóság': { icon: '🚒', color: '#f97316' },
    'Katonai bázis': { icon: '⭐', color: '#b91c1c' },
    'Kormányzati Bunker / Óvóhely': { icon: '☢️', color: '#7f1d1d' },
    'Elhagyatott Katonai Ellenőrzőpont / Blokád': { icon: '🚧', color: '#b45309' },
    'Katasztrófavédelmi / Vegyvédelmi Központ': { icon: '☣️', color: '#047857' },
    'Iskola / Óvoda': { icon: '🏫', color: '#0ea5e9' },
    'Könyvtár': { icon: '📚', color: '#8b5cf6' },
    'Templom / Kápolna': { icon: '⛪', color: '#eab308' },
    'Kolostor / Apátság': { icon: '⛪', color: '#ca8a04' },
    'Városháza / Polgármesteri Hivatal': { icon: '🏛️', color: '#6366f1' },
    'Múzeum / Kiállítóterem': { icon: '🏛️', color: '#a855f7' },
    'Bíróság / Ügyvédi Iroda': { icon: '⚖️', color: '#4f46e5' },
    'Mozi / Színház / Művelődési Ház': { icon: '🎭', color: '#db2777' },
    'Elhagyatott raktár': { icon: '🏭', color: '#f59e0b' },
    'Ipari létesítmény / Gyár': { icon: '⚙️', color: '#7c2d12' },
    'Autószerviz / Gumis': { icon: '🔧', color: '#b45309' },
    'Autóbontó / Roncstelep': { icon: '🚗', color: '#78716c' },
    'Garázs': { icon: '🚗', color: '#78716c' },
    'Vasútállomás / Rendezőpályaudvar': { icon: '🚂', color: '#374151' },
    'Posta / Csomagátvevő pont': { icon: '📦', color: '#d97706' },
    'Mezőgazdasági Géptelep / Téesz': { icon: '🚜', color: '#65a30d' },
    'Malom / Gabonasiló': { icon: '🌾', color: '#ca8a04' },
    'Állatfarm / Lovarda': { icon: '🐎', color: '#854d0e' },
    'Víztorony / Vízmű': { icon: '💧', color: '#0284c7' },
    'Elektromos Alállomás / Trafóház': { icon: '⚡', color: '#eab308' },
    'Romos ház': { icon: '🏠', color: '#6b7280' },
    'Szálloda / Hotel / Panzió': { icon: '🏨', color: '#9333ea' },
    'Motel / Kamionos pihenő': { icon: '🏨', color: '#793e75' },
    'Sportcsarnok / Edzőterem': { icon: '🏋️', color: '#2563eb' },
    'Stadion / Futballpálya': { icon: '⚽', color: '#16a34a' },
    'Strand / Uszoda': { icon: '🏊', color: '#06b6d4' },
    'Temető': { icon: '⚰️', color: '#3f3f46' }
};

function initMap(lat, lng) {
    if (map) return;
    map = L.map('map').setView([lat, lng], 17);
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
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
}

function startTracking() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const currentLatLng = L.latLng(lat, lng);

            if (playerMarker) {
                if (lastLat !== null && lastLng !== null) {
                    const distanceMoved = L.latLng(lastLat, lastLng).distanceTo(currentLatLng);
                    if (distanceMoved > 5 && accuracy < 60) {
                        let fatigueMultiplier = (player.equipment.shoes === 'combat_boots') ? 0.6 : 1.0;
                        player.fatigue = Math.min(100, (player.fatigue || 0) + (distanceMoved * 0.02) * fatigueMultiplier);
                        addXp(1);
                        saveGame();
                    }
                }
                lastLat = lat;
                lastLng = lng;
                playerMarker.setLatLng([lat, lng]);

                sendMyPosition(lat, lng);

                if (lastFetchLat === null || lastFetchLng === null || L.latLng(lastFetchLat, lastFetchLng).distanceTo(currentLatLng) > 100) {
                    fetchRealPOIs(lat, lng);
                    lastFetchLat = lat;
                    lastFetchLng = lng;
                }
            }

            if (!isMapInitialized && map) {
                map.setView([lat, lng], 17);
                isMapInitialized = true;
            }
        }, error => {
            logMessage("GPS figyelmeztetés: Alapértelmezett koordináta használata.");
        }, { 
            enableHighAccuracy: true, // Valódi GPS hardver kényszerítése
            timeout: 15000,           // 15 mp türelmi idő a pontos jelhez
            maximumAge: 0             // Nincs régóta mentett/cache-elt pozíció
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
        out center;
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

                if (!data.elements) return;

                let newFound = false;
                data.elements.forEach((element) => {
                    const elLat = element.lat || (element.center ? element.center.lat : null);
                    const elLon = element.lon || (element.center ? element.center.lon : null);
                    if (!elLat || !elLon) return;

                    const uniqueId = 'osm_' + element.id;
                    const exists = savedBuildings.some(sb => sb.id === uniqueId);
                    if (exists) return;

                    let tags = element.tags || {};
                    let buildingName = 'Romos ház';
                    let isPotentialWorkshop = false;

                if (tags.shop === 'supermarket' || tags.shop === 'grocery') {
                    buildingName = 'Élelmiszerbolt';
                } else if (tags.shop === 'convenience' || tags.shop === 'kiosk' || tags.shop === 'general') {
                    buildingName = 'Kisbolt / Trafik';
                } else if (tags.shop === 'hardware' || tags.shop === 'doityourself' || tags.shop === 'houseware') {
                    buildingName = 'Barkácsáruház';
                    isPotentialWorkshop = true;
                } else if (tags.shop === 'car_repair' || tags.shop === 'tyres' || tags.shop === 'car_parts') {
                    buildingName = 'Autószerviz / Gumis';
                    isPotentialWorkshop = true;
                } else if (tags.shop === 'agrarian' || tags.shop === 'farm') {
                    buildingName = 'Mezőgazdasági Géptelep / Téesz';
                } else if (tags.shop === 'post' || tags.amenity === 'post_office') {
                    buildingName = 'Posta / Csomagátvevő pont';
                } else if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'ice_cream' || tags.amenity === 'fast_food') {
                    buildingName = 'Étterem / Kávézó / Fagyizó / Csárda';
                } else if (tags.amenity === 'pub' || tags.amenity === 'bar' || tags.amenity === 'nightclub') {
                    buildingName = 'Kocsma / Pub / Söröző';
                } else if (tags.amenity === 'cinema' || tags.amenity === 'theatre' || tags.amenity === 'arts_centre' || tags.amenity === 'community_centre') {
                    buildingName = 'Mozi / Színház / Művelődési Ház';
                } else if (tags.amenity === 'pharmacy') {
                    buildingName = 'Gyógyszertár';
                } else if (tags.amenity === 'hospital' || tags.amenity === 'clinic') {
                    buildingName = 'Kórház';
                } else if (tags.amenity === 'police') {
                    buildingName = 'Rendőrség';
                } else if (tags.amenity === 'fire_station') {
                    buildingName = 'Tűzoltóság';
                } else if (tags.military === 'bunker' || tags.bunker === 'yes') {
                    buildingName = 'Kormányzati Bunker / Óvóhely';
                } else if (tags.military === 'checkpoint' || tags.barrier === 'blockade') {
                    buildingName = 'Elhagyatott Katonai Ellenőrzőpont / Blokád';
                } else if (tags.military === 'danger_area' || tags.amenity === 'cbrn') {
                    buildingName = 'Katasztrófavédelmi / Vegyvédelmi Központ';
                } else if (tags.military) {
                    buildingName = 'Katonai bázis';
                } else if (tags.amenity === 'school' || tags.amenity === 'kindergarten' || tags.amenity === 'university' || tags.amenity === 'college') {
                    buildingName = 'Iskola / Óvoda';
                } else if (tags.amenity === 'library') {
                    buildingName = 'Könyvtár';
                } else if (tags.amenity === 'place_of_worship') {
                    if (tags.religion === 'christian' && (tags.building === 'monastery' || tags.building === ' abbey')) {
                        buildingName = 'Kolostor / Apátság';
                    } else {
                        buildingName = 'Templom / Kápolna';
                    }
                } else if (tags.amenity === 'townhall' || tags.amenity === 'public_building') {
                    buildingName = 'Városháza / Polgármesteri Hivatal';
                } else if (tags.tourism === 'museum' || tags.amenity === 'arts_centre') {
                    buildingName = 'Múzeum / Kiállítóterem';
                } else if (tags.amenity === 'court') {
                    buildingName = 'Bíróság / Ügyvédi Iroda';
                } else if (tags.building === 'warehouse' || tags.building === 'industrial') {
                    buildingName = 'Elhagyatott raktár';
                    isPotentialWorkshop = true;
                } else if (tags.industrial || tags.building === 'factory') {
                    buildingName = 'Ipari létesítmény / Gyár';
                    isPotentialWorkshop = true;
                } else if (tags.amenity === 'fuel') {
                    buildingName = 'Benzinkút / Kút';
                } else if (tags.building === 'garages' || tags.amenity === 'parking') {
                    buildingName = 'Garázs';
                } else if (tags.landuse === 'garages') {
                    buildingName = 'Autóbontó / Roncstelep';
                } else if (tags.railway === 'station' || tags.building === 'train_station') {
                    buildingName = 'Vasútállomás / Rendezőpályaudvar';
                } else if (tags.man_made === 'water_tower' || tags.utility === 'water') {
                    buildingName = 'Víztorony / Vízmű';
                } else if (tags.power === 'substation' || tags.building === 'transformer_tower') {
                    buildingName = 'Elektromos Alállomás / Trafóház';
                } else if (tags.building === 'windmill' || tags.man_made === 'windmill' || tags.building === 'silo') {
                    buildingName = 'Malom / Gabonasiló';
                } else if (tags.tourism === 'hotel' || tags.tourism === 'hostel' || tags.tourism === 'guest_house') {
                    buildingName = 'Szálloda / Hotel / Panzió';
                } else if (tags.tourism === 'motel') {
                    buildingName = 'Motel / Kamionos pihenő';
                } else if (tags.leisure === 'sports_centre' || tags.amenity === 'gym') {
                    buildingName = 'Sportcsarnok / Edzőterem';
                } else if (tags.leisure === 'stadium' || tags.pitch) {
                    buildingName = 'Stadion / Futballpálya';
                } else if (tags.leisure === 'water_park' || tags.amenity === 'swimming_pool') {
                    buildingName = 'Strand / Uszoda';
                } else if (tags.amenity === 'grave_yard' || tags.landuse === 'cemetery') {
                    buildingName = 'Temető';
                } else if (tags.landuse === 'farm' || tags.amenity === 'animal_shelter') {
                    buildingName = 'Állatfarm / Lovarda';
                }

                let workshopType = null;
                const lowerName = buildingName.toLowerCase();
                const isBlacklisted = lowerName.includes('étterem') || lowerName.includes('bolt');

                if (isPotentialWorkshop && !isBlacklisted) {
                    let hash = Math.abs(Number(element.id)) % 8;
                    if (hash === 0) workshopType = 'smelter';
                    else if (hash === 1) workshopType = 'repair';
                }

                savedBuildings.push({
                    id: uniqueId,
                    lat: elLat,
                    lng: elLon,
                    name: tags.name ? `${buildingName} (${tags.name})` : buildingName,
                    looted: false,
                    lootedTime: null,
                    lockedUntil: null,
                    workshop: workshopType
                });
                newFound = true;
            });

            if (newFound) {
                saveGame();
                refreshMapMarkers();
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

function refreshMapMarkers() {
    if (!map) return;
    buildings.forEach(b => map.removeLayer(b.marker));
    buildings = [];

    savedBuildings.forEach(bData => {
        let matchType = 'Romos ház';
        for (let key in buildingTypesConfig) {
            if (bData.name.includes(key)) {
                matchType = key;
                break;
            }
        }

        const config = buildingTypesConfig[matchType] || { icon: '🏠', color: '#6b7280' };
        let iconHtml = '';
        const isLocked = bData.lockedUntil && Date.now() < bData.lockedUntil;

        if (bData.looted) {
            iconHtml = '<div style="background:#4b5563;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid #fff;font-size:10px;">⭕</div>';
        } else if (isLocked) {
            iconHtml = '<div style="background:#b91c1c;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #f87171;font-size:12px;box-shadow:0 0 10px rgba(239,68,68,0.7);">🔒</div>';
        } else {
            let badgeHtml = '';
            let titleSuffix = '';
            if (bData.workshop === 'smelter') {
                badgeHtml = '<span style="position:absolute;top:-6px;right:-6px;font-size:10px;background:#111;border-radius:50%;padding:1px;">🔥</span>';
                titleSuffix = ' [Olvasztóműhely]';
            } else if (bData.workshop === 'repair') {
                badgeHtml = '<span style="position:absolute;top:-6px;right:-6px;font-size:10px;background:#111;border-radius:50%;padding:1px;">⚙️</span>';
                titleSuffix = ' [Szerelőműhely]';
            }

            iconHtml = `<div style="position:relative;background:${config.color};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #111;font-size:13px;box-shadow:0 0 10px rgba(0,0,0,0.8);">${config.icon}${badgeHtml}</div>`;
        }

        const marker = L.marker([bData.lat, bData.lng], {
            icon: L.divIcon({ className: 'custom-icon', html: iconHtml, iconSize: [26, 26] })
        }).addTo(map);

        const buildingObj = { 
            id: bData.id, 
            lat: bData.lat, 
            lng: bData.lng, 
            name: bData.name, 
            looted: bData.looted, 
            lockedUntil: bData.lockedUntil, 
            workshop: bData.workshop,
            marker: marker 
        };
        marker.on('click', () => interactWithBuilding(buildingObj));
        buildings.push(buildingObj);
    });
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
    const distance = pLatLng.distanceTo([b.lat, b.lng]);

    if (distance > 30) {
        logMessage(`Túl messze vagy az épülettől! (${Math.round(distance)}m - Menj 30 méteren belülre)`);
        return;
    }

    if (b.workshop) {
        openWorkshopModal(b);
        return;
    }

    if (b.lockedUntil && Date.now() < b.lockedUntil) {
        const remainingMin = Math.ceil((b.lockedUntil - Date.now()) / 60000);
        logMessage(`Veszélyes! Ellenség van az épületben, gyere vissza később! (Kb. ${remainingMin} perc)`);
        playSound('hit');
        return;
    }

    if (b.looted) {
        logMessage(`Ez a(z) ${b.name} már ki van rabolva.`);
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

    if (Math.random() < 0.05) {
        // Harc az épületben -> +6% fáradtság
        player.fatigue = Math.min(100, (player.fatigue || 0) + 6);
        logMessage("Veszély! Ellenség támadt rád az épületben!");
        startCombat(b);
    } else {
        // Sikeres lootolás kérése a szervertől (Csalásmentes!)
        player.fatigue = Math.min(100, (player.fatigue || 0) + 3);
        
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('loot_building', {
                username: player.username,
                buildingId: b.id,
                buildingName: b.name
            });
        }
    }
    
    saveGame();
    updateUI();
}
        
        
// Saját pozíció küldése a szervernek
function sendMyPosition(lat, lng) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('update_position', {
            username: player.username || 'Túlélő',
            avatar: player.avatar || 'avatar1.png',
            lat: lat,
            lng: lng
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

// Hallgatjuk a többi játékos pozícióját a szerverről
function initOtherPlayersListener() {
    if (typeof socket === 'undefined' || !socket) return;

    socket.on('players_update', (playersData) => {
        if (!map || !playerMarker) return;

        const myLatLng = playerMarker.getLatLng();

        for (let id in playersData) {
            const pData = playersData[id];
            
            // Ne magunkat rajzoljuk ki
            if (pData.username === player.username) continue;

            const otherLatLng = L.latLng(pData.lat, pData.lng);
            const distance = myLatLng.distanceTo(otherLatLng); // Távolság méterben

            if (distance <= 150) { // Ha 150 méteren belül van
                if (!otherPlayerMarkers[id]) {
                    const avatarFile = (pData.avatar && pData.avatar.includes('.')) ? pData.avatar : 'avatar1.png';
                    const otherIcon = L.divIcon({
                        className: 'other-player-icon',
                        html: `
                            <div style="width: 36px; height: 36px; background: #1e293b; border: 2px solid #940e0e; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(0,0,0,0.8); overflow: hidden;">
                                <img src="/images/avatars/${avatarFile}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/images/avatars/avatar1.png'">
                            </div>
                        `,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    });
                    otherPlayerMarkers[id] = L.marker([pData.lat, pData.lng], { icon: otherIcon }).addTo(map);
                } else {
                    otherPlayerMarkers[id].setLatLng([pData.lat, pData.lng]);
                }
            } else {
                // Ha távolabb ment (> 300m), eltávolítjuk a térképről
                if (otherPlayerMarkers[id]) {
                    map.removeLayer(otherPlayerMarkers[id]);
                    delete otherPlayerMarkers[id];
                }
            }
        }
    });
}

// --- BIZTONSÁGOS LOOT EREDMÉNY FOGADÁSA A SZERVERTŐL ---
if (typeof socket !== 'undefined' && socket) {
    socket.on('loot_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Hiba a lootolás során.");
            playSound('hit');
            return;
        }

        if (data.inventory) {
            player.inventory = data.inventory;
        }

        let msg = `Átkutattad az épületet. Találtál: `;
        if (!data.items || data.items.length === 0) {
            msg = data.message || "Semmi hasznosat nem találtál.";
        } else {
            data.items.forEach(itKey => {
                const itemCfg = itemDatabase[itKey] || { name: itKey, icon: '📦' };
                msg += `${itemCfg.icon} ${itemCfg.name} `;
            });
            playSound('loot');
        }

        logMessage(msg);

        // Épület zárolása lokálisan is
        const targetSaved = savedBuildings.find(sb => sb.id === data.buildingId);
        if (targetSaved) {
            targetSaved.looted = true;
            targetSaved.lockedUntil = data.lockedUntil;
        } else {
            savedBuildings.push({
                id: data.buildingId,
                looted: true,
                lockedUntil: data.lockedUntil
            });
        }

        refreshMapMarkers();
        saveGame();
        updateUI();
    });
}

function initBuildingSyncListener() {
    if (typeof socket === 'undefined' || !socket) return;

    socket.on('building_looted_update', (data) => {
        // Megkeressük az épületet a lokális savedBuildings tömbben
        let targetSaved = savedBuildings.find(sb => sb === data.id || sb.id === data.id);
        
        if (!targetSaved) {
            // Ha még nincs benne a tömbben, de valaki kirabolta a közelben, adjuk hozzá
            targetSaved = { 
                id: data.id, 
                looted: data.looted, 
                lockedUntil: data.lockedUntil 
            };
            savedBuildings.push(targetSaved);
        } else if (typeof targetSaved === 'string') {
            // Ha régebbi formátumú string volt, cseréljük objektumra
            const index = savedBuildings.indexOf(targetSaved);
            targetSaved = { 
                id: data.id, 
                looted: data.looted, 
                lockedUntil: data.lockedUntil 
            };
            savedBuildings[index] = targetSaved;
        } else {
            // Ha már objektum, frissítjük az adatait
            targetSaved.looted = data.looted;
            targetSaved.lockedUntil = data.lockedUntil;
        }

        // Azonnal frissítjük a térkép jelölőit (így azonnal piros lakat lesz rajta bárkinél, aki látja)
        refreshMapMarkers();
    });
}