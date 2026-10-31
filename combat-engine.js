// combat-engine.js
// KÖRÖS HARC – a szabályok (csak a szerver futtatja).
// Minden lépés egy eseménylistát ad vissza ([{ actor, type, amount, ... }]), amiből a kliens most szöveges
// naplót ír, később pedig animációt (pl. Shakes & Fidget-stílusban) lehet építeni rá. A PvP ugyanerre épülhet.
const SurvivalStats = require('./public/js/stats');

// Ellenségek (lvl: veszélyességi szint, hp/dmg: alapérték 1. szintű játékoshoz)
// drops: a legyőzött ellenségnél talált tárgyak lehetséges listája
// Ellenségek. habitat: az épületek loot-csoportjai (buildings.js), ahol előfordulnak; night: csak éjjel jön;
// nightWeight: éjjel ennyiszer gyakoribb (a ghoulok és a kutyák éjjel aktívak); redZoneOnly: csak a vörös zónákban (v0.2).
// A kép: public/images/enemies/<kulcs>.webp (ha nincs, az avatar emoji látszik).
const ENEMIES = {
    looter:         { name: 'Fosztogató',             avatar: '🧑', lvl: 1, hp: 40,  dmg: 8,  drops: ['canned_food', 'rag', 'water_bottle', 'copper_coins'],
                      habitat: ['household', 'grocery', 'smallgoods', 'drinks', 'kitchen', 'office', 'culture', 'sport'] },
    rats:           { name: 'Patkányraj',             avatar: '🐀', lvl: 1, hp: 30,  dmg: 7,  drops: ['rag', 'mutant_steak'],
                      habitat: ['kitchen', 'warehouse', 'grocery', 'farm', 'household', 'utility'] },
    mutant:         { name: 'Kóbor Mutáns',           avatar: '🧟', lvl: 1, hp: 50,  dmg: 10, drops: ['mutant_steak', 'rag', 'leather'],
                      habitat: ['household', 'industrial', 'scrap', 'auto', 'utility', 'cemetery', 'warehouse'] },
    ghoul:          { name: 'Sugárzott Ghoul',        avatar: '👹', lvl: 2, hp: 75,  dmg: 14, drops: ['rag', 'old_battery', 'radio_parts'], nightWeight: 2,
                      habitat: ['household', 'culture', 'cemetery', 'office', 'industrial', 'smallgoods'] },
    dogpack:        { name: 'Kóbor Kutyafalka',       avatar: '🐕', lvl: 2, hp: 70,  dmg: 15, drops: ['mutant_steak', 'leather'], nightWeight: 2,
                      habitat: ['household', 'farm', 'sport', 'scrap', 'cemetery', 'auto'] },
    hospital_ghoul: { name: 'Kórházi Ghoul',          avatar: '🧟', lvl: 2, hp: 80,  dmg: 15, drops: ['bandage', 'painkillers', 'iodine', 'antiseptic_wipes'], nightWeight: 2,
                      habitat: ['medical', 'hospital'] },
    bandit:         { name: 'Zóna Bandita',           avatar: '🦹', lvl: 2, hp: 70,  dmg: 16, drops: ['ammo_9mm', 'canned_food', 'bandage', 'copper_coins'],
                      habitat: ['grocery', 'smallgoods', 'drinks', 'auto', 'warehouse', 'valuables', 'household'] },
    beast:          { name: 'Mutáns Fenevad',         avatar: '🐺', lvl: 3, hp: 95,  dmg: 22, drops: ['mutant_steak', 'leather'],
                      habitat: ['farm', 'scrap', 'sport', 'utility', 'cemetery', 'industrial'] },
    shade:          { name: 'Árnyék',                 avatar: '👤', lvl: 3, hp: 60,  dmg: 26, drops: ['old_battery', 'silver_necklace'], night: true,
                      habitat: [] }, // éjjel bárhol felbukkanhat (lásd enemyPoolFor)
    wavewalker:     { name: 'Hullámjáró',             avatar: '☢️', lvl: 4, hp: 120, dmg: 26, drops: ['antirad_pills', 'old_battery', 'radio_parts'],
                      habitat: ['hazmat', 'industrial', 'utility'] },
    cordon_soldier: { name: 'Kordon-katona',          avatar: '🪖', lvl: 4, hp: 120, dmg: 24, drops: ['ammo_762', 'ammo_9mm', 'mre_ration', 'bandage'],
                      habitat: ['military', 'police'] },
    mercenary:      { name: 'Nehézfegyveres Zsoldos', avatar: '🪖', lvl: 4, hp: 130, dmg: 28, drops: ['ammo_762', 'mre_ration', 'bandage', 'tourniquet'],
                      habitat: ['military', 'hazmat', 'police'] },
    tuner:          { name: 'A Hangoló',              avatar: '🧠', lvl: 6, hp: 260, dmg: 38, drops: ['antirad_pills', 'medkit'], redZoneOnly: true,
                      habitat: [] }
};

