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
    looter:         { name: 'Fosztogató',             avatar: '🧑', lvl: 1, hp: 70, dmg: 8,  drops: ['canned_food', 'rag', 'water_bottle', 'copper_coins'],
                      habitat: ['household', 'grocery', 'smallgoods', 'drinks', 'kitchen', 'office', 'culture', 'sport', 'medical'] },
    rats:           { name: 'Patkányraj',             avatar: '🐀', lvl: 1, hp: 60, dmg: 6,  drops: ['rag', 'mutant_steak'],
                      habitat: ['kitchen', 'warehouse', 'grocery', 'farm', 'household', 'utility'] },
    mutant:         { name: 'Kóbor Mutáns',           avatar: '🧟', lvl: 2, hp: 110, dmg: 10, drops: ['mutant_steak', 'rag', 'leather'],
                      habitat: ['household', 'industrial', 'scrap', 'auto', 'utility', 'cemetery', 'warehouse'] },
    ghoul:          { name: 'Sugárzott Ghoul',        avatar: '👹', lvl: 3, hp: 150, dmg: 13, drops: ['rag', 'old_battery', 'radio_parts'], nightWeight: 2,
                      habitat: ['household', 'culture', 'cemetery', 'office', 'industrial', 'smallgoods'] },
    dogpack:        { name: 'Kóbor Kutyafalka',       avatar: '🐕', lvl: 2, hp: 100, dmg: 10, drops: ['mutant_steak', 'leather'], nightWeight: 2,
                      habitat: ['household', 'farm', 'sport', 'scrap', 'cemetery', 'auto'] },
    hospital_ghoul: { name: 'Kórházi Ghoul',          avatar: '🧟', lvl: 4, hp: 240, dmg: 26, drops: ['bandage', 'painkillers', 'iodine', 'antiseptic_wipes'], nightWeight: 2,
                      habitat: ['medical', 'hospital'] },
    bandit:         { name: 'Zóna Bandita',           avatar: '🦹', lvl: 3, hp: 150, dmg: 14, drops: ['ammo_9mm', 'canned_food', 'bandage', 'copper_coins'],
                      habitat: ['grocery', 'smallgoods', 'drinks', 'auto', 'warehouse', 'valuables', 'household'] },
    beast:          { name: 'Mutáns Fenevad',         avatar: '🐺', lvl: 4, hp: 270, dmg: 30, drops: ['mutant_steak', 'leather'],
                      habitat: ['farm', 'scrap', 'sport', 'utility', 'cemetery', 'industrial'] },
    shade:          { name: 'Árnyék',                 avatar: '👤', lvl: 5, hp: 220, dmg: 40, drops: ['old_battery', 'silver_necklace'], night: true,
                      habitat: [] }, // éjjel bárhol felbukkanhat (lásd enemyPoolFor)
    wavewalker:     { name: 'Hullámjáró',             avatar: '☢️', lvl: 5, hp: 340, dmg: 36, drops: ['antirad_pills', 'old_battery', 'radio_parts'],
                      habitat: ['hazmat', 'industrial', 'utility'] },
    cordon_soldier: { name: 'Kordon-katona',          avatar: '🪖', lvl: 6, hp: 420, dmg: 44, drops: ['ammo_762', 'ammo_9mm', 'mre_ration', 'bandage'],
                      habitat: ['military', 'police'] },
    mercenary:      { name: 'Nehézfegyveres Zsoldos', avatar: '🪖', lvl: 6, hp: 470, dmg: 50, drops: ['ammo_762', 'mre_ration', 'bandage', 'tourniquet'],
                      habitat: ['military', 'hazmat', 'police'] },
    tuner:          { name: 'A Hangoló',              avatar: '🧠', lvl: 8, hp: 900, dmg: 70, drops: ['antirad_pills', 'medkit'], redZoneOnly: true,
                      habitat: [] }
};

