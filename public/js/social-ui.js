// social-ui.js
// KÖZÖSSÉG (v0.1.21): Barátok gomb a menüsorban → Barátok · Csapat · Meghívás · Megosztás fülek.
// Megosztható kép (vászonra rajzolva), közösségi oldalak jutalma, barát kiemelése a térképen.
let socialState = null;
let socialTab = 'friends';
window.sgFriendSet = new Set();

function openSocial(tab) {
    if (tab) socialTab = tab;
    document.getElementById('social-modal').classList.remove('hidden');
    socket.emit('social_state');
    renderSocial();
}
function closeSocial() { document.getElementById('social-modal').classList.add('hidden'); }
function socialSetTab(t) { socialTab = t; if (t === 'dm' && typeof dmThread !== 'undefined') { dmThread = null; socket.emit('dm_list'); } renderSocial(); const b = document.getElementById('social-body'); if (b) b.scrollTop = 0; }
const sEsc = (s) => (typeof escapeAttr === 'function' ? escapeAttr(String(s)) : String(s));
const sJs = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function socialBadge() {
    const st = socialState; if (!st) return;
    const n = (st.friends || []).filter(f => f.incoming).length + (typeof teamAlerts === 'function' ? teamAlerts(st) : (st.teamInvites || []).length) + (typeof dmUnread !== 'undefined' ? dmUnread : 0);
    const b = document.getElementById('nav-social-badge');
    if (b) { b.textContent = String(n); b.classList.toggle('hidden', n <= 0); }
}

function renderSocial() {
    const body = document.getElementById('social-body');
    if (!body) return;
    const st = socialState;
    const tabs = [['friends', '👥', 'Barátok'], ['dm', '💬', 'Üzenetek'], ['team', '🏕️', 'Csapat'], ['invite', '🤝', 'Meghívás'], ['share', '📸', 'Megosztás']];
    const badge = (k) => { if (!st) return 0; if (k === 'friends') return (st.friends || []).filter(f => f.incoming).length; if (k === 'team' && typeof teamAlerts === 'function') return teamAlerts(st); if (k === 'dm' && typeof dmUnread !== 'undefined') return dmUnread; return 0; };
    let html = `<div class="sg-so-tabs">${tabs.map(([k, ic, n]) => { const b = badge(k); return `<button class="${k === socialTab ? 'on' : ''}" onclick="socialSetTab('${k}')">${ic}<span>${n}</span>${b ? `<i class="sg-tm-dot">${b}</i>` : ''}</button>`; }).join('')}</div>`;
    if (!st) { body.innerHTML = html + '<p class="sg-so-muted">Betöltés…</p>'; return; }
    if (socialTab === 'friends') html += friendsHtml(st);
    else if (socialTab === 'team') html += teamHtml(st);
    else if (socialTab === 'dm' && typeof dmHtml === 'function') html += dmHtml();
    else if (socialTab === 'invite') html += inviteHtml(st);
    else html += shareHtml(st);
    // gépelés közben érkező frissítés ne vigye el a fókuszt és a beírt szöveget
    const ae = document.activeElement, keepId = ae && ae.id && body.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName) ? ae.id : null;
    const keepVal = keepId ? ae.value : null;
    const scroll = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = scroll;
    if (keepId) { const i = document.getElementById(keepId); if (i) { if (i.type !== 'number' && i.type !== 'radio') i.value = keepVal; i.focus(); const L = i.value.length; try { i.setSelectionRange(L, L); } catch (e) { /* */ } } }
}

