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

