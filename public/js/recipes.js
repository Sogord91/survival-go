// recipes.js
// BARKÁCSRECEPTEK (a szerver és a kliens is ezt tölti be)
//   key      a recept azonosítója (egyedi)
//   result   az elkészülő tárgy kulcsa (items.js); ha hiányzik, a key
//   count    hány darab készül (alapból 1)
//   req      alapanyagok: { tárgykulcs: darab } (elfogynak)
//   tools    szükséges szerszámok (NEM fogynak el, de kopnak: minden barkácsolás 1 tartósságot visz el).
//            Egy elem lehet egy kulcs, vagy egy lista, amiből bármelyik megfelel: ['pliers', 'multitool']
//   station  'workshop' | 'smelter': csak az adott épületben készíthető (műhely / olvasztó, egy későbbi frissítésben).
//            Ezek NEM jelennek meg a karakter craft ablakában; majd az épület ablakában lesznek elérhetők.
//   cat      csoport a craft ablakban (a sorrendet a CRAFT_CATEGORIES adja)
//   fire     true: tüzet kell gyújtani: 1 gyufásdoboz fogy el, VAGY a tűzgyújtó rúd kopik 1-et
//            (a gyufát használjuk előbb, a rudat csak ha nincs gyufa)
// A szerszámosláda (toolbox) bármelyik alapszerszámot pótolja (TOOLBOX_REPLACES), és ilyenkor ő kopik.
const TOOLBOX_REPLACES = ['claw_hammer', 'pliers', 'screwdriver', 'socket_wrench', 'multitool'];
const FIRE_STARTERS = ['matchbox', 'ferro_rod']; // [fogyó, kopó]

// Egy "tools" bejegyzés összes elfogadható szerszáma (a szerszámosládával együtt)
function toolOptions(entry) {
    const options = Array.isArray(entry) ? entry.slice() : [entry];
    if (options.some(k => TOOLBOX_REPLACES.includes(k)) && !options.includes('toolbox')) options.push('toolbox');
    return options;
}
const CRAFT_CATEGORIES = ['Elsősegély', 'Víz és étel', 'Fegyverek', 'Lőszer', 'Eszközök és fény', 'Ruha és táska', 'Alapanyag', 'Szétszerelés'];

