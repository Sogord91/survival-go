// pvp-ui.js – TÁMADÁS (PvP, v0.1.26) a kliensen. Szerver: pvp.js.
// Harcablak (rád lőttek / támadás), lövés – gyógyítás – menekülés – megadás, a megadás tárgyválasztója,
// zsákok a térképen, lövéshang, a körmenü és a profil támadás gombja.
let pvpState = null, pvpPicked = [], pvpTick = null, pvpLastLogN = 0, pvpBagMarkers = {}, pvpBagView = null, pvpShotMarks = [];
const vE = (s) => (typeof escapeAttr === 'function' ? escapeAttr(String(s == null ? '' : s)) : String(s == null ? '' : s));
const vJ = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------- támadás indítása ----------
function pvpAttack(name, level) {
    if (typeof radialClose === 'function') radialClose();
    if (player && (player.level || 1) < 5) { if (typeof showToast === 'function') showToast('⚠️ Támadni az 5. szinttől (Kadét) lehet.'); return; }
    if (!confirm(`Megtámadod ${name}-t${level ? ` (${level}. szint)` : ''}?\n\n• Az első lövésed ritkán talál, utána felváltva lőttök.\n• Ő visszalőhet, elmenekülhet vagy megadhatja magát.\n• 30 percig BANDITA leszel: a térképen mindenki látja.\n• Ha elesel, a cuccaid a földön maradnak.`)) return;
    socket.emit('pvp_attack', { name });
}

