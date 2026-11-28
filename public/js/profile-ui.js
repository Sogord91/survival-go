// profile-ui.js – JÁTÉKOSPROFIL és KÖRMENÜ (v0.1.25). Szerver: profile.js, szabályok: js/profile-rules.js.
// • openProfile(név): profilkártya (szalag, avatar kerettel, rang, cím, csapat, bemutatkozás, statisztika, gombok)
// • a saját profil szerkesztése: szín, minta, jelvény, bemutatkozás, kiemelt statisztikák, elrejtés
// • a térképen egy játékosra HOSSZAN nyomva körmenü: üzenet, profil, barát, csapat, (hamarosan) kereskedés, támadás
let profData = null, profEdit = null, profLoading = null;
const pE = (s) => (typeof escapeAttr === 'function' ? escapeAttr(String(s == null ? '' : s)) : String(s == null ? '' : s));
const pJ = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const PR = () => window.SurvivalProfile;

function openProfile(name) {
    if (!name) return;
    radialClose();
    const pop = document.getElementById('social-pop'); if (pop) pop.classList.add('hidden');
    profLoading = name; profEdit = null;
    if (!profData || profData.name !== name) profData = null;
    document.getElementById('profile-modal').classList.remove('hidden');
    profRender();
    socket.emit('profile_get', { name });
}
function openMyProfile() { if (player && player.username) openProfile(player.username); }
function closeProfile() { document.getElementById('profile-modal').classList.add('hidden'); profEdit = null; }

