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
    player.xp = (player.xp || 0) + amount;
    let nextLevelXp = (player.level || 1) * 100;
    if (player.xp >= nextLevelXp) {
        player.level = (player.level || 1) + 1;
        player.xp -= nextLevelXp;
        logMessage(`🎉 SZINTLÉPÉS! Elérted a(z) ${player.level}. szintet a Zónában!`);
    }
    updateHUD();
    saveGame();
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

function exportSaveData() {
    if (!currentUsername) {
        alert("Nincs aktív játékos!");
        return;
    }
    const gameData = { username: currentUsername, player: player, buildings: savedBuildings };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameData));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `survival_go_${currentUsername}_save.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    logMessage("Mentés exportálva fájlba!");
}

function importSaveData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            currentUsername = imported.username;
            player = Object.assign({}, player, imported.player);
            savedBuildings = imported.buildings || [];
            localStorage.setItem('zona_current_user', currentUsername);
            saveGame();
            document.getElementById('auth-modal').classList.add('hidden');
            updateUI();
            if (map) refreshMapMarkers();
            else initMap(47.4979, 19.0402);
            logMessage("Sikeres mentés importálás!");
        } catch (err) {
            alert("Hiba: " + err.message);
        }
    };
    reader.readAsText(file);
}

function startSurvivalTick() {
    if (survivalInterval) clearInterval(survivalInterval);
    survivalInterval = setInterval(() => {
        if (!currentUsername || currentCombat.active) return;
        player.hunger = Math.max(0, (Number(player.hunger) || 100) - 1);
        player.thirst = Math.max(0, (Number(player.thirst) || 100) - 1.5);
        if (player.hunger <= 0 || player.thirst <= 0) {
            player.hp = Math.max(0, (player.hp || 100) - 5);
            logMessage("⚠️ Kritikus állapot: Éhezel vagy szomjázol!");
            playSound('hit');
        }
        if (player.hp <= 0) triggerGameOver();
        saveGame();
        updateUI();
    }, 40000);
}

function updateHUD() {
    calculateStats();
    let currentWeight = calculateInventoryWeight();

    const avatarFile = player.avatar || 'avatar1.png';
    document.getElementById('hud-avatar').innerHTML = `<img src="/images/avatars/${avatarFile}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">`;
    document.getElementById('hud-name').textContent = player.username || "Stalker3";
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
        invGrid.innerHTML += `
            <div class="bg-gray-800 border border-gray-700 p-2 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-xl">${item.icon}</span>
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
        savedBuildings = data.buildings || [];
    } else {
        player.name = currentUsername;
        player.avatar = selectedAvatar;
        player.hp = 100;
        player.maxHp = 100;
        player.hunger = 100;
        player.thirst = 100;
        player.inventory = [{ key: 'bandage', count: 1 }, { key: 'knife', count: 1 }];
        savedBuildings = [];
    }

    document.getElementById('auth-modal').classList.add('hidden');
    updateUI();
    startSurvivalTick();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            initMap(pos.coords.latitude, pos.coords.longitude);
        }, () => { initMap(47.4979, 19.0402); }, { enableHighAccuracy: true });
    } else {
        initMap(47.4979, 19.0402);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    
    document.getElementById('btn-open-inventory').addEventListener('click', () => { document.getElementById('inventory-modal').classList.remove('hidden'); updateUI(); });
    document.getElementById('btn-close-inventory').addEventListener('click', () => { document.getElementById('inventory-modal').classList.add('hidden'); });
    document.getElementById('btn-open-equipment').addEventListener('click', () => { document.getElementById('equipment-modal').classList.remove('hidden'); updateUI(); });
    document.getElementById('btn-close-equipment').addEventListener('click', () => { document.getElementById('equipment-modal').classList.add('hidden'); });
    document.getElementById('btn-open-crafting').addEventListener('click', () => { document.getElementById('crafting-modal').classList.remove('hidden'); updateUI(); });
    document.getElementById('btn-close-crafting').addEventListener('click', () => { document.getElementById('crafting-modal').classList.add('hidden'); });
    document.getElementById('btn-combat-attack').addEventListener('click', combatAttack);
    document.getElementById('btn-combat-run').addEventListener('click', combatRun);
    document.getElementById('btn-combat-heal-open').addEventListener('click', () => { updateUI(); document.getElementById('combat-heal-modal').classList.remove('hidden'); });
    document.getElementById('btn-combat-heal-close').addEventListener('click', () => { document.getElementById('combat-heal-modal').classList.add('hidden'); });
    document.getElementById('btn-open-settings').addEventListener('click', () => { document.getElementById('settings-modal').classList.remove('hidden'); });
    document.getElementById('btn-close-settings').addEventListener('click', () => { document.getElementById('settings-modal').classList.add('hidden'); });

    
});