const craftingRecipes = [
    // --- ELSŐSEGÉLY ---
    { key: 'rag_bandage', cat: 'Elsősegély', name: 'Rongy Kötés', desc: 'Két rongyból gyors kötés', req: { rag: 2 } },
    { key: 'bandage', cat: 'Elsősegély', name: 'Steril Kötszer', desc: 'Rongykötés alkohollal fertőtlenítve', req: { rag_bandage: 2, alcohol: 1 } },
    { key: 'gauze_pad', cat: 'Elsősegély', name: 'Steril Gézlap', desc: 'Alkoholban kifőzött rongy', req: { rag: 1, alcohol: 1 } },
    { key: 'compression_bandage', cat: 'Elsősegély', name: 'Nyomókötés', desc: 'Gézlap és kötés szorosra ragasztva', req: { gauze_pad: 1, rag_bandage: 1, duct_tape: 1 } },
    { key: 'tourniquet', cat: 'Elsősegély', name: 'Szorítókötés', desc: 'Rongy, zsinór és egy bot a szorításhoz', req: { rag: 1, stick: 1, cotton_cord: 1 } },
    { key: 'willow_tonic', cat: 'Elsősegély', name: 'Fűzfakéreg Tinktúra', desc: 'Kéreg alkoholban áztatva, fájdalomra', req: { stick: 2, alcohol: 1, empty_jar: 1 } },

    // --- VÍZ ÉS ÉTEL ---
    { key: 'filter_water', cat: 'Víz és étel', result: 'water_bottle', name: 'Vízszűrés', desc: 'Szennyezett víz átszűrése palackba', req: { dirty_water: 1, plastic_bottle: 1 }, tools: ['straw_filter'] },
    { key: 'boil_water', cat: 'Víz és étel', result: 'water_bottle', name: 'Vízforralás', desc: 'Szennyezett víz felforralása konzervdobozban', req: { dirty_water: 1, plastic_bottle: 1 }, fire: true, tools: ['empty_can'] },
    { key: 'distill_water', cat: 'Víz és étel', result: 'distilled_water', name: 'Lepárolt Víz', desc: 'Két adag koszos víz lepárlása befőttesüvegbe', req: { dirty_water: 2, empty_jar: 1 }, fire: true, tools: ['empty_can'] },
    { key: 'chili_pot', cat: 'Víz és étel', name: 'Csilis Bab', desc: 'Babkonzerv paradicsommal összefőzve', req: { canned_food: 2, tomato: 1 }, fire: true, tools: ['empty_can'] },
    { key: 'fish_and_chips', cat: 'Víz és étel', name: 'Hal és Sült Krumpli', desc: 'Tonhal krumplival, tűzön sütve', req: { tuna_can: 1, potato: 2 }, fire: true, tools: ['empty_can'] },

    // --- FEGYVEREK ---
    { key: 'improvised_bow', cat: 'Fegyverek', name: 'Barkácsolt Íj', desc: 'Hajlított bot kötélhúrral, nyílvessző kell hozzá', req: { stick: 2, hemp_rope: 1, duct_tape: 1 } },
    { key: 'sling', cat: 'Fegyverek', name: 'Parittya', desc: 'Kődarabokat lő, minden lövés egy követ visz el', req: { cotton_cord: 1, rag: 1 } },
    { key: 'stone_axe', cat: 'Fegyverek', name: 'Kőbalta', desc: 'Botra kötözött éles kő', req: { stick: 1, stone: 1, cotton_cord: 1 } },
    { key: 'nail_club', cat: 'Fegyverek', name: 'Szöges Bot', desc: 'Szögekkel kivert bunkó', req: { stick: 1, nails: 3 }, tools: ['claw_hammer'] },
    { key: 'pipe_club', cat: 'Fegyverek', name: 'Csőbunkó', desc: 'Acélcső ragasztószalagos markolattal', req: { pipe: 1, duct_tape: 1 } },
    { key: 'baseball_bat', cat: 'Fegyverek', name: 'Szöges Baseball Ütő', desc: 'Vastag bot szögesdróttal körbetekerve', req: { stick: 1, barbed_wire: 1, duct_tape: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'rebar_club', cat: 'Fegyverek', result: 'pipe_club', name: 'Betonacél Bunkó', desc: 'Betonacél ragasztószalagos markolattal', req: { rebar: 1, duct_tape: 1 } },
    { key: 'composite_bow', cat: 'Fegyverek', result: 'bow', name: 'Kompozit Vadász Íj', desc: 'A barkácsolt íj bőrrel és acélhúrral megerősítve', req: { improvised_bow: 1, tanned_leather: 1, steel_cable: 1 }, tools: ['bow_saw'] },
    { key: 'spear', cat: 'Fegyverek', name: 'Barkácsolt Lándzsa', desc: 'Bot, ragasztószalag és egy éles fémdarab', req: { stick: 2, duct_tape: 1, metal_scrap: 1 }, tools: [['pliers', 'multitool', 'claw_hammer']] },

    // --- LŐSZER (lőfegyvernél 1 hüvely = 1 töltény) ---
    { key: 'arrow', cat: 'Lőszer', count: 3, name: 'Nyílvessző', desc: 'Botból, fémhegyből és rongytollból', req: { stick: 2, metal_scrap: 1, rag: 1 } },
    { key: 'reload_9mm', cat: 'Lőszer', result: 'ammo_9mm', count: 3, name: '9mm Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_762', cat: 'Lőszer', result: 'ammo_762', count: 3, name: '7.62 Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_556', cat: 'Lőszer', result: 'ammo_556', count: 3, name: '5.56 Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_buckshot', cat: 'Lőszer', result: 'ammo_buckshot', count: 3, name: 'Sörét Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_sniper', cat: 'Lőszer', result: 'ammo_sniper', count: 3, name: 'Mesterlövész Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 2, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },

    // --- ESZKÖZÖK ÉS FÉNY ---
    { key: 'torch', cat: 'Eszközök és fény', name: 'Fáklya', desc: 'Éjszakai fényforrás', req: { stick: 1, rag: 1, alcohol: 1 } },
    { key: 'oil_torch', cat: 'Eszközök és fény', result: 'torch', name: 'Olajos Fáklya', desc: 'Fáklya lámpaolajjal átitatva', req: { stick: 1, rag: 1, lamp_oil: 1 } },
    { key: 'straw_filter', cat: 'Eszközök és fény', name: 'Szívószálas Vízszűrő', desc: 'PET-palack, rongy és zúzott kő rétegekben', req: { plastic_bottle: 1, rag: 1, stone: 1 } },
    { key: 'sewing_kit', cat: 'Eszközök és fény', name: 'Varrókészlet', desc: 'Szögből reszelt tű és zsinór', req: { nails: 1, cotton_cord: 2 }, tools: [['pliers', 'multitool']] },
    { key: 'lockpick', cat: 'Eszközök és fény', name: 'Álkulcs Készlet', desc: 'Zárak feltöréséhez', req: { wire: 1, nails: 1 }, tools: [['pliers', 'multitool']] },

    // --- RUHA ÉS TÁSKA ---
    { key: 'beanie', cat: 'Ruha és táska', name: 'Kötött Sapka', desc: 'Zsinórból kötött meleg sapka', req: { cotton_cord: 3 }, tools: ['sewing_kit'] },
    { key: 'hunting_vest', cat: 'Ruha és táska', name: 'Vadászmellény', desc: 'Bőrrel megerősített vászonmellény', req: { tanned_leather: 1, canvas_roll: 1, cotton_cord: 1 }, tools: [['sewing_kit', 'hand_riveter']] },
    { key: 'leather_pants', cat: 'Ruha és táska', name: 'Bőrnadrág', desc: 'Cserzett bőrből varrt nadrág', req: { tanned_leather: 2, cotton_cord: 2 }, tools: ['sewing_kit'] },
    { key: 'fanny_pack', cat: 'Ruha és táska', name: 'Övtáska', desc: 'Kis rongytáska az övre', req: { rag: 2, cotton_cord: 1 }, tools: ['sewing_kit'] },
    { key: 'market_tote', cat: 'Ruha és táska', name: 'Vászon Bevásárlótáska', desc: 'Egyszerű varrt táska', req: { rag: 3, cotton_cord: 1 }, tools: ['sewing_kit'] },
    { key: 'field_satchel', cat: 'Ruha és táska', name: 'Vászon Válltáska', desc: 'Strapabíró vászontáska', req: { canvas_roll: 1, cotton_cord: 2 }, tools: ['sewing_kit'] },
    { key: 'leather_backpack', cat: 'Ruha és táska', name: 'Bőr Túrahátizsák', desc: 'Nagy, erős bőrhátizsák', req: { tanned_leather: 2, hemp_rope: 1, cotton_cord: 2 }, tools: ['sewing_kit'] },

    // --- ALAPANYAG ---
    { key: 'clean_rag', cat: 'Alapanyag', result: 'rag', count: 2, name: 'Rongymosás', desc: 'Koszos rongyból tiszta szövet', req: { dirty_rag: 2, dirty_water: 1 } },
    { key: 'cotton_cord', cat: 'Alapanyag', name: 'Pamutzsinór', desc: 'Rongycsíkokból sodort zsinór', req: { rag: 2 } },
    { key: 'hemp_rope', cat: 'Alapanyag', name: 'Kenderkötél', desc: 'Zsinórokból font erős kötél', req: { cotton_cord: 3 } },
    { key: 'canvas_roll', cat: 'Alapanyag', name: 'Vászontekercs', desc: 'Rongyokból összevarrt erős anyag', req: { rag: 4, cotton_cord: 1 }, tools: ['sewing_kit'] },
    { key: 'twist_wire', cat: 'Alapanyag', result: 'wire', name: 'Drótsodrás', desc: 'Két rézdrótból egy erős dróttekercs', req: { copper_wire: 2 }, tools: [['pliers', 'multitool']] },
    { key: 'purify_alcohol', cat: 'Alapanyag', result: 'alcohol', name: 'Alkohol Tisztítása', desc: 'Két üveg pálinkából tiszta alkohol', req: { moonshine: 2 }, tools: ['straw_filter'] },

    // --- SZÉTSZERELÉS ---
    { key: 'scrap_toaster', cat: 'Szétszerelés', result: 'metal_scrap', count: 2, name: 'Kenyérpirító Szétszedése', desc: 'Fémhulladék a házából', req: { broken_toaster: 1 }, tools: ['screwdriver'] },
    { key: 'scrap_radiator', cat: 'Szétszerelés', result: 'metal_scrap', count: 3, name: 'Radiátor Szétszedése', desc: 'Az alumíniumbordák fémhulladéknak', req: { radiator_chunk: 1 }, tools: [['pliers', 'socket_wrench', 'pipe_wrench']] },
    { key: 'strip_wire', cat: 'Szétszerelés', result: 'wire', name: 'Kábel Kibontása', desc: 'A gabalyból használható drót', req: { scrap_wire_bundle: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'scrap_old_battery', cat: 'Szétszerelés', result: 'lead_pipes_scrap', count: 2, name: 'Akksi Bontása', desc: 'Az ólomlemezek kiszedése (lőszerhez)', req: { old_battery: 1 }, tools: [['screwdriver', 'pliers']] },
    { key: 'scrap_radio', cat: 'Szétszerelés', result: 'copper_wire', name: 'Rádió Kibelezése', desc: 'Rézdrót a tekercsekből', req: { radio_parts: 1 }, tools: [['screwdriver', 'multitool']] },
    { key: 'scrap_switch', cat: 'Szétszerelés', result: 'copper_wire', name: 'Kapcsolók Bontása', desc: 'Rézérintkezők és vezetékek', req: { electrical_switch: 2 }, tools: [['screwdriver', 'multitool']] },
    { key: 'scrap_geiger', cat: 'Szétszerelés', result: 'radio_parts', count: 2, name: 'Geiger-számláló Bontása', desc: 'Elektronikai alkatrészek', req: { geiger_counter: 1 }, tools: [['screwdriver', 'multitool']] },
    { key: 'split_9v', cat: 'Szétszerelés', result: 'aa_batteries', name: '9V Elemek Bontása', desc: 'Két 9V-os elem cellái egy elempárnak', req: { battery: 2 }, tools: [['screwdriver', 'pliers', 'multitool']] },
    { key: 'scrap_bearing', cat: 'Szétszerelés', result: 'metal_scrap', name: 'Csapágy Szétverése', desc: 'Acélgolyók és gyűrű fémhulladéknak', req: { ball_bearing: 1 }, tools: [['claw_hammer', 'pliers']] },
    { key: 'scrap_hinge', cat: 'Szétszerelés', result: 'metal_scrap', name: 'Zsanér Bontása', desc: 'Fémhulladék a vasalatból', req: { hinge_latch: 1 }, tools: [['screwdriver', 'claw_hammer']] },
    { key: 'scrap_gear', cat: 'Szétszerelés', result: 'metal_scrap', name: 'Fogaskerék Bontása', desc: 'Acél fémhulladék', req: { gear_wheel: 1 }, tools: [['claw_hammer', 'socket_wrench']] },
    { key: 'scrap_grappling_hook', cat: 'Szétszerelés', result: 'metal_scrap', count: 2, name: 'Mászóhorog Bontása', desc: 'A karmok fémhulladéknak', req: { grappling_hook: 1 }, tools: [['claw_hammer', 'pliers']] },
    { key: 'scrap_chain', cat: 'Szétszerelés', result: 'metal_scrap', count: 2, name: 'Lánc Darabolása', desc: 'A láncszemek fémhulladéknak', req: { iron_chain: 1 }, tools: ['bolt_cutters'] },
    { key: 'cut_steel_cable', cat: 'Szétszerelés', result: 'wire', count: 2, name: 'Sodronykötél Bontása', desc: 'A fonatból dróttekercsek', req: { steel_cable: 1 }, tools: ['bolt_cutters'] },
    { key: 'cut_cans', cat: 'Szétszerelés', result: 'metal_scrap', name: 'Konzervdobozok Vágása', desc: 'Három üres dobozból fémlemez', req: { empty_can: 3 }, tools: ['tin_snips'] },
    { key: 'smash_bulb', cat: 'Szétszerelés', result: 'glass_shards', name: 'Villanykörte Törése', desc: 'Két égett körte üvege', req: { broken_bulb: 2 } },
    { key: 'smash_lens', cat: 'Szétszerelés', result: 'glass_shards', name: 'Lencse Törése', desc: 'Csiszolt üvegszilánk', req: { scope_lens: 1 } },
    { key: 'drain_gasoline', cat: 'Szétszerelés', result: 'lamp_oil', count: 2, name: 'Benzin Lefejtése', desc: 'A kannából két palack lámpába való üzemanyag', req: { gasoline_can: 1 } },

    // --- OLVASZTÓBAN / MŰHELYBEN (egy későbbi frissítésben, az épület ablakában) ---
    { key: 'pure_metal_bar', name: 'Tiszta Fémtömb', desc: 'Fémhulladék beolvasztása', req: { metal_scrap: 5 }, station: 'smelter' },
    { key: 'smelt_nails', result: 'pure_metal_bar', name: 'Szögek Beolvasztása', desc: 'Edzett acélszögekből fémtömb', req: { heavy_nails: 5 }, station: 'smelter' },
    { key: 'smelt_iron_ore', result: 'iron_sheet', name: 'Vasérc Olvasztása', desc: 'Nyers vasércből vaslemez', req: { raw_iron_ore: 2 }, station: 'smelter' },
    { key: 'smelt_copper_ore', result: 'copper_wire', count: 2, name: 'Rézérc Olvasztása', desc: 'Nyers rézércből rézdrót', req: { raw_copper_ore: 1 }, station: 'smelter' },
    { key: 'smelt_glass', result: 'empty_jar', name: 'Üvegolvasztás', desc: 'Üvegszilánkokból befőttesüveg', req: { glass_shards: 3 }, station: 'smelter' },
    { key: 'forge_sheet', result: 'steel_plate', name: 'Lemez Kovácsolása', desc: 'Két vaslemez összekovácsolva', req: { iron_sheet: 2 }, tools: ['claw_hammer'], station: 'workshop' },
    { key: 'plated_vest', result: 'hunting_vest', name: 'Lemezelt Vadászmellény', desc: 'Acéllemezzel bélelt vászonmellény', req: { steel_plate: 1, canvas_roll: 1, hemp_rope: 1 }, tools: [['hand_riveter', 'sewing_kit']], station: 'workshop' },
    { key: 'cast_ceramic', result: 'ceramic_plates', count: 2, name: 'Kerámialap Öntése', desc: 'Cementből öntött páncéllapok', req: { concrete_mix: 1, dirty_water: 1 }, station: 'workshop' },
    { key: 'steel_plate', name: 'Vastag Acéllemez', desc: 'Fémtömbökből kovácsolt lemez', req: { pure_metal_bar: 2 }, tools: ['claw_hammer'], station: 'workshop' },
    { key: 'pipe_pistol', name: 'Házi Készítésű Csőfegyver', desc: 'Egyszerű egylövetű pisztoly', req: { pipe: 1, coil_spring: 1, duct_tape: 2, rusty_bolts: 2 }, tools: [['pliers', 'multitool'], 'claw_hammer'], station: 'workshop' },
    { key: 'kevlar_vest', name: 'Kevlár Mellény', desc: 'Kerámialapokkal megerősített mellény', req: { ceramic_plates: 4, canvas_roll: 2, duct_tape: 2 }, tools: ['sewing_kit'], station: 'workshop' },
    { key: 'gunpowder', name: 'Lőpor', desc: 'Vegyszerekből kevert lőpor', req: { chemical_solvent: 1, old_newspaper: 2 }, station: 'workshop' },
    { key: 'tan_leather', result: 'tanned_leather', name: 'Bőrcserzés', desc: 'Nyers bőr kikészítése', req: { leather: 2, alcohol: 1 }, station: 'workshop' },
    { key: 'moonshine', name: 'Pálinkafőzés', desc: 'Krumpliból főzött szesz', req: { potato: 4, dirty_water: 1, empty_jar: 1 }, station: 'workshop' }
];

// Böngésző támogatás (ha még nem létezett, rátesszük a window-ra)
if (typeof window !== 'undefined') {
    if (!window.craftingRecipes) {
        window.craftingRecipes = craftingRecipes;
        window.CRAFT_CATEGORIES = CRAFT_CATEGORIES;
        window.RecipeTools = { TOOLBOX_REPLACES, FIRE_STARTERS, toolOptions };
    }
}

// Szerver (Node.js) támogatás
if (typeof module !== 'undefined' && module.exports) {
    module.exports = craftingRecipes;
    module.exports.RecipeTools = { TOOLBOX_REPLACES, FIRE_STARTERS, toolOptions };
}
