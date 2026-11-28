// hunting.js – VADÁSZAT ÉS HORGÁSZAT (v0.1.42). Közös a kliensnek és a szervernek.
// Vadászat: a játékos körül (főleg erdők, mezők, parkok közelében) állatok bukkannak fel a térképen, csak neki.
//   Közelről (közelharci fegyverrel) vagy messzebbről (íjjal, számszeríjjal, puskával) be lehet cserkészni őket,
//   utána körökre osztott harc jön, mint a mutánsoknál. Győzelem után az állat teteme a hátizsákba kerül,
//   amit késsel meg lehet nyúzni (Barkács → Vadászat): hús, bőr, csont, toll.
// Horgászat: víz közelében (tó, folyó, patak, csatorna) horgászbottal és csalival. Kivetés után várni kell,
//   aztán kihúzod: hal, néha egy ócska csizma.
(function (root) {
    const ANIMALS = {
        rabbit:        { name: 'Mezei Nyúl',        avatar: '🏹', weight: 30, carcass: 'rabbit_carcass',   skittish: 0.30 },
        pheasant:      { name: 'Fácán',             avatar: '🦅', weight: 22, carcass: 'pheasant_carcass', skittish: 0.35 },
        fox:           { name: 'Róka',              avatar: '🦊', weight: 14, carcass: 'fox_carcass',      skittish: 0.25 },
        deer:          { name: 'Őz',                avatar: '🦌', weight: 14, carcass: 'deer_carcass',     skittish: 0.45 },
        boar:          { name: 'Vaddisznó',         avatar: '🐗', weight: 10, carcass: 'boar_carcass',     skittish: 0.05 },
        mutant_hound:  { name: 'Mutáns Kopó',       avatar: '🐺', weight: 6,  carcass: 'hound_carcass',    skittish: 0,   nightWeight: 3 }
    };
    const PER_PLAYER = 3;            // egyszerre ennyi állat lehet a közeledben
    const NEAR_METERS = 450;         // ennyin belül látod őket
    const MIN_SPAWN_METERS = 90;     // ennél közelebb nem bukkannak fel
    const LIFETIME_MIN = 25;         // ennyi perc után továbbállnak
    const RANGE_MELEE = 25;          // közelharci fegyverrel ennyire kell odamenni
    const RANGE_RANGED = 70;         // íjjal, számszeríjjal, puskával innen is megy
    const RANGED_AMMO = ['arrow', 'ammo_sniper', 'ammo_762', 'ammo_556', 'ammo_buckshot', 'ammo_9mm'];

    // HORGÁSZAT
    const WATER_RANGE = 45;          // ennyin belül kell lenni a vízparthoz
    const WAIT_MIN_S = 30, WAIT_MAX_S = 70;   // ennyi ideig tart, mire kapás van
    const LATE_S = 120;              // ha ennél később húzod ki, a hal leakad
    const BAITS = ['worms', 'bread_loaf', 'tortilla', 'raw_game_meat'];
    const CATCH = [                  // [tárgy, súly]
        ['fish_crucian', 40], ['fish_carp', 28], ['fish_pike', 14], ['fish_catfish', 5], ['old_boot', 9], ['message_bottle', 2], ['map_piece', 2]
    ];

    // NYÚZÁS (koppints a tetemre → Megnyúzom). meat: [tárgy, db]; pelt: bunda/bőr; trophy: [tárgy, esély]
    const SKIN = {
        rabbit_carcass:   { meat: ['raw_game_meat', 1], pelt: 'rabbit_fur', bones: 0, trophy: ['rabbit_foot', 0.2] },
        pheasant_carcass: { meat: ['raw_game_meat', 1], extra: { feather: 4 }, bones: 0 },
        fox_carcass:      { meat: ['raw_game_meat', 1], pelt: 'fox_fur', bones: 1, trophy: ['fox_trophy', 0.35] },
        deer_carcass:     { meat: ['raw_game_meat', 4], pelt: 'deer_hide', bones: 3, trophy: ['deer_trophy', 0.5] },
        boar_carcass:     { meat: ['raw_pork', 5], pelt: 'boar_hide', bones: 3, extra: { lard: 1 }, trophy: ['boar_trophy', 0.5] },
        hound_carcass:    { meat: ['raw_mutant_meat', 2], pelt: 'hound_hide', bones: 2, trophy: ['hound_trophy', 0.25] }
    };
    const SKIN_TOOLS = ['hunting_knife', 'knife', 'butcher_cleaver', 'machete', 'multitool'];

    function isRanged(weapon) { return !!(weapon && (weapon.ranged || (weapon.reqAmmo && RANGED_AMMO.includes(weapon.reqAmmo)))); }
    function pickAnimal(random, night) {
        const list = Object.entries(ANIMALS).map(([k, a]) => [k, a.weight * (night && a.nightWeight ? a.nightWeight : 1)]);
        let r = random() * list.reduce((s, x) => s + x[1], 0);
        for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
        return list[0][0];
    }
    function pickCatch(random) {
        let r = random() * CATCH.reduce((s, x) => s + x[1], 0);
        for (const [k, w] of CATCH) { r -= w; if (r <= 0) return k; }
        return CATCH[0][0];
    }

    const api = { SKIN, SKIN_TOOLS, ANIMALS, PER_PLAYER, NEAR_METERS, MIN_SPAWN_METERS, LIFETIME_MIN, RANGE_MELEE, RANGE_RANGED, WATER_RANGE, WAIT_MIN_S, WAIT_MAX_S, LATE_S, BAITS, CATCH, isRanged, pickAnimal, pickCatch };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalHunting = api;
})(this);
