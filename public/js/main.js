// main.js
// A socket a socket.js-ben jön létre (az töltődik be elsőnek), a belépési token kezelése is ott van.
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// --- A JÁTÉKOS TELJES ÁLLAPOTA A SZERVERTŐL ---
// A szerver minden művelet (és a túlélési tick) után elküldi a teljes, friss állapotot.
// A kliens semmit nem számol és nem ment, csak lecseréli a saját másolatát és kirajzolja.
socket.on('player_state', (data) => {
    if (!data || !data.player) return;
    Object.assign(player, data.player);
    if (data.stats) applyStats(data.stats);

    if (data.critical) playSound('hit');
    if (data.leveledUp) {
        logMessage(`🎉 SZINTLÉPÉS! Elérted a(z) ${player.level}. szintet a Zónában!`);
        playSound('win');
    }
    (data.notices || []).forEach(n => logMessage('🔦 ' + n));
    (data.warnings || []).forEach(w => {
        if (w === 'hunger') logMessage('⚠️ Éhes vagy! Egyél valamit, mielőtt elfogy az erőd.');
        if (w === 'thirst') logMessage('⚠️ Szomjas vagy! Igyál valamit, mielőtt kiszáradsz.');
    });
    updateUI();

    // A halál állapotát a szerver tartja nyilván: halott karakternél a halálképernyő látszik
    // (belépés után is), újrakezdés után eltűnik.
    if (player.dead) triggerGameOver();
    else hideGameOver();

    // Harcablak (a harc állapota a szervertől jön) és a menekülés utáni személyes zárak a térképen
    syncCombatUI();
    if (typeof refreshMapMarkers === 'function') refreshMapMarkers();
});

// Rövid szerverüzenet (pl. GPS-ugrás miatti figyelmeztetés)
socket.on('player_notice', (data) => {
    if (data && data.message) logMessage(data.message);
});

socket.on('game_over', () => {
    triggerGameOver();
});

socket.on('respawn_result', (data) => {
    if (!data.success) {
        logMessage(data.message || "Nem sikerült új túlélőt indítani.");
        return;
    }
    logMessage(data.message);
    playSound('win');
});

