// sw.js – a telepíthető alkalmazás (PWA) szolgáltatás-munkása.
// SEMMIT nem tárol el (nincs gyorsítótár), így a frissítések mindig azonnal megérkeznek.
// Csak annyit csinál, hogy ha nincs internet, az oldal betöltésekor egy rövid üzenetet mutat
// a böngésző hibaoldala helyett. (A Chrome a telepítő ablakhoz ilyen "fetch" kezelőt kér.)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Survival GO</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050b05;color:#a3e635;font-family:monospace;text-align:center;padding:24px">
<div><div style="font-size:48px">📡</div><h2>Nincs kapcsolat a Zónával</h2>
<p>Ellenőrizd az internetkapcsolatot, majd próbáld újra.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:10px 20px;background:#064e3b;color:#a7f3d0;border:1px solid #10b981;border-radius:10px;font-family:monospace">Újrapróbálás</button></div>
</body></html>`;

self.addEventListener('fetch', (event) => {
    // Csak az oldal betöltését kezeljük; minden más kérés (szkriptek, képek, szerver) változatlanul megy.
    if (event.request.mode !== 'navigate') return;
    event.respondWith(
        fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
});

// ===== TELEFONOS ÉRTESÍTÉSEK (v0.1.19) =====
// A szerver titkosított üzenetet küld ({ title, body, url, tag }); ezt értesítésként mutatjuk.
self.addEventListener('push', (event) => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
    const title = d.title || 'Survival GO';
    event.waitUntil(self.registration.showNotification(title, {
        body: d.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png', // egyszínű, átlátszó sziluett: az Android ezt teszi a kis körbe
        tag: d.tag || 'sg',
        renotify: true,
        data: { url: d.url || '/' }
    }));
});
// Koppintásra: ha már nyitva van a játék, előre hozzuk; különben megnyitjuk
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) { if ('focus' in c) { c.focus(); if (url !== '/' && 'navigate' in c) c.navigate(url).catch(() => { }); return; } }
        return self.clients.openWindow(url);
    }));
});
