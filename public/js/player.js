// player.js
const itemDatabase = {
    'canned_food': { name: 'Babkonzerv', type: 'food', icon: '🥫', desc: '+40 Éhség', value: 40, weight: 0.4, stackable: true },
    'tuna_can': { name: 'Tonhalkonzerv', type: 'food', icon: '🐟', desc: '+45 Éhség', value: 45, weight: 0.4, stackable: true },
    'mre_ration': { name: 'Katonai MRE Adag', type: 'food', icon: '📦', desc: '+80 Éhség, -25 Fáradtság', value: 80, fatigueValue: 25, weight: 0.8, stackable: true },
    'energy_bar': { name: 'Energiazelet', type: 'food', icon: '🍫', desc: '+25 Éhség, -20 Fáradtság', value: 25, fatigueValue: 20, weight: 0.1, stackable: true },
    'canned_bacon': { name: 'Zónás Disznósajt Konzerv', type: 'food', icon: '🥩', desc: '+60 Éhség, zsíros katonai falat', value: 60, weight: 0.5, stackable: true },
    'mutant_steak': { name: 'Sült Mutáns Hús', type: 'food', icon: '🍖', desc: '+70 Éhség, kockázatos falat', value: 70, weight: 0.6, stackable: true },
    'dry_galette': { name: 'Katonai Keksz', type: 'food', icon: '🍘', desc: '+20 Éhség, száraz de tartós', value: 20, weight: 0.2, stackable: true },

    'water_bottle': { name: 'Vizespalack', type: 'drink', icon: '💧', desc: '+50 Szomjúság', value: 50, weight: 1.5, stackable: true },
    'kvass': { name: 'Hűtött Kvasz', type: 'drink', icon: '🍺', desc: '+40 Szomjúság', value: 40, weight: 0.5, stackable: true },
    'vodka': { name: 'Zóna Vodka', type: 'drink', icon: '🥃', desc: '+30 Szomjúság, sugárzás elleni', value: 30, weight: 0.5, stackable: true },
    'energy_drink': { name: 'Monster Energiaital', type: 'drink', icon: '⚡', desc: '+20 Szomjúság, -30 Fáradtság', value: 20, weight: 0.3, stackable: true },
    'coffee': { name: 'Fekete Kávé', type: 'drink', icon: '☕', desc: '-40 Fáradtság', value: 40, weight: 0.2, stackable: true },
    'moonshine': { name: 'Házi Főzésű Szesz (Pálinka)', type: 'drink', icon: '🧪', desc: '+35 Szomjúság, brutális hatás', value: 35, weight: 0.5, stackable: true },
    'dirty_water': { name: 'Szennyezett Csapvíz', type: 'drink', icon: '🚰', desc: '+25 Szomjúság, de fertőzhet', value: 25, weight: 1.0, stackable: true },

    'rag_bandage': { name: 'Rongy Kötés', type: 'medicine', icon: '📜', desc: '+25 Élet', value: 25, weight: 0.1, stackable: true },
    'bandage': { name: 'Steril Kötszer', type: 'medicine', icon: '🩹', desc: '+50 Élet', value: 50, weight: 0.2, stackable: true },
    'painkillers': { name: 'Ibuprofen', type: 'medicine', icon: '💊', desc: '+30 Élet', value: 30, weight: 0.1, stackable: true },
    'morphine': { name: 'Morfin Injekció', type: 'medicine', icon: '💉', desc: '+70 Élet', value: 70, weight: 0.2, stackable: true },
    'medkit': { name: 'Katonai Trauma Csomag', type: 'medicine', icon: '🧰', desc: '+100 Élet', value: 100, weight: 1.2, stackable: false },
    'antibiotics': { name: 'Antibiotikum', type: 'medicine', icon: '💊', desc: 'Gyógyít és fertőtlenít', value: 40, weight: 0.1, stackable: true },
    'antirad_pills': { name: 'Anti-Rad Sugárzás elleni Tabletta', type: 'medicine', icon: '☣️', desc: 'Kiűzi a szervezetből a sugárzást', value: 50, weight: 0.1, stackable: true },

    'knife': { name: 'Katonai Harci Kés', type: 'weapon', icon: '🗡️', desc: 'Tier 1 - Közelharci fegyver (+8 Sebzés)', dmg: 8, weight: 0.6, stackable: false, tier: 1 },
    'wrench': { name: 'Szerelőkulcs', type: 'weapon', icon: '🔧', desc: 'Tier 1 - Nehéz szerszám (+10 Sebzés)', dmg: 10, weight: 1.5, stackable: false, tier: 1 },
    'machete': { name: 'Dzsungel Macseta', type: 'weapon', icon: '🔪', desc: 'Tier 1 - Vágófegyver (+12 Sebzés)', dmg: 12, weight: 1.2, stackable: false, tier: 1 },
    'baseball_bat': { name: 'Szöges Baseball Ütő', type: 'weapon', icon: '🏏', desc: 'Tier 1 - Klasszikus zónás zúzó (+14 Sebzés)', dmg: 14, weight: 2.0, stackable: false, tier: 1 },

    'crowbar': { name: 'Feszítővas', type: 'weapon', icon: '⛏️', desc: 'Tier 2 - Kiváló feszítésre (+15 Sebzés)', dmg: 15, weight: 2.5, stackable: false, tier: 2 },
    'pipe_pistol': { name: 'Házi Készítésű Csőfegyver', type: 'weapon', icon: '🔫', desc: 'Tier 2 - Egyszerű lőfegyver (+30 Sebzés)', dmg: 30, reqAmmo: 'ammo_9mm', weight: 1.8, stackable: false, tier: 2 },
    'revolver_nagant': { name: 'Nagant M1895 Revolver', type: 'weapon', icon: '🔫', desc: 'Tier 2 - Régi katonai revolver (+35 Sebzés)', dmg: 35, reqAmmo: 'ammo_9mm', weight: 1.0, stackable: false, tier: 2 },
    'double_barrel': { name: 'Duplacsövű Vadászpuska', type: 'weapon', icon: '💥', desc: 'Tier 2 - Rövid csövű klasszikus (+65 Sebzés)', dmg: 65, reqAmmo: 'ammo_buckshot', weight: 3.0, stackable: false, tier: 2 },
    'spear': { name: 'Barkácsolott Lándzsa', type: 'weapon', icon: '🗡️', desc: 'Tier 2 - Távoltartó eszköz (+18 Sebzés)', dmg: 18, weight: 1.6, stackable: false, tier: 2 },

    'axe': { name: 'Tűzoltó Balta', type: 'weapon', icon: '🪓', desc: 'Tier 3 - Vágófegyver (+25 Sebzés)', dmg: 25, weight: 3.0, stackable: false, tier: 3 },
    'makarov': { name: 'Makarov PM Pisztoly', type: 'weapon', icon: '🔫', desc: 'Tier 3 - Megbízható pisztoly (+40 Sebzés)', dmg: 40, reqAmmo: 'ammo_9mm', weight: 1.2, stackable: false, tier: 3 },
    'shotgun': { name: 'TOZ Sörétes Puska', type: 'weapon', icon: '💥', desc: 'Tier 3 - Sörétes puska (+75 Sebzés)', dmg: 75, reqAmmo: 'ammo_buckshot', weight: 3.2, stackable: false, tier: 3 },
    'sks_rifle': { name: 'SKS Félautomata Karabély', type: 'weapon', icon: '🎯', desc: 'Tier 3 - Pontos katonai puska (+85 Sebzés)', dmg: 85, reqAmmo: 'ammo_762', weight: 3.6, stackable: false, tier: 3 },
    'submachine_ppsh': { name: 'PPSh-41 Géppisztoly', type: 'weapon', icon: '🔫', desc: 'Tier 3 - Dobtáras klasszikus (+70 Sebzés)', dmg: 70, reqAmmo: 'ammo_9mm', weight: 3.5, stackable: false, tier: 3 },

    'sledgehammer': { name: 'Bontókalapács', type: 'weapon', icon: '🔨', desc: 'Tier 4 - Nehéz szerszám (+35 Sebzés)', dmg: 35, weight: 5.0, stackable: false, tier: 4 },
    'bow': { name: 'Kompozit Vadász Íj', type: 'weapon', icon: '🏹', desc: 'Tier 4 - Csendes íj (+20 Sebzés)', dmg: 20, weight: 1.5, stackable: false, tier: 4 },
    'hunting_rifle': { name: 'Mosin-Nagant Vadászpuska', type: 'weapon', icon: '🎯', desc: 'Tier 4 - Nagy hatótáv (+95 Sebzés)', dmg: 95, reqAmmo: 'ammo_sniper', weight: 4.0, stackable: false, tier: 4 },
    'ak47': { name: 'AK-47 Gépkarabély', type: 'weapon', icon: '🔥', desc: 'Tier 4 - Sorozatlövő fegyver (+110 Sebzés)', dmg: 110, reqAmmo: 'ammo_762', weight: 3.8, stackable: false, tier: 4 },
    'm4a1_carbine': { name: 'M4A1 Taktikai Gépkarabély', type: 'weapon', icon: '🔫', desc: 'Tier 4 - Modern NATO puska (+115 Sebzés)', dmg: 115, reqAmmo: 'ammo_556', weight: 3.3, stackable: false, tier: 4 },
    'combat_shotgun': { name: 'Benelli M4 Harci Sörétes', type: 'weapon', icon: '💥', desc: 'Tier 4 - Félautomata sörétes (+90 Sebzés)', dmg: 90, reqAmmo: 'ammo_buckshot', weight: 3.6, stackable: false, tier: 4 },

    'val_rifle': { name: 'AS Val Speciális Rohampuska', type: 'weapon', icon: '🎯', desc: 'Tier 5 - Beépített hangtompítós elit (+130 Sebzés)', dmg: 130, reqAmmo: 'ammo_9mm', weight: 3.2, stackable: false, tier: 5 },
    'vintorez_sniper': { name: 'VSS Vintorez Mesterlövész', type: 'weapon', icon: '🎯', desc: 'Tier 5 - Halálos csendes elit puska (+145 Sebzés)', dmg: 145, reqAmmo: 'ammo_sniper', weight: 3.5, stackable: false, tier: 5 },
    'rpk_machinegun': { name: 'RPK Golyószóró', type: 'weapon', icon: '🔥', desc: 'Tier 5 - Pusztító tűzerő (+160 Sebzés)', dmg: 160, reqAmmo: 'ammo_762', weight: 5.5, stackable: false, tier: 5 },
    'gauss_gun': { name: 'Izmeriteli / Gauss Puska', type: 'weapon', icon: '⚡', desc: 'Tier 5 - Anomál technológiás prototípus (+220 Sebzés)', dmg: 220, reqAmmo: 'ammo_sniper', weight: 5.0, stackable: false, tier: 5 },

    'cap': { name: 'Baseball Sapka', type: 'helmet', icon: '🧢', desc: 'Tier 1 - Alap fejfedő (+1 Véd.)', def: 1, hpBonus: 5, weight: 0.2, stackable: false, tier: 1 },
    'tshirt': { name: 'Szakadt Póló', type: 'torso', icon: '👕', desc: 'Tier 1 - Rongyos felső (+1 Véd.)', def: 1, hpBonus: 5, weight: 0.3, stackable: false, tier: 1 },
    'shorts': { name: 'Rövidnadrág', type: 'legs', icon: '🩳', desc: 'Tier 1 - Alap nadrág (0 Véd.)', def: 0, hpBonus: 0, weight: 0.3, stackable: false, tier: 1 },
    'slippers': { name: 'Gumis Strandpapucs', type: 'shoes', icon: '🩴', desc: 'Tier 1 - Rossz lábbeli (0 Véd.)', def: 0, hpBonus: 0, weight: 0.3, stackable: false, tier: 1 },
    'fanny_pack': { name: 'Övtáska', type: 'backpack', icon: '👜', desc: 'Tier 1 - Kicsi táska (+10 hely)', bonusSlots: 10, maxWeightBonus: 5, weight: 0.3, stackable: false, tier: 1 },

    'beanie': { name: 'Kötött Sínmaszk / Sapka', type: 'helmet', icon: '🧶', desc: 'Tier 2 - Meleg fejfedő (+2 Véd.)', def: 2, hpBonus: 10, weight: 0.2, stackable: false, tier: 2 },
    'hoodie': { name: 'Kapucnis Pulóver', type: 'torso', icon: '🧥', desc: 'Tier 2 - Kényelmes felső (+4 Véd.)', def: 4, hpBonus: 15, weight: 0.8, stackable: false, tier: 2 },
    'jeans': { name: 'Kopott Farmernadrág', type: 'legs', icon: '👖', desc: 'Tier 2 - Erősebb nadrág (+4 Véd.)', def: 4, hpBonus: 15, weight: 0.8, stackable: false, tier: 2 },
    'sneakers': { name: 'Futócipő / Edzőcipő', type: 'shoes', icon: '👟', desc: 'Tier 2 - Könnyű cipő (+1 Véd.)', def: 1, hpBonus: 5, weight: 0.6, stackable: false, tier: 2 },
    'school_backpack': { name: 'Iskolai Hátizsák', type: 'backpack', icon: '🎒', desc: 'Tier 2 - Közepes táska (+20 hely)', bonusSlots: 20, maxWeightBonus: 15, weight: 0.8, stackable: false, tier: 2 },

    'ushanka': { name: 'Usanka Orosz Sapka', type: 'helmet', icon: '🎩', desc: 'Tier 3 - Vastag sapka (+3 Véd.)', def: 3, hpBonus: 15, weight: 0.4, stackable: false, tier: 3 },
    'motorcycle_helmet': { name: 'Bukósisak', type: 'helmet', icon: '🪖', desc: 'Tier 3 - Kemény sisak (+5 Véd.)', def: 5, hpBonus: 20, weight: 2.0, stackable: false, tier: 3 },
    'leather_jacket': { name: 'Klasszikus Bőrdzseki', type: 'torso', icon: '🧥', desc: 'Tier 3 - Vagány kabát (+8 Véd.)', def: 8, hpBonus: 25, weight: 2.5, stackable: false, tier: 3 },
    'tactical_pants': { name: 'Taktikai Zsebes Nadrág', type: 'legs', icon: '👖', desc: 'Tier 3 - Strapabíró nadrág (+8 Véd.)', def: 8, hpBonus: 30, weight: 1.2, stackable: false, tier: 3 },
    'hiking_boots': { name: 'Túrabakancs', type: 'shoes', icon: '🥾', desc: 'Tier 3 - Erős cipő (+3 Véd.)', def: 3, hpBonus: 10, weight: 1.4, stackable: false, tier: 3 },
    'daypack': { name: 'Túrahátizsák', type: 'backpack', icon: '🎒', desc: 'Tier 3 - Nagy táska (+30 hely)', bonusSlots: 30, maxWeightBonus: 25, weight: 1.5, stackable: false, tier: 3 },
    'paca_vest': { name: 'PACA Puha Páncél', type: 'armor', icon: '🦺', desc: 'Tier 3 - Könnyű mellény (+15 Véd.)', def: 15, hpBonus: 40, weight: 4.5, stackable: false, tier: 3 },

    'gp5_mask': { name: 'GP-5 Gázálarc', type: 'helmet', icon: '🪖', desc: 'Tier 4 - Vegyvédelmi álarc (+5 Véd.)', def: 5, hpBonus: 20, weight: 1.5, stackable: false, tier: 4 },
    'm50_gas_mask': { name: 'M50 Taktikai Gázálarc', type: 'helmet', icon: '🪖', desc: 'Tier 4 - Modern gázálarc (+8 Véd.)', def: 8, hpBonus: 25, weight: 1.8, stackable: false, tier: 4 },
    'tactical_helmet': { name: 'FAST Katonai Sisak', type: 'helmet', icon: '🪖', desc: 'Tier 4 - Golyóálló sisak (+18 Véd.)', def: 18, hpBonus: 50, weight: 2.0, stackable: false, tier: 4 },
    'military_jacket': { name: 'Flora Katonai Zubbony', type: 'torso', icon: '🧥', desc: 'Tier 4 - Katonai felső (+16 Véd.)', def: 16, hpBonus: 55, weight: 3.0, stackable: false, tier: 4 },
    'gorka_jacket': { name: 'Gorka Taktikai Ruházat', type: 'torso', icon: '🧥', desc: 'Tier 4 - Elit zubbony (+22 Véd.)', def: 22, hpBonus: 75, weight: 3.5, stackable: false, tier: 4 },
    'gorka_pants': { name: 'Gorka Taktikai Nadrág', type: 'legs', icon: '👖', desc: 'Tier 4 - Elit nadrág (+14 Véd.)', def: 14, hpBonus: 50, weight: 1.6, stackable: false, tier: 4 },
    'combat_boots': { name: 'Katonai Harci Bakancs', type: 'shoes', icon: '🥾', desc: 'Tier 4 - Profi cipő (-30% fáradtság, +6 Véd.)', def: 6, hpBonus: 20, weight: 1.8, stackable: false, tier: 4 },
    'tactical_backpack': { name: 'Katonai Assault Zsák', type: 'backpack', icon: '🎒', desc: 'Tier 4 - Kommandós táska (+45 hely)', bonusSlots: 45, maxWeightBonus: 35, weight: 2.0, stackable: false, tier: 4 },
    'attack_backpack': { name: 'Eberpack / Raid Zsák', type: 'backpack', icon: '🎒', desc: 'Tier 4 - Hatalmas zsák (+60 hely)', bonusSlots: 60, maxWeightBonus: 50, weight: 3.0, stackable: false, tier: 4 },
    'kevlar_vest': { name: 'Kevlár Mellény', type: 'armor', icon: '🦺', desc: 'Tier 4 - Nehéz golyóálló (+25 Véd.)', def: 25, hpBonus: 70, weight: 6.5, stackable: false, tier: 4 },
    '6b43_armor': { name: '6B43 Nehéz Harci Páncél', type: 'armor', icon: '🛡️', desc: 'Tier 4 - Csúcsminőségű páncél (+45 Véd.)', def: 45, hpBonus: 120, weight: 12.0, stackable: false, tier: 4 },

    'seva_suit': { name: 'SEVA Vegyvédelmi Ruházat', type: 'torso', icon: '☣️', desc: 'Tier 5 - Teljes anomália védelem (+30 Véd., +90 Max HP)', def: 30, hpBonus: 90, weight: 4.5, stackable: false, tier: 5 },
    'exo_skeleton': { name: 'Exoskeleton Harci Páncél', type: 'armor', icon: '🦾', desc: 'Tier 5 - Nehéz gépiesített páncél (+60 Véd., +150 Max HP, +40 kg Súly)', def: 60, hpBonus: 150, maxWeightBonus: 40, weight: 25.0, stackable: false, tier: 5 },
    'altyn_helmet': { name: 'Altyn Golyóálló Sisak', type: 'helmet', icon: '🪖', desc: 'Tier 5 - Nehéz plexis rohamsisak (+25 Véd., +65 Max HP)', def: 25, hpBonus: 65, weight: 4.0, stackable: false, tier: 5 },
    'night_vision': { name: 'PNV-10T Éjjellátó Készülék', type: 'helmet', icon: '🕶️', desc: 'Tier 5 - Éjszakai portyázáshoz (+5 Véd.)', def: 5, hpBonus: 10, weight: 1.0, stackable: false, tier: 5 },

    'artifact_medusa': { name: 'Medúza Relikvia', type: 'artifact', icon: '🟢', desc: 'Kinézetre furcsa kő (+15 Max HP)', hpBonus: 15, weight: 0.5, stackable: false },
    'artifact_flash': { name: 'Villám Relikvia', type: 'artifact', icon: '⚡', desc: 'Statikus energiát sugárzó kő', weight: 0.4, stackable: false },
    'artifact_mama_beads': { name: 'Mama Gyöngye Relikvia', type: 'artifact', icon: '🔴', desc: 'Anomália mag (+35 Véd., sugárzásvédelem)', def: 35, weight: 0.8, stackable: false },
    'artifact_gravi': { name: 'Gravi Relikvia', type: 'artifact', icon: '🌀', desc: 'Meghajlítja a teret (+25 kg teherbírás)', maxWeightBonus: 25, weight: 1.2, stackable: false },

    'gold_ring': { name: 'Aranygyűrű', type: 'valuable', icon: '💍', desc: 'Csillogó nemesfém ékszer', weight: 0.05, stackable: true },
    'silver_necklace': { name: 'Ezüst Nyaklánc', type: 'valuable', icon: '📿', desc: 'Finom megmunkálású ezüst', weight: 0.1, stackable: true },
    'rolex_watch': { name: 'Luxus Karóra', type: 'valuable', icon: '⌚', desc: 'Megállt az idő, de sokat ér', weight: 0.2, stackable: false },
    'diamond_gem': { name: 'Csiszolatlan Gyémánt', type: 'valuable', icon: '💎', desc: 'Extrém ritka drágakő a romok alól', weight: 0.02, stackable: true },
    'gold_tooth': { name: 'Aranyfog', type: 'valuable', icon: '🦷', desc: 'Kihúzott emlék egy banditától', weight: 0.01, stackable: true },

    'empty_can': { name: 'Üres Konzervdoboz', type: 'material', icon: '🥫', desc: 'Olvasztható fémforrás', weight: 0.1, stackable: true },
    'old_battery': { name: 'Lemerült Akksi', type: 'material', icon: '🪫', desc: 'Ólom és fém nyerhető belőle', weight: 0.4, stackable: true },
    'broken_toaster': { name: 'Törött Kenyérpirító', type: 'material', icon: '🔌', desc: 'Sok fémhulladék és drót', weight: 1.8, stackable: false },
    'scrap_wire_bundle': { name: 'Gabalyodott Rézkábel', type: 'material', icon: '〰️', desc: 'Olvasztásra váró vastag réz', weight: 0.9, stackable: true },
    'radiator_chunk': { name: 'Ócska Alumínium Radiátor', type: 'material', icon: '🪟', desc: 'Hatalmas fém / alu bázis', weight: 4.5, stackable: false },
    'lead_pipes_scrap': { name: 'Ólomcső Darabok', type: 'material', icon: '🧪', desc: 'Nehéz, olvasztható ólom', weight: 3.0, stackable: true },
    'raw_iron_ore': { name: 'Nyers Vasérc', type: 'material', icon: '🪨', desc: 'Olvasztható vasérc darab', weight: 2.0, stackable: true },
    'raw_copper_ore': { name: 'Nyers Rézérc', type: 'material', icon: '🧱', desc: 'Vöröses rézérc rög', weight: 1.8, stackable: true },
    'pure_metal_bar': { name: 'Tiszta Fémtömb', type: 'material', icon: '🧈', desc: 'Olvasztott, prémium fémrúd', weight: 3.5, stackable: true },

    'heavy_nails': { name: 'Edzett Acélszögek', type: 'material', icon: '📌', desc: 'Erős rögzítéshez', weight: 0.5, stackable: true },
    'hinge_latch': { name: 'Ajtózsanér és Zár', type: 'material', icon: '🚪', desc: 'Bázisok lezárásához', weight: 0.7, stackable: true },
    'concrete_mix': { name: 'Száraz Cementes Zsák', type: 'material', icon: '🧱', desc: 'Betonozáshoz, erősítéshez', weight: 5.0, stackable: false },
    'steel_plate': { name: 'Vastag Acéllemez', type: 'material', icon: '🛡️', desc: 'Páncélozási alapanyag', weight: 6.0, stackable: false },
    'ceramic_plates': { name: 'Kerámia Páncélzat Darab', type: 'material', icon: '🛡️', desc: 'Mellény fejlesztéshez', weight: 1.5, stackable: true },

    'screwdriver': { name: 'Csavarhúzó', type: 'tool', icon: '🪛', desc: 'Finomszerelési eszköz', weight: 0.4, stackable: false },
    'toolbox': { name: 'Szerszámosláda', type: 'tool', icon: '🧰', desc: 'Komolyabb szereléshez', weight: 4.0, stackable: false },
    'sewing_kit': { name: 'Varrókészlet', type: 'tool', icon: '🧵', desc: 'Ruhák és táskák foltozásához', weight: 0.5, stackable: false },
    'gun_cleaning_kit': { name: 'Fegyverpucoló Készlet', type: 'tool', icon: '🧽', desc: 'Megakadályozza a fegyver besülését', weight: 0.8, stackable: false },
    'geiger_counter': { name: 'Geiger-Müller Számláló', type: 'tool', icon: '☢️', desc: 'Méri a sugárzást a zónában', weight: 0.7, stackable: false },
    'flare': { name: 'Jelzőfény / Fáklya', type: 'tool', icon: '🚨', desc: 'Mutánsok elijesztésére', weight: 0.4, stackable: true },

    'scope_lens': { name: 'Kopott Távcső Lencse', type: 'mod', icon: '🔭', desc: 'Optika alap fegyverekre', weight: 0.3, stackable: true },
    'copper_wire': { name: 'Rézdrót Tekercs', type: 'mod', icon: '⚡', desc: 'Elektromos modokhoz', weight: 0.3, stackable: true },
    'chemical_solvent': { name: 'Vegyi Oldószer', type: 'mod', icon: '🧪', desc: 'Tisztításhoz és robbanóanyaghoz', weight: 0.5, stackable: true },
    'gear_wheel': { name: 'Acél Fogaskerék', type: 'mod', icon: '⚙️', desc: 'Mechanikus tuning alkatrész', weight: 0.6, stackable: true },

    'rag': { name: 'Szövet / Rongy', type: 'material', icon: '📜', desc: 'Alapanyag ruhából', weight: 0.1, stackable: true },
    'duct_tape': { name: 'Ezüst Ragasztószalag', type: 'material', icon: '🧻', desc: 'Szereléshez és craftoláshoz', weight: 0.2, stackable: true },
    'alcohol': { name: 'Tiszta Alkohol', type: 'material', icon: '🧪', desc: 'Fertőtlenítő alapanyag', weight: 0.4, stackable: true },
    'metal_scrap': { name: 'Fémhulladék', type: 'material', icon: '🔩', desc: 'Fém alkatrész', weight: 0.5, stackable: true },
    'pipe': { name: 'Acél Fémcső', type: 'material', icon: '🔧', desc: 'Csőfegyver alap', weight: 1.2, stackable: true },
    'leather': { name: 'Kikezeletlen Bőr', type: 'material', icon: '🐂', desc: 'Megerősített anyag', weight: 0.8, stackable: true },
    'stone': { name: 'Kődarab', type: 'material', icon: '🪨', desc: 'Közelharchoz / eszközhöz', weight: 1.5, stackable: true },
    'stick': { name: 'Faág / Bot', type: 'material', icon: '🪵', desc: 'Fa alapanyag', weight: 0.6, stackable: true },
    'gunpowder': { name: 'Lőpor', type: 'material', icon: '⬛', desc: 'Lőszer töltet', weight: 0.3, stackable: true },
    'nails': { name: 'Acél Szögek', type: 'material', icon: '📌', desc: 'Barkácsoláshoz', weight: 0.4, stackable: true },
    'wire': { name: 'Dróttekercs', type: 'material', icon: '〰️', desc: 'Mechanikai alkatrész', weight: 0.2, stackable: true },
    'battery': { name: '9V Elem', type: 'material', icon: '🔋', desc: 'Elektronika', weight: 0.2, stackable: true },
    'radio_parts': { name: 'Régi Rádióalkatrész', type: 'material', icon: '📻', desc: 'Elektronikai alkatrész', weight: 0.3, stackable: true },
    'rusty_bolts': { name: 'Rozsdás Csavarok', type: 'material', icon: '🔩', desc: 'Rögzítőelem barkácshoz', weight: 0.2, stackable: true },
    'broken_bulb': { name: 'Égett Villanykörte', type: 'material', icon: '💡', desc: 'Törékeny üvegforrás', weight: 0.1, stackable: true },
    'old_newspaper': { name: 'Régi Újság / Papír', type: 'material', icon: '📰', desc: 'Tűzgyújtáshoz való papír', weight: 0.1, stackable: true },
    'glass_shards': { name: 'Üvegszilánk', type: 'material', icon: '🪞', desc: 'Éles darab csapdákhoz', weight: 0.2, stackable: true },
    'dirty_rag': { name: 'Lyukas Zokni / Rongy', type: 'material', icon: '🧦', desc: 'Mosható szövetdarab', weight: 0.1, stackable: true },

    'prewar_photo': { name: 'Háború előtti Családi Fotó', type: 'collectible', icon: '🖼️', desc: 'Megfacsarja a túlélő szívét', weight: 0.05, stackable: true },
    'soviet_badge': { name: 'Lenin Úttörő Jelvény', type: 'collectible', icon: '⭐', desc: 'Régi nosztalgikus kitüntetés', weight: 0.05, stackable: true },
    'vinyl_record': { name: 'Hanglemez (Zonális Blues)', type: 'collectible', icon: '💿', desc: 'Még szólna, ha lenne lejátszó', weight: 0.3, stackable: true },
    'antique_compass': { name: 'Régi Sárgaréz Tájoló', type: 'collectible', icon: '🧭', desc: 'Ereklye a múltból', weight: 0.4, stackable: false },
    'old_passport': { name: 'Szovjet Útlevél', type: 'collectible', icon: '📘', desc: 'Okmány egy nem létező országból', weight: 0.1, stackable: true },
    'rubber_ducky': { name: 'Radioaktív Gumikacsa', type: 'collectible', icon: '🐤', desc: 'Zölden világít a sötétben', weight: 0.2, stackable: true },

    'ammo_9mm': { name: '9x19mm Parabellum', type: 'ammo', icon: '🎯', desc: 'Pisztoly lőszer', ammoType: 'ammo_9mm', weight: 0.02, stackable: true },
    'ammo_762': { name: '7.62x39mm Katonai Lőszer', type: 'ammo', icon: '🎯', desc: 'AK lőszer', ammoType: 'ammo_762', weight: 0.03, stackable: true },
    'ammo_556': { name: '5.56x45mm NATO', type: 'ammo', icon: '🎯', desc: 'M4 lőszer', ammoType: 'ammo_556', weight: 0.03, stackable: true },
    'ammo_buckshot': { name: '12 Gauge Sörét', type: 'ammo', icon: '🎯', desc: 'Sörétes töltény', ammoType: 'ammo_buckshot', weight: 0.05, stackable: true },
    'ammo_sniper': { name: '7.62x54mmR Mesterlövész', type: 'ammo', icon: '🎯', desc: 'SVD / Vadászpuska lőszer', ammoType: 'ammo_sniper', weight: 0.04, stackable: true }
};

