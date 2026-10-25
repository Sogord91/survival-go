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
    'Iskola / Óvoda': { icon: '🏫', color: '#0ea5e9' },
    'Könyvtár': { icon: '📚', color: '#8b5cf6' },
    'Templom / Kápolna': { icon: '⛪', color: '#eab308' },
    'Városháza / Polgármesteri Hivatal': { icon: '🏛️', color: '#6366f1' },
    'Múzeum / Kiállítóterem': { icon: '🏛️', color: '#a855f7' },
    'Elhagyatott raktár': { icon: '🏭', color: '#f59e0b' },
    'Ipari létesítmény / Gyár': { icon: '⚙️', color: '#7c2d12' },
    'Autószerviz / Gumis': { icon: '🔧', color: '#b45309' },
    'Romos ház': { icon: '🏠', color: '#6b7280' }
};

function initMap(lat, lng) {
    if (map) return;
    map = L.map('map').setView([lat, lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const icon = L.divIcon({
        className: 'custom-player-icon',
        html: `<div style="font-size: 24px; text-align: center;">${player.avatar || '🥷'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    playerMarker = L.marker([lat, lng], {icon: icon}).addTo(map);

    fetchRealPOIs(lat, lng);
    lastFetchLat = lat;
    lastFetchLng = lng;
    startTracking();
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

                if (lastFetchLat === null || lastFetchLng === null || L.latLng(lastFetchLat, lastFetchLng).distanceTo(currentLatLng) > 300) {
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
        }, { enableHighAccuracy: true });
    }
}

function fetchRealPOIs(lat, lng) {
    const radius = 600;
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

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (!data.elements) return;

            let newFound = false;
            data.elements.forEach((element) => {
                const elLat = element.lat || (element.center ? element.center.lat : null);
                const elLon = element.lon || (element.center ? element.center.lon : null);
                if (!elLat || !elLon) return;

                const uniqueId = 'osm_' + element.id;
                const exists = savedBuildings.some(sb => sb.id === uniqueId);
                if (exists) return;

                let buildingName = 'Romos ház';
                let tags = element.tags || {};
                let isPotentialWorkshop = false;

                if (tags.shop === 'supermarket' || tags.shop === 'grocery') buildingName = 'Élelmiszerbolt';
                else if (tags.shop === 'convenience' || tags.shop === 'kiosk') buildingName = 'Kisbolt / Trafik';
                else if (tags.shop === 'hardware' || tags.shop === 'doityourself') { buildingName = 'Barkácsáruház'; isPotentialWorkshop = true; }
                else if (tags.amenity === 'fuel') buildingName = 'Benzinkút / Kút';
                else if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') buildingName = 'Étterem / Kávézó / Fagyizó / Csárda';
                else if (tags.amenity === 'pub' || tags.amenity === 'bar') buildingName = 'Kocsma / Pub / Söröző';
                else if (tags.amenity === 'pharmacy') buildingName = 'Gyógyszertár';
                else if (tags.amenity === 'hospital') buildingName = 'Kórház';
                else if (tags.amenity === 'police') buildingName = 'Rendőrség';
                else if (tags.building === 'warehouse') { buildingName = 'Elhagyatott raktár'; isPotentialWorkshop = true; }
                else if (tags.shop === 'car_repair') { buildingName = 'Autószerviz / Gumis'; isPotentialWorkshop = true; }

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
        .catch(error => { console.error("Hiba OSM lekérdezéskor:", error); });
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

            iconHtml = `<div style="position:relative;background:${config.color};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-size:13px;box-shadow:0 0 10px rgba(0,0,0,0.5);">${config.icon}${badgeHtml}</div>`;
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

    if (Math.random() < 0.08) {
        startCombat(b);
    } else {
        completeLooting(b);
    }
}

function rollLoot(buildingName) {
    let possibleItems = [];
    let emptyChance = 0.70;

    if (buildingName.includes('Élelmiszerbolt') || buildingName.includes('Kisbolt')) {
        possibleItems = ['canned_food', 'tuna_can', 'mre_ration', 'energy_bar', 'water_bottle', 'kvass', 'energy_drink'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Gyógyszertár') || buildingName.includes('Kórház')) {
        possibleItems = ['painkillers', 'bandage', 'rag_bandage', 'antibiotics', 'alcohol'];
        emptyChance = 0.40;
    } else if (buildingName.includes('Rendőrség') || buildingName.includes('Katonai bázis')) {
        possibleItems = ['makarov', 'ak47', 'ammo_9mm', 'ammo_762', 'kevlar_vest'];
        emptyChance = 0.40;
    } else {
        possibleItems = ['rag', 'canned_food', 'stone', 'stick'];
        emptyChance = 0.80;
    }

    if (Math.random() < emptyChance) return [];
    let found = [];
    for(let i = 0; i < 1; i++) {
        found.push(possibleItems[Math.floor(Math.random() * possibleItems.length)]);
    }
    return found;
}

function completeLooting(b) {
    b.looted = true;
    b.lootedTime = Date.now();
    const targetSaved = savedBuildings.find(sb => sb.id === b.id);
    if(targetSaved) targetSaved.looted = true;

    refreshMapMarkers();

    const foundItems = rollLoot(b.name);
    if (foundItems.length === 0) {
        logMessage(`${b.name}: Üres volt.`);
    } else {
        let msg = `${b.name} átkutatva! Találtál: `;
        foundItems.forEach(itKey => {
            addItemToInventory(itKey, 1);
            msg += `${itemDatabase[itKey].icon} ${itemDatabase[itKey].name} `;
        });
        logMessage(msg);
        playSound('loot');
        addXp(15);
    }
    saveGame();
}