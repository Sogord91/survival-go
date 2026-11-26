// tutorial-ui.js
// ELSŐ LÉPÉSEK (v0.1.11) – a kliens oldala: üdvözlő kártyák, a Küldetés ablak, a kipipált lépések jelzése
// és az egyszeri helyzeti tippek (első éjszaka, szomjúság, túlsúly...). A lépéseket a szerver pipálja ki.

let tutorialPrevDone = null;   // az előző player_state lépései (a frissen kipipáltak jelzéséhez)
let introShownThisSession = false;
let introIndex = 0;

// ---------- Üdvözlő kártyák ----------
const INTRO_ART = {
    walk: `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <path d="M0 128 H300" stroke="#2c3229" stroke-width="16"/>
        <g class="sg-walker"><circle cx="0" cy="-58" r="9" fill="#d9c58a"/><path d="M0 -48 V-14" stroke="#d9c58a" stroke-width="7" stroke-linecap="round"/>
        <path class="leg1" d="M0 -14 L-10 12" stroke="#d9c58a" stroke-width="6" stroke-linecap="round"/><path class="leg2" d="M0 -14 L10 12" stroke="#d9c58a" stroke-width="6" stroke-linecap="round"/>
        <path d="M0 -40 L12 -28" stroke="#d9c58a" stroke-width="5" stroke-linecap="round"/><rect x="11" y="-36" width="9" height="15" rx="2" fill="#8fd16a" stroke="#15170f" stroke-width="1.5"/></g>
        <g font-family="sans-serif" font-weight="800"><text x="246" y="40" font-size="30" fill="#d6453a">✕</text><text x="214" y="64" font-size="11" fill="#c9c4b4">NINCS JOYSTICK</text></g>
        <circle cx="46" cy="40" r="16" fill="none" stroke="#c9c4b4" stroke-width="3"/><circle cx="46" cy="40" r="6" fill="#c9c4b4"/><path d="M38 52 L32 62 M54 52 L60 62" stroke="#c9c4b4" stroke-width="3"/>
        <path d="M26 22 L66 58" stroke="#d6453a" stroke-width="5"/></svg>`,
    gps: `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <rect x="118" y="18" width="64" height="116" rx="10" fill="#15170f" stroke="#c9c4b4" stroke-width="3"/><rect x="126" y="30" width="48" height="88" fill="#252a24"/>
        <path d="M150 52 a14 14 0 0 1 14 14 c0 12 -14 26 -14 26 s-14 -14 -14 -26 a14 14 0 0 1 14 -14z" fill="#8fd16a" stroke="#15170f" stroke-width="2"/><circle cx="150" cy="66" r="5" fill="#15170f"/>
        <g fill="none" stroke="#8fd16a" stroke-width="3" opacity=".7"><path d="M200 50 a30 30 0 0 1 0 40"/><path d="M212 40 a46 46 0 0 1 0 60"/><path d="M100 50 a30 30 0 0 0 0 40"/><path d="M88 40 a46 46 0 0 0 0 60"/></g></svg>`,
    map: `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <g fill="#252a24" stroke="#30362e"><rect x="20" y="18" width="46" height="30"/><rect x="88" y="10" width="38" height="44"/><rect x="200" y="20" width="60" height="34"/><rect x="30" y="96" width="52" height="36"/><rect x="214" y="92" width="44" height="40"/><rect x="140" y="104" width="40" height="30"/></g>
        <path d="M0 74 L300 66 M150 0 L160 150" stroke="#2c3229" stroke-width="12"/>
        <circle cx="152" cy="70" r="16" fill="#d9c58a" stroke="#15170f" stroke-width="3"/><circle cx="152" cy="70" r="11" fill="none" stroke="#15170f" stroke-dasharray="2 2"/><circle cx="152" cy="70" r="4" fill="#15170f"/>
        <circle cx="152" cy="70" r="40" fill="none" stroke="#d9c58a" stroke-opacity=".35" stroke-dasharray="4 4"/></svg>`,
    loot: `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <path d="M70 70 L120 30 L170 70 V130 H70 Z" fill="#3a3f2c" stroke="#15170f" stroke-width="3"/><rect x="108" y="92" width="24" height="38" fill="#15170f"/>
        <rect x="196" y="88" width="40" height="30" fill="#7a5634" stroke="#15170f" stroke-width="2"/><path d="M196 98 H236" stroke="#15170f" stroke-width="2"/>
        <circle cx="254" cy="44" r="4" fill="#d6453a"/><circle cx="268" cy="44" r="4" fill="#d6453a"/>
        <text x="230" y="140" font-family="sans-serif" font-size="11" font-weight="700" fill="#c9c4b4">30 m</text></svg>`,
    bars: `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <g font-family="sans-serif" font-size="12" font-weight="700" fill="#e9e3cf">
        <text x="30" y="40">ÉLET</text><rect x="30" y="48" width="240" height="6" fill="#00000066"/><rect x="30" y="48" width="160" height="6" fill="#d6453a"/>
        <text x="30" y="76">ÉTEL</text><rect x="30" y="84" width="240" height="6" fill="#00000066"/><rect x="30" y="84" width="110" height="6" fill="#e0a238"/>
        <text x="30" y="112">VÍZ</text><rect x="30" y="120" width="240" height="6" fill="#00000066"/><rect x="30" y="120" width="70" height="6" fill="#5b9bd0"/></g></svg>`
};
INTRO_ART.app = `<svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="#1b1f1a"/>
        <rect x="104" y="12" width="92" height="128" rx="12" fill="#15170f" stroke="#c9c4b4" stroke-width="3"/><rect x="112" y="26" width="76" height="100" fill="#252a24"/>
        <g><rect x="120" y="36" width="18" height="18" rx="4" fill="#3a3f2c"/><rect x="141" y="36" width="18" height="18" rx="4" fill="#3a3f2c"/><rect x="162" y="36" width="18" height="18" rx="4" fill="#3a3f2c"/>
        <rect x="120" y="60" width="18" height="18" rx="4" fill="#3a3f2c"/><rect x="141" y="60" width="18" height="18" rx="4" fill="#8fd16a" stroke="#d9c58a" stroke-width="2"/><text x="150" y="74" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900" fill="#15170f">SG</text></g>
        <rect x="70" y="92" width="160" height="30" rx="6" fill="#2a2e20" stroke="#d9c58a" stroke-width="2"/><text x="84" y="112" font-size="14">🔔</text>
        <text x="104" y="105" font-family="sans-serif" font-size="9" font-weight="800" fill="#e9e3cf">KINYÍLT A MAI ABLAK</text><text x="104" y="116" font-family="sans-serif" font-size="8" fill="#c9c4b4">Survival GO · most</text></svg>`;