const craftingRecipes = [
    { id: 'bandage', name: 'Steril Kötszer készítése', icon: '🩹', req: { rag: 1, alcohol: 1 }, desc: '1x Szövet + 1x Fertőtlenítő' },
    { id: 'coffee', name: 'Fekete Kávé főzés', icon: '☕', req: { water_bottle: 1 }, desc: '1x Vizespalack felforralása' },
    { id: 'duct_tape', name: 'Ragasztószalag gyártás', icon: '🧻', req: { rag: 2, metal_scrap: 1 }, desc: '2x Szövet + 1x Fémhulladék' },
    { id: 'bow', name: 'Kompozit Íj készítése', icon: '🏹', req: { stick: 2, rag: 1, stone: 1 }, desc: '2x Bot + 1x Szövet + 1x Kő' },
    { id: 'ammo_9mm', name: '9mm Lőszer (x5)', icon: '🎯', req: { gunpowder: 1, metal_scrap: 1 }, desc: '1x Lőpor + 1x Fémhulladék', count: 5 },
    { id: 'gp5_mask', name: 'GP-5 Gázálarc összeszerelés', icon: '🪖', req: { metal_scrap: 2, rag: 2, duct_tape: 1 }, desc: '2x Fém + 2x Szövet + 1x Szalag' },
    { id: 'tactical_backpack', name: 'Katonai Assault Zsák', icon: '🎒', req: { rag: 4, metal_scrap: 2, duct_tape: 1 }, desc: '4x Szövet + 2x Fém + 1x Szalag' },
    { id: 'kevlar_vest', name: 'Kevlár Mellény', icon: '🦺', req: { metal_scrap: 5, leather: 2, duct_tape: 1 }, desc: '5x Fém + 2x Bőr + 1x Szalag' }
];

