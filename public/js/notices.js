// notices.js – bejelentések (üdvözlő üzenet, hírek), rendszerüzenetek, event jelző és hibajelentés (v0.1.13)

// ---------- Bejelentések: egyenként, sorban; a "Rendben" után a szerver megjegyzi, hogy olvastad ----------
let announceQueue = [];
let announceCurrent = null;

function announceShowNext() {
    if (announceCurrent || !announceQueue.length) return;
    // az Első lépések bevezetője előbb mehet végig
    const intro = document.getElementById('intro-modal');
    if (intro && !intro.classList.contains('hidden')) { setTimeout(announceShowNext, 1500); return; }
    announceCurrent = announceQueue.shift();
    document.getElementById('announce-title').textContent = announceCurrent.title;
    const d = announceCurrent.createdAt ? new Date(announceCurrent.createdAt) : null;
    document.getElementById('announce-from').textContent = 'A ZÓNA RÁDIÓJA' + (d ? ' · ' + d.toLocaleDateString('hu-HU') : '');
    document.getElementById('announce-body').textContent = announceCurrent.body;
    document.getElementById('announce-ok').textContent = announceQueue.length ? `RENDBEN (még ${announceQueue.length})` : 'RENDBEN';
    document.getElementById('announce-modal').classList.remove('hidden');
}
function announceOk() {
    if (announceCurrent && typeof socket !== 'undefined' && socket) socket.emit('announcement_seen', { id: announceCurrent.id });
    announceCurrent = null;
    document.getElementById('announce-modal').classList.add('hidden');
    setTimeout(announceShowNext, 250);
}
socket.on('announcements', (data) => {
    const list = (data && Array.isArray(data.list)) ? data.list : [];
    list.forEach(a => { if (a && a.id && !announceQueue.some(x => x.id === a.id) && !(announceCurrent && announceCurrent.id === a.id)) announceQueue.push(a); });
    setTimeout(announceShowNext, 600);
});

// ---------- Rendszerüzenet (pl. "5 perc múlva frissítés", ajándék érkezett) ----------
socket.on('server_notice', (data) => {
    const text = data && data.text ? String(data.text) : '';
    if (!text) return;
    // a napló alján is megmarad (felül nem kell külön értesítés, ott a nagy sáv)
    if (typeof logMessage === 'function' && typeof gameLogVisible === 'function' && gameLogVisible()) logMessage(text);
    const el = document.createElement('div');
    el.className = 'sg-notice-big';
    el.textContent = text;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
    if (typeof playSound === 'function') playSound('hit');
    setTimeout(() => el.remove(), data.big ? 15000 : 8000);
});

// ---------- Event jelző (pl. DUPLA XP HÉTVÉGE) ----------
let currentEvent = null;
function renderEventChip() {
    const chip = document.getElementById('event-chip');
    if (!chip) return;
    const e = currentEvent;
    if (!e || (e.until && Date.now() > e.until)) { chip.classList.add('hidden'); return; }
    const parts = [];
    if (e.xp > 1) parts.push(`${e.xp}× XP`);
    if (e.loot > 1) parts.push(`${e.loot}× ZSÁKMÁNY`);
    const until = e.until ? ' · ' + new Date(e.until).toLocaleString('hu-HU', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '-ig' : '';
    chip.textContent = '🎉 ' + [e.name ? e.name.toUpperCase() : '', parts.join(' · ')].filter(Boolean).join(' · ') + until;
    chip.classList.remove('hidden');
}
socket.on('game_event', (data) => { currentEvent = data && data.event ? data.event : null; renderEventChip(); });
setInterval(renderEventChip, 60000);

// ---------- Hibajelentés ----------
function openBugModal() {
    const s = document.getElementById('settings-modal');
    if (s) s.classList.add('hidden');
    document.getElementById('bug-msg').textContent = '';
    document.getElementById('bug-modal').classList.remove('hidden');
    setTimeout(() => { const t = document.getElementById('bug-text'); if (t) t.focus(); }, 50);
}
function closeBugModal() { document.getElementById('bug-modal').classList.add('hidden'); }
function sendBugReport() {
    const ta = document.getElementById('bug-text');
    const text = ta.value.trim();
    if (text.length < 3) { document.getElementById('bug-msg').textContent = 'Írj le pár szót a hibáról.'; return; }
    document.getElementById('bug-send').disabled = true;
    socket.emit('bug_report', { text, ua: navigator.userAgent });
}
socket.on('bug_report_result', (data) => {
    document.getElementById('bug-send').disabled = false;
    document.getElementById('bug-msg').textContent = (data && data.message) || '';
    if (data && data.success) {
        document.getElementById('bug-text').value = '';
        setTimeout(closeBugModal, 1200);
    }
});