// Az épület veszélyessége (encounter esély) szerint a legerősebb ellenség szintje
function maxEnemyLevel(encounterChance) {
    if (encounterChance >= 0.15) return 5;
    if (encounterChance >= 0.10) return 4;
    return 3;
}

const SHADE_NIGHT_WEIGHT = 1;     // éjjel az Árnyék súlya a listában (a többi ellenség súlya 1, éjjel aktívaké 2)
const FALLBACK_POOL = ['looter', 'mutant', 'ghoul'];

// Melyik ellenség jöhet egy épületben: az épület típusa (loot-csoportjai), veszélyessége és a napszak szerint.
// Visszaad: súlyozott lista [[kulcs, súly], ...]
function enemyPoolFor(buildingInfo, opts) {
    const info = buildingInfo || {};
    const night = !!(opts && opts.night);
    const groups = new Set(info.groups || []);
    const maxLvl = maxEnemyLevel(typeof info.encounter === 'number' ? info.encounter : 0.05);
    const pool = [];
    Object.keys(ENEMIES).forEach(key => {
        const e = ENEMIES[key];
        if (e.redZoneOnly || e.lvl > maxLvl) return;
        if (e.night) { if (night) pool.push([key, SHADE_NIGHT_WEIGHT]); return; }
        if (!e.habitat.some(g => groups.has(g))) return;
        pool.push([key, night && e.nightWeight ? e.nightWeight : 1]);
    });
    if (pool.length === 0) FALLBACK_POOL.forEach(key => pool.push([key, 1]));
    return pool;
}

const RULES = {
    UNARMED_DMG: 5,          // fegyver nélkül
    NO_AMMO_DMG: 6,          // lőfegyver lőszer nélkül (puskatussal ütsz)
    LEVEL_DMG_BONUS: 2,      // szintenként +2 sebzés
    DMG_RANDOM: 4,           // +0..4 véletlen sebzés
    CRIT_CHANCE: 0.10,
    CRIT_MULT: 1.5,
    ENEMY_VARIANCE: 0.2,     // az ellenség ütése ±20%
    DEFENSE_PER_POINT: 0.015, // 1 védelem = 1,5% sebzéscsökkentés
    DEFENSE_CAP: 0.75,        // legfeljebb 75%
    ENEMY_HP_PER_LEVEL: 0.15, // játékosszintenként +15% ellenség-HP
    ENEMY_DMG_PER_LEVEL: 0.10,// játékosszintenként +10% ellenség-sebzés
    FLEE_CHANCE: 0.85,
    DROP_CHANCE: 0.4,
    CASING_CHANCE: 0.6      // lövés után ekkora eséllyel kapsz vissza üres hüvelyt
};

const WEAPON_SLOTS = ['weapon', 'secondary', 'melee']; // elsődleges, másodlagos, közelharci

