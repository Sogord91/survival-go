// main.js
const socket = io();
let currentUsername = localStorage.getItem('zona_current_user') || "";
let survivalInterval = null;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// --- BIZTONSÁGOS, SZERVER VÉEZÉRELT TÚLÉLÉSI ADATOK FOGADÁSA ---
socket.on('server_status_update', (data) => {
    player.hunger = data.hunger;
    player.thirst = data.thirst;
    player.hp = data.hp;

    if (data.isCritical) {
        playSound('hit');
    }
    updateUI();
});

socket.on('xp_updated', (data) => {
    player.xp = data.xp;
    player.level = data.level;

    if (data.leveledUp) {
        logMessage(`🎉 SZINTLÉPÉS! Elérted a(z) ${player.level}. szintet a Zónában!`);
        playSound('win');
    }
    updateHUD();
});

socket.on('game_over', () => {
    triggerGameOver();
});

// --- BIZTONSÁGOS CRAFT EREDMÉNY FOGADÁSA A SZERVERTŐL ---
if (typeof socket !== 'undefined' && socket) {
    socket.on('craft_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült a barkácsolás.");
            playSound('hit');
            return;
        }

        if (data.inventory) {
            player.inventory = data.inventory;
        }

        logMessage(data.message || "Sikeres barkácsolás!");
        playSound('win');
        
        saveGame();
        updateUI();
    });
}

function playSound(type) {
    try {
        initAudio();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'hit') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'attack') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'win') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(554.37, now + 0.1);
            osc.frequency.setValueAtTime(659.25, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'lose') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.5);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        } else if (type === 'loot') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        }
    } catch(e) { console.error('Audio error:', e); }
}


