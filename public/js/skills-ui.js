// skills-ui.js
// KÉPESSÉGFA – kliens oldal (v0.1.20). Egy ág látszik egyszerre (fülek), a sorokat elválasztó csík jelzi,
// hány pont kell az ágban a következő sorhoz. Nincsenek összekötő vonalak: középen egy "törzs" fut végig.
let skillBranch = 'harcos';
let skillSelected = null;
let skillPrice = null;     // { free, money, crystals } a szervertől
let skillCrystals = false; // fizethet-e kristállyal

function skillsState() { return (player && player.skills) || { ranks: {}, freeUsed: false, respecs: 0 }; }
function openSkills() {
    document.getElementById('skills-modal').classList.remove('hidden');
    socket.emit('skills_info');
    renderSkills();
    // a fa alulról nő: nyitáskor az ALAP sor (a gyökér) látszik
    const b = document.getElementById('skills-body'); if (b) requestAnimationFrame(() => { b.scrollTop = b.scrollHeight; });
}
function closeSkills() { document.getElementById('skills-modal').classList.add('hidden'); skillSelected = null; const pop = document.getElementById('skills-pop'); if (pop) pop.classList.add('hidden'); }
function skillTab(key) { skillBranch = key; skillSelected = null; renderSkills(); const b = document.getElementById('skills-body'); if (b) requestAnimationFrame(() => { b.scrollTop = b.scrollHeight; }); }
function skillPick(key) {
    skillSelected = key;
    const pop = document.getElementById('skills-pop');
    if (!pop || !player) return;
    pop.innerHTML = `<div class="sg-sk-popin">${skillDetailHtml(skillsState(), player.level || 1)}<button class="sg-sk-rb" style="width:100%;margin-top:8px" onclick="skillPopHide()">VISSZA A FÁHOZ</button></div>`;
    pop.classList.remove('hidden');
    renderSkills();
}
function skillPopHide() { skillSelected = null; const pop = document.getElementById('skills-pop'); if (pop) pop.classList.add('hidden'); renderSkills(); }
function skillLearn(key) { socket.emit('skill_learn', { key }); }

function skillNodeHtml(s, st, lvl) {
    const SK = SurvivalSkills;
    const rank = (st.ranks || {})[s.key] || 0;
    const open = SK.spent(st, s.branch) >= SK.TIERS[s.tier];
    const can = open && rank < s.max && SK.available(st, lvl) > 0;
    const cls = ['sg-sk-node', s.cap ? 'cap' : '', rank > 0 ? 'has' : '', rank >= s.max ? 'max' : '', open ? '' : 'locked', can ? 'can' : '', skillSelected === s.key ? 'sel' : ''].filter(Boolean).join(' ');
    // kerek "érem": a gyűrű annyira telik, ahány rangod van belőle
    const p = Math.round(rank / s.max * 100);
    const fx = s.desc(s.per * Math.max(1, rank));
    return `<button class="${cls}" onclick="skillPick('${s.key}')">
        <span class="sg-sk-orb" style="--p:${p}%"><span class="sg-sk-ic">${open ? s.icon : '🔒'}</span>${s.max > 1 ? `<b class="sg-sk-rk">${rank}/${s.max}</b>` : ''}</span>
        <span class="sg-sk-nm">${escapeAttr(s.name)}</span>
        <span class="sg-sk-fx">${escapeAttr(fx)}</span></button>`;
}

function skillDetailHtml(st, lvl) {
    const SK = SurvivalSkills;
    const s = SK.BY_KEY[skillSelected];
    if (!s) return `<div class="sg-sk-detail sg-sk-hint">Koppints egy képességre a részletekért.</div>`;
    const rank = (st.ranks || {})[s.key] || 0;
    const now = rank > 0 ? s.desc(s.per * rank) : 'Még nem tanultad.';
    const next = rank < s.max ? s.desc(s.per * (rank + 1)) : null;
    const c = SK.canLearn(st, lvl, s.key);
    return `<div class="sg-sk-detail">
        <div class="sg-sk-dh"><span>${s.icon} ${escapeAttr(s.name)}</span><span>${s.cap ? 'CSÚCSKÉPESSÉG' : `${rank} / ${s.max}`}</span></div>
        <div class="sg-sk-dl">Most: <b>${escapeAttr(now)}</b></div>
        ${next ? `<div class="sg-sk-dl">${rank ? 'Következő rang' : 'Felvéve'}: <b>${escapeAttr(next)}</b></div>` : '<div class="sg-sk-dl">✓ A csúcson van.</div>'}
        ${next ? (c.ok ? `<button class="sg-tu-big" onclick="skillLearn('${s.key}')">TANULÁS (1 PONT)</button>` : `<div class="sg-sk-why">${escapeAttr(c.error)}</div>`) : ''}
    </div>`;
}

