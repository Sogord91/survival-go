// roles.js – STÁB RANGOK ÉS JOGOK (v0.1.14). A szerver és a kliens (játék + admin oldal) is ezt használja.
// A tulajdonos az, akinek a neve az ADMIN_USERS környezeti változóban szerepel; a többi rangot ő osztja ki az admin oldalon.
(function (root) {
    const ROLES = [
        { key: 'owner',      name: 'Tulajdonos',        tag: 'TULAJDONOS',  level: 100, color: '#e8c35a' },
        { key: 'superadmin', name: 'Szuper admin',      tag: 'SZUPER ADMIN', level: 80, color: '#e0703a' },
        { key: 'admin',      name: 'Admin',             tag: 'ADMIN',       level: 60,  color: '#d23b2e' },
        { key: 'moderator',  name: 'Moderátor',         tag: 'MODERÁTOR',   level: 40,  color: '#4a9be0' },
        { key: 'cm',         name: 'Community manager', tag: 'COMMUNITY',   level: 30,  color: '#a46ad8' },
        { key: 'helper',     name: 'Segítő',            tag: 'SEGÍTŐ',      level: 10,  color: '#6fc05a' }
    ];
    const BY_KEY = Object.fromEntries(ROLES.map(r => [r.key, r]));
    const ALL = ROLES.map(r => r.key);
    const from = (min) => ROLES.filter(r => r.level >= BY_KEY[min].level).map(r => r.key);

    // jog -> mely rangoknak van meg
    const PERMS = {
        view: ALL,                                        // áttekintés, játékosok, online térkép, napló, hibajelentések olvasása
        reports: ['cm', ...from('moderator')],            // hibajelentések lezárása
        announce: ['cm', ...from('admin')],               // bejelentés, gyors üzenet mindenkinek
        kick: from('moderator'),
        ban_temp: from('moderator'),                      // tiltás legfeljebb 7 napra, feloldás
        ban_perm: from('admin'),                          // hosszabb vagy végleges tiltás
        edit_player: from('admin'),                       // ajándék, gyógyítás, értékek, átnevezés, jelszó
        gift_all: from('admin'),
        events: from('admin'),                            // eventek, élő beállítások
        server: from('superadmin'),                       // szerver állapot, hibák, mentés
        support: ['owner'],                               // csevegés a játékosokkal (egyelőre csak a tulajdonos kapja)
        premium: ['owner'],                               // prémium: rendelések jóváírása, credit kézi módosítása, napló
        emails: ['owner'], export: ['owner'], roles: ['owner']
    };
    const BAN_TEMP_MAX_HOURS = 168;

    function info(key) { return BY_KEY[key] || null; }
    function isStaff(key) { return !!BY_KEY[key]; }
    function can(key, perm) { return !!(PERMS[perm] && PERMS[perm].includes(key)); }
    function level(key) { return BY_KEY[key] ? BY_KEY[key].level : 0; }
    // a tulajdonos mindenkivel bármit; más csak nála alacsonyabb rangúval (vagy sima játékossal)
    function canActOn(actor, target) { return actor === 'owner' || level(actor) > level(target); }
    function permsOf(key) { return Object.keys(PERMS).filter(p => can(key, p)); }

    const api = { ROLES, PERMS, BAN_TEMP_MAX_HOURS, info, isStaff, can, level, canActOn, permsOf };
    root.SurvivalRoles = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