const INTRO_CARDS = [
    { art: 'walk', title: 'NINCS JOYSTICK – SÉTÁLNI KELL!', text: '<b>A karaktered csak akkor mozog, ha te magad sétálsz</b> a telefonnal a kezedben. Ez nem otthon ülős játék: a pálya a valódi utcád, a lépéseid a karaktered lépései. Ha egy helyben állsz, ő is áll.' },
    { art: 'gps', title: 'Kapcsold be a helymeghatározást', text: 'A játék a telefon GPS-éből tudja, merre jársz. Lent látod, most hogy áll:', gps: true },
    { art: 'app', title: 'Tedd ki a telefonodra', text: 'Így egy koppintással indul, mint egy igazi alkalmazás. Ha kéred, <b>szólunk</b>, ha kinyílt a napi adventi ablak, ajándékvadászat van a környékeden, vagy ha a stáb válaszolt neked.', app: true },
    { art: 'map', title: 'A Zóna a te utcád', text: 'A térkép a valódi környéked. A középen lévő jelölő <b>te vagy</b>: ahogy sétálsz, ő is halad. A középre gombbal mindig visszatalálsz magadhoz.' },
    { art: 'loot', title: 'Kutass, de vigyázz', text: 'Menj 30 méteren belülre egy épülethez, és koppints rá: átkutatod. Ételt, vizet, fegyvert, alapanyagot találhatsz, de néha ellenség is vár odabent.' },
    { art: 'bars', title: 'Maradj életben', text: 'Lent látod az életet, az ételt, a vizet és az erőt. Egyél, igyál, pihenj. Ha meghalsz, mindent elveszítesz, amit magadnál hordtál. A Küldetés gomb alatt végigvezetünk az első lépéseken.' }
];

