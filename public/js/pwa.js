// pwa.js – telepíthető alkalmazás (PWA): szolgáltatás-munkás és a Menü "Letöltés a telefonra" gombja.
// Elsőként töltődik be, hogy a böngésző telepítési eseménye (beforeinstallprompt) biztosan ne vesszen el.
// ===== TELEPÍTÉS ALKALMAZÁSKÉNT (PWA) =====
// Androidon (Chrome, Samsung Internet, Edge) a böngésző saját telepítő ablakát nyitjuk meg.
// Ahol ilyen nincs (iPhone Safari, Firefox), a gomb megmutatja, hogyan lehet kézzel hozzáadni.
// Ha a játék már telepítve fut (önálló ablakban), a gomb elrejtőzik.
let deferredInstallPrompt = null;

// A szolgáltatás-munkás (sw.js) nem tárol semmit, csak a telepíthetőséghez és az offline üzenethez kell
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker hiba:', err));
    });
}

function isRunningAsApp() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function updateInstallButton() {
    const btn = document.getElementById('btn-install');
    if (btn) btn.classList.toggle('hidden', isRunningAsApp());
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ne a böngésző saját sávja jöjjön fel, hanem a mi gombunkra
    deferredInstallPrompt = e;
    updateInstallButton();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    logMessage('📲 A Survival GO felkerült a telefonodra! Mostantól a kezdőképernyőről is indíthatod.');
    updateInstallButton();
});

async function installApp() {
    const help = document.getElementById('install-help');
    if (deferredInstallPrompt) {
        const promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null; // egy esemény csak egyszer használható
        try {
            promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            if (choice && choice.outcome === 'accepted') logMessage('📲 Telepítés folyamatban...');
        } catch (err) {
            console.warn('Telepítési hiba:', err);
        }
        return;
    }
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (help) {
        help.textContent = ios
            ? 'iPhone / iPad: nyisd meg a játékot Safariban, nyomd meg alul a Megosztás gombot (négyzet felfelé nyíllal), majd válaszd a „Főképernyőhöz adás” lehetőséget.'
            : 'Nyisd meg a böngésző menüjét (jobb felül ⋮), és válaszd az „Alkalmazás telepítése” vagy a „Hozzáadás a kezdőképernyőhöz” lehetőséget.';
        help.classList.remove('hidden');
    }
}


// ===== TELEFONOS ÉRTESÍTÉSEK (v0.1.19) =====
// Androidon a böngészőben is működik; iPhone-on csak a kezdőképernyőre tett (telepített) játékban (iOS 16.4+).
function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}
function isIos() {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}
async function pushCurrent() {
    if (!pushSupported()) return null;
    try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; }
}
function b64uToBytes(s) {
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}
// Bekapcsolás: engedélykérés, feliratkozás, és a feliratkozás elküldése a szervernek
async function pushEnable() {
    if (!pushSupported()) {
        const msg = isIos() && !isRunningAsApp()
            ? 'iPhone-on előbb tedd ki a játékot a kezdőképernyőre (Megosztás → Főképernyőhöz adás), és onnan indítva kapcsold be az értesítéseket.'
            : 'Ez a böngésző nem tud értesítést küldeni. Próbáld Chrome-ban, vagy tedd ki a játékot a kezdőképernyőre.';
        if (typeof showToast === 'function') showToast(msg);
        return false;
    }
    try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            if (typeof showToast === 'function') showToast('Az értesítések tiltva vannak. A böngésző beállításaiban (lakat ikon → Értesítések) engedélyezheted.');
            updatePushButton();
            return false;
        }
        const r = await fetch('/api/push/key').then(x => x.json());
        if (!r || !r.key) throw new Error('nincs kulcs');
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(r.key) });
        socket.emit('push_subscribe', { ...sub.toJSON(), ua: navigator.userAgent });
        try { localStorage.setItem('sg-push', 'on'); } catch (e) { }
        updatePushButton(true);
        return true;
    } catch (err) {
        console.warn('Értesítés hiba:', err);
        if (typeof showToast === 'function') showToast('Nem sikerült bekapcsolni az értesítéseket. Próbáld újra később.');
        return false;
    }
}
async function pushDisable() {
    const sub = await pushCurrent();
    if (sub) { socket.emit('push_unsubscribe', { endpoint: sub.endpoint }); try { await sub.unsubscribe(); } catch (e) { } }
    try { localStorage.setItem('sg-push', 'off'); } catch (e) { }
    updatePushButton(false);
}
async function togglePush() {
    const sub = await pushCurrent();
    if (sub && Notification.permission === 'granted') pushDisable(); else pushEnable();
}
async function updatePushButton(forceOn) {
    const btn = document.getElementById('btn-push');
    if (!btn) return;
    const on = forceOn === undefined ? !!(await pushCurrent()) && window.Notification && Notification.permission === 'granted' : forceOn;
    btn.textContent = on ? '🔔 Értesítések: BEKAPCSOLVA (koppints a kikapcsoláshoz)' : '🔕 Értesítések bekapcsolása a telefonon';
    btn.classList.toggle('sg-push-on', !!on);
}
// Belépéskor: ha már engedélyezte, frissítjük a szervernél a feliratkozást (pl. új szerver, új kulcs)
async function pushRefresh() {
    const sub = await pushCurrent();
    if (sub && window.Notification && Notification.permission === 'granted') socket.emit('push_subscribe', { ...sub.toJSON(), ua: navigator.userAgent });
    updatePushButton();
}