// Fáradtság hatása (a megbeszélt sávok): 60% fölött -15% sebzés és nehezebb menekülés, 85% fölött -30%
function fatiguePenalty(fatigue) {
    if (fatigue >= 85) return { dmg: 0.70, flee: -0.20 };
    if (fatigue >= 60) return { dmg: 0.85, flee: -0.10 };
    return { dmg: 1, flee: 0 };
}

function pick(list, random) {
    return list[Math.floor(random() * list.length)];
}

function pickWeighted(pool, random) {
    const total = pool.reduce((sum, entry) => sum + entry[1], 0);
    let roll = random() * total;
    for (const [key, weight] of pool) {
        roll -= weight;
        if (roll < 0) return key;
    }
    return pool[pool.length - 1][0];
}

// Új harc: ellenség kiválasztása és a játékos szintjéhez igazítása
// opts.night: éjszaka van-e az épületnél (Árnyék, aktívabb ghoulok és kutyák)
function createCombat(p, building, buildingInfo, random, opts) {
    random = random || Math.random;
    const key = pickWeighted(enemyPoolFor(buildingInfo, opts), random);
    const base = ENEMIES[key];
    const lvlUp = Math.max(0, (p.level || 1) - 1);
    const maxHp = Math.round(base.hp * (1 + RULES.ENEMY_HP_PER_LEVEL * lvlUp));
    return {
        buildingId: building.id,
        buildingName: building.name,
        buildingType: building.type,
        enemy: {
            key, name: base.name, avatar: base.avatar, lvl: base.lvl,
            hp: maxHp, maxHp,
            dmg: Math.round(base.dmg * (1 + RULES.ENEMY_DMG_PER_LEVEL * lvlUp))
        },
        round: 1,
        startedAt: Date.now()
    };
}

// A választott fegyver és lőszere: { name, dmg, ammoKey (ha fogy) }. slot: weapon | secondary | melee
function weaponInfo(p, itemDatabase, slot) {
    const key = p.equipment && p.equipment[WEAPON_SLOTS.includes(slot) ? slot : 'weapon'];
    const weapon = key && itemDatabase[key];
    if (!weapon) return { name: 'Puszta kéz', dmg: RULES.UNARMED_DMG, ammoKey: null, noAmmo: false };
    if (weapon.reqAmmo) {
        const hasAmmo = p.inventory.some(s => s.key === weapon.reqAmmo && s.count > 0);
        if (!hasAmmo) return { name: weapon.name, dmg: RULES.NO_AMMO_DMG, ammoKey: null, noAmmo: true };
        return { name: weapon.name, dmg: weapon.dmg || RULES.UNARMED_DMG, ammoKey: weapon.reqAmmo, noAmmo: false };
    }
    return { name: weapon.name, dmg: weapon.dmg || RULES.UNARMED_DMG, ammoKey: null, noAmmo: false };
}

function useAmmo(p, ammoKey) {
    const slot = p.inventory.find(s => s.key === ammoKey && s.count > 0);
    if (!slot) return;
    slot.count -= 1;
    if (slot.count <= 0) p.inventory = p.inventory.filter(s => s !== slot);
}

// Az ellenség köre: a sebzést a játékos védelme csökkenti
function enemyTurn(p, combat, itemDatabase, random) {
    const stats = SurvivalStats.computeStats(p, itemDatabase);
    const mitigation = 1 - Math.min(RULES.DEFENSE_CAP, stats.defense * RULES.DEFENSE_PER_POINT);
    const roll = 1 + (random() * 2 - 1) * RULES.ENEMY_VARIANCE;
    const amount = Math.max(1, Math.round(combat.enemy.dmg * roll * mitigation));
    p.hp = Math.max(0, p.hp - amount);
    return { actor: 'enemy', type: 'hit', amount, hpAfter: Math.round(p.hp) };
}

