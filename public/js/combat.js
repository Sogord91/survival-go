// combat.js
// KÖRÖS HARC – kliens oldal. A harcot a szerver vezeti: a harc állapota a player_state üzenet "combat" mezőjében jön
// (újracsatlakozás után is), a gombok csak a választott lépést küldik el, az eredmény eseménylistaként érkezik.
// (Az eseménylistára később animációk építhetők, pl. Shakes & Fidget-stílusban.)

let shownCombatKey = null; // az épp megjelenített harc azonosítója (új harcnál a napló kiürül)

function combatLogAppend(text, colorClass = 'text-gray-300') {
    const logBox = document.getElementById('combat-log');
    if (!logBox) return;
    const div = document.createElement('div');
    div.className = colorClass;
    div.textContent = text;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

// A harcablak a szerver állapotából (player.combat)
function syncCombatUI() {
    const modal = document.getElementById('combat-modal');
    if (!modal) return;
    const combat = player.combat;

    if (!combat || player.dead) {
        // a harc vége: előbb lejátsszuk az utolsó csapásokat (a combat_result a player_state után érkezik)
        if (!player.dead && shownCombatKey && !modal.classList.contains('hidden')) {
            if (Date.now() < arenaBusyUntil) { setTimeout(syncCombatUI, arenaBusyUntil - Date.now() + 50); return; }
            if (!arenaEndWaited) { arenaEndWaited = true; setTimeout(syncCombatUI, 250); return; }
        }
        arenaEndWaited = false;
        modal.classList.add('hidden');
        document.getElementById('combat-heal-modal').classList.add('hidden');
        shownCombatKey = null;
        return;
    }

    const key = `${combat.buildingId}:${combat.startedAt}`;
    if (shownCombatKey !== key) {
        shownCombatKey = key;
        document.getElementById('combat-log').innerHTML = '';
        arenaReset(combat.enemy);
        combatLogAppend(`[Harc] ${combat.enemy.avatar} ${combat.enemy.name} támadt rád itt: ${combat.buildingName}. Harcolj vagy menekülj!`, 'text-amber-400');
        playSound('hit');
    }
    modal.classList.remove('hidden');

    const enemy = combat.enemy;
    renderEnemyPortrait(enemy);
    document.getElementById('enemy-name').textContent = enemy.name;
    document.getElementById('enemy-level').textContent = enemy.lvl;
    document.getElementById('enemy-hp-text').textContent = `${Math.max(0, Math.round(enemy.hp))} / ${enemy.maxHp}`;
    document.getElementById('enemy-bar-hp').style.width = Math.max(0, (enemy.hp / enemy.maxHp) * 100) + '%';

    const hp = player.hp ?? 100;
    const maxHp = player.maxHp || 100;
    document.getElementById('combat-player-hp').textContent = Math.max(0, Math.ceil(hp)) + '/' + maxHp;
    document.getElementById('combat-bar-hp').style.width = Math.max(0, Math.min(100, (hp / maxHp) * 100)) + '%';

    // Támadógombok a három fegyverhelyhez (üres elsődleges / másodlagos helynél nincs gomb; közelharcban puszta kéz)
    COMBAT_SLOTS.forEach(slot => {
        const btn = document.getElementById('btn-combat-attack-' + slot);
        if (!btn) return;
        const parts = attackButtonParts(slot);
        btn.classList.toggle('hidden', !parts);
        // a hosszú fegyvernév a végén kap "…"-t, a lőszer száma mindig látszik
        // (a gomb közepére igazított szöveg korábban mindkét oldalon levágódott)
        btn.innerHTML = '';
        if (parts) {
            const name = document.createElement('span');
            name.className = 'truncate min-w-0';
            name.textContent = parts.name;
            if (parts.img) { const im = document.createElement('img'); im.src = parts.src || ('/images/items/' + parts.img + '.webp'); im.alt = ''; im.className = 'gi gi-img'; im.style.marginRight = '4px'; btn.appendChild(im); }
            btn.appendChild(name);
            if (parts.ammo) {
                const ammo = document.createElement('span');
                ammo.className = 'shrink-0';
                ammo.textContent = ' ' + parts.ammo; // a szóköz a szövegben marad (pl. másoláskor), a flex-térköz adja a látható rést
                btn.appendChild(ammo);
            }
        }
    });
}

const COMBAT_SLOTS = ['weapon', 'secondary', 'melee'];

function attackButtonLabel(slot) {
    const parts = attackButtonParts(slot);
    return parts ? parts.name + (parts.ammo ? ' ' + parts.ammo : '') : '';
}

// A gomb két része: a fegyver neve (szükség esetén "…"-tal rövidül) és a lőszer száma (mindig látszik)
function attackButtonParts(slot) {
    const weapon = player.equipment && itemDatabase[player.equipment[slot]];
    if (!weapon) return slot === 'melee' ? { name: '👊 Puszta kéz', ammo: '' } : null;
    let ammo = '';
    if (weapon.reqAmmo) {
        const count = player.inventory.filter(s => s.key === weapon.reqAmmo).reduce((sum, s) => sum + s.count, 0);
        ammo = count > 0 ? `(${count})` : '(nincs lőszer)';
    }
    if (SurvivalStats.isBroken(player, slot)) return { name: `💥 ${weapon.name}`, ammo: '(tönkrement)' };
    return { name: weapon.name, img: weapon.img, src: typeof itemSkinInfo === 'function' ? itemSkinInfo(weapon).src : null, ammo };
}

// Egy lépés küldése a szervernek
function sendCombatAction(action, itemKey) {
    if (!player.combat || typeof socket === 'undefined' || !socket) return;
    const data = { action };
    if (itemKey) data.itemKey = itemKey;
    socket.emit('combat_action', data);
}

// Támadás a választott fegyverrel: weapon (elsődleges) | secondary (másodlagos) | melee (közelharci)
function combatAttack(slot) {
    if (!player.combat || typeof socket === 'undefined' || !socket) return;
    socket.emit('combat_action', { action: 'attack', slot: COMBAT_SLOTS.includes(slot) ? slot : 'weapon' });
}
function combatRun() { sendCombatAction('flee'); }

// Gyógyítás harc közben (a gyógyítás elvesz egy kört: utána az ellenség üt)
function useCombatMedicine(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    sendCombatAction('heal', slot.key);
    document.getElementById('combat-heal-modal').classList.add('hidden');
}

// Egy esemény szövege a harcnaplóba
function describeCombatEvent(ev, enemyName) {
    if (ev.actor === 'enemy' && ev.type === 'dodge') return [`💨 Kitértél ${enemyName} ütése elől!`, 'text-sky-300'];
    if (ev.actor === 'enemy') return [`${enemyName} megsebzett: ${ev.amount} sebzés.`, 'text-red-400'];
    if (ev.type === 'notice') return [ev.text || '', 'text-orange-300 font-bold']; // kopás, tönkremenés
    switch (ev.type) {
        case 'hit': return [ev.noAmmo ? `Nincs lőszered, puskatussal ütsz: ${ev.amount} sebzés.` : `Beviszel ${ev.amount} sebzést (${ev.weapon}).${ev.recovered ? ` (+1 ${ev.recovered})` : (ev.casing ? ' (+1 üres hüvely)' : '')}`, 'text-amber-300'];
        case 'crit': return [`KRITIKUS TALÁLAT! ${ev.amount} sebzés (${ev.weapon}).`, 'text-yellow-300 font-bold'];
        case 'heal': return [`Bevetted: ${ev.item} (+${ev.amount} élet). Ez nem vett el kört.`, 'text-emerald-400'];
        case 'flee': return [ev.whistle ? '📯 Belefújtál a mentősípba, a támadó megtorpant: sikerült elmenekülnöd!' : 'Sikerült elmenekülnöd!', 'text-emerald-300'];
        case 'flee_fail': return ['A menekülés nem sikerült!', 'text-red-400'];
        default: return ['', ''];
    }
}

if (typeof socket !== 'undefined' && socket) {
    socket.on('combat_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Ezt most nem lehet.");
            playSound('hit');
            return;
        }
        const enemyName = (data.enemy && data.enemy.name) || 'Az ellenség';
        const events = data.events || [];
        events.forEach(ev => {
            const [text, cls] = describeCombatEvent(ev, enemyName);
            if (text) combatLogAppend(text, cls);
        });
        const animMs = arenaPlay(events, data.outcome); // felváltva odacsapnak; a hang az animációval együtt szól

        if (data.outcome === 'won') {
            logMessage(data.message);
            setTimeout(() => playSound('win'), Math.max(0, animMs - 600));
            // A talált holmi a Zsákmány ablakba kerül (amit nem teszel el, 30 percig az épületben marad)
            if (data.cache && data.cache.items && data.cache.items.length && typeof openLootWindow === 'function') {
                setTimeout(() => openLootWindow(data.buildingId, data.buildingName || 'Épület', data.cache), animMs); // a győzelem után nyílik
            }
        } else if (data.outcome === 'fled') {
            logMessage(data.message);
        } else if (data.outcome === 'lost') {
            logMessage(data.message);
        }
        // A harcablak és a játékos állapota a player_state üzenettel frissül
    });
}