// ---------- harcablak (a zombiharc arénájával és a HUD vászon-stílusával) ----------
const pvpItem = (key) => (typeof itemDatabase !== 'undefined' && itemDatabase[key]) || null;
function pvpTile(key, fallback) { const it = pvpItem(key); return typeof tileIconHtml === 'function' && it ? tileIconHtml(it) : `<span class="tile-emoji">${fallback || '📦'}</span>`; }
function pvpHp(f, side) {
    const pct = Math.max(0, Math.min(100, (f.hp / (f.maxHp || 1)) * 100));
    return `<div class="sg-pv-hp ${side}"><div class="sg-k"><span>${side === 'me' ? 'ÉLETED' : 'ELLENFÉL'}</span><span>${Math.max(0, Math.round(f.hp))}/${f.maxHp}</span></div><div class="sg-line"><i style="width:${pct}%"></i></div></div>`;
}
function pvpRender() {
    const m = document.getElementById('pvp-modal'), b = document.getElementById('pvp-body');
    const s = pvpState; if (!m || !b || !s) return;
    m.classList.remove('hidden');
    const ended = s.phase === 'ended';
    let title, tone = 'red';
    if (ended) {
        const r = s.end && s.end.result;
        title = { won: 'GYŐZELEM', lost: 'ELESTÉL', escaped: 'ELMENEKÜLTÉL', fled: 'ELMENEKÜLT', surrendered: 'MEGADTAD MAGAD', gotSurrender: 'MEGADTA MAGÁT', draw: 'VÉGE' }[r] || 'VÉGE';
        tone = r === 'lost' ? 'red' : r === 'won' || r === 'gotSurrender' || r === 'escaped' ? 'olive' : 'dark';
    } else title = s.role === 'defender' && s.round <= 2 ? 'RÁD LŐTTEK!' : s.role === 'attacker' ? 'TÁMADÁS' : 'TŰZHARC';
    let h = `<div class="sg-pv-top"><img class="sg-pv-ico" src="/images/ui/pvp-crosshair.svg" alt=""><h2 class="sg-pv-title ${tone}">${title}</h2>${ended || s.phase === 'pick' ? '' : `<span class="sg-pv-round">${s.round}. KÖR</span>`}</div>`;
    // aréna: ugyanaz, mint a szörnyek elleni harcban
    h += `<div class="sg-arena sg-pv-arena"><div class="sg-ar-ground"></div>
        <div class="sg-ar-fighter me${ended && s.end && s.end.result === 'lost' ? ' dead' : ''}"><div class="sg-ar-img"><img src="/images/avatars/${vE(s.me.avatar || 'avatar1.png')}" alt="" onerror="this.src='/images/avatars/avatar1.png'"></div><div class="sg-ar-label">TE · ${s.me.level}. SZINT</div></div>
        <div class="sg-ar-vs">VS</div>
        <div class="sg-ar-fighter enemy${ended && s.end && s.end.result === 'won' ? ' dead' : ''}${ended && s.end && s.end.result === 'fled' ? ' fled' : ''}"><div class="sg-ar-img"><img src="/images/avatars/${vE(s.foe.avatar || 'avatar1.png')}" alt="" onerror="this.src='/images/avatars/avatar1.png'"></div><div class="sg-ar-label">${vE(String(s.foe.name).toUpperCase())} · ${s.foe.level}.</div></div>
        ${s.foe.bandit ? '<span class="sg-pv-bandit">BANDITA</span>' : ''}</div>`;
    h += `<div class="sg-pv-hps">${pvpHp(s.me, 'me')}${pvpHp(s.foe, 'foe')}</div>`;
    if (!ended && s.phase === 'fight') h += `<div class="sg-pv-turn${s.myTurn ? ' mine' : ''}"><span>${s.myTurn ? 'TE JÖSSZ' : `${vE(s.foe.name)} LÉP…`}</span><div class="sg-search-bar"><i id="pvp-clock"></i></div><b id="pvp-secs"></b></div>`;
    if (s.phase !== 'pick') h += `<div class="sg-pv-log" id="pvp-log">${s.log.map(l => `<div class="${l.kind}">${vE(l.text.replace(/^[🔫💊🏃🏳️💀🤝⏱️⏳]+\s*/u, '').replace(/^⏱️\s*🔫\s*/u, ''))}</div>`).join('')}</div>`;
    if (ended) {
        h += `<div class="sg-pv-note">${vE(s.end ? s.end.text.replace(/\s*🎒$/u, '') : '')}</div>`;
        h += `<div class="sg-pv-acts c2">${s.end && s.end.result === 'won' ? `<button class="olive" onclick="pvpClose();pvpOpenNearestBag()">ZSÁK MEGNYITÁSA</button>` : ''}<button onclick="pvpClose()">BEZÁR</button></div>`;
    } else if (s.phase === 'pick') {
        if (s.role === 'attacker' && s.pick) h += pvpPickHtml(s);
        else h += `<div class="sg-pv-note">Megadtad magad. ${vE(s.foe.name)} most választ a hátizsákodból: 3 tételt és a pénzed felét viheti. A viselt felszerelésed megmarad.</div><div class="sg-pv-turn"><span>VÁRAKOZÁS</span><div class="sg-search-bar"><i id="pvp-clock"></i></div><b id="pvp-secs"></b></div>`;
    } else if (s.myTurn) {
        const shoot = (s.slots || []).map(w => `<button class="red wpn" onclick="pvpAct('shoot','${w.slot}')">${w.key ? `<span class="sg-pv-wi">${pvpTile(w.key)}</span>` : ''}<span class="sg-pv-wt"><b>${vE(w.name)}</b><small>${w.noAmmo ? 'NINCS LŐSZER' : w.ammo !== null && w.ammo !== undefined ? `${w.dmg} SEBZÉS · ${w.ammo} LŐSZER` : `${w.dmg} SEBZÉS`}</small></span></button>`).join('');
        h += `<div class="sg-pv-acts">${shoot || `<button class="red" onclick="pvpAct('shoot')">PUSZTA KÉZ</button>`}</div>`;
        const throws = (s.throws || []).slice(0, 4);
        if (throws.length) h += `<div class="sg-pv-heals">${throws.map(x => `<button onclick="pvpAct('throw',null,'${vJ(x.key)}')" title="${vE(x.name)}"><span class="inv-tile">${pvpTile(x.key, '💥')}<span class="tile-count">${x.count}</span></span><small>Dob</small></button>`).join('')}</div>`;
        const heals = (s.heals || []).slice(0, 4);
        if (heals.length) h += `<div class="sg-pv-heals">${heals.map(x => `<button onclick="pvpAct('heal',null,'${vJ(x.key)}')" title="${vE(x.name)}"><span class="inv-tile">${pvpTile(x.key, '💊')}<span class="tile-count">${x.count}</span></span><small>+${x.hp}</small></button>`).join('')}</div>`;
        h += `<div class="sg-pv-acts c2"><button class="amber" onclick="pvpAct('flee')">MENEKÜLÉS<small>${s.refused ? 'NAGYOBB ESÉLLYEL' : 'NAGY ESÉLLYEL'}</small></button>${s.canSurrender ? `<button onclick="pvpSurrender()">MEGADOM MAGAM<small>3 TÁRGY + PÉNZED FELE</small></button>` : ''}</div>`;
    }
    b.innerHTML = h;
    const lg = document.getElementById('pvp-log'); if (lg) lg.scrollTop = lg.scrollHeight;
    pvpClock();
}
function pvpClock() {
    clearInterval(pvpTick);
    const s = pvpState; if (!s) return;
    const dl = s.phase === 'pick' ? s.pickDeadline : s.deadline, total = s.phase === 'pick' ? 30000 : (s.turnMs || 20000);
    if (!dl || s.phase === 'ended') return;
    const upd = () => { const el = document.getElementById('pvp-clock'), sec = document.getElementById('pvp-secs'); if (!el) return; const left = Math.max(0, dl - Date.now()); el.style.width = (left / total * 100) + '%'; if (sec) sec.textContent = Math.ceil(left / 1000) + ' MP'; };
    upd(); pvpTick = setInterval(upd, 250);
}
function pvpAct(action, slot, item) { socket.emit('pvp_act', { action, slot, item }); document.querySelectorAll('#pvp-body .sg-pv-acts button, #pvp-body .sg-pv-heals button').forEach(b => { b.disabled = true; }); }
function pvpSurrender() { if (confirm('Megadod magad? A támadó elvisz 3 tételt a hátizsákodból és a pénzed felét. A viselt felszerelésed megmarad. (De vissza is utasíthatja!)')) pvpAct('surrender'); }
function pvpClose() { const m = document.getElementById('pvp-modal'); if (m) m.classList.add('hidden'); clearInterval(pvpTick); pvpState = null; }

