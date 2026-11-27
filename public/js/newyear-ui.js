// newyear-ui.js – SZILVESZTER a kliensen (v0.1.35): tűzijáték a térképen, éjféli műsor, újévi köszöntő, visszaszámláló.
let newYearActive = false, newYearTest = false, nyMidnight = 0, nyShowUntil = 0, nyTimer = null;

// ---------- részecskés tűzijáték egy vásznon a térkép fölött ----------
const nyFx = { canvas: null, ctx: null, parts: [], rockets: [], running: false, last: 0 };
function nyCanvas() {
    if (nyFx.canvas) return nyFx.canvas;
    const c = document.createElement('canvas');
    c.id = 'fireworks-canvas';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1200';
    document.body.appendChild(c);
    nyFx.canvas = c; nyFx.ctx = c.getContext('2d');
    const fit = () => { const r = window.devicePixelRatio || 1; c.width = innerWidth * r; c.height = innerHeight * r; nyFx.ctx.setTransform(r, 0, 0, r, 0, 0); };
    fit(); addEventListener('resize', fit);
    return c;
}
const NY_COLORS = ['#ffd75e', '#ff5e5e', '#5ec8ff', '#7dff8a', '#ff8af0', '#ffffff', '#ffa94d'];
// egy rakéta: x,y képernyőpont (ahol felrobban); size: robbanás mérete
function nyLaunch(x, y, size) {
    nyCanvas();
    const color = NY_COLORS[Math.floor(Math.random() * NY_COLORS.length)];
    nyFx.rockets.push({ x, y: innerHeight + 10, tx: x, ty: y, vy: -(innerHeight - y) / 0.9, color, size: size || 1 });
    nyBoomSound(0.9);
    if (!nyFx.running) { nyFx.running = true; nyFx.last = performance.now(); requestAnimationFrame(nyTick); }
}
function nyBurst(r) {
    const n = Math.round(60 * r.size), c2 = NY_COLORS[Math.floor(Math.random() * NY_COLORS.length)];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1, sp = (90 + Math.random() * 110) * r.size;
        nyFx.parts.push({ x: r.tx, y: r.ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4 + Math.random() * 0.6, age: 0, color: i % 3 ? r.color : c2 });
    }
    nyBoomSound(0.25);
}
function nyTick(t) {
    const dt = Math.min(0.05, (t - nyFx.last) / 1000); nyFx.last = t;
    const ctx = nyFx.ctx;
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    nyFx.rockets = nyFx.rockets.filter(r => {
        r.y += r.vy * dt;
        ctx.fillStyle = '#ffe9b0'; ctx.fillRect(r.x - 1.5, r.y, 3, 9);
        if (r.y <= r.ty) { nyBurst(r); return false; }
        return true;
    });
    nyFx.parts = nyFx.parts.filter(p => {
        p.age += dt; if (p.age >= p.life) return false;
        p.vy += 60 * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
        return true;
    });
    ctx.globalAlpha = 1;
    if (nyShowUntil > Date.now() && Math.random() < dt * 2.6) nyLaunch(innerWidth * (0.1 + Math.random() * 0.8), innerHeight * (0.12 + Math.random() * 0.4), 1 + Math.random() * 0.6);
    if (nyFx.rockets.length || nyFx.parts.length || nyShowUntil > Date.now()) requestAnimationFrame(nyTick);
    else { nyFx.running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
function nyBoomSound(vol) {
    try {
        if (typeof initAudio === 'function') initAudio();
        if (typeof audioCtx === 'undefined' || !audioCtx) return;
        const len = audioCtx.sampleRate * 0.5, buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const src = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.25 * vol;
        src.buffer = buf; src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
    } catch (e) { }
}

// egy kilőtt rakéta a térképen (a lövő helyén, a képernyőn kívül is a széle felé)
function nyFireworkAt(lat, lng, big) {
    let x = innerWidth / 2, y = innerHeight * 0.3;
    try { if (typeof map !== 'undefined' && map) { const p = map.latLngToContainerPoint([lat, lng]); x = Math.max(30, Math.min(innerWidth - 30, p.x)); y = Math.max(60, Math.min(innerHeight * 0.6, p.y - 120)); } } catch (e) { }
    const n = big ? 6 : 1;
    for (let i = 0; i < n; i++) setTimeout(() => nyLaunch(x + (big ? (Math.random() - 0.5) * 160 : 0), y + (big ? (Math.random() - 0.5) * 80 : 0), big ? 1.3 : 1), i * 420);
}

// ---------- éjféli műsor és köszöntő ----------
function nyStartShow() {
    if (nyShowUntil > Date.now()) return;
    nyShowUntil = Date.now() + (window.SurvivalNewYear ? SurvivalNewYear.SHOW_SECONDS : 90) * 1000;
    for (let i = 0; i < 5; i++) setTimeout(() => nyLaunch(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.3), 1.4), i * 300);
    nyShowGreeting(true);
}
function nyShowGreeting(force) {
    const G = window.SurvivalNewYear && SurvivalNewYear.GREETING;
    if (!G) return;
    const key = 'sg_ny_greet_' + SurvivalNewYear.YEAR;
    try { if (!force && localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { }
    let m = document.getElementById('newyear-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'newyear-modal';
        m.className = 'fixed inset-0 modal flex items-center justify-center p-3';
        m.style.zIndex = '3600';
        m.onclick = (e) => { if (e.target === m) m.remove(); };
        document.body.appendChild(m);
    }
    m.innerHTML = `<div class="hud-panel sg-ny-card">
        <div class="sg-ny-year">${SurvivalNewYear.YEAR}</div>
        <div class="sg-ny-title">${G.title}</div>
        ${G.lines.map(l => `<p>${l}</p>`).join('')}
        <div class="sg-ny-sign">${G.sign}</div>
        <button class="sg-ny-btn" onclick="document.getElementById('newyear-modal').remove()">BOLDOG ÚJ ÉVET!</button>
    </div>`;
}
// dec. 31-én este visszaszámláló a térkép tetején
function nyCountdown() {
    let chip = document.getElementById('ny-chip');
    const left = nyMidnight - Date.now();
    if (!newYearActive || left <= 0 || left > 12 * 3600 * 1000) { if (chip) chip.remove(); return; }
    if (!chip) { chip = document.createElement('div'); chip.id = 'ny-chip'; chip.className = 'sg-ny-chip'; chip.onclick = () => logMessage('Éjfélkor tűzijáték mindenkinek! Lőj fel te is egy rakétát (Készlet → Tűzijáték Rakéta).'); document.body.appendChild(chip); }
    const h = Math.floor(left / 3600000), mi = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
    chip.innerHTML = `ÚJÉVIG <b>${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}</b>`;
}
function nyClock() {
    nyCountdown();
    const now = Date.now();
    if (window.SurvivalNewYear && SurvivalNewYear.showOn(now, newYearTest) && nyShowUntil < now) nyStartShow();
    // aki éjfél után, jan. 1-jén lép be először, az is megkapja a köszöntőt
    if (newYearActive && !newYearTest && now >= nyMidnight && now < nyMidnight + 86400000) nyShowGreeting(false);
}

if (typeof socket !== 'undefined' && socket) {
    socket.on('newyear_config', (d) => {
        newYearActive = !!(d && d.active); newYearTest = !!(d && d.test); nyMidnight = (d && d.midnight) || 0;
        clearInterval(nyTimer);
        if (newYearActive) { nyTimer = setInterval(nyClock, 1000); setTimeout(nyClock, 2500); }
        if (typeof renderCraftList === 'function') try { renderCraftList(); } catch (e) { }
    });
    socket.on('newyear_start', () => nyStartShow()); // a szerver is szól éjfélkor
    socket.on('firework', (d) => {
        if (!d) return;
        nyFireworkAt(d.lat, d.lng, d.big);
        if (!d.me && typeof logMessage === 'function') logMessage(`✨ ${d.by} tűzijátékot lőtt fel a közelben!`);
    });
    socket.on('party_horn', (d) => { if (d && !d.me && typeof logMessage === 'function') logMessage(`🎉 ${d.by} dudál a közelben!`); nyBoomSound(0.15); });
    socket.on('sparkler', () => { for (let i = 0; i < 3; i++) setTimeout(() => nyLaunch(innerWidth / 2 + (Math.random() - 0.5) * 80, innerHeight * 0.55, 0.45), i * 250); });
    socket.on('newyear_gift', (d) => { if (d && d.message && typeof logMessage === 'function') logMessage(d.message); if (d && d.success && typeof showToast === 'function') showToast(d.message); });
    socket.on('special_result', (d) => {
        if (!d || !d.message) return;
        if (typeof logMessage === 'function') logMessage((d.success ? '' : '⚠️ ') + d.message);
        if (typeof showToast === 'function' && (!d.success || /Palackposta|rejtekhely/.test(d.message))) showToast(d.message);
    });
}