function showIntro() {
    introIndex = 0;
    renderIntro();
    document.getElementById('intro-modal').classList.remove('hidden');
}
function renderIntro() {
    const c = INTRO_CARDS[introIndex];
    document.getElementById('intro-card').innerHTML = `<div class="sg-intro-art">${INTRO_ART[c.art]}</div><h3 class="sg-intro-t">${c.title}</h3><p>${c.text}</p>${c.gps ? `<div id="intro-gps">${gpsCheckHtml()}</div>` : ''}${c.app ? '<div class="sg-app-box"></div>' : ''}`;
    if (c.app && typeof appPromptNeeded === 'function') appPromptNeeded().then(st => { document.querySelectorAll('#intro-card .sg-app-box').forEach(b => { b.innerHTML = appCardHtml(st); }); });
    // az első kártyát nem lehet átugrani: ezt mindenkinek el kell olvasnia
    const skip = document.getElementById('intro-skip'); if (skip) skip.style.visibility = introIndex === 0 ? 'hidden' : '';
    document.getElementById('intro-dots').innerHTML = INTRO_CARDS.map((_, i) => `<i class="${i === introIndex ? 'on' : ''}"></i>`).join('');
    document.getElementById('intro-next').textContent = introIndex === INTRO_CARDS.length - 1 ? 'INDULÁS' : 'TOVÁBB';
}
// GPS állapota emberi nyelven (a bevezetőben és a "még nem mozdultál" kártyán)
function gpsCheckHtml() {
    const ok = typeof hasFetchedRealGPS !== 'undefined' && hasFetchedRealGPS;
    const acc = typeof lastGpsAccuracy !== 'undefined' && lastGpsAccuracy ? Math.round(lastGpsAccuracy) : null;
    const banner = document.getElementById('gps-banner'), err = banner && !banner.classList.contains('hidden');
    const row = (good, txt) => `<div class="sg-gps-row ${good ? 'ok' : 'no'}"><i>${good ? '✔' : '!'}</i><span>${txt}</span></div>`;
    return `<div class="sg-gps-box">
        ${ok ? row(true, `A GPS működik${acc ? ` (pontosság: kb. ${acc} m)` : ''}.`) : err ? row(false, `<b>${escapeAttr(document.getElementById('gps-banner-title').textContent)}</b><br>${escapeAttr(document.getElementById('gps-banner-text').textContent)}`) : row(false, 'Még keressük a GPS-jelet… Ha a telefon engedélyt kér a helyzetedhez, nyomd meg: <b>Engedélyezés</b>.')}
        <div class="sg-gps-tips"><b>Ha nem mozdul a jelölőd:</b>
        <ol><li>Kapcsold be a telefon <b>helymeghatározását</b> (GPS).</li><li>Engedélyezd a <b>helyadatokat ennek az oldalnak</b> a böngészőben, és a <b>pontos helyet</b>.</li><li>Menj <b>szabad ég alá</b> – épületben gyenge a jel.</li><li>Tartsd <b>nyitva</b> a játékot séta közben (a képernyő ne aludjon el).</li></ol></div>
        ${ok ? '' : '<button class="sg-tu-big sg-tu-ghost" style="margin-top:6px" onclick="retryGps();setTimeout(()=>{const g=document.getElementById(\'intro-gps\');if(g)g.innerHTML=gpsCheckHtml()},4000)">ÚJRAPRÓBÁLOM</button>'}
    </div>`;
}
function walkProgressHtml() {
    const m = Math.min(SurvivalTutorial.WALK_METERS, Math.round((player.stats && player.stats.walkedMeters) || 0));
    return `<div class="sg-walk"><div class="sg-walk-bar"><i style="width:${m}%"></i></div><span>${m} / ${SurvivalTutorial.WALK_METERS} m</span></div>`;
}

