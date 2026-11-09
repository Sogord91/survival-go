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


// Rövid értesítés a HUD alatt: egyszerre legfeljebb 3 látszik (a legújabb felül), mindegyik TOAST_MS ideig,
// így egy gyors új üzenet nem tünteti el azonnal az előzőt (pl. a zsákmányt)
const TOAST_MS = 6000;
const TOAST_MAX = 3;
function showToast(text) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = text;
    stack.prepend(item);
    while (stack.children.length > TOAST_MAX) stack.lastElementChild.remove();
    setTimeout(() => {
        item.classList.add('leaving');
        setTimeout(() => item.remove(), 450);
    }, TOAST_MS);
}

// A Napló ablak tartalma: az utolsó üzenetek időponttal (csak a böngészőben, frissítéskor kiürül)
const JOURNAL_MAX = 60;
const journalEntries = [];
function renderJournal() {
    const list = document.getElementById('journal-list');
    if (!list) return;
    if (!journalEntries.length) { list.innerHTML = '<div class="text-[11px] text-gray-400">Még nem történt semmi.</div>'; return; }
    list.innerHTML = journalEntries.map(e =>
        `<div class="text-[11px] text-emerald-100 bg-black/30 border border-emerald-800/50 rounded-lg px-2 py-1.5"><span class="text-emerald-500/80 font-mono mr-1.5">${e.time}</span>${escapeAttr(e.text)}</div>`
    ).join('');
}

