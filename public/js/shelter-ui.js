// shelter-ui.js
// MENEDÉK (v0.1.12) – a kliens oldala: jelölők a térképen, a menedék ablaka (raktár, állomások, védelem), elfoglalás.
// A szabályok a közös shelter.js-ben vannak; minden döntés a szerveré, a kliens csak kér és megjelenít.

let shelterList = [];             // a környék menedékei (szervertől)
const shelterMarkers = new Map(); // tulajdonos -> Leaflet jelölő
let shelterClaimMode = false;     // "Menedék elfoglalása" mód: a következő épület-koppintás elfoglal
let shelterClaimTarget = null;    // a megerősítésre váró épület
let shelterTab = 'stash';
let shelterTimer = null;

// ---------- Segédek ----------
function shelterNow() { return Date.now(); }
function myShelter() {
    return player.shelter ? SurvivalShelter.settle(player.shelter, shelterNow()) : null;
}
function shelterDistanceToMe(sh) {
    if (!sh || typeof playerMarker === 'undefined' || !playerMarker) return null;
    const ll = playerMarker.getLatLng();
    return SurvivalBuildings.distanceToBuilding({ lat: ll.lat, lng: ll.lng }, sh);
}
function shelterNear(sh) {
    const d = shelterDistanceToMe(sh);
    return d !== null && d <= SurvivalShelter.RANGE_METERS;
}
function fmtDuration(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtMinutes(min) { return min >= 60 ? `${Math.round(min / 60 * 10) / 10} óra` : `${min} perc`; }
function stashCountClient(sh, key) { return sh ? sh.stash.reduce((n, s) => n + (s.key === key ? s.count : 0), 0) : 0; }
function invCountClient(key) { return (player.inventory || []).reduce((n, s) => n + (s.key === key ? s.count : 0), 0); }

// A menedék jelölője: ház alakú hímzett folt; a perem a fal anyaga (saját: arany)
function shelterPatchSvg(levels, mine) {
    const wall = (levels && levels.wall) || 0;
    const bg = mine ? '#d9c58a' : wall >= 2 ? '#77776f' : wall >= 1 ? '#7a5634' : '#3a3f2c';
    const th = mine ? '#15170f' : '#e9e3cf';
    return `<svg viewBox="0 0 46 50" aria-hidden="true"><path d="M23 2 L44 19 V47 H2 V19 Z" fill="#15170f"/><path d="M23 6 L41 20.5 V44 H5 V20.5 Z" fill="${bg}"/>`
        + `<path d="M23 9.5 L38 21.7 V41 H8 V21.7 Z" fill="none" stroke="${th}" stroke-opacity=".6" stroke-dasharray="1.5 1.8"/>`
        + `<rect x="18" y="27" width="10" height="14" fill="#15170f" opacity=".75"/><circle cx="25.5" cy="34.5" r="1.3" fill="${th}"/></svg>`;
}

// ---------- Térkép ----------
function requestShelters() {
    if (typeof socket === 'undefined' || !socket || !socket.connected) return;
    if (typeof playerMarker === 'undefined' || !playerMarker) return;
    const ll = playerMarker.getLatLng();
    socket.emit('shelters_request', { lat: ll.lat, lng: ll.lng });
}

function renderShelterMarkers(me) {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const alive = new Set();
    shelterList.forEach(sh => {
        alive.add(sh.owner);
        const mine = sh.owner === me;
        const html = `<div class="sg-shelter-marker${mine ? ' mine' : ''}">${shelterPatchSvg(sh.levels, mine)}<span>${escapeAttr(mine ? 'MENEDÉKED' : sh.owner)}</span></div>`;
        const icon = L.divIcon({ className: 'sg-shelter-icon', html, iconSize: [46, 50], iconAnchor: [23, 46] });
        let m = shelterMarkers.get(sh.owner);
        if (!m) {
            m = L.marker([sh.lat, sh.lng], { icon, zIndexOffset: 500 }).addTo(map);
            m.on('click', () => onShelterMarkerClick(m.shelterData));
            shelterMarkers.set(sh.owner, m);
        } else {
            m.setLatLng([sh.lat, sh.lng]);
            m.setIcon(icon);
        }
        m.shelterData = { ...sh, mine };
    });
    shelterMarkers.forEach((m, owner) => {
        if (alive.has(owner)) return;
        map.removeLayer(m);
        shelterMarkers.delete(owner);
    });
}

function onShelterMarkerClick(sh) {
    if (!sh) return;
    if (sh.mine) { openShelterModal(); return; }
    showShelterInfo(sh);
}

// Idegen menedék: rövid adatlap
function showShelterInfo(sh) {
    const modal = document.getElementById('shelter-info-modal');
    if (!modal) return;
    const wallName = SurvivalShelter.STRUCTURES.wall.levels[sh.levels.wall || 0].name;
    const barName = SurvivalShelter.STRUCTURES.barricade.levels[sh.levels.barricade || 0].name;
    document.getElementById('shelter-info-title').textContent = `${sh.owner} menedéke`;
    document.getElementById('shelter-info-body').innerHTML = `
        <div class="sg-sh-sub">${escapeAttr(sh.name)}</div>
        <div class="sg-sh-facts"><span>FAL <b>${escapeAttr(wallName)}</b></span><span>BARIKÁD <b>${escapeAttr(barName)}</b></span><span>SZERKEZETI PONT <b>${sh.hp}</b></span></div>
        <div class="sg-sh-note">A betörés a PvP frissítéssel érkezik. Akkor csak szombaton és vasárnap 11:00–18:00 között lehet majd betörni a menedékekbe.</div>`;
    modal.classList.remove('hidden');
}

// ---------- Elfoglalás ----------
function startShelterClaim() {
    closeShelterModal();
    shelterClaimMode = true; // egy sima koppintás is jó (régi út), de a hosszú nyomás a fő mód
    logMessage('🏚 Tartsd hosszan az ujjad (gépen: jobb klikk) egy épületen a térképen, és ott elfoglalhatod.');
}
function cancelShelterClaim() { shelterClaimMode = false; shelterClaimTarget = null; }

// A map.js hívja: ha épp menedéket választunk, az épület-koppintás ide fut be (true = elkaptuk)
function shelterClaimIntercept(b) {
    if (!shelterClaimMode) return false;
    openShelterClaimFor(b);
    return true;
}

// ---------- Hosszú nyomás egy épületen -> menedék kártya ----------
// A Leaflet a setIcon-nál lecseréli a jelölő elemét, ezért nem az elemre kötünk, hanem a térképre (delegálás).
const shelterPress = { timer: null, x: 0, y: 0, swallowUntil: 0 };
function shelterSwallowClick() { return Date.now() < shelterPress.swallowUntil; }
function buildingFromEl(el) {
    const icon = el && el.closest && el.closest('.leaflet-marker-icon');
    if (!icon || typeof markerById === 'undefined') return null;
    for (const obj of markerById.values()) if (obj.marker && obj.marker.getElement && obj.marker.getElement() === icon) return obj;
    return null;
}
function shelterPressStart(target, x, y) {
    clearTimeout(shelterPress.timer);
    const b = buildingFromEl(target);
    if (!b) return;
    shelterPress.x = x; shelterPress.y = y;
    shelterPress.timer = setTimeout(() => {
        shelterPress.timer = null;
        shelterPress.swallowUntil = Date.now() + 700; // az elengedés utáni "click" ne kutasson át
        if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }
        openShelterClaimFor(b);
    }, 550);
}
function shelterPressMove(x, y) { if (shelterPress.timer && Math.hypot(x - shelterPress.x, y - shelterPress.y) > 10) { clearTimeout(shelterPress.timer); shelterPress.timer = null; } }
function shelterPressEnd() { clearTimeout(shelterPress.timer); shelterPress.timer = null; }
(function bindShelterPress() {
    const el = document.getElementById('map');
    if (!el) return;
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) shelterPressStart(e.target, e.touches[0].clientX, e.touches[0].clientY); else shelterPressEnd(); }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (e.touches[0]) shelterPressMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    el.addEventListener('touchend', shelterPressEnd, { passive: true });
    el.addEventListener('touchcancel', shelterPressEnd, { passive: true });
    el.addEventListener('mousedown', (e) => { if (e.button === 0) shelterPressStart(e.target, e.clientX, e.clientY); });
    el.addEventListener('mousemove', (e) => shelterPressMove(e.clientX, e.clientY));
    el.addEventListener('mouseup', shelterPressEnd);
    el.addEventListener('contextmenu', (e) => { // gépen jobb klikk, telefonon a hosszú nyomás menüje helyett
        const b = buildingFromEl(e.target);
        if (!b) return;
        e.preventDefault();
        if (shelterPress.swallowUntil > Date.now()) return; // a hosszú nyomás már megnyitotta
        shelterPressEnd();
        shelterPress.swallowUntil = Date.now() + 400;
        openShelterClaimFor(b);
    });
})();