// ---------- Barátok ----------
function friendsHtml(st) {
    const fr = st.friends || [];
    const req = fr.filter(f => f.incoming), ok = fr.filter(f => f.status === 'ok'), out = fr.filter(f => f.outgoing);
    let h = `<div class="sg-so-add"><input id="so-friend-name" maxlength="24" placeholder="Kezdd el írni a nevét…" autocomplete="off" oninput="socialSearchInput(this.value)" onkeydown="if(event.key==='Enter')socialAddFriend()" value="${sEsc(socialSearchQ)}"><button onclick="socialAddFriend()">+ BARÁT</button></div>
        <div id="so-search">${socialSearchHtml()}</div><div id="so-msg" class="sg-so-msg ${socialMsg && !socialMsg.ok ? 'bad' : ''}">${socialMsg ? sEsc(socialMsg.text) : ''}</div>`;
    if (out.length) h += `<div class="sg-so-h">ELKÜLDÖTT KÉRÉSEK</div>` + out.map(f => `<div class="sg-so-row"><b>${sEsc(f.name)}</b><span class="sg-so-sp"></span><small class="sg-so-muted">várja, hogy elfogadja</small><button onclick="socket.emit('friend_remove',{name:'${sJs(f.name)}'})">✕</button></div>`).join('');
    if (req.length) h += `<div class="sg-so-h">BARÁTKÉRÉSEK</div>` + req.map(f => `<div class="sg-so-row"><b>${sEsc(f.name)}</b><span class="sg-so-sp"></span><button class="ok" onclick="socket.emit('friend_accept',{name:'${sJs(f.name)}'})">ELFOGADOM</button><button onclick="socket.emit('friend_remove',{name:'${sJs(f.name)}'})">✕</button></div>`).join('');
    h += `<div class="sg-so-h">BARÁTAIM (${ok.length}) <small>· ma még ${st.giftsLeft} ajándékot küldhetsz</small></div>`;
    h += ok.length ? ok.map(f => `<div class="sg-so-row"><span class="sg-so-dot ${f.online ? 'on' : ''}"></span><div class="sg-so-who" onclick="openProfile('${sJs(f.name)}')" style="cursor:pointer"><b>${sEsc(f.name)}</b><small>${f.level}. szint · ${String(f.km).replace('.', ',')} km és ${f.points} pont a hónapban${f.online ? ' · online' : ''}</small></div>
        <button class="msg" title="Üzenet" onclick="openDm('${sJs(f.name)}')">✉</button>
        <button class="gift" ${f.canGift && st.giftsLeft > 0 ? '' : 'disabled'} onclick="socket.emit('friend_gift',{name:'${sJs(f.name)}'})">${f.canGift ? '🎁 AJÁNDÉK' : '✓ MA KÜLDTÉL'}</button>
        <button class="x" onclick="socialRemoveFriend('${sJs(f.name)}')">✕</button></div>`).join('')
        : `<p class="sg-so-muted">Még nincs barátod. Írd be egy játékos nevét, koppints rá a térképen, vagy hívd meg a barátaidat a Meghívás fülön – aki a linkeddel regisztrál, automatikusan a barátod lesz.</p>`;
    h += `<p class="sg-so-muted" style="margin-top:10px">A barátaid jelölője a térképen arany keretet kap, ha a közeledben járnak. Az ajándék egy véletlen apróság (kötszer, konzerv, víz, elem, rongy), naponta barátonként egy.</p>`;
    return h;
}
// névkereső: gépelés közben listázza a hasonló nevű játékosokat, koppintásra mehet a kérés
let socialSearchQ = '', socialSearchNames = [], socialSearchT = null, socialMsg = null;
function socialSearchHtml() {
    if (socialSearchQ.trim().length < 2) return '';
    if (!socialSearchNames.length) return `<p class="sg-so-muted">Nincs ilyen nevű játékos.</p>`;
    const fr = new Set(((socialState && socialState.friends) || []).map(f => f.name));
    return socialSearchNames.map(n => `<div class="sg-so-row sg-so-hit"><b>${sEsc(n)}</b><span class="sg-so-sp"></span>${fr.has(n) ? '<small class="sg-so-muted">már a listádon</small>' : `<button class="ok" onclick="socialSendReq('${sJs(n)}')">+ JELÖLÖM</button>`}</div>`).join('');
}
function socialSearchInput(v) {
    socialSearchQ = v; clearTimeout(socialSearchT);
    if (v.trim().length < 2) { socialSearchNames = []; const el = document.getElementById('so-search'); if (el) el.innerHTML = ''; return; }
    socialSearchT = setTimeout(() => socket.emit('friend_search', { q: v.trim() }), 250);
}
function socialSendReq(n) { socialMsg = { ok: true, text: 'Küldés…' }; socket.emit('friend_request', { name: n }); }
function socialAddFriend() { const i = document.getElementById('so-friend-name'); const n = i && i.value.trim(); if (n) socialSendReq(n); }
function socialRemoveFriend(n) { if (confirm(`Eltávolítod a barátaid közül: ${n}?`)) socket.emit('friend_remove', { name: n }); }

