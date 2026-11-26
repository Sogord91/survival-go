// teams-ui.js
// CSAPAT fül a Közösség ablakban (v0.1.22): címer, csapatkereső, jelentkezés, heti csapatküldetések,
// tagok aktivitása, csevegés, hirdetőtábla, vezetői kezelőfelület. A szabályok: js/teams.js (SurvivalTeams).
let teamSub = 'home';            // csapattagként: home · members · chat · manage
let teamOutSub = 'find';         // csapat nélkül: find · create
let teamSearchQ = '', teamSearchList = null, teamSearchT = null;
let teamChat = [], teamChatLoaded = false;
let teamDraft = null;            // címer-szerkesztő piszkozata
let teamCreateDraft = { icon: '🐺', color: '#7d8f3a', shape: 'shield' };
window.sgTeamSet = new Set();

const tE = (s) => (typeof escapeAttr === 'function' ? escapeAttr(String(s == null ? '' : s)) : String(s == null ? '' : s));
const tJ = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const TM = () => window.SurvivalTeams;

function teamEmblemHtml(e, size) {
    const em = TM() ? TM().normEmblem(e) : (e || { icon: '☢️', color: '#7d8f3a', shape: 'shield' });
    const s = size || 44;
    return `<span class="sg-tm-emb sh-${em.shape}" style="--ec:${em.color};width:${s}px;height:${s}px;font-size:${Math.round(s * 0.5)}px"><i>${em.icon}</i></span>`;
}
function teamAgo(t) {
    if (!t) return 'még nem játszott';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 2) return 'most';
    if (m < 60) return `${m} perce`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} órája`;
    const d = Math.floor(h / 24); return `${d} napja`;
}
function teamChatUnread(st) {
    const t = st && st.team; if (!t || !t.chatLast) return 0;
    let read = 0; try { read = Number(localStorage.getItem('sg-tchat-read') || 0); } catch (e) { /* */ }
    return t.chatLast > read ? 1 : 0;
}
function teamMarkRead() {
    const last = teamChat.length ? teamChat[teamChat.length - 1].t : (socialState && socialState.team && socialState.team.chatLast) || 0;
    try { localStorage.setItem('sg-tchat-read', String(last || Date.now())); } catch (e) { /* */ }
    if (typeof socialBadge === 'function') socialBadge();
}
function teamAlerts(st) { // a fülön és a menügombon látszó szám
    const t = st && st.team;
    return ((t && t.requests) || []).length + ((st && st.teamInvites) || []).length + teamChatUnread(st);
}

// ---------- fő belépési pont: a social-ui.js hívja ----------
function teamHtml(st) {
    return st.team ? teamInHtml(st) : teamOutHtml(st);
}

// ---------- CSAPAT NÉLKÜL ----------
function teamOutHtml(st) {
    const r = st.teamRules || {};
    let h = '';
    if ((st.teamInvites || []).length) h += `<div class="sg-so-h">CSAPATMEGHÍVÓK</div>` + st.teamInvites.map(i => `<div class="sg-so-row">${teamEmblemHtml(i.emblem, 34)}<div class="sg-so-who"><b>[${tE(i.tag)}] ${tE(i.name)}</b><small>${i.members} / ${i.max} tag</small></div><button class="ok" onclick="socket.emit('team_join',{id:'${tJ(i.id)}'})">BELÉPEK</button><button onclick="socket.emit('team_decline',{id:'${tJ(i.id)}'})">✕</button></div>`).join('');
    if ((st.teamApps || []).length) h += `<div class="sg-so-h">JELENTKEZÉSEIM</div>` + st.teamApps.map(i => `<div class="sg-so-row">${teamEmblemHtml(i.emblem, 34)}<div class="sg-so-who"><b>[${tE(i.tag)}] ${tE(i.name)}</b><small>várja, hogy elfogadják</small></div><button onclick="socket.emit('team_unapply',{id:'${tJ(i.id)}'})">VISSZAVONOM</button></div>`).join('');
    h += `<div class="sg-tm-sub">${[['find', '🔎 CSAPATKERESŐ'], ['create', '🏕️ ALAPÍTÁS']].map(([k, n]) => `<button class="${teamOutSub === k ? 'on' : ''}" onclick="teamOutSet('${k}')">${n}</button>`).join('')}</div>`;
    if (teamOutSub === 'find') {
        h += `<div class="sg-so-add"><input id="tm-q" maxlength="24" placeholder="Csapat neve vagy rövidítése…" autocomplete="off" value="${tE(teamSearchQ)}" oninput="teamSearchInput(this.value)"></div>`;
        h += `<div id="tm-list">${teamSearchHtml(st)}</div>`;
        if (teamSearchList === null) setTimeout(() => socket.emit('team_search', { q: teamSearchQ }), 0);
    } else {
        const d = teamCreateDraft;
        h += `<div class="sg-so-card"><div class="sg-tm-head">${teamEmblemHtml(d, 64)}<div><b>Alapíts csapatot!</b><small>Legfeljebb ${r.max || 15} fő · a ${r.minLevel || 3}. szinttől</small></div></div>
            <input id="so-team-name" maxlength="24" placeholder="Csapat neve (pl. Érdi Farkasok)"><input id="so-team-tag" maxlength="4" placeholder="Rövidítés (2–4 betű, pl. ÉRD)" style="text-transform:uppercase">
            ${teamEmblemPicker(d, 'teamCreatePick')}
            <button class="ok wide" onclick="socialCreateTeam()">CSAPAT ALAPÍTÁSA</button>
            <small class="sg-so-muted">Minden héten 3 közös csapatküldetés (köztük mindig egy közös séta). Mindegyikért jutalom jár annak, aki a héten segített, mind a háromért még +${r.allBonus ? r.allBonus.xp : 300} XP és ${r.allBonus ? r.allBonus.money : 200} $. A csapatok havi ranglistán is versenyeznek.</small></div>`;
    }
    return h;
}
function teamOutSet(k) { teamOutSub = k; renderSocial(); const b = document.getElementById('social-body'); if (b) b.scrollTop = 0; }
function teamSearchHtml(st) {
    if (teamSearchList === null) return `<p class="sg-so-muted">Keresés…</p>`;
    if (!teamSearchList.length) return `<p class="sg-so-muted">${teamSearchQ ? 'Nincs ilyen csapat. Alapíts egyet!' : 'Még nincs csapat. Légy te az első: alapíts egyet!'}</p>`;
    const lv = (player && player.level) || 1;
    return teamSearchList.map(t => {
        const mode = TM() ? TM().MODES.find(m => m.key === t.mode) : null;
        const low = lv < t.minLevel;
        let btn;
        if (t.applied) btn = `<button onclick="socket.emit('team_unapply',{id:'${tJ(t.id)}'})">VISSZAVONOM</button>`;
        else if (t.full) btn = `<small class="sg-so-muted">tele</small>`;
        else if (t.mode === 'invite') btn = `<small class="sg-so-muted">🔒 zárt</small>`;
        else if (low) btn = `<small class="sg-so-muted">${t.minLevel}. szinttől</small>`;
        else btn = `<button class="ok" onclick="teamApply('${tJ(t.id)}','${t.mode}')">${t.mode === 'open' ? 'BELÉPEK' : 'JELENTKEZEM'}</button>`;
        return `<div class="sg-tm-find">${teamEmblemHtml(t.emblem, 42)}<div class="sg-so-who"><b>[${tE(t.tag)}] ${tE(t.name)}</b>
            <small>${t.members} / ${t.max} tag · ${mode ? mode.name.toLowerCase() : ''}${t.minLevel > 1 ? ` · ${t.minLevel}. szinttől` : ''} · ${t.km} km közösen</small>
            ${t.desc ? `<em>${tE(t.desc)}</em>` : ''}</div>${btn}</div>`;
    }).join('');
}
function teamSearchInput(v) {
    teamSearchQ = v; clearTimeout(teamSearchT);
    teamSearchT = setTimeout(() => socket.emit('team_search', { q: v.trim() }), 250);
}
function teamApply(id, mode) {
    if (mode === 'open') return socket.emit('team_apply', { id });
    const msg = prompt('Írj pár szót magadról a vezetőnek (nem kötelező):', '');
    if (msg === null) return;
    socket.emit('team_apply', { id, msg });
}
function teamKeepInputs(ids, fn) {
    const vals = ids.map(id => { const e = document.getElementById(id); return e ? e.value : null; });
    fn();
    ids.forEach((id, i) => { const e = document.getElementById(id); if (e && vals[i] !== null) e.value = vals[i]; });
}
function teamCreatePick(k, v) { teamCreateDraft[k] = v; teamKeepInputs(['so-team-name', 'so-team-tag'], renderSocial); }
function socialCreateTeam() {
    socket.emit('team_create', { name: (document.getElementById('so-team-name') || {}).value || '', tag: (document.getElementById('so-team-tag') || {}).value || '', emblem: teamCreateDraft });
}

// címer-választó: jelkép, szín, forma
function teamEmblemPicker(d, fn) {
    const S = TM(); if (!S) return '';
    return `<div class="sg-tm-pick"><small>JELKÉP</small><div>${S.ICONS.map(i => `<button class="${d.icon === i ? 'on' : ''}" onclick="${fn}('icon','${i}')">${i}</button>`).join('')}</div>
        <small>SZÍN</small><div>${S.COLORS.map(c => `<button class="col${d.color === c ? ' on' : ''}" style="background:${c}" onclick="${fn}('color','${c}')"></button>`).join('')}</div>
        <small>FORMA</small><div>${S.SHAPES.map(s => `<button class="shp${d.shape === s.key ? ' on' : ''}" onclick="${fn}('shape','${s.key}')">${teamEmblemHtml({ ...d, shape: s.key }, 30)}</button>`).join('')}</div></div>`;
}

// ---------- CSAPATTAGKÉNT ----------
function teamInHtml(st) {
    const t = st.team, lead = t.role === 'owner' || t.role === 'officer';
    const unread = teamChatUnread(st), reqs = (t.requests || []).length;
    const subs = [['home', '🏕️', 'Csapat'], ['members', '👥', 'Tagok'], ['chat', '💬', 'Csevegés', unread], ['manage', '⚙️', lead ? 'Kezelés' : 'Meghívás', reqs]];
    let h = `<div class="sg-tm-head big">${teamEmblemHtml(t.emblem, 64)}<div><b>[${tE(t.tag)}] ${tE(t.name)}</b><small>${t.members.length} / ${t.max} tag · ${t.points} szezonpont a hónapban · ${TM() ? TM().ROLES[t.role] : ''}</small>${t.desc ? `<em>${tE(t.desc)}</em>` : ''}</div></div>`;
    h += `<div class="sg-tm-sub four">${subs.map(([k, ic, n, b]) => `<button class="${teamSub === k ? 'on' : ''}" onclick="teamSubSet('${k}')"><span>${ic}</span>${n}${b ? `<i class="sg-tm-dot">${b > 1 ? b : ''}</i>` : ''}</button>`).join('')}</div>`;
    if (teamSub === 'members') h += teamMembersHtml(st);
    else if (teamSub === 'chat') h += teamChatHtml(st);
    else if (teamSub === 'manage') h += lead ? teamManageHtml(st) : teamInviteHtml(st);
    else h += teamHomeHtml(st);
    return h;
}
function teamSubSet(k) {
    teamSub = k;
    if (k === 'chat') { socket.emit('team_chat_load'); teamMarkRead(); }
    if (k === 'manage' && socialState && socialState.team) teamDraft = { ...socialState.team.emblem };
    renderSocial();
    const b = document.getElementById('social-body'); if (b) b.scrollTop = 0;
    if (k === 'chat') teamChatScroll();
}
function teamHomeHtml(st) {
    const t = st.team, r = st.teamRules || {};
    let h = '';
    if (t.board) h += `<div class="sg-tm-board"><b>📌 HIRDETŐTÁBLA</b><p>${tE(t.board.text)}</p><small>${tE(t.board.by)} · ${teamAgo(t.board.t)}</small></div>`;
    h += `<div class="sg-so-h">HETI CSAPATKÜLDETÉSEK</div>`;
    h += t.quests.map(q => {
        const pct = Math.min(100, Math.round(q.progress / q.target * 100));
        const fmt = (v) => (q.div > 1 ? (v / q.div).toFixed(1).replace('.', ',').replace(',0', '') : String(v));
        return `<div class="sg-tm-q${q.done ? ' done' : ''}"><div class="sg-tm-qh"><span>${q.icon}</span><b>${tE(q.title)}</b><small>${q.done ? '✓ KÉSZ' : `+${q.reward.xp} XP · ${q.reward.money} $`}</small></div>
            <div class="sg-qs-bar"><i style="width:${pct}%"></i><span>${fmt(q.progress)} / ${fmt(q.target)} ${tE(q.unit)}</span></div>
            <small class="sg-so-muted">${tE(q.desc)}! · <b class="${(q.helpers || 0) >= (q.need || 2) ? 'ok' : ''}">👥 ${Math.min(q.helpers || 0, q.need || 2)} / ${q.need || 2} segítő</b>${!q.done && q.progress >= q.target && (q.helpers || 0) < (q.need || 2) ? ' – még kell segítő!' : ''}</small></div>`;
    }).join('');
    h += `<div class="sg-tm-note">${t.allDone ? '🏆 Mind a 3 kész ezen a héten! Hétfőn újak jönnek.' : `🏆 Mind a háromért: még +${r.allBonus ? r.allBonus.xp : 300} XP és ${r.allBonus ? r.allBonus.money : 200} $.`}<br>Egy küldetés csak akkor teljesül, ha legalább ${(t.quests[0] && t.quests[0].need) || 3} különböző tag segít benne. A jutalmat az kapja, aki a héten bármivel hozzájárult. Hétfőn új küldetések jönnek.</div>`;
    const s = t.stats || {};
    h += `<div class="sg-tm-stats"><div><b>${String(Math.round(s.km || 0))}</b><small>km közösen</small></div><div><b>${s.quests || 0}</b><small>csapatküldetés</small></div><div><b>${(s.weeks || 0) + 1}</b><small>hét együtt</small></div></div>`;
    if ((t.log || []).length) h += `<div class="sg-so-h">CSAPATNAPLÓ</div><div class="sg-tm-log">${t.log.slice(0, 10).map(l => `<div><small>${teamAgo(l.t)}</small> ${tE(l.text)}</div>`).join('')}</div>`;
    return h;
}
function teamMembersHtml(st) {
    const t = st.team, me = player && player.username;
    const lead = t.role === 'owner' || t.role === 'officer';
    let h = `<div class="sg-so-h">TAGOK · E HÉTEN</div>`;
    h += t.members.map(m => {
        const w = m.week || {};
        const parts = [w.km ? `${String(w.km).replace('.', ',')} km` : '', w.loot ? `${w.loot} épület` : '', w.win ? `${w.win} győzelem` : '', w.cells ? `${w.cells} terület` : '', w.craft ? `${w.craft} barkács` : '', w.quests ? `${w.quests} küldetés` : ''].filter(Boolean);
        const idle = !m.online && m.lastSeen && Date.now() - m.lastSeen > 7 * 86400000;
        const canKick = m.name !== me && (t.role === 'owner' || (t.role === 'officer' && m.role === 'member'));
        return `<div class="sg-tm-mem${idle ? ' idle' : ''}"><span class="sg-so-dot ${m.online ? 'on' : ''}"></span><div class="sg-so-who">
            <b>${m.role === 'owner' ? '👑 ' : m.role === 'officer' ? '⭐ ' : ''}${tE(m.name)}${m.name === me ? ' (te)' : ''}</b>
            <small>${m.level}. szint · ${m.points} pont a hónapban · ${m.online ? 'online' : teamAgo(m.lastSeen)}${idle ? ' ⚠️' : ''}</small>
            <small class="${w.active ? 'act' : 'no'}">${parts.length ? '🟢 ' + parts.join(' · ') : '⚪ ezen a héten még nem segített'}</small></div>
            ${lead && m.name !== me ? `<button onclick="teamMemberMenu('${tJ(m.name)}','${m.role}')">⋯</button>` : ''}${!lead && canKick ? '' : ''}</div>`;
    }).join('');
    h += `<p class="sg-so-muted" style="margin-top:6px">A ⚠️ jelölt tag több mint egy hete nem játszott.</p>`;
    h += t.role === 'owner'
        ? `<button class="sg-so-leave" onclick="teamLeaveOwner()">KILÉPÉS A CSAPATBÓL</button>`
        : `<button class="sg-so-leave" onclick="if(confirm('Biztosan kilépsz a csapatból?'))socket.emit('team_leave')">KILÉPÉS A CSAPATBÓL</button>`;
    return h;
}
function teamLeaveOwner() {
    const t = socialState && socialState.team;
    if (t && t.members.length > 1) { if (confirm('Te vagy a vezető. Ha kilépsz, a helyettes (vagy a legrégebbi tag) lesz az új vezető. Kilépsz?')) socket.emit('team_leave'); }
    else if (confirm('Egyedül vagy a csapatban: ha kilépsz, a csapat megszűnik. Biztos?')) socket.emit('team_leave');
}
function teamMemberMenu(name, role) {
    const t = socialState && socialState.team; if (!t) return;
    const pop = document.getElementById('social-pop');
    const owner = t.role === 'owner';
    const canKick = owner || (t.role === 'officer' && role === 'member');
    const btn = (label, js, cls) => `<button class="${cls || ''}" onclick="${js};teamPopHide()">${label}</button>`;
    clearTimeout(window.__socialPopT);
    pop.innerHTML = `<b>${tE(name)}</b><small>${TM() ? TM().ROLES[role] : role}</small>
        ${owner && role === 'member' ? btn('⭐ HELYETTES LEGYEN', `socket.emit('team_role',{name:'${tJ(name)}',role:'officer'})`) : ''}
        ${owner && role === 'officer' ? btn('↓ SIMA TAG LEGYEN', `socket.emit('team_role',{name:'${tJ(name)}',role:'member'})`) : ''}
        ${owner ? btn('👑 VEZETÉS ÁTADÁSA', `if(confirm('Átadod a vezetést neki: ${tJ(name)}? Te helyettes leszel.'))socket.emit('team_role',{name:'${tJ(name)}',role:'owner'})`) : ''}
        ${canKick ? btn('✕ ELKÜLDÖM A CSAPATBÓL', `if(confirm('Elküldöd a csapatból: ${tJ(name)}?'))socket.emit('team_kick',{name:'${tJ(name)}'})`, 'bad') : ''}
        <button class="x" onclick="teamPopHide()">MÉGSE</button>`;
    pop.classList.remove('hidden');
}
function teamPopHide() { const p = document.getElementById('social-pop'); if (p) p.classList.add('hidden'); }

// --- csevegés ---
function teamChatListHtml() {
    const me = player && player.username;
    if (!teamChatLoaded) return '<p class="sg-so-muted">Betöltés…</p>';
    if (!teamChat.length) return '<p class="sg-so-muted">Még nincs üzenet. Köszönj a csapatnak! 👋</p>';
    let lastDay = '';
    return teamChat.map(m => {
        const day = new Date(m.t).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' });
        const sep = day !== lastDay ? `<div class="sg-tm-day">${day}</div>` : ''; lastDay = day;
        return `${sep}<div class="sg-tm-msg${m.from === me ? ' me' : ''}"><small>${tE(m.from)} · ${new Date(m.t).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</small><p>${tE(m.text)}</p></div>`;
    }).join('');
}
function teamChatHtml() {
    return `<div class="sg-tm-chat" id="tm-chat">${teamChatListHtml()}</div>
        <div class="sg-so-add"><input id="tm-say" maxlength="200" placeholder="Üzenet a csapatnak…" autocomplete="off" onkeydown="if(event.key==='Enter')teamSay()"><button class="ok" onclick="teamSay()">KÜLD</button></div>
        <small class="sg-so-muted">Csak a csapattagok látják. Légy kedves – a stáb a sértő üzeneteket törli.</small>`;
}
function teamSay() { const i = document.getElementById('tm-say'); const v = i && i.value.trim(); if (!v) return; socket.emit('team_chat_send', { text: v }); i.value = ''; }
function teamChatScroll() { requestAnimationFrame(() => { const c = document.getElementById('tm-chat'); if (c) c.scrollTop = c.scrollHeight; }); }

// --- meghívás (sima tagnak) ---
function teamInviteHtml(st) {
    const t = st.team;
    if (t.mode === 'invite') return `<p class="sg-so-muted">Ez zárt csapat: csak a vezető és a helyettes hívhat meg új tagot. Szólj nekik a csevegésben!</p>`;
    return `<div class="sg-so-h">MEGHÍVÁS</div><div class="sg-so-add"><input id="so-team-inv" maxlength="24" placeholder="Játékos neve…"><button onclick="socialTeamInvite()">MEGHÍVOM</button></div>
        ${(st.friends || []).filter(f => f.status === 'ok' && !t.members.some(m => m.name === f.name)).slice(0, 8).map(f => `<button class="sg-so-chip" onclick="socket.emit('team_invite',{name:'${tJ(f.name)}'})">+ ${tE(f.name)}</button>`).join('')}
        <p class="sg-so-muted" style="margin-top:8px">A barátaid közül egy koppintással hívhatsz. Aki nincs még csapatban, a csapatkeresőben is rátok találhat.</p>`;
}
function socialTeamInvite() { const i = document.getElementById('so-team-inv'); if (i && i.value.trim()) socket.emit('team_invite', { name: i.value.trim() }); }

// --- vezetői kezelőfelület ---
function teamManageHtml(st) {
    const t = st.team, owner = t.role === 'owner', S = TM();
    let h = '';
    h += `<div class="sg-so-h">JELENTKEZŐK (${(t.requests || []).length})</div>`;
    h += (t.requests || []).length ? t.requests.map(r => `<div class="sg-tm-req"><div class="sg-so-who"><b>${tE(r.name)}</b><small>${r.level}. szint · ${teamAgo(r.t)}</small>${r.msg ? `<em>„${tE(r.msg)}”</em>` : ''}</div>
        <button class="ok" onclick="socket.emit('team_accept',{name:'${tJ(r.name)}'})">FELVESZEM</button><button onclick="socket.emit('team_reject',{name:'${tJ(r.name)}'})">✕</button></div>`).join('')
        : `<p class="sg-so-muted">Most nincs jelentkező. ${t.mode === 'open' ? 'Nyitott csapat vagytok: aki akar, azonnal belép.' : t.mode === 'invite' ? 'Zárt csapat vagytok: csak meghívóval lehet belépni.' : 'A csapatkeresőben bárki jelentkezhet.'}</p>`;
    h += `<div class="sg-so-h">HIRDETŐTÁBLA</div><div class="sg-so-card"><textarea id="tm-board" maxlength="200" rows="2" placeholder="Pl. Vasárnap 10-kor közös séta a parkban!">${tE(t.board ? t.board.text : '')}</textarea>
        <div class="sg-tm-btns"><button class="ok" onclick="socket.emit('team_board',{text:document.getElementById('tm-board').value})">📌 KITŰZÖM</button>${t.board ? `<button onclick="socket.emit('team_board',{text:''})">TÖRLÉS</button>` : ''}</div>
        <small class="sg-so-muted">Minden tag értesítést kap róla.</small></div>`;
    h += teamInviteHtml(st);
    const d = teamDraft || { ...t.emblem };
    h += `<div class="sg-so-h">CÍMER ÉS LEÍRÁS</div><div class="sg-so-card"><div class="sg-tm-head">${teamEmblemHtml(d, 64)}<div><b>[${tE(t.tag)}] ${tE(t.name)}</b><small>előnézet</small></div></div>
        ${teamEmblemPicker(d, 'teamDraftPick')}
        <textarea id="tm-desc" maxlength="140" rows="2" placeholder="Rövid leírás a csapatkeresőbe (pl. Érdi esti sétálók, bárkit várunk!)">${tE(t.desc)}</textarea>
        <button class="ok wide" onclick="teamSaveLook()">MENTÉS</button></div>`;
    if (owner && S) {
        h += `<div class="sg-so-h">CSATLAKOZÁS</div><div class="sg-so-card">${S.MODES.map(m => `<label class="sg-tm-radio"><input type="radio" name="tm-mode" value="${m.key}" ${t.mode === m.key ? 'checked' : ''}><span><b>${m.name}</b><small>${m.desc}</small></span></label>`).join('')}
            <label class="sg-tm-lv">Minimum szint: <input id="tm-minlv" type="number" min="1" max="99" value="${t.minLevel}"></label>
            <button class="ok wide" onclick="teamSaveJoin()">MENTÉS</button></div>`;
        h += `<div class="sg-so-h">NÉV ÉS RÖVIDÍTÉS</div><div class="sg-so-card"><input id="tm-name" maxlength="24" value="${tE(t.name)}"><input id="tm-tag" maxlength="4" value="${tE(t.tag)}" style="text-transform:uppercase">
            <button class="wide" onclick="teamSaveName()">ÁTNEVEZÉS</button></div>
            <button class="sg-so-leave" onclick="if(confirm('Biztosan feloszlatod a csapatot? Minden tag kikerül, és ez nem vonható vissza.'))socket.emit('team_disband')">CSAPAT FELOSZLATÁSA</button>`;
    } else h += `<p class="sg-so-muted">Helyettesként felvehetsz és elküldhetsz tagot, kitűzhetsz a hirdetőtáblára, és módosíthatod a címert. A nevet, a csatlakozás módját és a minimum szintet a vezető állítja.</p>`;
    return h;
}
function teamDraftPick(k, v) {
    teamDraft = teamDraft || { ...socialState.team.emblem }; teamDraft[k] = v;
    teamKeepInputs(['tm-desc', 'tm-board', 'tm-name', 'tm-tag', 'tm-minlv', 'so-team-inv'], renderSocial);
}
function teamSaveLook() { socket.emit('team_settings', { emblem: teamDraft || socialState.team.emblem, desc: (document.getElementById('tm-desc') || {}).value || '' }); }
function teamSaveJoin() {
    const m = document.querySelector('input[name="tm-mode"]:checked');
    socket.emit('team_settings', { mode: m ? m.value : undefined, minLevel: Number((document.getElementById('tm-minlv') || {}).value || 1) });
}
function teamSaveName() { socket.emit('team_settings', { name: (document.getElementById('tm-name') || {}).value || '', tag: (document.getElementById('tm-tag') || {}).value || '' }); }

// ---------- események ----------
socket.on('team_search_result', (d) => {
    if (!d || d.q.trim() !== teamSearchQ.trim()) return;
    teamSearchList = d.teams || [];
    const el = document.getElementById('tm-list'); if (el) el.innerHTML = teamSearchHtml(socialState);
});
socket.on('team_chat', (d) => {
    if (!d) return;
    if (d.all) { teamChat = d.list || []; teamChatLoaded = true; }
    else if (d.msg) {
        teamChat.push(d.msg); if (teamChat.length > 80) teamChat = teamChat.slice(-80);
        if (socialState && socialState.team) socialState.team.chatLast = d.msg.t;
    }
    const m = document.getElementById('social-modal');
    const open = m && !m.classList.contains('hidden') && socialTab === 'team' && teamSub === 'chat';
    if (open) {
        teamMarkRead();
        const c = document.getElementById('tm-chat'); // csak a lista frissül, a beírt szöveg megmarad
        if (c) { c.innerHTML = teamChatListHtml(); teamChatScroll(); }
    } else if (d.msg && d.msg.from !== (player && player.username)) {
        if (typeof socialBadge === 'function') socialBadge();
        if (m && !m.classList.contains('hidden') && socialTab === 'team') renderSocial();
    }
});
// a social_state után: csapattagok halmaza a térképhez; a kereső frissítése belépés / kilépés után
let teamPrevId;
function teamAfterState(d) {
    const t = d && d.team;
    const id = t ? t.id : null;
    if (teamPrevId !== undefined && teamPrevId !== id) { teamSearchList = null; teamSub = 'home'; }
    teamPrevId = id;
    window.sgTeamSet = new Set(t ? t.members.map(m => m.name).filter(n => n !== (player && player.username)) : []);
    if (!t) { teamChatLoaded = false; teamChat = []; }
    if (t && teamSub === 'chat' && !teamChatLoaded) socket.emit('team_chat_load');
}
