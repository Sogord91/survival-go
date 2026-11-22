// shelter.js
// MENEDÉK (v0.1.12) – közös szabályok a kliensnek és a szervernek (mint az items.js és a buildings.js).
// - Egy játékosnak egy menedéke lehet: egy valódi épület a térképen. Mindenki látja.
// - A raktár tartalma a halál után is megmarad.
// - Az építmények szintenként fejleszthetők; egyszerre egy építkezés fut, valódi időben.
// - A betörés (raid) a PvP frissítéssel jön: csak szombaton és vasárnap 11:00–18:00 között lesz lehetséges.
(function (root) {
    const RANGE_METERS = 45;            // ilyen közel kell lenni a menedékhez (30 m + 15 m GPS-tűrés, mint a lootnál)
    const MOVE_COOLDOWN_DAYS = 7;       // ennyi időnként lehet máshová költözni
    const CLAIM_ITEM = 'shelter_kit';   // az elfoglaláshoz (és költözéshez) elfogy egy Menedékalapító Csomag
    const STASH_SLOTS = [70, 95, 120];  // a raktár mérete szintenként (0 = alap)
    const BED_REST_MULTIPLIER = 3;      // a fekhely mellett ennyiszer gyorsabban pihensz
    const RAID_WINDOW = { days: [6, 0], fromHour: 11, toHour: 18 }; // szombat, vasárnap 11–18 (a PvP-vel lép életbe)

    // Építmények. levels[0] = nincs megépítve; minden szint: név, alapanyag, építési idő (perc), szerkezeti pont,
    // és hogy melyik másik építmény milyen szintje kell hozzá (requires).
    const STRUCTURES = {
        wall: {
            name: 'Falak', tab: 'defense', icon: '🧱',
            levels: [
                { name: 'Nincs fal' },
                { name: 'Fa barakk', desc: 'Deszkafalak, deszkaajtó', req: { wall_planks: 6, timber_beam: 4, plank_door: 1, nails: 10 }, minutes: 30, hp: 300, img: 'SURV-1913_wall_plank_bundle' },
                { name: 'Fém falak', desc: 'Hullámlemez falak, megerősített ajtó', req: { corrugated_wall_panel: 6, timber_beam: 2, reinforced_door: 1, rusty_bolts: 10 }, minutes: 240, hp: 800, img: 'SURV-1962_corrugated_metal_wall_panel', requires: { wall: 1 } }
            ]
        },
        barricade: {
            name: 'Barikád', tab: 'defense', icon: '🪵',
            levels: [
                { name: 'Nincs barikád' },
                { name: 'Fa barikád', desc: 'Karók, deszkázott ablakok', req: { palisade_stake: 4, plywood_panel: 2, storm_shutter: 2 }, minutes: 20, hp: 150, img: 'SURV-1918_palisade_stake', requires: { wall: 1 } },
                { name: 'Fém barikád', desc: 'Lemezelt ablakok, szögesdrót', req: { corrugated_sheet: 4, iron_sheet: 2, barbed_wire: 1 }, minutes: 120, hp: 300, img: 'SURV-1939_corrugated_metal_roofing', requires: { wall: 2 } }
            ]
        },
        stash: {
            name: 'Raktár', tab: 'stash', icon: '📦',
            levels: [
                { name: 'Raktár (70 hely)' },
                { name: 'Ládákkal bővített raktár (95 hely)', desc: '+25 hely', req: { supply_crate: 1, nails: 5 }, minutes: 30, img: 'SURV-2201_wooden_supply_crate' },
                { name: 'Vasalt ládás raktár (120 hely)', desc: '+25 hely', req: { iron_banded_chest: 1, hinge_latch: 1 }, minutes: 120, img: 'SURV-2202_iron_banded_chest' }
            ]
        },
        bed: {
            name: 'Fekhely', tab: 'stations', icon: '🛏',
            levels: [
                { name: 'Nincs fekhely' },
                { name: 'Fekhely', desc: `Mellette ${BED_REST_MULTIPLIER}× gyorsabban pihensz`, req: { wall_planks: 2, rag: 6 }, minutes: 20 }
            ]
        },
        hearth: {
            name: 'Tűzhely', tab: 'stations', icon: '🔥',
            levels: [
                { name: 'Nincs tűzhely' },
                { name: 'Tábori tűzhely', desc: 'A menedéknél főzhetsz és forralhatsz gyufa nélkül', req: { iron_chain: 1, pipe: 1, iron_sheet: 1 }, minutes: 20, img: 'SURV-2341_camp_cooking_hearth' }
            ]
        }
    };
    const STRUCTURE_KEYS = Object.keys(STRUCTURES);

    function maxLevel(key) { return STRUCTURES[key] ? STRUCTURES[key].levels.length - 1 : 0; }

    // A menedék aktuális állapota: a lejárt építkezés beszámítva (nem módosítja a bemenetet)
    function settle(shelter, now) {
        if (!shelter) return null;
        const s = { ...shelter, levels: { ...(shelter.levels || {}) } };
        if (s.build && s.build.until <= now) {
            s.levels[s.build.key] = Math.max(s.levels[s.build.key] || 0, s.build.level);
            s.build = null;
        }
        return s;
    }

    function level(shelter, key) { return (shelter && shelter.levels && shelter.levels[key]) || 0; }
    function stashSlots(shelter) { return STASH_SLOTS[Math.min(level(shelter, 'stash'), STASH_SLOTS.length - 1)]; }
    // Szerkezeti pont: a fal és a barikád együtt (a PvP-ben ezt kell lebontani)
    function structureHp(shelter) {
        const w = STRUCTURES.wall.levels[level(shelter, 'wall')].hp || 0;
        const b = STRUCTURES.barricade.levels[level(shelter, 'barricade')].hp || 0;
        return w + b;
    }

    // Megépíthető-e a következő szint (alapanyag nélkül): null = igen, különben az ok
    function buildBlocker(shelter, key, now) {
        const def = STRUCTURES[key];
        if (!def) return 'Ismeretlen építmény.';
        if (shelter.build && shelter.build.until > now) return 'Már folyik egy építkezés. Várd meg, amíg elkészül!';
        const next = level(shelter, key) + 1;
        if (next > maxLevel(key)) return 'Ez már a legmagasabb szint.';
        const reqs = def.levels[next].requires || {};
        for (const k of Object.keys(reqs)) {
            if (level(shelter, k) < reqs[k]) return `Előbb kell: ${STRUCTURES[k].levels[reqs[k]].name}.`;
        }
        return null;
    }

    // Raid-idő (a PvP-vel lép életbe): helyi idő szerint
    function isRaidTime(date) {
        const d = date || new Date();
        return RAID_WINDOW.days.includes(d.getDay()) && d.getHours() >= RAID_WINDOW.fromHour && d.getHours() < RAID_WINDOW.toHour;
    }

    const api = { RANGE_METERS, MOVE_COOLDOWN_DAYS, CLAIM_ITEM, STASH_SLOTS, BED_REST_MULTIPLIER, RAID_WINDOW, STRUCTURES, STRUCTURE_KEYS,
        maxLevel, settle, level, stashSlots, structureHp, buildBlocker, isRaidTime };

    if (typeof module !== 'undefined' && module.exports) module.exports = api; // szerver (Node.js)
    if (typeof window !== 'undefined') window.SurvivalShelter = api;          // böngésző
})(this);
