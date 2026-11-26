// leaderboard-ui.js
// RANGLISTA – kliens oldal (v0.1.20). A szerver küldi az első 50-et és a saját helyezésedet (js/season.js).
let lbBoard = 'xp';
let lbData = null;

function openLeaderboard() {
    document.getElementById('lb-modal').classList.remove('hidden');
    lbLoad(lbBoard);
}
function closeLeaderboard() { document.getElementById('lb-modal').classList.add('hidden'); }
function lbLoad(board) {
    lbBoard = board;
    lbRender(true);
    socket.emit('leaderboard', { board });
}
function lbLeft(ms) {
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24;
    return d >= 1 ? `még ${d} nap${h ? ` ${h} óra` : ''}` : `még ${Math.max(1, Math.floor(ms / 3600000))} óra`;
}
function lbValue(v, board) {
    const b = SurvivalSeason.BOARDS.find(x => x.key === board);
    const n = board === 'meters' ? String(v).replace('.', ',') : Number(v).toLocaleString('hu-HU');
    return `${n} <small>${b ? b.unit : ''}</small>`;
}
function lbRowHtml(r, board, mine) {
    const Sh = window.SurvivalShop && SurvivalShop.BY_KEY;
    const fr = Sh && r.frame && Sh[r.frame], ti = Sh && r.title && Sh[r.title];
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank;
    const rw = lbData && lbData.rewarded && board === 'xp' ? SurvivalSeason.rewardFor(r.rank) : null;
    return `<div class="sg-lb-row${mine ? ' me' : ''}${r.rank <= 3 ? ' top' : ''}${rw ? ' rw' : ''}">
        <span class="sg-lb-rank">${medal}</span>
        ${r.team && typeof teamEmblemHtml === 'function' ? `<span class="sg-lb-av emb">${teamEmblemHtml(r.emblem, 38)}</span>` : `<span class="sg-lb-av" style="${fr ? `border-color:${fr.color};box-shadow:0 0 6px ${fr.color}` : ''}">${escapeAttr(r.name.slice(0, 1).toUpperCase())}</span>`}
        <span class="sg-lb-nm"><b>${escapeAttr(r.name)}${r.early ? ' <i title="Korai túlélő">✦</i>' : ''}</b>
            <small>${r.team ? `${r.level} tag` : `${ti ? `<em style="color:${ti.color}">${escapeAttr(ti.name)}</em> · ` : ''}${r.level}. szint`}</small></span>
        <span class="sg-lb-v">${lbValue(r.value, board)}</span></div>`;
}
function lbRender(loading) {
    const body = document.getElementById('lb-body');
    if (!body || typeof SurvivalSeason === 'undefined') return;
    const S = SurvivalSeason, d = lbData && lbData.board === lbBoard ? lbData : null;
    const b = S.BOARDS.find(x => x.key === lbBoard);
    let html = `<div class="sg-lb-tabs">${S.BOARDS.map(x => `<button class="${x.key === lbBoard ? 'on' : ''}" onclick="lbLoad('${x.key}')">${x.icon}<span>${x.name}</span></button>`).join('')}</div>`;
    if (d) {
        html += `<div class="sg-lb-season"><div><b>${d.monthName.toUpperCase()}</b> · ${d.rewarded ? 'SZEZON' : 'PRÓBASZEZON'}</div><div>${lbLeft(d.msLeft)}</div></div>`;
        if (lbBoard === 'xp') {
            html += d.rewarded
                ? `<div class="sg-lb-reward"><div class="sg-lb-rh">🟫 ROZSDÁS SZETT · a hónap végén</div>${S.REWARDS.map(r => `<div><b>${r.from}–${r.to}.</b> ${escapeAttr(r.label)}</div>`).join('')}<small>Legalább ${S.MIN_XP_FOR_REWARD} szezonpont kell.</small></div>`
                : `<div class="sg-lb-reward"><div class="sg-lb-rh">🟫 ROZSDÁS SZETT · 2027 januárjától</div>December próbaszezon: ismerd meg a ranglistát! Januártól a hónap legjobbjai kapják a Rozsdás szettet (keret, cím, fegyverfesték).</div>`;
        }
    }
    html += `<div class="sg-lb-desc">${escapeAttr(b ? b.desc : '')}</div>`;
    if (!d) html += `<div class="sg-lb-empty">${loading ? 'Betöltés…' : ''}</div>`;
    else if (!d.top.length) html += `<div class="sg-lb-empty">Ebben a hónapban még senki nincs a listán. Légy te az első!</div>`;
    else {
        html += d.top.map(r => lbRowHtml(r, lbBoard, d.me && r.name === d.me.name)).join('');
        if (d.me && d.me.rank > 50) html += `<div class="sg-lb-gap">⋯</div>` + lbRowHtml(d.me, lbBoard, true);
    }
    if (d && lbBoard === 'teams') {
        if (!d.me) html += `<div class="sg-lb-empty">${d.hasTeam ? 'A csapatod még nincs a listán: gyűjtsetek szezonpontot!' : 'Még nincs csapatod. <button class="sg-lb-join" onclick="closeLeaderboard();openSocial(\'team\')">🏕️ CSAPATOT KERESEK</button>'}</div>`;
        html += `<div class="sg-lb-foot">${d.total} csapat a listán · a stáb pontja nem számít</div>`;
    } else {
        if (d && !d.me && !d.staff) html += `<div class="sg-lb-empty">Még nem vagy a listán: indulj el, és gyűjts pontot!</div>`;
        if (d && d.staff) html += `<div class="sg-lb-empty">Stábtagként nem kerülsz a ranglistára.</div>`;
        if (d) html += `<div class="sg-lb-foot">${d.total} túlélő a listán · a stáb nem szerepel</div>`;
    }
    body.innerHTML = html;
}
socket.on('leaderboard', (d) => { lbData = d; if (d && d.board === lbBoard) lbRender(false); });