// --- a megadás tárgyválasztója (a támadónál) ---
function pvpPickHtml(s) {
    const max = s.pick.max || 3;
    const tiles = s.pick.items.map(it => `<button class="inv-tile${pvpPicked.includes(it.idx) ? ' selected' : ''}" onclick="pvpTogglePick(${it.idx})" title="${vE(it.name)}">${pvpTile(it.key, it.icon)}${it.count > 1 ? `<span class="tile-count">${it.count}</span>` : ''}${pvpPicked.includes(it.idx) ? '<span class="tile-check">✔</span>' : ''}</button>`).join('');
    const names = pvpPicked.map(i => (s.pick.items.find(x => x.idx === i) || {}).name).filter(Boolean).join(', ');
    return `<div class="sg-pv-note"><b>${vE(s.foe.name)} megadta magát.</b> Válassz legfeljebb ${max} tételt a hátizsákjából. A pénze felét (${s.pick.money} $) mindenképp viszed.</div>
        <div class="sg-pv-grid">${tiles || '<p class="sg-pv-empty">Üres a hátizsákja.</p>'}</div>
        <div class="sg-pv-chosen">${names ? vE(names) : 'Koppints a tárgyakra a kiválasztáshoz.'}</div>
        <div class="sg-pv-turn"><span>DÖNTS</span><div class="sg-search-bar"><i id="pvp-clock"></i></div><b id="pvp-secs"></b></div>
        <div class="sg-pv-acts c2"><button class="olive" onclick="pvpPickDone()">ELVISZEM<small>${pvpPicked.length} / ${max} TÉTEL + ${s.pick.money} $</small></button><button class="red" onclick="pvpRefuse()">NEM KEGYELMEZEK<small>TOVÁBB LŐSZ</small></button></div>`;
}
function pvpTogglePick(i) {
    const max = (pvpState && pvpState.pick && pvpState.pick.max) || 3;
    const k = pvpPicked.indexOf(i);
    if (k >= 0) pvpPicked.splice(k, 1); else if (pvpPicked.length < max) pvpPicked.push(i); else if (typeof showToast === 'function') showToast(`Legfeljebb ${max} tételt választhatsz.`);
    pvpRender();
}
function pvpPickDone() { socket.emit('pvp_pick', { idx: pvpPicked }); }
function pvpRefuse() { if (confirm('Nem kegyelmezel? Tovább lőhetsz, de még tovább maradsz bandita, és neki könnyebb lesz elmenekülni.')) socket.emit('pvp_pick', { refuse: true }); }