// Az ellenség képe (public/images/enemies/<kulcs>.webp); ha nincs vagy nem töltődik be, az emoji látszik
const ENEMY_KEY_PATTERN = /^[a-z_]{1,32}$/;
function renderEnemyPortrait(enemy) {
    const el = document.getElementById('enemy-avatar');
    if (!el) return;
    const emoji = String(enemy.avatar || '👹');
    if (el.dataset.key === enemy.key) return; // ugyanaz az ellenség: a kép marad (ne villogjon körönként)
    el.dataset.key = enemy.key || '';
    el.textContent = emoji;
    if (!ENEMY_KEY_PATTERN.test(enemy.key || '')) return;
    const img = new Image();
    img.alt = enemy.name || '';
    img.className = 'w-full h-full object-cover';
    img.onload = () => { if (el.dataset.key === enemy.key) { el.textContent = ''; el.appendChild(img); } };
    img.src = `/images/enemies/${enemy.key}.webp`;
}


// ---------- HARC ARÉNA: a lépések animálva (v0.1.18) ----------
// A szerver egy körben több eseményt küld (pl. te ütsz, aztán ő); ezeket egymás után játsszuk le.
let arenaBusyUntil = 0;
let arenaEndWaited = false;
let arenaTimers = [];
function arenaReset(enemy) {
    arenaTimers.forEach(clearTimeout); arenaTimers = []; arenaBusyUntil = 0;
    const me = document.getElementById('ar-me'), en = document.getElementById('ar-enemy');
    if (!me || !en) return;
    [me, en].forEach(f => f.className = f.className.replace(/\b(lunge|hurt|healed|dead|fled|shoot)\b/g, '').trim());
    document.getElementById('ar-fx').innerHTML = '';
    const myAva = player.avatar ? `/images/avatars/${player.avatar}` : '/images/avatars/avatar1.png';
    const mi = document.getElementById('ar-me-img'); if (mi && mi.getAttribute('src') !== myAva) mi.src = myAva;
    const lbl = document.getElementById('ar-enemy-label'); if (lbl) lbl.textContent = (enemy && enemy.name || 'ELLENFÉL').toUpperCase();
    const box = document.getElementById('ar-enemy-img');
    if (box && enemy) {
        box.textContent = enemy.avatar || '👹';
        if (/^[a-z_]{1,32}$/.test(enemy.key || '')) { const img = new Image(); img.alt = ''; img.onload = () => { box.textContent = ''; box.appendChild(img); }; img.src = `/images/enemies/${enemy.key}.webp`; }
    }
}
function arenaRestart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function arenaFloat(side, text, cls) {
    const fx = document.getElementById('ar-fx'), f = document.getElementById(side === 'me' ? 'ar-me' : 'ar-enemy');
    if (!fx || !f) return;
    const r = f.getBoundingClientRect(), a = fx.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'sg-ar-dmg ' + (cls || '');
    d.textContent = text;
    fx.appendChild(d);
    const half = d.offsetWidth * 0.6 + 8; // ne lógjon ki az aréna szélén
    d.style.left = Math.min(a.width - half, Math.max(half, r.left - a.left + r.width / 2)) + 'px';
    d.style.top = (r.top - a.top + 4) + 'px';
    setTimeout(() => d.remove(), 1000);
}
function arenaSlash(side, glyph) {
    const fx = document.getElementById('ar-fx'), f = document.getElementById(side === 'me' ? 'ar-me' : 'ar-enemy');
    if (!fx || !f) return;
    const r = f.getBoundingClientRect(), a = fx.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'sg-ar-slash';
    d.textContent = glyph;
    d.style.left = (r.left - a.left + r.width / 2) + 'px';
    d.style.top = (r.top - a.top + r.height / 2 - 8) + 'px';
    fx.appendChild(d);
    setTimeout(() => d.remove(), 400);
}
function arenaQuake() { const b = document.getElementById('combat-box'); if (b) arenaRestart(b, 'sg-quake'); }
function arenaBanner(text) {
    const fx = document.getElementById('ar-fx'); if (!fx) return;
    const d = document.createElement('div'); d.className = 'sg-ar-banner'; d.textContent = text; fx.appendChild(d);
}
// Lőfegyver-e (a hit esemény weapon neve alapján)
function arenaIsGun(weaponName) {
    const w = Object.values(itemDatabase).find(it => it.name === weaponName);
    return !!(w && w.reqAmmo);
}
function arenaStep(ev) {
    const me = document.getElementById('ar-me'), en = document.getElementById('ar-enemy');
    if (!me || !en) return;
    if (ev.actor === 'enemy' && ev.type === 'dodge') { arenaRestart(en, 'lunge'); setTimeout(() => arenaFloat('me', 'KITÉRÉS!', 'miss'), 230); return; }
    if (ev.actor === 'enemy') {
        arenaRestart(en, 'lunge');
        setTimeout(() => { arenaRestart(me, 'hurt'); arenaSlash('me', '💥'); arenaFloat('me', `-${ev.amount}`); playSound('hit'); if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} } }, 230);
        return;
    }
    if (ev.type === 'hit' || ev.type === 'crit') {
        const gun = !ev.noAmmo && arenaIsGun(ev.weapon);
        if (gun) { arenaRestart(me, 'shoot'); } else arenaRestart(me, 'lunge');
        setTimeout(() => {
            arenaRestart(en, 'hurt');
            arenaSlash('enemy', gun ? '💥' : ev.type === 'crit' ? '⚡' : '⚔️');
            arenaFloat('enemy', ev.type === 'crit' ? `KRITIKUS! -${ev.amount}` : `-${ev.amount}`, ev.type === 'crit' ? 'crit' : '');
            if (ev.type === 'crit') arenaQuake();
            playSound('attack');
        }, gun ? 90 : 230);
        return;
    }
    if (ev.type === 'heal') { arenaRestart(me, 'healed'); arenaFloat('me', `+${ev.amount}`, 'heal'); return; }
    if (ev.type === 'flee_fail') { arenaRestart(me, 'shoot'); arenaFloat('me', 'NEM SIKERÜLT!', 'miss'); return; }
    if (ev.type === 'flee') { me.classList.add('fled'); arenaFloat('me', 'MENEKÜLÉS!', 'miss'); return; }
}
// Lejátssza az eseményeket; visszaadja, mennyi ideig tart (ms)
function arenaPlay(events, outcome) {
    const steps = events.filter(ev => ev.actor === 'enemy' || ['hit', 'crit', 'heal', 'flee', 'flee_fail'].includes(ev.type));
    const STEP = 620;
    const start = Math.max(Date.now(), arenaBusyUntil);
    let t = start - Date.now();
    steps.forEach(ev => { arenaTimers.push(setTimeout(() => arenaStep(ev), t)); t += STEP; });
    if (outcome === 'won') {
        arenaTimers.push(setTimeout(() => { const en = document.getElementById('ar-enemy'); if (en) en.classList.add('dead'); arenaBanner('GYŐZELEM!'); }, t));
        t += 1100;
    } else if (outcome === 'lost') {
        arenaTimers.push(setTimeout(() => { const me = document.getElementById('ar-me'); if (me) me.classList.add('dead'); }, t));
        t += 700;
    } else if (outcome === 'fled') {
        t += 500;
    }
    arenaBusyUntil = Date.now() + t;
    return t;
}
