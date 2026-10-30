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
        modal.classList.add('hidden');
        document.getElementById('combat-heal-modal').classList.add('hidden');
        shownCombatKey = null;
        return;
    }

    const key = `${combat.buildingId}:${combat.startedAt}`;
    if (shownCombatKey !== key) {
        shownCombatKey = key;
        document.getElementById('combat-log').innerHTML = '';
        combatLogAppend(`[Harc] ${combat.enemy.avatar} ${combat.enemy.name} támadt rád itt: ${combat.buildingName}. Harcolj vagy menekülj!`, 'text-amber-400');
        playSound('hit');
    }
    modal.classList.remove('hidden');

    const enemy = combat.enemy;
    document.getElementById('enemy-avatar').textContent = enemy.avatar;
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
        const label = attackButtonLabel(slot);
        btn.classList.toggle('hidden', !label);
        btn.textContent = label || '';
    });
}

const COMBAT_SLOTS = ['weapon', 'secondary', 'melee'];

function attackButtonLabel(slot) {
    const weapon = player.equipment && itemDatabase[player.equipment[slot]];
    if (!weapon) return slot === 'melee' ? '👊 Puszta kéz' : '';
    let text = `${weapon.icon || '⚔️'} ${weapon.name}`;
    if (weapon.reqAmmo) {
        const ammo = player.inventory.filter(s => s.key === weapon.reqAmmo).reduce((sum, s) => sum + s.count, 0);
        text += ammo > 0 ? ` (${ammo})` : ' (nincs lőszer)';
    }
    return text;
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
    if (ev.actor === 'enemy') return [`${enemyName} megsebzett: ${ev.amount} sebzés.`, 'text-red-400'];
    switch (ev.type) {
        case 'hit': return [ev.noAmmo ? `Nincs lőszered, puskatussal ütsz: ${ev.amount} sebzés.` : `Beviszel ${ev.amount} sebzést (${ev.weapon}).${ev.casing ? ' (+1 üres hüvely)' : ''}`, 'text-amber-300'];
        case 'crit': return [`KRITIKUS TALÁLAT! ${ev.amount} sebzés (${ev.weapon}).`, 'text-yellow-300 font-bold'];
        case 'heal': return [`Bevetted: ${ev.item} (+${ev.amount} élet). Ez nem vett el kört.`, 'text-emerald-400'];
        case 'flee': return ['Sikerült elmenekülnöd!', 'text-emerald-300'];
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
        (data.events || []).forEach(ev => {
            const [text, cls] = describeCombatEvent(ev, enemyName);
            if (text) combatLogAppend(text, cls);
            if (ev.actor === 'enemy') playSound('hit');
            else if (ev.type === 'hit' || ev.type === 'crit') playSound('attack');
        });

        if (data.outcome === 'won') {
            const parts = [data.message];
            if (data.items && data.items.length > 0) {
                parts.push('Találtál: ' + data.items.map(it => {
                    const cfg = itemDatabase[it.key] || { name: it.key, icon: '📦' };
                    return `${cfg.icon} ${it.count > 1 ? it.count + '× ' : ''}${cfg.name}`;
                }).join(', '));
            }
            logMessage(parts.join(' '));
            playSound('win');
        } else if (data.outcome === 'fled') {
            logMessage(data.message);
        } else if (data.outcome === 'lost') {
            logMessage(data.message);
        }
        // A harcablak és a játékos állapota a player_state üzenettel frissül
    });
}