// "Még egy helyben állsz?" – ha a bevezető után 3 perc alatt sem mozdult (kezdőknek, alkalmanként egyszer)
let stillCoachShown = false;
setInterval(() => {
    if (stillCoachShown || !player || player.dead || !player.tutorial || !player.tutorial.introSeen) return;
    if (player.tutorial.done && player.tutorial.done.walk) return;
    const walked = (player.stats && player.stats.walkedMeters) || 0;
    if (walked >= 20 || (player.level || 1) > 3) return;
    if (!window.__introDoneAt || Date.now() - window.__introDoneAt < 180000) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    stillCoachShown = true;
    document.getElementById('intro-card').innerHTML = `<div class="sg-intro-art">${INTRO_ART.walk}</div><h3 class="sg-intro-t">Még egy helyben állsz?</h3>
        <p>A karaktered <b>csak a valódi lépéseiddel</b> mozog – nincs joystick. Indulj el a telefonnal, és a jelölőd veled jön.</p>${walkProgressHtml()}<div id="intro-gps">${gpsCheckHtml()}</div>`;
    document.getElementById('intro-dots').innerHTML = '';
    document.getElementById('intro-next').textContent = 'ÉRTEM, INDULOK!';
    document.getElementById('intro-skip').style.visibility = 'hidden';
    introIndex = INTRO_CARDS.length - 1; window.__coachMode = true;
    document.getElementById('intro-modal').classList.remove('hidden');
}, 15000);

function introNext() {
    if (window.__coachMode) { window.__coachMode = false; document.getElementById('intro-modal').classList.add('hidden'); return; }
    if (introIndex < INTRO_CARDS.length - 1) { introIndex++; renderIntro(); return; }
    introFinish(true);
}
function introSkip() { introFinish(false); }
function introFinish(openQuests) {
    document.getElementById('intro-modal').classList.add('hidden');
    window.__introDoneAt = Date.now();
    socket.emit('tutorial_intro_seen');
    if (openQuests) openQuestModal();
}

