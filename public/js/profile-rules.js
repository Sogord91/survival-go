// profile-rules.js – a játékosprofil testreszabásának szabályai (v0.1.25). Szerver és kliens is ezt használja.
(function (root) {
    'use strict';
    const COLORS = ['#7d8f3a', '#4f7a3a', '#3a7a6e', '#3a5f8f', '#5a4a8f', '#8f3a5f', '#a33a2a', '#b8662a', '#c9a227', '#6b6b6b', '#2a2e20', '#8a6a4a'];
    const PATTERNS = [
        { key: 'plain', name: 'Sima' }, { key: 'stripes', name: 'Csíkos' }, { key: 'camo', name: 'Terep' },
        { key: 'grid', name: 'Térképháló' }, { key: 'hazard', name: 'Veszély' }, { key: 'dots', name: 'Pöttyös' }
    ];
    const BADGES = ['', '☢️', '🐺', '🦅', '🐻', '🦊', '💀', '🔥', '⚡', '❄️', '🌲', '⛰️', '🌙', '☀️', '⚔️', '🛡️', '🏹', '🔧', '🪓', '🎯', '🧭', '🗺️', '🎒', '🔦', '🍀', '💎', '👑', '🏴'];
    // kiemelhető statisztikák (a profil tetején, nagy csempéken)
    const SHOW = [
        { key: 'km', name: 'Megtett út', icon: '🥾', unit: 'km' },
        { key: 'xp', name: 'Összes XP', icon: '🏆', unit: 'XP' },
        { key: 'cells', name: 'Felfedezés', icon: '🗺️', unit: 'terület' },
        { key: 'loot', name: 'Kutatás', icon: '🏚️', unit: 'épület' },
        { key: 'wins', name: 'Győzelmek', icon: '⚔️', unit: 'harc' },
        { key: 'crafted', name: 'Barkácsolás', icon: '🔨', unit: 'tárgy' },
        { key: 'longestDays', name: 'Leghosszabb élet', icon: '⏳', unit: 'nap' },
        { key: 'season', name: 'E havi pont', icon: '📅', unit: 'pont' }
    ];
    const BIO_MAX = 160;
    const DEFAULT = { bio: '', color: '#7d8f3a', pattern: 'camo', badge: '', show: ['km', 'xp', 'wins'], hideStats: false };

    function normalize(p) {
        const x = p && typeof p === 'object' ? p : {};
        const bio = String(x.bio == null ? '' : x.bio).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO_MAX);
        const show = (Array.isArray(x.show) ? x.show : DEFAULT.show).filter((k, i, a) => SHOW.some(s => s.key === k) && a.indexOf(k) === i).slice(0, 3);
        return {
            bio,
            color: COLORS.includes(x.color) ? x.color : DEFAULT.color,
            pattern: PATTERNS.some(q => q.key === x.pattern) ? x.pattern : DEFAULT.pattern,
            badge: BADGES.includes(x.badge) ? x.badge : '',
            show: show.length ? show : DEFAULT.show.slice(),
            hideStats: !!x.hideStats
        };
    }

    const api = { COLORS, PATTERNS, BADGES, SHOW, BIO_MAX, DEFAULT, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SurvivalProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
