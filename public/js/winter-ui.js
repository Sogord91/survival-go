// winter-ui.js – FAGYOS CSEND a játékban: karácsonyfák a térképen, díszek felakasztása, szerencsekerék (v0.1.19)
// Minden döntés a szerveré; a kliens kér és megjelenít.
let winterActive = false, winterTestMode = false;
let winterTrees = [];                  // a környék fái (szervertől)
const winterTreeMarkers = new Map();   // fa azonosító -> Leaflet jelölő
let winterTree = null;                 // a megnyitott fa
let winterTimer = null;
let wheelPendingResult = null;

socket.on('winter_config', (d) => {
    winterActive = !!(d && d.active); winterTestMode = !!(d && d.test);
    clearInterval(winterTimer);
    if (winterActive) { setTimeout(() => socket.emit('trees_near'), 1500); winterTimer = setInterval(() => socket.emit('trees_near'), 120000); }
    if (typeof updateQuestBadge === 'function') updateQuestBadge();
});

const TREE_PLACE = { city: 'város', town: 'város', village: 'falu', suburb: 'városrész' };
const TREE_STAGE = ['Üres fa', 'Félig díszített', 'Teljesen feldíszítve'];
function treeImg(stage, cls) {
    return `<img class="${cls || ''}" src="/images/winter/tree_${stage}.webp" alt="" onerror="this.outerHTML='<span class=&quot;${cls || ''} sg-tree-emoji st${stage}&quot;>🎄</span>'">`;
}

// ---------- jelölők a térképen ----------
socket.on('trees_data', (d) => {
    winterTrees = (d && d.trees) || [];
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const alive = new Set();
    winterTrees.forEach(t => {
        alive.add(t.id);
        const html = `<div class="sg-tree-mk st${t.stage}">${treeImg(t.stage, 'sg-tree-mk-img')}<span>${escapeAttr(t.name)}</span></div>`;
        let m = winterTreeMarkers.get(t.id);
        if (!m) {
            m = L.marker([t.lat, t.lng], { icon: L.divIcon({ className: 'sg-tree-icon', html, iconSize: [64, 74], iconAnchor: [32, 66] }), zIndexOffset: 400 }).addTo(map);
            m.on('click', () => openTree(t.id));
            m._sgStage = t.stage;
            winterTreeMarkers.set(t.id, m);
        } else if (m._sgStage !== t.stage) {
            m.setIcon(L.divIcon({ className: 'sg-tree-icon', html, iconSize: [64, 74], iconAnchor: [32, 66] })); m._sgStage = t.stage;
        }
    });
    winterTreeMarkers.forEach((m, id) => { if (!alive.has(id)) { map.removeLayer(m); winterTreeMarkers.delete(id); } });
});