// ---------- Napi bónusz ----------
let dailyShownThisSession = false;
let appCheckedThisSession = false;
function dailyStatus() { return SurvivalDaily.status(player.daily, Date.now()); }
function dailyStripHtml() {
    const st = dailyStatus();
    const cur = st.day; // ma átvehető nap, vagy (ha már átvetted) a mai
    return SurvivalDaily.REWARDS.map(r => {
        const claimed = r.day < cur || (st.claimedToday && r.day === cur);
        const today = r.day === cur && st.available;
        const items = r.items.map(it => { const item = itemDatabase[it.key] || { name: it.key, icon: '📦' }; return `<span title="${escapeAttr(item.name)}">${tileIconHtml(item)}${it.count > 1 ? `<b>×${it.count}</b>` : ''}</span>`; }).join('');
        return `<div class="sg-d-day${claimed ? ' got' : ''}${today ? ' today' : ''}${r.day === 7 ? ' big' : ''}">
            <div class="sg-d-n">${r.day}. NAP</div><div class="sg-d-items">${items}</div>
            <div class="sg-d-xp">+${r.xp} XP${r.money ? ` · ${r.money} $` : ''}</div>${claimed ? '<i class="sg-d-ok">✓</i>' : ''}</div>`;
    }).join('');
}
function dailyButtonHtml() {
    const st = dailyStatus();
    return st.available
        ? `<button class="sg-tu-big" onclick="dailyClaim()">ÁTVESZEM (${st.day}. NAP)</button>`
        : `<button class="sg-tu-big sg-tu-ghost" disabled>HOLNAP JÖN A KÖVETKEZŐ</button>`;
}
// ---------- Napi bónusz kinyitása: rázkódó utánpótlás-láda, majd előugranak a tárgyak ----------
let dailyPending = null;
function dailyClaim() {
    if (dailyPending) return;
    const st = dailyStatus();
    dailyPending = { t0: Date.now(), day: st.day };
    const fromQuest = !document.getElementById('quest-modal').classList.contains('hidden');
    if (fromQuest) { document.getElementById('quest-modal').classList.add('hidden'); document.getElementById('daily-modal').classList.remove('hidden'); renderDailyModal(); }
    showDailyCrate('shake', st.day);
    if (navigator.vibrate) { try { navigator.vibrate([20, 60, 20]); } catch (e) {} }
    socket.emit('daily_claim');
}
function showDailyCrate(phase, day) {
    const body = document.getElementById('daily-body');
    if (!body) return;
    let ov = document.getElementById('daily-crate');
    if (!ov) { ov = document.createElement('div'); ov.id = 'daily-crate'; ov.className = 'sg-adv-reveal'; body.appendChild(ov); }
    const r = SurvivalDaily.REWARDS[(day || 1) - 1] || SurvivalDaily.REWARDS[0];
    const big = r.day === SurvivalDaily.REWARDS.length;
    if (phase === 'shake') {
        ov.innerHTML = `<div class="sg-adv-stage"><div class="sg-adv-rays"></div><img class="sg-dc-crate shake" src="/images/premium/${big ? 'crate_carved' : 'crate_military'}.webp" alt="">
            <div class="sg-adv-rn">${r.day}. NAP</div></div>`;
        return;
    }
    const pieces = r.items.map((it, k) => { const item = itemDatabase[it.key] || { name: it.key, icon: '📦' }; return `<span style="--k:${k}" title="${escapeAttr(item.name)}">${tileIconHtml(item)}${it.count > 1 ? `<b>×${it.count}</b>` : ''}</span>`; });
    if (r.money) pieces.push(`<span style="--k:${pieces.length}" class="sg-dc-money">💰<b>${r.money}</b></span>`);
    const names = r.items.map(it => `${it.count > 1 ? it.count + ' ' : ''}${escapeAttr((itemDatabase[it.key] || { name: it.key }).name)}`).join(', ');
    const next = SurvivalDaily.REWARDS[r.day % SurvivalDaily.REWARDS.length];
    ov.innerHTML = `<div class="sg-adv-stage" onclick="closeDailyCrate()"><div class="sg-adv-rays on${big ? ' gold' : ''}"></div>
        <img class="sg-dc-crate open" src="/images/premium/${big ? 'crate_carved' : 'crate_military'}.webp" alt="">
        <div class="sg-adv-items big pop">${pieces.join('')}</div>
        <div class="sg-adv-rn">${r.day}. NAP${big ? ' · NAGY CSOMAG!' : ''}</div>
        <div class="sg-adv-rnames">${names}</div>
        <div class="sg-adv-rxp">+${r.xp} XP${r.money ? ` · +${r.money} $` : ''}</div>
        <div class="sg-dc-streak">${Array.from({ length: SurvivalDaily.REWARDS.length }, (_, k) => `<i class="${k < r.day ? 'on' : ''}"></i>`).join('')}</div>
        <div class="sg-dc-next">${next.day === 1 ? 'Teljes a hét! Holnap újra az 1. nap jön.' : `Holnap: ${next.day}. nap – ne hagyd ki, különben elölről kezdődik!`}</div>
        <button class="sg-tu-big" style="margin-top:10px">SZUPER!</button></div>`;
}
function closeDailyCrate() {
    const ov = document.getElementById('daily-crate'); if (ov) ov.remove();
    closeDailyModal();
}
function openDailyModal() {
    renderDailyModal();
    document.getElementById('daily-modal').classList.remove('hidden');
}
function closeDailyModal() { document.getElementById('daily-modal').classList.add('hidden'); }
function renderDailyModal() {
    const box = document.getElementById('daily-body');
    if (!box) return;
    box.innerHTML = `<p class="sg-d-p">Gyere vissza minden nap! Ha egy nap kimarad, a sor elölről kezdődik. A 7. napon nagyobb csomag jár.</p>
        <div class="sg-d-grid">${dailyStripHtml()}</div>${dailyButtonHtml()}`;
}

// ---------- Küldetés ablak ----------
function openQuestModal() {
    renderQuestModal();
    document.getElementById('quest-modal').classList.remove('hidden');
}
function closeQuestModal() { document.getElementById('quest-modal').classList.add('hidden'); }