// ---------- Csapat: js/teams-ui.js (v0.1.22) ----------

// ---------- Meghívás ----------
function inviteHtml(st) {
    const r = st.ref || {};
    return `<div class="sg-so-card"><b>🤝 Hozd a barátod!</b>
        <p>Küldd el a saját linkedet. Aki ezzel regisztrál, automatikusan a barátod lesz, és ha eléri a <b>${r.level}. szintet</b>:</p>
        <ul><li>te kapsz <b>+${r.rewardInviter.xp} XP-t és ${r.rewardInviter.money} $-t</b>,</li><li>ő kap <b>+${r.rewardNew.xp} XP-t és ${r.rewardNew.money} $-t</b>,</li><li>az első sikeres meghívásért a <b>„Toborzó”</b>, az ötödikért a <b>„Csapatvezér”</b> címet.</li></ul>
        <div class="sg-so-link"><input readonly value="${sEsc(r.link || '')}" onclick="this.select()"><button onclick="socialCopyLink()">MÁSOL</button></div>
        <button class="ok wide" onclick="socialShareLink()">📤 LINK KÜLDÉSE (Messenger, WhatsApp, Viber…)</button>
        <p class="sg-so-muted">Eddig ${r.joined} túlélő regisztrált a linkeddel, ebből ${r.done} érte el az ${r.level}. szintet.</p></div>`;
}
function socialCopyLink() {
    const l = socialState && socialState.ref && socialState.ref.link; if (!l) return;
    (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => logMessage('🔗 A meghívó link a vágólapon!')).catch(() => { prompt('Másold ki a linket:', l); });
}
function socialShareLink() {
    const l = socialState && socialState.ref && socialState.ref.link; if (!l) return;
    const text = 'Gyere te is a Zónába! A Survival GO ingyenes GPS-túlélőjáték, a pálya a te utcád. Ezzel a linkkel mindketten jutalmat kapunk:';
    if (navigator.share) navigator.share({ title: 'Survival GO', text, url: l }).catch(() => { }); else socialCopyLink();
}