function skillRespecHtml(st) {
    const SK = SurvivalSkills;
    if (!SK.spent(st)) return '';
    const pr = skillPrice;
    if (!pr) return '';
    if (pr.free) return `<div class="sg-sk-respec"><div>Újraosztás: az első <b>ingyenes</b>, bármikor felhasználhatod.</div>
        <button class="sg-sk-rb" onclick="skillRespec('free')">⟲ INGYENES ÚJRAOSZTÁS</button></div>`;
    return `<div class="sg-sk-respec"><div>Újraosztás (a szinteddel drágul):</div>
        <button class="sg-sk-rb" onclick="skillRespec('money')">⟲ ${pr.money} $</button>
        ${skillCrystals ? `<button class="sg-sk-rb" onclick="skillRespec('crystal')">⟲ 💎 ${pr.crystals} kristály</button>` : ''}</div>`;
}
function skillRespec(pay) {
    const pr = skillPrice || {};
    const what = pay === 'free' ? 'az ingyenes újraosztást' : pay === 'money' ? `${pr.money} $-t` : `${pr.crystals} kristályt`;
    const box = document.getElementById('skills-confirm');
    box.innerHTML = `<div class="sg-sk-conf">Minden elosztott pontod visszakapod, és újra eloszthatod. Ez ${what} használja fel.
        <div style="display:flex;gap:8px;margin-top:8px"><button class="sg-sk-rb" onclick="skillConfirmNo()">MÉGSE</button>
        <button class="sg-sk-rb sg-sk-yes" onclick="skillConfirmYes('${pay}')">IGEN, ÚJRAOSZTOM</button></div></div>`;
    box.classList.remove('hidden');
}
function skillConfirmNo() { document.getElementById('skills-confirm').classList.add('hidden'); }
function skillConfirmYes(pay) { skillConfirmNo(); socket.emit('skill_respec', { pay }); }

function renderSkills() {
    const body = document.getElementById('skills-body');
    if (!body || typeof SurvivalSkills === 'undefined' || !player) return;
    const SK = SurvivalSkills, st = skillsState(), lvl = player.level || 1;
    const free = SK.available(st, lvl);
    const br = SK.BRANCHES.find(b => b.key === skillBranch) || SK.BRANCHES[0];
    let html = `<div class="sg-sk-top"><span>${lvl}. SZINT</span><span class="sg-sk-free${free > 0 ? ' on' : ''}">${free} SZABAD PONT</span></div>`;
    html += `<div class="sg-sk-tabs">${SK.BRANCHES.map(b => `<button class="${b.key === br.key ? 'on' : ''}" style="--c:${b.color}" onclick="skillTab('${b.key}')">${b.icon}<span>${b.name}</span><b>${SK.spent(st, b.key)}</b></button>`).join('')}</div>`;
    html += `<div class="sg-sk-desc">${escapeAttr(br.desc)} <b>Koppints egy képességre, és megnézheted, mit ad.</b></div>`;
    const inBranch = SK.spent(st, br.key);
    // Igazi fa: lent a gyökér és az ALAP sor, felfelé nő a törzs; minden képesség egy ágon ül, a csúcson a korona
    html += `<div class="sg-sk-tree" style="--c:${br.color}">`;
    SK.TIERS.map((need, tier) => ({ need, tier })).reverse().forEach(({ need, tier }) => {
        const list = SK.SKILLS.filter(s => s.branch === br.key && s.tier === tier);
        const open = inBranch >= need;
        // ág: finom, íves vonal a törzstől a képességig (nyitott sorban az ág színében világít)
        const branchSvg = (side) => `<svg class="sg-sk-br" viewBox="0 0 100 40" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke" d="${side === 'l' ? 'M0 10 C 45 10, 75 14, 100 36' : 'M100 10 C 55 10, 25 14, 0 36'}"/></svg>`;
        html += `<div class="sg-sk-row${list.length === 1 ? ' top' : ''}${open ? ' open' : ''}">${list.map((s, i) => { const side = list.length === 1 ? 'mid' : i === 0 ? 'l' : 'r'; return `<div class="sg-sk-limb ${side}${open ? ' open' : ''}">${side === 'mid' ? '' : branchSvg(side)}${skillNodeHtml(s, st, lvl)}</div>`; }).join('')}</div>`;
        html += `<div class="sg-sk-sep${open ? ' open' : ''}"><span>${need === 0 ? 'ALAP · ITT KEZDŐDIK' : `${need} PONT ${open ? '✓' : `· még ${need - inBranch}`}`}</span></div>`;
    });
    html += `</div>`;
    html += skillRespecHtml(st);
    html += `<div class="sg-q-h" style="margin:10px 2px 4px">Szintenként 1 pont, minden 10. szinten +1. Halálkor a képességek is elvesznek: az új túlélő elölről kezdi.</div>`;
    body.innerHTML = html;
}

socket.on('skills_info', (d) => { skillPrice = d && d.price; skillCrystals = !!(d && d.crystals); if (!document.getElementById('skills-modal').classList.contains('hidden')) renderSkills(); });
socket.on('skill_result', (d) => {
    if (d && d.message) logMessage((d.success ? '⭐ ' : '⚠️ ') + d.message);
    if (d && !d.success && typeof showToast === 'function') showToast(d.message);
    if (d && d.success && typeof playSound === 'function') playSound('win');
});
socket.on('player_state', () => {
    setTimeout(() => {
        const m = document.getElementById('skills-modal');
        if (m && !m.classList.contains('hidden')) { renderSkills(); const pop = document.getElementById('skills-pop'); if (skillSelected && pop && !pop.classList.contains('hidden')) skillPick(skillSelected); }
        const badge = document.getElementById('nav-skill-badge');
        if (badge && player && typeof SurvivalSkills !== 'undefined') {
            const n = SurvivalSkills.available(skillsState(), player.level || 1);
            badge.textContent = String(n);
            badge.classList.toggle('hidden', n <= 0);
        }
    }, 0);
});