// A kártya: az épület, a távolság, a csomag, és mit kapsz
function openShelterClaimFor(b) {
    const sh = myShelter();
    if (sh && sh.buildingId === b.id) { cancelShelterClaim(); openShelterModal(); return; } // ez már a tiéd
    shelterClaimTarget = b;
    const S = SurvivalShelter, kit = itemDatabase[S.CLAIM_ITEM];
    const t = (window.SurvivalBuildings && SurvivalBuildings.BUILDING_TYPES && SurvivalBuildings.BUILDING_TYPES[b.type]) || {};
    let dist = null;
    if (typeof playerMarker !== 'undefined' && playerMarker) { const ll = playerMarker.getLatLng(); dist = Math.round(SurvivalBuildings.distanceToBuilding({ lat: ll.lat, lng: ll.lng }, b)); }
    const near = dist !== null && dist <= S.RANGE_METERS;
    const kits = invCountClient(S.CLAIM_ITEM);
    const cooldownUntil = sh ? (sh.claimedAt || 0) + S.MOVE_COOLDOWN_DAYS * 86400000 : 0;
    const coolLeft = cooldownUntil - Date.now();
    const row = (ok, txt) => `<div class="sg-shc-req ${ok ? 'ok' : 'no'}"><i>${ok ? '✔' : '✕'}</i><span>${txt}</span></div>`;
    const kitImg = kit && kit.img ? `<img src="/images/items/${kit.img}.webp" alt="">` : '🏚';
    document.getElementById('shelter-claim-body').innerHTML = `
        <div class="sg-shc-head" style="--bc:${t.color || '#d9c58a'}">
            <div class="sg-shc-ic">${t.icon || '🏠'}</div>
            <div><b>${escapeAttr(b.name || 'Épület')}</b><small>${escapeAttr(b.type || '')}</small></div>
        </div>
        <div class="sg-shc-title">${sh ? 'KÖLTÖZÉS IDE?' : 'LEGYEN EZ A MENEDÉKED?'}</div>
        <div class="sg-shc-perks">
            <div><span>📦</span><b>Raktár</b><small>${S.STASH_SLOTS[0]} hely, halál után is megmarad</small></div>
            <div><span>🛏</span><b>Fekhely</b><small>${S.BED_REST_MULTIPLIER}× gyorsabb pihenés</small></div>
            <div><span>🔥</span><b>Tűzhely</b><small>főzés gyufa nélkül</small></div>
            <div><span>🧱</span><b>Falak</b><small>fa, majd fém védelem</small></div>
        </div>
        ${row(near, dist === null ? 'Várd meg a GPS-t' : near ? `Itt vagy (${dist} m)` : `Túl messze: ${dist} m (legfeljebb ${S.RANGE_METERS} m)`)}
        ${row(kits > 0, `<span class="sg-shc-kit">${kitImg}</span>${escapeAttr(kit ? kit.name : 'Menedékalapító Csomag')}: ${kits} db ${kits > 0 ? '(1 elfogy)' : '– barkácsolható: Barkács → Menedék'}`)}
        ${sh ? row(coolLeft <= 0, coolLeft <= 0 ? 'Költözhetsz: a raktár és az építmények veled jönnek' : `Költözni ${Math.ceil(coolLeft / 86400000)} nap múlva lehet`) : ''}
        <p class="sg-sh-dim" style="margin-top:6px">A menedékedet a térképen mindenki látja, a neveddel együtt.</p>`;
    const ok = near && kits > 0 && (!sh || coolLeft <= 0);
    const yes = document.getElementById('shelter-claim-yes');
    yes.disabled = !ok;
    yes.textContent = ok ? (sh ? 'IDE KÖLTÖZÖM' : 'IGEN, EZ LESZ') : 'MÉG NEM LEHET';
    document.getElementById('shelter-claim-craft').classList.toggle('hidden', kits > 0);
    document.getElementById('shelter-claim-modal').classList.remove('hidden');
}
function confirmShelterClaim() {
    document.getElementById('shelter-claim-modal').classList.add('hidden');
    if (shelterClaimTarget) socket.emit('shelter_claim', { buildingId: shelterClaimTarget.id });
    cancelShelterClaim();
}
function abortShelterClaim() {
    document.getElementById('shelter-claim-modal').classList.add('hidden');
    cancelShelterClaim();
}
function shelterClaimToCraft() {
    abortShelterClaim();
    closeShelterModal();
    const b = document.getElementById('btn-open-crafting');
    if (b) b.click();
}