// ---------- zsákok ----------
function pvpBagIcon(b) {
    return L.divIcon({ className: 'custom-icon', html: `<div class="sg-bag-mk" title="${vE(b.owner)} zsákja"><img src="/images/ui/nav-backpack.svg" alt=""><i>${b.n}</i></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
}
function pvpShowBags(d) {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const keep = new Set();
    ((d && d.bags) || []).forEach(b => {
        keep.add(b.id);
        if (pvpBagMarkers[b.id]) { pvpBagMarkers[b.id].setIcon(pvpBagIcon(b)); return; }
        pvpBagMarkers[b.id] = L.marker([b.lat, b.lng], { icon: pvpBagIcon(b), zIndexOffset: 500 }).addTo(map).on('click', () => socket.emit('bag_open', { id: b.id }));
    });
    Object.keys(pvpBagMarkers).forEach(id => { if (!keep.has(id)) { map.removeLayer(pvpBagMarkers[id]); delete pvpBagMarkers[id]; } });
    window.__pvpBags = (d && d.bags) || [];
}
function pvpOpenNearestBag() {
    const list = (window.__pvpBags || []).slice().sort((a, b) => a.dist - b.dist);
    if (list[0]) socket.emit('bag_open', { id: list[0].id }); else { socket.emit('pvp_bags'); setTimeout(() => { const l = (window.__pvpBags || []).slice().sort((a, b) => a.dist - b.dist); if (l[0]) socket.emit('bag_open', { id: l[0].id }); }, 800); }
}
function pvpBagRender() {
    const m = document.getElementById('bag-modal'), b = document.getElementById('bag-body'), g = pvpBagView;
    if (!m || !b) return;
    if (!g) { m.classList.add('hidden'); return; }
    const left = Math.max(0, Math.ceil((g.until - Date.now()) / 60000));
    b.innerHTML = `<div class="sg-pv-top"><img class="sg-pv-ico" src="/images/ui/nav-backpack.svg" alt=""><h2 class="sg-pv-title dark">${vE(g.owner)} ZSÁKJA</h2><button class="sg-pv-x" onclick="pvpBagView=null;pvpBagRender()">✕</button></div>
        <div class="sg-pv-note">${g.killer ? `${vE(g.killer)} győzte le. ` : ''}Még kb. ${left} percig marad itt, bárki felveheti. Koppints egy tárgyra a felvételhez.</div>
        <div class="sg-pv-grid">${g.money ? `<button class="inv-tile sg-pv-money" onclick="socket.emit('bag_take',{id:'${vJ(g.id)}',idx:-1})" title="Pénz"><b>${g.money}</b><small>$</small></button>` : ''}
        ${g.items.map(it => `<button class="inv-tile" onclick="socket.emit('bag_take',{id:'${vJ(g.id)}',idx:${it.idx}})" title="${vE(it.name)}">${pvpTile(it.key, it.icon)}${it.count > 1 ? `<span class="tile-count">${it.count}</span>` : ''}</button>`).join('')}</div>
        <div class="sg-pv-acts c2"><button class="olive" onclick="socket.emit('bag_take',{id:'${vJ(g.id)}',idx:'all'})">MINDENT FELVESZEK</button><button onclick="pvpBagView=null;pvpBagRender()">BEZÁR</button></div>`;
    m.classList.remove('hidden');
}

// ---------- lövéshang ----------
function pvpGunshot(g) {
    if (typeof showToast === 'function') showToast(`Lövéseket hallasz ${g.dir}, kb. ${g.dist} m-re!`);
    if (typeof playSound === 'function') try { playSound('hit'); } catch (e) { /* */ }
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const c = L.circle([g.lat, g.lng], { radius: 70, color: '#c2402f', weight: 2, dashArray: '6 5', fillColor: '#c2402f', fillOpacity: 0.12, className: 'sg-shot-ring' }).addTo(map);
    const mk = L.marker([g.lat, g.lng], { icon: L.divIcon({ className: 'custom-icon', html: '<div class="sg-shot-mk"><img src="/images/ui/pvp-crosshair.svg" alt=""></div>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false }).addTo(map);
    pvpShotMarks.push(c, mk);
    setTimeout(() => { [c, mk].forEach(x => { try { map.removeLayer(x); } catch (e) { /* */ } }); }, 60000);
}

// ---------- események ----------
socket.on('pvp_state', (d) => {
    if (!d) return;
    const fresh = !pvpState || pvpState.id !== d.id;
    if (fresh) { pvpPicked = []; pvpLastLogN = 0; if (d.role === 'defender' && navigator.vibrate) try { navigator.vibrate([200, 80, 200]); } catch (e) { /* */ } }
    if (d.log.length > pvpLastLogN && typeof playSound === 'function' && /TALÁLAT/.test((d.log[d.log.length - 1] || {}).text || '')) try { playSound('hit'); } catch (e) { /* */ }
    pvpLastLogN = d.log.length;
    if (d.phase !== 'pick') pvpPicked = [];
    pvpState = d; pvpRender();
});
socket.on('pvp_result', (d) => { if (d && d.message && typeof showToast === 'function') showToast((d.success ? '' : '⚠️ ') + d.message); if (d && !d.success) document.querySelectorAll('#pvp-body .sg-pv-acts button').forEach(b => { b.disabled = false; }); });
socket.on('pvp_gunshot', pvpGunshot);
socket.on('pvp_bags', pvpShowBags);
socket.on('bag_view', (g) => { pvpBagView = g; pvpBagRender(); });
socket.on('connect', () => setTimeout(() => socket.emit('pvp_bags'), 2500));
setInterval(() => { if (typeof socket !== 'undefined' && socket.connected && player && player.username) socket.emit('pvp_bags'); }, 30000);
