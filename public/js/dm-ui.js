// dm-ui.js – PRIVÁT ÜZENETEK (v0.1.25): Barátok gomb → 💬 Üzenetek fül. Szerver: dm.js.
// Belépési pontok: barátlista ✉ gombja, a térképen egy játékosra koppintva „✉ ÜZENET”, openDm(név).
let dmState = null, dmThread = null, dmUnread = 0, dmNewName = '';
const dE = (s) => (typeof escapeAttr === 'function' ? escapeAttr(String(s == null ? '' : s)) : String(s == null ? '' : s));
const dJ = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function openDm(name) {
    closePlayerPop();
    dmThread = { name, msgs: null };
    openSocial('dm');
    socket.emit('dm_open', { name });
}
function closePlayerPop() { const p = document.getElementById('social-pop'); if (p) p.classList.add('hidden'); }
function dmBack() { dmThread = null; socket.emit('dm_list'); renderSocial(); }
function dmTime(t) {
    const d = new Date(t), now = new Date();
    return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
}

// ---------- a fül tartalma (a social-ui.js renderSocial hívja) ----------
function dmHtml() {
    if (dmThread) return dmThreadHtml();
    if (!dmState) { socket.emit('dm_list'); return '<p class="sg-so-muted">Betöltés…</p>'; }
    let h = `<div class="sg-so-add"><input id="dm-new" maxlength="24" placeholder="Kinek írsz? (játékos neve)" autocomplete="off" value="${dE(dmNewName)}" oninput="dmNewName=this.value" onkeydown="if(event.key==='Enter')dmStart()"><button class="ok" onclick="dmStart()">✉ ÍROK</button></div>`;
    const fr = ((socialState && socialState.friends) || []).filter(f => f.status === 'ok' && !(dmState.list || []).some(c => c.name === f.name)).slice(0, 8);
    if (fr.length) h += `<div>${fr.map(f => `<button class="sg-so-chip" onclick="openDm('${dJ(f.name)}')">✉ ${dE(f.name)}</button>`).join('')}</div>`;
    h += `<div class="sg-so-h">BESZÉLGETÉSEK</div>`;
    h += (dmState.list || []).length ? dmState.list.map(c => `<div class="sg-dm-conv${c.unread ? ' new' : ''}${c.blocked ? ' blk' : ''}" onclick="openDm('${dJ(c.name)}')">
            <span class="sg-so-dot ${c.online ? 'on' : ''}"></span><div class="sg-so-who"><b>${c.staff ? '🛡️ ' : ''}${dE(c.name)}${c.blocked ? ' 🚫' : ''}</b>
            <small>${c.last ? `${c.last.from === (player && player.username) ? 'Te: ' : ''}${dE(c.last.text)}` : ''}</small></div>
            <div class="sg-dm-meta">${c.last ? `<small>${dmTime(c.last.t)}</small>` : ''}${c.unread ? `<i class="sg-tm-dot">${c.unread}</i>` : ''}</div></div>`).join('')
        : `<p class="sg-so-muted">Még nincs beszélgetésed. Írj egy barátodnak, vagy koppints egy játékosra a térképen!</p>`;
    h += `<div class="sg-so-h">BEÁLLÍTÁSOK</div><div class="sg-so-card"><label class="sg-tm-radio"><input type="checkbox" ${dmState.friendsOnly ? 'checked' : ''} onchange="socket.emit('dm_settings',{friendsOnly:this.checked})"><span><b>Csak a barátaim írhatnak</b><small>Ismeretlen játékos nem tud neked új beszélgetést kezdeni.</small></span></label>
        ${(dmState.blocks || []).length ? `<small class="sg-so-muted">Letiltva:</small> ${dmState.blocks.map(n => `<button class="sg-so-chip" onclick="socket.emit('dm_block',{name:'${dJ(n)}',on:false})">🚫 ${dE(n)} ✕</button>`).join('')}` : ''}
        <small class="sg-so-muted">Ismeretlennek a ${dmState.strangerLevel || 3}. szinttől lehet írni. Ha valaki zaklat, tiltsd le és jelentsd (a beszélgetésben a ⋯ gomb). Soha ne add meg a lakcímed, telefonszámod vagy jelszavad!</small></div>`;
    return h;
}
function dmStart() { const n = (dmNewName || '').trim(); if (!n) return; dmNewName = ''; openDm(n); }