// ---------- Megosztás és közösségi oldalak ----------
function shareHtml(st) {
    const sr = st.share || {}, rw = st.socialReward || {};
    const cp = st.campaign;
    let h = cp ? `<div class="sg-so-card sg-so-camp"><b>📣 Oszd meg a nagy frissítést!</b><img src="${cp.img}" alt="Survival GO – nagy frissítés" class="sg-so-camp-img">
        <p>${cp.done ? '✓ A kampányjutalmat már megkaptad – de oszd meg bátran újra!' : `Oszd meg a frissítés plakátját a meghívó linkeddel, és egyszer <b>+${cp.reward.xp} XP és ${cp.reward.money} $</b> jár. Aki a linkeddel regisztrál, az is jutalmat kap, és te is.`} <small>A Fagyos Csendig (${cp.until.slice(5).replace('-', '.')}.-ig).</small></p>
        <button class="ok wide" onclick="socialShareCampaign()">📤 PLAKÁT MEGOSZTÁSA</button></div>` : '';
    h += `<div class="sg-so-card"><b>📸 Ossz meg egy képet!</b><p>A játék elkészíti a túlélőkártyádat (szint, megtett km, felfedezett területek, szezonpont), rajta a meghívó linkeddel. ${sr.done ? '✓ A mai megosztási jutalmat már megkaptad.' : `Naponta az első megosztásért <b>+${sr.reward.xp} XP és ${sr.reward.money} $</b> jár.`}</p>
        <div id="so-card-prev" class="sg-so-prev"></div>
        <button class="ok wide" onclick="socialShareCard('profile')">📤 TÚLÉLŐKÁRTYA MEGOSZTÁSA</button>
        <small class="sg-so-muted">Facebook, Instagram, TikTok, Discord, Messenger – a telefonod megosztás menüjében választhatsz.</small></div>`;
    const pl = st.platforms || [];
    if (pl.length) {
        h += `<div class="sg-so-h">KÖVESS MINKET</div><p class="sg-so-muted">Nézz be hozzánk, és platformonként egyszer <b>+${rw.xp} XP és ${rw.money} $</b> jár. (Nyisd meg, nézz körül, aztán gyere vissza a JUTALOM gombért.)</p>`;
        h += pl.map(p => `<div class="sg-so-row"><span class="sg-so-pl">${p.icon}</span><b>${sEsc(p.name)}</b><span class="sg-so-sp"></span>
            ${p.claimed ? '<small class="sg-so-muted">✓ megkaptad</small>' : `<button onclick="socialVisit('${p.key}','${sJs(p.url)}')">MEGNYITOM</button><button class="ok" onclick="socket.emit('social_claim',{key:'${p.key}'})">JUTALOM</button>`}</div>`).join('');
    }
    setTimeout(() => socialDrawPreview(), 0);
    return h;
}
function socialVisit(key, url) { socket.emit('social_visit', { key }); window.open(url, '_blank', 'noopener'); }