function logMessage(text) {
    const logBox = document.getElementById('game-log');
    if(logBox) {
        const div = document.createElement('div');
        div.textContent = text;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    const toast = document.getElementById('toast-notification');
    if(toast) {
        toast.textContent = text;
        toast.classList.remove('opacity-0');
        if (window.toastTimeout) clearTimeout(window.toastTimeout);
        window.toastTimeout = setTimeout(() => {
            toast.classList.add('opacity-0');
        }, 3500);
    }
}

function addXp(amount) {
    if (!currentUsername) return;
    // Elküldjük a szervernek a jóváírandó XP-t, a szerver számol és validál!
    socket.emit('gain_xp', {
        username: currentUsername,
        amount: amount
    });
}

function saveGame() {
    if (!currentUsername) return;
    socket.emit('save_player', {
        username: currentUsername,
        player: player,
        buildings: savedBuildings
    });
}

socket.on('save_success', () => {
    console.log("💾 Játék sikeresen mentve MongoDB-be!");
});

function updateHUD() {
    calculateStats();
    // Példa az updateHUD / updateUI függvény elejére:
    if (!document.getElementById('top-hud') || document.getElementById('game-hud-container').classList.contains('hud-hidden')) {
    return; // Kilép, ha még rejtve van a HUD
    }
    let currentWeight = calculateInventoryWeight();

    const avatarFile = player.avatar;
    document.getElementById('hud-avatar').innerHTML = `<img src="/images/avatars/${avatarFile}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
    document.getElementById('hud-name').textContent = player.username || player.name || "Túlélő";
    document.getElementById('hud-level').textContent = player.level || 1;
    document.getElementById('hud-xp').textContent = player.xp || 0;
    document.getElementById('hud-defense').textContent = player.defense || 0;

    const weightEl = document.getElementById('hud-weight');
    if (weightEl) {
        weightEl.textContent = `${currentWeight} / ${player.maxWeight} kg`;
        weightEl.className = currentWeight > player.maxWeight ? "text-red-500 font-bold animate-pulse" : "text-amber-300 font-bold";
    }

    let hpPercent = Math.max(0, Math.min(100, ((player.hp || 100) / (player.maxHp || 100)) * 100));
    document.getElementById('stat-hp').textContent = Math.round(player.hp || 100) + '/' + (player.maxHp || 100);
    document.getElementById('bar-hp').style.width = hpPercent + '%';

    document.getElementById('stat-hunger').textContent = Math.max(0, Math.round(player.hunger || 100)) + '%';
    document.getElementById('bar-hunger').style.width = Math.max(0, Math.min(100, player.hunger || 100)) + '%';

    document.getElementById('stat-thirst').textContent = Math.max(0, Math.round(player.thirst || 100)) + '%';
    document.getElementById('bar-thirst').style.width = Math.max(0, Math.min(100, player.thirst || 100)) + '%';

    document.getElementById('stat-fatigue').textContent = Math.max(0, Math.round(player.fatigue || 0)) + '%';
    document.getElementById('bar-fatigue').style.width = Math.max(0, Math.min(100, player.fatigue || 0)) + '%';
}

function updateUI() {
    updateHUD();
    if (!Array.isArray(player.inventory)) player.inventory = [];
    document.getElementById('inv-count').textContent = player.inventory.length;
    document.getElementById('inv-max').textContent = player.maxInv || 10;

    const invGrid = document.getElementById('inventory-grid');
    invGrid.innerHTML = '';
    player.inventory.forEach((slot, index) => {
        const item = itemDatabase[slot.key] || { name: slot.key, icon: '📦', desc: '', weight: 0 };
        const countBadge = slot.count > 1 ? `<span class="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">x${slot.count}</span>` : '';
        
        // ITT VÁLTJUK ÁT: Ha az icon tartalmazza a '/' jelet vagy '.png'-t, akkor képként illesztjük be, ha nem, akkor emojiként!
        let iconHtml = '';
        if (item.icon && (item.icon.includes('/') || item.icon.includes('.png'))) {
            iconHtml = `<img src="${item.icon}" class="w-8 h-8 object-contain" alt="${item.name}">`;
        } else {
            iconHtml = `<span class="text-xl">${item.icon || '📦'}</span>`;
        }

        invGrid.innerHTML += `
            <div class="bg-gray-800 border border-gray-700 p-2 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-9 h-9 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">${iconHtml}</div>
                    <div>
                        <div class="text-xs font-bold text-white flex items-center">${item.name} ${countBadge}</div>
                        <div class="text-[10px] text-gray-400">${item.desc} | Súly: ${(item.weight || 0) * slot.count} kg</div>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="useItem(${index})" class="bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">Használ</button>
                    <button onclick="dropItem(${index})" class="bg-red-900/60 hover:bg-red-800 text-red-200 px-2 py-1 rounded text-[10px] font-bold">Eldob</button>
                </div>
            </div>
        `;
    });

    const combatHealList = document.getElementById('combat-heal-list');
    if (combatHealList) {
        combatHealList.innerHTML = '';
        player.inventory.forEach((slot, index) => {
            const item = itemDatabase[slot.key];
            if (item && item.type === 'medicine') {
                combatHealList.innerHTML += `
                    <div class="bg-gray-800 border border-emerald-500/50 p-2 rounded-xl flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">${item.icon}</span>
                            <div>
                                <div class="text-xs font-bold text-white">${item.name} (x${slot.count})</div>
                                <div class="text-[10px] text-emerald-400">${item.desc}</div>
                            </div>
                        </div>
                        <button onclick="useCombatMedicine(${index})" class="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold">Bevesz</button>
                    </div>
                `;
            }
        });
        if (combatHealList.innerHTML === '') {
            combatHealList.innerHTML = `<div class="text-xs text-gray-500 text-center py-3">Nincs nálad orvosi szer!</div>`;
        }
    }

    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon'];
    const slotLabels = { helmet: 'eq-helmet', torso: 'eq-torso', armor: 'eq-armor', legs: 'eq-legs', shoes: 'eq-shoes', backpack: 'eq-backpack', weapon: 'eq-weapon' };
    slots.forEach(slot => {
        const itemKey = player.equipment[slot];
        const el = document.getElementById(slotLabels[slot]);
        if (itemKey && itemDatabase[itemKey]) {
            el.textContent = itemDatabase[itemKey].name;
            el.className = "text-xs font-bold text-amber-400";
        } else {
            el.textContent = (slot === 'backpack') ? `Alap (${player.maxInv || 10} hely)` : 'Nincs felszerelve';
            el.className = "text-xs font-bold text-gray-500";
        }
    });

    const craftList = document.getElementById('crafting-list');
    craftList.innerHTML = '';
    craftingRecipes.forEach(recipe => {
        let reqText = '';
        for (let [mat, qty] of Object.entries(recipe.req)) {
            if(itemDatabase[mat]) reqText += `${qty}x ${itemDatabase[mat].name}, `;
        }
        craftList.innerHTML += `
            <div class="bg-gray-800 border border-gray-700 p-3 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${recipe.icon}</span>
                    <div>
                        <div class="text-xs font-bold text-white">${recipe.name}</div>
                        <div class="text-[10px] text-gray-400">${recipe.desc}</div>
                        <div class="text-[9px] text-amber-500/80">Kell: ${reqText.slice(0, -2)}</div>
                    </div>
                </div>
                <button onclick='craftItem(${JSON.stringify(recipe)})' class="bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Barkács</button>
            </div>
        `;
    });
}

function triggerGameOver() {
    currentCombat.active = false;
    if (survivalInterval) clearInterval(survivalInterval);
    document.getElementById('combat-modal').classList.add('hidden');
    document.getElementById('combat-heal-modal').classList.add('hidden');
    document.getElementById('gameover-modal').classList.remove('hidden');
    playSound('lose');
}

socket.on('player_loaded', (data) => {
    if (data.player) {
        player = Object.assign({}, player, data.player);
        if (data.username) player.username = data.username;
        savedBuildings = data.buildings || [];
    } else {
        player.username = currentUsername;
        player.name = currentUsername;
        player.avatar = selectedAvatar;
        player.hp = 100;
        player.maxHp = 100;
        player.hunger = 100;
        player.thirst = 100;
        player.inventory = [{ key: 'bandage', count: 1 }, { key: 'knife', count: 1 }];
        savedBuildings = [];
    }

    // Bejelentkezési ablak elrejtése és a Játékmód / HUD megjelenítése
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('game-hud-container').classList.remove('hud-hidden'); // EZ HOZZÁ KELL!

    updateUI();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            initMap(pos.coords.latitude, pos.coords.longitude);
        }, () => { initMap(47.4979, 19.0402); }, { enableHighAccuracy: true });
    } else {
        initMap(47.4979, 19.0402);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    
    const safeAddEvent = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // Készlet (egyesített felszerelés és hátizsák ablak) nyitása
    safeAddEvent('btn-open-equipment', 'click', () => { 
        const modal = document.getElementById('equipment-modal');
        if (modal) modal.classList.remove('hidden'); 
        if (typeof updateUI === 'function') updateUI(); 
    });
    
    safeAddEvent('btn-close-equipment', 'click', () => { 
        const modal = document.getElementById('equipment-modal');
        if (modal) modal.classList.add('hidden'); 
    });

    // Craft ablak
    safeAddEvent('btn-open-crafting', 'click', () => { 
        const modal = document.getElementById('crafting-modal');
        if (modal) modal.classList.remove('hidden'); 
        if (typeof updateUI === 'function') updateUI(); 
    });
    
    safeAddEvent('btn-close-crafting', 'click', () => { 
        const modal = document.getElementById('crafting-modal');
        if (modal) modal.classList.add('hidden'); 
    });

    // Harc és beállítások
    safeAddEvent('btn-combat-attack', 'click', typeof combatAttack === 'function' ? combatAttack : null);
    safeAddEvent('btn-combat-run', 'click', typeof combatRun === 'function' ? combatRun : null);
    
    safeAddEvent('btn-combat-heal-open', 'click', () => { 
        if (typeof updateUI === 'function') updateUI(); 
        const modal = document.getElementById('combat-heal-modal');
        if (modal) modal.classList.remove('hidden'); 
    });
    
    safeAddEvent('btn-combat-heal-close', 'click', () => { 
        const modal = document.getElementById('combat-heal-modal');
        if (modal) modal.classList.add('hidden'); 
    });
    
    safeAddEvent('btn-open-settings', 'click', () => { 
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('hidden'); 
    });
    
    safeAddEvent('btn-close-settings', 'click', () => { 
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.add('hidden'); 
    });

});