// A választás súlya a játékos szintjéhez képest: a vele egyező szintű ellenség a leggyakoribb, utána az eggyel
// gyengébb; az eggyel erősebb ritkább (kihívás), a még erősebbek nem jönnek (kivéve a veszélyes helyeken).
const LEVEL_AHEAD_MAX = 1;
function levelWeight(enemyLvl, playerLvl) {
    const d = enemyLvl - playerLvl;
    if (d === 0) return 3;
    if (d === -1) return 2;
    return 1; // eggyel erősebb, vagy legalább két szinttel gyengébb
}

const DANGEROUS_ENCOUNTER = 0.15; // e fölött (katonai bázis, bunker, ellenőrzőpont, vegyvédelmi központ) a hely saját ellenségei szinttől függetlenül jönnek
const FALLBACK_POOL = ['rats', 'looter', 'mutant'];

// Melyik ellenség jöhet egy épületben: az épület típusa (loot-csoportjai), a napszak és a játékos szintje szerint.
// opts: { night, playerLevel }. Visszaad: súlyozott lista [[kulcs, súly], ...]
function enemyPoolFor(buildingInfo, opts) {
    const info = buildingInfo || {};
    const night = !!(opts && opts.night);
    const playerLvl = Math.max(1, Math.floor(Number(opts && opts.playerLevel) || 1));
    const groups = new Set(info.groups || []);
    const dangerous = (typeof info.encounter === 'number' ? info.encounter : 0) >= DANGEROUS_ENCOUNTER;

    const candidates = Object.keys(ENEMIES).filter(key => {
        const e = ENEMIES[key];
        if (e.redZoneOnly) return false;
        if (e.night) return night;
        return e.habitat.some(g => groups.has(g));
    });
    const weightOf = key => {
        const e = ENEMIES[key];
        return levelWeight(e.lvl, playerLvl) * (night && e.nightWeight ? e.nightWeight : 1);
    };

    let pool = candidates.filter(key => ENEMIES[key].lvl <= playerLvl + LEVEL_AHEAD_MAX).map(key => [key, weightOf(key)]);
    if (dangerous) {
        // a veszélyes hely saját (erős) ellenségei mindig jöhetnek; a túl erősek ritkábban
        candidates.filter(key => ENEMIES[key].lvl > playerLvl + LEVEL_AHEAD_MAX && !ENEMIES[key].night)
            .forEach(key => pool.push([key, 1]));
    }
    if (pool.length === 0) {
        // csak erős ellenségek laknak itt: a leggyengébbjük jön
        const habitat = candidates.filter(key => !ENEMIES[key].night);
        if (habitat.length > 0) {
            const minLvl = Math.min(...habitat.map(key => ENEMIES[key].lvl));
            pool = habitat.filter(key => ENEMIES[key].lvl === minLvl).map(key => [key, 1]);
        }
    }
    if (pool.length === 0) pool = FALLBACK_POOL.map(key => [key, 1]);
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
    const key = pickWeighted(enemyPoolFor(buildingInfo, { night: !!(opts && opts.night), playerLevel: p.level || 1 }), random);
    const base = ENEMIES[key];
    // Az ellenség ereje a saját szintjéből jön (a szintlétra), nem a játékos szintjéből
    const maxHp = base.hp;
    return {
        buildingId: building.id,
        buildingName: building.name,
        buildingType: building.type,
        enemy: {
            key, name: base.name, avatar: base.avatar, lvl: base.lvl,
            hp: maxHp, maxHp,
            dmg: base.dmg
        },
        round: 1,
        startedAt: Date.now()
    };
}

