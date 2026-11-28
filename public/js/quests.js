// quests.js
// NAPI ÉS HETI KÜLDETÉSEK (v0.1.20): a küldetések kb. 70%-a mozgásra ösztönöz (séta, új területek, távoli épületek).
// Közös a kliensnek (leírás, megjelenítés) és a szervernek (sorsolás, haladás, jutalom).
// A sorsolás a játékos nevéből és a napból/hétből determinisztikus, így újraindítás után is ugyanaz marad.
(function (root) {
    const TIME_ZONE = 'Europe/Budapest';
    const CELL_LAT = 0.0045, CELL_LNG = 0.0065; // kb. 500 × 490 m-es területek (felfedezés, otthoni környék)
    const CELLS_MAX = 4000;                     // ennyi bejárt területet jegyzünk meg (a legrégebbi esik ki)
    const EXPLORE_XP = 10, EXPLORE_XP_DAILY_MAX = 20; // felfedező bónusz: új terület = +10 XP (naponta max. 20 terület)
    const SPREAD_METERS = 300;                  // "szétszórt" kutatás: az épületek legalább ennyire legyenek egymástól
    const TREE_FAR_METERS = 2000;               // decemberben: másik település fája (ennyire az otthonodtól)
    const DAILY_MOVE = 2, DAILY_HOME = 1, WEEKLY_MOVE = 3, WEEKLY_HOME = 1; // 5 / 7 = 71% mozgás

    // Nevezetes épülettípusok (a "keress fel egy ..." küldetéshez)
    const LANDMARKS = {
        church:  { name: 'templomot vagy kápolnát', types: ['Templom / Kápolna', 'Kolostor / Apátság'] },
        school:  { name: 'iskolát vagy óvodát', types: ['Iskola / Óvoda'] },
        sport:   { name: 'sportlétesítményt (csarnok, pálya, uszoda)', types: ['Sportcsarnok / Edzőterem', 'Stadion / Futballpálya', 'Strand / Uszoda'] },
        culture: { name: 'kulturális helyet (könyvtár, múzeum, mozi, művház)', types: ['Könyvtár', 'Múzeum / Kiállítóterem', 'Mozi / Színház / Művelődési Ház'] },
        health:  { name: 'gyógyszertárat vagy kórházat', types: ['Gyógyszertár', 'Kórház'] },
        transit: { name: 'vasútállomást, postát vagy benzinkutat', types: ['Vasútállomás / Rendezőpályaudvar', 'Posta / Csomagátvevő pont', 'Benzinkút / Kút'] },
        town:    { name: 'városházát, bíróságot vagy szállodát', types: ['Városháza / Polgármesteri Hivatal', 'Bíróság / Ügyvédi Iroda', 'Szálloda / Hotel / Panzió'] }
    };

    // Küldetéstípusok. targets: a szint szerinti nehézség (1–9 / 10–24 / 25+).
    const DEFS = {
        // --- napi, mozgásos ---
        walk:      { scope: 'daily', move: true, icon: '🚶', targets: [2000, 3000, 5000], xp: 60, money: 40,
                     title: (q) => `Sétálj ${km(q.target)} km-t`, hint: 'Csak a gyalog (15 km/h alatt) megtett út számít.' },
        explore:   { scope: 'daily', move: true, icon: '🗺️', targets: [3, 4, 5], xp: 60, money: 40,
                     title: (q) => `Fedezz fel ${q.target} új területet`, hint: 'A térkép kb. 500 méteres területekre oszlik. Olyan helyre menj, ahol még sosem jártál a játékkal.' },
        far_loot:  { scope: 'daily', move: true, icon: '📍', targets: [1, 1, 2], dist: [1000, 1000, 1500], xp: 70, money: 50,
                     title: (q) => `Kutass át ${q.target > 1 ? q.target + ' épületet' : 'egy épületet'} legalább ${km(q.dist)} km-re otthonról`, hint: 'Otthon: a menedéked, vagy ahol a legtöbbet kutatsz.' },
        landmark:  { scope: 'daily', move: true, icon: '🏛️', targets: [1, 1, 1], xp: 60, money: 40,
                     title: (q) => `Kutass át egy ${(LANDMARKS[q.group] || LANDMARKS.church).name}`, hint: 'Ha nincs ilyen a környékeden, cseréld le a küldetést (naponta egyszer lehet).' },
        spread:    { scope: 'daily', move: true, icon: '🔍', targets: [3, 4, 5], xp: 60, money: 40,
                     title: (q) => `Kutass át ${q.target} épületet, egymástól legalább ${SPREAD_METERS} m-re`, hint: 'Ne ugyanabban az utcában: minden épület legyen messze az előzőktől.' },
        night:     { scope: 'daily', move: true, icon: '🌙', targets: [800, 1200, 2000], xp: 70, money: 50,
                     title: (q) => `Éjszakai őrjárat: sétálj ${km(q.target)} km-t sötétben`, hint: 'Napnyugta után. Vigyázz magadra: kivilágított utcán, ismerős helyen sétálj!' },
        d_loot:    { scope: 'daily', move: true, icon: '🏚️', targets: [5, 8, 12], xp: 60, money: 40,
                     title: (q) => `Kutass át ${q.target} épületet`, hint: 'Bármilyen épület számít, ahol még nem kutattál a zárolási időn belül.' },
        d_types:   { scope: 'daily', move: true, icon: '🧩', targets: [3, 4, 5], xp: 60, money: 40,
                     title: (q) => `Kutass át ${q.target} különböző fajta épületet`, hint: 'Például ház, bolt, garázs, iskola – mindegyik fajta egyszer számít.' },
        // --- FAGYOS CSEND (decemberi) küldetések: need = melyik esemény kell hozzá ---
        tree_far:  { scope: 'daily', move: true, icon: '🎄', targets: [1, 1, 1], need: 'trees', xp: 70, money: 50,
                     title: () => 'Akassz díszt egy másik település fájára', hint: `A fa legalább ${km(TREE_FAR_METERS)} km-re legyen az otthonodtól.` },
        d_hang:    { scope: 'daily', move: true, icon: '🎄', targets: [1, 2, 3], need: 'trees', xp: 60, money: 40,
                     title: (q) => `Akassz fel ${q.target > 1 ? q.target + ' díszt' : 'egy díszt'} egy karácsonyfára`, hint: 'Minden településen áll egy fa a térképen; 60 méteren belülről díszítheted.' },
        d_gift:    { scope: 'daily', move: true, icon: '🎁', targets: [2, 3, 4], need: 'gifts', xp: 70, money: 50,
                     title: (q) => `Nyiss ki ${q.target} ajándékcsomagot`, hint: 'Hétvégén 9 és 19 óra között az utcákon, a közeledben.' },
        d_advent:  { scope: 'daily', move: false, icon: '🗓️', targets: [1, 1, 1], need: 'advent', xp: 30, money: 20,
                     title: () => 'Nyisd ki a mai adventi ablakot', hint: 'A Küldetés gomb alatt, az adventi naptárban.' },
        d_orn:     { scope: 'daily', move: false, icon: '🪩', targets: [1, 1, 2], need: 'trees', xp: 40, money: 25,
                     title: (q) => `Barkácsolj ${q.target > 1 ? q.target + ' karácsonyi díszt' : 'egy karácsonyi díszt'}`, hint: 'Barkács → Karácsony.' },
        // --- vadászat, horgászat (v0.1.43) ---
        d_hunt:    { scope: 'daily', move: true, icon: '🏹', targets: [1, 2, 3], xp: 70, money: 45,
                     title: (q) => `Ejts el ${q.target > 1 ? q.target + ' állatot' : 'egy állatot'}`, hint: 'Erdők, mezők, parkok közelében bukkannak fel a térképen. Koppints rá, ha elég közel vagy.' },
        d_fish:    { scope: 'daily', move: true, icon: '🪝', targets: [1, 2, 3], xp: 70, money: 45,
                     title: (q) => `Fogj ${q.target > 1 ? q.target + ' halat' : 'egy halat'}`, hint: 'A térképen horog jelzi a legközelebbi vízpartot. Horgászbot és csali kell.' },
        d_skin:    { scope: 'daily', move: false, icon: '🔪', targets: [1, 1, 2], xp: 40, money: 25,
                     title: (q) => `Nyúzz meg ${q.target > 1 ? q.target + ' tetemet' : 'egy tetemet'}`, hint: 'Koppints a tetemre a Készletben → Megnyúzom (kés kell).' },
        // --- napi, otthon is megy ---
        craft:     { scope: 'daily', move: false, icon: '🔨', targets: [2, 3, 4], xp: 40, money: 25,
                     title: (q) => `Barkácsolj ${q.target} tárgyat`, hint: 'Bármelyik recept számít.' },
        use:       { scope: 'daily', move: false, icon: '🥫', targets: [3, 4, 5], xp: 40, money: 25,
                     title: (q) => `Használj el ${q.target} ételt, italt vagy kötszert`, hint: 'Készlet → koppints a tárgyra → Használ.' },
        d_fgift:   { scope: 'daily', move: false, icon: '🎁', targets: [1, 1, 2], xp: 40, money: 25,
                     title: (q) => `Küldj ajándékot ${q.target > 1 ? q.target + ' barátodnak' : 'egy barátodnak'}`, hint: 'Avatar → Barátok → a barátod mellett az AJÁNDÉK gomb. Ha még nincs barátod, hívj meg valakit!' },
        repair:    { scope: 'daily', move: false, icon: '🔧', targets: [1, 1, 2], xp: 40, money: 25,
                     title: (q) => `Javíts meg ${q.target > 1 ? q.target + ' tárgyat' : 'egy tárgyat'}`, hint: 'Koppints egy kopott tárgyra → Javítás (szerszám és ragasztószalag kell hozzá).' },
        stash:     { scope: 'daily', move: false, icon: '📦', targets: [3, 5, 8], xp: 40, money: 25,
                     title: (q) => `Tegyél ${q.target} tárgyat a menedéked raktárába`, hint: 'Ha még nincs menedéked: nyomd hosszan egy épületet a térképen.' },
        d_share:   { scope: 'daily', move: false, icon: '📸', targets: [1, 1, 1], xp: 40, money: 25,
                     title: () => 'Ossz meg egy képet a játékból', hint: 'Avatar → Barátok → Megosztás: Facebookra, Instagramra, TikTokra, Discordra vagy bárhova.' },
        win:       { scope: 'daily', move: false, icon: '⚔️', targets: [1, 2, 3], xp: 40, money: 25,
                     title: (q) => `Győzz le ${q.target} ellenséget`, hint: 'Az épületekben néha ellenség vár.' },
        // --- heti, mozgásos ---
        w_walk:    { scope: 'weekly', move: true, icon: '🥾', targets: [10000, 15000, 25000], xp: 250, money: 150,
                     title: (q) => `Sétálj ${km(q.target)} km-t a héten`, hint: 'Csak a gyalog megtett út számít.' },
        w_explore: { scope: 'weekly', move: true, icon: '🧭', targets: [15, 20, 30], xp: 250, money: 150,
                     title: (q) => `Fedezz fel ${q.target} új területet a héten`, hint: 'Minden olyan 500 méteres terület számít, ahol még sosem jártál.' },
        w_towns:   { scope: 'weekly', move: true, icon: '🏘️', targets: [2, 3, 4], xp: 250, money: 150,
                     title: (q) => `Járj ${q.target} különböző településen vagy városrészben`, hint: 'A legközelebbi település vagy városrész számít, ahol éppen sétálsz.' },
        w_far:     { scope: 'weekly', move: true, icon: '🚩', targets: [4, 5, 6], dist: [1500, 1500, 2000], xp: 250, money: 150,
                     title: (q) => `Kutass át ${q.target} épületet legalább ${km(q.dist)} km-re otthonról`, hint: 'Otthon: a menedéked, vagy ahol a legtöbbet kutatsz.' },
        w_loot:    { scope: 'weekly', move: true, icon: '🏚️', targets: [25, 40, 60], xp: 250, money: 150,
                     title: (q) => `Kutass át ${q.target} épületet a héten`, hint: 'Bármilyen épület számít.' },
        w_night:   { scope: 'weekly', move: true, icon: '🌙', targets: [4000, 6000, 9000], xp: 250, money: 150,
                     title: (q) => `Sétálj ${km(q.target)} km-t sötétben a héten`, hint: 'Napnyugta után, kivilágított, ismerős helyen.' },
        w_marks:   { scope: 'weekly', move: true, icon: '🏛️', targets: [3, 4, 5], xp: 250, money: 150,
                     title: (q) => `Kutass át ${q.target} különböző fajta nevezetes helyet a héten`, hint: 'Templom, iskola, sportpálya, könyvtár/múzeum, gyógyszertár, állomás, városháza – fajtánként egy számít.' },
        w_hang:    { scope: 'weekly', move: true, icon: '🎄', targets: [5, 8, 12], need: 'trees', xp: 250, money: 150,
                     title: (q) => `Akassz fel ${q.target} díszt a héten`, hint: 'Bármelyik település fájára; a messzebbi fák is számítanak.' },
        w_gift:    { scope: 'weekly', move: true, icon: '🎁', targets: [4, 6, 8], need: 'giftWeek', xp: 250, money: 150,
                     title: (q) => `Nyiss ki ${q.target} ajándékcsomagot a héten`, hint: 'Szombaton és vasárnap 9 és 19 óra között az utcákon.' },
        w_hunt:    { scope: 'weekly', move: true, icon: '🏹', targets: [4, 6, 8], xp: 250, money: 150,
                     title: (q) => `Ejts el ${q.target} állatot a héten`, hint: 'Nyúl, fácán, róka, őz, vaddisznó, mutáns kopó – mind számít.' },
        w_fish:    { scope: 'weekly', move: true, icon: '🐟', targets: [5, 8, 12], xp: 250, money: 150,
                     title: (q) => `Fogj ${q.target} halat a héten`, hint: 'Kárász, ponty, csuka, harcsa – a csizma nem számít.' },
        w_trophy:  { scope: 'weekly', move: true, icon: '🦌', targets: [1, 1, 2], xp: 250, money: 150,
                     title: (q) => `Szerezz ${q.target > 1 ? q.target + ' trófeát' : 'egy trófeát'} a héten`, hint: 'Róka, őz, vaddisznó vagy mutáns kopó nyúzásakor eshet.' },
        // --- heti, otthon is megy ---
        w_dsets:   { scope: 'weekly', move: false, icon: '📅', targets: [4, 5, 6], xp: 200, money: 120,
                     title: (q) => `Teljesítsd mind a 3 napi küldetést ${q.target} napon a héten`, hint: 'Minden nap, amikor mindhárom napi küldetés kész, egynek számít.' },
        w_fgift:   { scope: 'weekly', move: false, icon: '🎁', targets: [5, 7, 10], xp: 150, money: 100,
                     title: (q) => `Küldj ${q.target} ajándékot a barátaidnak a héten`, hint: 'Avatar → Barátok → AJÁNDÉK.' },
        w_craft:   { scope: 'weekly', move: false, icon: '🛠️', targets: [10, 15, 20], xp: 150, money: 100,
                     title: (q) => `Barkácsolj ${q.target} tárgyat a héten`, hint: 'Bármelyik recept számít.' },
        w_win:     { scope: 'weekly', move: false, icon: '🗡️', targets: [6, 8, 10], xp: 150, money: 100,
                     title: (q) => `Győzz le ${q.target} ellenséget a héten`, hint: 'Az épületekben néha ellenség vár.' }
    };
    const DAILY_BONUS = { xp: 100, money: 50 };   // mind a 3 napi kész
    const WEEKLY_BONUS = { xp: 500, money: 300 }; // mind a 4 heti kész

    function km(m) { return String(Math.round(m / 100) / 10).replace('.', ','); }
    function tierOf(level) { return level >= 25 ? 2 : level >= 10 ? 1 : 0; }

    // --- naptár (magyar idő) ---
    function dayKey(ms) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    }
    function weekKey(ms) { // a hét hétfője, 'ÉÉÉÉ-HH-NN'
        const [y, m, d] = dayKey(ms).split('-').map(Number);
        const t = new Date(Date.UTC(y, m - 1, d));
        const dow = (t.getUTCDay() + 6) % 7; // hétfő = 0
        return new Date(t.getTime() - dow * 86400000).toISOString().slice(0, 10);
    }

    // --- determinisztikus véletlen ---
    function hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function pickN(list, n, rand) {
        const pool = list.slice(), out = [];
        while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
        return out;
    }

    function makeQuest(kind, level, rand) {
        const def = DEFS[kind], tier = tierOf(level);
        const q = { kind, target: def.targets[tier], progress: 0, done: false };
        if (def.dist) q.dist = def.dist[tier];
        if (kind === 'landmark') { const keys = Object.keys(LANDMARKS); q.group = keys[Math.floor(rand() * keys.length)]; }
        return q;
    }
    // opts: { trees, advent, gifts, giftWeek } – melyik decemberi esemény zajlik (régi: { winter } = trees)
    const has = (opts, need) => !need || !!(opts && (opts[need] || (need === 'trees' && opts.winter)));
    function kindsFor(scope, move, opts, eventOnly) {
        return Object.keys(DEFS).filter(k => DEFS[k].scope === scope && DEFS[k].move === move && has(opts, DEFS[k].need) && (eventOnly === undefined || !!DEFS[k].need === eventOnly));
    }
    // Esemény alatt: a mozgásosak közül 1 mindig eseményes (fa, ajándék), az otthoni fele eséllyel az (advent, dísz, kerék)
    function pickSlots(scope, moveN, homeN, opts, rand) {
        const evMove = kindsFor(scope, true, opts, true), evHome = kindsFor(scope, false, opts, true);
        let move = [], home = [];
        if (evMove.length) move = pickN(evMove, 1, rand);
        move = move.concat(pickN(kindsFor(scope, true, opts, false), moveN - move.length, rand));
        if (evHome.length && rand() < 0.5) home = pickN(evHome, homeN, rand);
        else home = pickN(kindsFor(scope, false, opts, false), homeN, rand);
        return move.concat(home);
    }
    function generateDaily(username, level, day, opts) {
        const rand = rng(hash(username + '|d|' + day));
        return pickSlots('daily', DAILY_MOVE, DAILY_HOME, opts, rand).map(k => makeQuest(k, level, rand));
    }
    function generateWeekly(username, level, week, opts) {
        const rand = rng(hash(username + '|w|' + week));
        return pickSlots('weekly', WEEKLY_MOVE, WEEKLY_HOME, opts, rand).map(k => makeQuest(k, level, rand));
    }

    // Napváltáskor / hétváltáskor új küldetések. A tartós részek (bejárt területek, kutatási helyek) megmaradnak.
    function refresh(q, username, level, now, opts) {
        q = q && typeof q === 'object' ? q : {};
        const out = {
            day: q.day || null, daily: Array.isArray(q.daily) ? q.daily : [], rerolled: !!q.rerolled, dailyBonus: !!q.dailyBonus,
            spread: Array.isArray(q.spread) ? q.spread : [], exploreXp: q.exploreXp || 0, types: Array.isArray(q.types) ? q.types : [], marks: Array.isArray(q.marks) ? q.marks : [],
            week: q.week || null, weekly: Array.isArray(q.weekly) ? q.weekly : [], weeklyBonus: !!q.weeklyBonus, towns: Array.isArray(q.towns) ? q.towns : [],
            cells: Array.isArray(q.cells) ? q.cells : [], lootCells: q.lootCells && typeof q.lootCells === 'object' ? q.lootCells : {}
        };
        const day = dayKey(now), week = weekKey(now);
        if (out.day !== day) Object.assign(out, { day, daily: generateDaily(username, level, day, opts), rerolled: false, dailyBonus: false, spread: [], exploreXp: 0, types: [] });
        if (out.week !== week) Object.assign(out, { week, weekly: generateWeekly(username, level, week, opts), weeklyBonus: false, towns: [], marks: [] });
        return out;
    }

    // Napi küldetés cseréje (naponta 1×, kész küldetést nem lehet)
    function reroll(q, index, username, level, opts) {
        const cur = q.daily[index];
        if (!cur) return { error: 'Nincs ilyen küldetés.' };
        if (cur.done) return { error: 'A kész küldetést már nem kell cserélni.' };
        if (q.rerolled) return { error: 'Ma már cseréltél küldetést. Holnap újra lehet.' };
        const rand = rng(hash(username + '|r|' + q.day + '|' + index));
        const taken = q.daily.map(x => x.kind);
        const pool = kindsFor('daily', DEFS[cur.kind].move, opts).filter(k => !taken.includes(k) || (k === 'landmark' && cur.kind === 'landmark'));
        if (!pool.length) return { error: 'Most nincs másik küldetés.' };
        let next = makeQuest(pool[Math.floor(rand() * pool.length)], level, rand);
        if (next.kind === 'landmark' && cur.kind === 'landmark' && next.group === cur.group) {
            const keys = Object.keys(LANDMARKS).filter(k => k !== cur.group);
            next.group = keys[Math.floor(rand() * keys.length)];
        }
        q.daily[index] = next;
        q.rerolled = true;
        return { quest: next };
    }

    // --- földrajz ---
    function cellOf(lat, lng) { return Math.floor(lat / CELL_LAT) + ':' + Math.floor(lng / CELL_LNG); }
    function cellCenter(id) { const [a, b] = id.split(':').map(Number); return { lat: (a + 0.5) * CELL_LAT, lng: (b + 0.5) * CELL_LNG }; }
    function dist(a, b) {
        const R = 6371000, toRad = (x) => x * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    }
    // Otthon: a menedék, ha van; különben a terület, ahol a legtöbbet kutatott
    function homeOf(q, shelter) {
        if (shelter && typeof shelter.lat === 'number') return { lat: shelter.lat, lng: shelter.lng };
        const cells = Object.entries((q && q.lootCells) || {});
        if (!cells.length) return null;
        cells.sort((x, y) => y[1] - x[1]);
        return cellCenter(cells[0][0]);
    }

    // Egy esemény hatása. Visszaadja a most teljesült küldetéseket és a bónuszokat.
    // kind: 'move' {meters, lat, lng} | 'loot' {lat, lng, type, home} | 'town' {name} | 'craft' {count} | 'use' | 'win' | 'tree' {lat, lng, home}
    function event(q, kind, data, now) {
        data = data || {};
        const res = { completed: [], bonus: [], newCell: false, exploreXp: 0 };
        const bump = (quest, amount) => {
            if (quest.done) return;
            quest.progress = Math.min(quest.target, quest.progress + amount);
            if (quest.progress >= quest.target) { quest.done = true; res.completed.push(quest); }
        };
        const all = q.daily.concat(q.weekly);
        const of = (...kinds) => all.filter(x => kinds.includes(x.kind));

        if (kind === 'move') {
            const m = Math.max(0, Number(data.meters) || 0);
            of('walk', 'w_walk').forEach(x => bump(x, m));
            if (data.night) of('night', 'w_night').forEach(x => bump(x, m));
            if (typeof data.lat === 'number') {
                const cell = cellOf(data.lat, data.lng);
                if (!q.cells.includes(cell)) {
                    q.cells.push(cell);
                    if (q.cells.length > CELLS_MAX) q.cells.splice(0, q.cells.length - CELLS_MAX);
                    res.newCell = true;
                    of('explore', 'w_explore').forEach(x => bump(x, 1));
                    if (q.exploreXp < EXPLORE_XP_DAILY_MAX) { q.exploreXp += 1; res.exploreXp = EXPLORE_XP; }
                }
            }
        } else if (kind === 'loot') {
            const here = { lat: data.lat, lng: data.lng };
            const away = data.home ? dist(data.home, here) : 0;
            of('far_loot', 'w_far').forEach(x => { if (data.home && away >= x.dist) bump(x, 1); });
            of('landmark').forEach(x => { if ((LANDMARKS[x.group] || { types: [] }).types.includes(data.type)) bump(x, 1); });
            of('d_loot', 'w_loot').forEach(x => bump(x, 1));
            if (data.type && !q.types.includes(data.type)) { q.types.push(data.type); if (q.types.length > 40) q.types.shift(); of('d_types').forEach(x => bump(x, 1)); }
            const grp = Object.keys(LANDMARKS).find(g => LANDMARKS[g].types.includes(data.type));
            if (grp && !q.marks.includes(grp)) { q.marks.push(grp); of('w_marks').forEach(x => bump(x, 1)); }
            if (!q.spread.some(p => dist({ lat: p[0], lng: p[1] }, here) < SPREAD_METERS)) {
                q.spread.push([here.lat, here.lng]);
                if (q.spread.length > 20) q.spread.shift();
                of('spread').forEach(x => bump(x, 1));
            }
            // otthoni környék: hol kutat a legtöbbet (a legkisebb esik ki, ha sok a terület)
            const cell = cellOf(here.lat, here.lng);
            q.lootCells[cell] = (q.lootCells[cell] || 0) + 1;
            const keys = Object.keys(q.lootCells);
            if (keys.length > 40) { keys.sort((a, b) => q.lootCells[a] - q.lootCells[b]); delete q.lootCells[keys[0]]; }
        } else if (kind === 'town') {
            const name = String(data.name || '').slice(0, 60);
            if (name && !q.towns.includes(name)) { q.towns.push(name); of('w_towns').forEach(x => bump(x, 1)); }
        } else if (kind === 'craft') {
            of('craft', 'w_craft').forEach(x => bump(x, Math.max(1, Number(data.count) || 1)));
            if (data.ornament) of('d_orn').forEach(x => bump(x, Math.max(1, Number(data.count) || 1)));
        } else if (kind === 'fgift') {
            of('d_fgift', 'w_fgift').forEach(x => bump(x, 1));
        } else if (kind === 'repair') {
            of('repair').forEach(x => bump(x, 1));
        } else if (kind === 'stash') {
            of('stash').forEach(x => bump(x, Math.max(1, Number(data.count) || 1)));
        } else if (kind === 'share') {
            of('d_share').forEach(x => bump(x, 1));
        } else if (kind === 'advent') {
            of('d_advent').forEach(x => bump(x, 1));
        } else if (kind === 'gift') {
            of('d_gift', 'w_gift').forEach(x => bump(x, 1));

        } else if (kind === 'use') {
            of('use').forEach(x => bump(x, 1));
        } else if (kind === 'win') {
            of('win', 'w_win').forEach(x => bump(x, 1));
        } else if (kind === 'hunt') {
            of('d_hunt', 'w_hunt').forEach(x => bump(x, 1));
        } else if (kind === 'fish') {
            of('d_fish', 'w_fish').forEach(x => bump(x, Math.max(1, Number(data.count) || 1)));
        } else if (kind === 'skin') {
            of('d_skin').forEach(x => bump(x, 1));
            if (data.trophy) of('w_trophy').forEach(x => bump(x, 1));
        } else if (kind === 'tree') {
            of('d_hang', 'w_hang').forEach(x => bump(x, Math.max(1, Number(data.count) || 1)));
            if (data.home && dist(data.home, { lat: data.lat, lng: data.lng }) >= TREE_FAR_METERS) of('tree_far').forEach(x => bump(x, 1));
        }

        if (res.completed.length) {
            if (!q.dailyBonus && q.daily.length && q.daily.every(x => x.done)) {
                q.dailyBonus = true; res.bonus.push({ scope: 'daily', ...DAILY_BONUS });
                of('w_dsets').forEach(x => { if (!x.done) { x.progress = Math.min(x.target, x.progress + 1); if (x.progress >= x.target) { x.done = true; res.completed.push(x); } } });
            }
            if (!q.weeklyBonus && q.weekly.length && q.weekly.every(x => x.done)) { q.weeklyBonus = true; res.bonus.push({ scope: 'weekly', ...WEEKLY_BONUS }); }
        }
        return res;
    }

    function rewardOf(quest) { const d = DEFS[quest.kind] || {}; return { xp: d.xp || 0, money: d.money || 0 }; }
    function describe(quest) {
        const d = DEFS[quest.kind];
        if (!d) return { icon: '❔', title: quest.kind, hint: '', move: false };
        return { icon: d.icon, title: d.title(quest), hint: d.hint, move: d.move, need: d.need, ...rewardOf(quest) };
    }
    // A kliensnek elég ennyi (a bejárt területek listája nem kell neki)
    function publicView(q) {
        if (!q) return null;
        return { day: q.day, week: q.week, daily: q.daily, weekly: q.weekly, rerolled: q.rerolled, dailyBonus: q.dailyBonus, weeklyBonus: q.weeklyBonus,
            towns: q.towns, explored: (q.cells || []).length };
    }
    function progressText(quest) {
        if (quest.kind === 'walk' || quest.kind === 'w_walk') return `${km(quest.progress)} / ${km(quest.target)} km`;
        return `${quest.progress} / ${quest.target}`;
    }

    const api = { DEFS, LANDMARKS, DAILY_BONUS, WEEKLY_BONUS, EXPLORE_XP, EXPLORE_XP_DAILY_MAX, SPREAD_METERS, TREE_FAR_METERS, CELL_LAT, CELL_LNG,
        dayKey, weekKey, tierOf, cellOf, cellCenter, dist, homeOf, generateDaily, generateWeekly, refresh, reroll, event, rewardOf, describe, publicView, progressText, km };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalQuests = api;
})(this);
