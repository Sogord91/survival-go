// player.js


let player = {
    username: 'Túlélő',
    avatar: 'avatar1.png',
    hp: 100,
    maxHp: 100,
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    level: 1,
    xp: 0,
    defense: 0,
    maxInv: 10,
    maxWeight: 30,
    inventory: [],
    equipment: { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null }
};

function calculateInventoryWeight() {
    let totalWeight = 0;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    player.inventory.forEach(slot => {
        const item = itemDatabase[slot.key];
        if (item && item.weight) {
            totalWeight += item.weight * (slot.count || 1);
        }
    });
    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon'];
    slots.forEach(slotName => {
        if (!player.equipment) player.equipment = {};
        const eqKey = player.equipment[slotName];
        if (eqKey && itemDatabase[eqKey] && itemDatabase[eqKey].weight) {
            totalWeight += itemDatabase[eqKey].weight;
        }
    });
    return Math.round(totalWeight * 10) / 10;
}

// Biztonságos, szerver oldali craftolás indítása
function craftItem(recipe) {
    if (!currentUsername && typeof player !== 'undefined') {
        currentUsername = player.username;
    }
    if (!currentUsername) return;

    if (typeof socket !== 'undefined' && socket) {
        socket.emit('craft_item', {
            username: currentUsername,
            recipeKey: recipe.key
        });
    }
}

function calculateStats() {
    if (!player.equipment) player.equipment = { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null };
    let totalDef = 0;
    let totalHpBonus = 0;
    let totalSlots = 10;
    let maxWeightBonus = 0;

    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack'];
    slots.forEach(slot => {
        const itemKey = player.equipment[slot];
        if (itemKey && itemDatabase[itemKey]) {
            const item = itemDatabase[itemKey];
            if (item.def) totalDef += item.def;
            if (item.hpBonus) totalHpBonus += item.hpBonus;
            if (slot === 'backpack') {
                if (item.bonusSlots) totalSlots += item.bonusSlots;
                if (item.maxWeightBonus) maxWeightBonus += item.maxWeightBonus;
            }
        }
    });

    player.defense = totalDef;
    player.maxInv = totalSlots;
    player.maxWeight = 30 + maxWeightBonus;

    let prevMaxHp = player.maxHp || 100;
    player.maxHp = 100 + totalHpBonus;
    if (player.maxHp > prevMaxHp) {
        player.hp = (player.hp || 100) + (player.maxHp - prevMaxHp);
    }
    player.hp = Math.min(player.hp || 100, player.maxHp);
}

function addItemToInventory(itemKey, amount = 1) {
    const itemConfig = itemDatabase[itemKey];
    if (!itemConfig) return false;

    calculateStats();
    let currentWeight = calculateInventoryWeight();
    let addedWeight = (itemConfig.weight || 0) * amount;

    if (currentWeight + addedWeight > player.maxWeight) {
        logMessage(`Túlsúly! Nincs elég kapacitás (${currentWeight}/${player.maxWeight} kg)!`);
        playSound('hit');
        return false;
    }

    if (itemConfig.stackable) {
        let existing = player.inventory.find(slot => slot.key === itemKey);
        if (existing) {
            existing.count += amount;
            saveGame();
            updateUI();
            return true;
        }
    }

    if (player.inventory.length >= (player.maxInv || 10)) {
        logMessage("A hátizsákodban nincsenek szabad slotok!");
        playSound('hit');
        return false;
    }

    player.inventory.push({ key: itemKey, count: amount });
    saveGame();
    updateUI();
    return true;
}

if (typeof socket !== 'undefined' && socket) {
    socket.on('item_use_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült használni a tárgyat.");
            playSound('hit');
            return;
        }
        if (data.inventory) player.inventory = data.inventory;
        if (data.player) {
            player.hp = data.player.hp;
            player.hunger = data.player.hunger;
            player.thirst = data.player.thirst;
        }
        logMessage(data.message);
        playSound('loot');
        saveGame();
        updateUI();
    });

    socket.on('equip_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült felszerelni a tárgyat.");
            playSound('hit');
            return;
        }
        if (data.inventory) player.inventory = data.inventory;
        if (data.equipment) player.equipment = data.equipment;
        logMessage(data.message);
        playSound('win');
        saveGame();
        updateUI();
    });
}

function dropItem(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const item = itemDatabase[slot.key];
    
    slot.count--;
    if (slot.count <= 0) {
        player.inventory.splice(index, 1);
    }
    logMessage(`Eldobtál 1 db-ot: ${item.name}`);
    saveGame();
    updateUI();
}

// Tárgy használata (szerver oldali kérés)
function useItem(itemKey) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('use_item', {
            username: player.username,
            itemKey: itemKey
        });
    }
}

// Tárgy felszerelése (szerver oldali kérés)
function equipItem(itemKey, slotType) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('equip_item', {
            username: player.username,
            itemKey: itemKey,
            slotType: slotType
        });
    }
}

function unequip(slot) {
    if (!player.equipment[slot]) return;
    
    if (slot === 'backpack') {
        let futureSlots = 10;
        if (player.inventory.length > futureSlots) {
            logMessage(`Nem veheted le a táskát! Túl sok tárgy van nálad (${player.inventory.length}/${futureSlots}), pakolj ki előbb!`);
            playSound('hit');
            return;
        }
    }

    if (addItemToInventory(player.equipment[slot], 1)) {
        player.equipment[slot] = null;
        calculateStats();
        logMessage("Tárgy levéve a slotról.");
        saveGame();
        updateUI();
    }
}