// ---------- A menedék ablaka ----------
function openShelterModal(tab) {
    if (tab) shelterTab = tab;
    document.getElementById('shelter-modal').classList.remove('hidden');
    renderShelterModal();
    clearInterval(shelterTimer);
    shelterTimer = setInterval(() => {
        const modal = document.getElementById('shelter-modal');
        if (!modal || modal.classList.contains('hidden')) { clearInterval(shelterTimer); return; }
        const sh = myShelter();
        if (sh && (sh.build || (player.shelter && player.shelter.build))) renderShelterModal();
    }, 1000);
}
function closeShelterModal() {
    const modal = document.getElementById('shelter-modal');
    if (modal) modal.classList.add('hidden');
    clearInterval(shelterTimer);
}
function setShelterTab(tab) { shelterTab = tab; renderShelterModal(); }

function shelterCostHtml(req, sh) {
    return Object.entries(req || {}).map(([key, need]) => {
        const item = itemDatabase[key] || { name: key };
        const have = invCountClient(key) + stashCountClient(sh, key);
        return `<span class="sg-sh-cost${have < need ? ' miss' : ''}" title="${escapeAttr(item.name)}">${tileIconHtml(item)}<b>${Math.min(have, need)}/${need}</b></span>`;
    }).join('');
}

// Egy építmény kártyája: név, szint-pöttyök, a következő szint ára és gombja (vagy a visszaszámlálás)
function shelterStructureCard(key, sh, near) {
    const def = SurvivalShelter.STRUCTURES[key];
    const lvl = SurvivalShelter.level(sh, key);
    const max = SurvivalShelter.maxLevel(key);
    const cur = def.levels[lvl];
    const next = lvl < max ? def.levels[lvl + 1] : null;
    const building = sh.build && sh.build.key === key;
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const icon = (next && next.img) || (cur && cur.img);
    const iconHtml = icon ? `<img src="/images/items/${icon}.webp" alt="">` : `<span>${def.icon}</span>`;
    let action = '';
    if (building) {
        action = `<span class="sg-sh-btn time">${fmtDuration(sh.build.until - shelterNow())}</span>`;
    } else if (next) {
        const blocker = SurvivalShelter.buildBlocker(sh, key, shelterNow());
        const missing = Object.entries(next.req || {}).some(([k, n]) => invCountClient(k) + stashCountClient(sh, k) < n);
        const disabled = !near || blocker || missing;
        action = `<button class="sg-sh-btn${disabled ? ' dim' : ''}" ${disabled ? 'disabled' : ''} onclick="buildShelter('${key}')">${lvl === 0 ? 'ÉPÍT' : 'FEJLESZT'}</button>`;
    } else {
        action = `<span class="sg-sh-btn done">KÉSZ</span>`;
    }
    const title = lvl > 0 ? cur.name : def.name;
    const nextInfo = next
        ? `<div class="sg-sh-next">${building ? 'Épül' : 'Következő'}: <b>${escapeAttr(next.name)}</b> · ${escapeAttr(next.desc || '')} · ${fmtMinutes(next.minutes)}${next.hp ? ` · +${next.hp} pont` : ''}</div>
           ${building ? '' : `<div class="sg-sh-costs">${shelterCostHtml(next.req, sh)}</div>`}
           ${!building && SurvivalShelter.buildBlocker(sh, key, shelterNow()) && !(sh.build && sh.build.until > shelterNow()) ? `<div class="sg-sh-warn">${escapeAttr(SurvivalShelter.buildBlocker(sh, key, shelterNow()))}</div>` : ''}`
        : `<div class="sg-sh-next">${escapeAttr(cur.desc || 'Elkészült.')}</div>`;
    return `<div class="sg-sh-card"><div class="sg-sh-ic">${iconHtml}</div><div class="sg-sh-main"><div class="sg-sh-name">${escapeAttr(title.toUpperCase())}</div>
        <div class="sg-sh-pips">${pips}</div>${nextInfo}</div><div class="sg-sh-act">${action}</div></div>`;
}

