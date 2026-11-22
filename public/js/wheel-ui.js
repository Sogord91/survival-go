// wheel-ui.js – a szerencsekerék rajza és pörgetése (Fagyos Csend, v0.1.19)
// A nyereményt a szerver dönti el; a kerék ide pörög, a cikkek az esélyekkel arányosak (wheel.js).
let wheelAngle = 0;      // a kerék jelenlegi elfordulása (fok)
let wheelSpinning = false;

function wheelSvg() {
    const W = window.SurvivalWheel, segs = W.segments();
    const R = 140, C = 150;
    const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
    const paths = segs.map((s, i) => {
        const p = W.BY_KEY[s.key];
        const [x1, y1] = pt(s.from, R), [x2, y2] = pt(s.to, R);
        const mid = (s.from + s.to) / 2;
        const base = p.rare === 'jackpot' ? 'url(#wg-gold)' : p.rare ? shade(p.color, -35) : (i % 2 ? '#3a2c1c' : '#4a3a24');
        const [cx, cy] = pt(mid, R * 0.66);
        return `<path d="M${C},${C} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z" fill="${base}" stroke="#15100a" stroke-width="1.5"/>
            <g transform="rotate(${mid} ${cx} ${cy})">${wheelPrizeArt(p, cx, cy)}</g>`;
    }).join('');
    // izzók a perem körül
    const bulbs = Array.from({ length: 24 }, (_, k) => { const [x, y] = pt(k * 15, R + 4); return `<circle class="sg-wh-bulb" style="--k:${k}" cx="${x}" cy="${y}" r="3.6"/>`; }).join('');
    return `<svg viewBox="0 0 300 300" class="sg-wh-svg">
        <defs><linearGradient id="wg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffcc33"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
        <radialGradient id="wg-hub"><stop offset="0" stop-color="#d8d0c0"/><stop offset="1" stop-color="#5a5244"/></radialGradient>
        <filter id="wg-frost"><feColorMatrix type="matrix" values="0.35 0.35 0.35 0 0.05  0.45 0.5 0.45 0 0.15  0.6 0.65 0.7 0 0.3  0 0 0 1 0"/></filter>
        <filter id="wg-glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <clipPath id="wg-ava"><circle cx="0" cy="0" r="11"/></clipPath></defs>
        <circle cx="150" cy="150" r="148" fill="#2a1d10" stroke="#8a6a3a" stroke-width="4"/>
        <g id="wheel-rot" style="transform-origin:150px 150px;transform:rotate(${wheelAngle}deg)">${paths}</g>
        ${bulbs}
        <circle cx="150" cy="150" r="22" fill="url(#wg-hub)" stroke="#15100a" stroke-width="3"/><text x="150" y="151" text-anchor="middle" dominant-baseline="central" font-size="18">❄</text>
    </svg><div class="sg-wh-pointer"></div>`;
}
// Egy cikk képe: a tárgy ikonja, a keret gyűrűje, pénz/kristály kép, vagy felirat
function wheelPrizeArt(p, cx, cy) {
    const img = (href, size, extra) => `<image href="${href}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" ${extra || ''}/>`;
    const txt = (t, dy, size, color) => `<text x="${cx}" y="${cy + dy}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="800" fill="${color || '#fff3d0'}" stroke="#000" stroke-width="2.4" paint-order="stroke" font-family="Arial, sans-serif">${t}</text>`;
    const item = (key) => { const it = typeof itemDatabase !== 'undefined' && itemDatabase[key]; return it && it.img ? `/images/items/${it.img}.webp` : null; };
    if (p.kind === 'item') {
        const href = item(p.item);
        return (href ? img(href, 40) : txt(p.icon, 0, 26)) + (p.count > 1 ? txt('×' + p.count, 22, 11) : '');
    }
    if (p.kind === 'xp') return txt('+' + p.amount, -4, 13, '#9fd8ff') + txt('XP', 10, 10, '#9fd8ff');
    if (p.kind === 'money') return img('/images/premium/coins.webp', 32) + txt('+' + p.amount + ' $', 19, 9.5, '#ffe39a');
    if (p.kind === 'credits') return img('/images/premium/gem.webp', 36, 'filter="url(#wg-glow)"') + txt('100', 18, 11, '#fff') ;
    if (p.kind === 'paint') {
        const href = item(p.paint === 'paint_frost_weapon' ? 'ak47' : 'parka');
        return (href ? img(href, 40, 'filter="url(#wg-frost)"') : '') + txt('❄', -14, 11, '#dff4ff');
    }
    if (p.kind === 'cosmetic') {
        const c = (window.SurvivalShop && SurvivalShop.BY_KEY[p.cosmetic]) || { kind: 'frame', color: p.color };
        if (c.kind === 'frame') return `<g transform="translate(${cx} ${cy})"><image href="/images/avatars/avatar1.png" x="-11" y="-11" width="22" height="22" clip-path="url(#wg-ava)" opacity=".85"/>
            <circle r="12.5" fill="none" stroke="${c.color}" stroke-width="3.5" filter="url(#wg-glow)"/></g>`;
        return `<rect x="${cx - 17}" y="${cy - 7}" width="34" height="14" rx="2" fill="#15100a" stroke="${c.color}" stroke-width="1.5"/>` + txt('CÍM', 0, 8, c.color) + txt(p.icon, -16, 12);
    }
    return txt(p.icon, 0, 20);
}
function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c + c * pct / 100)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// A kerék a nyereményre pörög (a mutató fent van). done() a megállás után fut.
function wheelSpinTo(prizeKey, done) {
    const W = window.SurvivalWheel;
    const seg = W.segments().find(s => s.key === prizeKey);
    const rot = document.getElementById('wheel-rot');
    if (!seg || !rot) { if (done) done(); return; }
    wheelSpinning = true;
    const inside = seg.from + (seg.to - seg.from) * (0.2 + Math.random() * 0.6); // a cikken belül egy pont
    const base = Math.ceil(wheelAngle / 360) * 360;
    const target = base + 360 * 8 + (360 - inside); // 8 teljes kör, majd a cikk a mutató alá
    const DURATION = 8500;
    rot.style.transition = `transform ${DURATION}ms cubic-bezier(.08,.7,.06,1)`;
    void rot.getBoundingClientRect();
    rot.style.transform = `rotate(${target}deg)`;
    // kattogás: a cikkhatárokon (a lassulás miatt egyre ritkábban)
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4.2);
    let lastTick = -1;
    const tick = (now) => {
        const t = Math.min(1, (now - start) / DURATION);
        const ang = wheelAngle + (target - wheelAngle) * ease(t);
        const n = Math.floor(ang / 15);
        if (n !== lastTick) { lastTick = n; const p = document.querySelector('.sg-wh-pointer'); if (p) { p.classList.remove('tick'); void p.offsetWidth; p.classList.add('tick'); } if (navigator.vibrate && t < .85) { try { navigator.vibrate(4); } catch (e) {} } }
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => { wheelAngle = target % 360; rot.style.transition = 'none'; rot.style.transform = `rotate(${wheelAngle}deg)`; wheelSpinning = false; if (done) done(); }, DURATION + 120);
}

// Esélytáblázat a kerék alatt
function wheelOddsHtml() {
    const W = window.SurvivalWheel;
    return `<table class="sg-odds">${W.PRIZES.map(p => `<tr><td><span class="sg-wh-dot" style="background:${p.rare === 'jackpot' ? '#ffcc33' : p.color}"></span>${p.icon} ${escapeAttr(p.label)}</td><td class="n">${(p.chance * 100).toLocaleString('hu-HU', { maximumFractionDigits: 1 })}%</td></tr>`).join('')}</table>`;
}
