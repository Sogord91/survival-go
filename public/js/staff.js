// staff.js – stáb rang a HUD-on, csevegés a stábbal, játékon belüli admin panel (v0.1.14)

// ---------- Rang a HUD-on (keret az avatar körül, felirat a név mellett) ----------
function renderStaffHud() {
    const r = window.SurvivalRoles && SurvivalRoles.info(player.staffRole);
    const ava = document.querySelector('#top-hud .sg-ava');
    if (ava) {
        // stáb keret, vagy ha nincs, a prémium keret (v0.1.16)
        const S = window.SurvivalShop;
        const f = !r && S && player.cosmetic && S.BY_KEY[player.cosmetic.frame];
        ava.className = 'sg-ava' + (r ? ` sg-role sg-role-${player.staffRole}` : '') + (f ? ` sg-cos cos-${f.key}${f.glow ? ' glow' : ''}${f.pulse ? ' pulse' : ''}${f.style === 'camo' ? ' camo' : ''}` : '');
        ava.style.setProperty('--role-c', r ? r.color : '');
        ava.style.setProperty('--cos-c', f ? f.color : '');
    }
    const tag = document.getElementById('hud-staff');
    if (tag) {
        tag.classList.toggle('hidden', !r);
        tag.textContent = r ? r.tag : '';
        tag.style.setProperty('--role-c', r ? r.color : '');
        tag.title = r ? r.name + ' – a Survival GO stábja' : '';
    }
}
function applyStaffRole() {
    const isStaff = !!(window.SurvivalRoles && SurvivalRoles.isStaff(player.staffRole));
    const btn = document.getElementById('btn-open-admin');
    if (btn) btn.classList.toggle('hidden', !isStaff);
    renderStaffHud();
    if (typeof refreshMyMarker === 'function') refreshMyMarker();
}
socket.on('staff_role', (data) => {
    player.staffRole = (data && data.role) || '';
    applyStaffRole();
    const r = SurvivalRoles.info(player.staffRole);
    if (typeof logMessage === 'function') logMessage(r ? `🛡️ Új rangod a stábban: ${r.name}` : 'Már nem vagy a stáb tagja.');
});

// ---------- Jelvények a Menüben (olvasatlan üzenetek) ----------
let supportUnread = 0, staffUnread = 0;
function renderMenuBadges() {
    const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); } };
    set('support-badge', supportUnread);
    set('admin-badge', staffUnread);
    set('nav-menu-badge', supportUnread + staffUnread);
}

// ---------- Csevegés a stábbal (játékos oldal) ----------
let supportMessages = [];
function supportTime(t) { const d = new Date(t); return d.toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); }
function renderSupport() {
    const box = document.getElementById('support-list');
    if (!box) return;
    if (!supportMessages.length) { box.innerHTML = '<div class="sg-chat-empty">Még nincs üzenet.<br>Írj bátran: hiba, kérdés, ötlet.</div>'; return; }
    box.innerHTML = '';
    supportMessages.forEach(m => {
        const div = document.createElement('div');
        const r = m.from === 'staff' && window.SurvivalRoles ? SurvivalRoles.info(m.staffRole) : null;
        div.className = 'sg-msg ' + (m.from === 'staff' ? 'staff' : 'me');
        if (r) div.style.setProperty('--role-c', r.color);
        const small = document.createElement('small');
        small.textContent = (m.from === 'staff' ? `${m.staff || 'Stáb'}${m.staffRoleName ? ' · ' + m.staffRoleName : ''}` : 'Te') + ' · ' + supportTime(m.t);
        div.appendChild(small);
        div.appendChild(document.createTextNode(m.text));
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}
function openSupportModal() {
    const s = document.getElementById('settings-modal');
    if (s) s.classList.add('hidden');
    document.getElementById('support-err').textContent = '';
    document.getElementById('support-modal').classList.remove('hidden');
    renderSupport();
    socket.emit('support_history');
    supportUnread = 0; renderMenuBadges();
    setTimeout(() => { const t = document.getElementById('support-text'); if (t) t.focus(); }, 50);
}
function closeSupportModal() { document.getElementById('support-modal').classList.add('hidden'); }
function supportOpen() { const m = document.getElementById('support-modal'); return !!m && !m.classList.contains('hidden'); }
function sendSupport() {
    const ta = document.getElementById('support-text');
    const text = ta.value.trim();
    if (!text) return;
    socket.emit('support_send', { text });
    ta.value = '';
    document.getElementById('support-err').textContent = '';
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'support-text') { e.preventDefault(); sendSupport(); }
});
socket.on('support_history', (data) => { supportMessages = (data && Array.isArray(data.messages)) ? data.messages : []; renderSupport(); });
socket.on('support_msg', (data) => {
    const m = data && data.message;
    if (!m) return;
    if (!supportMessages.some(x => x.id === m.id)) supportMessages.push(m);
    if (supportOpen()) { renderSupport(); if (m.from === 'staff') socket.emit('support_history'); return; }
    if (m.from === 'staff') {
        supportUnread++; renderMenuBadges();
        if (typeof logMessage === 'function') logMessage(`💬 Válasz a stábtól (${m.staff}): ${m.text.slice(0, 60)}${m.text.length > 60 ? '…' : ''} – Menü → Üzenet a stábnak`);
        if (typeof playSound === 'function') playSound('win');
    }
});
socket.on('support_unread', (data) => { supportUnread = (data && data.count) || 0; renderMenuBadges(); });
socket.on('support_error', (data) => { document.getElementById('support-err').textContent = (data && data.message) || ''; });

// ---------- Stáb oldal: új üzenet érkezett egy játékostól ----------
socket.on('support_staff_unread', (data) => { staffUnread = (data && data.count) || 0; renderMenuBadges(); });
socket.on('support_staff_new', (data) => {
    staffUnread++; renderMenuBadges();
    if (typeof logMessage === 'function') logMessage(`💬 Új üzenet a stábnak – ${data.user}: ${data.text} (Menü → Admin panel → Csevegés)`);
    if (typeof playSound === 'function') playSound('hit');
});

// ---------- Admin panel a játékon belül ----------
function openAdminPanel() {
    const s = document.getElementById('settings-modal');
    if (s) s.classList.add('hidden');
    const frame = document.getElementById('admin-panel-frame');
    const tab = staffUnread ? 'chat' : '';
    if (!frame.src || frame.dataset.tab !== tab) { frame.src = '/admin?embed=1' + (tab ? '#chat' : ''); frame.dataset.tab = tab; }
    document.getElementById('admin-panel-modal').classList.remove('hidden');
    staffUnread = 0; renderMenuBadges();
    return false; // a link ne nyisson új lapot
}
function closeAdminPanel() { document.getElementById('admin-panel-modal').classList.add('hidden'); }