// ===== "LEGYEN KÉZNÉL A ZÓNA" ajánló (telepítés + értesítés), legfeljebb 3 naponta egyszer =====
async function appPromptNeeded() {
    const installed = isRunningAsApp();
    const pushOn = !!(await pushCurrent()) && window.Notification && Notification.permission === 'granted';
    const pushPossible = pushSupported() && !(window.Notification && Notification.permission === 'denied');
    return { installed, pushOn, pushPossible, needed: !installed || (!pushOn && pushPossible) };
}
function appCardHtml(st) {
    const ios = isIos();
    const install = st.installed ? '<div class="sg-app-done">✓ A játék már a kezdőképernyődön van.</div>'
        : `<button class="sg-tu-big" onclick="appInstallClick()">📲 TEDD KI A KEZDŐKÉPERNYŐRE</button>
           <div id="app-install-help" class="sg-app-help${ios ? '' : ' hidden'}">${ios ? 'iPhone: Safariban nyomd meg alul a <b>Megosztás</b> gombot (négyzet felfelé nyíllal), majd <b>Főképernyőhöz adás</b>.' : ''}</div>`;
    const push = st.pushOn ? '<div class="sg-app-done">✓ Az értesítések be vannak kapcsolva.</div>'
        : st.pushPossible ? `<button class="sg-tu-big sg-tu-ghost" onclick="appPushClick()">🔔 KÉREK ÉRTESÍTÉST</button>
           <div class="sg-app-help">Csak a fontosakról: mai adventi ablak, ajándékvadászat, ha a stáb válaszolt neked. Naponta legfeljebb egy emlékeztető.</div>`
        : (ios && !st.installed ? '<div class="sg-app-help">Értesítést iPhone-on akkor kapsz, ha előbb kiteszed a játékot a kezdőképernyőre, és onnan indítod.</div>' : '');
    return `<div class="sg-app">${install}${push}</div>`;
}
async function appInstallClick() {
    await installApp();
    const h = document.getElementById('app-install-help'), src = document.getElementById('install-help');
    if (h && src && src.textContent) { h.innerHTML = src.textContent; h.classList.remove('hidden'); }
}
async function appPushClick() {
    const ok = await pushEnable();
    if (ok) { const st = await appPromptNeeded(); document.querySelectorAll('.sg-app-box').forEach(b => { b.innerHTML = appCardHtml(st); }); }
}
async function maybeShowAppPrompt() {
    let last = 0;
    try { last = Number(localStorage.getItem('sg-app-prompt') || 0); } catch (e) { }
    if (Date.now() - last < 3 * 86400000) return;
    const st = await appPromptNeeded();
    if (!st.needed) return;
    const modal = document.getElementById('app-modal');
    if (!modal) return;
    modal.querySelector('.sg-app-box').innerHTML = appCardHtml(st);
    modal.classList.remove('hidden');
    try { localStorage.setItem('sg-app-prompt', String(Date.now())); } catch (e) { }
}
function closeAppPrompt() { document.getElementById('app-modal').classList.add('hidden'); }
// Belépés után, ha épp nincs nyitva másik ablak (napi bónusz, bevezető), legfeljebb 3 naponta egyszer
function scheduleAppPrompt() {
    let tries = 0;
    const tick = () => {
        tries++;
        const busy = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'));
        if (busy) { if (tries < 8) setTimeout(tick, 15000); return; }
        maybeShowAppPrompt();
    };
    setTimeout(tick, 25000);
}
function appLater() { closeAppPrompt(); }
