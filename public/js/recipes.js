// recipes.js
// BARKÁCSRECEPTEK (a szerver és a kliens is ezt tölti be)
//   key      a recept azonosítója (egyedi)
//   result   az elkészülő tárgy kulcsa (items.js); ha hiányzik, a key
//   count    hány darab készül (alapból 1)
//   req      alapanyagok: { tárgykulcs: darab } (elfogynak)
//   tools    szükséges szerszámok (NEM fogynak el, de kopnak: minden barkácsolás 1 tartósságot visz el).
//            Egy elem lehet egy kulcs, vagy egy lista, amiből bármelyik megfelel: ['pliers', 'multitool']
//   station  'workshop': csak műhelyben készíthető (a műhelyek egy későbbi frissítésben jönnek)
const craftingRecipes = [
    // --- ELSŐSEGÉLY ---
    { key: 'rag_bandage', name: 'Rongy Kötés', desc: 'Két rongyból gyors kötés', req: { rag: 2 } },
    { key: 'bandage', name: 'Steril Kötszer', desc: 'Rongykötés alkohollal fertőtlenítve', req: { rag_bandage: 2, alcohol: 1 } },
    { key: 'clean_rag', result: 'rag', count: 2, name: 'Rongymosás', desc: 'Koszos rongyból tiszta szövet', req: { dirty_rag: 2, dirty_water: 1 } },
    { key: 'cotton_cord', name: 'Pamutzsinór', desc: 'Rongycsíkokból sodort zsinór', req: { rag: 2 } },

    // --- VÍZ ---
    { key: 'filter_water', result: 'water_bottle', name: 'Vízszűrés', desc: 'Szennyezett víz átszűrése palackba', req: { dirty_water: 1, plastic_bottle: 1 }, tools: ['straw_filter'] },
    { key: 'boil_water', result: 'water_bottle', name: 'Vízforralás', desc: 'Szennyezett víz felforralása konzervdobozban', req: { dirty_water: 1, matchbox: 1, plastic_bottle: 1 }, tools: ['empty_can'] },

    // --- FÉNY ÉS ESZKÖZÖK ---
    { key: 'torch', name: 'Fáklya', desc: 'Éjszakai fényforrás', req: { stick: 1, rag: 1, alcohol: 1 } },
    { key: 'hemp_rope', name: 'Kenderkötél', desc: 'Zsinórokból font erős kötél', req: { cotton_cord: 3 } },
    { key: 'lockpick', name: 'Álkulcs Készlet', desc: 'Zárak feltöréséhez', req: { wire: 1, nails: 1 }, tools: [['pliers', 'multitool']] },

    // --- FEGYVER ---
    { key: 'spear', name: 'Barkácsolt Lándzsa', desc: 'Bot, ragasztószalag és egy éles fémdarab', req: { stick: 2, duct_tape: 1, metal_scrap: 1 }, tools: [['pliers', 'multitool', 'claw_hammer']] },

    // --- TÁSKA ---
    { key: 'market_tote', name: 'Vászon Bevásárlótáska', desc: 'Egyszerű varrt táska', req: { rag: 3, cotton_cord: 1 }, tools: ['sewing_kit'] },
    { key: 'field_satchel', name: 'Vászon Válltáska', desc: 'Strapabíró vászontáska', req: { canvas_roll: 1, cotton_cord: 2 }, tools: ['sewing_kit'] },

    // --- LŐSZER ÚJRATÖLTÉS (1 hüvely = 1 töltény) ---
    { key: 'reload_9mm', result: 'ammo_9mm', count: 3, name: '9mm Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_762', result: 'ammo_762', count: 3, name: '7.62 Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_556', result: 'ammo_556', count: 3, name: '5.56 Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_buckshot', result: 'ammo_buckshot', count: 3, name: 'Sörét Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 1, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },
    { key: 'reload_sniper', result: 'ammo_sniper', count: 3, name: 'Mesterlövész Újratöltés', desc: '3 hüvely + lőpor + ólom = 3 töltény', req: { empty_casing: 3, gunpowder: 2, lead_pipes_scrap: 1 }, tools: [['pliers', 'multitool']] },

    // --- MŰHELYBEN (egy későbbi frissítésben) ---
    { key: 'pure_metal_bar', name: 'Tiszta Fémtömb', desc: 'Fémhulladék beolvasztása', req: { metal_scrap: 5 }, station: 'workshop' },
    { key: 'steel_plate', name: 'Vastag Acéllemez', desc: 'Fémtömbökből kovácsolt lemez', req: { pure_metal_bar: 2 }, tools: ['claw_hammer'], station: 'workshop' },
    { key: 'pipe_pistol', name: 'Házi Készítésű Csőfegyver', desc: 'Egyszerű egylövetű pisztoly', req: { pipe: 1, coil_spring: 1, duct_tape: 2, rusty_bolts: 2 }, tools: [['pliers', 'multitool'], 'claw_hammer'], station: 'workshop' },
    { key: 'kevlar_vest', name: 'Kevlár Mellény', desc: 'Kerámialapokkal megerősített mellény', req: { ceramic_plates: 4, canvas_roll: 2, duct_tape: 2 }, tools: ['sewing_kit'], station: 'workshop' },
    { key: 'gunpowder', name: 'Lőpor', desc: 'Vegyszerekből kevert lőpor', req: { chemical_solvent: 1, old_newspaper: 2 }, station: 'workshop' }
];

// Böngésző támogatás (ha még nem létezett, rátesszük a window-ra)
if (typeof window !== 'undefined') {
    if (!window.craftingRecipes) {
        window.craftingRecipes = craftingRecipes;
    }
}

// Szerver (Node.js) támogatás
if (typeof module !== 'undefined' && module.exports) {
    module.exports = craftingRecipes;
}