// A választott fegyver és lőszere: { name, dmg, ammoKey (ha fogy) }. slot: weapon | secondary | melee
function weaponInfo(p, itemDatabase, slot) {
    const slotName = WEAPON_SLOTS.includes(slot) ? slot : 'weapon';
    const key = p.equipment && p.equipment[slotName];
    const weapon = key && itemDatabase[key];
    if (!weapon) return { name: 'Puszta kéz', dmg: RULES.UNARMED_DMG, ammoKey: null, noAmmo: false };
    // Tönkrement fegyver: csak annyit ér, mint a puszta kéz, és lőszert sem használ
    if (SurvivalStats.isBroken(p, slotName)) return { name: weapon.name + ' (tönkrement)', dmg: RULES.UNARMED_DMG, ammoKey: null, noAmmo: false, broken: true };
    if (weapon.reqAmmo) {
        const hasAmmo = p.inventory.some(s => s.key === weapon.reqAmmo && s.count > 0);
        if (!hasAmmo) return { name: weapon.name, dmg: RULES.NO_AMMO_DMG, ammoKey: null, noAmmo: true };
        return { name: weapon.name, dmg: weapon.dmg || RULES.UNARMED_DMG, ammoKey: weapon.reqAmmo, noAmmo: false };
    }
    return { name: weapon.name, dmg: weapon.dmg || RULES.UNARMED_DMG, ammoKey: null, noAmmo: false };
}

// Mi kapható vissza egy lövés után: a lőszer "recover" mezője, alapból üres hüvely (lőfegyverek)
function ammoRecovery(ammoItem) {
    if (!ammoItem || ammoItem.recover === false) return null;
    if (ammoItem.recover && ammoItem.recover.key) return { key: ammoItem.recover.key, chance: Number(ammoItem.recover.chance) || 0 };
    return { key: 'empty_casing', chance: RULES.CASING_CHANCE };
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
// Visszatérés: { events, outcome: 'won' | 'lost' | null, recovered: tárgykulcs, ha a lövés után visszakaptál valamit
//   (lőfegyver: üres hüvely, íj: nyílvessző) }
function attack(p, combat, itemDatabase, random, slot) {
    random = random || Math.random;
    const events = [];
    const weapon = weaponInfo(p, itemDatabase, slot);
    let recovered = null;
    if (weapon.ammoKey) {
        useAmmo(p, weapon.ammoKey);
        const back = ammoRecovery(itemDatabase[weapon.ammoKey]);
        if (back && random() < back.chance) recovered = back.key;
    }

    const penalty = fatiguePenalty(p.fatigue || 0);
    let amount = weapon.dmg + Math.floor(random() * (RULES.DMG_RANDOM + 1)) + ((p.level || 1) - 1) * RULES.LEVEL_DMG_BONUS;
    const crit = random() < RULES.CRIT_CHANCE;
    if (crit) amount *= RULES.CRIT_MULT;
    amount = Math.max(1, Math.round(amount * penalty.dmg));

    combat.enemy.hp = Math.max(0, combat.enemy.hp - amount);
    events.push({ actor: 'player', type: crit ? 'crit' : 'hit', amount, weapon: weapon.name, noAmmo: weapon.noAmmo, hpAfter: combat.enemy.hp });

    if (combat.enemy.hp <= 0) return { events, outcome: 'won', recovered };
    events.push(enemyTurn(p, combat, itemDatabase, random));
    combat.round += 1;
    return { events, outcome: p.hp <= 0 ? 'lost' : null, recovered };
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
    // Mentősíp a leltárban: a sípszóra a támadó megtorpan, a menekülés mindig sikerül
    const whistle = Array.isArray(p.inventory) && p.inventory.some(s => s.key === 'rescue_whistle' && s.count > 0);
    const chance = whistle ? 1 : RULES.FLEE_CHANCE + fatiguePenalty(p.fatigue || 0).flee;
    if (whistle || random() < chance) return { events: [{ actor: 'player', type: 'flee', chance, whistle }], outcome: 'fled' };
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

module.exports = { ENEMIES, RULES, WEAPON_SLOTS, enemyPoolFor, levelWeight, fatiguePenalty, createCombat, weaponInfo, attack, heal, flee, rewards };
