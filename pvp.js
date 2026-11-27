// pvp.js
// TÁMADÁS (PvP, v0.1.26) – DayZ-szerű összecsapás két túlélő között.
// • Az 5. szinttől bárki megtámadhat bárkit a közelben (50 m), kivéve: csapattárs, stáb, safe zone, aki épp harcol.
// • Az első lövés ritkán talál (meglepetés helyett esély a reakcióra). Utána felváltva: lövés / gyógyítás / menekülés.
// • A megtámadott megadhatja magát: a támadó 3 tételt választ a hátizsákjából és viszi a pénze felét (a viselt cucc marad).
//   A támadó vissza is utasíthatja ("Nem kegyelmezek") – ekkor a megtámadott könnyebben menekül, a támadó tovább bandita.
// • Menekülés: nagy eséllyel sikerül, kis eséllyel még kap egy találatot. Utána 10 percig az a támadó nem támadhatja újra.
// • Aki elesik, újrakezd (mint a zombiknál); a hátizsákja és a felszerelése ZSÁKBAN a helyszínen marad 30 percig – bárki kifoszthatja.
// • A győztes XP-t és PvP-győzelmet kap (ranglista). A kezdeményező 30 percig BANDITA (piros jel a térképen).
// • Minden lövést hallanak a környéken (500 m): irány és távolság szerint.
// • Válaszidő: 20 mp; aki nem lép (zsebben a telefon, kilépett), helyette a játék lő vissza.
'use strict';
const crypto = require('crypto');

const R = {
    MIN_LEVEL: 5, RANGE: 100, ACTIVE_MS: 10 * 60000,
    OPEN_HIT: 0.22, HIT: 0.72, SHELTER_HIT: 0.15, SHELTER_WALL: 0.03,
    FLEE: 0.85, FLEE_REFUSED_BONUS: 0.15, FLEE_GRAZE: 0.25, GRAZE_MULT: 0.5,
    TURN_MS: 20000, PICK_MS: 30000, PICKS: 3, SURRENDER_MONEY: 0.5,
    FLEE_PROTECT_MS: 10 * 60000, PAIR_COOLDOWN_MS: 30 * 60000,
    BANDIT_MS: 30 * 60000, BAG_MS: 30 * 60000, BAG_RANGE: 30, HEAR: 500, HEAR_GAP_MS: 45000,
    DMG_MULT: 1, MAX_ROUNDS: 40
};

function makeModels() {
    const mongoose = require('mongoose');
    const Mixed = mongoose.Schema.Types.Mixed;
    const bag = new mongoose.Schema({ _id: String, lat: Number, lng: Number, owner: String, killer: String, items: Mixed, money: Number, t: Number, until: Number });
    const log = new mongoose.Schema({ _id: String, t: Number, a: String, d: String, result: String, winner: String, rounds: Number, lat: Number, lng: Number, items: Number });
    return {
        BagModel: mongoose.models.SurvivalBag || mongoose.model('SurvivalBag', bag),
        LogModel: mongoose.models.SurvivalPvpLog || mongoose.model('SurvivalPvpLog', log)
    };
}

