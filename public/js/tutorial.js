// tutorial.js
// ELSŐ LÉPÉSEK (v0.1.11): az új túlélők bevezető küldetéssora. Közös a kliensnek és a szervernek.
// A szerver pipálja ki a lépéseket a valódi műveleteknél (átkutatás, evés, felszerelés...), és adja a jutalmat.
(function (root) {
    const WALK_METERS = 100;
    const STEPS = [
        { key: 'walk', title: 'Sétálj 100 métert a valóságban', hint: 'Nincs joystick: a karaktered csak akkor mozog, ha TE magad sétálsz a telefonnal a kezedben. Indulj el az utcán, és figyeld, ahogy a jelölőd veled halad a térképen.', xp: 20 },
        { key: 'loot', title: 'Kutass át egy épületet', hint: 'Menj 30 méteren belülre egy épülethez a térképen, és koppints rá. Ha végzett a keresés, tedd el, amit találtál.', xp: 20 },
        { key: 'use', title: 'Egyél, igyál vagy kötözz', hint: 'Avatar → Készlet → koppints egy ételre, italra vagy kötszerre → Használ. Figyeld lent az étel és a víz csíkot!', xp: 20 },
        { key: 'pin', title: 'Tűzz ki valamit a gyorssávra', hint: 'Avatar → Készlet → koppints egy ételre vagy kötszerre → Gyorssávra. Így a térképről egy koppintással használhatod.', xp: 20 },
        { key: 'equip', title: 'Vegyél fel egy felszerelést', hint: 'Avatar → Készlet → koppints egy fegyverre, ruhára vagy táskára → Felvesz. A kés már nálad van!', xp: 20 },
        { key: 'craft', title: 'Barkácsolj valamit', hint: 'Barkács → válassz egy receptet, amihez minden megvan (zöld). Jó kezdés a rongykötés.', xp: 30 },
        { key: 'combat', title: 'Élj túl egy harcot', hint: 'Az épületekben néha ellenség vár. Harcolj, vagy menekülj el: mindkettő számít.', xp: 40 }
    ];
    // A végén ez jár (a "Jutalom átvétele" gombbal, ha elfér a hátizsákban)
    const FINAL_REWARD = [
        { key: 'water_bottle', count: 2 },
        { key: 'canned_food', count: 2 },
        { key: 'bandage', count: 2 },
        { key: 'matchbox', count: 1 }
    ];
    const FINAL_XP = 50;

    function doneCount(tutorial) {
        const done = (tutorial && tutorial.done) || {};
        return STEPS.filter(s => done[s.key]).length;
    }
    function allDone(tutorial) { return doneCount(tutorial) === STEPS.length; }

    const api = { STEPS, WALK_METERS, FINAL_REWARD, FINAL_XP, doneCount, allDone };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalTutorial = api;
})(this);
