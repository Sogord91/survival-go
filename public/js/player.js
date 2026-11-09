// player.js
// A kliens oldali játékos-objektum CSAK megjelenítésre szolgál: az igazi állapot a szerveren van,
// és minden változás után a player_state üzenettel érkezik (lásd main.js).


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
    weight: 0,
    inventory: [],
    combat: null,       // folyamatban lévő harc (a szervertől)
    dangerUntil: {},    // menekülés utáni személyes zárak (a szervertől)
    equipment: { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null, secondary: null, melee: null }
};

// A származtatott értékek (max HP, védelem, slotok, teherbírás, súly) átvétele a közös stats.js eredményéből
function applyStats(stats) {
    player.maxHp = stats.maxHp;
    player.defense = stats.defense;
    player.maxInv = stats.slots;
    player.maxWeight = stats.maxWeight;
    player.weight = stats.weight;
    player.weightHardCap = stats.weightHardCap;
}

// Ugyanaz a számítás, mint a szerveren (stats.js). Csak megjelenítésre: a HP-hoz nem nyúl.
function calculateStats() {
    if (!player.equipment) player.equipment = { helmet: null, torso: null, armor: null, legs: null, shoes: null, backpack: null, weapon: null, secondary: null, melee: null };
    if (!Array.isArray(player.inventory)) player.inventory = [];
    applyStats(SurvivalStats.computeStats(player, itemDatabase));
}

// Biztonságos, szerver oldali craftolás indítása
function craftItem(recipe) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('craft_item', {
            recipeKey: recipe.key
        });
    }
}

if (typeof socket !== 'undefined' && socket) {
    socket.on('item_use_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült használni a tárgyat.");
            playSound('hit');
            return;
        }
        logMessage(data.message);
        playSound('loot');
    });

    socket.on('repair_result', (data) => {
        logMessage(data.message || (data.success ? 'Megjavítva.' : 'Nem sikerült megjavítani.'));
        playSound(data.success ? 'loot' : 'hit');
    });

    socket.on('equip_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült felszerelni a tárgyat.");
            playSound('hit');
            return;
        }
        logMessage(data.message);
        playSound('win');
    });

    socket.on('quickbar_result', (data) => {
        if (data.message) logMessage(data.message);
        if (typeof renderItemSheet === 'function' && itemSheetRef) renderItemSheet();
    });

    socket.on('drop_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült eldobni a tárgyat.");
            playSound('hit');
            return;
        }
        logMessage(data.message);
    });

    socket.on('sort_result', (data) => {
        if (!data.success) logMessage(data.message || 'Nem sikerült rendezni a leltárt.');
    });
}

// Tárgy eldobása (szerver oldali kérés; az eldobott tárgy eltűnik)
function dropItem(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('drop_item', {
            itemKey: slot.key,
            count: 1
        });
    }
}

// Tárgy használata (szerver oldali kérés)
function useItem(itemKey) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('use_item', {
            itemKey: itemKey
        });
    }
}

// Tárgy felszerelése (szerver oldali kérés)
function equipItem(itemKey, slotType, index) {
    if (typeof socket !== 'undefined' && socket) {
        const data = { itemKey: itemKey, slotType: slotType };
        if (Number.isInteger(index)) data.index = index; // pontosan azt a darabot vesszük fel (a kopottsága miatt)
        socket.emit('equip_item', data);
    }
}

// Felszerelés levétele (szerver oldali kérés; a szerver ellenőrzi, hogy elfér-e)
function unequip(slot) {
    if (!player.equipment[slot]) return;
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('unequip_item', {
            slotType: slot
        });
    }
}