// Támadás a választott fegyverrel (a fegyverváltás nem vesz el kört): a játékos üt, majd ha az ellenség él, visszaüt.
// Visszatérés: { events, outcome: 'won' | 'lost' | null, casing: true ha üres hüvelyt kaptál vissza }
function attack(p, combat, itemDatabase, random, slot) {
    random = random || Math.random;
    const events = [];
    const weapon = weaponInfo(p, itemDatabase, slot);
    let casing = false;
    if (weapon.ammoKey) {
        useAmmo(p, weapon.ammoKey);
        casing = random() < RULES.CASING_CHANCE;
    }

    const penalty = fatiguePenalty(p.fatigue || 0);
    let amount = weapon.dmg + Math.floor(random() * (RULES.DMG_RANDOM + 1)) + ((p.level || 1) - 1) * RULES.LEVEL_DMG_BONUS;
    const crit = random() < RULES.CRIT_CHANCE;
    if (crit) amount *= RULES.CRIT_MULT;
    amount = Math.max(1, Math.round(amount * penalty.dmg));

    combat.enemy.hp = Math.max(0, combat.enemy.hp - amount);
    events.push({ actor: 'player', type: crit ? 'crit' : 'hit', amount, weapon: weapon.name, noAmmo: weapon.noAmmo, hpAfter: combat.enemy.hp });

    if (combat.enemy.hp <= 0) return { events, outcome: 'won', casing };
    events.push(enemyTurn(p, combat, itemDatabase, random));
    combat.round += 1;
    return { events, outcome: p.hp <= 0 ? 'lost' : null, casing };
}

// Gyógyítás harc közben: SZABAD lépés (nem vesz el kört, az ellenség nem üt utána)
function heal(p, combat, itemDatabase, itemKey, random) {
    random = random || Math.random;
    const item = itemDatabase[itemKey];
    if (!item || !item.effects || !(item.effects.hp > 0)) return { error: 'Ezzel nem tudsz gyógyulni.' };
    const slot = p.inventory.find(s => s.key === itemKey && s.count > 0);
    if (!slot) return { error: 'Nincs ilyen tárgy a leltáradban!' };

    const maxHp = SurvivalStats.computeStats(p, itemDatabase).maxHp;
    const changes = SurvivalStats.applyEffects(p, item.effects, maxHp);
    slot.count -= 1;
    if (slot.count <= 0) p.inventory = p.inventory.filter(s => s !== slot);

    return { events: [{ actor: 'player', type: 'heal', amount: Math.round(changes.hp || 0), item: item.name, hpAfter: Math.round(p.hp) }], outcome: null };
}

// Menekülés: nagy eséllyel sikerül (fáradtan nehezebb); ha nem, az ellenség üt
function flee(p, combat, itemDatabase, random) {
    random = random || Math.random;
    const chance = RULES.FLEE_CHANCE + fatiguePenalty(p.fatigue || 0).flee;
    if (random() < chance) return { events: [{ actor: 'player', type: 'flee', chance }], outcome: 'fled' };
    const events = [{ actor: 'player', type: 'flee_fail', chance }];
    events.push(enemyTurn(p, combat, itemDatabase, random));
    combat.round += 1;
    return { events, outcome: p.hp <= 0 ? 'lost' : null };
}

// Jutalom a győzelemért (XP, pénz, esetleg az ellenségnél talált tárgy)
function rewards(combat, random) {
    random = random || Math.random;
    const base = ENEMIES[combat.enemy.key];
    const lvl = combat.enemy.lvl;
    const drop = random() < RULES.DROP_CHANCE ? pick(base.drops, random) : null;
    return { xp: 15 + 10 * lvl, money: 5 * lvl + Math.floor(random() * 11), drop };
}

module.exports = { ENEMIES, RULES, WEAPON_SLOTS, enemyPoolFor, maxEnemyLevel, fatiguePenalty, createCombat, weaponInfo, attack, heal, flee, rewards };
