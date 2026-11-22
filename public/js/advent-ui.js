// advent-ui.js – ADVENTI NAPTÁR a játékban (Fagyos Csend, v0.1.18)
// A szabályok a közös advent.js-ben vannak; a szerver dönt, a kliens csak megjelenít és kér.
let adventTestMode = false;
let adventShownThisSession = false;
let adventReveal = null; // az épp kinyitott ablak (felfedés animáció)

socket.on('advent_config', (d) => { adventTestMode = !!(d && d.test); refreshAdventUi(); });

function adventStatus() {
    const adv = player && player.advent;
    const a = adv && adv.test && !adventTestMode ? { opened: [] } : adv;
    return SurvivalAdvent.status(a || { opened: [] }, Date.now(), { test: adventTestMode });
}
// Van-e most kinyitható ablak (a Küldetés jelvényhez és a belépéskori felugráshoz)
function adventHasOpenable() {
    if (!player || player.advent === undefined) return false;
    const st = adventStatus();
    return st.active && (st.todayOpen || st.canCatchup);
}

function openAdventModal() {
    adventReveal = null;
    const q = document.getElementById('quest-modal'); if (q) q.classList.add('hidden');
    document.getElementById('advent-modal').classList.remove('hidden');
    renderAdventModal();
}
function closeAdventModal() { if (adventPending) return; document.getElementById('advent-modal').classList.add('hidden'); adventReveal = null; }

function adventItemsHtml(items) {
    return items.map(it => { const item = itemDatabase[it.key] || { name: it.key, icon: '📦' }; return `<span title="${escapeAttr(item.name)}">${tileIconHtml(item)}${it.count > 1 ? `<b>×${it.count}</b>` : ''}</span>`; }).join('');
}
function adventCosmeticHtml(key) {
    const c = window.SurvivalShop && SurvivalShop.BY_KEY[key];
    if (!c) return '';
    return c.kind === 'frame'
        ? `<span class="sg-adv-cos" title="${escapeAttr(c.name)}"><i class="sg-adv-frame" style="--cc:${c.color}"></i></span>`
        : `<span class="sg-adv-cos" title="${escapeAttr(c.name)}"><i class="sg-adv-title" style="color:${c.color}">${escapeAttr(c.name.toUpperCase())}</i></span>`;
}