function renderShelterModal() {
    const body = document.getElementById('shelter-body');
    if (!body) return;
    const sh = myShelter();
    const sub = document.getElementById('shelter-sub');
    const tabs = document.getElementById('shelter-tabs');
    if (!sh) {
        sub.textContent = 'Még nincs menedéked';
        tabs.classList.add('hidden');
        const kits = invCountClient(SurvivalShelter.CLAIM_ITEM);
        body.innerHTML = `
            <div class="sg-sh-empty">
                <div class="sg-sh-hero">🏚</div>
                <p class="sg-sh-lead">Tegyél egy valódi épületet a saját menedékeddé.</p>
                <div class="sg-sh-steps">
                    <div class="${kits ? 'done' : ''}"><i>1</i><span><b>Menedékalapító Csomag</b>${kits ? `nálad: ${kits} db ✔` : 'Barkács → Menedék (deszka, szög, tolózár)'}</span></div>
                    <div><i>2</i><span><b>Menj egy épülethez</b>legfeljebb ${SurvivalShelter.RANGE_METERS} m-re</span></div>
                    <div><i>3</i><span><b>Tartsd rajta hosszan az ujjad</b>a térképen (gépen: jobb klikk)</span></div>
                </div>
                <div class="sg-shc-perks">
                    <div><span>📦</span><b>Raktár</b><small>${SurvivalShelter.STASH_SLOTS[0]} hely, halál után is megmarad</small></div>
                    <div><span>🛏</span><b>Fekhely</b><small>${SurvivalShelter.BED_REST_MULTIPLIER}× gyorsabb pihenés</small></div>
                    <div><span>🔥</span><b>Tűzhely</b><small>főzés gyufa nélkül</small></div>
                    <div><span>🧱</span><b>Falak</b><small>fa, majd fém védelem</small></div>
                </div>
                ${kits ? '<button class="sg-sh-big" onclick="startShelterClaim()">RENDBEN, KIVÁLASZTOM A TÉRKÉPEN</button>' : '<button class="sg-sh-big" onclick="shelterClaimToCraft()">CSOMAG BARKÁCSOLÁSA</button>'}
                <p class="sg-sh-dim" style="margin-top:8px;text-align:center">A menedéket mindenki látja a térképen. Költözni hetente egyszer lehet.</p>
            </div>`;
        return;
    }
    tabs.classList.remove('hidden');
    tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === shelterTab));
    const wallName = SurvivalShelter.STRUCTURES.wall.levels[SurvivalShelter.level(sh, 'wall')].name;
    sub.innerHTML = `${escapeAttr(sh.name)} · <b>${escapeAttr(wallName.toUpperCase())}</b> · ${SurvivalShelter.structureHp(sh)} PONT`;
    const dist = shelterDistanceToMe(sh);
    const near = dist !== null && dist <= SurvivalShelter.RANGE_METERS;
    const farHtml = near ? '' : `<div class="sg-sh-far">📍 ${dist === null ? 'Várd meg a GPS-t.' : `${Math.round(dist)} m-re vagy.`} A raktárt és az építést csak a menedékednél (45 m-en belül) használhatod.</div>`;

    let html = farHtml;
    if (shelterTab === 'stash') {
        const cap = SurvivalShelter.stashSlots(sh);
        // a teli helyek, kiegészítve egy teljes sorra üresekkel (a 70-120 üres hely nem fér ki egyben)
        const shown = Math.min(cap, Math.max(16, Math.ceil((sh.stash.length + 1) / 8) * 8));
        let grid = '';
        for (let i = 0; i < shown; i++) {
            const slot = sh.stash[i];
            if (!slot) { grid += '<div class="inv-tile empty"></div>'; continue; }
            const item = itemDatabase[slot.key] || { name: slot.key, icon: '📦' };
            grid += `<button class="inv-tile" data-src="stash" data-index="${i}" ${near ? `onclick="shelterTileClick('stash', ${i})"` : 'disabled'} title="${escapeAttr(item.name)} – kivétel">${tileIconHtml(item)}${slot.count > 1 ? `<span class="tile-count">×${slot.count}</span>` : ''}</button>`;
        }
        let bag = '';
        const inv = player.inventory || [];
        for (let i = 0; i < Math.max(player.maxInv || 10, inv.length); i++) {
            const slot = inv[i];
            if (!slot) { bag += '<div class="inv-tile empty"></div>'; continue; }
            const item = itemDatabase[slot.key] || { name: slot.key, icon: '📦' };
            bag += `<button class="inv-tile" data-src="bag" data-index="${i}" ${near ? `onclick="shelterTileClick('bag', ${i})"` : 'disabled'} title="${escapeAttr(item.name)} – raktárba">${tileIconHtml(item)}${slot.count > 1 ? `<span class="tile-count">×${slot.count}</span>` : ''}</button>`;
        }
        html += `
            <div class="sg-sh-sect"><span>RAKTÁR · halál után is megmarad</span><span class="mono">${sh.stash.length} / ${cap}</span></div>
            <div class="sg-sh-hint">Koppints egy tárgyra a kivételhez, vagy húzd le a hátizsákba.</div>
            <div class="sg-sh-grid" data-drop="stash">${grid}</div>
            <div class="sg-sh-free">+ még ${cap - sh.stash.length} szabad hely</div>
            ${shelterStructureCard('stash', sh, near)}
            <div class="sg-sh-sect"><span>HÁTIZSÁK</span><span class="mono">${inv.length} / ${player.maxInv || 10}</span></div>
            <div class="sg-sh-hint">Koppints egy tárgyra, vagy húzd fel a raktárba.</div>
            <div class="sg-sh-grid" data-drop="bag">${bag}</div>`;
    } else if (shelterTab === 'stations') {
        html += `<div class="sg-sh-sect"><span>ÁLLOMÁSOK</span><span></span></div>
            ${shelterStructureCard('bed', sh, near)}${shelterStructureCard('hearth', sh, near)}
            <div class="sg-sh-hint">Az alapanyag a hátizsákodból fogy, ha ott nincs elég, a raktárból. Egyszerre egy építkezés futhat, valódi időben.</div>`;
    } else {
        html += `<div class="sg-sh-sect"><span>VÉDELEM</span><span class="mono">${SurvivalShelter.structureHp(sh)} PONT</span></div>
            ${shelterStructureCard('wall', sh, near)}${shelterStructureCard('barricade', sh, near)}
            <div class="sg-sh-note"><b>RAID-IDŐ:</b> a PvP frissítéssel szombaton és vasárnap 11:00–18:00 között lehet majd betörni a menedékekbe. A szerkezeti pontot (fal + barikád) kell lebontani hozzá.</div>`;
    }
    html += `<button class="sg-sh-link" onclick="startShelterClaim()">Költözés másik épületbe</button>`;
    body.innerHTML = html;
}

