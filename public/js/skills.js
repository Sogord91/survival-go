// skills.js
// KÉPESSÉGFA (v0.1.20): 4 ág (Harcos, Túlélő, Felderítő, Mesterember), áganként 9 képesség.
// Szintenként 1 pont, minden 10. szinten +1. A szintek a sorokat az ágban elköltött pontokkal nyitják (0 / 5 / 10 / 15 / 30).
// Halálkor (új túlélő) a képességek is elvesznek. Újraosztás: 1 ingyen, utána pénzért vagy kristályért (a szinttel drágul).
// Közös a kliensnek és a szervernek: a hatásokat a szerver számolja, a kliens csak megjeleníti.
(function (root) {
    const TIERS = [0, 5, 10, 15, 30];
    const BRANCHES = [
        { key: 'harcos', name: 'Harcos', color: '#c0483a', icon: '⚔️', desc: 'Sebzés, kritikus találat, védelem.' },
        { key: 'tulelo', name: 'Túlélő', color: '#6f9a3c', icon: '❤️', desc: 'Élet, éhség és szomj, gyógyulás, teherbírás.' },
        { key: 'felderito', name: 'Felderítő', color: '#3f7fb5', icon: '🧭', desc: 'Séta, kutatás, felfedezés, kevesebb veszély.' },
        { key: 'mester', name: 'Mesterember', color: '#c98b2b', icon: '🔧', desc: 'Kopás, javítás, barkácsolás.' }
    ];
    // tier: a sor indexe (TIERS[tier] pont kell hozzá az ágban); max: rangok; per: rangonkénti érték; fx: a hatás kulcsa
    // cap: csúcsképesség (1 rang, a 15. és 30. pontnál)
    const SKILLS = [
        // --- HARCOS ---
        { key: 'h_melee', branch: 'harcos', tier: 0, max: 5, per: 0.05, fx: 'dmgMelee', icon: '🔪', name: 'Erős kar', desc: (v) => `+${pct(v)} közelharci sebzés` },
        { key: 'h_ranged', branch: 'harcos', tier: 0, max: 5, per: 0.05, fx: 'dmgRanged', icon: '🎯', name: 'Biztos kéz', desc: (v) => `+${pct(v)} lőfegyver- és íjsebzés` },
        { key: 'h_crit', branch: 'harcos', tier: 1, max: 5, per: 0.02, fx: 'critChance', icon: '💢', name: 'Gyenge pont', desc: (v) => `+${pct(v)} esély kritikus találatra` },
        { key: 'h_def', branch: 'harcos', tier: 1, max: 5, per: 2, fx: 'defense', icon: '🛡️', name: 'Kemény bőr', desc: (v) => `+${v} védelem` },
        { key: 'h_critd', branch: 'harcos', tier: 2, max: 5, per: 0.1, fx: 'critDmg', icon: '🩸', name: 'Kegyetlen csapás', desc: (v) => `+${pct(v)} kritikus sebzés` },
        { key: 'h_loot', branch: 'harcos', tier: 2, max: 5, per: 0.1, fx: 'combatMoney', icon: '💰', name: 'Hadizsákmány', desc: (v) => `+${pct(v)} pénz a legyőzött ellenségektől` },
        { key: 'h_first', branch: 'harcos', tier: 3, max: 1, per: 1, fx: 'firstStrike', cap: true, icon: '⚡', name: 'Rajtaütés', desc: () => 'A harc első ütése +50% sebzést okoz' },
        { key: 'h_flee', branch: 'harcos', tier: 3, max: 5, per: 0.03, fx: 'flee', icon: '🏃', name: 'Taktikai visszavonulás', desc: (v) => `+${pct(v)} esély a menekülésre` },
        { key: 'h_frenzy', branch: 'harcos', tier: 4, max: 1, per: 0.15, fx: 'winHeal', cap: true, icon: '🔥', name: 'Harci láz', desc: () => 'Minden győzelem után visszakapod a max. életed 15%-át' },
        // --- TÚLÉLŐ ---
        { key: 't_hp', branch: 'tulelo', tier: 0, max: 5, per: 8, fx: 'maxHp', icon: '❤️', name: 'Edzett test', desc: (v) => `+${v} max. élet` },
        { key: 't_needs', branch: 'tulelo', tier: 0, max: 5, per: 0.05, fx: 'needSave', icon: '🥫', name: 'Takarékos szervezet', desc: (v) => `${pct(v)}-kal lassabban éhezel és szomjazol` },
        { key: 't_heal', branch: 'tulelo', tier: 1, max: 5, per: 0.1, fx: 'healPct', icon: '🩹', name: 'Elsősegély', desc: (v) => `+${pct(v)} gyógyulás kötszerből és gyógyszerből` },
        { key: 't_food', branch: 'tulelo', tier: 1, max: 5, per: 0.08, fx: 'foodPct', icon: '🍲', name: 'Jó étvágy', desc: (v) => `+${pct(v)} az ételek és italok hatásából` },
        { key: 't_fatigue', branch: 'tulelo', tier: 2, max: 5, per: 0.04, fx: 'fatigueSave', icon: '😮‍💨', name: 'Kitartás', desc: (v) => `${pct(v)}-kal lassabban fáradsz` },
        { key: 't_weight', branch: 'tulelo', tier: 2, max: 5, per: 3, fx: 'maxWeight', icon: '🎒', name: 'Teherhordó', desc: (v) => `+${v} kg teherbírás` },
        { key: 't_last', branch: 'tulelo', tier: 3, max: 1, per: 1, fx: 'lastStand', cap: true, icon: '🫀', name: 'Utolsó lehelet', desc: () => 'Harconként egyszer a halálos ütést 1 élettel túléled' },
        { key: 't_rest', branch: 'tulelo', tier: 3, max: 5, per: 0.1, fx: 'restPct', icon: '😴', name: 'Mély pihenés', desc: (v) => `+${pct(v)} gyorsabb pihenés` },
        { key: 't_master', branch: 'tulelo', tier: 4, max: 1, per: 1, fx: 'survivor', cap: true, icon: '🏕️', name: 'Túlélőművész', desc: () => '+2 hátizsákhely és +20 max. élet' },
        // --- FELDERÍTŐ ---
        { key: 'f_walk', branch: 'felderito', tier: 0, max: 5, per: 0.06, fx: 'walkXp', icon: '🚶', name: 'Gyors léptek', desc: (v) => `+${pct(v)} XP a sétáért` },
        { key: 'f_search', branch: 'felderito', tier: 0, max: 5, per: 0.06, fx: 'searchFast', icon: '⏱️', name: 'Gyakorlott kutató', desc: (v) => `${pct(v)}-kal gyorsabb átkutatás` },
        { key: 'f_quiet', branch: 'felderito', tier: 1, max: 5, per: 0.05, fx: 'encounterSave', icon: '🤫', name: 'Csendes léptek', desc: (v) => `${pct(v)}-kal ritkábban támadnak rád az épületekben` },
        { key: 'f_eye', branch: 'felderito', tier: 1, max: 5, per: 0.05, fx: 'emptySave', icon: '👁️', name: 'Éles szem', desc: (v) => `${pct(v)}-kal ritkábban üres az épület` },
        { key: 'f_explore', branch: 'felderito', tier: 2, max: 5, per: 0.2, fx: 'exploreXp', icon: '🗺️', name: 'Térképész', desc: (v) => `+${pct(v)} felfedező bónusz (új területek)` },
        { key: 'f_quest', branch: 'felderito', tier: 2, max: 5, per: 0.06, fx: 'questBonus', icon: '📜', name: 'Megbízható', desc: (v) => `+${pct(v)} XP és pénz a küldetésekért` },
        { key: 'f_ghost', branch: 'felderito', tier: 3, max: 1, per: 1, fx: 'fleeAlways', cap: true, icon: '👤', name: 'Árnyékjáró', desc: () => 'A menekülés mindig sikerül' },
        { key: 'f_range', branch: 'felderito', tier: 3, max: 5, per: 2, fx: 'lootRange', icon: '📏', name: 'Hosszú kar', desc: (v) => `+${v} m távolságból is kutathatsz` },
        { key: 'f_treasure', branch: 'felderito', tier: 4, max: 1, per: 0.25, fx: 'extraLoot', cap: true, icon: '💎', name: 'Kincsvadász', desc: () => '25% eséllyel egy épületben dupla zsákmányt találsz' },
        // --- MESTEREMBER ---
        { key: 'm_wear', branch: 'mester', tier: 0, max: 5, per: 0.06, fx: 'wearSave', icon: '🧤', name: 'Gondos kéz', desc: (v) => `${pct(v)} eséllyel nem kopik a felszerelésed` },
        { key: 'm_pick', branch: 'mester', tier: 0, max: 5, per: 0.1, fx: 'pickSave', icon: '🗝️', name: 'Lakatos', desc: (v) => `${pct(v)} eséllyel nem kopik az álkulcs` },
        { key: 'm_repair', branch: 'mester', tier: 1, max: 5, per: 0.1, fx: 'repairPct', icon: '🪛', name: 'Szerelő', desc: (v) => `+${pct(v)} javítás` },
        { key: 'm_casing', branch: 'mester', tier: 1, max: 5, per: 0.06, fx: 'casing', icon: '🥫', name: 'Hüvelygyűjtő', desc: (v) => `+${pct(v)} esély, hogy visszakapod a hüvelyt / nyilat` },
        { key: 'm_double', branch: 'mester', tier: 2, max: 5, per: 0.04, fx: 'craftDouble', icon: '✖️', name: 'Bőkezű kéz', desc: (v) => `${pct(v)} eséllyel dupla adagot barkácsolsz` },
        { key: 'm_tools', branch: 'mester', tier: 2, max: 5, per: 0.1, fx: 'toolSave', icon: '🔨', name: 'Szerszámkímélés', desc: (v) => `${pct(v)} eséllyel nem kopik a szerszám barkácsoláskor` },
        { key: 'm_master', branch: 'mester', tier: 3, max: 1, per: 15, fx: 'craftXp', cap: true, icon: '🏅', name: 'Mesterremek', desc: () => 'Minden barkácsolás +15 XP' },
        { key: 'm_scrap', branch: 'mester', tier: 3, max: 5, per: 0.06, fx: 'scrapFind', icon: '⚙️', name: 'Hulladékgyűjtő', desc: (v) => `${pct(v)} eséllyel +1 alapanyagot találsz kutatáskor` },
        { key: 'm_inventor', branch: 'mester', tier: 4, max: 1, per: 0.15, fx: 'craftDouble', cap: true, icon: '💡', name: 'Feltaláló', desc: () => '+15% esély dupla adagra barkácsoláskor' }
    ];
    const BY_KEY = {};
    SKILLS.forEach(s => { BY_KEY[s.key] = s; });

    // Újraosztás ára (az admin felülírhatja): pénz = szint × moneyPerLevel, kristály = crystalBase + szint × crystalPerLevel
    const RESPEC_DEFAULTS = { moneyPerLevel: 100, crystalBase: 50, crystalPerLevel: 2 };
    const LEVEL_HP = 5; // a szint már csak +5 max. életet ad (a többit a képességek)

    function pct(v) { return String(Math.round(v * 1000) / 10).replace('.', ',') + '%'; }
    function pointsForLevel(level) {
        const l = Math.max(1, Math.floor(Number(level) || 1));
        return (l - 1) + Math.floor(l / 10);
    }
    function ranksOf(skills) { return (skills && skills.ranks && typeof skills.ranks === 'object') ? skills.ranks : {}; }
    function spent(skills, branch) {
        const r = ranksOf(skills);
        return Object.keys(r).reduce((a, k) => a + ((BY_KEY[k] && (!branch || BY_KEY[k].branch === branch)) ? r[k] : 0), 0);
    }
    function available(skills, level) { return pointsForLevel(level) - spent(skills); }

    // Felvehető-e a következő rang?
    function canLearn(skills, level, key) {
        const s = BY_KEY[key];
        if (!s) return { error: 'Ismeretlen képesség.' };
        const rank = ranksOf(skills)[key] || 0;
        if (rank >= s.max) return { error: 'Ez a képesség már a csúcson van.' };
        if (available(skills, level) < 1) return { error: 'Nincs szabad képességpontod. Lépj szintet!' };
        const need = TIERS[s.tier];
        const have = spent(skills, s.branch);
        if (have < need) return { error: `Ehhez ${need} pontot kell költened a(z) ${branchName(s.branch)} ágban (most ${have}).` };
        return { ok: true, rank: rank + 1 };
    }
    function learn(skills, level, key) {
        const c = canLearn(skills, level, key);
        if (c.error) return c;
        skills.ranks = { ...ranksOf(skills), [key]: c.rank };
        return { ok: true, rank: c.rank, skill: BY_KEY[key] };
    }
    function branchName(key) { return (BRANCHES.find(b => b.key === key) || { name: key }).name; }

    // Az összes hatás összegezve: { dmgMelee: 0.15, maxHp: 24, ... }
    function effects(skills) {
        const r = ranksOf(skills), out = {};
        Object.keys(r).forEach(k => {
            const s = BY_KEY[k];
            if (!s || !(r[k] > 0)) return;
            const v = s.per * Math.min(s.max, r[k]);
            if (s.fx === 'survivor') { out.slots = (out.slots || 0) + 2; out.maxHp = (out.maxHp || 0) + 20; return; }
            out[s.fx] = (out[s.fx] || 0) + v;
        });
        return out;
    }
    function fxOf(player) { return effects(player && player.skills); }

    // Az újraosztás ára: az első ingyenes, utána pénz vagy kristály (a szinttel arányosan)
    function respecPrice(skills, level, prices) {
        const p = { ...RESPEC_DEFAULTS, ...(prices || {}) };
        const l = Math.max(1, Math.floor(Number(level) || 1));
        const free = !(skills && skills.freeUsed);
        return { free, money: Math.round(l * p.moneyPerLevel), crystals: Math.round(p.crystalBase + l * p.crystalPerLevel) };
    }

    function normalize(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        const ranks = {};
        Object.entries(ranksOf(s)).forEach(([k, v]) => {
            const def = BY_KEY[k], n = Math.floor(Number(v) || 0);
            if (def && n > 0) ranks[k] = Math.min(def.max, n);
        });
        return { ranks, freeUsed: !!s.freeUsed, respecs: Math.max(0, Math.floor(Number(s.respecs) || 0)) };
    }
    // Ha valamiért több pont van elköltve, mint amennyi jár (pl. az admin szintet vett el), mindent visszaadunk
    function fit(skills, level) {
        if (spent(skills) > pointsForLevel(level)) skills.ranks = {};
        return skills;
    }

    const api = { TIERS, BRANCHES, SKILLS, BY_KEY, RESPEC_DEFAULTS, LEVEL_HP, pct, pointsForLevel, spent, available, canLearn, learn, effects, fxOf, respecPrice, normalize, fit, branchName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalSkills = api;
})(this);
