// skills.js
// KÉPESSÉGFA (v0.1.20): 4 ág (Harcos, Túlélő, Felderítő, Mesterember), áganként 9 képesség.
// Szintenként 1 pont, minden 10. szinten +1. A szintek a sorokat az ágban elköltött pontokkal nyitják (0 / 5 / 10 / 15 / 30).
// Halálkor (új túlélő) a képességek is elvesznek. Újraosztás: 1 ingyen, utána pénzért vagy kristályért (a szinttel drágul).
// Közös a kliensnek és a szervernek: a hatásokat a szerver számolja, a kliens csak megjeleníti.
(function (root) {
    // v2 (v0.1.20.3): mélyebb, elágazó fa. Áganként két ösvény (a: bal, b: jobb), 5–5 képességgel egymás felett,
    // középen két csúcsképesség (16 és 40 pontnál). Egy képesség csak akkor tanulható, ha az alatta lévő (req) legalább 3. rangon van.
    const TIERS = [0, 5, 10, 16, 22, 30, 40];
    const VERSION = 2;
    const BRANCHES = [
        { key: 'harcos', name: 'Harcos', color: '#c0483a', icon: '⚔️', desc: 'Bal ösvény: közelharc és kritikus találat. Jobb ösvény: lőfegyver, védelem, kitérés.' },
        { key: 'tulelo', name: 'Túlélő', color: '#6f9a3c', icon: '❤️', desc: 'Bal ösvény: élet és gyógyulás. Jobb ösvény: éhség, szomj, fáradtság, teherbírás.' },
        { key: 'felderito', name: 'Felderítő', color: '#3f7fb5', icon: '🧭', desc: 'Bal ösvény: séta, felfedezés, küldetések. Jobb ösvény: kutatás és zsákmány.' },
        { key: 'mester', name: 'Mesterember', color: '#c98b2b', icon: '🔧', desc: 'Bal ösvény: barkácsolás. Jobb ösvény: kopás, javítás, karbantartás.' }
    ];
    const R3 = (key) => [{ key, rank: 3 }];
    // col: a (bal) / b (jobb) / c (közép, csúcs); req: előfeltétel (mind kell); reqAny: elég az egyik (legalább 1. rang)
    const SKILLS = [
        // --- HARCOS ---
        { key: 'h_melee', branch: 'harcos', tier: 0, col: 'a', max: 5, per: 0.05, fx: 'dmgMelee', icon: '🔪', name: 'Erős kar', desc: (v) => `+${pct(v)} közelharci sebzés` },
        { key: 'h_ranged', branch: 'harcos', tier: 0, col: 'b', max: 5, per: 0.05, fx: 'dmgRanged', icon: '🎯', name: 'Biztos kéz', desc: (v) => `+${pct(v)} lőfegyver- és íjsebzés` },
        { key: 'h_crit', branch: 'harcos', tier: 1, col: 'a', req: R3('h_melee'), max: 5, per: 0.02, fx: 'critChance', icon: '💢', name: 'Gyenge pont', desc: (v) => `+${pct(v)} esély kritikus találatra` },
        { key: 'h_def', branch: 'harcos', tier: 1, col: 'b', req: R3('h_ranged'), max: 5, per: 2, fx: 'defense', icon: '🛡️', name: 'Kemény bőr', desc: (v) => `+${v} védelem` },
        { key: 'h_critd', branch: 'harcos', tier: 2, col: 'a', req: R3('h_crit'), max: 5, per: 0.1, fx: 'critDmg', icon: '🩸', name: 'Kegyetlen csapás', desc: (v) => `+${pct(v)} kritikus sebzés` },
        { key: 'h_flee', branch: 'harcos', tier: 2, col: 'b', req: R3('h_def'), max: 5, per: 0.03, fx: 'flee', icon: '🏃', name: 'Taktikai visszavonulás', desc: (v) => `+${pct(v)} esély a menekülésre` },
        { key: 'h_first', branch: 'harcos', tier: 3, col: 'c', reqAny: ['h_critd', 'h_flee'], max: 1, per: 1, fx: 'firstStrike', cap: true, icon: '⚡', name: 'Rajtaütés', desc: () => 'A harc első ütése +50% sebzést okoz' },
        { key: 'h_xp', branch: 'harcos', tier: 4, col: 'a', req: R3('h_critd'), max: 5, per: 0.06, fx: 'combatXp', icon: '🎖️', name: 'Harci tapasztalat', desc: (v) => `+${pct(v)} XP a győzelmekért` },
        { key: 'h_dodge', branch: 'harcos', tier: 4, col: 'b', req: R3('h_flee'), max: 5, per: 0.02, fx: 'dodge', icon: '💨', name: 'Kitérés', desc: (v) => `${pct(v)} eséllyel kitérsz az ellenség ütése elől` },
        { key: 'h_tough', branch: 'harcos', tier: 5, col: 'a', req: R3('h_xp'), max: 5, per: 6, fx: 'maxHp', icon: '💪', name: 'Edzett harcos', desc: (v) => `+${v} max. élet` },
        { key: 'h_loot', branch: 'harcos', tier: 5, col: 'b', req: R3('h_dodge'), max: 5, per: 0.1, fx: 'combatMoney', icon: '💰', name: 'Hadizsákmány', desc: (v) => `+${pct(v)} pénz a legyőzött ellenségektől` },
        { key: 'h_frenzy', branch: 'harcos', tier: 6, col: 'c', reqAny: ['h_tough', 'h_loot'], max: 1, per: 0.15, fx: 'winHeal', cap: true, icon: '🔥', name: 'Harci láz', desc: () => 'Minden győzelem után visszakapod a max. életed 15%-át' },
        // --- TÚLÉLŐ ---
        { key: 't_hp', branch: 'tulelo', tier: 0, col: 'a', max: 5, per: 8, fx: 'maxHp', icon: '❤️', name: 'Edzett test', desc: (v) => `+${v} max. élet` },
        { key: 't_needs', branch: 'tulelo', tier: 0, col: 'b', max: 5, per: 0.05, fx: 'needSave', icon: '🥫', name: 'Takarékos szervezet', desc: (v) => `${pct(v)}-kal lassabban éhezel és szomjazol` },
        { key: 't_heal', branch: 'tulelo', tier: 1, col: 'a', req: R3('t_hp'), max: 5, per: 0.1, fx: 'healPct', icon: '🩹', name: 'Elsősegély', desc: (v) => `+${pct(v)} gyógyulás kötszerből és gyógyszerből` },
        { key: 't_food', branch: 'tulelo', tier: 1, col: 'b', req: R3('t_needs'), max: 5, per: 0.08, fx: 'foodPct', icon: '🍲', name: 'Jó étvágy', desc: (v) => `+${pct(v)} az ételek és italok hatásából` },
        { key: 't_rest', branch: 'tulelo', tier: 2, col: 'a', req: R3('t_heal'), max: 5, per: 0.1, fx: 'restPct', icon: '😴', name: 'Mély pihenés', desc: (v) => `+${pct(v)} gyorsabb pihenés` },
        { key: 't_fatigue', branch: 'tulelo', tier: 2, col: 'b', req: R3('t_food'), max: 5, per: 0.04, fx: 'fatigueSave', icon: '😮‍💨', name: 'Kitartás', desc: (v) => `${pct(v)}-kal lassabban fáradsz` },
        { key: 't_last', branch: 'tulelo', tier: 3, col: 'c', reqAny: ['t_rest', 't_fatigue'], max: 1, per: 1, fx: 'lastStand', cap: true, icon: '🫀', name: 'Utolsó lehelet', desc: () => 'Harconként egyszer a halálos ütést 1 élettel túléled' },
        { key: 't_regen', branch: 'tulelo', tier: 4, col: 'a', req: R3('t_rest'), max: 5, per: 6, fx: 'regen', icon: '🌿', name: 'Sebgyógyulás', desc: (v) => `+${v} élet óránként magától (ha nem éhezel)` },
        { key: 't_weight', branch: 'tulelo', tier: 4, col: 'b', req: R3('t_fatigue'), max: 5, per: 3, fx: 'maxWeight', icon: '🎒', name: 'Teherhordó', desc: (v) => `+${v} kg teherbírás` },
        { key: 't_tough', branch: 'tulelo', tier: 5, col: 'a', req: R3('t_regen'), max: 5, per: 1, fx: 'defense', icon: '🪨', name: 'Szívósság', desc: (v) => `+${v} védelem` },
        { key: 't_pack', branch: 'tulelo', tier: 5, col: 'b', req: R3('t_weight'), max: 2, per: 1, fx: 'slots', icon: '👜', name: 'Málhás', desc: (v) => `+${v} hátizsákhely` },
        { key: 't_master', branch: 'tulelo', tier: 6, col: 'c', reqAny: ['t_tough', 't_pack'], max: 1, per: 1, fx: 'survivor', cap: true, icon: '🏕️', name: 'Túlélőművész', desc: () => '+2 hátizsákhely és +20 max. élet' },
        // --- FELDERÍTŐ ---
        { key: 'f_walk', branch: 'felderito', tier: 0, col: 'a', max: 5, per: 0.06, fx: 'walkXp', icon: '🚶', name: 'Gyors léptek', desc: (v) => `+${pct(v)} XP a sétáért` },
        { key: 'f_search', branch: 'felderito', tier: 0, col: 'b', max: 5, per: 0.06, fx: 'searchFast', icon: '⏱️', name: 'Gyakorlott kutató', desc: (v) => `${pct(v)}-kal gyorsabb átkutatás` },
        { key: 'f_explore', branch: 'felderito', tier: 1, col: 'a', req: R3('f_walk'), max: 5, per: 0.2, fx: 'exploreXp', icon: '🗺️', name: 'Térképész', desc: (v) => `+${pct(v)} felfedező bónusz (új területek)` },
        { key: 'f_eye', branch: 'felderito', tier: 1, col: 'b', req: R3('f_search'), max: 5, per: 0.05, fx: 'emptySave', icon: '👁️', name: 'Éles szem', desc: (v) => `${pct(v)}-kal ritkábban üres az épület` },
        { key: 'f_quest', branch: 'felderito', tier: 2, col: 'a', req: R3('f_explore'), max: 5, per: 0.06, fx: 'questBonus', icon: '📜', name: 'Megbízható', desc: (v) => `+${pct(v)} XP és pénz a küldetésekért` },
        { key: 'f_quiet', branch: 'felderito', tier: 2, col: 'b', req: R3('f_eye'), max: 5, per: 0.05, fx: 'encounterSave', icon: '🤫', name: 'Csendes léptek', desc: (v) => `${pct(v)}-kal ritkábban támadnak rád az épületekben` },
        { key: 'f_ghost', branch: 'felderito', tier: 3, col: 'c', reqAny: ['f_quest', 'f_quiet'], max: 1, per: 1, fx: 'fleeAlways', cap: true, icon: '👤', name: 'Árnyékjáró', desc: () => 'A menekülés mindig sikerül' },
        { key: 'f_light', branch: 'felderito', tier: 4, col: 'a', req: R3('f_quest'), max: 5, per: 0.04, fx: 'fatigueSave', icon: '🪶', name: 'Könnyű léptek', desc: (v) => `${pct(v)}-kal lassabban fáradsz` },
        { key: 'f_range', branch: 'felderito', tier: 4, col: 'b', req: R3('f_quiet'), max: 5, per: 2, fx: 'lootRange', icon: '📏', name: 'Hosszú kar', desc: (v) => `+${v} m távolságból is kutathatsz` },
        { key: 'f_march', branch: 'felderito', tier: 5, col: 'a', req: R3('f_light'), max: 5, per: 0.05, fx: 'walkXp', icon: '🥾', name: 'Vándor', desc: (v) => `további +${pct(v)} XP a sétáért` },
        { key: 'f_lucky', branch: 'felderito', tier: 5, col: 'b', req: R3('f_range'), max: 5, per: 0.03, fx: 'extraLoot', icon: '🍀', name: 'Szerencsés kéz', desc: (v) => `${pct(v)} eséllyel dupla zsákmány egy épületben` },
        { key: 'f_treasure', branch: 'felderito', tier: 6, col: 'c', reqAny: ['f_march', 'f_lucky'], max: 1, per: 0.25, fx: 'extraLoot', cap: true, icon: '💎', name: 'Kincsvadász', desc: () => '+25% esély dupla zsákmányra' },
        // --- MESTEREMBER ---
        { key: 'm_tools', branch: 'mester', tier: 0, col: 'a', max: 5, per: 0.1, fx: 'toolSave', icon: '🔨', name: 'Szerszámkímélés', desc: (v) => `${pct(v)} eséllyel nem kopik a szerszám barkácsoláskor` },
        { key: 'm_wear', branch: 'mester', tier: 0, col: 'b', max: 5, per: 0.06, fx: 'wearSave', icon: '🧤', name: 'Gondos kéz', desc: (v) => `${pct(v)} eséllyel nem kopik a felszerelésed` },
        { key: 'm_double', branch: 'mester', tier: 1, col: 'a', req: R3('m_tools'), max: 5, per: 0.04, fx: 'craftDouble', icon: '✖️', name: 'Bőkezű kéz', desc: (v) => `${pct(v)} eséllyel dupla adagot barkácsolsz` },
        { key: 'm_pick', branch: 'mester', tier: 1, col: 'b', req: R3('m_wear'), max: 5, per: 0.1, fx: 'pickSave', icon: '🗝️', name: 'Lakatos', desc: (v) => `${pct(v)} eséllyel nem kopik az álkulcs` },
        { key: 'm_scrap', branch: 'mester', tier: 2, col: 'a', req: R3('m_double'), max: 5, per: 0.06, fx: 'scrapFind', icon: '⚙️', name: 'Hulladékgyűjtő', desc: (v) => `${pct(v)} eséllyel +1 alapanyagot találsz kutatáskor` },
        { key: 'm_repair', branch: 'mester', tier: 2, col: 'b', req: R3('m_pick'), max: 5, per: 0.1, fx: 'repairPct', icon: '🪛', name: 'Szerelő', desc: (v) => `+${pct(v)} javítás` },
        { key: 'm_master', branch: 'mester', tier: 3, col: 'c', reqAny: ['m_scrap', 'm_repair'], max: 1, per: 15, fx: 'craftXp', cap: true, icon: '🏅', name: 'Mesterremek', desc: () => 'Minden barkácsolás +15 XP' },
        { key: 'm_practice', branch: 'mester', tier: 4, col: 'a', req: R3('m_scrap'), max: 5, per: 3, fx: 'craftXp', icon: '📐', name: 'Gyakorlat', desc: (v) => `+${v} XP minden barkácsolásért` },
        { key: 'm_casing', branch: 'mester', tier: 4, col: 'b', req: R3('m_repair'), max: 5, per: 0.06, fx: 'casing', icon: '🥫', name: 'Hüvelygyűjtő', desc: (v) => `+${pct(v)} esély, hogy visszakapod a hüvelyt / nyilat` },
        { key: 'm_thrift', branch: 'mester', tier: 5, col: 'a', req: R3('m_practice'), max: 5, per: 0.05, fx: 'matSave', icon: '♻️', name: 'Takarékos', desc: (v) => `${pct(v)} eséllyel 1 alapanyag visszajár barkácsoláskor` },
        { key: 'm_care', branch: 'mester', tier: 5, col: 'b', req: R3('m_casing'), max: 5, per: 0.04, fx: 'wearSave', icon: '🧴', name: 'Ápolt felszerelés', desc: (v) => `további ${pct(v)} eséllyel nem kopik a felszerelésed` },
        { key: 'm_inventor', branch: 'mester', tier: 6, col: 'c', reqAny: ['m_thrift', 'm_care'], max: 1, per: 0.15, fx: 'craftDouble', cap: true, icon: '💡', name: 'Feltaláló', desc: () => '+15% esély dupla adagra barkácsoláskor' }
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
        const r = ranksOf(skills);
        const miss = (s.req || []).find(q => (r[q.key] || 0) < q.rank);
        if (miss) return { error: `Előbb: ${BY_KEY[miss.key].name} legalább ${miss.rank}. rangig (most ${r[miss.key] || 0}).` };
        if (s.reqAny && !s.reqAny.some(k => (r[k] || 0) >= 1)) return { error: `Előbb tanulj legalább 1 rangot ezek egyikéből: ${s.reqAny.map(k => BY_KEY[k].name).join(' vagy ')}.` };
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
        // régi (v1) fa: minden pont visszajár, és az ingyenes újraosztás is újra jár
        if (Object.keys(ranksOf(s)).length && s.v !== VERSION) return { ranks: {}, freeUsed: false, respecs: Math.max(0, Math.floor(Number(s.respecs) || 0)), v: VERSION, reset: true };
        const ranks = {};
        Object.entries(ranksOf(s)).forEach(([k, v]) => {
            const def = BY_KEY[k], n = Math.floor(Number(v) || 0);
            if (def && n > 0) ranks[k] = Math.min(def.max, n);
        });
        return { ranks, freeUsed: !!s.freeUsed, respecs: Math.max(0, Math.floor(Number(s.respecs) || 0)), v: VERSION };
    }
    // Ha valamiért több pont van elköltve, mint amennyi jár (pl. az admin szintet vett el), mindent visszaadunk
    function fit(skills, level) {
        if (spent(skills) > pointsForLevel(level)) skills.ranks = {};
        return skills;
    }

    const api = { TIERS, VERSION, BRANCHES, SKILLS, BY_KEY, RESPEC_DEFAULTS, LEVEL_HP, pct, pointsForLevel, spent, available, canLearn, learn, effects, fxOf, respecPrice, normalize, fit, branchName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalSkills = api;
})(this);
