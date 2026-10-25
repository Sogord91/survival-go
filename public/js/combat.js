// combat.js
let currentCombat = {
    active: false,
    enemyName: '',
    enemyAvatar: '',
    enemyLevel: 1,
    enemyMaxHp: 100,
    enemyHp: 100,
    enemyDmg: 10,
    buildingObj: null
};

const enemyPool = [
    { name: 'Kóbor Mutáns', avatar: '🧟', hp: 50, dmg: 10, lvl: 1 },
    { name: 'Sugárzott Ghoulish', avatar: '👹', hp: 75, dmg: 15, lvl: 2 },
    { name: 'Zóna Bandita', avatar: '🦹', hp: 70, dmg: 18, lvl: 2 },
    { name: 'Mutáns Fenevad', avatar: '🐺', hp: 95, dmg: 24, lvl: 3 },
    { name: 'Nehézfegyveres Zsoldos', avatar: '🪖', hp: 130, dmg: 30, lvl: 4 }
];

function startCombat(b) {
    const enemyTemplate = enemyPool[Math.floor(Math.random() * enemyPool.length)];
    currentCombat.active = true;
    currentCombat.enemyName = enemyTemplate.name;
    currentCombat.enemyAvatar = enemyTemplate.avatar;
    currentCombat.enemyLevel = enemyTemplate.lvl + Math.floor(((player.level || 1) - 1) / 2);
    currentCombat.enemyMaxHp = enemyTemplate.hp + (currentCombat.enemyLevel * 12);
    currentCombat.enemyHp = currentCombat.enemyMaxHp;
    currentCombat.enemyDmg = enemyTemplate.dmg + (currentCombat.enemyLevel * 3);
    currentCombat.buildingObj = b;

    document.getElementById('enemy-avatar').textContent = currentCombat.enemyAvatar;
    document.getElementById('enemy-name').textContent = currentCombat.enemyName;
    document.getElementById('enemy-level').textContent = currentCombat.enemyLevel;
    
    const weaponKey = player.equipment.weapon;
    const weaponName = weaponKey ? itemDatabase[weaponKey].name : 'Puszta kéz';
    document.getElementById('combat-weapon-name').textContent = weaponName;

    const logBox = document.getElementById('combat-log');
    logBox.innerHTML = `<div class="text-amber-400">[Harc] Egy ${currentCombat.enemyName} támad rád a(z) ${b.name} átkutatásakor!</div>`;

    updateCombatUI();
    document.getElementById('combat-modal').classList.remove('hidden');
    playSound('hit');
}

function updateCombatUI() {
    document.getElementById('enemy-hp-text').textContent = `${Math.max(0, Math.round(currentCombat.enemyHp))} / ${currentCombat.enemyMaxHp}`;
    const enemyHpPct = Math.max(0, (currentCombat.enemyHp / currentCombat.enemyMaxHp) * 100);
    document.getElementById('enemy-bar-hp').style.width = enemyHpPct + '%';

    let hpPercent = Math.max(0, Math.min(100, ((player.hp || 100) / (player.maxHp || 100)) * 100));
    document.getElementById('combat-player-hp').textContent = Math.round(player.hp || 100) + '/' + (player.maxHp || 100);
    document.getElementById('combat-bar-hp').style.width = hpPercent + '%';
}