// --- BIZTONSÁGOS CRAFT EREDMÉNY FOGADÁSA A SZERVERTŐL ---
if (typeof socket !== 'undefined' && socket) {
    socket.on('craft_result', (data) => {
        if (!data.success) {
            logMessage(data.message || "Nem sikerült a barkácsolás.");
            playSound('hit');
            return;
        }

        // Az új leltár a player_state üzenettel érkezik
        logMessage(data.message || "Sikeres barkácsolás!");
        playSound('win');
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

function updateHUD() {
    calculateStats();
    // Példa az updateHUD / updateUI függvény elejére:
    if (!document.getElementById('top-hud') || document.getElementById('game-hud-container').classList.contains('hud-hidden')) {
    return; // Kilép, ha még rejtve van a HUD
    }
    let currentWeight = player.weight || 0;

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

    // ?? : a 0 is valódi érték (a || 0-nál a 100-as alapértéket mutatta volna)
    const hp = player.hp ?? 100;
    const maxHp = player.maxHp || 100;
    const hunger = player.hunger ?? 100;
    const thirst = player.thirst ?? 100;
    const fatigue = player.fatigue ?? 0;

    let hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    // Felfelé kerekítünk, hogy élő karakter ne mutasson 0 HP-t
    document.getElementById('stat-hp').textContent = Math.max(0, Math.ceil(hp)) + '/' + maxHp;
    document.getElementById('bar-hp').style.width = hpPercent + '%';

    document.getElementById('stat-hunger').textContent = Math.max(0, Math.round(hunger)) + '%';
    document.getElementById('bar-hunger').style.width = Math.max(0, Math.min(100, hunger)) + '%';

    document.getElementById('stat-thirst').textContent = Math.max(0, Math.round(thirst)) + '%';
    document.getElementById('bar-thirst').style.width = Math.max(0, Math.min(100, thirst)) + '%';

    document.getElementById('stat-fatigue').textContent = Math.max(0, Math.round(fatigue)) + '%';
    document.getElementById('bar-fatigue').style.width = Math.max(0, Math.min(100, fatigue)) + '%';
}

// A tárgy ikonja: ha van képe az ikoncsomagból (img), azt mutatjuk; ha a kép még nincs feltöltve
// vagy nem töltődik be, az emoji jelenik meg helyette.
function itemIconHtml(item, sizeClass) {
    const emoji = (item && item.icon) || '📦';
    if (item && item.img) {
        const alt = String(item.name || '').replace(/"/g, '&quot;');
        return `<img src="/images/items/${item.img}.webp" class="${sizeClass} object-contain" alt="${alt}" onerror="this.outerHTML='<span class=&quot;text-xl&quot;>${emoji}</span>'">`;
    }
    if (emoji.includes('/') || emoji.includes('.png')) return `<img src="${emoji}" class="${sizeClass} object-contain" alt="">`;
    return `<span class="text-xl">${emoji}</span>`;
}

// A tárgy típusától függő gomb: fogyasztható -> "Használ", felszerelés -> "Felvesz", egyéb -> nincs gomb
function itemActionButton(slot, index) {
    const item = itemDatabase[slot.key];
    if (SurvivalStats.isConsumable(item)) {
        return `<button onclick="inventoryAction(${index})" class="bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">Használ</button>`;
    }
    if (SurvivalStats.isEquippable(item)) {
        return `<button onclick="inventoryAction(${index})" class="bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Felvesz</button>`;
    }
    return '';
}

// A leltár gombja: a tárgy KULCSÁT küldjük a szervernek (nem a sorszámát)
function inventoryAction(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const item = itemDatabase[slot.key];
    if (SurvivalStats.isConsumable(item)) useItem(slot.key);
    else if (SurvivalStats.isEquippable(item)) equipItem(slot.key, SurvivalStats.equipSlot(item));
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
        
        const iconHtml = itemIconHtml(item, 'w-8 h-8');

        invGrid.innerHTML += `
            <div class="bg-gray-800 border border-gray-700 p-2 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-9 h-9 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">${iconHtml}</div>
                    <div>
                        <div class="text-xs font-bold text-white flex items-center">${item.name} ${countBadge}</div>
                        <div class="text-[10px] text-gray-400">${item.desc} | Súly: ${Math.round((item.weight || 0) * slot.count * 100) / 100} kg</div>
                        ${durabilityHtml(slot, item)}
                    </div>
                </div>
                <div class="flex gap-1">
                    ${itemActionButton(slot, index)}
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
            if (item && item.type === 'medicine' && SurvivalStats.isConsumable(item)) {
                combatHealList.innerHTML += `
                    <div class="bg-gray-800 border border-emerald-500/50 p-2 rounded-xl flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            ${itemIconHtml(item, 'w-7 h-7')}
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

    const slots = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack', 'weapon', 'secondary', 'melee'];
    const slotLabels = { helmet: 'eq-helmet', torso: 'eq-torso', armor: 'eq-armor', legs: 'eq-legs', shoes: 'eq-shoes', backpack: 'eq-backpack', weapon: 'eq-weapon', secondary: 'eq-secondary', melee: 'eq-melee' };
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

    renderCraftList();
}

// Kopó tárgy (szerszám) tartóssága kis csíkkal
function durabilityHtml(slot, item) {
    if (!item || !item.durability || slot.dur === undefined) return '';
    const pct = Math.max(0, Math.min(100, (slot.dur / item.durability) * 100));
    const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
    const label = item.light ? `${Math.ceil(slot.dur)}/${item.durability} perc` : `${slot.dur}/${item.durability}`;
    return `<div class="flex items-center gap-1 mt-0.5"><div class="w-16 h-1.5 bg-gray-900 rounded overflow-hidden"><div class="${color} h-full" style="width:${pct}%"></div></div><span class="text-[9px] text-gray-400">${label}</span></div>`;
}

// Barkácsreceptek: alapanyag és szerszám (✓ / ✗), a műhelyes receptek zárolva
function renderCraftList() {
    const craftList = document.getElementById('crafting-list');
    if (!craftList) return;
    const have = (key) => player.inventory.filter(s => s.key === key).reduce((sum, s) => sum + s.count, 0);
    const name = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);
    let html = '';
    craftingRecipes.forEach(recipe => {
        const result = itemDatabase[recipe.result || recipe.key] || {};
        const reqText = Object.entries(recipe.req).map(([mat, qty]) => {
            const ok = have(mat) >= qty;
            return `<span class="${ok ? 'text-emerald-300' : 'text-red-400'}">${qty}× ${name(mat)}</span>`;
        }).join(', ');
        const toolText = (recipe.tools || []).map(entry => {
            const options = Array.isArray(entry) ? entry : [entry];
            const ok = options.some(k => have(k) > 0);
            return `<span class="${ok ? 'text-emerald-300' : 'text-red-400'}">${options.map(name).join(' / ')}</span>`;
        }).join(', ');
        const canCraft = !recipe.station
            && Object.entries(recipe.req).every(([mat, qty]) => have(mat) >= qty)
            && (recipe.tools || []).every(entry => (Array.isArray(entry) ? entry : [entry]).some(k => have(k) > 0));
        const button = recipe.station === 'workshop'
            ? `<span class="text-[10px] text-amber-400/80 text-right">🏭 Műhely kell<br>(hamarosan)</span>`
            : `<button onclick="craftItem({ key: '${recipe.key}' })" class="${canCraft ? '' : 'opacity-50 '}bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/80 px-3 py-1.5 clipped-badge text-xs font-bold text-emerald-200 transition shadow">Barkács</button>`;
        html += `
            <div class="hud-panel border border-emerald-600/40 p-3 rounded-xl flex items-center justify-between bg-emerald-950/40 ${recipe.station ? 'opacity-60' : ''}">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 flex items-center justify-center">${itemIconHtml(result, 'w-8 h-8')}</div>
                    <div>
                        <div class="text-xs font-bold text-emerald-300">${recipe.name}${recipe.count > 1 ? ` (${recipe.count} db)` : ''}</div>
                        <div class="text-[10px] text-emerald-400/80">${recipe.desc}</div>
                        <div class="text-[9px] text-amber-300/80">Kell: ${reqText}</div>
                        ${toolText ? `<div class="text-[9px] text-sky-300/80">Szerszám (kopik): ${toolText}</div>` : ''}
                    </div>
                </div>
                ${button}
            </div>
        `;
    });
    craftList.innerHTML = html;
}

function triggerGameOver() {
    const modal = document.getElementById('gameover-modal');
    if (!modal.classList.contains('hidden')) return; // már látszik (ne szóljon újra a hang minden frissítésnél)
    document.getElementById('combat-modal').classList.add('hidden');
    document.getElementById('combat-heal-modal').classList.add('hidden');
    modal.classList.remove('hidden');
    playSound('lose');
}

function hideGameOver() {
    const modal = document.getElementById('gameover-modal');
    if (modal) modal.classList.add('hidden');
}

// "Új Túlélő Indítása": a szerver nullázza a karaktert (kezdőcsomaggal), az új állapot player_state-tel jön
function requestRespawn() {
    if (typeof socket !== 'undefined' && socket && socket.connected) socket.emit('respawn');
}

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

    safeAddEvent('btn-gameover-reset', 'click', requestRespawn);

    // Térkép stílusa (a választást a böngésző megjegyzi)
    const mapStyleSelect = document.getElementById('map-style-select');
    if (mapStyleSelect) {
        mapStyleSelect.value = loadMapStyle();
        mapStyleSelect.addEventListener('change', () => applyMapStyle(mapStyleSelect.value));
    }

    safeAddEvent('btn-logout', 'click', () => {
        if (typeof logout === 'function') logout();
    });

});