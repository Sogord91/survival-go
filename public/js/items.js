// items.js
// =====================================================================================
// TÁRGYSÉMA – minden tárgy ugyanezeket a mezőket használhatja (a szerver és a kliens is ezt a fájlt tölti be)
//   name        megjelenő név
//   type        food | drink | medicine        -> fogyasztható ("Használ"), ha van effects
//               weapon | helmet | torso | armor | legs | shoes | backpack -> felvehető ("Felvesz"), a type = a slot neve
//               material | tool | mod | ammo | valuable | collectible | artifact -> nem használható közvetlenül
//   icon        emoji, vagy kép útvonala (pl. '/images/items/canned_beans.webp')
//   desc        rövid leírás
//   weight      súly (kg / db)
//   stackable   true: egy slotban bármennyi lehet belőle; false: minden darab külön slot
//   tier        1-5 (ritkaság / erősség)
//   effects     fogyasztás hatása: { hunger, thirst, hp, fatigue } (pl. { thirst: 20, fatigue: -30 })
//   def, hpBonus, bonusSlots, maxWeightBonus, fatigueRate   felszerelés bónuszai (stats.js számolja)
//   dmg, reqAmmo, slot                                      fegyver adatai; slot: weapon (elsődleges) | secondary (pisztoly) | melee (közelharci)
//   durability  szerszám tartóssága (ennyi használat után eltörik)
//   light       fényforrás (éjszaka teljes látótávolság): { fuel: tárgykulcs | null }; a durability = égési idő percben.
//               Éjszaka fogy. Ha lemerül: a fuel-ből (elem, lámpaolaj) automatikusan újratölt; fuel nélkül (fáklya) elég.
//   img         ikon az ikoncsomagból: /images/items/<img>.webp (ha még nincs feltöltve, az emoji látszik)
//   loot        hol található és milyen gyakran: { <loot-csoport>: súly } (a csoportokat a buildings.js sorolja épületekhez)
//               súly: 10 gyakori, 5 közepes, 2 ritka, 1 alatt nagyon ritka
//   lootCount   [min, max] darab egy találatkor (alapból 1)
// =====================================================================================