function setup(ctx) {
    const { io, PlayerModel, activePlayers, Admin, itemDatabase, withPlayer, sendPlayerState, playerStats, grantXp, seasonAdd, pushItem, canAddItem,
        CombatEngine, SurvivalStats, Skills, haversine, distanceToBuilding, shelterRange, positionMaxAgeMs, notify, myTeamId } = ctx;
    const { BagModel, LogModel } = ctx.models || makeModels();
    const random = ctx.random || Math.random;
    const isStaff = (n) => (Admin.isStaffName ? Admin.isStaffName(n) : false);
    const SettingModel = Admin.models && Admin.models.SettingModel;
    let settings = { enabled: true, safeZones: [], squares: { on: true, r: 100 } };
    if (SettingModel) SettingModel.findById('pvp').lean().then(d => { if (d && d.value) settings = normSettings(d.value); }).catch(() => { });
    function normSettings(v) {
        const s = v && typeof v === 'object' ? v : {};
        return {
            enabled: s.enabled !== false,
            // v0.1.26.3: a települések főterei (ahol decemberben a karácsonyfák állnak) automatikusan biztonságos zónák
            squares: { on: !(s.squares && s.squares.on === false), r: Math.max(30, Math.min(500, Math.round(Number(s.squares && s.squares.r) || 100))) },
            safeZones: (Array.isArray(s.safeZones) ? s.safeZones : []).map(z => ({ name: String(z.name || 'Biztonságos zóna').slice(0, 40), lat: Number(z.lat), lng: Number(z.lng), r: Math.max(10, Math.min(1000, Number(z.r) || 75)) }))
                .filter(z => Number.isFinite(z.lat) && Number.isFinite(z.lng)).slice(0, 300)
        };
    }

    const fights = new Map();      // id -> harc
    const fightOf = new Map();     // név -> harc id
    const fleeProtect = new Map(); // "támadó>védő" -> eddig
    const pairCool = new Map();    // "a|b" -> eddig
    const heard = new Map();       // "hallgató|harc" -> utoljára
    const pairKey = (a, b) => [a, b].sort().join('|');
    const now = () => Date.now();
    const emitTo = (name, ev, data) => { const e = activePlayers[name]; if (e) io.to(e.socketId).emit(ev, data); };

    function banditUntil(name) { const e = activePlayers[name]; return (e && e.banditUntil) || 0; }
    async function setBandit(name, ms) {
        const until = Math.max(banditUntil(name), now()) + ms;
        if (activePlayers[name]) activePlayers[name].banditUntil = until;
        await PlayerModel.updateOne({ username: name }, { banditUntil: until });
        return until;
    }
    async function safeZoneAt(pos) {
        if (!pos || pos.lat === null || pos.lat === undefined) return null;
        const z = settings.safeZones.find(z => haversine(z.lat, z.lng, pos.lat, pos.lng) <= z.r);
        if (z) return z;
        if (settings.squares.on && ctx.squareAt) {
            try { const t = await ctx.squareAt(pos, settings.squares.r); if (t) return { name: `${t.name} főtere`, lat: t.lat, lng: t.lng, r: settings.squares.r }; } catch (e) { /* ha nem érhető el, nem védünk */ }
        }
        return null;
    }
    function freshPos(e) { return e && e.lat !== null && e.lat !== undefined && e.positionAt && now() - e.positionAt <= positionMaxAgeMs; }

    // ---------- támadás indítása ----------
    async function canAttack(a, d) {
        if (!settings.enabled) return { error: 'A támadás most ki van kapcsolva.' };
        if (a === d) return { error: 'Magadat nem támadhatod meg.' };
        const ea = activePlayers[a], ed = activePlayers[d];
        if (!ed) return { error: 'Ez a túlélő most nincs a Zónában.' };
        if (isStaff(d)) return { error: 'A stábot nem lehet megtámadni.' };
        if (isStaff(a)) return { error: 'Stábtagként nem támadhatsz játékost.' };
        if (fightOf.has(a)) return { error: 'Már harcban vagy!' };
        if (fightOf.has(d)) return { error: `${d} éppen harcol valakivel.` };
        if (!freshPos(ea)) return { error: 'Várd meg a friss GPS pozíciót!' };
        if (!freshPos(ed) || now() - (ed.lastMovedAt || 0) > R.ACTIVE_MS * 6) return { error: `${d} nincs a közelben.` };
        const dist = haversine(ea.lat, ea.lng, ed.lat, ed.lng);
        if (dist > R.RANGE) return { error: `Túl messze van (${Math.round(dist)} m). Legfeljebb ${R.RANGE} m-ről támadhatsz.` };
        const [za, zd] = await Promise.all([safeZoneAt(ea), safeZoneAt(ed)]);
        if (za || zd) return { error: `🛡️ Biztonságos zóna (${(za || zd).name}): itt nem lehet támadni.` };
        const fp = fleeProtect.get(a + '>' + d);
        if (fp && fp > now()) return { error: `${d} nemrég elmenekült előled. Még ${Math.ceil((fp - now()) / 60000)} percig nem támadhatod.` };
        const pc = pairCool.get(pairKey(a, d));
        if (pc && pc > now()) return { error: `Nemrég harcoltatok. Még ${Math.ceil((pc - now()) / 60000)} percig nem támadhatod.` };
        if (myTeamId) { const [ta, td] = await Promise.all([myTeamId(a), myTeamId(d)]); if (ta && ta === td) return { error: 'A csapattársadat nem támadhatod meg.' }; }
        const [ua, ud] = await Promise.all([
            PlayerModel.findOne({ username: a }, { 'playerData.level': 1, 'playerData.dead': 1, 'playerData.combat': 1 }).lean(),
            PlayerModel.findOne({ username: d }, { 'playerData.level': 1, 'playerData.dead': 1, 'playerData.combat': 1 }).lean()]);
        const pa = (ua && ua.playerData) || {}, pd = (ud && ud.playerData) || {};
        if (pa.dead) return { error: 'Halott túlélő nem támadhat.' };
        if (pd.dead) return { error: `${d} már elesett.` };
        if ((pa.level || 1) < R.MIN_LEVEL) return { error: `Támadni az ${R.MIN_LEVEL}. szinttől (Kadét) lehet.` };
        if ((pd.level || 1) < R.MIN_LEVEL) return { error: `${d} még újonc (${R.MIN_LEVEL}. szint alatt): őt nem lehet megtámadni.` };
        if (pa.combat) return { error: 'Előbb fejezd be a harcot!' };
        if (pd.combat) return { error: `${d} épp egy szörnnyel harcol.` };
        return { ok: true, dist, la: pa.level || 1, ld: pd.level || 1 };
    }

    // a lövés: találat? mennyi sebzés? (a célpont menedékben nehezebben eltalálható)
    function shelterCover(p, entry) {
        if (!p.shelter || !freshPos(entry)) return 0;
        const dist = distanceToBuilding(entry, p.shelter);
        if (dist > shelterRange) return 0;
        const wall = (p.shelter.levels && p.shelter.levels.wall) || 0;
        return R.SHELTER_HIT + wall * R.SHELTER_WALL;
    }
    function bestSlot(p) {
        let best = 'melee', dmg = -1;
        CombatEngine.WEAPON_SLOTS.forEach(s => { const w = CombatEngine.weaponInfo(p, itemDatabase, s); if (p.equipment && (p.equipment[s] || s === 'melee') && w.dmg > dmg) { dmg = w.dmg; best = s; } });
        return best;
    }
    function shotDamage(p, slot, f) {
        const weapon = CombatEngine.weaponInfo(p, itemDatabase, slot);
        const fx = Skills.effects(p.skills);
        if (weapon.ammoKey) {
            const s = p.inventory.find(x => x.key === weapon.ammoKey && x.count > 0);
            if (s) { s.count -= 1; if (s.count <= 0) p.inventory = p.inventory.filter(x => x !== s); }
        }
        let amount = weapon.dmg + Math.floor(random() * (CombatEngine.RULES.DMG_RANDOM + 1));
        amount *= 1 + ((weapon.ranged ? fx.dmgRanged : fx.dmgMelee) || 0);
        const crit = random() < CombatEngine.RULES.CRIT_CHANCE + (fx.critChance || 0);
        if (crit) amount *= CombatEngine.RULES.CRIT_MULT + (fx.critDmg || 0);
        amount *= CombatEngine.fatiguePenalty(p.fatigue || 0).dmg * R.DMG_MULT;
        return { amount: Math.max(1, Math.round(amount)), crit, weapon: weapon.name, ranged: !!weapon.ranged || !!weapon.ammoKey, noAmmo: weapon.noAmmo };
    }

    function view(f, name) {
        const me = name === f.a ? 'a' : 'd', foe = me === 'a' ? 'd' : 'a';
        const P = f.p;
        return {
            id: f.id, role: me === 'a' ? 'attacker' : 'defender', phase: f.phase, round: f.round,
            me: { name: P[me].name, hp: P[me].hp, maxHp: P[me].maxHp, avatar: P[me].avatar, level: P[me].level },
            foe: { name: P[foe].name, hp: P[foe].hp, maxHp: P[foe].maxHp, avatar: P[foe].avatar, level: P[foe].level, bandit: banditUntil(P[foe].name) > now() },
            myTurn: f.phase === 'fight' && f.turn === me, deadline: f.deadline, turnMs: R.TURN_MS,
            canSurrender: me === 'd' && !f.surrenderUsed && f.phase === 'fight',
            refused: !!f.refused, log: f.log.slice(-14), slots: P[me].slots || [], heals: P[me].heals || [],
            pick: f.phase === 'pick' && me === 'a' ? f.pick : null, pickDeadline: f.phase === 'pick' ? f.pickDeadline : null,
            end: f.end ? (f.end[me] || null) : null
        };
    }
    function push(f) { [f.a, f.d].forEach(n => emitTo(n, 'pvp_state', view(f, n))); }
    function log(f, text, kind) { f.log.push({ t: now(), text, kind: kind || '' }); if (f.log.length > 60) f.log = f.log.slice(-60); }
    function snap(p, name) { // a harcosok közben frissülő adatai
        const st = playerStats(p);
        return { name, hp: Math.max(0, Math.round(p.hp)), maxHp: st.maxHp, level: p.level || 1, avatar: (activePlayers[name] && activePlayers[name].avatar) || 'avatar1.png',
            slots: CombatEngine.WEAPON_SLOTS.filter(s => s === 'melee' || (p.equipment && p.equipment[s])).map(s => {
                const w = CombatEngine.weaponInfo(p, itemDatabase, s), it = p.equipment && p.equipment[s] && itemDatabase[p.equipment[s]];
                const ammo = it && it.reqAmmo ? p.inventory.reduce((a, x) => a + (x.key === it.reqAmmo ? x.count : 0), 0) : null;
                return { slot: s, name: w.name, dmg: w.dmg, noAmmo: !!w.noAmmo, key: it ? p.equipment[s] : null, ammo };
            }),
            heals: p.inventory.filter(s => { const it = itemDatabase[s.key]; return it && it.effects && it.effects.hp > 0 && s.count > 0; })
                .reduce((acc, s) => { const x = acc.find(h => h.key === s.key); if (x) x.count += s.count; else acc.push({ key: s.key, name: itemDatabase[s.key].name, hp: itemDatabase[s.key].effects.hp, count: s.count }); return acc; }, []) };
    }

    // a lövöldözés hallatszik: a közeli (nem résztvevő) játékosok irány és táv szerint kapnak jelzést
    const DIRS = ['északról', 'északkeletről', 'keletről', 'délkeletről', 'délről', 'délnyugatról', 'nyugatról', 'északnyugatról'];
    function gunshot(f) {
        for (const name in activePlayers) {
            if (name === f.a || name === f.d) continue;
            const e = activePlayers[name]; if (!freshPos(e)) continue;
            const dist = haversine(e.lat, e.lng, f.lat, f.lng); if (dist > R.HEAR) continue;
            const k = name + '|' + f.id; if (now() - (heard.get(k) || 0) < R.HEAR_GAP_MS) continue; heard.set(k, now());
            const y = Math.sin((f.lng - e.lng) * Math.PI / 180) * Math.cos(f.lat * Math.PI / 180);
            const x = Math.cos(e.lat * Math.PI / 180) * Math.sin(f.lat * Math.PI / 180) - Math.sin(e.lat * Math.PI / 180) * Math.cos(f.lat * Math.PI / 180) * Math.cos((f.lng - e.lng) * Math.PI / 180);
            const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
            const dir = DIRS[Math.round(deg / 45) % 8];
            // a pontos hely helyett kb. 60 m-es pontossággal mutatjuk a térképen
            const jitter = () => (random() - 0.5) * 0.0011;
            emitTo(name, 'pvp_gunshot', { dir, dist: Math.round(dist / 10) * 10, lat: f.lat + jitter(), lng: f.lng + jitter(), t: now() });
        }
    }

    async function start(a, d) {
        const chk = await canAttack(a, d);
        if (chk.error) return chk;
        const ea = activePlayers[a], ed = activePlayers[d];
        const f = { id: 'f' + crypto.randomBytes(5).toString('hex'), a, d, startedAt: now(), lat: (ea.lat + ed.lat) / 2, lng: (ea.lng + ed.lng) / 2,
            phase: 'fight', turn: 'd', round: 1, log: [], p: {}, surrenderUsed: false, refused: false, end: null, timer: null };
        fights.set(f.id, f); fightOf.set(a, f.id); fightOf.set(d, f.id);
        await setBandit(a, R.BANDIT_MS); // aki kezdeményez, az bandita
        // az első lövés: ritkán talál
        let cover = 0, shot = null, hit = false;
        const ra = await withPlayer(a, (p) => {
            const slot = bestSlot(p);
            shot = shotDamage(p, slot, f);
            f.p.a = snap(p, a);
            return {};
        });
        const rd = await withPlayer(d, (p) => {
            cover = shelterCover(p, ed);
            hit = random() < Math.max(0.05, R.OPEN_HIT - cover);
            if (hit) {
                const mit = 1 - Math.min(CombatEngine.RULES.DEFENSE_CAP, playerStats(p).defense * CombatEngine.RULES.DEFENSE_PER_POINT);
                shot.amount = Math.max(1, Math.round(shot.amount * mit));
                p.hp = Math.max(1, p.hp - shot.amount); // az első lövés nem halálos
            }
            f.p.d = snap(p, d);
            return {};
        });
        if (ra && ra.p) sendPlayerState(a, ra.p);
        if (rd && rd.p) sendPlayerState(d, rd.p);
        log(f, `🔫 ${a} rálőtt ${d}-ra (${shot.weapon})${hit ? ` – TALÁLAT: -${shot.amount} élet${shot.crit ? ' (kritikus!)' : ''}` : ' – mellé ment!'}${cover ? ' 🏠 A menedék fedezéket adott.' : ''}`, hit ? 'hit' : 'miss');
        gunshot(f);
        Admin.logEvent('pvp_attack', a, { target: d, hit, dmg: hit ? shot.amount : 0 });
        notify(d, '🔫 RÁD LŐTTEK!', `${a} megtámadott. Lőj vissza, menekülj vagy add meg magad!`);
        armTimer(f);
        push(f);
        return { ok: true, id: f.id };
    }

    function armTimer(f) {
        clearTimeout(f.timer);
        if (f.phase === 'fight') {
            f.deadline = now() + R.TURN_MS;
            f.timer = setTimeout(() => { const n = f.turn === 'a' ? f.a : f.d; act(n, { action: 'shoot', auto: true }).catch(e => console.error('PvP auto hiba:', e.message)); }, R.TURN_MS + 200);
        } else if (f.phase === 'pick') {
            f.pickDeadline = now() + R.PICK_MS;
            f.timer = setTimeout(() => { pickDone(f, null).catch(e => console.error('PvP választás hiba:', e.message)); }, R.PICK_MS + 200);
        }
    }

    // ---------- egy lépés ----------
    async function act(name, d) {
        const id = fightOf.get(name), f = id && fights.get(id);
        if (!f) return { error: 'Nem vagy harcban.' };
        const me = name === f.a ? 'a' : 'd', foe = me === 'a' ? 'd' : 'a', foeName = f[foe];
        if (f.phase !== 'fight') return { error: 'Várj a másik félre…' };
        if (f.turn !== me) return { error: 'Most nem te jössz.' };
        const action = String(d.action || '');
        if (action === 'surrender') {
            if (me !== 'd' || f.surrenderUsed) return { error: 'Most nem adhatod meg magad.' };
            f.surrenderUsed = true;
            const r = await withPlayer(name, (p) => {
                f.pick = { money: Math.floor((p.money || 0) * R.SURRENDER_MONEY), max: R.PICKS,
                    items: p.inventory.map((s, i) => ({ idx: i, key: s.key, count: s.count, dur: s.dur, name: (itemDatabase[s.key] || {}).name || s.key, icon: (itemDatabase[s.key] || {}).icon || '📦', img: (itemDatabase[s.key] || {}).img || null })) };
                return { save: false };
            });
            f.phase = 'pick';
            log(f, `🏳️ ${name} megadta magát. ${foeName} dönt: elvesz 3 tételt és a pénz felét, vagy nem kegyelmez.`, 'info');
            armTimer(f); push(f);
            return { ok: true };
        }
        if (action === 'flee') {
            let fx = {}, outcome = null, graze = null;
            const rr = await withPlayer(name, (p) => {
                fx = Skills.effects(p.skills);
                const whistle = (p.inventory || []).some(s => s.key === 'rescue_whistle' && s.count > 0) || !!fx.fleeAlways;
                const chance = whistle ? 1 : Math.min(0.98, R.FLEE + CombatEngine.fatiguePenalty(p.fatigue || 0).flee + (fx.flee || 0) + (me === 'd' && f.refused ? R.FLEE_REFUSED_BONUS : 0));
                outcome = random() < chance ? 'fled' : 'fail';
                return { save: false };
            });
            if (outcome === 'fled' && random() < R.FLEE_GRAZE) {
                // menekülés közben még utánalőnek
                const ra = await withPlayer(foeName, (p) => { graze = shotDamage(p, bestSlot(p), f); f.p[foe] = snap(p, foeName); return {}; });
                const rd = await withPlayer(name, (p) => {
                    const mit = 1 - Math.min(CombatEngine.RULES.DEFENSE_CAP, playerStats(p).defense * CombatEngine.RULES.DEFENSE_PER_POINT);
                    graze.amount = Math.max(1, Math.round(graze.amount * R.GRAZE_MULT * mit));
                    p.hp = Math.max(0, p.hp - graze.amount);
                    f.p[me] = snap(p, name);
                    if (p.hp <= 0) dropAll(p, f, name, foeName);
                    return {};
                });
                if (ra && ra.p) sendPlayerState(foeName, ra.p);
                if (rd && rd.p) sendPlayerState(name, rd.p);
                log(f, `🏃 ${name} elfutott, de ${foeName} utánalőtt: -${graze.amount} élet.`, 'hit');
                gunshot(f);
                if (rd && rd.p && rd.p.hp <= 0) return finish(f, foe, 'kill');
            } else if (outcome === 'fled') log(f, `🏃 ${name} sikeresen elmenekült!`, 'info');
            if (outcome === 'fled') return finish(f, null, 'fled', me);
            log(f, `🏃 ${name} menekülni próbált, de nem sikerült!`, 'miss');
            f.turn = foe; f.round++; armTimer(f); push(f);
            return { ok: true };
        }
        if (action === 'heal') {
            let res = null;
            const r = await withPlayer(name, (p) => {
                const item = itemDatabase[d.item];
                const slot = item && item.effects && item.effects.hp > 0 && p.inventory.find(s => s.key === d.item && s.count > 0);
                if (!slot) { res = { error: 'Nincs ilyen gyógyszered.' }; return { save: false }; }
                const before = p.hp, maxHp = playerStats(p).maxHp, healPct = Skills.effects(p.skills).healPct || 0;
                SurvivalStats.applyEffects(p, healPct ? { ...item.effects, hp: Math.round(item.effects.hp * (1 + healPct)) } : item.effects, maxHp);
                slot.count -= 1; if (slot.count <= 0) p.inventory = p.inventory.filter(s => s !== slot);
                res = { amount: Math.round(p.hp - before), item: item.name };
                f.p[me] = snap(p, name);
                return {};
            });
            if (res.error) return res;
            if (r && r.p) sendPlayerState(name, r.p);
            log(f, `💊 ${name} gyógyított (${res.item}): +${res.amount} élet.`, 'heal');
            f.turn = foe; f.round++; armTimer(f); push(f);
            return { ok: true };
        }
        // lövés (alapértelmezett; időtúllépéskor is ez történik)
        const slotReq = CombatEngine.WEAPON_SLOTS.includes(d.slot) ? d.slot : null;
        let shot = null, hit = false, cover = 0, dead = false;
        const ra = await withPlayer(name, (p) => { shot = shotDamage(p, slotReq || bestSlot(p), f); f.p[me] = snap(p, name); return {}; });
        const rd = await withPlayer(foeName, (p) => {
            cover = shelterCover(p, activePlayers[foeName]);
            hit = random() < Math.max(0.25, R.HIT - cover);
            if (hit) {
                const mit = 1 - Math.min(CombatEngine.RULES.DEFENSE_CAP, playerStats(p).defense * CombatEngine.RULES.DEFENSE_PER_POINT);
                shot.amount = Math.max(1, Math.round(shot.amount * mit));
                p.hp = Math.max(0, p.hp - shot.amount);
                const fxd = Skills.effects(p.skills);
                if (p.hp <= 0 && fxd.lastStand && !f['ls' + foe]) { p.hp = 1; f['ls' + foe] = true; }
                if (p.hp <= 0) { dead = true; dropAll(p, f, foeName, name); }
            }
            f.p[foe] = snap(p, foeName);
            return {};
        });
        if (ra && ra.p) sendPlayerState(name, ra.p);
        if (rd && rd.p) sendPlayerState(foeName, rd.p);
        log(f, `${d.auto ? '⏱️ ' : ''}🔫 ${name} lő (${shot.weapon})${hit ? ` – TALÁLAT: -${shot.amount} élet${shot.crit ? ' (kritikus!)' : ''}` : ' – mellé!'}${cover && hit === false ? ' 🏠' : ''}`, hit ? 'hit' : 'miss');
        gunshot(f);
        if (dead) return finish(f, me, 'kill');
        f.turn = foe; f.round++;
        if (f.round > R.MAX_ROUNDS) { log(f, '⏳ A harc elhúzódott: mindketten visszavonultak.', 'info'); return finish(f, null, 'draw'); }
        armTimer(f); push(f);
        return { ok: true };
    }

    // a megadás: a támadó választ (vagy elutasít)
    async function pickDone(f, choice) {
        if (f.phase !== 'pick') return { error: 'Nincs mit választani.' };
        clearTimeout(f.timer);
        if (choice && choice.refuse) {
            f.refused = true; f.phase = 'fight'; f.turn = 'd';
            await setBandit(f.a, R.BANDIT_MS); // dupla bandita-idő
            log(f, `💀 ${f.a} nem kegyelmez! ${f.d} könnyebben menekülhet.`, 'hit');
            armTimer(f); push(f);
            return { ok: true };
        }
        const max = f.pick.max;
        let idx = choice && Array.isArray(choice.idx) ? [...new Set(choice.idx.map(Number))].filter(i => f.pick.items.some(x => x.idx === i)).slice(0, max) : null;
        if (!idx) { const all = f.pick.items.map(x => x.idx); idx = []; while (idx.length < Math.min(max, all.length)) { const i = all[Math.floor(random() * all.length)]; if (!idx.includes(i)) idx.push(i); } }
        // a megadótól elvesszük (a választás óta változhatott a hátizsák: kulcs szerint ellenőrizzük)
        const taken = [];
        let money = 0;
        const rd = await withPlayer(f.d, (p) => {
            const want = idx.map(i => f.pick.items.find(x => x.idx === i)).filter(Boolean);
            want.sort((x, y) => y.idx - x.idx).forEach(w => {
                const s = p.inventory[w.idx];
                if (s && s.key === w.key) { const n = Math.min(s.count, w.count); taken.push({ key: s.key, count: n, dur: s.dur }); s.count -= n; if (s.count <= 0) p.inventory.splice(w.idx, 1); }
            });
            money = Math.floor((p.money || 0) * R.SURRENDER_MONEY); p.money -= money;
            return {};
        });
        const lost = [];
        const ra = await withPlayer(f.a, (p) => {
            p.money = (p.money || 0) + money;
            taken.forEach(t => { const ok = canAddItem(p, t.key, t.count); if (ok.ok) pushItem(p, t.key, t.count, t.dur); else lost.push(t); });
            return {};
        });
        if (rd && rd.p) sendPlayerState(f.d, rd.p);
        if (ra && ra.p) sendPlayerState(f.a, ra.p);
        if (lost.length) await makeBag(f.a, null, lost, 0, activePlayers[f.a] || f);
        const names = taken.map(t => `${(itemDatabase[t.key] || {}).name || t.key}${t.count > 1 ? ` ×${t.count}` : ''}`).join(', ') || 'semmi';
        log(f, `🤝 ${f.a} elvitte: ${names}${money ? ` és ${money} $` : ''}.${lost.length ? ' (Ami nem fért el nála, zsákban maradt a földön.)' : ''}`, 'info');
        return finish(f, 'a', 'surrender', null, { names, money });
    }

    function dropAll(p, f, victim, killer) {
        // a vesztes hátizsákja és felszerelése zsákba kerül (a pénze is)
        const items = [];
        (p.inventory || []).forEach(s => items.push({ key: s.key, count: s.count, dur: s.dur }));
        Object.entries(p.equipment || {}).forEach(([slot, key]) => { if (key) items.push({ key, count: 1, dur: p.equipmentDur && p.equipmentDur[slot] }); });
        const money = p.money || 0;
        p.inventory = []; Object.keys(p.equipment || {}).forEach(k => { p.equipment[k] = null; }); p.equipmentDur = {}; p.money = 0;
        f.drop = { items, money, victim, killer };
    }
    async function makeBag(owner, killer, items, money, pos) {
        if (!items.length && !money) return null;
        const id = 'b' + crypto.randomBytes(5).toString('hex');
        const b = { _id: id, lat: pos.lat, lng: pos.lng, owner, killer, items, money: money || 0, t: now(), until: now() + R.BAG_MS };
        await BagModel.create(b);
        for (const name in activePlayers) { const e = activePlayers[name]; if (freshPos(e) && haversine(e.lat, e.lng, b.lat, b.lng) <= 300) emitTo(name, 'pvp_bags', await bagsNear(name)); }
        return b;
    }

    // ---------- a harc vége ----------
    async function finish(f, winner, how, fleer, extra) {
        clearTimeout(f.timer);
        f.phase = 'ended';
        fights.delete(f.id); fightOf.delete(f.a); fightOf.delete(f.d);
        const A = f.a, D = f.d;
        const end = { a: null, d: null };
        if (how === 'kill') {
            const w = winner === 'a' ? A : D, l = winner === 'a' ? D : A;
            const lv = (f.p[winner === 'a' ? 'd' : 'a'] || {}).level || 1;
            const xp = 40 + 12 * lv;
            const rw = await withPlayer(w, (p) => { grantXp(p, xp); seasonAdd(p, 'pvp', 1); if (p.stats) p.stats.pvpWins = (p.stats.pvpWins || 0) + 1; return {}; });
            const rl = await withPlayer(l, (p) => { if (p.stats) p.stats.pvpDeaths = (p.stats.pvpDeaths || 0) + 1; return {}; });
            if (rw && rw.p) sendPlayerState(w, rw.p);
            if (rl && rl.p) sendPlayerState(l, rl.p);
            const pos = activePlayers[l] && freshPos(activePlayers[l]) ? activePlayers[l] : f;
            const drop = f.drop || { items: [], money: 0 };
            await makeBag(l, w, drop.items, drop.money, pos);
            log(f, `💀 ${l} elesett. ${w} győzött (+${xp} XP). A zsák a földön maradt.`, 'end');
            end[winner] = { result: 'won', text: `Győztél! +${xp} XP. ${l} zsákja ott maradt a földön – vedd fel, mielőtt más teszi! 🎒` };
            end[winner === 'a' ? 'd' : 'a'] = { result: 'lost', text: `Elestél. ${w} győzött. A cuccaid zsákban maradtak a helyszínen, 30 percig bárki felveheti.` };
            pairCool.set(pairKey(A, D), now() + R.PAIR_COOLDOWN_MS);
            Admin.logEvent('pvp_kill', w, { victim: l, rounds: f.round, items: drop.items.length });
            notify(l, '💀 Elestél', `${w} legyőzött. A zsákod a helyszínen maradt.`);
        } else if (how === 'fled') {
            const runner = fleer === 'a' ? A : D, other = fleer === 'a' ? D : A;
            if (fleer === 'd') fleeProtect.set(A + '>' + D, now() + R.FLEE_PROTECT_MS);
            end[fleer] = { result: 'escaped', text: `Elmenekültél! ${fleer === 'd' ? `${other} 10 percig nem támadhat meg újra.` : ''}` };
            end[fleer === 'a' ? 'd' : 'a'] = { result: 'fled', text: `${runner} elmenekült.` };
            Admin.logEvent('pvp_flee', runner, { from: other, rounds: f.round });
        } else if (how === 'surrender') {
            end.a = { result: 'gotSurrender', text: `${D} megadta magát. Elvitted: ${extra.names}${extra.money ? `, ${extra.money} $` : ''}.` };
            end.d = { result: 'surrendered', text: `Megadtad magad. ${A} elvitte: ${extra.names}${extra.money ? `, ${extra.money} $` : ''}. A viselt felszerelésed megmaradt.` };
            pairCool.set(pairKey(A, D), now() + R.PAIR_COOLDOWN_MS);
            Admin.logEvent('pvp_surrender', D, { to: A, money: extra.money });
        } else {
            end.a = end.d = { result: 'draw', text: 'A harc véget ért.' };
            pairCool.set(pairKey(A, D), now() + R.PAIR_COOLDOWN_MS);
        }
        f.end = end;
        push(f);
        LogModel.create({ _id: f.id, t: now(), a: A, d: D, result: how, winner: winner ? f[winner] : null, rounds: f.round, lat: f.lat, lng: f.lng, items: (f.drop && f.drop.items.length) || 0 }).catch(() => { });
        return { ok: true, ended: how };
    }

    // ---------- zsákok ----------
    async function bagsNear(name) {
        const e = activePlayers[name]; if (!freshPos(e)) return { bags: [] };
        const all = (await BagModel.find({}).lean()).filter(b => b.until > now());
        return { bags: all.filter(b => haversine(e.lat, e.lng, b.lat, b.lng) <= 300).map(b => ({ id: b._id, lat: b.lat, lng: b.lng, owner: b.owner, killer: b.killer, n: b.items.length + (b.money ? 1 : 0), until: b.until, dist: Math.round(haversine(e.lat, e.lng, b.lat, b.lng)) })) };
    }
    async function bagOpen(name, id) {
        const b = await BagModel.findById(String(id || '')).lean();
        if (!b || b.until <= now()) return { error: 'Ez a zsák már eltűnt.' };
        const e = activePlayers[name]; if (!freshPos(e)) return { error: 'Várd meg a friss GPS pozíciót!' };
        const dist = haversine(e.lat, e.lng, b.lat, b.lng);
        if (dist > R.BAG_RANGE) return { error: `Menj közelebb a zsákhoz! (${Math.round(dist)} m)` };
        return { ok: true, bag: { id: b._id, owner: b.owner, killer: b.killer, money: b.money || 0, until: b.until, items: b.items.map((s, i) => ({ idx: i, key: s.key, count: s.count, name: (itemDatabase[s.key] || {}).name || s.key, icon: (itemDatabase[s.key] || {}).icon || '📦', img: (itemDatabase[s.key] || {}).img || null })) } };
    }
    const bagLocks = new Map();
    async function bagTake(name, id, idx) {
        const prev = bagLocks.get(id) || Promise.resolve();
        const run = prev.catch(() => { }).then(async () => {
            const o = await bagOpen(name, id); if (o.error) return o;
            const b = await BagModel.findById(id).lean();
            const want = idx === 'all' ? b.items.map((_, i) => i) : [Number(idx)];
            const got = [], keep = b.items.slice();
            let money = 0, full = false;
            const r = await withPlayer(name, (p) => {
                if (p.dead) return { save: false };
                if (want.includes(-1) || idx === 'all') { money = b.money || 0; p.money = (p.money || 0) + money; }
                want.filter(i => i >= 0).sort((x, y) => y - x).forEach(i => {
                    const s = keep[i]; if (!s) return;
                    if (!canAddItem(p, s.key, s.count).ok) { full = true; return; }
                    pushItem(p, s.key, s.count, s.dur); got.push(s); keep.splice(i, 1);
                });
                return got.length || money ? {} : { save: false };
            });
            if (!r || !r.p || r.p.dead) return { error: 'Halottként nem vehetsz fel semmit.' };
            const left = keep, leftMoney = money ? 0 : (b.money || 0);
            if (!left.length && !leftMoney) await BagModel.deleteOne({ _id: id });
            else await BagModel.updateOne({ _id: id }, { $set: { items: left, money: leftMoney } });
            sendPlayerState(name, r.p);
            if (got.length || money) Admin.logEvent('pvp_loot', name, { bag: id, owner: b.owner, items: got.length, money });
            return { ok: true, got: got.map(s => `${(itemDatabase[s.key] || {}).name || s.key}${s.count > 1 ? ` ×${s.count}` : ''}`), money, full, empty: !left.length && !leftMoney };
        });
        bagLocks.set(id, run.finally(() => { if (bagLocks.get(id) === run) bagLocks.delete(id); }));
        return run;
    }
    if (!process.env.SG_NO_TIMERS) setInterval(() => { BagModel.find({}).lean().then(all => all.filter(b => b.until <= now()).forEach(b => BagModel.deleteOne({ _id: b._id }).catch(() => { }))).catch(() => { }); }, 5 * 60000);

    // ---------- socket ----------
    function attach(socket) {
        const me = socket.data.username;
        const res = (r) => socket.emit('pvp_result', r && r.error ? { success: false, message: r.error } : { success: true, ...(r || {}) });
        const guard = (fn) => async (d) => { try { await fn(d || {}); } catch (e) { console.error('PvP hiba:', e.message); res({ error: 'Hiba történt.' }); } };
        PlayerModel.findOne({ username: me }, { banditUntil: 1 }).lean().then(u => { if (u && activePlayers[me]) activePlayers[me].banditUntil = u.banditUntil || 0; }).catch(() => { });
        setTimeout(() => { const id = fightOf.get(me), f = id && fights.get(id); if (f) socket.emit('pvp_state', view(f, me)); }, 1200);
        socket.on('pvp_attack', guard(async (d) => res(await start(me, String(d.name || '')))));
        socket.on('pvp_act', guard(async (d) => { const r = await act(me, d); if (r.error) res(r); }));
        socket.on('pvp_pick', guard(async (d) => {
            const id = fightOf.get(me), f = id && fights.get(id);
            if (!f || f.a !== me) return res({ error: 'Nincs mit választani.' });
            const r = await pickDone(f, d.refuse ? { refuse: true } : { idx: d.idx }); if (r.error) res(r);
        }));
        socket.on('pvp_bags', guard(async () => socket.emit('pvp_bags', await bagsNear(me))));
        socket.on('bag_open', guard(async (d) => { const r = await bagOpen(me, d.id); if (r.error) return res(r); socket.emit('bag_view', r.bag); }));
        socket.on('bag_take', guard(async (d) => {
            const r = await bagTake(me, String(d.id || ''), d.idx === 'all' ? 'all' : Number(d.idx));
            if (r.error) return res(r);
            res({ message: `🎒 Felvetted: ${[...r.got, r.money ? `${r.money} $` : ''].filter(Boolean).join(', ') || 'semmi'}${r.full ? ' (nem fért el minden)' : ''}` });
            const o = await bagOpen(me, d.id); socket.emit('bag_view', o.error ? null : o.bag);
            socket.emit('pvp_bags', await bagsNear(me));
        }));
        socket.on('pvp_info', guard(async () => socket.emit('pvp_info', { enabled: settings.enabled, minLevel: R.MIN_LEVEL, range: R.RANGE, safeZones: settings.safeZones, squares: settings.squares })));
    }

    // ---------- admin ----------
    async function adminState() {
        const logs = (await LogModel.find({}).lean()).sort((a, b) => b.t - a.t).slice(0, 100);
        const bags = (await BagModel.find({}).lean()).filter(b => b.until > now());
        return { settings, fights: [...fights.values()].map(f => ({ id: f.id, a: f.a, d: f.d, round: f.round, phase: f.phase, startedAt: f.startedAt })), logs, bags: bags.length,
            bandits: Object.values(activePlayers).filter(e => (e.banditUntil || 0) > now()).map(e => ({ name: e.username, until: e.banditUntil })) };
    }
    async function adminSave(v) {
        settings = normSettings(v);
        if (SettingModel) await SettingModel.updateOne({ _id: 'pvp' }, { value: settings }, { upsert: true });
        return { message: `PvP beállítások mentve (${settings.enabled ? 'bekapcsolva' : 'KIKAPCSOLVA'}, ${settings.safeZones.length} biztonságos zóna${settings.squares.on ? `, főterek ${settings.squares.r} m-es körben védettek` : ', főterek NEM védettek'}).` };
    }

    return { attach, start, act, pickDone, bagTake, bagOpen, bagsNear, inFight: (n) => fightOf.has(n), banditUntil, adminState, adminSave, R, _fights: fights, settings: () => settings };
}

module.exports = { setup, R };