function combatLogAppend(text, colorClass = 'text-gray-300') {
    const logBox = document.getElementById('combat-log');
    const div = document.createElement('div');
    div.className = colorClass;
    div.textContent = text;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

function combatAttack() {
    if (!currentCombat.active) return;
    let baseDmg = 12;
    const weaponKey = player.equipment.weapon;
    
    if (weaponKey && itemDatabase[weaponKey]) {
        const weapon = itemDatabase[weaponKey];
        baseDmg = weapon.dmg || 12;
        if (weapon.reqAmmo) {
            let ammoSlot = player.inventory.find(s => s.key === weapon.reqAmmo);
            if (ammoSlot && ammoSlot.count > 0) {
                ammoSlot.count--;
                if (ammoSlot.count <= 0) player.inventory = player.inventory.filter(s => s.key !== weapon.reqAmmo);
            } else {
                baseDmg = 6;
            }
        }
    }

    baseDmg += ((player.level || 1) * 3);
    let finalPlayerDmg = Math.max(5, baseDmg + Math.floor(Math.random() * 8) - 3);
    currentCombat.enemyHp -= finalPlayerDmg;
    playSound('attack');
    combatLogAppend(`Beviszel ${finalPlayerDmg} sebzést.`, 'text-amber-300');

    // Lőszerfogyás és harc közbeni állapot azonnali mentése
    saveGame();
    updateUI();

    if (currentCombat.enemyHp <= 0) {
        winCombat();
        return;
    }
    enemyTurn();
}

function combatDodge() {
    if (!currentCombat.active) return;
    if (Math.random() < 0.70) {
        combatLogAppend(`Sikeres kitérés!`, 'text-emerald-400');
    } else {
        let mitigation = 1 - Math.min(0.75, (player.defense || 0) * 0.015);
        let enemyDmg = Math.max(3, Math.round(currentCombat.enemyDmg * mitigation));
        player.hp = Math.max(0, (player.hp || 100) - enemyDmg);
        combatLogAppend(`Kaptál ${enemyDmg} sebzést.`, 'text-red-400');
    }
    checkPlayerHpInCombat();
    updateCombatUI();
}

function combatRun() {
    if (!currentCombat.active) return;
    if (Math.random() < 0.80) {
        currentCombat.active = false;
        document.getElementById('combat-modal').classList.add('hidden');
        playSound('win');
        logMessage("Sikeres menekülés!");
        const b = currentCombat.buildingObj;
        if (b) {
            b.lockedUntil = Date.now() + 5 * 60 * 1000;
            const targetSaved = savedBuildings.find(sb => sb.id === b.id);
            if (targetSaved) targetSaved.lockedUntil = b.lockedUntil;
        }
        saveGame();
        refreshMapMarkers();
    } else {
        combatLogAppend("Menekülés sikertelen!", "text-red-400");
        enemyTurn();
    }
}

function enemyTurn() {
    if (!currentCombat.active) return;
    let mitigation = 1 - Math.min(0.75, (player.defense || 0) * 0.015);
    let enemyDmg = Math.max(3, Math.round(currentCombat.enemyDmg * mitigation));
    player.hp = Math.max(0, (player.hp || 100) - enemyDmg);
    playSound('hit');
    combatLogAppend(`Ellenség ütése: ${enemyDmg} sebzés.`, 'text-red-400');
    checkPlayerHpInCombat();
    saveGame();
    updateUI();
    updateCombatUI();
}

function checkPlayerHpInCombat() {
    if ((player.hp || 100) <= 0) {
        currentCombat.active = false;
        document.getElementById('combat-modal').classList.add('hidden');
        document.getElementById('combat-heal-modal').classList.add('hidden');
        playSound('lose');
        triggerGameOver();
    }
}

function winCombat() {
    currentCombat.active = false;
    document.getElementById('combat-modal').classList.add('hidden');
    document.getElementById('combat-heal-modal').classList.add('hidden');
    playSound('win');

    const b = currentCombat.buildingObj;
    if (b) {
        b.looted = true;
        b.lootedTime = Date.now();
        b.lockedUntil = null;

        const targetSaved = savedBuildings.find(sb => sb.id === b.id);
        if(targetSaved) {
            targetSaved.looted = true;
            targetSaved.lootedTime = b.lootedTime;
            targetSaved.lockedUntil = null;
        }
    }

    refreshMapMarkers();

    const foundItems = rollLoot(b ? b.name : 'Roncstelep');
    let msg = `🎉 Győzelem! Találtál: `;
    if (foundItems.length === 0) {
        msg += " Semmi hasznosat.";
    } else {
        foundItems.forEach(itKey => {
            addItemToInventory(itKey, 1);
            msg += `${itemDatabase[itKey].icon} ${itemDatabase[itKey].name} `;
        });
    }

    logMessage(msg);
    addXp(35);
    saveGame();
}

function useCombatMedicine(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const item = itemDatabase[slot.key];
    if (item && item.type === 'medicine') {
        player.hp = Math.min(player.maxHp, (player.hp || 100) + item.value);
        slot.count--;
        if (slot.count <= 0) player.inventory.splice(index, 1);
        logMessage(`Harc közben bevetted: ${item.name} (+${item.value} HP)`);
        playSound('loot');
        document.getElementById('combat-heal-modal').classList.add('hidden');
        saveGame();
        updateUI();
        updateCombatUI();
        
        if (player.hp <= 0) {
            checkPlayerHpInCombat();
            return;
        }

        setTimeout(() => {
            if (currentCombat.active) {
                enemyTurn();
            }
        }, 300);
    }
}