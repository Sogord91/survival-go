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
    const badge = document.getElementById('hud-badge');
    if (badge) badge.classList.toggle('hidden', !player.earlySurvivor);
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

function escapeAttr(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Ikon a rácsba: kép az ikoncsomagból, ha nincs (vagy nem töltődik be), az emoji
function tileIconHtml(item) {
    const emoji = (item && item.icon) || '📦';
    if (item && item.img) {
        return `<img src="/images/items/${item.img}.webp" alt="${escapeAttr(item.name)}" onerror="this.outerHTML='<span class=&quot;tile-emoji&quot;>${emoji}</span>'">`;
    }
    return `<span class="tile-emoji">${emoji}</span>`;
}

// Kopáscsík a rács mezőjének alján (szerszám, lámpa)
function tileDurabilityHtml(slot, item) {
    if (!item || !item.durability || slot.dur === undefined) return '';
    const pct = Math.max(0, Math.min(100, (slot.dur / item.durability) * 100));
    const color = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
    return `<div class="tile-dur"><div style="width:${pct}%;background:${color}"></div></div>`;
}

// ===== TÁRGY LAP (alulról felcsúszó részletek és gombok) =====
let itemSheetRef = null; // { source: 'inv', index, key } vagy { source: 'eq', slot, key }

function openItemSheet(source, ref) {
    if (source === 'inv') {
        const slot = player.inventory[ref];
        if (!slot) return;
        itemSheetRef = { source, index: ref, key: slot.key };
    } else {
        const key = player.equipment && player.equipment[ref];
        if (!key) return; // üres felszerelési hely
        itemSheetRef = { source, slot: ref, key };
    }
    renderItemSheet();
    document.getElementById('item-sheet').classList.remove('hidden');
}

function closeItemSheet() {
    itemSheetRef = null;
    const sheet = document.getElementById('item-sheet');
    if (sheet) sheet.classList.add('hidden');
}

// Állapotváltozás után: ha a tárgy még ott van, frissül; ha elfogyott / levették, a lap bezárul
function refreshItemSheet() {
    if (!itemSheetRef) return;
    const current = itemSheetRef.source === 'inv'
        ? (player.inventory[itemSheetRef.index] || {}).key
        : (player.equipment || {})[itemSheetRef.slot];
    if (current !== itemSheetRef.key) { closeItemSheet(); return; }
    renderItemSheet();
}

function renderItemSheet() {
    const ref = itemSheetRef;
    if (!ref) return;
    const item = itemDatabase[ref.key] || { name: ref.key, icon: '📦', desc: '', weight: 0 };
    const slot = ref.source === 'inv' ? player.inventory[ref.index] : { key: ref.key, count: 1 };
    const count = (slot && slot.count) || 1;
    document.getElementById('item-sheet-icon').innerHTML = tileIconHtml(item);
    document.getElementById('item-sheet-name').textContent = item.name + (count > 1 ? `  ×${count}` : '');
    document.getElementById('item-sheet-desc').textContent = item.desc || '';
    const weight = Math.round((item.weight || 0) * count * 100) / 100;
    document.getElementById('item-sheet-meta').textContent = `Súly: ${weight} kg` + (ref.source === 'eq' ? ' · Felszerelve' : '');
    document.getElementById('item-sheet-dur').innerHTML = ref.source === 'inv' ? durabilityHtml(slot, item) : '';

    const btn = (label, cls, action) => `<button onclick="${action}" class="flex-1 ${cls} text-white py-2.5 rounded-lg text-xs font-bold">${label}</button>`;
    let actions = '';
    if (ref.source === 'inv') {
        if (SurvivalStats.isConsumable(item)) actions += btn('Használ', 'bg-amber-600 hover:bg-amber-500', `itemSheetAction('use')`);
        else if (SurvivalStats.isEquippable(item)) actions += btn('Felvesz', 'bg-emerald-700 hover:bg-emerald-600', `itemSheetAction('equip')`);
        actions += btn(count > 1 ? 'Eldob 1 db' : 'Eldob', 'bg-red-900/80 hover:bg-red-800', `itemSheetAction('drop')`);
    } else {
        actions += btn('Levesz', 'bg-red-900/80 hover:bg-red-800', `itemSheetAction('unequip')`);
    }
    document.getElementById('item-sheet-actions').innerHTML = actions;
}

function itemSheetAction(action) {
    const ref = itemSheetRef;
    if (!ref) return;
    if (action === 'use' || action === 'equip') inventoryAction(ref.index);
    else if (action === 'drop') dropItem(ref.index);
    else if (action === 'unequip') unequip(ref.slot);
    // Fogyasztás / felvétel / levétel után a lap bezárul; eldobásnál nyitva marad (több darab egymás után)
    if (action !== 'drop') closeItemSheet();
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

    // Készlet: ikonrács (soronként 5), az üres helyek is látszanak. Koppintásra alul felcsúszik a tárgy lapja.
    const invGrid = document.getElementById('inventory-grid');
    const capacity = Math.max(player.maxInv || 10, player.inventory.length);
    let invHtml = '';
    for (let index = 0; index < capacity; index++) {
        const slot = player.inventory[index];
        if (!slot) { invHtml += '<div class="inv-tile empty"></div>'; continue; }
        const item = itemDatabase[slot.key] || { name: slot.key, icon: '📦', desc: '', weight: 0 };
        const count = slot.count > 1 ? `<span class="tile-count">×${slot.count}</span>` : '';
        invHtml += `<button class="inv-tile" onclick="openItemSheet('inv', ${index})" title="${escapeAttr(item.name)}">${tileIconHtml(item)}${count}${tileDurabilityHtml(slot, item)}</button>`;
    }
    invGrid.innerHTML = invHtml;
    refreshItemSheet();

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

    // Felszerelés: csak ikon (a név és a "Levesz" gomb a tárgy lapján)
    SurvivalStats.EQUIPMENT_SLOTS.forEach(slot => {
        const el = document.getElementById('eq-' + slot);
        if (!el) return;
        const itemKey = player.equipment && player.equipment[slot];
        const item = itemKey ? itemDatabase[itemKey] : null;
        if (item) {
            el.classList.remove('empty');
            el.innerHTML = tileIconHtml(item);
            el.title = item.name;
        } else {
            el.classList.add('empty');
            el.innerHTML = `<span class="tile-emoji">${el.dataset.empty || '▫️'}</span>`;
            el.title = slot === 'backpack' ? `Alap hátizsák (${player.maxInv || 10} hely)` : 'Üres';
        }
    });
    const summary = document.getElementById('eq-summary');
    if (summary) summary.innerHTML = `<span>🛡️ ${player.defense || 0}</span><span>🎒 ${player.maxInv || 10}</span>`;

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

    safeAddEvent('btn-install', 'click', installApp);
    updateInstallButton();
    safeAddEvent('btn-logout', 'click', () => {
        if (typeof logout === 'function') logout();
    });

});