let player = {
    player.username: 'Stalker2',
    avatar: 'avatar1.png',
    hp: 100,
    maxHp: 100,
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    level: 1,
    xp: 0,
    defense: 0,
    maxInv: 10,
    maxWeight: 30,
    inventory: [],
    equipment: { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null }
};

function calculateInventoryWeight() {
    let totalWeight = 0;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    player.inventory.forEach(slot => {
        const item = itemDatabase[slot.key];
        if (item && item.weight) {
            totalWeight += item.weight * (slot.count || 1);
        }
    });
    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon'];
    slots.forEach(slotName => {
        if (!player.equipment) player.equipment = {};
        const eqKey = player.equipment[slotName];
        if (eqKey && itemDatabase[eqKey] && itemDatabase[eqKey].weight) {
            totalWeight += itemDatabase[eqKey].weight;
        }
    });
    return Math.round(totalWeight * 10) / 10;
}

function calculateStats() {
    if (!player.equipment) player.equipment = { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null };
    let totalDef = 0;
    let totalHpBonus = 0;
    let totalSlots = 10;
    let maxWeightBonus = 0;

    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack'];
    slots.forEach(slot => {
        const itemKey = player.equipment[slot];
        if (itemKey && itemDatabase[itemKey]) {
            const item = itemDatabase[itemKey];
            if (item.def) totalDef += item.def;
            if (item.hpBonus) totalHpBonus += item.hpBonus;
            if (slot === 'backpack') {
                if (item.bonusSlots) totalSlots += item.bonusSlots;
                if (item.maxWeightBonus) maxWeightBonus += item.maxWeightBonus;
            }
        }
    });

    player.defense = totalDef;
    player.maxInv = totalSlots;
    player.maxWeight = 30 + maxWeightBonus;

    let prevMaxHp = player.maxHp || 100;
    player.maxHp = 100 + totalHpBonus;
    if (player.maxHp > prevMaxHp) {
        player.hp = (player.hp || 100) + (player.maxHp - prevMaxHp);
    }
    player.hp = Math.min(player.hp || 100, player.maxHp);
}

