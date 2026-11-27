// qr-ui.js – QR-matrica beváltása belépés után (v0.1.24). A kódot az auth.js teszi el (sg-qr).
// Kézzel is beírható kód: Menü → QR-matrica (qrManual).
(function () {
    function pending() { try { return localStorage.getItem('sg-qr'); } catch (e) { return null; } }
    socket.on('connect', () => setTimeout(() => { const c = pending(); if (c) socket.emit('qr_claim', { code: c }); }, 1800));
    socket.on('qr_result', (d) => {
        if (!d) return;
        try { localStorage.removeItem('sg-qr'); } catch (e) { /* */ }
        qrShow(d);
    });
})();
function qrShow(d) {
    const m = document.getElementById('qr-modal'); if (!m) { if (typeof showToast === 'function') showToast(d.message); return; }
    document.getElementById('qr-body').innerHTML = d.success
        ? `<div class="sg-qr-big">📮</div><b>MATRICA BEVÁLTVA!</b>${d.label ? `<small>${escapeAttr(d.label)}</small>` : ''}
           <div class="sg-qr-rew"><span>+${d.xp} XP</span><span>+${d.money} $</span></div>
           <p>Ez volt a ${d.count}. matricád. Keress továbbiakat – mindegyik egyszer ad jutalmat!</p>`
        : `<div class="sg-qr-big">${d.already ? '🔎' : '⚠️'}</div><b>${d.already ? 'EZ MÁR MEGVAN' : 'NEM SIKERÜLT'}</b><p>${escapeAttr(d.message || '')}</p>`;
    m.classList.remove('hidden');
}
function qrHide() { const m = document.getElementById('qr-modal'); if (m) m.classList.add('hidden'); }
function qrManual() {
    const c = prompt('Írd be a matrica kódját (7 karakter, a QR-kód alatt):', '');
    if (c && c.trim()) socket.emit('qr_claim', { code: c.trim().toUpperCase() });
}

// ---------- KERESŐ SEGÍTSÉG (v0.1.26): a közeli, még meg nem talált matrica köre a térképen ----------
let qrHintLayers = {}, qrHintSeen = new Set();
function qrHintIcon() {
    return L.divIcon({ className: 'custom-icon', html: '<div class="sg-qr-hint"><span>QR</span></div>', iconSize: [30, 30], iconAnchor: [15, 15] });
}
function qrShowHints(d) {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const keep = new Set();
    ((d && d.hints) || []).forEach(h => {
        keep.add(h.id);
        if (!qrHintLayers[h.id]) {
            const c = L.circle([h.lat, h.lng], { radius: h.r, color: '#d9c58a', weight: 2, dashArray: '6 6', fillColor: '#d9c58a', fillOpacity: 0.12, interactive: false }).addTo(map);
            const m = L.marker([h.lat, h.lng], { icon: qrHintIcon(), zIndexOffset: 400 }).addTo(map)
                .on('click', () => { if (typeof showToast === 'function') showToast(`Egy QR-matrica van ebben a körben (kb. ${h.r} m). Keresd meg, és olvasd be a telefonod kamerájával!`); });
            qrHintLayers[h.id] = [c, m];
        }
        if (!qrHintSeen.has(h.id)) {
            qrHintSeen.add(h.id);
            if (typeof showToast === 'function') showToast(`QR-matrica van a közelben (kb. ${h.dist} m)! Keresd a térképen jelölt körben.`);
        }
    });
    Object.keys(qrHintLayers).forEach(id => { if (!keep.has(id)) { qrHintLayers[id].forEach(x => { try { map.removeLayer(x); } catch (e) { /* */ } }); delete qrHintLayers[id]; } });
}
socket.on('qr_near', qrShowHints);
socket.on('connect', () => setTimeout(() => socket.emit('qr_near'), 4000));
setInterval(() => { if (typeof socket !== 'undefined' && socket.connected && typeof player !== 'undefined' && player && player.username) socket.emit('qr_near'); }, 25000);
