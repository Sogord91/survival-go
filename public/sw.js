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