function logMessage(text) {
    const now = new Date();
    journalEntries.unshift({ text: String(text), time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') });
    if (journalEntries.length > JOURNAL_MAX) journalEntries.length = JOURNAL_MAX;
    const journalModal = document.getElementById('journal-modal');
    if (journalModal && !journalModal.classList.contains('hidden')) renderJournal();

    const logBox = document.getElementById('game-log');
    if(logBox) {
        const div = document.createElement('div');
        div.textContent = text;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    showToast(text);
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
    // A szerver szabálya: a következő szinthez szint × 100 XP kell (server.js, szintlépés)
    const xpNow = Math.max(0, Math.floor(Number(player.xp) || 0));
    const xpNext = Math.max(1, (player.level || 1) * 100);
    document.getElementById('hud-xp').textContent = xpNow;
    const xpNextEl = document.getElementById('hud-xp-next');
    if (xpNextEl) xpNextEl.textContent = xpNext;
    const xpBar = document.getElementById('bar-xp');
    if (xpBar) xpBar.style.width = Math.min(100, (xpNow / xpNext) * 100) + '%';
    document.getElementById('hud-defense').textContent = player.defense || 0;
    const moneyEl = document.getElementById('hud-money');
    if (moneyEl) moneyEl.textContent = Math.max(0, Math.floor(Number(player.money) || 0));

    const weightEl = document.getElementById('hud-weight');
    if (weightEl) {
        weightEl.textContent = `${Math.round(currentWeight * 10) / 10}/${player.maxWeight} kg`;
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
    renderStatSegments('hp', hpPercent, hpPercent < 20);

    document.getElementById('stat-hunger').textContent = Math.max(0, Math.round(hunger)) + '%';
    renderStatSegments('hunger', hunger, hunger < 20);

    document.getElementById('stat-thirst').textContent = Math.max(0, Math.round(thirst)) + '%';
    renderStatSegments('thirst', thirst, thirst < 20);

    // A játék fáradtsággal számol (0 = kipihent), a kijelzés Energia: 100%-ról fogy, mint a többi csík
    const energy = Math.max(0, Math.min(100, 100 - fatigue));
    document.getElementById('stat-fatigue').textContent = Math.round(energy) + '%';
    // A szín a büntetési fokozatokat követi: zöld, 40% energia alatt narancs (gyengébb ütés), 15% alatt piros
    const fatigueRow = document.getElementById('stat-row-fatigue');
    if (fatigueRow) fatigueRow.style.setProperty('--c', fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f97316' : '#84cc16');
    renderStatSegments('fatigue', energy, fatigue >= 85);
}

// 10 szegmenses csík: minden szegmens 10%; a félig telt szegmens részben színes (--f)
function renderStatSegments(key, percent, critical) {
    const bar = document.getElementById('bar-' + key);
    if (!bar) return;
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    if (bar.children.length !== 10) bar.innerHTML = '<i></i>'.repeat(10);
    [...bar.children].forEach((seg, i) => {
        const fill = Math.max(0, Math.min(1, value / 10 - i));
        seg.style.setProperty('--f', Math.round(fill * 100) + '%');
        seg.classList.toggle('on', fill > 0);
    });
    bar.dataset.value = String(Math.round(value));
    const row = document.getElementById('stat-row-' + key);
    if (row) row.classList.toggle('crit', !!critical);
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
    if (item.wear && slot.dur >= item.durability) return ''; // ép felszerelésnél nincs csík (kevesebb zaj a rácsban)
    const pct = Math.max(0, Math.min(100, (slot.dur / item.durability) * 100));
    const color = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
    return `<div class="tile-dur"><div style="width:${pct}%;background:${color}"></div></div>`;
}

// A leírás szöveges része: a zárójeles számokat (pl. "(+4 Véd.)") elhagyjuk, mert a pontos
// értékeket az itemStatLines a tárgy adataiból számolja (így a kettő nem csúszhat szét)
const STAT_PAREN = /\s*\([^)]*(Véd|HP|Sebzés|hely|kg|fáradtság)[^)]*\)\s*$/i;
function itemFlavorText(desc) {
    const text = String(desc || '').replace(STAT_PAREN, '').replace(/\s*-\s*$/, '').trim();
    // csak számokból álló leírás (pl. "+40 Éhség, -20 Fáradtság"): a hatások úgyis látszanak
    if (text && text.split(',').every(part => /^\s*[+-]\d/.test(part))) return '';
    return text;
}

// A tárgy minden hatása a tárgy adataiból (ugyanazok az értékek, amikkel a szerver számol)
function itemStatLines(item) {
    if (!item) return [];
    const lines = [];
    const signed = n => (n > 0 ? '+' : '') + n;
    if (typeof item.dmg === 'number') lines.push(`Sebzés: ${item.dmg}`);
    if (item.reqAmmo) lines.push(`Lőszer: ${(itemDatabase[item.reqAmmo] || {}).name || item.reqAmmo}`);
    if (item.def) lines.push(`${signed(item.def)} Védelem`);
    if (item.hpBonus) lines.push(`${signed(item.hpBonus)} Max HP`);
    if (item.bonusSlots) lines.push(`${signed(item.bonusSlots)} hely`);
    if (item.maxWeightBonus) lines.push(`${signed(item.maxWeightBonus)} kg teherbírás`);
    if (typeof item.fatigueRate === 'number' && item.fatigueRate !== 1) lines.push(`${signed(Math.round((item.fatigueRate - 1) * 100))}% fáradás`);
    const fx = item.effects || {};
    if (fx.hp) lines.push(`${signed(fx.hp)} Élet`);
    if (fx.hunger) lines.push(`${signed(fx.hunger)} Éhség`);
    if (fx.thirst) lines.push(`${signed(fx.thirst)} Szomjúság`);
    if (fx.fatigue) lines.push(`${signed(-fx.fatigue)} Energia`); // a fáradtság csökkenése = energia nő
    if (item.light) lines.push('Fényforrás');
    return lines;
}

// ===== ÖSSZEHASONLÍTÁS a felszerelt tárggyal =====
// A számszerű értékek, amiket két tárgy között összevetünk. "better": melyik irány a jobb.
const COMPARE_STATS = [
    { key: 'dmg', label: 'Sebzés', get: it => it.dmg },
    { key: 'def', label: 'Védelem', get: it => it.def },
    { key: 'hpBonus', label: 'Max HP', get: it => it.hpBonus },
    { key: 'bonusSlots', label: 'hely', get: it => it.bonusSlots },
    { key: 'maxWeightBonus', label: 'kg teherbírás', get: it => it.maxWeightBonus },
    // fáradás: a kisebb a jobb, százalékban mutatjuk
    { key: 'fatigueRate', label: '% fáradás', get: it => typeof it.fatigueRate === 'number' ? Math.round((it.fatigueRate - 1) * 100) : undefined, lowerIsBetter: true },
    { key: 'weight', label: 'kg súly', get: it => it.weight, lowerIsBetter: true, decimals: 2 }
];

// Különbségek: [{ label, diff, good }] - csak ami tényleg eltér
function itemCompareDiffs(item, other) {
    const out = [];
    for (const stat of COMPARE_STATS) {
        const a = Number(stat.get(item) || 0), b = Number(stat.get(other || {}) || 0);
        const factor = Math.pow(10, stat.decimals || 0);
        const diff = Math.round((a - b) * factor) / factor;
        if (!diff) continue;
        out.push({ label: stat.label, diff, good: stat.lowerIsBetter ? diff < 0 : diff > 0 });
    }
    return out;
}

const COMPARE_SLOT_NAMES = {
    helmet: 'Fej', torso: 'Felsőtest', armor: 'Mellény', legs: 'Láb', shoes: 'Cipő',
    backpack: 'Táska', weapon: 'Fő fegyver', secondary: 'Másodlagos fegyver', melee: 'Közelharci fegyver'
};

// A leltárban lévő felvehető tárgynál megmutatja, mi van most azon a helyen és mi változna
function itemCompareHtml(item, key) {
    const slot = SurvivalStats.equipSlot(item);
    if (!slot) return '';
    const equippedKey = (player.equipment || {})[slot];
    const slotName = COMPARE_SLOT_NAMES[slot] || slot;
    if (equippedKey === key) {
        return `<div class="text-[10px] text-emerald-400/80">Ugyanez van rajtad (${escapeAttr(slotName)}).</div>`;
    }
    const equipped = equippedKey ? (itemDatabase[equippedKey] || { name: equippedKey, icon: '📦' }) : null;
    // a tönkrement felvett tárgy nem ad bónuszt: ahhoz képest minden érték nyereség (a súlyt kivéve)
    const equippedBroken = !!equipped && SurvivalStats.isBroken(player, slot);
    const diffs = itemCompareDiffs(item, equippedBroken ? { weight: equipped.weight } : equipped);
    const chip = d => {
        const cls = d.good ? 'bg-emerald-900/70 border-emerald-500/70 text-emerald-200' : 'bg-red-950/70 border-red-600/70 text-red-200';
        const arrow = d.good ? '▲' : '▼';
        return `<span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ${cls}">${arrow} ${d.diff > 0 ? '+' : ''}${d.diff} ${escapeAttr(d.label)}</span>`;
    };
    const head = equipped
        ? `<div class="flex items-center gap-2">
               <div class="inv-tile shrink-0" style="width:2.25rem">${tileIconHtml(equipped)}</div>
               <div class="min-w-0">
                   <div class="text-[9px] uppercase tracking-wide text-emerald-500/80">Most felszerelve · ${escapeAttr(slotName)}</div>
                   <div class="text-xs font-bold text-white truncate">${escapeAttr(equipped.name)}${equippedBroken ? ' <span class="text-red-400">(tönkrement)</span>' : ''}</div>
               </div>
           </div>`
        : `<div class="text-[10px] text-emerald-400/80">${escapeAttr(slotName)}: most üres</div>`;
    const body = diffs.length
        ? `<div class="text-[9px] uppercase tracking-wide text-gray-400 mt-1.5 mb-1">Ha felveszed</div><div class="flex flex-wrap gap-1">${diffs.map(chip).join('')}</div>`
        : `<div class="text-[10px] text-gray-400 mt-1.5">Nincs különbség az értékekben.</div>`;
    return head + body;
}

// ===== ZSÁKMÁNY ABLAK =====
// Kutatás (vagy győztes harc) után a talált holmi itt jelenik meg. Amit nem teszel el, az LOOT_CACHE_MINUTES
// percig az épületben marad (📦 a térképen); bárki elviheti, neked a visszatérés ingyenes.
// Bezáráskor / kilépéskor semmi nem vész el, minden ott marad.
let lootWindow = null; // { buildingId, buildingName, cache: { items, until, mine } }
let lootTimer = null;

function openLootWindow(buildingId, buildingName, cache) {
    if (!buildingId || !cache) return;
    lootWindow = { buildingId, buildingName, cache };
    renderLootWindow();
    document.getElementById('loot-modal').classList.remove('hidden');
    if (lootTimer) clearInterval(lootTimer);
    lootTimer = setInterval(() => { if (lootWindow) renderLootWindow(); }, 15000);
}

function closeLootWindow() {
    const modal = document.getElementById('loot-modal');
    if (modal) modal.classList.add('hidden');
    if (lootWindow && lootWindow.cache && lootWindow.cache.items.length) {
        logMessage(`📦 Otthagytad a zsákmány egy részét (${lootWindow.buildingName}). ${lootMinutesLeft()} percig még visszajöhetsz érte, de bárki elviheti!`);
    }
    lootWindow = null;
    if (lootTimer) { clearInterval(lootTimer); lootTimer = null; }
}

function lootMinutesLeft() {
    if (!lootWindow) return 0;
    return Math.max(0, Math.ceil((lootWindow.cache.until - Date.now()) / 60000));
}

function renderLootWindow() {
    if (!lootWindow) return;
    const { cache, buildingName } = lootWindow;
    if (cache.until <= Date.now()) {
        logMessage(`📦 Lejárt az idő, a(z) ${buildingName} zsákmánya elveszett.`);
        lootWindow.cache.items = [];
        closeLootWindow();
        return;
    }
    document.getElementById('loot-building').textContent = buildingName + (cache.mine ? '' : ' · valaki itt hagyta');
    const weight = Math.round((player.weight || 0) * 10) / 10;
    document.getElementById('loot-capacity').textContent =
        `Hely: ${player.inventory.length}/${player.maxInv || 10} · Súly: ${weight}/${player.maxWeight || 30} kg`;
    document.getElementById('loot-list').innerHTML = cache.items.map((it, index) => {
        const item = itemDatabase[it.key] || { name: it.key, icon: '📦', weight: 0 };
        const stats = itemStatLines(item).slice(0, 2).join(' · ');
        const w = Math.round((item.weight || 0) * it.count * 100) / 100;
        return `<div class="flex items-center gap-3 p-2 rounded-xl bg-black/30 border border-emerald-800/60">
            <div class="inv-tile shrink-0" style="width:2.75rem">${tileIconHtml(item)}${it.count > 1 ? `<span class="tile-count">×${it.count}</span>` : ''}</div>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white truncate">${escapeAttr(item.name)}</div>
                <div class="text-[10px] text-emerald-400/80 truncate">${w} kg${stats ? ' · ' + escapeAttr(stats) : ''}</div>
            </div>
            <button onclick="takeLoot(${index})" class="shrink-0 bg-emerald-800 hover:bg-emerald-700 border border-emerald-500/60 text-emerald-100 px-3 py-1.5 rounded-lg text-[11px] font-bold">Elteszem</button>
        </div>`;
    }).join('');
    const left = lootMinutesLeft();
    document.getElementById('loot-timer').textContent = `Amit itt hagysz, még ${left} percig vár rád az épületben, de bárki elviheti!`;
}

// index: egy tétel; null: mind
function takeLoot(index) {
    if (!lootWindow || typeof socket === 'undefined' || !socket) return;
    const data = { buildingId: lootWindow.buildingId };
    if (index === null) data.all = true; else data.index = index;
    socket.emit('cache_take', data);
}

if (typeof socket !== 'undefined' && socket) {
    // Kinyitás és elvétel válasza: a friss lista (ha elfogyott vagy lejárt, az ablak bezárul)
    socket.on('cache_result', (data) => {
        if (!data) return;
        if (data.message) logMessage(data.message);
        if (!data.success) {
            playSound('hit');
            if (data.gone && typeof buildingCaches !== 'undefined') {
                buildingCaches[data.buildingId] = 0;
                if (lootWindow && lootWindow.buildingId === data.buildingId) { lootWindow.cache.items = []; closeLootWindow(); }
                if (typeof refreshMapMarkers === 'function') refreshMapMarkers();
            }
            return;
        }
        if (data.message) playSound('loot');
        const cache = data.cache;
        if (!cache || !cache.items.length) {
            if (typeof buildingCaches !== 'undefined') buildingCaches[data.buildingId] = 0;
            if (lootWindow && lootWindow.buildingId === data.buildingId) { lootWindow.cache.items = []; closeLootWindow(); }
            if (typeof refreshMapMarkers === 'function') refreshMapMarkers();
            return;
        }
        openLootWindow(data.buildingId, data.buildingName || (lootWindow && lootWindow.buildingName) || 'Épület', cache);
    });
}

// ===== FELSZERELÉS JAVÍTÁSA (ugyanazok a szabályok, mint a szerveren: server.js, repair_item) =====
// Visszaadja, mi kell a javításhoz, és megvan-e: { text, ok, percent }
function repairRequirement(item) {
    const have = (key) => player.inventory.filter(s => s.key === key).reduce((sum, s) => sum + s.count, 0);
    const name = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);
    const gear = ['helmet', 'torso', 'armor', 'legs', 'shoes', 'backpack'].includes(item.type);
    const firearm = item.type === 'weapon' && typeof item.reqAmmo === 'string' && item.reqAmmo.startsWith('ammo_');
    if (gear) return { text: `${name('sewing_kit')} + 1 ${name('rag')}`, ok: have('sewing_kit') > 0 && have('rag') > 0, percent: 50 };
    if (firearm) {
        if (have('gun_cleaning_kit') > 0) return { text: name('gun_cleaning_kit'), ok: true, percent: 50 };
        if (have('machine_oil') > 0 && have('rag') > 0) return { text: `1 ${name('machine_oil')} + 1 ${name('rag')}`, ok: true, percent: 25 };
        return { text: `${name('gun_cleaning_kit')} (+50%), vagy 1 ${name('machine_oil')} + 1 ${name('rag')} (+25%)`, ok: false, percent: 50 };
    }
    const tools = ['claw_hammer', 'pliers', 'multitool', 'toolbox'];
    return { text: `1 ${name('duct_tape')} + ${tools.map(name).join(' / ')}`, ok: have('duct_tape') > 0 && tools.some(k => have(k) > 0), percent: 40 };
}

// ===== "MIRE JÓ?" =====
// A tárgy lapján: mire használható (receptekből, javításból, fényből, lőszerből, passzív hatásból összerakva).
// Visszaad: [{ icon, label, text }]
function itemUses(key) {
    const item = itemDatabase[key];
    if (!item) return [];
    const name = (k) => (itemDatabase[k] ? itemDatabase[k].name : k);
    const list = (names, max = 5) => {
        const unique = [...new Set(names)];
        return unique.slice(0, max).join(', ') + (unique.length > max ? ` és még ${unique.length - max}` : '');
    };
    const recipes = window.craftingRecipes || [];
    const toolOptions = (entry) => (window.RecipeTools ? RecipeTools.toolOptions(entry) : (Array.isArray(entry) ? entry : [entry]));
    const fire = (window.RecipeTools && RecipeTools.FIRE_STARTERS) || ['matchbox', 'ferro_rod'];
    const uses = [];
    const add = (icon, label, text) => uses.push({ icon, label, text });

    const hand = recipes.filter(r => !r.station);
    const station = recipes.filter(r => r.station);
    const asIngredient = hand.filter(r => r.req && r.req[key]);
    if (asIngredient.length) add('🔨', asIngredient.every(r => r.cat === 'Szétszerelés') ? 'Szétszedhető' : 'Alapanyag', list(asIngredient.map(r => r.name)));
    const asTool = hand.filter(r => (r.tools || []).some(entry => toolOptions(entry).includes(key)));
    if (asTool.length) add('🛠️', 'Szerszám (kopik)', list(asTool.map(r => r.name)));
    const waters = (window.RecipeTools && RecipeTools.WATER_SOURCES) || [];
    if (waters.includes(key)) {
        const waterRecipes = hand.filter(r => r.water);
        if (waterRecipes.length) add('💧', 'Víz receptekhez', list(waterRecipes.map(r => r.name)));
    }
    if (fire.includes(key)) {
        const fireRecipes = hand.filter(r => r.fire);
        if (fireRecipes.length) add('🔥', key === fire[0] ? 'Tűzgyújtás (elfogy)' : 'Tűzgyújtás (kopik)', list(fireRecipes.map(r => r.name)));
    }
    const atStation = station.filter(r => (r.req && r.req[key]) || (r.tools || []).some(entry => toolOptions(entry).includes(key)));
    const smelter = atStation.filter(r => r.station === 'smelter');
    const workshop = atStation.filter(r => r.station === 'workshop');
    if (smelter.length) add('🔥', 'Olvasztóban (hamarosan)', list(smelter.map(r => r.name)));
    if (workshop.length) add('🏭', 'Műhelyben (hamarosan)', list(workshop.map(r => r.name)));

    // Javítás (ugyanaz a szabály, mint a szerveren)
    if (key === 'sewing_kit') add('🔧', 'Javítás', 'ruha, páncél, sisak, cipő és táska (+50%, 1 ronggyal)');
    if (key === 'rag') add('🔧', 'Javítás', 'varrókészlettel ruha és páncél; gépolajjal lőfegyver');
    if (key === 'gun_cleaning_kit') add('🔧', 'Javítás', 'lőfegyverek (+50%)');
    if (key === 'machine_oil') add('🔧', 'Javítás', 'lőfegyver gyorsjavítása 1 ronggyal (+25%)');
    if (key === 'duct_tape') add('🔧', 'Javítás', 'közelharci fegyver, íj, parittya (+40%, kalapáccsal / fogóval)');
    if (['claw_hammer', 'pliers', 'multitool', 'toolbox'].includes(key)) add('🔧', 'Javítás', 'közelharci fegyver, íj, parittya (+40%, 1 ragasztószalaggal)');
    if (key === 'toolbox') add('🧰', 'Pótolja', list(((window.RecipeTools && RecipeTools.TOOLBOX_REPLACES) || []).map(name), 9));

    // Fény és üzemanyag
    if (item.light) add('💡', 'Fényforrás', 'éjszaka magától ég, ha a leltáradban van: messzebbre látsz és minden épületet látsz');
    const fuelFor = Object.keys(itemDatabase).filter(k => itemDatabase[k].light && itemDatabase[k].light.fuel === key);
    if (fuelFor.length) add('⛽', 'Üzemanyag', list(fuelFor.map(name)));
    if (key === 'power_bank') add('🔋', 'Töltés', list(Object.keys(itemDatabase).filter(k => itemDatabase[k].light && itemDatabase[k].light.fuel === 'aa_batteries').map(name)));

    // Lőszer
    if (item.type === 'ammo') {
        const weapons = Object.keys(itemDatabase).filter(k => itemDatabase[k].reqAmmo === key);
        if (weapons.length) add('🎯', 'Lőszer ehhez', list(weapons.map(name)));
    }
    if (item.passive) add('🎒', 'Passzív', 'elég, ha a leltáradban van');

    // Később jövő funkciók
    if (['valuable', 'collectible', 'artifact'].includes(item.type)) add('💰', 'Értéktárgy', 'a Menedék kereskedője jó pénzt ad érte (hamarosan, v0.2)');
    if (key === 'antirad_pills') add('☢️', 'Sugárzás ellen', 'a vörös (sugárzó) zónákkal érkezik (hamarosan)');

    if (uses.length === 0) {
        if (SurvivalStats.isConsumable(item)) add('🍽️', 'Fogyasztható', 'a hatását fent látod');
        else if (SurvivalStats.isEquippable(item)) add('🧥', 'Felvehető', 'a bónuszait fent látod');
    }
    return uses;
}

function itemUsesHtml(key) {
    const uses = itemUses(key);
    if (uses.length === 0) return '';
    return `<div class="text-[10px] font-bold tracking-wider text-amber-400 uppercase mb-1">Mire jó?</div>`
        + uses.map(u => `<div class="text-[10px] text-gray-300 leading-snug">${u.icon} <span class="font-bold text-amber-200">${escapeAttr(u.label)}:</span> ${escapeAttr(u.text)}</div>`).join('');
}

function repairItem(ref) {
    if (typeof socket === 'undefined' || !socket || !ref) return;
    socket.emit('repair_item', ref.source === 'eq' ? { source: 'eq', slot: ref.slot } : { source: 'inv', index: ref.index });
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
    document.getElementById('item-sheet-desc').textContent = itemFlavorText(item.desc);

    const weight = Math.round((item.weight || 0) * count * 100) / 100;
    document.getElementById('item-sheet-meta').textContent = `Súly: ${weight} kg` + (ref.source === 'eq' ? ' · Felszerelve' : '');
    // Tartósság: a leltárban a slot "dur" mezője, felvett tárgynál az equipmentDur
    const durSlot = ref.source === 'inv' ? slot : { key: ref.key, dur: SurvivalStats.equipmentDur(player, ref.slot) ?? undefined };
    const broken = item.wear && durSlot && durSlot.dur !== undefined && durSlot.dur <= 0;
    const repairInfo = item.wear && durSlot && durSlot.dur !== undefined && durSlot.dur < item.durability ? repairRequirement(item) : null;
    // a tönkrement tárgy értékei áthúzva: most nem adnak semmit
    document.getElementById('item-sheet-stats').innerHTML = itemStatLines(item)
        .map(line => broken
            ? `<span class="px-1.5 py-0.5 rounded bg-gray-900/80 border border-gray-700/60 text-[10px] font-bold text-gray-500 line-through">${escapeAttr(line)}</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-[10px] font-bold text-emerald-200">${escapeAttr(line)}</span>`).join('');
    document.getElementById('item-sheet-dur').innerHTML = durabilityHtml(durSlot, item)
        + (broken ? `<div class="text-[10px] font-bold text-red-400 mt-1">💥 Tönkrement: amíg meg nem javítod, nem ad bónuszt.</div>` : '')
        + (repairInfo ? `<div class="text-[9px] mt-0.5 ${repairInfo.ok ? 'text-sky-300/90' : 'text-red-400/90'}">🔧 Javítás (+${repairInfo.percent}%): ${escapeAttr(repairInfo.text)}</div>` : '')
        + (ref.source === 'inv' ? scrapInfoHtml(ref.key) : '');
    const usesBox = document.getElementById('item-sheet-uses');
    if (usesBox) {
        const html = itemUsesHtml(ref.key);
        usesBox.innerHTML = html;
        usesBox.classList.toggle('hidden', !html);
    }
    const compare = document.getElementById('item-sheet-compare');
    if (compare) {
        const html = ref.source === 'inv' ? itemCompareHtml(item, ref.key) : '';
        compare.innerHTML = html;
        compare.classList.toggle('hidden', !html);
    }

    const btn = (label, cls, action) => `<button onclick="${action}" class="flex-1 ${cls} text-white py-2.5 rounded-lg text-xs font-bold">${label}</button>`;
    let actions = '';
    if (ref.source === 'inv') {
        if (SurvivalStats.isConsumable(item)) {
            actions += btn('Használ', 'bg-amber-600 hover:bg-amber-500', `itemSheetAction('use')`);
            const pinned = (player.quickbar || []).includes(ref.key);
            actions += btn(pinned ? '📌 Levesz' : '📌 Gyorssáv', 'bg-slate-700 hover:bg-slate-600', `itemSheetAction('pin')`);
        }
        else if (SurvivalStats.isEquippable(item)) actions += btn('Felvesz', 'bg-emerald-700 hover:bg-emerald-600', `itemSheetAction('equip')`);
        if (repairInfo) actions += btn('Javít', `bg-sky-800 hover:bg-sky-700${repairInfo.ok ? '' : ' opacity-50'}`, `itemSheetAction('repair')`);
        scrapRecipesFor(ref.key).forEach(r => {
            const st = scrapStatus(r);
            actions += btn('🔧 Szétszed', `bg-amber-900 hover:bg-amber-800${st.ok ? '' : ' opacity-50'}`, `scrapItem('${r.key}')`);
        });
        actions += btn(count > 1 ? 'Eldob 1 db' : 'Eldob', 'bg-red-900/80 hover:bg-red-800', `itemSheetAction('drop')`);
    } else {
        if (repairInfo) actions += btn('Javít', `bg-sky-800 hover:bg-sky-700${repairInfo.ok ? '' : ' opacity-50'}`, `itemSheetAction('repair')`);
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
    else if (action === 'repair') repairItem(ref);
    else if (action === 'pin') togglePin(ref.key);
    // Fogyasztás / felvétel / levétel után a lap bezárul; eldobásnál és javításnál nyitva marad
    if (action !== 'drop' && action !== 'repair' && action !== 'pin') closeItemSheet();
}

// A leltár gombja: a tárgy KULCSÁT küldjük a szervernek (nem a sorszámát)
function inventoryAction(index) {
    const slot = player.inventory[index];
    if (!slot) return;
    const item = itemDatabase[slot.key];
    if (SurvivalStats.isConsumable(item)) useItem(slot.key);
    else if (SurvivalStats.isEquippable(item)) equipItem(slot.key, SurvivalStats.equipSlot(item), index);
}

// ===== SZÉTSZEDÉS A TÁRGY LAPJÁN (v0.1.11) =====
// A "Szétszerelés" receptek nem a barkácslistában vannak, hanem a tárgy lapján egy gombbal.
const SCRAP_CAT = 'Szétszerelés';
function scrapRecipesFor(key) {
    return (window.craftingRecipes || []).filter(r => r.cat === SCRAP_CAT && !r.station && r.req && r.req[key]);
}
function scrapStatus(r) {
    const have = (k) => (player.inventory || []).filter(s => s.key === k).reduce((n, s) => n + (s.count || 0), 0);
    const name = (k) => (itemDatabase[k] ? itemDatabase[k].name : k);
    const options = (entry) => (window.RecipeTools ? RecipeTools.toolOptions(entry) : (Array.isArray(entry) ? entry : [entry]));
    const missing = [];
    Object.entries(r.req).forEach(([k, q]) => { if (have(k) < q) missing.push(`${q} db ${name(k)}`); });
    (r.tools || []).forEach(entry => { const o = options(entry); if (!o.some(k => have(k) > 0)) missing.push(o.map(name).join(' / ')); });
    const result = itemDatabase[r.result || r.key] || {};
    return { ok: missing.length === 0, missing, gives: `${r.count || 1} db ${result.name || ''}` };
}
function scrapItem(recipeKey) {
    const r = (window.craftingRecipes || []).find(x => x.key === recipeKey);
    if (!r) return;
    const st = scrapStatus(r);
    if (!st.ok) { logMessage(`Szétszedéshez kell: ${st.missing.join(', ')}`); playSound('hit'); return; }
    const ref = itemSheetRef;
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('craft_item', { recipeKey, ...(ref && ref.source === 'inv' ? { index: ref.index } : {}) });
    }
    closeItemSheet();
}
function scrapInfoHtml(key) {
    return scrapRecipesFor(key).map(r => {
        const st = scrapStatus(r);
        const tools = (r.tools || []).map(e => (window.RecipeTools ? RecipeTools.toolOptions(e) : [].concat(e)).map(k => (itemDatabase[k] || {}).name || k).join(' / ')).join(', ');
        const need = Object.entries(r.req).filter(([, q]) => q > 1).map(([k, q]) => `${q} db kell`).join('');
        return `<div class="text-[10px] mt-1 ${st.ok ? 'text-amber-200/90' : 'text-red-400/90'}">🔧 Szétszedve: <b>${escapeAttr(st.gives)}</b>${need ? ` (${escapeAttr(need)})` : ''}${tools ? ` · szerszám: ${escapeAttr(tools)}` : ''}</div>`;
    }).join('');
}

// ===== GYORSSÁV (v0.1.10) =====
// 3 hely a térkép alján: egy koppintással használod a kitűzött tárgyat (kötszer, víz, étel...).
const QUICKBAR_SIZE = 3;
function quickbarList() {
    const bar = Array.isArray(player.quickbar) ? player.quickbar.slice(0, QUICKBAR_SIZE) : [];
    while (bar.length < QUICKBAR_SIZE) bar.push(null);
    return bar;
}

// Kitűzés: az első üres helyre (ha nincs, az elsőt cseréli); ha már kint van, leveszi
function togglePin(key) {
    if (typeof socket === 'undefined' || !socket) return;
    const bar = quickbarList();
    const at = bar.indexOf(key);
    if (at >= 0) { socket.emit('set_quickbar', { slot: at, key: null }); return; }
    const free = bar.indexOf(null);
    socket.emit('set_quickbar', { slot: free >= 0 ? free : 0, key });
}

function quickbarTap(i) {
    const key = quickbarList()[i];
    if (!key) {
        logMessage('📌 Tűzz ki ide egy tárgyat: Készlet → koppints a tárgyra → „📌 Gyorssáv”.');
        return;
    }
    if (player.combat) { logMessage('Harc közben a harci ablakból gyógyíthatsz.'); return; }
    const have = (player.inventory || []).filter(s => s.key === key).reduce((n, s) => n + (s.count || 0), 0);
    if (have < 1) { logMessage(`Elfogyott: ${(itemDatabase[key] || {}).name || key}`); playSound('hit'); return; }
    useItem(key);
}

function renderQuickbar() {
    const box = document.getElementById('quickbar');
    if (!box) return;
    const bar = quickbarList();
    box.innerHTML = bar.map((key, i) => {
        if (!key) return `<button class="qb-slot qb-empty" onclick="quickbarTap(${i})" aria-label="Üres gyorssáv hely">+</button>`;
        const item = itemDatabase[key] || { name: key, icon: '📦' };
        const have = (player.inventory || []).filter(s => s.key === key).reduce((n, s) => n + (s.count || 0), 0);
        return `<button class="qb-slot${have ? '' : ' qb-out'}" onclick="quickbarTap(${i})" title="${escapeAttr(item.name)}">${tileIconHtml(item)}<span class="qb-count">${have}</span></button>`;
    }).join('');
}

// ===== LELTÁR: RENDEZÉS ÉS KIDOBÁS MÓD =====
let dropMode = false;
let dropSelection = new Set();  // kijelölt leltárhelyek (index)
let dropConfirmArmed = false;   // a "Kidob" gombot kétszer kell megnyomni

function sortInventory() {
    dropSelection = new Set(); dropConfirmArmed = false; // a helyek sorrendje megváltozik
    if (typeof socket !== 'undefined' && socket) socket.emit('sort_inventory');
}

function toggleDropMode(on) {
    dropMode = typeof on === 'boolean' ? on : !dropMode;
    dropSelection = new Set();
    dropConfirmArmed = false;
    if (dropMode) closeItemSheet();
    updateUI();
}

function toggleDropSelect(index) {
    if (!player.inventory[index]) return;
    if (dropSelection.has(index)) dropSelection.delete(index); else dropSelection.add(index);
    dropConfirmArmed = false;
    updateUI();
}

function renderDropBar() {
    const bar = document.getElementById('drop-bar');
    const modeBtn = document.getElementById('btn-inv-dropmode');
    if (modeBtn) modeBtn.classList.toggle('active', dropMode);
    if (!bar) return;
    bar.classList.toggle('hidden', !dropMode);
    if (!dropMode) return;
    // a már nem létező helyek kiesnek (pl. elhasznált tárgy)
    dropSelection.forEach(i => { if (!player.inventory[i]) dropSelection.delete(i); });
    const pieces = [...dropSelection].reduce((sum, i) => sum + (player.inventory[i] ? player.inventory[i].count : 0), 0);
    const info = document.getElementById('drop-bar-info');
    if (info) info.textContent = dropSelection.size ? `${dropSelection.size} hely kijelölve (${pieces} db)` : 'Koppints a kidobandó tárgyakra';
    const confirmBtn = document.getElementById('drop-bar-confirm');
    if (confirmBtn) {
        confirmBtn.textContent = dropConfirmArmed ? 'Biztos? Kidob!' : `Kidob${dropSelection.size ? ` (${dropSelection.size})` : ''}`;
        confirmBtn.classList.toggle('opacity-50', dropSelection.size === 0);
    }
}

function confirmDropSelection() {
    if (dropSelection.size === 0) return;
    if (!dropConfirmArmed) { dropConfirmArmed = true; renderDropBar(); return; }
    const slots = [...dropSelection].filter(i => player.inventory[i]).map(i => ({ index: i, key: player.inventory[i].key }));
    if (typeof socket !== 'undefined' && socket && slots.length) socket.emit('drop_items', { slots });
    dropSelection = new Set();
    dropConfirmArmed = false;
    renderDropBar();
}

function updateUI() {
    updateHUD();
    renderQuickbar();
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
        const brokenTile = item.wear && slot.dur !== undefined && slot.dur <= 0;
        const selected = dropMode && dropSelection.has(index);
        const click = dropMode ? `toggleDropSelect(${index})` : `openItemSheet('inv', ${index})`;
        invHtml += `<button class="inv-tile${brokenTile ? ' broken' : ''}${selected ? ' selected' : ''}" onclick="${click}" title="${escapeAttr(item.name)}${brokenTile ? ' (tönkrement)' : ''}">${tileIconHtml(item)}${count}${tileDurabilityHtml(slot, item)}${brokenTile ? '<span class="tile-broken">💥</span>' : ''}${selected ? '<span class="tile-check">❌</span>' : ''}</button>`;
    }
    invGrid.innerHTML = invHtml;
    renderDropBar();
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
            const dur = SurvivalStats.equipmentDur(player, slot);
            const broken = dur !== null && dur <= 0;
            el.classList.toggle('broken', broken);
            el.innerHTML = tileIconHtml(item) + (dur !== null ? tileDurabilityHtml({ dur }, item) : '') + (broken ? '<span class="tile-broken">💥</span>' : '');
            el.title = item.name + (broken ? ' (tönkrement)' : '');
        } else {
            el.classList.add('empty');
            el.classList.remove('broken');
            el.innerHTML = `<span class="tile-emoji">${el.dataset.empty || '▫️'}</span>`;
            el.title = slot === 'backpack' ? `Alap hátizsák (${player.maxInv || 10} hely)` : 'Üres';
        }
    });
    const summary = document.getElementById('eq-summary');
    if (summary) summary.innerHTML = `<span>🛡️ ${player.defense || 0}</span><span>🎒 ${player.maxInv || 10}</span>`;

    renderCraftList();
    if (lootWindow) renderLootWindow(); // a hely és a súly kijelzése frissül
}