function addItemToInventory(itemKey, amount = 1) {
    const itemConfig = itemDatabase[itemKey];
    if (!itemConfig) return false;

    calculateStats();
    let currentWeight = calculateInventoryWeight();
    let addedWeight = (itemConfig.weight || 0) * amount;

    if (currentWeight + addedWeight > player.maxWeight) {
        logMessage(`Túlsúly! Nincs elég kapacitás (${currentWeight}/${player.maxWeight} kg)!`);
        playSound('hit');
        return false;
    }

    if (itemConfig.stackable) {
        let existing = player.inventory.find(slot => slot.key === itemKey);
        if (existing) {
            existing.count += amount;
            saveGame();
            updateUI();
            return true;
        }
    }

    if (player.inventory.length >= (player.maxInv || 10)) {
        logMessage("A hátizsákodban nincsenek szabad slotok!");
        playSound('hit');
        return false;
    }

    player.inventory.push({ key: itemKey, count: amount });
    saveGame();
    updateUI();
    return true;
}

function dropItem(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const item = itemDatabase[slot.key];
    
    slot.count--;
    if (slot.count <= 0) {
        player.inventory.splice(index, 1);
    }
    logMessage(`Eldobtál 1 db-ot: ${item.name}`);
    saveGame();
    updateUI();
}