function renderQuestModal() {
    const body = document.getElementById('quest-body');
    if (!body) return;
    const t = player.tutorial || { done: {} };
    const steps = SurvivalTutorial.STEPS;
    const n = SurvivalTutorial.doneCount(t);
    const nextKey = (steps.find(s => !t.done[s.key]) || {}).key;
    let html = (typeof adventCardHtml === 'function' ? adventCardHtml() : '') + (typeof winterCardHtml === 'function' ? winterCardHtml() : '') + `<div class="sg-q-head"><span>NAPI BÓNUSZ</span><span>${dailyStatus().available ? 'MA MÉG ÁTVEHETŐ' : '✓ MA MEGVOLT'}</span></div>
        <div class="sg-d-grid sg-d-small">${dailyStripHtml()}</div>${dailyButtonHtml()}<div style="height:12px"></div>`;
    if (!t.finalClaimed) {
        html += `<div class="sg-q-head"><span>ELSŐ LÉPÉSEK</span><span>${n} / ${steps.length}</span></div>
            <div class="sg-q-prog"><i style="width:${Math.round(n / steps.length * 100)}%"></i></div>`;
        html += steps.map(s => {
            const done = !!t.done[s.key];
            return `<div class="sg-q-step${done ? ' done' : ''}${s.key === nextKey ? ' next' : ''}">
                <span class="sg-q-check">${done ? '✓' : ''}</span>
                <div><div class="sg-q-t">${escapeAttr(s.title)}</div>${done ? '' : `<div class="sg-q-h">${escapeAttr(s.hint)}</div>${s.key === 'walk' ? walkProgressHtml() : ''}`}</div>
                <span class="sg-q-xp">+${s.xp} XP</span></div>`;
        }).join('');
        const items = SurvivalTutorial.FINAL_REWARD.map(r => {
            const item = itemDatabase[r.key] || { name: r.key, icon: '📦' };
            return `<span title="${escapeAttr(item.name)}">${tileIconHtml(item)}${r.count > 1 ? `<b>×${r.count}</b>` : ''}</span>`;
        }).join('');
        const ready = SurvivalTutorial.allDone(t);
        html += `<div class="sg-q-reward"><div class="sg-q-head" style="justify-content:center;margin:0">TÚLÉLŐCSOMAG · +${SurvivalTutorial.FINAL_XP} XP</div>
            <div class="sg-q-items">${items}</div>
            <button class="sg-tu-big${ready ? '' : ' sg-tu-ghost'}" ${ready ? '' : 'disabled'} onclick="socket.emit('tutorial_claim')">${ready ? 'JUTALOM ÁTVÉTELE' : 'TELJESÍTSD MIND A 6 LÉPÉST'}</button></div>`;
    } else {
        html += `<div class="sg-q-head"><span>ELSŐ LÉPÉSEK</span><span>✓ KÉSZ</span></div>`;
    }
    body.innerHTML = html;
}

function updateQuestBadge() {
    const badge = document.getElementById('nav-quest-badge');
    if (!badge) return;
    const t = player.tutorial;
    const daily = player.daily !== undefined && dailyStatus().available ? 1 : 0;
    const left = t && !t.finalClaimed ? Math.max(1, SurvivalTutorial.STEPS.length - SurvivalTutorial.doneCount(t)) : 0;
    const advent = (typeof adventHasOpenable === 'function' && adventHasOpenable() ? 1 : 0) + (typeof winterHasSpin === 'function' && winterHasSpin() ? 1 : 0);
    if (left + daily + advent === 0) { badge.classList.add('hidden'); return; }
    badge.textContent = String(left + daily + advent);
    badge.classList.remove('hidden');
}

// ---------- Egyszeri helyzeti tippek ----------
const TIPS = {
    thirst: '💧 Szomjas vagy! Igyál vizet. A koszos vizet előbb forrald fel, különben megbetegedhetsz.',
    hunger: '🥫 Éhes vagy! Egyél valamit, mielőtt fogyni kezd az életed.',
    weight: '🎒 Túl nehéz a csomagod: gyorsabban fáradsz. Dobj ki vagy tegyél le valamit.',
    fatigue: '😮‍💨 Kimerült vagy: így nem tudsz kutatni. Állj meg pár percre, és visszajön az erőd.',
    hp: '🩹 Kevés az életed! Kötözd be magad, mielőtt újabb harcba keveredsz.'
};
function tipsSeen() {
    try { return JSON.parse(localStorage.getItem('sg_tips_v1') || '{}') || {}; } catch (e) { return {}; }
}
function showTipOnce(key) {
    const seen = tipsSeen();
    if (seen[key]) return;
    seen[key] = 1;
    try { localStorage.setItem('sg_tips_v1', JSON.stringify(seen)); } catch (e) { /* privát mód: legfeljebb újra megjelenik */ }
    showToast(TIPS[key]);
    const first = document.querySelector('#toast-stack .toast-item');
    if (first) first.classList.add('sg-tip');
}
function checkTips() {
    if (!player || player.dead) return;
    if (player.thirst !== undefined && player.thirst < 30) showTipOnce('thirst');
    if (player.hunger !== undefined && player.hunger < 30) showTipOnce('hunger');
    if (player.fatigue >= 100) showTipOnce('fatigue');
    if (player.maxHp && player.hp / player.maxHp < 0.3) showTipOnce('hp');
    if (player.maxWeight && (player.weight || 0) > player.maxWeight) showTipOnce('weight');
}

