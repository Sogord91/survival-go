// teams.js – CSAPATOK közös szabályai (v0.1.22), a szerver és a kliens is ezt használja.
// Címer (jelkép + szín + forma), heti csapatküldetések, szerepek, csatlakozási módok.
(function (root) {
    'use strict';

    const MAX = 15, MIN_LEVEL = 3;
    // Címer: előre megadott jelképekből (nincs képfeltöltés, így nincs mit moderálni)
    const ICONS = ['☢️', '🐺', '🦅', '🐻', '🦊', '🐍', '🦂', '🕷️', '💀', '🔥', '⚡', '❄️', '🌲', '⛰️', '🌙', '☀️', '⚔️', '🛡️', '🏹', '🔧', '🪓', '🎯', '👁️', '🦉', '🐗', '🦌', '🐝', '⚓', '👑', '🏴', '🍀', '💎'];
    const COLORS = ['#7d8f3a', '#4f7a3a', '#3a7a6e', '#3a5f8f', '#5a4a8f', '#8f3a5f', '#a33a2a', '#b8662a', '#c9a227', '#6b6b6b', '#2a2e20', '#8a6a4a'];
    const SHAPES = [{ key: 'shield', name: 'Pajzs' }, { key: 'circle', name: 'Kör' }, { key: 'hex', name: 'Hatszög' }, { key: 'diamond', name: 'Rombusz' }];
    const MODES = [
        { key: 'open', name: 'Nyitott', desc: 'Bárki azonnal beléphet, aki eléri a minimum szintet.' },
        { key: 'request', name: 'Jelentkezéssel', desc: 'Jelentkezni lehet, a vezető vagy a helyettes fogadja el.' },
        { key: 'invite', name: 'Zárt', desc: 'Csak meghívóval lehet belépni.' }
    ];
    const ROLES = { owner: '👑 Vezető', officer: '⭐ Helyettes', member: 'Tag' };

    // Heti csapatküldetések: mindig van közös séta + 2 a többi közül (csapatonként és hetente más).
    // A cél a tagok számával nő (legalább 2 főre számolva, legfeljebb 10 főig).
    const QUESTS = {
        walk: { icon: '🚶', title: 'Közös séta', unit: 'km', per: 15000, div: 1000, reward: { money: 150, xp: 250 }, desc: 'Gyalogoljatok együtt' },
        loot: { icon: '🏚️', title: 'Közös kutatás', unit: 'épület', per: 30, reward: { money: 100, xp: 150 }, desc: 'Kutassatok át épületeket' },
        win: { icon: '⚔️', title: 'Közös harc', unit: 'győzelem', per: 10, reward: { money: 100, xp: 150 }, desc: 'Győzzetek le ellenségeket' },
        cells: { icon: '🗺️', title: 'Közös felfedezés', unit: 'új terület', per: 20, reward: { money: 100, xp: 150 }, desc: 'Fedezzetek fel új területeket' },
        craft: { icon: '🔨', title: 'Közös műhely', unit: 'barkácsolás', per: 8, reward: { money: 100, xp: 150 }, desc: 'Barkácsoljatok tárgyakat' },
        quests: { icon: '📜', title: 'Szorgos csapat', unit: 'küldetés', per: 10, reward: { money: 100, xp: 150 }, desc: 'Teljesítsetek egyéni küldetéseket' }
    };
    const POOL = ['loot', 'win', 'cells', 'craft', 'quests'];
    const ALL_BONUS = { money: 200, xp: 300 };

    function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function questKinds(teamId, week) {
        const pool = POOL.slice(); let h = hash(String(teamId) + '|' + String(week));
        const out = ['walk'];
        for (let i = 0; i < 2; i++) { const j = h % pool.length; out.push(pool.splice(j, 1)[0]); h = Math.floor(h / 7) + 13; }
        return out;
    }
    function target(kind, members) { const d = QUESTS[kind]; return d.per * Math.min(10, Math.max(2, members || 1)); }

    function normEmblem(e) {
        const x = e && typeof e === 'object' ? e : {};
        return {
            icon: ICONS.includes(x.icon) ? x.icon : ICONS[0],
            color: COLORS.includes(x.color) ? x.color : COLORS[0],
            shape: SHAPES.some(s => s.key === x.shape) ? x.shape : 'shield'
        };
    }

    const api = { MAX, MIN_LEVEL, ICONS, COLORS, SHAPES, MODES, ROLES, QUESTS, POOL, ALL_BONUS, questKinds, target, normEmblem, hash };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SurvivalTeams = api;
})(typeof window !== 'undefined' ? window : globalThis);