function profAgo(t) {
    if (!t) return 'régen';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 3) return 'most'; if (m < 60) return `${m} perce`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} órája`;
    return `${Math.floor(h / 24)} napja`;
}
function profNum(v, unit) {
    const s = unit === 'km' || unit === 'kg' ? String(v || 0).replace('.', ',') : Number(v || 0).toLocaleString('hu-HU');
    return s;
}
function profAvatarHtml(d, size) {
    const Sh = window.SurvivalShop && SurvivalShop.BY_KEY, fr = Sh && d.frame && Sh[d.frame];
    const ring = fr ? fr.color : 'rgba(232,195,90,.85)';
    return `<div class="sg-pf-av" style="width:${size}px;height:${size}px;--ring:${ring}"><img src="/images/avatars/${pE(d.avatar)}" alt="" onerror="this.src='/images/avatars/avatar1.png'">
        ${typeof rankPatchSvg === 'function' ? `<span class="sg-pf-rank">${rankPatchSvg(rankIndexForLevel(d.level))}</span>` : ''}
        ${(profEdit ? profEdit.badge : d.profile.badge) ? `<span class="sg-pf-badge">${profEdit ? profEdit.badge : d.profile.badge}</span>` : ''}</div>`;
}

function profRender() {
    const body = document.getElementById('profile-body'); if (!body) return;
    const d = profData;
    if (!d) { body.innerHTML = `<div class="sg-pf-load">👤 ${pE(profLoading || '')}<br><small>Profil betöltése…</small></div>`; return; }
    const S = PR(), look = profEdit || d.profile;
    const Sh = window.SurvivalShop && SurvivalShop.BY_KEY, ti = Sh && d.title && Sh[d.title];
    const r = window.SurvivalRoles && d.staff && SurvivalRoles.info(d.role);
    const rank = typeof rankForLevel === 'function' ? rankForLevel(d.level) : '';
    let h = `<div class="sg-pf-banner pt-${look.pattern}" style="--pc:${look.color}">
        <div class="sg-pf-status ${d.online ? 'on' : ''}">${d.online ? '● ONLINE' : `○ ${profAgo(d.lastSeen)}`}</div>
        ${profAvatarHtml(d, 92)}</div>
      <div class="sg-pf-id"><h2>${pE(d.name)}${d.early ? ' <i title="Korai túlélő">🎖️</i>' : ''}</h2>
        ${ti ? `<div class="sg-pf-title" style="color:${ti.color}">„${pE(ti.name)}”</div>` : ''}
        <div class="sg-pf-sub">${pE(rank)} · ${d.level}. szint${d.dead ? ' · 💀 elesett' : ''}${r ? ` · <b style="color:${r.color || '#e8c35a'}">🛡️ ${pE(r.name)}</b>` : ''}</div>
        <div class="sg-pf-chips">${d.team ? `<span class="sg-pf-chip">${typeof teamEmblemHtml === 'function' ? teamEmblemHtml(d.team.emblem, 20) : '🏕️'} [${pE(d.team.tag)}] ${pE(d.team.name)}</span>` : ''}
          <span class="sg-pf-chip">👥 ${d.friends} barát</span>${d.joined ? `<span class="sg-pf-chip">📅 ${new Date(d.joined).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short' })} óta</span>` : ''}</div></div>`;
    if (profEdit) h += profEditHtml(d);
    else {
        if (d.profile.bio) h += `<div class="sg-pf-bio">${pE(d.profile.bio).replace(/\n/g, '<br>')}</div>`;
        else if (d.me) h += `<div class="sg-pf-bio empty">Még nincs bemutatkozásod. Írj magadról pár sort a ✏️ szerkesztésnél!</div>`;
        if (d.stats) {
            h += `<div class="sg-pf-show">${look.show.map(k => { const s = S.SHOW.find(x => x.key === k); return s ? `<div><i>${s.icon}</i><b>${profNum(d.stats[k], s.unit)}</b><small>${s.unit} · ${s.name.toLowerCase()}</small></div>` : ''; }).join('')}</div>`;
            const rest = S.SHOW.filter(s => !look.show.includes(s.key));
            h += `<div class="sg-pf-stats">${rest.map(s => `<div><span>${s.icon} ${s.name}</span><b>${profNum(d.stats[s.key], s.unit)} <small>${s.unit}</small></b></div>`).join('')}
                <div><span>💀 Halálok</span><b>${d.stats.deaths}</b></div><div><span>☠️ Legyőzött ellenség</span><b>${Number(d.stats.kills).toLocaleString('hu-HU')}</b></div></div>`;
        } else h += `<div class="sg-pf-bio empty">🔒 ${pE(d.name)} elrejtette a statisztikáit.</div>`;
        h += d.me ? `<div class="sg-pf-actions one"><button class="ok" onclick="profStartEdit()">✏️ PROFIL SZERKESZTÉSE</button></div>` : profActionsHtml(d);
    }
    body.innerHTML = h;
}
function profActionsHtml(d) {
    const n = pJ(d.name);
    const friendBtn = d.friend === 'ok' ? `<button disabled>✓ BARÁTOD</button>` : d.friend === 'out' ? `<button disabled>⏳ JELÖLVE</button>`
        : d.friend === 'in' ? `<button class="ok" onclick="socket.emit('friend_accept',{name:'${n}'});profReload()">✓ ELFOGADOM</button>` : `<button onclick="socket.emit('friend_request',{name:'${n}'});profReload()">➕ BARÁTNAK</button>`;
    return `<div class="sg-pf-actions">
        <button class="ok" onclick="closeProfile();openDm('${n}')">✉️ ÜZENET</button>${friendBtn}
        ${d.viewerTeam && !d.sameTeam && !d.team ? `<button onclick="socket.emit('team_invite',{name:'${n}'})">🏕️ CSAPATBA HÍVOM</button>` : d.sameTeam ? `<button disabled>🏕️ CSAPATTÁRS</button>` : ''}
        <button disabled title="Hamarosan">🤝 KERESKEDÉS <small>hamarosan</small></button>
        ${d.level >= 5 && !d.sameTeam && !d.staff ? `<button class="danger" onclick="closeProfile();pvpAttack('${n}',${d.level})">⚔️ TÁMADÁS <small>csak a közelben</small></button>` : `<button disabled>⚔️ TÁMADÁS <small>${d.level < 5 ? 'újoncot nem lehet' : 'nem lehet'}</small></button>`}
        <button class="more" onclick="profMore()">⋯</button></div>`;
}
function profReload() { setTimeout(() => { if (profData) socket.emit('profile_get', { name: profData.name }); }, 500); }
function profMore() {
    const d = profData; if (!d) return;
    const pop = document.getElementById('social-pop'); clearTimeout(window.__socialPopT);
    pop.innerHTML = `<b>${pE(d.name)}</b>
        <button class="bad" onclick="socket.emit('dm_block',{name:'${pJ(d.name)}',on:${d.blocked ? 'false' : 'true'}});document.getElementById('social-pop').classList.add('hidden');profReload()">${d.blocked ? '✓ TILTÁS FELOLDÁSA' : '🚫 LETILTOM (nem írhat nekem)'}</button>
        ${d.profile.bio ? `<button onclick="profReport()">🛡️ SÉRTŐ BEMUTATKOZÁS JELENTÉSE</button>` : ''}
        ${d.friend === 'ok' ? `<button onclick="if(confirm('Törlöd a barátaid közül?')){socket.emit('friend_remove',{name:'${pJ(d.name)}'});profReload()}document.getElementById('social-pop').classList.add('hidden')">✕ BARÁTSÁG TÖRLÉSE</button>` : ''}
        <button class="x" onclick="document.getElementById('social-pop').classList.add('hidden')">MÉGSE</button>`;
    pop.classList.remove('hidden');
}
function profReport() {
    document.getElementById('social-pop').classList.add('hidden');
    const why = prompt('Mi a gond a bemutatkozással?', ''); if (why === null) return;
    socket.emit('profile_report', { name: profData.name, reason: why });
}

// ---------- szerkesztés (saját profil) ----------
function profStartEdit() { profEdit = JSON.parse(JSON.stringify(profData.profile)); profRender(); }
function profPick(k, v) {
    const bio = document.getElementById('pf-bio'); if (bio) profEdit.bio = bio.value;
    if (k === 'show') {
        const i = profEdit.show.indexOf(v);
        if (i >= 0) { if (profEdit.show.length > 1) profEdit.show.splice(i, 1); } else { profEdit.show.push(v); if (profEdit.show.length > 3) profEdit.show.shift(); }
    } else profEdit[k] = v;
    const b = document.getElementById('profile-body'), y = b.scrollTop; profRender(); b.scrollTop = y;
}
function profEditHtml() {
    const S = PR(), e = profEdit;
    return `<div class="sg-pf-edit">
        <label>BEMUTATKOZÁS <small>(${S.BIO_MAX} karakter)</small></label>
        <textarea id="pf-bio" maxlength="${S.BIO_MAX}" rows="3" placeholder="Pl. Esti sétáló Érdről. Keress a csapatkeresőben: [MAFŐ]!">${pE(e.bio)}</textarea>
        <label>SZALAG SZÍNE</label><div class="sg-tm-pick"><div>${S.COLORS.map(c => `<button class="col${e.color === c ? ' on' : ''}" style="background:${c}" onclick="profPick('color','${c}')"></button>`).join('')}</div></div>
        <label>MINTA</label><div class="sg-pf-pats">${S.PATTERNS.map(p => `<button class="pt-${p.key}${e.pattern === p.key ? ' on' : ''}" style="--pc:${e.color}" onclick="profPick('pattern','${p.key}')"><span>${p.name}</span></button>`).join('')}</div>
        <label>JELVÉNY AZ AVATARON</label><div class="sg-tm-pick"><div>${S.BADGES.map(b => `<button class="${e.badge === b ? 'on' : ''}" onclick="profPick('badge','${b}')">${b || '✕'}</button>`).join('')}</div></div>
        <label>KIEMELT STATISZTIKÁK <small>(legfeljebb 3)</small></label><div class="sg-pf-pick3">${S.SHOW.map(s => `<button class="${e.show.includes(s.key) ? 'on' : ''}" onclick="profPick('show','${s.key}')">${s.icon} ${s.name}</button>`).join('')}</div>
        <label class="sg-tm-radio"><input type="checkbox" ${e.hideStats ? 'checked' : ''} onchange="profEdit.hideStats=this.checked"><span><b>Statisztikáim elrejtése</b><small>Mások csak a nevedet, szintedet, csapatodat és a bemutatkozásodat látják.</small></span></label>
        <div class="sg-pf-actions two"><button onclick="profEdit=null;profRender()">MÉGSE</button><button class="ok" onclick="profSave()">✓ MENTÉS</button></div>
        <small class="sg-so-muted">A bemutatkozásban ne adj meg lakcímet, telefonszámot. A sértő szöveget a többiek jelenthetik.</small></div>`;
}
function profSave() {
    const bio = document.getElementById('pf-bio'); if (bio) profEdit.bio = bio.value;
    socket.emit('profile_set', profEdit);
}

// ---------- KÖRMENÜ: koppintásra egy játékoson a térképen (v0.1.26.10) ----------
let radialFor = null;
function radialOpen(pData, x, y) {
    if (!pData || !pData.username || (player && pData.username === player.username)) return;
    radialFor = pData;
    const st = (typeof socialState !== 'undefined' && socialState) || {};
    const friend = window.sgFriendSet && sgFriendSet.has(pData.username), mate = window.sgTeamSet && sgTeamSet.has(pData.username);
    const n = pJ(pData.username);
    const items = [
        { ic: '✉️', t: 'Üzenet', js: `openDm('${n}')` },
        { ic: '👤', t: 'Profil', js: `openProfile('${n}')` },
        friend ? { ic: '✓', t: 'Barátod', off: true } : { ic: '➕', t: 'Barátnak', js: `socket.emit('friend_request',{name:'${n}'})` },
        st.team && !mate ? { ic: '🏕️', t: 'Csapatba', js: `socket.emit('team_invite',{name:'${n}'})` } : { ic: '🏕️', t: mate ? 'Csapattárs' : 'Csapat', off: true },
        { ic: '🤝', t: 'Kereskedés', off: true, soon: true },
        (player && (player.level || 1) >= 5 && (pData.level || 1) >= 5 && !mate && !pData.staff) ? { ic: '⚔️', t: 'Támadás', js: `pvpAttack('${n}',${Number(pData.level) || 1})`, danger: true } : { ic: '⚔️', t: (pData.level || 1) < 5 ? 'Újonc' : 'Támadás', off: true }
    ];
    const R = Math.min(96, Math.max(80, window.innerWidth * 0.22));
    const cx = Math.min(Math.max(x, R + 40), window.innerWidth - R - 40), cy = Math.min(Math.max(y, R + 60), window.innerHeight - R - 60);
    const el = document.getElementById('sg-radial');
    el.innerHTML = `<div class="sg-rd-center" style="left:${cx}px;top:${cy}px"><img src="/images/avatars/${pE(pData.avatar || 'avatar1.png')}" onerror="this.src='/images/avatars/avatar1.png'"><b>${pE(pData.username)}</b><small>${pData.level || 1}. szint${pData.bandit ? ' · BANDITA' : ''}</small></div>` +
        items.map((it, i) => {
            const a = -Math.PI / 2 + i * (2 * Math.PI / items.length);
            return `<button class="sg-rd-btn${it.off ? ' off' : ''}${it.danger ? ' danger' : ''}" style="left:${cx + Math.cos(a) * R}px;top:${cy + Math.sin(a) * R}px;animation-delay:${i * 25}ms" ${it.off ? 'disabled' : `onclick="radialClose();${it.js}"`}><i>${it.ic}</i><span>${it.t}</span>${it.soon ? '<em>hamarosan</em>' : ''}</button>`;
        }).join('');
    el.classList.remove('hidden');
    if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) { /* */ }
}
// Általános körmenü (v0.1.44.1): center = { img, title, sub }, items = [{ ic, t, js, off, danger }]
function radialMenu(center, items, x, y) {
    const R = Math.min(96, Math.max(80, window.innerWidth * 0.22));
    const cx = Math.min(Math.max(x, R + 40), window.innerWidth - R - 40), cy = Math.min(Math.max(y, R + 60), window.innerHeight - R - 60);
    const el = document.getElementById('sg-radial');
    el.innerHTML = `<div class="sg-rd-center" style="left:${cx}px;top:${cy}px"><img src="${pE(center.img)}" onerror="this.style.visibility='hidden'"><b>${pE(center.title)}</b>${center.sub ? `<small>${pE(center.sub)}</small>` : ''}</div>` +
        items.map((it, i) => {
            const a = -Math.PI / 2 + i * (2 * Math.PI / items.length);
            return `<button class="sg-rd-btn${it.off ? ' off' : ''}${it.danger ? ' danger' : ''}" style="left:${cx + Math.cos(a) * R}px;top:${cy + Math.sin(a) * R}px;animation-delay:${i * 25}ms" ${it.off ? 'disabled' : `onclick="radialClose();${it.js}"`}><i>${it.ic}</i><span>${it.t}</span></button>`;
        }).join('');
    el.classList.remove('hidden');
    if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) { /* */ }
}
function radialClose() { const el = document.getElementById('sg-radial'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } radialFor = null; }
// hosszú nyomás figyelése egy térképjelölőn (a map.js hívja minden más játékos jelölőjére)
function attachLongPress(marker, getData) {
    const bind = () => {
        const el = marker.getElement && marker.getElement(); if (!el || el.__sgLp) return; el.__sgLp = true;
        let timer = null, sx = 0, sy = 0, fired = false;
        const start = (e) => {
            const p = e.touches ? e.touches[0] : e; sx = p.clientX; sy = p.clientY; fired = false;
            clearTimeout(timer);
            timer = setTimeout(() => { fired = true; radialOpen(getData(), sx, sy); }, 450);
        };
        const move = (e) => { const p = e.touches ? e.touches[0] : e; if (Math.hypot(p.clientX - sx, p.clientY - sy) > 12) clearTimeout(timer); };
        const end = (e) => { clearTimeout(timer); if (fired) { e.preventDefault(); e.stopPropagation(); } };
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchmove', move, { passive: true });
        el.addEventListener('touchend', end);
        el.addEventListener('mousedown', start);
        el.addEventListener('mousemove', move);
        el.addEventListener('mouseup', end);
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(timer); fired = true; radialOpen(getData(), e.clientX, e.clientY); });
        el.addEventListener('click', (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    };
    if (marker.getElement && marker.getElement()) bind(); else marker.on('add', bind);
}

// ---------- események ----------
socket.on('profile_data', (d) => {
    if (!d) return;
    if (!d.success) { if (typeof showToast === 'function') showToast('⚠️ ' + d.message); if (!profData) closeProfile(); return; }
    if (profLoading && d.name.toLowerCase() !== profLoading.toLowerCase() && (!profData || profData.name !== d.name)) return;
    profData = d; profLoading = d.name;
    if (!profEdit) profRender();
});
socket.on('profile_saved', (d) => {
    if (!d) return;
    if (typeof showToast === 'function') showToast((d.success ? '' : '⚠️ ') + d.message);
    if (d.success && d.profile && profData && profData.me) { profData.profile = d.profile; profEdit = null; profRender(); }
});