// ---------- Szerver események ----------
socket.on('player_state', (data) => {
    const t = data && data.player && data.player.tutorial;
    if (!t) return;
    // frissen kipipált lépések jelzése
    if (tutorialPrevDone) {
        SurvivalTutorial.STEPS.forEach(s => {
            if (t.done[s.key] && !tutorialPrevDone[s.key]) logMessage(`✅ Első lépések: ${s.title} (+${s.xp} XP)`);
        });
        if (SurvivalTutorial.allDone(t) && !t.finalClaimed && SurvivalTutorial.doneCount({ done: tutorialPrevDone }) < SurvivalTutorial.STEPS.length) {
            logMessage('🎁 Minden első lépés kész! A Küldetés gomb alatt átveheted a túlélőcsomagot.');
        }
    }
    tutorialPrevDone = { ...t.done };
    // első belépéskor az üdvözlő kártyák (a halál képernyő alatt nem)
    if (!t.introSeen && !introShownThisSession && !data.player.dead) {
        introShownThisSession = true;
        setTimeout(showIntro, 600);
    } else if (t.introSeen && !dailyShownThisSession && !data.player.dead && data.player.daily !== undefined
        && SurvivalDaily.status(data.player.daily, Date.now()).available) {
        // belépéskor egyszer felugrik a napi bónusz
        dailyShownThisSession = true;
        setTimeout(openDailyModal, 700);
    }
    // telefonos értesítés: a feliratkozás frissítése, és (régi játékosnak) a telepítés/értesítés ajánló
    if (!appCheckedThisSession && !data.player.dead) {
        appCheckedThisSession = true;
        if (typeof pushRefresh === 'function') pushRefresh();
        // értesítésből jött (a stáb válaszolt): rögtön megnyitjuk a beszélgetést
        if (/[?&]support=1/.test(location.search) && typeof openSupportModal === 'function') {
            setTimeout(openSupportModal, 900);
            try { history.replaceState(null, '', '/'); } catch (e) { }
        }
        if (t.introSeen && typeof scheduleAppPrompt === 'function') scheduleAppPrompt();
    }
    setTimeout(() => { updateQuestBadge(); checkTips(); const m = document.getElementById('quest-modal'); if (m && !m.classList.contains('hidden')) renderQuestModal(); }, 0);
});
socket.on('daily_result', (data) => {
    if (data && data.message) logMessage((data.success ? '🎁 ' : '') + data.message);
    const pend = dailyPending; dailyPending = null;
    if (data && data.success) {
        const wait = pend ? Math.max(0, 1000 - (Date.now() - pend.t0)) : 0;
        setTimeout(() => {
            renderDailyModal(); renderQuestModal(); updateQuestBadge();
            showDailyCrate('open', data.day);
            if (typeof playSound === 'function') playSound('win');
            if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
        }, wait);
        return;
    }
    const ov = document.getElementById('daily-crate'); if (ov) ov.remove();
    setTimeout(() => {
        renderDailyModal(); renderQuestModal(); updateQuestBadge();
        const body = document.getElementById('daily-body');
        if (body && data && data.message) body.insertAdjacentHTML('afterbegin', `<div class="sg-adv-note test">${escapeAttr(data.message)}</div>`);
    }, 0);
});
socket.on('tutorial_result', (data) => {
    if (data && data.message) logMessage((data.success ? '🎁 ' : '') + data.message);
    renderQuestModal();
    updateQuestBadge();
});
setInterval(checkTips, 30000);
socket.on('push_result', (d) => { if (d && d.message) logMessage(d.message); });