// ---------- a fa ablaka ----------
function openTree(id) {
    winterTree = winterTrees.find(t => t.id === id) || { id, name: 'Karácsonyfa', stage: 0, points: 0, top: [] };
    document.getElementById('tree-modal').classList.remove('hidden');
    renderTree();
    socket.emit('tree_info', { treeId: id });
}
function closeTree() { document.getElementById('tree-modal').classList.add('hidden'); winterTree = null; }
socket.on('tree_info', (t) => {
    if (!t) return;
    const i = winterTrees.findIndex(x => x.id === t.id); if (i >= 0) winterTrees[i] = t;
    if (winterTree && winterTree.id === t.id) { winterTree = t; renderTree(); }
});
function treeDistance(t) {
    if (typeof playerMarker === 'undefined' || !playerMarker) return null;
    const ll = playerMarker.getLatLng();
    return Math.round(SurvivalBuildings.distanceToBuilding({ lat: ll.lat, lng: ll.lng }, t));
}
function renderTree() {
    const t = winterTree, body = document.getElementById('tree-body');
    if (!t || !body) return;
    const goal = t.goal, prevGoal = t.stage === 0 ? 0 : (SurvivalWinter.STAGES[t.place] || SurvivalWinter.STAGES.village)[t.stage - 1];
    const pct = goal ? Math.round((t.points - prevGoal) / (goal - prevGoal) * 100) : 100;
    const dist = treeDistance(t), near = dist !== null && dist <= SurvivalWinter.RANGE_METERS + 15;
    const mine = (player.inventory || []).filter(s => itemDatabase[s.key] && itemDatabase[s.key].ornament);
    const orn = mine.map(s => { const it = itemDatabase[s.key]; return `<div class="sg-tr-orn r-${it.ornament.rarity}">
        <span class="sg-tr-ic">${tileIconHtml(it)}<b>×${s.count}</b></span>
        <span class="sg-tr-on"><b>${escapeAttr(it.name)}</b><small>+${it.ornament.points} pont · +1 pörgetés</small></span>
        <button ${near ? '' : 'disabled'} onclick="hangOrnament('${s.key}',1)">+1</button>${s.count > 1 ? `<button ${near ? '' : 'disabled'} onclick="hangOrnament('${s.key}',${s.count})">MIND</button>` : ''}</div>`; }).join('');
    const spin = SurvivalWinter.spinStatus(player.winter, Date.now(), SurvivalWheel.DAILY_MAX);
    body.innerHTML = `
        <div class="sg-tr-hero st${t.stage}">${treeImg(t.stage, 'sg-tr-big')}<div class="sg-tr-snow"></div></div>
        <div class="sg-tr-name">${escapeAttr(t.name)}<small>${TREE_PLACE[t.place] || ''} karácsonyfája</small></div>
        <div class="sg-tr-stage">${TREE_STAGE[t.stage]} · <b>${t.points}</b> pont${goal ? ` / ${goal}` : ''}</div>
        <div class="sg-tr-bar"><i style="width:${Math.max(3, Math.min(100, pct))}%"></i></div>
        <div class="sg-tr-dist ${near ? 'ok' : ''}">${dist === null ? 'Várd meg a GPS-t…' : near ? `✔ Itt vagy a fánál (${dist} m)` : `📍 ${dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m'}-re vagy – a díszeket a fánál (${SurvivalWinter.RANGE_METERS} m-en belül) akaszthatod fel`}</div>
        <div class="sg-tr-h">A DÍSZEID</div>
        ${orn || '<p class="sg-tr-empty">Nincs nálad dísz. Átkutatáskor találhatsz, a Barkács → Karácsony fülön készíthetsz, és az adventi naptárban is akad.</p>'}
        <button class="sg-tr-wheel" onclick="openWheel()">🎡 SZERENCSEKERÉK <span>${spin.available} pörgetés</span></button>
        <div class="sg-tr-h">LEGTÖBBET DÍSZÍTETTÉK</div>
        ${(t.top || []).length ? `<ol class="sg-tr-top">${t.top.map(c => `<li><b>${escapeAttr(c.name)}</b><span>${c.pts} pont</span></li>`).join('')}</ol>` : '<p class="sg-tr-empty">Még senki. Légy te az első!</p>'}
        ${t.mine ? `<p class="sg-tr-empty">A te hozzájárulásod: <b>${t.mine} pont</b></p>` : ''}
        <button class="sg-sh-link" onclick="openTreeTop()">🏆 A legszebb fák az országban</button>`;
}
function hangOrnament(key, count) { if (winterTree) socket.emit('tree_hang', { treeId: winterTree.id, key, count }); }
socket.on('tree_result', (d) => {
    if (d && d.message) logMessage((d.success ? '🎄 ' : '⚠️ ') + d.message);
    if (d && d.success) {
        const hero = document.querySelector('#tree-body .sg-tr-hero');
        if (hero) { hero.classList.remove('hung'); void hero.offsetWidth; hero.classList.add('hung'); }
        if (typeof playSound === 'function') playSound('win');
    }
    setTimeout(renderTree, 0);
});
socket.on('player_state', () => { setTimeout(() => {
    const m = document.getElementById('tree-modal'); if (m && !m.classList.contains('hidden')) renderTree();
    const w = document.getElementById('wheel-modal'); if (w && !w.classList.contains('hidden') && !wheelSpinning && !wheelPendingResult) renderWheelInfo();
}, 0); });

function openTreeTop() { socket.emit('tree_top'); }
socket.on('tree_top', (list) => {
    const body = document.getElementById('tree-body'); if (!body) return;
    body.innerHTML = `<div class="sg-tr-h" style="margin-top:0">🏆 A LEGSZEBB FÁK</div>
        ${(list || []).length ? `<ol class="sg-tr-top big">${list.map(t => `<li><b>${escapeAttr(t.name)}</b><span>${['🌲', '🎄', '✨🎄'][t.stage]} ${t.points} pont · ${t.hung} dísz</span></li>`).join('')}</ol>` : '<p class="sg-tr-empty">Még egyik fát sem díszítették.</p>'}
        <button class="sg-sh-link" onclick="renderTree()">← Vissza a fához</button>`;
});

// ---------- szerencsekerék ----------
function openWheel() {
    document.getElementById('wheel-modal').classList.remove('hidden');
    const wrap = document.getElementById('wheel-wrap');
    if (wrap && !wrap.innerHTML) wrap.innerHTML = wheelSvg();
    renderWheelInfo();
}
function closeWheel() { if (wheelSpinning) return; document.getElementById('wheel-modal').classList.add('hidden'); const r = document.getElementById('wheel-reveal'); if (r) r.remove(); }
function renderWheelInfo() {
    const st = SurvivalWinter.spinStatus(player.winter, Date.now(), SurvivalWheel.DAILY_MAX);
    const info = document.getElementById('wheel-info');
    if (info) info.innerHTML = `<b>${st.available}</b> pörgetésed van · ma ${st.usedToday} / ${SurvivalWheel.DAILY_MAX}<small>${st.free ? 'A mai ingyenes pörgetés megvan! ' : ''}Minden felakasztott dísz +1 pörgetés.</small>`;
    const btn = document.getElementById('wheel-btn');
    if (btn) { btn.disabled = wheelSpinning || st.available <= 0; btn.textContent = st.capReached ? 'MÁRA ENNYI VOLT' : st.available ? 'PÖRGETÉS!' : 'NINCS PÖRGETÉSED'; }
    const odds = document.getElementById('wheel-odds'); if (odds && !odds.innerHTML) odds.innerHTML = wheelOddsHtml();
}
function wheelGo() {
    if (wheelSpinning || wheelPendingResult) return;
    const btn = document.getElementById('wheel-btn'); if (btn) btn.disabled = true;
    const r = document.getElementById('wheel-reveal'); if (r) r.remove();
    wheelPendingResult = { at: Date.now() };
    socket.emit('wheel_spin');
}
socket.on('wheel_result', (d) => {
    if (!d || !d.success) { wheelPendingResult = null; if (d && d.message) logMessage('⚠️ ' + d.message); renderWheelInfo(); return; }
    wheelSpinTo(d.prize, () => { wheelPendingResult = null; wheelReveal(d); renderWheelInfo(); });
});
function wheelReveal(d) {
    const p = SurvivalWheel.BY_KEY[d.prize]; if (!p) return;
    logMessage('🎡 ' + (d.message || p.label));
    const jackpot = p.rare === 'jackpot';
    const box = document.getElementById('wheel-box');
    const art = `<svg viewBox="0 0 80 80" class="sg-wr-art">${wheelPrizeArt(p, 40, 40)}</svg>`;
    box.insertAdjacentHTML('beforeend', `<div id="wheel-reveal" class="sg-adv-reveal ${jackpot ? 'jackpot' : ''}" onclick="this.remove()"><div class="sg-adv-stage">
        <div class="sg-adv-rays on${jackpot || p.rare === 'legendary' ? ' gold' : ''}"></div>
        ${jackpot ? '<div class="sg-wr-jack">JACKPOT!</div>' : ''}
        <div class="sg-wr-pop">${art}</div>
        <div class="sg-adv-rn">${p.rare ? ({ rare: 'RITKA', epic: 'EPIKUS', legendary: 'LEGENDÁS', jackpot: '💎 100 KRISTÁLY' })[p.rare] : 'NYEREMÉNY'}</div>
        <div class="sg-adv-rnames">${escapeAttr(p.label)}${d.dup ? `<br><small>Ez már megvolt – helyette +${d.dup} $</small>` : ''}${d.note ? `<br><small>${escapeAttr(d.note)}</small>` : ''}</div>
        <button class="sg-tu-big" style="margin-top:12px">${jackpot ? 'HIHETETLEN!' : 'SZUPER!'}</button></div></div>`);
    if (typeof playSound === 'function') playSound('win');
    if (navigator.vibrate) { try { navigator.vibrate(jackpot ? [60, 80, 60, 80, 200] : 40); } catch (e) {} }
}

// A Küldetés ablakban kis kártya: kerék és fák (az adventi kártya alatt)
function winterCardHtml() {
    if (!winterActive || !player || !window.SurvivalWinter) return '';
    const st = SurvivalWinter.spinStatus(player.winter, Date.now(), SurvivalWheel.DAILY_MAX);
    return `<button class="sg-adv-card${st.available ? ' hot' : ''}" onclick="openWheelFromQuest()"><span class="sg-adv-card-ic">🎡</span>
        <span><b>FAGYOS CSEND · SZERENCSEKERÉK</b><small>${st.available ? `${st.available} pörgetésed van!` : 'Akassz díszt egy karácsonyfára a térképen!'}</small></span><span class="sg-adv-card-go">›</span></button>`;
}
function openWheelFromQuest() { document.getElementById('quest-modal').classList.add('hidden'); openWheel(); }
function winterHasSpin() {
    return winterActive && player && player.winter !== undefined && SurvivalWinter.spinStatus(player.winter, Date.now(), SurvivalWheel.DAILY_MAX).available > 0;
}

// ---------- HÉTVÉGI AJÁNDÉKVADÁSZAT (v0.1.19) ----------
let giftList = [];
const giftMarkers = new Map();
let giftTimer = null;
function giftsActiveNow() { return window.SurvivalGifts && SurvivalGifts.active(Date.now(), winterTestMode); }
function giftsTick() {
    const on = giftsActiveNow();
    const chip = document.getElementById('gift-chip');
    if (chip) chip.classList.toggle('hidden', !on);
    if (on) socket.emit('gifts_near');
    else if (giftMarkers.size) { giftMarkers.forEach(m => map && map.removeLayer(m)); giftMarkers.clear(); giftList = []; }
}
setTimeout(() => { giftsTick(); giftTimer = setInterval(giftsTick, 45000); }, 4000);
socket.on('winter_config', () => setTimeout(giftsTick, 800));
function giftImg(kind, cls) {
    return `<img class="${cls}" src="/images/winter/gift_${kind}.webp" alt="" onerror="this.outerHTML='<span class=&quot;${cls} sg-gift-emoji ${kind}&quot;>${kind === 'gold' ? '🏆' : '🎁'}</span>'">`;
}
socket.on('gifts_data', (d) => {
    giftList = (d && d.gifts) || [];
    const chipN = document.getElementById('gift-chip-n');
    if (chipN) chipN.textContent = String(giftList.filter(g => !g.opened).length);
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const alive = new Set();
    giftList.forEach(g => {
        alive.add(g.id);
        const html = `<div class="sg-gift-mk ${g.kind}${g.opened ? ' opened' : ''}">${giftImg(g.kind, 'sg-gift-img')}</div>`;
        let m = giftMarkers.get(g.id);
        if (!m) {
            m = L.marker([g.lat, g.lng], { icon: L.divIcon({ className: 'sg-tree-icon', html, iconSize: [44, 44], iconAnchor: [22, 40] }), zIndexOffset: 500 }).addTo(map);
            m.on('click', () => tapGift(g.id));
            giftMarkers.set(g.id, m);
        } else m.setIcon(L.divIcon({ className: 'sg-tree-icon', html, iconSize: [44, 44], iconAnchor: [22, 40] }));
    });
    giftMarkers.forEach((m, id) => { if (!alive.has(id)) { map.removeLayer(m); giftMarkers.delete(id); } });
});
function tapGift(id) {
    const g = giftList.find(x => x.id === id);
    if (!g) return;
    if (g.opened) { logMessage('🎁 Ezt a csomagot már kinyitottad.'); return; }
    const dist = typeof playerMarker !== 'undefined' && playerMarker ? Math.round(SurvivalBuildings.distanceToBuilding(playerMarker.getLatLng(), g)) : null;
    if (dist !== null && dist > SurvivalGifts.GIFT_RANGE + 10) { logMessage(`🎁 Sétálj oda a csomaghoz! (${dist} m – menj ${SurvivalGifts.GIFT_RANGE} m-en belülre)`); return; }
    openGiftBox(g.kind);
    socket.emit('gift_open', { id });
}
let giftPending = null;
function openGiftBox(kind) {
    giftPending = { t0: Date.now(), kind };
    const m = document.getElementById('gift-modal');
    document.getElementById('gift-body').innerHTML = `<div class="sg-adv-stage"><div class="sg-adv-rays"></div><div class="sg-gift-big shake">${giftImg(kind, 'sg-gift-bigimg')}</div>
        <div class="sg-adv-rn">${kind === 'gold' ? 'ARANY LÁDA!' : 'AJÁNDÉKCSOMAG'}</div></div>`;
    m.classList.remove('hidden');
    if (navigator.vibrate) { try { navigator.vibrate([20, 60, 20]); } catch (e) {} }
}
function closeGift() { document.getElementById('gift-modal').classList.add('hidden'); }
socket.on('gift_result', (d) => {
    if (d && d.message) logMessage((d.success ? '' : '⚠️ ') + d.message);
    const pend = giftPending; giftPending = null;
    if (!d || !d.success) {
        closeGift();
        if (d && d.gone) { const m = giftMarkers.get(d.id); if (m) { map.removeLayer(m); giftMarkers.delete(d.id); } }
        return;
    }
    const gg = giftList.find(x => x.id === d.id); if (gg) gg.opened = true;
    const wait = pend ? Math.max(0, 900 - (Date.now() - pend.t0)) : 0;
    setTimeout(() => {
        const pieces = [];
        (d.contents || []).forEach(c => {
            (c.items || []).forEach(it => { const item = itemDatabase[it.key] || { name: it.key, icon: '📦' }; pieces.push(`<span title="${escapeAttr(item.name)}">${tileIconHtml(item)}${it.count > 1 ? `<b>×${it.count}</b>` : ''}</span>`); });
            if (c.money) pieces.push(`<span class="sg-dc-money">💰<b>${c.money}</b></span>`);
            if (c.xp) pieces.push(`<span class="sg-dc-money">⭐<b>${c.xp}</b></span>`);
        });
        document.getElementById('gift-body').innerHTML = `<div class="sg-adv-stage" onclick="closeGift()"><div class="sg-adv-rays on${d.kind === 'gold' ? ' gold' : ''}"></div>
            <div class="sg-gift-big open">${giftImg(d.kind, 'sg-gift-bigimg')}</div>
            <div class="sg-adv-items big pop">${pieces.map((h, k) => h.replace('<span', `<span style="--k:${k}"`)).join('')}</div>
            <div class="sg-adv-rn">${d.kind === 'gold' ? 'ARANY LÁDA!' : 'AJÁNDÉKCSOMAG'}</div>
            <button class="sg-tu-big" style="margin-top:12px">SZUPER!</button></div>`;
        if (typeof playSound === 'function') playSound('win');
        const m = giftMarkers.get(d.id);
        if (m) m.setIcon(L.divIcon({ className: 'sg-tree-icon', html: `<div class="sg-gift-mk ${d.kind} opened">${giftImg(d.kind, 'sg-gift-img')}</div>`, iconSize: [44, 44], iconAnchor: [22, 40] }));
        const chipN = document.getElementById('gift-chip-n'); if (chipN) chipN.textContent = String(giftList.filter(g => !g.opened).length);
    }, wait);
});

// ---------- HAVAS TÉLI TÉRKÉP (dec. 1. – jan. 6.) ----------
// Finom hóesés a térkép fölött (kikapcsolható a Menüben), és dér a képernyő szélén.
const SNOW_FROM = '2026-12-01', SNOW_TO = '2027-01-06';
function snowSeason() { const k = SurvivalWinter.dayKey(Date.now()); return winterTestMode || (k >= SNOW_FROM && k <= SNOW_TO); }
function snowWanted() { try { return localStorage.getItem('sg-snow') !== 'off'; } catch (e) { return true; } }
let snowRaf = null, snowFlakes = [];
function snowStart() {
    const cv = document.getElementById('snow-canvas');
    if (!cv || snowRaf) return;
    document.body.classList.add('sg-winter');
    cv.classList.remove('hidden');
    const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const N = Math.round(Math.min(90, innerWidth * innerHeight / 9000));
    snowFlakes = Array.from({ length: N }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: 0.8 + Math.random() * 2.2, s: 0.3 + Math.random() * 0.9, w: Math.random() * 6.28 }));
    const ctx = cv.getContext('2d');
    let last = 0;
    const step = (t) => {
        snowRaf = requestAnimationFrame(step);
        if (document.hidden || t - last < 33) return; // ~30 fps, takarékosan
        last = t;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = 'rgba(235,245,255,.85)';
        ctx.beginPath();
        snowFlakes.forEach(f => {
            f.y += f.s; f.w += 0.02; f.x += Math.sin(f.w) * 0.4;
            if (f.y > cv.height + 4) { f.y = -4; f.x = Math.random() * cv.width; }
            ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.283);
        });
        ctx.fill();
    };
    snowRaf = requestAnimationFrame(step);
}
function snowStop() {
    if (snowRaf) cancelAnimationFrame(snowRaf); snowRaf = null;
    const cv = document.getElementById('snow-canvas'); if (cv) { cv.classList.add('hidden'); const c = cv.getContext('2d'); c && c.clearRect(0, 0, cv.width, cv.height); }
    document.body.classList.remove('sg-winter');
}
function snowRefresh() {
    const row = document.getElementById('snow-setting'); if (row) row.classList.toggle('hidden', !snowSeason());
    const cb = document.getElementById('snow-toggle'); if (cb) cb.checked = snowWanted();
    if (snowSeason() && snowWanted()) snowStart(); else snowStop();
}
function toggleSnow(on) { try { localStorage.setItem('sg-snow', on ? 'on' : 'off'); } catch (e) {} snowRefresh(); }
socket.on('winter_config', () => setTimeout(snowRefresh, 300));
setTimeout(snowRefresh, 2000);
setInterval(snowRefresh, 10 * 60000);