function renderAdventModal() {
    const body = document.getElementById('advent-body');
    if (!body) return;
    const st = adventStatus();
    const opened = new Set(st.opened);
    let head;
    if (st.test) head = '<div class="sg-adv-note test">TESZT ÜZEMMÓD – csak a stáb látja. Ezek a nyitások december 1-jén törlődnek.</div>';
    else if (st.notStarted) head = `<div class="sg-adv-note">A naptár <b>december 1-jén</b> nyílik. Minden nap egy ablak, Mikuláskor és Szentestén különleges meglepetéssel.</div>`;
    else if (st.ended) head = '<div class="sg-adv-note">Az idei adventi naptár véget ért. Jövőre újra jön!</div>';
    else head = `<div class="sg-adv-note">Minden nap egy ablak. A kihagyottakat pótolhatod: <b>naponta egyet</b>, december 26-ig.${st.missed.length ? ` Pótolható: <b>${st.missed.length}</b>${st.catchupUsed ? ' (ma már pótoltál)' : ''}.` : ''}</div>`;

    const tiles = SurvivalAdvent.DAYS.map(d => {
        const isOpened = opened.has(d.day);
        const isToday = !isOpened && st.active && d.day === st.n;
        const isMissed = !isOpened && st.missed.includes(d.day);
        const canOpenNow = isToday || (isMissed && st.canCatchup) || (st.test && !isOpened);
        let cls = 'sg-adv-day', inner;
        if (d.special) cls += ' special';
        if (isOpened) {
            cls += ' got';
            inner = `<div class="sg-adv-items">${adventItemsHtml(d.items)}${d.cosmetic ? adventCosmeticHtml(d.cosmetic) : ''}</div><i class="sg-adv-ok">✓</i>`;
        } else if (canOpenNow) {
            cls += isToday || st.test ? ' today' : ' missed';
            inner = `<div class="sg-adv-gift">🎁</div><div class="sg-adv-tag">${isToday || st.test ? 'NYISD KI!' : 'PÓTOLHATÓ'}</div>`;
        } else if (isMissed) {
            cls += ' missed wait';
            inner = `<div class="sg-adv-gift dim">🎁</div><div class="sg-adv-tag">HOLNAP PÓTOLHATÓ</div>`;
        } else {
            cls += ' locked';
            inner = `<div class="sg-adv-lock">${d.special ? '★' : '❄'}</div>${d.special ? `<div class="sg-adv-tag">${escapeAttr(d.special.toUpperCase())}</div>` : ''}`;
        }
        return `<button class="${cls}" ${canOpenNow ? `onclick="adventOpen(${d.day})"` : 'disabled'}><span class="sg-adv-n">${d.day}</span>${inner}</button>`;
    }).join('');

    let reveal = '';
    if (adventReveal && adventReveal.phase === 'shake') {
        reveal = `<div class="sg-adv-reveal"><div class="sg-adv-stage"><div class="sg-adv-rays"></div>
            <div class="sg-adv-box shake"><i class="lid"></i><i class="body"></i><i class="ribbon"></i></div>
            <div class="sg-adv-rn">${adventReveal.day}. ABLAK</div></div></div>`;
    } else if (adventReveal && adventReveal.phase === 'open') {
        const r = adventReveal;
        const pieces = [...r.items.map(it => { const item = itemDatabase[it.key] || { name: it.key, icon: '📦' }; return `<span title="${escapeAttr(item.name)}">${tileIconHtml(item)}${it.count > 1 ? `<b>×${it.count}</b>` : ''}</span>`; }),
            ...(r.cosmetic ? [adventCosmeticHtml(r.cosmetic)] : [])];
        const names = r.items.map(it => `${it.count > 1 ? it.count + ' ' : ''}${escapeAttr((itemDatabase[it.key] || { name: it.key }).name)}`).join(', ');
        reveal = `<div class="sg-adv-reveal" onclick="adventReveal=null;renderAdventModal()"><div class="sg-adv-stage">
            <div class="sg-adv-rays on"></div>
            <div class="sg-adv-box open"><i class="lid"></i><i class="body"></i><i class="ribbon"></i></div>
            <div class="sg-adv-items big pop">${pieces.map((h, k) => h.replace('<span', `<span style="--k:${k}"`)).join('')}</div>
            <div class="sg-adv-rn">${r.day}. ABLAK${r.day === 6 ? ' · BOLDOG MIKULÁST!' : r.day === 24 ? ' · BOLDOG KARÁCSONYT!' : ''}</div>
            <div class="sg-adv-rnames">${names}</div>
            <div class="sg-adv-rxp">+${r.xp} XP${r.money ? ` · +${r.money} $` : ''}</div>
            ${r.cosmetic ? `<div class="sg-adv-rcos">Új kinézet a Gyűjteményedben: <b>${escapeAttr((SurvivalShop.BY_KEY[r.cosmetic] || {}).name || '')}</b></div>` : ''}
            ${r.toStash && r.toStash.length ? `<div class="sg-adv-rcos">Ami nem fért el nálad, a menedéked raktárába került.</div>` : ''}
            <button class="sg-tu-big" style="margin-top:12px">SZUPER!</button></div></div>`;
    }
    const lights = Array.from({ length: 14 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
    body.innerHTML = `<div class="sg-adv-lights">${lights}</div>${head}<div class="sg-adv-cabinet"><div class="sg-adv-grid">${tiles}</div></div>${reveal}`;
}

let adventPending = null; // { day, t0, result }
function adventOpen(day) {
    if (adventPending) return;
    adventPending = { day, t0: Date.now(), result: null };
    adventReveal = { phase: 'shake', day };
    renderAdventModal();
    if (navigator.vibrate) { try { navigator.vibrate([20, 60, 20]); } catch (e) {} }
    socket.emit('advent_open', { day });
}
function adventFinish(data) {
    const p = adventPending; adventPending = null;
    if (!data || !data.success) {
        adventReveal = null;
        renderAdventModal();
        const body = document.getElementById('advent-body');
        if (body && data && data.message) body.insertAdjacentHTML('afterbegin', `<div class="sg-adv-note test">${escapeAttr(data.message)}</div>`);
        return;
    }
    adventReveal = { phase: 'open', day: data.day, items: data.items || [], xp: data.xp || 0, money: data.money || 0, cosmetic: data.cosmetic || null, toStash: data.toStash || [] };
    if (typeof playSound === 'function') playSound('win');
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
    renderAdventModal();
    void p;
}

socket.on('advent_result', (data) => {
    if (data && data.message) logMessage((data.success ? '🎁 ' : '⚠️ ') + data.message);
    // a doboz legalább egy kicsit rázkódjon, mielőtt kinyílik
    const wait = adventPending ? Math.max(0, 1100 - (Date.now() - adventPending.t0)) : 0;
    setTimeout(() => { adventFinish(data); refreshAdventUi(); }, data && data.success ? wait : 0);
});

// A Küldetés ablak tetején kis kártya, a jelvényben +1, belépéskor egyszer felugrik
function adventCardHtml() {
    if (!window.SurvivalAdvent || !player || player.advent === undefined) return '';
    const st = adventStatus();
    if (st.ended) return '';
    const openable = st.active && (st.todayOpen || st.canCatchup);
    const sub = st.notStarted && !st.test ? 'December 1-jén nyílik'
        : openable ? (st.todayOpen ? 'A mai ablak még vár rád!' : 'Van pótolható ablakod!') : `✓ Ma megvolt · ${st.opened.length} / ${SurvivalAdvent.DAYS_TOTAL}`;
    return `<button class="sg-adv-card${openable ? ' hot' : ''}" onclick="openAdventModal()"><span class="sg-adv-card-ic">🎄</span>
        <span><b>FAGYOS CSEND · ADVENTI NAPTÁR</b><small>${sub}</small></span><span class="sg-adv-card-go">›</span></button>`;
}
function refreshAdventUi() {
    if (typeof updateQuestBadge === 'function') updateQuestBadge();
    const q = document.getElementById('quest-modal');
    if (q && !q.classList.contains('hidden') && typeof renderQuestModal === 'function') renderQuestModal();
}

socket.on('player_state', (data) => {
    const p = data && data.player;
    if (!p || p.dead || p.advent === undefined) return;
    setTimeout(() => {
        const m = document.getElementById('advent-modal');
        if (m && !m.classList.contains('hidden') && !adventReveal && !adventPending) renderAdventModal();
        // belépéskor egyszer, a napi bónusz után
        if (!adventShownThisSession && p.tutorial && p.tutorial.introSeen && adventHasOpenable()) {
            adventShownThisSession = true;
            setTimeout(() => {
                const d = document.getElementById('daily-modal');
                if (d && !d.classList.contains('hidden')) { adventShownThisSession = false; return; } // a napi bónusz után jön
                openAdventModal();
            }, 1500);
        }
    }, 0);
});
