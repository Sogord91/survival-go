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
    { key: 'boil_water', cat: 'Víz és étel', result: 'water_bottle', name: 'Vízforralás', desc: 'Szennyezett víz felforralása konzervdobozban', req: { dirty_water: 1, matchbox: 1, plastic_bottle: 1 }, tools: ['empty_can'] },
    { key: 'distill_water', cat: 'Víz és étel', result: 'distilled_water', name: 'Lepárolt Víz', desc: 'Két adag koszos víz lepárlása befőttesüvegbe', req: { dirty_water: 2, empty_jar: 1, matchbox: 1 }, tools: ['empty_can'] },
    { key: 'chili_pot', cat: 'Víz és étel', name: 'Csilis Bab', desc: 'Babkonzerv paradicsommal összefőzve', req: { canned_food: 2, tomato: 1, matchbox: 1 }, tools: ['empty_can'] },
    { key: 'fish_and_chips', cat: 'Víz és étel', name: 'Hal és Sült Krumpli', desc: 'Tonhal krumplival, tűzön sütve', req: { tuna_can: 1, potato: 2, matchbox: 1 }, tools: ['empty_can'] },

    // --- FEGYVEREK ---
    { key: 'improvised_bow', cat: 'Fegyverek', name: 'Barkácsolt Íj', desc: 'Hajlított bot kötélhúrral, nyílvessző kell hozzá', req: { stick: 2, hemp_rope: 1, duct_tape: 1 } },
    { key: 'sling', cat: 'Fegyverek', name: 'Parittya', desc: 'Kődarabokat lő, minden lövés egy követ visz el', req: { cotton_cord: 1, rag: 1 } },
    { key: 'stone_axe', cat: 'Fegyverek', name: 'Kőbalta', desc: 'Botra kötözött éles kő', req: { stick: 1, stone: 1, cotton_cord: 1 } },
    { key: 'nail_club', cat: 'Fegyverek', name: 'Szöges Bot', desc: 'Szögekkel kivert bunkó', req: { stick: 1, nails: 3 }, tools: ['claw_hammer'] },
    { key: 'pipe_club', cat: 'Fegyverek', name: 'Csőbunkó', desc: 'Acélcső ragasztószalagos markolattal', req: { pipe: 1, duct_tape: 1 } },
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
    { key: 'hunting_vest', cat: 'Ruha és táska', name: 'Vadászmellény', desc: 'Bőrrel megerősített vászonmellény', req: { tanned_leather: 1, canvas_roll: 1, cotton_cord: 1 }, tools: ['sewing_kit'] },
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
    { key: 'purify_alcohol', cat: 'Alapanyag', result: 'alcohol', name: 'Alkohol Tisztítása', desc: 'Két üveg pálinkából tiszta alkohol', req: { moonshine: 2 }, tools: ['straw_filter'] },

    // --- SZÉTSZERELÉS ---
    { key: 'scrap_toaster', cat: 'Szétszerelés', result: 'metal_scrap', count: 2, name: 'Kenyérpirító Szétszedése', desc: 'Fémhulladék a házából', req: { broken_toaster: 1 }, tools: ['screwdriver'] },
    { key: 'scrap_radiator', cat: 'Szétszerelés', result: 'metal_scrap', count: 3, name: 'Radiátor Szétszedése', desc: 'Az alumíniumbordák fémhulladéknak', req: { radiator_chunk: 1 }, tools: [['pliers', 'socket_wrench']] },
    { key: 'strip_wire', cat: 'Szétszerelés', result: 'wire', name: 'Kábel Kibontása', desc: 'A gabalyból használható drót', req: { scrap_wire_bundle: 1 }, tools: [['pliers', 'multitool']] },

    // --- OLVASZTÓBAN / MŰHELYBEN (egy későbbi frissítésben, az épület ablakában) ---
    { key: 'pure_metal_bar', name: 'Tiszta Fémtömb', desc: 'Fémhulladék beolvasztása', req: { metal_scrap: 5 }, station: 'smelter' },
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
    }
}

// Szerver (Node.js) támogatás
if (typeof module !== 'undefined' && module.exports) {
    module.exports = craftingRecipes;
}