// Kopó tárgy (szerszám) tartóssága kis csíkkal
function durabilityHtml(slot, item) {
    if (!item || !item.durability || slot.dur === undefined) return '';
    const pct = Math.max(0, Math.min(100, (slot.dur / item.durability) * 100));
    const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
    const label = item.light ? `${Math.ceil(slot.dur)}/${item.durability} perc` : item.wear ? `Tartósság: ${slot.dur}/${item.durability}` : `${slot.dur}/${item.durability}`;
    return `<div class="flex items-center gap-1 mt-0.5"><div class="w-16 h-1.5 bg-gray-900 rounded overflow-hidden"><div class="${color} h-full" style="width:${pct}%"></div></div><span class="text-[9px] text-gray-400">${label}</span></div>`;
}

// Barkácsreceptek csoportonként: alapanyag és szerszám (zöld: megvan, piros: hiányzik).
// A műhelyes / olvasztós receptek (station) itt nem jelennek meg: azok majd az épület ablakában lesznek.
function renderCraftList() {
    const craftList = document.getElementById('crafting-list');
    if (!craftList) return;
    const have = (key) => player.inventory.filter(s => s.key === key).reduce((sum, s) => sum + s.count, 0);
    const name = (key) => (itemDatabase[key] ? itemDatabase[key].name : key);
    const toolOptions = (entry) => (window.RecipeTools ? RecipeTools.toolOptions(entry) : (Array.isArray(entry) ? entry : [entry]));
    const fire = (window.RecipeTools && RecipeTools.FIRE_STARTERS) || ['matchbox', 'ferro_rod'];
    const hasFire = (recipe) => !recipe.fire || fire.some(k => have(k) > 0);
    const waters = (window.RecipeTools && RecipeTools.WATER_SOURCES) || ['dirty_water'];
    const hasWater = (recipe) => !recipe.water || waters.some(k => have(k) >= recipe.water + (recipe.req[k] || 0));
    const hasTools = (recipe) => hasFire(recipe) && (recipe.tools || []).every(entry => toolOptions(entry).some(k => have(k) > 0));
    const hasMaterials = (recipe) => Object.entries(recipe.req).every(([mat, qty]) => have(mat) >= qty);

    const recipes = craftingRecipes.filter(recipe => !recipe.station && recipe.cat !== SCRAP_CAT); // a szétszedés a tárgy lapján van
    const categories = (window.CRAFT_CATEGORIES || []).slice();
    recipes.forEach(r => { const c = r.cat || 'Egyéb'; if (!categories.includes(c)) categories.push(c); });

    let html = '';
    categories.forEach(cat => {
        const group = recipes.filter(r => (r.cat || 'Egyéb') === cat);
        if (!group.length) return;
        const ready = group.filter(r => hasMaterials(r) && hasTools(r) && hasWater(r)).length;
        html += `<div class="text-[10px] font-bold tracking-wider text-emerald-500 uppercase mt-2 mb-1 flex justify-between"><span>${escapeAttr(cat)}</span>${ready ? `<span class="text-emerald-300">${ready} elkészíthető</span>` : ''}</div>`;
        group.forEach(recipe => {
            const result = itemDatabase[recipe.result || recipe.key] || {};
            const reqText = Object.entries(recipe.req).map(([mat, qty]) => {
                const ok = have(mat) >= qty;
                return `<span class="${ok ? 'text-emerald-300' : 'text-red-400'}">${qty}× ${name(mat)}</span>`;
            }).join(', ');
            const toolText = (recipe.tools || []).map(entry => {
                const options = toolOptions(entry);
                const ok = options.some(k => have(k) > 0);
                return `<span class="${ok ? 'text-emerald-300' : 'text-red-400'}">${options.map(name).join(' / ')}</span>`;
            }).join(', ');
            const canCraft = hasMaterials(recipe) && hasTools(recipe) && hasWater(recipe);
            html += `
            <div class="hud-panel border border-emerald-600/40 p-3 rounded-xl flex items-center justify-between bg-emerald-950/40 ${canCraft ? '' : 'opacity-75'}">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 flex items-center justify-center">${itemIconHtml(result, 'w-8 h-8')}</div>
                    <div>
                        <div class="text-xs font-bold text-emerald-300">${recipe.name}${recipe.count > 1 ? ` (${recipe.count} db)` : ''}</div>
                        <div class="text-[10px] text-emerald-400/80">${recipe.desc}</div>
                        <div class="text-[9px] text-amber-300/80">Kell: ${reqText}</div>
                        ${recipe.water ? `<div class="text-[9px] text-sky-300/80">Víz: <span class="${hasWater(recipe) ? 'text-emerald-300' : 'text-red-400'}">${recipe.water} adag, bármilyen (a szennyezett is jó)</span></div>` : ''}
                        ${recipe.fire ? `<div class="text-[9px] text-orange-300/80">Tűz: <span class="${hasFire(recipe) ? 'text-emerald-300' : 'text-red-400'}">${name(fire[0])} (fogy) / ${name(fire[1])} (kopik)</span></div>` : ''}
                        ${toolText ? `<div class="text-[9px] text-sky-300/80">Szerszám (kopik): ${toolText}</div>` : ''}
                    </div>
                </div>
                <button onclick="craftItem({ key: '${recipe.key}' })" class="${canCraft ? '' : 'opacity-50 '}bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/80 px-3 py-1.5 clipped-badge text-xs font-bold text-emerald-200 transition shadow">Barkács</button>
            </div>`;
        });
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
        if (dropMode) toggleDropMode(false); // bezáráskor a Kidobás mód is kikapcsol
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
    
    safeAddEvent('btn-open-journal', 'click', () => {
        renderJournal();
        const modal = document.getElementById('journal-modal');
        if (modal) modal.classList.remove('hidden');
    });
    // Ezek a következő nagy frissítésben jönnek, addig csak jelzik
    safeAddEvent('btn-open-skills', 'click', () => showToast('⭐ A képességek hamarosan érkeznek! Szintlépéskor választhatsz majd.'));
    safeAddEvent('btn-open-leaderboard', 'click', () => showToast('🏆 A ranglista hamarosan érkezik!'));
    safeAddEvent('btn-open-chat', 'click', () => showToast('📻 A csevegés hamarosan érkezik!'));

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
