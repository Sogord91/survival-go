// hunting-ui.js – VADÁSZAT ÉS HORGÁSZAT a kliensen (v0.1.42)
// Állatok a térképen (csak neked), koppintásra becserkészés; horgászhely jelölő a legközelebbi víznél,
// a vízparton "Horgászat" gomb, kivetés után várakozás, kapáskor "Húzd ki!".
let huntAnimals = [];
const huntMarkers = new Map();
let fishSpot = null, fishSpotMarker = null, fishState = null, fishTimer = null;

function huntHasRod() { return (player.inventory || []).some(s => s.key === 'fishing_rod'); }
function huntTick() {
    if (typeof socket === 'undefined' || !socket || !player || player.dead) return;
    socket.emit('animals_near');
    socket.emit('fish_check');
}
setTimeout(() => { huntTick(); setInterval(huntTick, 40000); }, 6000);

function animalIcon(kind, gathered) {
    const a = window.SurvivalHunting && SurvivalHunting.ANIMALS[kind];
    const emoji = a ? a.avatar : '🏹';
    const cls = a && a.domestic ? ' domestic' : '';
    const img = `<img class="sg-hunt-img" src="/images/enemies/${kind}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'sg-hunt-emo',textContent:'${emoji}'}))">`;
    return L.divIcon({ className: 'custom-icon', html: `<div class="sg-hunt-mk${cls}${gathered ? ' used' : ''}">${img}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
}
// ---------- EGYSZERI TIPPEK (első állat, első horgászhely) ----------
function huntHint(key, title, lines) {
    try { if (localStorage.getItem('sg_hint_' + key)) return; localStorage.setItem('sg_hint_' + key, '1'); } catch (e) { return; }
    const m = document.createElement('div');
    m.className = 'fixed inset-0 modal flex items-center justify-center p-4'; m.style.zIndex = '3500';
    m.innerHTML = `<div class="hud-panel w-full max-w-sm rounded-2xl p-5"><h2 class="text-sm font-bold tracking-wider mb-3">${title}</h2>
        ${lines.map(l => `<p class="text-[12px] leading-relaxed mb-2" style="color:#e6e0cb">${l}</p>`).join('')}
        <button class="w-full bg-emerald-700 py-2.5 rounded-xl text-xs font-bold mt-2">Értem</button></div>`;
    m.querySelector('button').onclick = () => m.remove();
    document.body.appendChild(m);
}
socket.on('skin_result', (d) => {
    if (!d || !d.message) return;
    logMessage((d.success ? '🔪 ' : '⚠️ ') + d.message);
    if (typeof showToast === 'function') showToast(d.message);
});

socket.on('animals_data', (d) => {
    huntAnimals = (d && d.animals) || [];
    if (huntAnimals.length) huntHint('hunt', 'VADÁSZAT', [
        'Állatok bukkantak fel a közeledben a térképen!',
        'Koppints rá, ha elég közel vagy: közelharci fegyverrel 25 m, íjjal, számszeríjjal vagy puskával 70 m.',
        'Ha nem szalad el, harc jön. Győzelem után a tetem a hátizsákba kerül: koppints rá a Készletben → Megnyúzom (kés kell). Hús, bunda, csont, néha trófea.',
        'A nyers húst tűzön süsd meg (Barkács → Vadászat).']);
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const alive = new Set();
    huntAnimals.forEach(a => {
        alive.add(a.id);
        let m = huntMarkers.get(a.id);
        if (!m) {
            m = L.marker([a.lat, a.lng], { icon: animalIcon(a.kind, a.gathered), zIndexOffset: 450 }).addTo(map);
            m.on('click', () => tapAnimal(a.id));
            huntMarkers.set(a.id, m);
        } else m.setIcon(animalIcon(a.kind, a.gathered));
    });
    huntMarkers.forEach((m, id) => { if (!alive.has(id)) { map.removeLayer(m); huntMarkers.delete(id); } });
});
function tapAnimal(id) {
    const a = huntAnimals.find(x => x.id === id);
    if (!a) return;
    const cfg = SurvivalHunting.ANIMALS[a.kind] || { name: 'Állat' };
    const dist = typeof playerMarker !== 'undefined' && playerMarker ? Math.round(SurvivalBuildings.haversine(playerMarker.getLatLng().lat, playerMarker.getLatLng().lng, a.lat, a.lng)) : null;
    const w = itemDatabase[player.equipment && player.equipment.weapon] || itemDatabase[player.equipment && player.equipment.secondary];
    const ranged = SurvivalHunting.isRanged(itemDatabase[player.equipment && player.equipment.weapon]) || SurvivalHunting.isRanged(itemDatabase[player.equipment && player.equipment.secondary]);
    const range = ranged ? SurvivalHunting.RANGE_RANGED : SurvivalHunting.RANGE_MELEE;
    if (dist !== null && dist > range + 10) {
        logMessage(`🏹 ${cfg.name}: ${dist} m-re van. Cserkészd be ${range} m-re!${ranged ? '' : ' (Íjjal, számszeríjjal vagy puskával 70 m-ről is mehet.)'}`);
        if (typeof showToast === 'function') showToast(`${cfg.name}: menj ${range} m-en belülre (most ${dist} m)`);
        return;
    }
    if (cfg.domestic) return animalChoice(a, cfg);
    socket.emit('hunt_start', { id });
}
// háztáji állat: körmenü, mint a játékosoknál – fejés / tojás / toll, vagy levágás (v0.1.44.1)
function animalChoice(a, cfg) {
    const mk = huntMarkers.get(a.id), el = mk && mk.getElement && mk.getElement(), rc = el ? el.getBoundingClientRect() : null;
    const x = rc ? rc.left + rc.width / 2 : innerWidth / 2, y = rc ? rc.top + rc.height / 2 : innerHeight / 2;
    const gIcon = cfg.gather ? ({ fresh_milk: '🫙', eggs: '🐤', feather: '🪶' }[cfg.gather.item] || '🌿') : '🌿';
    const items = [];
    if (cfg.gather) items.push(a.gathered ? { ic: gIcon, t: 'Már megvolt', off: true } : { ic: gIcon, t: cfg.gather.verb, js: `socket.emit('animal_gather',{id:'${a.id}'})` });
    items.push({ ic: '🔪', t: 'Levágom', js: `socket.emit('hunt_start',{id:'${a.id}'})`, danger: true });
    items.push({ ic: '❌', t: 'Békén hagyom', js: '' });
    if (typeof radialMenu === 'function') return radialMenu({ img: `/images/enemies/${a.kind}.webp`, title: cfg.name, sub: 'Háztáji állat' }, items, x, y);
    socket.emit('hunt_start', { id: a.id });
}
socket.on('gather_result', (d) => {
    if (!d || !d.message) return;
    logMessage((d.success ? '🌿 ' : '⚠️ ') + d.message);
    if (typeof showToast === 'function') showToast(d.message);
    if (d.success && d.payload && d.payload.id) { const a = huntAnimals.find(x => x.id === d.payload.id); if (a) { a.gathered = true; const mk = huntMarkers.get(a.id); if (mk) mk.setIcon(animalIcon(a.kind, true)); } }
});
socket.on('hunt_result', (d) => {
    if (!d) return;
    if (d.gone || (d.payload && d.payload.id)) {
        const id = d.gone || d.payload.id;
        const m = huntMarkers.get(id); if (m && map) { map.removeLayer(m); huntMarkers.delete(id); }
        huntAnimals = huntAnimals.filter(a => a.id !== id);
    }
    if (d.message) { logMessage((d.success ? '🏹 ' : '⚠️ ') + d.message); if (!d.success && typeof showToast === 'function') showToast(d.message); }
});

// ---------- HORGÁSZAT ----------
socket.on('fish_spot', (d) => {
    fishSpot = d && !d.none ? d : null;
    if (fishSpot) huntHint('fish', 'HORGÁSZAT', [
        'A térképen a kék horog a legközelebbi vízpartot jelzi.',
        'Horgászbot kell (barkácsolható: bot, damil, horog) és csali: giliszta, kenyér, tortilla vagy nyers vadhús.',
        'A vízparton megjelenik a HORGÁSZ gomb. Kivetés után várd ki a kapást: ha túl korán húzod ki, elúszik a hal. Kapáskor rezeg a telefon, 2 perced van kihúzni.']);
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    if (!fishSpot) { if (fishSpotMarker) { map.removeLayer(fishSpotMarker); fishSpotMarker = null; } fishButton(); return; }
    const html = `<div class="sg-fish-mk" data-noicon>${typeof sgEmojiIcon === 'function' ? sgEmojiIcon('🪝', 'sg-fish-img') : ''}</div>`;
    const icon = L.divIcon({ className: 'custom-icon', html, iconSize: [30, 30], iconAnchor: [15, 15] });
    if (!fishSpotMarker) { fishSpotMarker = L.marker([fishSpot.lat, fishSpot.lng], { icon, zIndexOffset: 300 }).addTo(map); fishSpotMarker.on('click', tapFishSpot); }
    else fishSpotMarker.setLatLng([fishSpot.lat, fishSpot.lng]);
    fishButton();
});
function tapFishSpot() {
    if (!fishSpot) return;
    if (!huntHasRod()) { logMessage('🪝 Horgászhely. Horgászbot és csali kell (giliszta, kenyér, tortilla vagy nyers vadhús).'); return; }
    if (!fishSpot.near) { logMessage(`🪝 Horgászhely: ${fishSpot.dist} m. Menj a vízpartra!`); return; }
    fishCast();
}
function fishButton() {
    let b = document.getElementById('btn-fish');
    const show = fishSpot && fishSpot.near && huntHasRod() && !fishState;
    if (!b) {
        b = document.createElement('button');
        b.id = 'btn-fish'; b.className = 'sg-fish-btn hidden';
        b.innerHTML = `${typeof sgEmojiIcon === 'function' ? sgEmojiIcon('🪝', 'sg-fish-bimg') : ''}<span>HORGÁSZ</span>`;
        b.setAttribute('data-noicon', '');
        b.onclick = fishCast;
        document.body.appendChild(b);
    }
    b.classList.toggle('hidden', !show);
}
function fishCast() { socket.emit('fish_start'); }
function fishPanel() {
    let p = document.getElementById('fish-panel');
    if (!p) {
        p = document.createElement('div');
        p.id = 'fish-panel'; p.className = 'sg-fish-panel hud-panel';
        p.innerHTML = `<div class="sg-fish-title">Horgászat</div><div id="fish-text" class="sg-fish-text"></div>
            <button id="fish-pull" class="w-full bg-amber-800 py-2.5 rounded-xl text-xs font-bold" onclick="socket.emit('fish_pull')">Kihúzom</button>`;
        document.body.appendChild(p);
    }
    return p;
}
function fishRender() {
    const p = fishPanel();
    if (!fishState) { p.classList.add('hidden'); clearInterval(fishTimer); fishTimer = null; fishButton(); return; }
    p.classList.remove('hidden');
    const now = Date.now(), text = document.getElementById('fish-text'), btn = document.getElementById('fish-pull');
    if (now < fishState.until) {
        text.textContent = 'Várd a kapást... Ha túl korán húzod ki, elúszik a hal.';
        btn.textContent = 'Kihúzom (még korai)'; p.classList.remove('bite');
    } else if (now < fishState.until + fishState.lateS * 1000) {
        const left = Math.ceil((fishState.until + fishState.lateS * 1000 - now) / 1000);
        text.textContent = `KAPÁS! Húzd ki! (${left} mp)`;
        btn.textContent = 'HÚZD KI!'; if (!p.classList.contains('bite')) { p.classList.add('bite'); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { } if (typeof playSound === 'function') playSound('hit'); }
    } else { text.textContent = 'Túl sokáig vártál, a hal leakadt.'; btn.textContent = 'Bevontatom'; }
}
socket.on('fish_result', (d) => {
    if (!d) return;
    if (d.message) { logMessage((d.success ? '🪝 ' : '⚠️ ') + d.message); if (typeof showToast === 'function' && (!d.success || (d.payload && d.payload.done))) showToast(d.message); }
    const pl = d.payload || {};
    if (d.success && pl.until) { fishState = { until: pl.until, lateS: pl.lateS || 120 }; clearInterval(fishTimer); fishTimer = setInterval(fishRender, 500); fishRender(); fishButton(); }
    if (pl.done) { fishState = null; fishRender(); }
});