function useItem(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const itemKey = slot.key;
    const item = itemDatabase[itemKey];

    if (item.type === 'food') {
        player.hunger = Math.min(100, (player.hunger || 100) + item.value);
        if (item.fatigueValue) player.fatigue = Math.max(0, (player.fatigue || 0) - item.fatigueValue);
        slot.count--;
        if (slot.count <= 0) player.inventory.splice(index, 1);
        logMessage(`Megetted: ${item.name}`);
        playSound('loot');
    } else if (item.type === 'drink') {
        player.thirst = Math.min(100, (player.thirst || 100) + item.value);
        if(itemKey === 'coffee') player.fatigue = Math.max(0, (player.fatigue || 0) - 40);
        if(itemKey === 'energy_drink') player.fatigue = Math.max(0, (player.fatigue || 0) - 30);
        slot.count--;
        if (slot.count <= 0) player.inventory.splice(index, 1);
        logMessage(`Megittad: ${item.name}`);
        playSound('loot');
    } else if (item.type === 'medicine') {
        player.hp = Math.min(player.maxHp, (player.hp || 100) + item.value);
        slot.count--;
        if (slot.count <= 0) player.inventory.splice(index, 1);
        logMessage(`Használtad: ${item.name}`);
        playSound('loot');
    } else if (['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon'].includes(item.type)) {
        equipItem(index, itemKey, item.type);
        return;
    } else {
        logMessage("Ezt az alapanyagot barkácsolásra használd fel.");
        return;
    }

    saveGame();
    updateUI();
}