function dmThreadHtml() {
    const t = dmThread;
    let h = `<div class="sg-dm-head"><button onclick="dmBack()">←</button><span class="sg-so-dot ${t.online ? 'on' : ''}"></span><b onclick="openProfile('${dJ(t.name)}')" style="cursor:pointer">${t.staff ? '🛡️ ' : ''}${dE(t.name)}</b><small>${t.online ? 'online' : ''}</small><span class="sg-so-sp"></span>${t.staff ? '' : `<button onclick="dmMenu()">⋯</button>`}</div>`;
    h += `<div class="sg-tm-chat sg-dm-chat" id="dm-chat">${dmMsgsHtml()}</div>`;
    if (t.msgs && t.canSend === false) h += `<p class="sg-dm-why">${dE(t.why || 'Nem küldhetsz üzenetet.')}</p>`;
    else h += `<div class="sg-so-add"><input id="dm-say" maxlength="500" placeholder="Üzenet…" autocomplete="off" onkeydown="if(event.key==='Enter')dmSay()"><button class="ok" onclick="dmSay()">KÜLD</button></div>`;
    return h;
}
function dmMsgsHtml() {
    const t = dmThread, me = player && player.username;
    if (!t || !t.msgs) return '<p class="sg-so-muted">Betöltés…</p>';
    if (!t.msgs.length) return `<p class="sg-so-muted">Még nem beszéltetek. Köszönj ${dE(t.name)}-nak! 👋</p>`;
    let last = '';
    return t.msgs.map(m => {
        const day = new Date(m.t).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' });
        const sep = day !== last ? `<div class="sg-tm-day">${day}</div>` : ''; last = day;
        return `${sep}<div class="sg-tm-msg${m.from === me ? ' me' : ''}"><small>${new Date(m.t).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</small><p>${dE(m.text)}</p></div>`;
    }).join('');
}
function dmScroll() { requestAnimationFrame(() => { const c = document.getElementById('dm-chat'); if (c) c.scrollTop = c.scrollHeight; }); }
function dmSay() {
    const i = document.getElementById('dm-say'); const v = i && i.value.trim();
    if (!v || !dmThread) return;
    socket.emit('dm_send', { to: dmThread.name, text: v }); i.value = '';
}
function dmMenu() {
    const t = dmThread; if (!t) return;
    const pop = document.getElementById('social-pop'); clearTimeout(window.__socialPopT);
    pop.innerHTML = `<b>${dE(t.name)}</b>
        <button class="bad" onclick="socket.emit('dm_block',{name:'${dJ(t.name)}',on:${t.blocked ? 'false' : 'true'}});closePlayerPop();setTimeout(()=>socket.emit('dm_open',{name:'${dJ(t.name)}'}),300)">${t.blocked ? '✓ TILTÁS FELOLDÁSA' : '🚫 LETILTOM'}</button>
        <button onclick="dmReport()">🛡️ JELENTEM A STÁBNAK</button>
        <button class="x" onclick="closePlayerPop()">MÉGSE</button>`;
    pop.classList.remove('hidden');
}
function dmReport() {
    closePlayerPop();
    const why = prompt(`Miért jelented ${dmThread.name}-t? (pl. sértegetés, zaklatás, csalás)\nA stáb a beszélgetés utolsó üzeneteit látja.`, '');
    if (why === null) return;
    socket.emit('dm_report', { name: dmThread.name, reason: why });
}
function dmBadge() {
    if (typeof socialBadge === 'function') socialBadge();
}

// ---------- események ----------
socket.on('dm_list', (d) => { dmState = d; const m = document.getElementById('social-modal'); if (m && !m.classList.contains('hidden') && socialTab === 'dm' && !dmThread) renderSocial(); });
socket.on('dm_thread', (d) => {
    if (!dmThread || dmThread.name.toLowerCase() !== String(d.name).toLowerCase()) return;
    dmThread = d;
    if (socialTab === 'dm') { renderSocial(); dmScroll(); const i = document.getElementById('dm-say'); if (i && window.innerWidth > 700) i.focus(); }
});
socket.on('dm_unread', (d) => { dmUnread = (d && d.n) || 0; dmBadge(); });
socket.on('dm_result', (d) => { if (d && d.message && typeof showToast === 'function') showToast((d.success ? '' : '⚠️ ') + d.message); });
socket.on('dm_msg', (d) => {
    if (!d || !d.msg) return;
    const m = document.getElementById('social-modal');
    const open = m && !m.classList.contains('hidden') && socialTab === 'dm' && dmThread && dmThread.name === d.with && dmThread.msgs;
    if (open) {
        dmThread.msgs.push(d.msg);
        const c = document.getElementById('dm-chat'); if (c) { c.innerHTML = dmMsgsHtml(); dmScroll(); }
        if (d.msg.from !== (player && player.username)) socket.emit('dm_read', { name: d.with });
    } else if (d.msg.from !== (player && player.username)) {
        if (typeof showToast === 'function') showToast(`✉️ ${d.with}: ${d.msg.text.slice(0, 60)}`);
        if (m && !m.classList.contains('hidden') && socialTab === 'dm' && !dmThread) socket.emit('dm_list');
    }
    if (dmState && d.msg.from === (player && player.username) && !dmState.list.some(c => c.name === d.with)) dmState = null; // új beszélgetés: a lista újratöltődik
});
