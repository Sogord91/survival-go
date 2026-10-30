// sun.js
// A Nap helyzete egy adott helyen és időpontban (közös a kliensnek és a szervernek).
// Éjszaka van, ha a Nap a látóhatár alatt van (napnyugtától napkeltéig) – a játékos SAJÁT helyén.
(function (root) {
    const RAD = Math.PI / 180;

    // A Nap magassága a látóhatár fölött (fok). Csillagászati közelítés, kb. 1 perc pontosságú napkelte/napnyugta.
    function solarElevation(lat, lng, date) {
        const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // napok J2000 óta
        const g = (357.529 + 0.98560028 * d) * RAD;                 // középanomália
        const q = 280.459 + 0.98564736 * d;                         // középhosszúság
        const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ekliptikai hosszúság
        const e = (23.439 - 0.00000036 * d) * RAD;                  // a földtengely dőlése
        const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
        const dec = Math.asin(Math.sin(e) * Math.sin(L));
        const gmst = (18.697374558 + 24.06570982441908 * d) % 24;  // greenwichi csillagidő (óra)
        const hourAngle = (gmst * 15 + lng) * RAD - ra;
        const sinAlt = Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hourAngle);
        return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
    }

    // Napnyugta után / napkelte előtt (a -0,833° a fénytörés és a napkorong mérete miatt kell)
    function isNight(lat, lng, date) {
        return solarElevation(lat, lng, date || new Date()) < -0.833;
    }

    const api = { solarElevation, isNight };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; // szerver (Node.js)
    if (typeof window !== 'undefined') window.SurvivalSun = api;                // böngésző
})(this);