// --- a megosztható kép (1080×1350) ---
function socialCardCanvas(kind, extra) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d2218'); bg.addColorStop(1, '#0e110b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // halvány térképrács
    g.strokeStyle = 'rgba(120,130,90,.10)'; g.lineWidth = 6;
    for (let i = -10; i < 20; i++) { g.beginPath(); g.moveTo(i * 110, 0); g.lineTo(i * 110 + 360, H); g.stroke(); }
    for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(0, i * 100); g.lineTo(W, i * 100 - 220); g.stroke(); }
    const glow = g.createRadialGradient(W / 2, 520, 50, W / 2, 520, 600); glow.addColorStop(0, 'rgba(200,150,50,.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const T = (txt, x, y, size, color, weight, align) => { g.font = `${weight || 800} ${size}px Inter, system-ui, sans-serif`; g.fillStyle = color; g.textAlign = align || 'center'; g.fillText(txt, x, y); };
    T('SURVIVAL GO', W / 2, 120, 54, '#d9c58a', 900);
    T('A ZÓNA A TE UTCÁD', W / 2, 170, 26, '#9a957f', 700);
    if (kind === 'tree' && extra) {
        T('🎄', W / 2, 470, 220, '#fff', 400);
        T(extra.name, W / 2, 620, 76, '#f1ecd8', 900);
        T(`${extra.points} pont · ${['üres fa', 'félig díszítve', 'teljesen feldíszítve'][extra.stage] || ''}`, W / 2, 700, 40, '#e8c35a', 800);
        T('Segíts feldíszíteni a településed fáját!', W / 2, 800, 38, '#cfc9b4', 700);
        T('Minden felakasztott díszért szerencsekerék-pörgetés jár.', W / 2, 852, 30, '#9a957f', 600);
    } else {
        const p = player || {}, st = p.stats || {};
        const km = ((st.walkedMeters || 0) / 1000).toFixed(1).replace('.', ',');
        const kills = Object.values(st.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        const season = (p.season && p.season.xp) || 0, explored = (p.quests && p.quests.explored) || 0;
        g.beginPath(); g.arc(W / 2, 360, 110, 0, Math.PI * 2); g.fillStyle = '#2c3022'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#d9c58a'; g.stroke();
        T(String(p.level || 1), W / 2, 395, 110, '#f1ecd8', 900);
        T('SZINT', W / 2, 505, 30, '#d9c58a', 800);
        T(p.username || 'Túlélő', W / 2, 610, 84, '#f1ecd8', 900);
        T(typeof rankForLevel === 'function' ? rankForLevel(p.level || 1).toUpperCase() : '', W / 2, 665, 32, '#9a957f', 800);
        const tiles = [['🥾', `${km} km`, 'gyalog megtéve'], ['🗺️', String(explored), 'felfedezett terület'], ['⚔️', String(kills), 'legyőzött ellenség'], ['🏆', String(season), 'havi szezonpont']];
        tiles.forEach(([ic, v, l], i) => {
            const x = 90 + (i % 2) * 465, y = 720 + Math.floor(i / 2) * 210;
            g.fillStyle = 'rgba(20,24,16,.85)'; g.strokeStyle = 'rgba(217,197,138,.45)'; g.lineWidth = 3;
            g.beginPath(); g.roundRect ? g.roundRect(x, y, 435, 185, 22) : g.rect(x, y, 435, 185); g.fill(); g.stroke();
            T(ic, x + 70, y + 115, 64, '#fff', 400);
            T(v, x + 130, y + 95, 62, '#e8c35a', 900, 'left');
            T(l, x + 130, y + 142, 28, '#bdb8a8', 600, 'left');
        });
    }
    // lábléc: meghívó link
    const link = (socialState && socialState.ref && socialState.ref.link) || 'survivalgo.hu';
    g.fillStyle = '#e8c35a'; g.beginPath(); g.roundRect ? g.roundRect(120, H - 205, W - 240, 92, 46) : g.rect(120, H - 205, W - 240, 92); g.fill();
    T('Csatlakozz ingyen!', W / 2, H - 148, 40, '#15170f', 900);
    T(link.replace(/^https?:\/\//, ''), W / 2, H - 60, 30, '#cfc9b4', 700);
    return c;
}
function socialDrawPreview() {
    const box = document.getElementById('so-card-prev'); if (!box || !player) return;
    const c = socialCardCanvas('profile'); c.style.width = '100%'; c.style.height = 'auto'; box.innerHTML = ''; box.appendChild(c);
}
async function socialShareCard(kind, extra) {
    const c = socialCardCanvas(kind, extra);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    const file = new File([blob], kind === 'tree' ? 'survivalgo-fa.jpg' : 'survivalgo-tulelo.jpg', { type: 'image/jpeg' });
    const link = (socialState && socialState.ref && socialState.ref.link) || '';
    const text = kind === 'tree' ? `Díszítsd velem a fát a Survival GO-ban! ${link}` : `Ez az én túlélőm a Survival GO-ban. Gyere te is! ${link}`;
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Survival GO' }); socket.emit('share_done', { kind }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // ahol nincs képmegosztás: letöltjük, és a játékos maga osztja meg
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    logMessage('📸 A kép letöltve – oszd meg bárhol!');
    socket.emit('share_done', { kind });
}
// kampány: a frissítés plakátja + a meghívó link
async function socialShareCampaign() {
    const cp = socialState && socialState.campaign; if (!cp) return;
    const link = (socialState.ref && socialState.ref.link) || 'https://survivalgo.hu';
    const text = `${cp.text} ${link}`;
    let blob = null; try { blob = await (await fetch(cp.img)).blob(); } catch (e) { /* */ }
    const file = blob ? new File([blob], 'survivalgo-frissites.jpg', { type: 'image/jpeg' }) : null;
    try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Survival GO' }); socket.emit('share_done', { kind: 'campaign' }); return; }
        if (navigator.share) { await navigator.share({ title: 'Survival GO', text, url: link }); socket.emit('share_done', { kind: 'campaign' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // számítógépen: a kép letöltődik, a szöveg a vágólapra kerül
    if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'survivalgo-frissites.jpg'; document.body.appendChild(a); a.click(); a.remove(); }
    try { await navigator.clipboard.writeText(text); } catch (e) { /* */ }
    logMessage('📣 A plakát letöltve, a szöveg a linkeddel a vágólapon – oszd meg bárhol!');
    socket.emit('share_done', { kind: 'campaign' });
}
function shareTreeCard() { if (typeof winterTree !== 'undefined' && winterTree) socialShareCard('tree', winterTree); }

// ---------- egy másik játékos a térképen ----------
function socialPlayerCard(pData) {
    if (!pData || !pData.username || pData.username === player.username) return;
    const st = socialState || {};
    const isFriend = window.sgFriendSet.has(pData.username);
    const myTeam = st.team;
    const pop = document.getElementById('social-pop');
    if (!pop) return;
    pop.innerHTML = `<b>👤 ${sEsc(pData.username)}</b><small>${pData.level || 1}. szintű túlélő</small>
        <button onclick="openProfile('${sJs(pData.username)}')">👤 PROFIL</button>
        <button onclick="openDm('${sJs(pData.username)}')">✉ ÜZENET</button>
        <small>Tipp: hosszan nyomva a játékoson körmenü nyílik.</small>
        ${isFriend ? '<small>✓ a barátod</small>' : `<button onclick="socket.emit('friend_request',{name:'${sJs(pData.username)}'});document.getElementById('social-pop').classList.add('hidden')">+ BARÁTNAK JELÖLÖM</button>`}
        ${window.sgTeamSet && window.sgTeamSet.has(pData.username) ? '<small>🏕️ csapattársad</small>' : ''}
        ${myTeam && !(window.sgTeamSet && window.sgTeamSet.has(pData.username)) ? `<button onclick="socket.emit('team_invite',{name:'${sJs(pData.username)}'});document.getElementById('social-pop').classList.add('hidden')">🏕️ MEGHÍVOM A CSAPATBA</button>` : ''}
        <button class="x" onclick="document.getElementById('social-pop').classList.add('hidden')">BEZÁR</button>`;
    pop.classList.remove('hidden');
    clearTimeout(window.__socialPopT); window.__socialPopT = setTimeout(() => pop.classList.add('hidden'), 9000);
}

socket.on('social_state', (d) => {
    socialState = d;
    window.sgFriendSet = new Set((d.friends || []).filter(f => f.status === 'ok').map(f => f.name));
    if (typeof teamAfterState === 'function') teamAfterState(d);
    socialBadge();
    const m = document.getElementById('social-modal'); if (m && !m.classList.contains('hidden')) renderSocial();
});
socket.on('friend_search_result', (d) => {
    if (!d || d.q !== socialSearchQ.trim()) return;
    socialSearchNames = d.names || [];
    const el = document.getElementById('so-search'); if (el) el.innerHTML = socialSearchHtml();
});
socket.on('social_result', (d) => {
    if (d && d.message) logMessage((d.success ? '' : '⚠️ ') + d.message);
    if (d && d.message) {
        socialMsg = { ok: !!d.success, text: d.message };
        if (d.success && /Barátkérés elküldve|mostantól a barátod/.test(d.message)) { socialSearchQ = ''; socialSearchNames = []; }
        const el = document.getElementById('so-msg'); if (el) { el.textContent = d.message; el.classList.toggle('bad', !d.success); }
        clearTimeout(window.__soMsgT); window.__soMsgT = setTimeout(() => { socialMsg = null; const e = document.getElementById('so-msg'); if (e) e.textContent = ''; }, 7000);
    }
    if (d && d.message && typeof showToast === 'function') showToast((d.success ? '' : '⚠️ ') + d.message);
    if (d && d.success && socialTab === 'team' && typeof teamSearchQ !== 'undefined') setTimeout(() => socket.emit('team_search', { q: teamSearchQ }), 300);
});
socket.on('social_ping', () => socket.emit('social_state'));
socket.on('connect', () => setTimeout(() => socket.emit('social_state'), 1500));