const itemDatabase = {
    // --- ÉTEL ---
    'canned_food': { name: 'Babkonzerv', type: 'food', icon: '🥫', img: 'SURV-0164_canned_beans', desc: '+40 Éhség', effects: { hunger: 40 }, weight: 0.4, stackable: true, loot: { grocery: 10, smallgoods: 6, household: 4, military: 3, kitchen: 3 } },
    'tuna_can': { name: 'Tonhalkonzerv', type: 'food', icon: '🐟', desc: '+45 Éhség', effects: { hunger: 45 }, weight: 0.4, stackable: true, loot: { grocery: 8, smallgoods: 4, household: 2 } },
    'mre_ration': { name: 'Katonai MRE Adag', type: 'food', icon: '📦', img: 'SURV-0183_cured_meat_rations', desc: '+80 Éhség, -25 Fáradtság', effects: { hunger: 80, fatigue: -25 }, weight: 0.8, stackable: true, loot: { military: 8, police: 2 } },
    'energy_bar': { name: 'Energiaszelet', type: 'food', icon: '🍫', img: 'SURV-0185_survival_granola_bars', desc: '+25 Éhség, -20 Fáradtság', effects: { hunger: 25, fatigue: -20 }, weight: 0.1, stackable: true, loot: { smallgoods: 8, grocery: 5, sport: 6, office: 2 } },
    'canned_bacon': { name: 'Zónás Disznósajt Konzerv', type: 'food', icon: '🥩', img: 'SURV-0172_salted_pork_belly', desc: '+60 Éhség, zsíros katonai falat', effects: { hunger: 60 }, weight: 0.5, stackable: true, loot: { grocery: 4, military: 3, household: 2 } },
    'mutant_steak': { name: 'Sült Mutáns Hús', type: 'food', icon: '🍖', img: 'SURV-0119_pan_seared_steak', desc: '+70 Éhség', effects: { hunger: 70 }, weight: 0.6, stackable: true, loot: { kitchen: 3, farm: 3 } },
    'dry_galette': { name: 'Katonai Keksz', type: 'food', icon: '🍘', img: 'SURV-0200_graham_crackers', desc: '+20 Éhség, száraz de tartós', effects: { hunger: 20 }, weight: 0.2, stackable: true, loot: { military: 6, grocery: 3 } },
    'canned_peaches': { name: 'Barackbefőtt Konzerv', type: 'food', icon: '🍑', img: 'SURV-0173_canned_peaches', desc: '+30 Éhség, +10 Szomjúság', effects: { hunger: 30, thirst: 10 }, weight: 0.5, stackable: true, loot: { grocery: 6, household: 2 } },
    'canned_beans_rice': { name: 'Babos Rizs Konzerv', type: 'food', icon: '🥫', img: 'SURV-0178_canned_beans_and_rice', desc: '+50 Éhség', effects: { hunger: 50 }, weight: 0.5, stackable: true, loot: { grocery: 5, military: 2 } },
    'pemmican': { name: 'Pemmikán', type: 'food', icon: '🥓', img: 'SURV-0179_pemmican', desc: '+55 Éhség', effects: { hunger: 55 }, weight: 0.3, stackable: true, loot: { military: 2, household: 0.5 } },
    'trail_mix': { name: 'Diós Müzlikeverék', type: 'food', icon: '🥜', img: 'SURV-0180_trail_mix_with_nuts', desc: '+25 Éhség, -5 Fáradtság', effects: { hunger: 25, fatigue: -5 }, weight: 0.2, stackable: true, loot: { smallgoods: 5, sport: 4 } },
    'salmon_jerky': { name: 'Szárított Lazac', type: 'food', icon: '🐟', img: 'SURV-0182_smoked_salmon_jerky', desc: '+35 Éhség', effects: { hunger: 35 }, weight: 0.2, stackable: true, loot: { grocery: 3, smallgoods: 3 } },
    'soup_packets': { name: 'Zacskós Leves', type: 'food', icon: '🍜', img: 'SURV-0181_dehydrated_soup_packets', desc: '+30 Éhség', effects: { hunger: 30 }, weight: 0.1, stackable: true, loot: { grocery: 6, household: 3, office: 2 } },
    'instant_oatmeal': { name: 'Instant Zabkása', type: 'food', icon: '🥣', img: 'SURV-0184_instant_oatmeal_with_dried_fruits', desc: '+30 Éhség', effects: { hunger: 30 }, weight: 0.2, stackable: true, loot: { grocery: 5, household: 3 } },
    'bread_loaf': { name: 'Teljes Kiőrlésű Kenyér', type: 'food', icon: '🍞', img: 'SURV-0159_whole_wheat_bread', desc: '+35 Éhség', effects: { hunger: 35 }, weight: 0.5, stackable: true, loot: { grocery: 7, kitchen: 4 } },
    'tortilla': { name: 'Tortilla Lap', type: 'food', icon: '🫓', img: 'SURV-0158_tortilla', desc: '+20 Éhség', effects: { hunger: 20 }, weight: 0.1, stackable: true, loot: { grocery: 4, kitchen: 3 } },
    'ham_slices': { name: 'Sonkaszeletek', type: 'food', icon: '🥩', img: 'SURV-0169_cured_ham_slices', desc: '+30 Éhség', effects: { hunger: 30 }, weight: 0.3, stackable: true, loot: { grocery: 4, kitchen: 3 } },
    'dried_fruit': { name: 'Aszalt Gyümölcs', type: 'food', icon: '🍇', img: 'SURV-0177_dried_fruit_mix', desc: '+20 Éhség', effects: { hunger: 20 }, weight: 0.2, stackable: true, loot: { grocery: 4, smallgoods: 3 } },
    'potato': { name: 'Krumpli', type: 'food', icon: '🥔', img: 'SURV-0024_potato', desc: '+15 Éhség', effects: { hunger: 15 }, weight: 0.3, stackable: true, loot: { grocery: 6, farm: 6, household: 2 } },
    'tomato': { name: 'Paradicsom', type: 'food', icon: '🍅', img: 'SURV-0028_tomato', desc: '+10 Éhség, +5 Szomjúság', effects: { hunger: 10, thirst: 5 }, weight: 0.2, stackable: true, loot: { grocery: 5, farm: 5 } },
    'carrot': { name: 'Sárgarépa', type: 'food', icon: '🥕', img: 'SURV-0017_carrot', desc: '+10 Éhség', effects: { hunger: 10 }, weight: 0.15, stackable: true, loot: { grocery: 5, farm: 5 } },
    'cookies': { name: 'Mogyoróvajas Keksz', type: 'food', icon: '🍪', img: 'SURV-0197_peanut_butter_cookies', desc: '+15 Éhség, -5 Fáradtság', effects: { hunger: 15, fatigue: -5 }, weight: 0.15, stackable: true, loot: { smallgoods: 6, grocery: 4, office: 2 } },
    'muffin': { name: 'Csokis Muffin', type: 'food', icon: '🧁', img: 'SURV-0198_chocolate_chip_muffins', desc: '+20 Éhség', effects: { hunger: 20 }, weight: 0.15, stackable: true, loot: { kitchen: 5, smallgoods: 3 } },
    'chili_pot': { name: 'Csilis Bab (adag)', type: 'food', icon: '🍲', img: 'SURV-0195_campfire_chili', desc: '+60 Éhség', effects: { hunger: 60 }, weight: 0.6, stackable: true, loot: { kitchen: 4 } },
    'fish_and_chips': { name: 'Hal és Sült Krumpli', type: 'food', icon: '🍟', img: 'SURV-0137_fish_and_chips_box', desc: '+45 Éhség', effects: { hunger: 45 }, weight: 0.4, stackable: true, loot: { kitchen: 5 } },
    'sausages': { name: 'Grillkolbász', type: 'food', icon: '🌭', img: 'SURV-0120_barbecue_sausages', desc: '+35 Éhség', effects: { hunger: 35 }, weight: 0.3, stackable: true, loot: { kitchen: 4, grocery: 2 } },

    // --- ITAL ---
    'water_bottle': { name: 'Vizespalack', type: 'drink', icon: '💧', img: 'SURV-0248_spring_water_bottle', desc: '+50 Szomjúság', effects: { thirst: 50 }, weight: 1.5, stackable: true, loot: { drinks: 10, grocery: 6, smallgoods: 6, sport: 6, household: 3, utility: 6, office: 2 } },
    'kvass': { name: 'Hűtött Kvasz', type: 'drink', icon: '🍺', img: 'SURV-0207_ceramic_stopper_bottle', desc: '+40 Szomjúság', effects: { thirst: 40 }, weight: 0.5, stackable: true, loot: { drinks: 6 } },
    'vodka': { name: 'Zóna Vodka', type: 'drink', icon: '🥃', img: 'SURV-0208_glass_swing_top_bottle', desc: '+30 Szomjúság', effects: { thirst: 30 }, weight: 0.5, stackable: true, loot: { drinks: 4, household: 2 } },
    'energy_drink': { name: 'Monster Energiaital', type: 'drink', icon: '⚡', desc: '+20 Szomjúság, -30 Fáradtság', effects: { thirst: 20, fatigue: -30 }, weight: 0.3, stackable: true, loot: { drinks: 6, smallgoods: 6, sport: 4 } },
    'coffee': { name: 'Fekete Kávé', type: 'drink', icon: '☕', img: 'SURV-0278_roasted_chicory_coffee', desc: '-40 Fáradtság', effects: { fatigue: -40 }, weight: 0.2, stackable: true, loot: { kitchen: 6, office: 5, grocery: 3 } },
    'moonshine': { name: 'Házi Főzésű Szesz (Pálinka)', type: 'drink', icon: '🧪', img: 'SURV-0216_corked_clay_bottle', desc: '+35 Szomjúság', effects: { thirst: 35 }, weight: 0.5, stackable: true, loot: { household: 2, farm: 3, drinks: 1 } },
    'dirty_water': { name: 'Szennyezett Csapvíz', type: 'drink', icon: '🚰', img: 'SURV-0242_murky_water_bottle', desc: '+25 Szomjúság', effects: { thirst: 25 }, weight: 1, stackable: true, loot: { household: 4, utility: 4, industrial: 2 } },
    'mineral_water': { name: 'Ásványvíz', type: 'drink', icon: '💧', img: 'SURV-0244_mineral_water_flask', desc: '+45 Szomjúság', effects: { thirst: 45 }, weight: 1, stackable: true, loot: { drinks: 8, grocery: 4, sport: 4 } },
    'distilled_water': { name: 'Desztillált Víz', type: 'drink', icon: '🧴', img: 'SURV-0250_distilled_water_flask', desc: '+40 Szomjúság', effects: { thirst: 40 }, weight: 1, stackable: true, loot: { hospital: 3, hazmat: 2 } },
    'cranberry_juice': { name: 'Áfonyalé', type: 'drink', icon: '🧃', img: 'SURV-0290_cranberry_juice', desc: '+5 Éhség, +35 Szomjúság', effects: { hunger: 5, thirst: 35 }, weight: 0.6, stackable: true, loot: { drinks: 5, grocery: 4 } },
    'pineapple_juice': { name: 'Ananászlé', type: 'drink', icon: '🍍', img: 'SURV-0291_pineapple_juice', desc: '+5 Éhség, +35 Szomjúság', effects: { hunger: 5, thirst: 35 }, weight: 0.6, stackable: true, loot: { drinks: 4, grocery: 3 } },
    'coconut_water': { name: 'Kókuszvíz', type: 'drink', icon: '🥥', img: 'SURV-0292_coconut_water', desc: '+40 Szomjúság', effects: { thirst: 40 }, weight: 0.5, stackable: true, loot: { drinks: 3, sport: 3 } },
    'hot_cocoa': { name: 'Forró Kakaó', type: 'drink', icon: '☕', img: 'SURV-0280_hot_cocoa_mug', desc: '+10 Éhség, +15 Szomjúság, -10 Fáradtság', effects: { hunger: 10, thirst: 15, fatigue: -10 }, weight: 0.4, stackable: true, loot: { kitchen: 4, office: 3 } },
    'mint_tea': { name: 'Mentatea', type: 'drink', icon: '🍵', img: 'SURV-0277_mint_herbal_tea', desc: '+20 Szomjúság, -5 Fáradtság', effects: { thirst: 20, fatigue: -5 }, weight: 0.3, stackable: true, loot: { kitchen: 3, office: 3, household: 2 } },
    'honey_water': { name: 'Mézes Víz', type: 'drink', icon: '🍯', img: 'SURV-0285_warm_honey_water', desc: '+5 Éhség, +25 Szomjúság', effects: { hunger: 5, thirst: 25 }, weight: 0.5, stackable: true, loot: { household: 2, farm: 2 } },

    // --- GYÓGYSZER ---
    'rag_bandage': { name: 'Rongy Kötés', type: 'medicine', icon: '📜', img: 'SURV-0306_triangular_bandage', desc: '+25 Élet', effects: { hp: 25 }, weight: 0.1, stackable: true, loot: { household: 4, medical: 2 } },
    'bandage': { name: 'Steril Kötszer', type: 'medicine', icon: '🩹', img: 'SURV-0301_rolled_gauze_bandage', desc: '+50 Élet', effects: { hp: 50 }, weight: 0.2, stackable: true, loot: { medical: 10, hospital: 6, police: 2, fire: 4, military: 3, sport: 1 } },
    'painkillers': { name: 'Ibuprofen', type: 'medicine', icon: '💊', desc: '+30 Élet', effects: { hp: 30 }, weight: 0.1, stackable: true, loot: { medical: 10, hospital: 4, household: 2, office: 1 } },
    'morphine': { name: 'Morfin Injekció', type: 'medicine', icon: '💉', img: 'SURV-0338_oral_syringe', desc: '+70 Élet', effects: { hp: 70 }, weight: 0.2, stackable: true, loot: { hospital: 3, medical: 1, military: 2 } },
    'medkit': { name: 'Katonai Trauma Csomag', type: 'medicine', icon: '🧰', img: 'SURV-0383_trauma_response_bag', desc: '+100 Élet', effects: { hp: 100 }, weight: 1.2, stackable: false, loot: { hospital: 1.5, military: 1.5, fire: 1 } },
    'antibiotics': { name: 'Antibiotikum', type: 'medicine', icon: '💊', desc: '+40 Élet', effects: { hp: 40 }, weight: 0.1, stackable: true, loot: { medical: 6, hospital: 4 } },
    'antirad_pills': { name: 'Anti-Rad Sugárzás elleni Tabletta', type: 'medicine', icon: '☣️', desc: 'Sugárzás ellen (a sugárzás egy későbbi frissítésben jön, addig nem használható)', weight: 0.1, stackable: true, loot: { hazmat: 4, military: 1, hospital: 1 } },
    'gauze_pad': { name: 'Steril Gézlap', type: 'medicine', icon: '🩹', img: 'SURV-0302_sterile_gauze_pad', desc: '+15 Élet', effects: { hp: 15 }, weight: 0.05, stackable: true, lootCount: [1, 3], loot: { medical: 8, hospital: 4, household: 3, office: 1 } },
    'band_aid': { name: 'Ragtapasz', type: 'medicine', icon: '🩹', img: 'SURV-0303_adhesive_bandage_strip', desc: '+8 Élet', effects: { hp: 8 }, weight: 0.02, stackable: true, lootCount: [1, 4], loot: { medical: 8, household: 5, office: 3, sport: 2, smallgoods: 2 } },
    'compression_bandage': { name: 'Nyomókötés', type: 'medicine', icon: '🩹', img: 'SURV-0304_compression_bandage', desc: '+40 Élet', effects: { hp: 40 }, weight: 0.15, stackable: true, loot: { medical: 4, hospital: 4, police: 2, fire: 2 } },
    'hemostatic_gauze': { name: 'Vérzéscsillapító Géz', type: 'medicine', icon: '🩸', img: 'SURV-0307_hemostatic_gauze', desc: '+60 Élet', effects: { hp: 60 }, weight: 0.1, stackable: true, loot: { hospital: 3, military: 2, police: 1 } },
    'antiseptic_wipes': { name: 'Fertőtlenítő Kendő', type: 'medicine', icon: '🧻', img: 'SURV-0321_antiseptic_wipes', desc: '+10 Élet', effects: { hp: 10 }, weight: 0.05, stackable: true, loot: { medical: 6, hospital: 4, household: 2, smallgoods: 2 } },
    'iodine': { name: 'Jódoldat', type: 'medicine', icon: '🧪', img: 'SURV-0322_iodine_dropper_bottle', desc: '+15 Élet', effects: { hp: 15 }, weight: 0.1, stackable: true, loot: { medical: 5, hospital: 3 } },
    'suture_kit': { name: 'Sebvarró Készlet', type: 'medicine', icon: '🪡', img: 'SURV-0352_suture_kit', desc: '+45 Élet', effects: { hp: 45 }, weight: 0.2, stackable: false, loot: { hospital: 3, military: 1.5 } },
    'tourniquet': { name: 'Szorítókötés (CAT)', type: 'medicine', icon: '🎗️', img: 'SURV-0346_windlass_tourniquet', desc: '+35 Élet', effects: { hp: 35 }, weight: 0.1, stackable: true, loot: { military: 3, police: 2, hospital: 2, fire: 1 } },
    'chest_seal': { name: 'Mellkasi Zárókötés', type: 'medicine', icon: '🩹', img: 'SURV-0347_chest_seal_pack', desc: '+50 Élet', effects: { hp: 50 }, weight: 0.1, stackable: true, loot: { military: 2, hospital: 2 } },
    'first_aid_pouch': { name: 'Elsősegély-tasak', type: 'medicine', icon: '👝', img: 'SURV-0381_compact_first_aid_pouch', desc: '+60 Élet', effects: { hp: 60 }, weight: 0.5, stackable: false, loot: { household: 1, office: 2, auto: 2, sport: 1 } },
    'hiker_med_kit': { name: 'Túra-elsősegélycsomag', type: 'medicine', icon: '🧰', img: 'SURV-0382_hiker_medical_kit', desc: '+75 Élet', effects: { hp: 75 }, weight: 0.8, stackable: false, loot: { sport: 1.5, medical: 1 } },
    'willow_tonic': { name: 'Fűzfakéreg Tinktúra', type: 'medicine', icon: '🌿', img: 'SURV-0391_willow_bark_tonic', desc: '+20 Élet', effects: { hp: 20 }, weight: 0.1, stackable: true, loot: { medical: 3, culture: 1 } },
    'honey_syrup': { name: 'Mézes Köhögés Elleni Szirup', type: 'medicine', icon: '🍯', img: 'SURV-0400_honey_throat_syrup', desc: '+5 Szomjúság, +12 Élet', effects: { thirst: 5, hp: 12 }, weight: 0.2, stackable: true, loot: { medical: 4, household: 2 } },

    // --- FEGYVEREK ---
    'knife': { name: 'Katonai Harci Kés', type: 'weapon', slot: 'melee', tier: 1, icon: '🗡️', img: 'weapon_knife', desc: 'Tier 1 - Közelharci fegyver (+8 Sebzés)', dmg: 8, weight: 0.6, stackable: false, loot: { household: 3, kitchen: 3, military: 2 } },
    'wrench': { name: 'Szerelőkulcs', type: 'weapon', slot: 'melee', tier: 1, icon: '🔧', img: 'SURV-1056_adjustable_wrench', desc: 'Tier 1 - Nehéz szerszám (+10 Sebzés)', dmg: 10, weight: 1.5, stackable: false, loot: { auto: 6, hardware: 4, tools: 3, industrial: 3 } },
    'machete': { name: 'Dzsungel Macseta', type: 'weapon', slot: 'melee', tier: 1, icon: '🔪', img: 'SURV-1007_machete', desc: 'Tier 1 - Vágófegyver (+12 Sebzés)', dmg: 12, weight: 1.2, stackable: false, loot: { farm: 2, hardware: 1 } },
    'baseball_bat': { name: 'Szöges Baseball Ütő', type: 'weapon', slot: 'melee', tier: 1, icon: '🏏', img: 'weapon_baseball_bat', desc: 'Tier 1 - Klasszikus zónás zúzó (+14 Sebzés)', dmg: 14, weight: 2, stackable: false, loot: { sport: 3, household: 1 } },
    'crowbar': { name: 'Feszítővas', type: 'weapon', slot: 'melee', tier: 2, icon: '⛏️', img: 'SURV-1100_crowbar', desc: 'Tier 2 - Kiváló feszítésre (+15 Sebzés)', dmg: 15, weight: 2.5, stackable: false, loot: { hardware: 2, warehouse: 2, fire: 2, tools: 1 } },
    'pipe_pistol': { name: 'Házi Készítésű Csőfegyver', type: 'weapon', slot: 'secondary', tier: 2, icon: '🔫', img: 'weapon_pipe_pistol', desc: 'Tier 2 - Egyszerű lőfegyver (+30 Sebzés)', dmg: 30, reqAmmo: 'ammo_9mm', weight: 1.8, stackable: false, loot: { household: 0.3, scrap: 0.5 } },
    'revolver_nagant': { name: 'Nagant M1895 Revolver', type: 'weapon', slot: 'secondary', tier: 2, icon: '🔫', img: 'weapon_revolver_nagant', desc: 'Tier 2 - Régi katonai revolver (+35 Sebzés)', dmg: 35, reqAmmo: 'ammo_9mm', weight: 1, stackable: false, loot: { police: 1, valuables: 0.3 } },
    'double_barrel': { name: 'Duplacsövű Vadászpuska', type: 'weapon', slot: 'weapon', tier: 2, icon: '💥', img: 'weapon_double_barrel', desc: 'Tier 2 - Rövid csövű klasszikus (+65 Sebzés)', dmg: 65, reqAmmo: 'ammo_buckshot', weight: 3, stackable: false, loot: { farm: 1, police: 0.5 } },
    'spear': { name: 'Barkácsolott Lándzsa', type: 'weapon', slot: 'melee', tier: 2, icon: '🗡️', img: 'SURV-1635_leaf_blade_spear', desc: 'Tier 2 - Távoltartó eszköz (+18 Sebzés)', dmg: 18, weight: 1.6, stackable: false, loot: { farm: 0.5 } },
    'axe': { name: 'Tűzoltó Balta', type: 'weapon', slot: 'melee', tier: 3, icon: '🪓', img: 'SURV-1001_felling_axe', desc: 'Tier 3 - Vágófegyver (+25 Sebzés)', dmg: 25, weight: 3, stackable: false, loot: { fire: 6, tools: 1, farm: 1 } },
    'makarov': { name: 'Makarov PM Pisztoly', type: 'weapon', slot: 'secondary', tier: 3, icon: '🔫', img: 'weapon_makarov', desc: 'Tier 3 - Megbízható pisztoly (+40 Sebzés)', dmg: 40, reqAmmo: 'ammo_9mm', weight: 1.2, stackable: false, loot: { police: 3, military: 2 } },
    'shotgun': { name: 'TOZ Sörétes Puska', type: 'weapon', slot: 'weapon', tier: 3, icon: '💥', img: 'weapon_shotgun', desc: 'Tier 3 - Sörétes puska (+75 Sebzés)', dmg: 75, reqAmmo: 'ammo_buckshot', weight: 3.2, stackable: false, loot: { police: 1.5, farm: 0.5 } },
    'sks_rifle': { name: 'SKS Félautomata Karabély', type: 'weapon', slot: 'weapon', tier: 3, icon: '🎯', img: 'weapon_sks_rifle', desc: 'Tier 3 - Pontos katonai puska (+85 Sebzés)', dmg: 85, reqAmmo: 'ammo_762', weight: 3.6, stackable: false, loot: { military: 1.5 } },
    'submachine_ppsh': { name: 'PPSh-41 Géppisztoly', type: 'weapon', slot: 'weapon', tier: 3, icon: '🔫', img: 'weapon_submachine_ppsh', desc: 'Tier 3 - Dobtáras klasszikus (+70 Sebzés)', dmg: 70, reqAmmo: 'ammo_9mm', weight: 3.5, stackable: false, loot: { military: 1 } },
    'sledgehammer': { name: 'Bontókalapács', type: 'weapon', slot: 'melee', tier: 4, icon: '🔨', img: 'SURV-1020_sledgehammer', desc: 'Tier 4 - Nehéz szerszám (+35 Sebzés)', dmg: 35, weight: 5, stackable: false, loot: { tools: 1.5, hardware: 1, industrial: 1 } },
    'bow': { name: 'Kompozit Vadász Íj', type: 'weapon', slot: 'weapon', tier: 4, icon: '🏹', img: 'SURV-1608_horn_composite_bow', desc: 'Tier 4 - Csendes íj (+20 Sebzés)', dmg: 20, weight: 1.5, stackable: false, loot: { sport: 0.5, farm: 0.5 } },
    'hunting_rifle': { name: 'Mosin-Nagant Vadászpuska', type: 'weapon', slot: 'weapon', tier: 4, icon: '🎯', img: 'weapon_hunting_rifle', desc: 'Tier 4 - Nagy hatótáv (+95 Sebzés)', dmg: 95, reqAmmo: 'ammo_sniper', weight: 4, stackable: false, loot: { farm: 0.5, military: 0.5 } },
    'ak47': { name: 'AK-47 Gépkarabély', type: 'weapon', slot: 'weapon', tier: 4, icon: '🔥', img: 'weapon_ak47', desc: 'Tier 4 - Sorozatlövő fegyver (+110 Sebzés)', dmg: 110, reqAmmo: 'ammo_762', weight: 3.8, stackable: false, loot: { military: 1, police: 0.3 } },
    'm4a1_carbine': { name: 'M4A1 Taktikai Gépkarabély', type: 'weapon', slot: 'weapon', tier: 4, icon: '🔫', img: 'weapon_m4a1_carbine', desc: 'Tier 4 - Modern NATO puska (+115 Sebzés)', dmg: 115, reqAmmo: 'ammo_556', weight: 3.3, stackable: false, loot: { military: 0.5 } },
    'combat_shotgun': { name: 'Benelli M4 Harci Sörétes', type: 'weapon', slot: 'weapon', tier: 4, icon: '💥', img: 'weapon_combat_shotgun', desc: 'Tier 4 - Félautomata sörétes (+90 Sebzés)', dmg: 90, reqAmmo: 'ammo_buckshot', weight: 3.6, stackable: false, loot: { police: 0.5, military: 0.5 } },
    'val_rifle': { name: 'AS Val Speciális Rohampuska', type: 'weapon', slot: 'weapon', tier: 5, icon: '🎯', img: 'weapon_val_rifle', desc: 'Tier 5 - Beépített hangtompítós elit (+130 Sebzés)', dmg: 130, reqAmmo: 'ammo_9mm', weight: 3.2, stackable: false, loot: { military: 0.2 } },
    'vintorez_sniper': { name: 'VSS Vintorez Mesterlövész', type: 'weapon', slot: 'weapon', tier: 5, icon: '🎯', img: 'weapon_vintorez_sniper', desc: 'Tier 5 - Halálos csendes elit puska (+145 Sebzés)', dmg: 145, reqAmmo: 'ammo_sniper', weight: 3.5, stackable: false, loot: { military: 0.15 } },
    'rpk_machinegun': { name: 'RPK Golyószóró', type: 'weapon', slot: 'weapon', tier: 5, icon: '🔥', img: 'weapon_rpk_machinegun', desc: 'Tier 5 - Pusztító tűzerő (+160 Sebzés)', dmg: 160, reqAmmo: 'ammo_762', weight: 5.5, stackable: false, loot: { military: 0.15 } },
    'gauss_gun': { name: 'Izmeriteli / Gauss Puska', type: 'weapon', slot: 'weapon', tier: 5, icon: '⚡', img: 'weapon_gauss_gun', desc: 'Tier 5 - Anomál technológiás prototípus (+220 Sebzés)', dmg: 220, reqAmmo: 'ammo_sniper', weight: 5, stackable: false, loot: { hazmat: 0.05 } },

    // --- FEJFEDŐK ---
    'cap': { name: 'Baseball Sapka', type: 'helmet', tier: 1, icon: '🧢', img: 'SURV-1154_canvas_field_cap', desc: 'Tier 1 - Alap fejfedő (+1 Véd.)', def: 1, hpBonus: 5, weight: 0.2, stackable: false, loot: { household: 3, sport: 2 } },
    'beanie': { name: 'Kötött Sínmaszk / Sapka', type: 'helmet', tier: 2, icon: '🧶', img: 'SURV-1152_wool_beanie', desc: 'Tier 2 - Meleg fejfedő (+2 Véd.)', def: 2, hpBonus: 10, weight: 0.2, stackable: false, loot: { household: 2, smallgoods: 1 } },
    'ushanka': { name: 'Usanka Orosz Sapka', type: 'helmet', tier: 3, icon: '🎩', img: 'SURV-1153_fur_trapper_hat', desc: 'Tier 3 - Vastag sapka (+3 Véd.)', def: 3, hpBonus: 15, weight: 0.4, stackable: false, loot: { household: 1, military: 1 } },
    'motorcycle_helmet': { name: 'Bukósisak', type: 'helmet', tier: 3, icon: '🪖', img: 'SURV-1206_rescue_helmet', desc: 'Tier 3 - Kemény sisak (+5 Véd.)', def: 5, hpBonus: 20, weight: 2, stackable: false, loot: { auto: 2, household: 0.5 } },
    'gp5_mask': { name: 'GP-5 Gázálarc', type: 'helmet', tier: 4, icon: '🪖', img: 'SURV-1218_full_face_respirator', desc: 'Tier 4 - Vegyvédelmi álarc (+5 Véd.)', def: 5, hpBonus: 20, weight: 1.5, stackable: false, loot: { hazmat: 3, military: 1.5 } },
    'm50_gas_mask': { name: 'M50 Taktikai Gázálarc', type: 'helmet', tier: 4, icon: '🪖', img: 'SURV-1229_silicone_respirator_mask', desc: 'Tier 4 - Modern gázálarc (+8 Véd.)', def: 8, hpBonus: 25, weight: 1.8, stackable: false, loot: { hazmat: 1.5, military: 1 } },
    'tactical_helmet': { name: 'FAST Katonai Sisak', type: 'helmet', tier: 4, icon: '🪖', desc: 'Tier 4 - Golyóálló sisak (+18 Véd.)', def: 18, hpBonus: 50, weight: 2, stackable: false, loot: { military: 1, police: 1 } },
    'altyn_helmet': { name: 'Altyn Golyóálló Sisak', type: 'helmet', tier: 5, icon: '🪖', img: 'SURV-1212_face_shield_work_helmet', desc: 'Tier 5 - Nehéz plexis rohamsisak (+25 Véd., +65 Max HP)', def: 25, hpBonus: 65, weight: 4, stackable: false, loot: { military: 0.2 } },
    'night_vision': { name: 'PNV-10T Éjjellátó Készülék', type: 'helmet', tier: 5, icon: '🕶️', desc: 'Tier 5 - Éjszakai portyázáshoz (+5 Véd.)', def: 5, hpBonus: 10, weight: 1, stackable: false, loot: { military: 0.3, police: 0.1 } },
    'earflap_cap': { name: 'Füles Téli Sapka', type: 'helmet', tier: 2, icon: '🧢', img: 'SURV-1159_ear_flap_winter_cap', desc: 'Tier 2 (+2 Véd., +8 Max HP)', def: 2, hpBonus: 8, weight: 0.3, stackable: false, loot: { household: 1.5, smallgoods: 1 } },
    'hard_hat': { name: 'Építési Védősisak', type: 'helmet', tier: 3, icon: '⛑️', img: 'SURV-1201_construction_hard_hat', desc: 'Tier 3 (+6 Véd., +15 Max HP)', def: 6, hpBonus: 15, weight: 0.5, stackable: false, loot: { industrial: 3, warehouse: 2, hardware: 1.5 } },
    'half_respirator': { name: 'Félálarc Szűrővel', type: 'helmet', tier: 3, icon: '😷', img: 'SURV-1217_half_face_respirator', desc: 'Tier 3 (+3 Véd., +10 Max HP)', def: 3, hpBonus: 10, weight: 0.4, stackable: false, loot: { industrial: 2, hazmat: 2, hardware: 1 } },
    'fire_helmet': { name: 'Tűzoltósisak', type: 'helmet', tier: 4, icon: '⛑️', img: 'SURV-1205_wildland_fire_helmet', desc: 'Tier 4 (+10 Véd., +30 Max HP)', def: 10, hpBonus: 30, weight: 1.2, stackable: false, loot: { fire: 4 } },

    // --- FELSŐ RUHÁZAT ---
    'tshirt': { name: 'Szakadt Póló', type: 'torso', tier: 1, icon: '👕', img: 'SURV-1101_canvas_work_shirt', desc: 'Tier 1 - Rongyos felső (+1 Véd.)', def: 1, hpBonus: 5, weight: 0.3, stackable: false, loot: { household: 4 } },
    'hoodie': { name: 'Kapucnis Pulóver', type: 'torso', tier: 2, icon: '🧥', img: 'SURV-1104_fleece_jacket', desc: 'Tier 2 - Kényelmes felső (+4 Véd.)', def: 4, hpBonus: 15, weight: 0.8, stackable: false, loot: { household: 2, sport: 1 } },
    'leather_jacket': { name: 'Klasszikus Bőrdzseki', type: 'torso', tier: 3, icon: '🧥', img: 'SURV-1106_leather_field_jacket', desc: 'Tier 3 - Vagány kabát (+8 Véd.)', def: 8, hpBonus: 25, weight: 2.5, stackable: false, loot: { household: 0.8, auto: 1 } },
    'military_jacket': { name: 'Flora Katonai Zubbony', type: 'torso', tier: 4, icon: '🧥', img: 'SURV-1105_waxed_canvas_jacket', desc: 'Tier 4 - Katonai felső (+16 Véd.)', def: 16, hpBonus: 55, weight: 3, stackable: false, loot: { military: 2 } },
    'gorka_jacket': { name: 'Gorka Taktikai Ruházat', type: 'torso', tier: 4, icon: '🧥', img: 'SURV-1110_hooded_rain_shell', desc: 'Tier 4 - Elit zubbony (+22 Véd.)', def: 22, hpBonus: 75, weight: 3.5, stackable: false, loot: { military: 1 } },
    'seva_suit': { name: 'SEVA Vegyvédelmi Ruházat', type: 'torso', tier: 5, icon: '☣️', img: 'SURV-1271_chemical_splash_suit', desc: 'Tier 5 - Teljes anomália védelem (+30 Véd., +90 Max HP)', def: 30, hpBonus: 90, weight: 4.5, stackable: false, loot: { hazmat: 0.5 } },
    'windbreaker': { name: 'Széldzseki', type: 'torso', tier: 2, icon: '🧥', img: 'SURV-1107_windbreaker_jacket', desc: 'Tier 2 (+3 Véd., +10 Max HP)', def: 3, hpBonus: 10, weight: 0.5, stackable: false, loot: { household: 2, sport: 2 } },
    'parka': { name: 'Bélelt Parka', type: 'torso', tier: 3, icon: '🧥', img: 'SURV-1108_insulated_parka', desc: 'Tier 3 (+7 Véd., +25 Max HP)', def: 7, hpBonus: 25, weight: 1.8, stackable: false, loot: { household: 0.8, military: 0.5 } },
    'firefighter_suit': { name: 'Tűzoltó Védőruha', type: 'torso', tier: 4, icon: '🧑‍🚒', img: 'SURV-1274_wildland_firefighting_suit', desc: 'Tier 4 (+18 Véd., +60 Max HP)', def: 18, hpBonus: 60, weight: 3.5, stackable: false, loot: { fire: 1.5 } },

    // --- NADRÁGOK ---
    'shorts': { name: 'Rövidnadrág', type: 'legs', tier: 1, icon: '🩳', img: 'SURV-1122_lightweight_trail_shorts', desc: 'Tier 1 - Alap nadrág (0 Véd.)', def: 0, hpBonus: 0, weight: 0.3, stackable: false, loot: { household: 3, sport: 3 } },
    'jeans': { name: 'Kopott Farmernadrág', type: 'legs', tier: 2, icon: '👖', img: 'SURV-1116_canvas_work_trousers', desc: 'Tier 2 - Erősebb nadrág (+4 Véd.)', def: 4, hpBonus: 15, weight: 0.8, stackable: false, loot: { household: 2 } },
    'tactical_pants': { name: 'Taktikai Zsebes Nadrág', type: 'legs', tier: 3, icon: '👖', img: 'SURV-1117_cargo_pants', desc: 'Tier 3 - Strapabíró nadrág (+8 Véd.)', def: 8, hpBonus: 30, weight: 1.2, stackable: false, loot: { military: 2, police: 1 } },
    'gorka_pants': { name: 'Gorka Taktikai Nadrág', type: 'legs', tier: 4, icon: '👖', img: 'SURV-1121_reinforced_knee_trousers', desc: 'Tier 4 - Elit nadrág (+14 Véd.)', def: 14, hpBonus: 50, weight: 1.6, stackable: false, loot: { military: 1 } },
    'wool_trousers': { name: 'Gyapjú Nadrág', type: 'legs', tier: 2, icon: '👖', img: 'SURV-1123_wool_field_trousers', desc: 'Tier 2 (+3 Véd., +10 Max HP)', def: 3, hpBonus: 10, weight: 0.8, stackable: false, loot: { household: 2 } },
    'leather_pants': { name: 'Bőrnadrág', type: 'legs', tier: 3, icon: '👖', img: 'SURV-1124_leather_work_pants', desc: 'Tier 3 (+6 Véd., +20 Max HP)', def: 6, hpBonus: 20, weight: 1.5, stackable: false, loot: { auto: 1.5, household: 0.5 } },

    // --- LÁBBELIK ---
    'slippers': { name: 'Gumis Strandpapucs', type: 'shoes', tier: 1, icon: '🩴', img: 'SURV-1137_lightweight_camp_sandals', desc: 'Tier 1 - Rossz lábbeli (+10% fáradtság)', def: 0, hpBonus: 0, fatigueRate: 1.1, weight: 0.3, stackable: false, loot: { household: 3, sport: 2 } },
    'sneakers': { name: 'Futócipő / Edzőcipő', type: 'shoes', tier: 2, icon: '👟', img: 'SURV-1130_trail_running_shoes', desc: 'Tier 2 - Könnyű cipő (+1 Véd., -10% fáradtság)', def: 1, hpBonus: 5, fatigueRate: 0.9, weight: 0.6, stackable: false, loot: { sport: 3, household: 1.5 } },
    'hiking_boots': { name: 'Túrabakancs', type: 'shoes', tier: 3, icon: '🥾', img: 'SURV-1126_leather_hiking_boots', desc: 'Tier 3 - Erős cipő (+3 Véd., -15% fáradtság)', def: 3, hpBonus: 10, fatigueRate: 0.85, weight: 1.4, stackable: false, loot: { sport: 1, household: 0.8, fire: 1 } },
    'combat_boots': { name: 'Katonai Harci Bakancs', type: 'shoes', tier: 4, icon: '🥾', img: 'SURV-1138_protective_gaiter_boots', desc: 'Tier 4 - Profi cipő (-30% fáradtság, +6 Véd.)', def: 6, hpBonus: 20, fatigueRate: 0.7, weight: 1.8, stackable: false, loot: { military: 1.5, police: 0.5 } },
    'canvas_shoes': { name: 'Vászoncipő', type: 'shoes', tier: 1, icon: '👟', img: 'SURV-1131_canvas_camp_shoes', desc: 'Tier 1 (+2 Max HP)', def: 0, hpBonus: 2, fatigueRate: 1, weight: 0.4, stackable: false, loot: { household: 3, sport: 1 } },
    'rubber_boots': { name: 'Gumicsizma', type: 'shoes', tier: 2, icon: '🥾', img: 'SURV-1127_rubber_rain_boots', desc: 'Tier 2 (+1 Véd., +5 Max HP, +5% fáradtság)', def: 1, hpBonus: 5, fatigueRate: 1.05, weight: 1.2, stackable: false, loot: { farm: 4, household: 1.5, fire: 1 } },
    'approach_shoes': { name: 'Túracipő', type: 'shoes', tier: 2, icon: '👟', img: 'SURV-1133_climbing_approach_shoes', desc: 'Tier 2 (+1 Véd., +5 Max HP, -15% fáradtság)', def: 1, hpBonus: 5, fatigueRate: 0.85, weight: 0.7, stackable: false, loot: { sport: 2 } },
    'steel_toe_boots': { name: 'Acélbetétes Munkavédelmi Bakancs', type: 'shoes', tier: 3, icon: '🥾', img: 'SURV-1129_steel_toe_work_boots', desc: 'Tier 3 (+4 Véd., +10 Max HP, -5% fáradtság)', def: 4, hpBonus: 10, fatigueRate: 0.95, weight: 1.6, stackable: false, loot: { industrial: 2, warehouse: 1.5, hardware: 1 } },
    'desert_boots': { name: 'Sivatagi Bakancs', type: 'shoes', tier: 3, icon: '🥾', img: 'SURV-1135_desert_walking_boots', desc: 'Tier 3 (+2 Véd., +8 Max HP, -20% fáradtság)', def: 2, hpBonus: 8, fatigueRate: 0.8, weight: 1, stackable: false, loot: { military: 1, sport: 0.8 } },

    // --- MELLÉNYEK ÉS PÁNCÉLOK ---
    'paca_vest': { name: 'PACA Puha Páncél', type: 'armor', tier: 3, icon: '🦺', img: 'SURV-1244_padded_logging_vest', desc: 'Tier 3 - Könnyű mellény (+15 Véd.)', def: 15, hpBonus: 40, weight: 4.5, stackable: false, loot: { police: 2, military: 1 } },
    'kevlar_vest': { name: 'Kevlár Mellény', type: 'armor', tier: 4, icon: '🦺', img: 'SURV-1262_chest_protector', desc: 'Tier 4 - Nehéz golyóálló (+25 Véd.)', def: 25, hpBonus: 70, weight: 6.5, stackable: false, loot: { police: 1, military: 1 } },
    '6b43_armor': { name: '6B43 Nehéz Harci Páncél', type: 'armor', tier: 4, icon: '🛡️', desc: 'Tier 4 - Csúcsminőségű páncél (+45 Véd.)', def: 45, hpBonus: 120, weight: 12, stackable: false, loot: { military: 0.3 } },
    'exo_skeleton': { name: 'Exoskeleton Harci Páncél', type: 'armor', tier: 5, icon: '🦾', desc: 'Tier 5 - Nehéz gépiesített páncél (+60 Véd., +150 Max HP, +40 kg Súly)', def: 60, hpBonus: 150, maxWeightBonus: 40, weight: 25, stackable: false, loot: { military: 0.05 } },
    'hivis_vest': { name: 'Láthatósági Mellény', type: 'armor', tier: 1, icon: '🦺', img: 'SURV-1241_high_visibility_safety_vest', desc: 'Tier 1 (+2 Véd., +5 Max HP)', def: 2, hpBonus: 5, weight: 0.2, stackable: false, loot: { auto: 4, industrial: 3, fire: 2 } },
    'hunting_vest': { name: 'Megerősített Vadászmellény', type: 'armor', tier: 2, icon: '🦺', img: 'SURV-1251_reinforced_hunting_vest', desc: 'Tier 2 (+8 Véd., +25 Max HP)', def: 8, hpBonus: 25, weight: 1.5, stackable: false, loot: { farm: 1.5, sport: 0.5 } },

    // --- TÁSKÁK ---
    'fanny_pack': { name: 'Övtáska', type: 'backpack', tier: 1, icon: '👜', img: 'SURV-1321_belt_utility_pouch', desc: 'Tier 1 - Kicsi táska (+10 hely)', bonusSlots: 10, maxWeightBonus: 5, weight: 0.3, stackable: false, loot: { household: 2, smallgoods: 2, sport: 2 } },
    'school_backpack': { name: 'Iskolai Hátizsák', type: 'backpack', tier: 2, icon: '🎒', img: 'SURV-1304_canvas_rucksack', desc: 'Tier 2 - Közepes táska (+20 hely)', bonusSlots: 20, maxWeightBonus: 15, weight: 0.8, stackable: false, loot: { office: 3, household: 1 } },
    'daypack': { name: 'Túrahátizsák', type: 'backpack', tier: 3, icon: '🎒', img: 'SURV-1301_day_hiking_backpack', desc: 'Tier 3 - Nagy táska (+30 hely)', bonusSlots: 30, maxWeightBonus: 25, weight: 1.5, stackable: false, loot: { sport: 1, household: 0.5, office: 0.5 } },
    'tactical_backpack': { name: 'Katonai Assault Zsák', type: 'backpack', tier: 4, icon: '🎒', img: 'SURV-1320_modular_utility_backpack', desc: 'Tier 4 - Kommandós táska (+45 hely)', bonusSlots: 45, maxWeightBonus: 35, weight: 2, stackable: false, loot: { military: 1, police: 0.3 } },
    'attack_backpack': { name: 'Eberpack / Raid Zsák', type: 'backpack', tier: 4, icon: '🎒', img: 'SURV-1314_heavy_load_carrying_pack', desc: 'Tier 4 - Hatalmas zsák (+60 hely)', bonusSlots: 60, maxWeightBonus: 50, weight: 3, stackable: false, loot: { military: 0.5 } },
    'market_tote': { name: 'Vászon Bevásárlótáska', type: 'backpack', tier: 1, icon: '👜', img: 'SURV-1343_foldable_market_tote', desc: 'Tier 1 (+5 hely, +3 kg)', bonusSlots: 5, maxWeightBonus: 3, weight: 0.2, stackable: false, loot: { grocery: 3, household: 3, smallgoods: 2 } },
    'field_satchel': { name: 'Vászon Válltáska', type: 'backpack', tier: 2, icon: '👜', img: 'SURV-1336_canvas_field_satchel', desc: 'Tier 2 (+12 hely, +8 kg)', bonusSlots: 12, maxWeightBonus: 8, weight: 0.6, stackable: false, loot: { household: 1.5, office: 1.5 } },
    'medical_bag': { name: 'Orvosi Válltáska', type: 'backpack', tier: 2, icon: '👜', img: 'SURV-1338_medical_shoulder_bag', desc: 'Tier 2 (+15 hely, +10 kg)', bonusSlots: 15, maxWeightBonus: 10, weight: 0.8, stackable: false, loot: { hospital: 2, medical: 0.5 } },
    'leather_backpack': { name: 'Bőr Túrahátizsák', type: 'backpack', tier: 3, icon: '🎒', img: 'SURV-1305_leather_trail_backpack', desc: 'Tier 3 (+25 hely, +20 kg)', bonusSlots: 25, maxWeightBonus: 20, weight: 1.4, stackable: false, loot: { household: 0.5, sport: 0.8 } },
    'expedition_backpack': { name: 'Expedíciós Keretes Hátizsák', type: 'backpack', tier: 4, icon: '🎒', img: 'SURV-1302_expedition_frame_backpack', desc: 'Tier 4 (+50 hely, +45 kg)', bonusSlots: 50, maxWeightBonus: 45, weight: 2.8, stackable: false, loot: { sport: 0.3, military: 0.3 } },

    // --- RELIKVIÁK (eladásra, kereskedővel) ---
    'artifact_medusa': { name: 'Medúza Relikvia', type: 'artifact', icon: '🟢', img: 'SURV-2284_crystal_geode', desc: 'Kinézetre furcsa kő. Egy kereskedő jó pénzt adhat érte.', weight: 0.5, stackable: false, loot: { hazmat: 0.5, cemetery: 0.5, culture: 0.3 } },
    'artifact_flash': { name: 'Villám Relikvia', type: 'artifact', icon: '⚡', img: 'SURV-2289_meteorite_fragment', desc: 'Statikus energiát sugárzó kő. Egy kereskedő jó pénzt adhat érte.', weight: 0.4, stackable: false, loot: { hazmat: 0.4, utility: 0.3 } },
    'artifact_mama_beads': { name: 'Mama Gyöngye Relikvia', type: 'artifact', icon: '🔴', img: 'SURV-2280_amber_chunk', desc: 'Anomália mag. Egy kereskedő jó pénzt adhat érte.', weight: 0.8, stackable: false, loot: { hazmat: 0.3, cemetery: 0.3 } },
    'artifact_gravi': { name: 'Gravi Relikvia', type: 'artifact', icon: '🌀', img: 'SURV-2287_fossil_ammonite', desc: 'Meghajlítja a teret. Egy kereskedő jó pénzt adhat érte.', weight: 1.2, stackable: false, loot: { hazmat: 0.2, industrial: 0.1 } },

    // --- ÉRTÉKTÁRGYAK ---
    'gold_ring': { name: 'Aranygyűrű', type: 'valuable', icon: '💍', img: 'SURV-2282_gold_ring', desc: 'Csillogó nemesfém ékszer', weight: 0.05, stackable: true, loot: { valuables: 3, household: 0.5, cemetery: 1 } },
    'silver_necklace': { name: 'Ezüst Nyaklánc', type: 'valuable', icon: '📿', img: 'SURV-2283_silver_brooch', desc: 'Finom megmunkálású ezüst', weight: 0.1, stackable: true, loot: { valuables: 4, household: 0.8 } },
    'rolex_watch': { name: 'Luxus Karóra', type: 'valuable', icon: '⌚', img: 'SURV-2285_ornate_pocket_watch', desc: 'Megállt az idő, de sokat ér', weight: 0.2, stackable: false, loot: { valuables: 1.5, household: 0.2, office: 0.3 } },
    'diamond_gem': { name: 'Csiszolatlan Gyémánt', type: 'valuable', icon: '💎', img: 'SURV-2278_uncut_gemstone', desc: 'Extrém ritka drágakő a romok alól', weight: 0.02, stackable: true, loot: { valuables: 0.5 } },
    'gold_tooth': { name: 'Aranyfog', type: 'valuable', icon: '🦷', desc: 'Kihúzott emlék egy banditától', weight: 0.01, stackable: true, loot: { cemetery: 3, valuables: 0.5 } },
    'copper_coins': { name: 'Rézérmék', type: 'valuable', icon: '🪙', img: 'SURV-2266_copper_coin_stack', desc: 'Régi érmék, jó cserealap', weight: 0.1, stackable: true, lootCount: [2, 6], loot: { valuables: 4, household: 2, culture: 1 } },
    'silver_coin': { name: 'Ezüst Érme', type: 'valuable', icon: '🪙', img: 'SURV-2267_silver_trade_coin', desc: 'Csillogó ezüst pénz', weight: 0.02, stackable: true, lootCount: [1, 3], loot: { valuables: 3, cemetery: 1, culture: 1 } },
    'pearl_strand': { name: 'Gyöngysor', type: 'valuable', icon: '📿', img: 'SURV-2279_pearl_strand', desc: 'Igazgyöngy nyaklánc', weight: 0.1, stackable: false, loot: { valuables: 1.5 } },
    'jade_pendant': { name: 'Jáde Medál', type: 'valuable', icon: '💚', img: 'SURV-2281_carved_jade_pendant', desc: 'Faragott zöld kő', weight: 0.05, stackable: false, loot: { valuables: 1, culture: 1 } },

    // --- GYŰJTHETŐ TÁRGYAK ---
    'prewar_photo': { name: 'Háború előtti Családi Fotó', type: 'collectible', icon: '🖼️', desc: 'Megfacsarja a túlélő szívét', weight: 0.05, stackable: true, loot: { household: 2, cemetery: 1, culture: 1 } },
    'soviet_badge': { name: 'Lenin Úttörő Jelvény', type: 'collectible', icon: '⭐', desc: 'Régi nosztalgikus kitüntetés', weight: 0.05, stackable: true, loot: { culture: 1, military: 0.5, office: 0.5 } },
    'vinyl_record': { name: 'Hanglemez (Zonális Blues)', type: 'collectible', icon: '💿', desc: 'Még szólna, ha lenne lejátszó', weight: 0.3, stackable: true, loot: { household: 1, culture: 1.5 } },
    'antique_compass': { name: 'Régi Sárgaréz Tájoló', type: 'collectible', icon: '🧭', img: 'SURV-2101_brass_lensatic_compass', desc: 'Ereklye a múltból', weight: 0.4, stackable: false, loot: { culture: 0.5, household: 0.3 } },
    'old_passport': { name: 'Szovjet Útlevél', type: 'collectible', icon: '📘', desc: 'Okmány egy nem létező országból', weight: 0.1, stackable: true, loot: { office: 1.5, police: 0.5, household: 0.5 } },
    'rubber_ducky': { name: 'Radioaktív Gumikacsa', type: 'collectible', icon: '🐤', desc: 'Zölden világít a sötétben', weight: 0.2, stackable: true, loot: { household: 0.5, hazmat: 0.3 } },
    'music_box': { name: 'Zenélődoboz', type: 'collectible', icon: '🎶', img: 'SURV-2294_mechanical_music_box', desc: 'Még mindig játssza a dallamát', weight: 0.6, stackable: false, loot: { household: 0.5, culture: 1 } },
    'brass_orrery': { name: 'Sárgaréz Planetárium', type: 'collectible', icon: '🪐', img: 'SURV-2290_handcrafted_brass_orrery', desc: 'Ritka gyűjtői darab', weight: 2, stackable: false, loot: { culture: 0.5, office: 0.3 } },

    // --- ALAPANYAGOK ---
    'empty_can': { name: 'Üres Konzervdoboz', type: 'material', icon: '🥫', img: 'SURV-0876_empty_tin_can', desc: 'Olvasztható fémforrás', weight: 0.1, stackable: true, loot: { household: 6, kitchen: 6, scrap: 4, warehouse: 3 } },
    'old_battery': { name: 'Lemerült Akksi', type: 'material', icon: '🪫', img: 'SURV-0998_lead_acid_battery', desc: 'Ólom és fém nyerhető belőle', weight: 0.4, stackable: true, loot: { auto: 5, scrap: 5, household: 1 } },
    'broken_toaster': { name: 'Törött Kenyérpirító', type: 'material', icon: '🔌', desc: 'Sok fémhulladék és drót', weight: 1.8, stackable: false, loot: { household: 3, scrap: 2 } },
    'scrap_wire_bundle': { name: 'Gabalyodott Rézkábel', type: 'material', icon: '〰️', img: 'SURV-0853_insulated_electrical_wire_spool', desc: 'Olvasztásra váró vastag réz', weight: 0.9, stackable: true, loot: { industrial: 4, utility: 5, scrap: 3 } },
    'radiator_chunk': { name: 'Ócska Alumínium Radiátor', type: 'material', icon: '🪟', desc: 'Hatalmas fém / alu bázis', weight: 4.5, stackable: false, loot: { scrap: 3, industrial: 2, household: 1 } },
    'lead_pipes_scrap': { name: 'Ólomcső Darabok', type: 'material', icon: '🧪', img: 'SURV-0744_lead_rod', desc: 'Nehéz, olvasztható ólom', weight: 3, stackable: true, loot: { industrial: 3, utility: 3, scrap: 2 } },
    'raw_iron_ore': { name: 'Nyers Vasérc', type: 'material', icon: '🪨', img: 'SURV-0701_iron_ore', desc: 'Olvasztható vasérc darab', weight: 2, stackable: true, loot: { industrial: 2, warehouse: 1 } },
    'raw_copper_ore': { name: 'Nyers Rézérc', type: 'material', icon: '🧱', img: 'SURV-0702_copper_ore', desc: 'Vöröses rézérc rög', weight: 1.8, stackable: true, loot: { industrial: 1.5, utility: 0.5 } },
    'pure_metal_bar': { name: 'Tiszta Fémtömb', type: 'material', icon: '🧈', img: 'SURV-0725_steel_ingot', desc: 'Olvasztott, prémium fémrúd', weight: 3.5, stackable: true, loot: { industrial: 1, warehouse: 0.5 } },
    'heavy_nails': { name: 'Edzett Acélszögek', type: 'material', icon: '📌', img: 'SURV-0761_common_nail_bundle', desc: 'Erős rögzítéshez', weight: 0.5, stackable: true, lootCount: [2, 5], loot: { hardware: 5, warehouse: 2 } },
    'hinge_latch': { name: 'Ajtózsanér és Zár', type: 'material', icon: '🚪', img: 'SURV-0794_heavy_duty_hinge', desc: 'Bázisok lezárásához', weight: 0.7, stackable: true, loot: { hardware: 4, household: 1 } },
    'concrete_mix': { name: 'Száraz Cementes Zsák', type: 'material', icon: '🧱', desc: 'Betonozáshoz, erősítéshez', weight: 5, stackable: false, loot: { hardware: 2, warehouse: 2, industrial: 1 } },
    'steel_plate': { name: 'Vastag Acéllemez', type: 'material', icon: '🛡️', img: 'SURV-0752_steel_plate', desc: 'Páncélozási alapanyag', weight: 6, stackable: false, loot: { industrial: 2, warehouse: 1, scrap: 1 } },
    'ceramic_plates': { name: 'Kerámia Páncélzat Darab', type: 'material', icon: '🛡️', desc: 'Mellény fejlesztéshez', weight: 1.5, stackable: true, loot: { police: 1, military: 1.5 } },
    'rag': { name: 'Szövet / Rongy', type: 'material', icon: '📜', img: 'SURV-0590_cotton_cloth_bundle', desc: 'Alapanyag ruhából', weight: 0.1, stackable: true, loot: { household: 8, kitchen: 3, auto: 3, scrap: 2, smallgoods: 1 } },
    'duct_tape': { name: 'Ezüst Ragasztószalag', type: 'material', icon: '🧻', desc: 'Szereléshez és craftoláshoz', weight: 0.2, stackable: true, loot: { hardware: 6, household: 3, auto: 2, office: 2 } },
    'alcohol': { name: 'Tiszta Alkohol', type: 'material', icon: '🧪', img: 'SURV-0944_denatured_alcohol_flask', desc: 'Fertőtlenítő alapanyag', weight: 0.4, stackable: true, loot: { medical: 3, hospital: 3, drinks: 1 } },
    'metal_scrap': { name: 'Fémhulladék', type: 'material', icon: '🔩', img: 'SURV-0893_riveted_metal_strap', desc: 'Fém alkatrész', weight: 0.5, stackable: true, loot: { scrap: 8, industrial: 5, warehouse: 3, auto: 3 } },
    'pipe': { name: 'Acél Fémcső', type: 'material', icon: '🔧', img: 'SURV-0841_pipe_elbow', desc: 'Csőfegyver alap', weight: 1.2, stackable: true, loot: { utility: 4, hardware: 3, industrial: 2, scrap: 2 } },
    'leather': { name: 'Kikezeletlen Bőr', type: 'material', icon: '🐂', img: 'SURV-0572_leather_scrap_bundle', desc: 'Megerősített anyag', weight: 0.8, stackable: true, loot: { farm: 3, household: 1, auto: 1 } },
    'stone': { name: 'Kődarab', type: 'material', icon: '🪨', desc: 'Közelharchoz / eszközhöz', weight: 1.5, stackable: true, loot: { household: 2, farm: 2, cemetery: 3 } },
    'stick': { name: 'Faág / Bot', type: 'material', icon: '🪵', desc: 'Fa alapanyag', weight: 0.6, stackable: true, loot: { household: 2, farm: 3, sport: 1 } },
    'gunpowder': { name: 'Lőpor', type: 'material', icon: '⬛', desc: 'Lőszer töltet', weight: 0.3, stackable: true, loot: { police: 1, military: 2, farm: 0.5 } },
    'nails': { name: 'Acél Szögek', type: 'material', icon: '📌', img: 'SURV-0763_finishing_nail_bundle', desc: 'Barkácsoláshoz', weight: 0.4, stackable: true, lootCount: [2, 6], loot: { hardware: 8, household: 2, warehouse: 2 } },
    'wire': { name: 'Dróttekercs', type: 'material', icon: '〰️', img: 'SURV-0777_steel_wire_coil', desc: 'Mechanikai alkatrész', weight: 0.2, stackable: true, loot: { hardware: 6, industrial: 2, utility: 3, auto: 2 } },
    'battery': { name: '9V Elem', type: 'material', icon: '🔋', img: 'SURV-0995_nine_volt_battery', desc: 'Elektronika', weight: 0.2, stackable: true, loot: { smallgoods: 5, household: 3, office: 3, hardware: 2 } },
    'radio_parts': { name: 'Régi Rádióalkatrész', type: 'material', icon: '📻', img: 'SURV-0858_resistor_pack', desc: 'Elektronikai alkatrész', weight: 0.3, stackable: true, loot: { household: 2, office: 2, police: 1, utility: 1 } },
    'rusty_bolts': { name: 'Rozsdás Csavarok', type: 'material', icon: '🔩', img: 'SURV-0769_hex_bolt_bundle', desc: 'Rögzítőelem barkácshoz', weight: 0.2, stackable: true, lootCount: [2, 5], loot: { scrap: 6, auto: 4, industrial: 4, household: 1 } },
    'broken_bulb': { name: 'Égett Villanykörte', type: 'material', icon: '💡', desc: 'Törékeny üvegforrás', weight: 0.1, stackable: true, loot: { household: 4, office: 2, culture: 1 } },
    'old_newspaper': { name: 'Régi Újság / Papír', type: 'material', icon: '📰', desc: 'Tűzgyújtáshoz való papír', weight: 0.1, stackable: true, loot: { household: 4, office: 4, smallgoods: 3, culture: 2 } },
    'glass_shards': { name: 'Üvegszilánk', type: 'material', icon: '🪞', desc: 'Éles darab csapdákhoz', weight: 0.2, stackable: true, loot: { household: 3, scrap: 2, culture: 1 } },
    'dirty_rag': { name: 'Lyukas Zokni / Rongy', type: 'material', icon: '🧦', img: 'SURV-0591_burlap_sackcloth', desc: 'Mosható szövetdarab', weight: 0.1, stackable: true, loot: { household: 5, scrap: 2 } },
    'hemp_rope': { name: 'Kenderkötél', type: 'material', icon: '🪢', img: 'SURV-0546_hemp_rope_coil', desc: 'Erős kötél mindenféle barkácshoz', weight: 0.8, stackable: true, loot: { hardware: 4, farm: 4, fire: 3, warehouse: 2, sport: 1 } },
    'cotton_cord': { name: 'Pamutzsinór', type: 'material', icon: '🧵', img: 'SURV-0558_cotton_cord', desc: 'Vékony zsinór kötözéshez', weight: 0.1, stackable: true, lootCount: [1, 2], loot: { household: 4, smallgoods: 2, hardware: 2 } },
    'canvas_roll': { name: 'Vászontekercs', type: 'material', icon: '🧶', img: 'SURV-0586_canvas_roll', desc: 'Strapabíró anyag táskákhoz, ruhákhoz', weight: 1, stackable: true, loot: { warehouse: 3, farm: 2, military: 1 } },
    'tanned_leather': { name: 'Cserzett Bőrtekercs', type: 'material', icon: '🟫', img: 'SURV-0571_tanned_leather_roll', desc: 'Kikészített bőr erős felszereléshez', weight: 1.2, stackable: true, loot: { farm: 2, warehouse: 1 } },
    'rebar': { name: 'Betonacél', type: 'material', icon: '🦯', img: 'SURV-0737_steel_rebar', desc: 'Hosszú acélrúd, építéshez és fegyverhez', weight: 2, stackable: true, loot: { industrial: 3, warehouse: 3, scrap: 2, hardware: 1 } },
    'iron_sheet': { name: 'Vaslemez', type: 'material', icon: '⬜', img: 'SURV-0751_iron_sheet', desc: 'Lemez páncélozáshoz és javításhoz', weight: 3, stackable: true, loot: { industrial: 2, scrap: 2, warehouse: 1, auto: 1 } },
    'steel_cable': { name: 'Sodronykötél', type: 'material', icon: '➰', img: 'SURV-0782_braided_steel_cable', desc: 'Fonott acélkábel', weight: 1.5, stackable: true, loot: { industrial: 2, utility: 2, auto: 1, fire: 1 } },
    'iron_chain': { name: 'Vaslánc', type: 'material', icon: '⛓️', img: 'SURV-0788_iron_chain', desc: 'Nehéz lánc rögzítéshez', weight: 2, stackable: true, loot: { hardware: 2, farm: 2, warehouse: 1, industrial: 1 } },
    'barbed_wire': { name: 'Szögesdrót', type: 'material', icon: '〰️', img: 'SURV-0780_barbed_wire_coil', desc: 'Akadályok és csapdák alapanyaga', weight: 2, stackable: true, loot: { military: 3, farm: 2, warehouse: 1 } },
    'ball_bearing': { name: 'Golyóscsapágy', type: 'material', icon: '⚙️', img: 'SURV-0827_ball_bearing', desc: 'Mechanikus alkatrész', weight: 0.2, stackable: true, loot: { industrial: 3, auto: 3, scrap: 2 } },
    'coil_spring': { name: 'Tekercsrugó', type: 'material', icon: '🌀', img: 'SURV-0825_coil_spring', desc: 'Rugó szerkezetekhez és csapdákhoz', weight: 0.2, stackable: true, loot: { auto: 3, industrial: 2, scrap: 2, household: 1 } },
    'electrical_switch': { name: 'Villanykapcsoló', type: 'material', icon: '🔘', img: 'SURV-0854_electrical_switch', desc: 'Elektronikai alkatrész', weight: 0.1, stackable: true, loot: { utility: 3, household: 2, hardware: 2 } },
    'empty_jar': { name: 'Üres Befőttesüveg', type: 'material', icon: '🫙', img: 'SURV-0877_empty_glass_jar', desc: 'Tároláshoz, tartósításhoz', weight: 0.3, stackable: true, loot: { household: 5, kitchen: 3, farm: 2 } },
    'plastic_bottle': { name: 'Üres PET-palack', type: 'material', icon: '🧴', img: 'SURV-0879_empty_plastic_bottle', desc: 'Vízgyűjtéshez, szűréshez', weight: 0.05, stackable: true, loot: { household: 5, smallgoods: 4, scrap: 3, sport: 2 } },
    'gasoline_can': { name: 'Benzineskanna', type: 'material', icon: '⛽', img: 'SURV-0948_gasoline_jerrycan', desc: 'Üzemanyag generátorhoz, járműhöz', weight: 4, stackable: false, loot: { auto: 5, farm: 3 } },
    'machine_oil': { name: 'Gépolaj', type: 'material', icon: '🛢️', img: 'SURV-0961_machine_oil_bottle', desc: 'Kenőanyag gépekhez és fegyverekhez', weight: 0.5, stackable: true, loot: { auto: 5, industrial: 3, hardware: 2, farm: 2 } },
    'lamp_oil': { name: 'Lámpaolaj', type: 'material', icon: '🫗', img: 'SURV-0937_lamp_oil_bottle', desc: 'Petróleumlámpa üzemanyaga (3 óra)', weight: 0.5, stackable: true, loot: { household: 1, farm: 2, auto: 1, culture: 0.5 } },
    'matchbox': { name: 'Gyufásdoboz', type: 'material', icon: '🔥', img: 'SURV-0918_strike_anywhere_matchbox', desc: 'Tűzgyújtáshoz', weight: 0.05, stackable: true, lootCount: [1, 2], loot: { smallgoods: 6, household: 5, kitchen: 3 } },
    'aa_batteries': { name: 'AA Elempár', type: 'material', icon: '🔋', img: 'SURV-0991_aa_battery_pair', desc: 'Lámpákhoz, rádióhoz', weight: 0.05, stackable: true, lootCount: [1, 2], loot: { smallgoods: 6, household: 4, office: 3, hardware: 3 } },
    'candle': { name: 'Gyertya', type: 'material', icon: '🕯️', img: 'SURV-1546_beeswax_taper_candle', desc: 'Halvány fény, tűzgyújtáshoz is jó', weight: 0.1, stackable: true, lootCount: [1, 3], loot: { culture: 6, household: 4, cemetery: 5 } },

    // --- SZERSZÁMOK ÉS FELSZERELÉS ---
    'screwdriver': { name: 'Csavarhúzó', type: 'tool', durability: 50, icon: '🪛', img: 'SURV-1060_screwdriver_set', desc: 'Finomszerelési eszköz', weight: 0.4, stackable: false, loot: { hardware: 5, tools: 4, household: 2, auto: 2 } },
    'toolbox': { name: 'Szerszámosláda', type: 'tool', durability: 80, icon: '🧰', desc: 'Komolyabb szereléshez', weight: 4, stackable: false, loot: { tools: 1.5, auto: 1, industrial: 1 } },
    'sewing_kit': { name: 'Varrókészlet', type: 'tool', durability: 20, icon: '🧵', img: 'SURV-1200_clothing_repair_patch_set', desc: 'Ruhák és táskák foltozásához', weight: 0.5, stackable: false, loot: { household: 3, smallgoods: 1 } },
    'gun_cleaning_kit': { name: 'Fegyverpucoló Készlet', type: 'tool', durability: 30, icon: '🧽', desc: 'Megakadályozza a fegyver besülését', weight: 0.8, stackable: false, loot: { police: 2, military: 2 } },
    'geiger_counter': { name: 'Geiger-Müller Számláló', type: 'tool', icon: '☢️', desc: 'Méri a sugárzást a zónában', weight: 0.7, stackable: false, loot: { hazmat: 2, utility: 0.5 } },
    'flare': { name: 'Jelzőfény / Fáklya', type: 'tool', icon: '🚨', img: 'SURV-2156_distress_flare', desc: 'Mutánsok elijesztésére', weight: 0.4, stackable: true, loot: { auto: 2, fire: 3, military: 2, smallgoods: 1 } },
    'claw_hammer': { name: 'Kalapács', type: 'tool', durability: 40, icon: '🔨', img: 'SURV-1016_claw_hammer', desc: 'Alap szerszám barkácsoláshoz', weight: 0.7, stackable: false, loot: { hardware: 5, tools: 4, household: 2 } },
    'pliers': { name: 'Kombinált Fogó', type: 'tool', durability: 40, icon: '🗜️', img: 'SURV-1057_combination_pliers', desc: 'Drótvágás, hajlítás', weight: 0.3, stackable: false, loot: { hardware: 4, tools: 4, auto: 3, utility: 2 } },
    'socket_wrench': { name: 'Dugókulcs-készlet', type: 'tool', durability: 60, icon: '🔧', img: 'SURV-1061_socket_wrench', desc: 'Csavarok és anyák szereléséhez', weight: 1.2, stackable: false, loot: { auto: 3, tools: 2 } },
    'pipe_wrench': { name: 'Csőfogó', type: 'tool', durability: 60, icon: '🔧', img: 'SURV-1062_pipe_wrench', desc: 'Csövek és szelepek szereléséhez', weight: 1.5, stackable: false, loot: { utility: 3, hardware: 2 } },
    'bolt_cutters': { name: 'Csapszegvágó', type: 'tool', durability: 30, icon: '✂️', img: 'SURV-1012_bolt_cutters', desc: 'Láncok és lakatok átvágásához', weight: 2.5, stackable: false, loot: { hardware: 1.5, tools: 1, fire: 1, warehouse: 1 } },
    'tin_snips': { name: 'Lemezvágó Olló', type: 'tool', durability: 40, icon: '✂️', img: 'SURV-1011_tin_snips', desc: 'Fémlemezek vágásához', weight: 0.5, stackable: false, loot: { hardware: 3, tools: 2 } },
    'bow_saw': { name: 'Keretes Fűrész', type: 'tool', durability: 30, icon: '🪚', img: 'SURV-1003_bow_saw', desc: 'Fa vágásához', weight: 1, stackable: false, loot: { hardware: 2, farm: 2 } },
    'folding_shovel': { name: 'Összecsukható Ásó', type: 'tool', durability: 50, icon: '🪏', img: 'SURV-1033_compact_folding_shovel', desc: 'Katonai gyalogsági ásó', weight: 1.5, stackable: false, loot: { military: 2, auto: 1, sport: 0.5 } },
    'shovel': { name: 'Ásó', type: 'tool', durability: 50, icon: '🪏', img: 'SURV-1031_round_point_shovel', desc: 'Ásáshoz, földmunkához', weight: 2, stackable: false, loot: { farm: 4, hardware: 2, cemetery: 3 } },
    'pickaxe': { name: 'Csákány', type: 'tool', durability: 50, icon: '⛏️', img: 'SURV-1037_pickaxe', desc: 'Kőzetek és ércek bontásához', weight: 3, stackable: false, loot: { industrial: 1.5, farm: 1, hardware: 1 } },
    'multitool': { name: 'Zsebszerszám (Multitool)', type: 'tool', durability: 25, icon: '🛠️', img: 'SURV-1096_pocket_multi_tool', desc: 'Sok kis szerszám egyben', weight: 0.3, stackable: false, loot: { smallgoods: 1.5, sport: 1, auto: 1, military: 1 } },
    'grappling_hook': { name: 'Mászóhorog', type: 'tool', icon: '🪝', img: 'SURV-1089_grappling_hook', desc: 'Mászáshoz és kötélhez', weight: 1.5, stackable: false, loot: { fire: 1, sport: 0.5 } },
    'hand_riveter': { name: 'Popszegecselő', type: 'tool', durability: 40, icon: '🔩', img: 'SURV-1063_hand_riveter', desc: 'Lemezek összeszegecseléséhez', weight: 0.6, stackable: false, loot: { hardware: 2, auto: 1 } },
    'lockpick': { name: 'Álkulcs Készlet', type: 'tool', durability: 10, icon: '🔑', img: 'SURV-2264_lock_pick_set', desc: 'Zárak feltöréséhez', weight: 0.1, stackable: false, loot: { police: 1, household: 0.3 } },
    'flashlight': { name: 'Elemlámpa', type: 'tool', durability: 120, light: { fuel: 'aa_batteries' }, icon: '🔦', img: 'SURV-1526_aluminum_hand_flashlight', desc: 'Elemes fényforrás: 2 óra / elempár', weight: 0.3, stackable: false, loot: { household: 3, auto: 2, police: 2, fire: 2, smallgoods: 2 } },
    'torch': { name: 'Fáklya', type: 'tool', durability: 30, light: { fuel: null }, icon: '🔥', img: 'SURV-1542_oil_soaked_rag_torch', desc: 'Fényforrás, 30 percig ég, utána elfogy', weight: 0.4, stackable: false, loot: { household: 0.5, culture: 0.5 } },
    'headlamp': { name: 'Fejlámpa', type: 'tool', durability: 180, light: { fuel: 'aa_batteries' }, icon: '🔦', img: 'SURV-1533_headlamp', desc: 'Elemes fényforrás: 3 óra / elempár', weight: 0.15, stackable: false, loot: { sport: 2, hardware: 2, industrial: 1 } },
    'led_lantern': { name: 'Akkus LED Lámpás', type: 'tool', durability: 240, light: { fuel: 'aa_batteries' }, icon: '🏮', img: 'SURV-1519_rechargeable_led_lantern', desc: 'Elemes fényforrás: 4 óra / elempár', weight: 0.8, stackable: false, loot: { sport: 1, household: 1 } },
    'kerosene_lantern': { name: 'Petróleumlámpa', type: 'tool', durability: 180, light: { fuel: 'lamp_oil' }, icon: '🏮', img: 'SURV-1511_kerosene_hurricane_lantern', desc: 'Olajjal ég: 3 óra / palack lámpaolaj', weight: 1, stackable: false, loot: { farm: 2, household: 1, culture: 1 } },
    'binoculars': { name: 'Távcső', type: 'tool', icon: '🔭', img: 'SURV-2116_field_binoculars', desc: 'Messzire látsz vele', weight: 0.7, stackable: false, loot: { military: 1.5, police: 1, sport: 0.5 } },
    'pocket_compass': { name: 'Zsebiránytű', type: 'tool', icon: '🧭', img: 'SURV-2102_pocket_compass', desc: 'Tájékozódáshoz', weight: 0.1, stackable: false, loot: { military: 1.5, sport: 1, smallgoods: 0.5 } },
    'topo_map': { name: 'Topográfiai Térkép', type: 'tool', icon: '🗺️', img: 'SURV-2126_topographic_map', desc: 'Régi katonai térkép a környékről', weight: 0.1, stackable: true, loot: { office: 2, military: 1.5, smallgoods: 1 } },
    'rescue_whistle': { name: 'Mentősíp', type: 'tool', icon: '📯', img: 'SURV-2152_rescue_whistle', desc: 'Messzire hallatszó jelzés', weight: 0.02, stackable: true, loot: { sport: 2, fire: 1 } },
    'rescue_strobe': { name: 'Mentő Villogó', type: 'tool', icon: '🚨', img: 'SURV-2158_rescue_strobe', desc: 'Villogó vészjelző', weight: 0.2, stackable: false, loot: { fire: 1, military: 0.5 } },
    'thermos': { name: 'Termosz', type: 'tool', icon: '🧉', img: 'SURV-0205_insulated_thermos_canteen', desc: 'Melegen tartja az italt', weight: 0.6, stackable: false, loot: { kitchen: 1.5, household: 1, office: 1 } },
    'straw_filter': { name: 'Szívószálas Vízszűrő', type: 'tool', durability: 15, icon: '🥤', img: 'SURV-0255_straw_water_filter', desc: 'Koszos víz szűréséhez (a betegség egy későbbi frissítésben jön)', weight: 0.1, stackable: false, loot: { sport: 1, hazmat: 1, military: 0.5 } },
    'power_bank': { name: 'Napelemes Powerbank', type: 'tool', icon: '🔋', img: 'SURV-0999_solar_charged_power_bank', desc: 'Áram a Zónában', weight: 0.3, stackable: false, loot: { office: 2, smallgoods: 1.5, household: 1 } },
    'ferro_rod': { name: 'Tűzgyújtó Rúd', type: 'tool', icon: '✨', img: 'SURV-0920_ferrocerium_rod', desc: 'Szikrát ad, ha elfogyott a gyufa', weight: 0.1, stackable: false, loot: { sport: 1, military: 1, smallgoods: 0.5 } },

    // --- FEGYVER-MODOK ---
    'scope_lens': { name: 'Kopott Távcső Lencse', type: 'mod', icon: '🔭', img: 'SURV-2123_magnifying_lens', desc: 'Optika alap fegyverekre', weight: 0.3, stackable: true, loot: { police: 0.5, military: 1, culture: 0.3 } },
    'copper_wire': { name: 'Rézdrót Tekercs', type: 'mod', icon: '⚡', img: 'SURV-0776_copper_wire_coil', desc: 'Elektromos modokhoz', weight: 0.3, stackable: true, loot: { utility: 5, industrial: 3, hardware: 3 } },
    'chemical_solvent': { name: 'Vegyi Oldószer', type: 'mod', icon: '🧪', img: 'SURV-0987_isopropyl_alcohol_flask', desc: 'Tisztításhoz és robbanóanyaghoz', weight: 0.5, stackable: true, loot: { hardware: 3, industrial: 3, hospital: 1, hazmat: 2 } },
    'gear_wheel': { name: 'Acél Fogaskerék', type: 'mod', icon: '⚙️', img: 'SURV-0821_spur_gear', desc: 'Mechanikus tuning alkatrész', weight: 0.6, stackable: true, loot: { industrial: 3, auto: 2, scrap: 2 } },

    // --- LŐSZER ---
    'ammo_9mm': { name: '9x19mm Parabellum', type: 'ammo', icon: '🎯', desc: 'Pisztoly lőszer', ammoType: 'ammo_9mm', weight: 0.02, stackable: true, lootCount: [5, 15], loot: { police: 5, military: 3 } },
    'ammo_762': { name: '7.62x39mm Katonai Lőszer', type: 'ammo', icon: '🎯', desc: 'AK lőszer', ammoType: 'ammo_762', weight: 0.03, stackable: true, lootCount: [5, 15], loot: { military: 4, police: 0.5 } },
    'ammo_556': { name: '5.56x45mm NATO', type: 'ammo', icon: '🎯', desc: 'M4 lőszer', ammoType: 'ammo_556', weight: 0.03, stackable: true, lootCount: [5, 15], loot: { military: 1.5 } },
    'ammo_buckshot': { name: '12 Gauge Sörét', type: 'ammo', icon: '🎯', desc: 'Sörétes töltény', ammoType: 'ammo_buckshot', weight: 0.05, stackable: true, lootCount: [4, 10], loot: { police: 2, farm: 2 } },
    'ammo_sniper': { name: '7.62x54mmR Mesterlövész', type: 'ammo', icon: '🎯', desc: 'SVD / Vadászpuska lőszer', ammoType: 'ammo_sniper', weight: 0.04, stackable: true, lootCount: [3, 8], loot: { military: 1, farm: 0.5 } },
    'empty_casing': { name: 'Üres Hüvely', type: 'material', icon: '🥉', desc: 'Lövés után összeszedett hüvely, újratöltéshez', weight: 0.01, stackable: true, lootCount: [3, 8], loot: { police: 2, military: 3 } }
};



// Böngésző támogatás (ha még nem létezett, rátesszük a window-ra)
if (typeof window !== 'undefined') {
    if (!window.itemDatabase) {
        window.itemDatabase = itemDatabase;
    }
}

// Szerver (Node.js) támogatás
if (typeof module !== 'undefined' && module.exports) {
    module.exports = itemDatabase;
}