// ---------- Műveletek (a szerver dönt) ----------
function shelterDeposit(index) { socket.emit('shelter_deposit', { index }); }
function shelterTileClick(src, index) {
    if (window.SurvivalDrag && SurvivalDrag.justDropped()) return; // a húzás végét ne vegye koppintásnak
    if (src === 'stash') shelterWithdraw(index); else shelterDeposit(index);
}

// ---------- Húzás (egérrel és ujjal) a raktár és a hátizsák között ----------
// A közös húzás-kezelő (js/drag.js) intézi; telefonon rövid nyomva tartás után indul.
if (window.SurvivalDrag) SurvivalDrag.bind({
    tiles: '#shelter-body .inv-tile[data-src]',
    zones: '#shelter-body [data-drop]',
    scrollers: () => [document.getElementById('shelter-body')],
    onDrop: (tile, zone) => {
        const src = tile.dataset.src, index = Number(tile.dataset.index);
        if (!zone.dataset.drop || zone.dataset.drop === src) return;
        if (src === 'stash') shelterWithdraw(index); else shelterDeposit(index);
    }
});
function shelterWithdraw(index) { socket.emit('shelter_withdraw', { index }); }
function buildShelter(key) { socket.emit('shelter_build', { key }); }

socket.on('shelter_result', (data) => {
    if (data.message) logMessage((data.success ? '🏚 ' : '') + data.message);
    if (!data.success) playSound('hit');
    renderShelterModal();
    requestShelters();
});
socket.on('shelters_list', (data) => {
    shelterList = Array.isArray(data && data.shelters) ? data.shelters : [];
    renderShelterMarkers(data && data.me);
});

// A közeli menedékek frissítése: amint megvan a pozíció, aztán percenként
setInterval(requestShelters, 60000);
let shelterFirstFetch = setInterval(() => {
    if (typeof playerMarker !== 'undefined' && playerMarker && socket.connected) { requestShelters(); clearInterval(shelterFirstFetch); }
}, 2000);