function equipItem(invIndex, itemKey, slot) {
    const slotItem = player.equipment[slot];
    if (slotItem) {
        addItemToInventory(slotItem, 1);
    }
    
    let slotObj = player.inventory[invIndex];
    slotObj.count--;
    if (slotObj.count <= 0) {
        player.inventory.splice(invIndex, 1);
    }

    player.equipment[slot] = itemKey;
    calculateStats();
    logMessage(`Felszerelve: ${itemDatabase[itemKey].name}`);
    saveGame();
    updateUI();
}

function unequip(slot) {
    if (!player.equipment[slot]) return;
    
    if (slot === 'backpack') {
        let futureSlots = 10;
        if (player.inventory.length > futureSlots) {
            logMessage(`Nem veheted le a táskát! Túl sok tárgy van nálad (${player.inventory.length}/${futureSlots}), pakolj ki előbb!`);
            playSound('hit');
            return;
        }
    }

    if (addItemToInventory(player.equipment[slot], 1)) {
        player.equipment[slot] = null;
        calculateStats();
        logMessage("Tárgy levéve a slotról.");
        saveGame();
        updateUI();
    }
}

function craftItem(recipe) {
    for (let [mat, qty] of Object.entries(recipe.req)) {
        let slot = player.inventory.find(s => s.key === mat);
        if (!slot || slot.count < qty) {
            logMessage(`Hiányzik: ${itemDatabase[mat].name}`);
            return;
        }
    }
    for (let [mat, qty] of Object.entries(recipe.req)) {
        let slot = player.inventory.find(s => s.key === mat);
        slot.count -= qty;
        if (slot.count <= 0) player.inventory = player.inventory.filter(s => s.key !== mat);
    }
    addItemToInventory(recipe.id, recipe.count || 1);
    logMessage(`Sikeres barkácsolás: ${recipe.name}!`);
    playSound('win');
    saveGame();
    updateUI();
}