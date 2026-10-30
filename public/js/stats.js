// stats.js
// KÖZÖS számítások a kliensnek és a szervernek (ugyanaz a fájl fut mindkét helyen, mint az items.js).
// A származtatott értékeket (max HP, védelem, slotok, teherbírás, fáradási szorzó) SEHOL nem tároljuk:
// mindig a felszerelésből és a szintből számoljuk újra, így nem csúszhatnak szét.
(function (root) {
    // Alapértékek egy felszerelés nélküli, 1. szintű karakterre
    const BASE = { maxHp: 100, defense: 0, slots: 10, maxWeight: 30, fatigueRate: 1 };

    // weapon = elsődleges fegyver, secondary = másodlagos (pisztoly), melee = közelharci
    const EQUIPMENT_SLOTS = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon', 'secondary', 'melee'];

    const HP_PER_LEVEL = 10;        // szintenként +10 max HP
    const OVERWEIGHT_FACTOR = 2;    // túlsúly fáradási szorzója: 10% túlsúly -> 1.2x, 50% -> 2x
    const OVERWEIGHT_HARD_CAP = 1.5; // a teherbírás 150%-a fölé már semmit nem lehet felvenni

    function num(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    // A bónuszok listája. Minden forrás (szint, felszerelés, később képességek) ugyanilyen
    // bejegyzést ad, a számolás pedig csak összegzi őket. Új bónuszforrás = új bejegyzés.
    //   { source, maxHp, defense, slots, maxWeight, fatigueRate (szorzó) }
    function collectBonuses(player, itemDatabase) {
        const bonuses = [];
        const level = Math.max(1, Math.floor(num(player && player.level, 1)));
        if (level > 1) bonuses.push({ source: 'level', maxHp: (level - 1) * HP_PER_LEVEL });

        const equipment = (player && player.equipment) || {};
        EQUIPMENT_SLOTS.forEach(slot => {
            const key = equipment[slot];
            const item = key && itemDatabase[key];
            if (!item) return;
            bonuses.push({
                source: 'equipment:' + slot,
                maxHp: num(item.hpBonus, 0),
                defense: num(item.def, 0),
                slots: num(item.bonusSlots, 0),
                maxWeight: num(item.maxWeightBonus, 0),
                fatigueRate: item.fatigueRate === undefined ? 1 : num(item.fatigueRate, 1)
            });
        });

        // Ide jönnek majd a képességek (perk-ek), pl.: bonuses.push({ source: 'perk:packmule', maxWeight: 10 });
        return bonuses;
    }

    // A leltár és a felszerelés össztömege (kg)
    function carriedWeight(player, itemDatabase) {
        let total = 0;
        const inventory = Array.isArray(player && player.inventory) ? player.inventory : [];
        inventory.forEach(slot => {
            const item = slot && itemDatabase[slot.key];
            if (item) total += num(item.weight, 0) * Math.max(0, num(slot.count, 1));
        });
        const equipment = (player && player.equipment) || {};
        EQUIPMENT_SLOTS.forEach(slot => {
            const item = equipment[slot] && itemDatabase[equipment[slot]];
            if (item) total += num(item.weight, 0);
        });
        return Math.round(total * 100) / 100;
    }

    function computeStats(player, itemDatabase) {
        const stats = { ...BASE };
        collectBonuses(player, itemDatabase).forEach(b => {
            stats.maxHp += num(b.maxHp, 0);
            stats.defense += num(b.defense, 0);
            stats.slots += num(b.slots, 0);
            stats.maxWeight += num(b.maxWeight, 0);
            stats.fatigueRate *= b.fatigueRate === undefined ? 1 : num(b.fatigueRate, 1);
        });
        stats.weight = carriedWeight(player, itemDatabase);
        stats.weightHardCap = Math.round(stats.maxWeight * OVERWEIGHT_HARD_CAP * 100) / 100;
        stats.overweightMultiplier = overweightMultiplier(stats.weight, stats.maxWeight);
        return stats;
    }

    // 1.0, ha nincs túlsúly; különben a túlsúly arányában nő
    function overweightMultiplier(weight, maxWeight) {
        if (maxWeight <= 0 || weight <= maxWeight) return 1;
        return 1 + ((weight - maxWeight) / maxWeight) * OVERWEIGHT_FACTOR;
    }

    // --- TÁRGYTÍPUSOK ---
    const EFFECT_KEYS = ['hunger', 'thirst', 'hp', 'fatigue'];

    // Fogyasztható: van legalább egy hatása (éhség, szomjúság, HP, fáradtság)
    function isConsumable(item) {
        return !!(item && item.effects && EFFECT_KEYS.some(k => num(item.effects[k], 0) !== 0));
    }

    // Melyik felszerelési helyre való a tárgy (fegyvereknél a "slot" mező, egyébként a típusa)
    function equipSlot(item) {
        if (!item) return null;
        const slot = item.slot || item.type;
        return EQUIPMENT_SLOTS.includes(slot) ? slot : null;
    }

    // Felvehető: van felszerelési helye
    function isEquippable(item) {
        return !!equipSlot(item);
    }

    // A hatások alkalmazása a játékosra (határok között). Visszaadja a tényleges változásokat.
    function applyEffects(player, effects, maxHp) {
        const changes = {};
        const limits = { hunger: [0, 100], thirst: [0, 100], fatigue: [0, 100], hp: [0, maxHp] };
        EFFECT_KEYS.forEach(key => {
            const amount = num(effects && effects[key], 0);
            if (amount === 0) return;
            const before = num(player[key], 0);
            const after = Math.min(limits[key][1], Math.max(limits[key][0], before + amount));
            player[key] = after;
            if (after !== before) changes[key] = Math.round((after - before) * 10) / 10;
        });
        return changes;
    }

    // --- FÉNYFORRÁSOK ---
    // Melyik fény ég: előbb az elemes / olajos lámpák, a fáklyát (ami elfogy) a végére hagyjuk
    const LIGHT_ORDER = ['led_lantern', 'headlamp', 'flashlight', 'kerosene_lantern', 'torch'];

    // Használható fényforrás a leltárban: { slot, item, needsRefill } vagy null.
    // needsRefill: lemerült, de van hozzá üzemanyag (elem, lámpaolaj), így újratölthető.
    function findUsableLight(inventory, itemDatabase) {
        const slots = (Array.isArray(inventory) ? inventory : []).filter(s => itemDatabase[s.key] && itemDatabase[s.key].light);
        slots.sort((a, b) => {
            const ia = LIGHT_ORDER.indexOf(a.key), ib = LIGHT_ORDER.indexOf(b.key);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        for (const slot of slots) {
            if (slot.dur === undefined || num(slot.dur, 0) > 0) return { slot, item: itemDatabase[slot.key], needsRefill: false };
        }
        for (const slot of slots) {
            const fuel = itemDatabase[slot.key].light.fuel;
            if (fuel && inventory.some(s => s.key === fuel && s.count > 0)) return { slot, item: itemDatabase[slot.key], needsRefill: true };
        }
        return null;
    }

    const api = {
        BASE, EQUIPMENT_SLOTS, HP_PER_LEVEL, OVERWEIGHT_FACTOR, OVERWEIGHT_HARD_CAP, EFFECT_KEYS,
        num, collectBonuses, carriedWeight, computeStats, overweightMultiplier,
        isConsumable, isEquippable, equipSlot, applyEffects, findUsableLight
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api; // szerver (Node.js)
    if (typeof window !== 'undefined') window.SurvivalStats = api;             // böngésző
})(this);
