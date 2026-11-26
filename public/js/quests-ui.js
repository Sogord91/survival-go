// quests-ui.js
// NAPI ÉS HETI KÜLDETÉSEK – kliens oldal (v0.1.20). A lista a player_state "quests" mezőjében jön,
// a haladást és a jutalmat a szerver számolja (js/quests.js). Ez csak megjeleníti, és a cserét kéri.

function questRowHtml(q, index, canReroll) {
    const d = SurvivalQuests.describe(q);
    const pct = Math.round(Math.min(1, q.progress / q.target) * 100);
    const reroll = canReroll && !q.done
        ? `<button class="sg-qs-swap" onclick="questReroll(${index})" title="Csere (naponta 1×)">⟳ CSERE</button>` : '';
    return `<div class="sg-q-step sg-qs${q.done ? ' done' : ''}${d.move ? ' move' : ''}">
        <span class="sg-q-check">${q.done ? '✓' : d.icon}</span>
        <div style="flex:1;min-width:0"><div class="sg-q-t">${escapeAttr(d.title)}</div>
            ${q.done ? '' : `<div class="sg-q-h">${escapeAttr(d.hint)}</div>`}
            <div class="sg-qs-bar"><i style="width:${pct}%"></i><span>${SurvivalQuests.progressText(q)}</span></div>
            ${reroll}</div>
        <span class="sg-q-xp">+${d.xp} XP<br>+${d.money} $</span></div>`;
}

function questsCardHtml() {
    const q = player && player.quests;
    if (!q || !Array.isArray(q.daily)) return '';
    const dDone = q.daily.filter(x => x.done).length, wDone = q.weekly.filter(x => x.done).length;
    const B = SurvivalQuests;
    let html = `<div class="sg-q-head"><span>NAPI KÜLDETÉSEK</span><span>${dDone} / ${q.daily.length}</span></div>`;
    html += q.daily.map((x, i) => questRowHtml(x, i, !q.rerolled)).join('');
    html += `<div class="sg-qs-bonus${q.dailyBonus ? ' got' : ''}">${q.dailyBonus ? '✓ ' : '🏆 '}Mind a ${q.daily.length} kész: +${B.DAILY_BONUS.xp} XP, +${B.DAILY_BONUS.money} $</div>`;
    html += `<div class="sg-q-head" style="margin-top:12px"><span>HETI KÜLDETÉSEK</span><span>${wDone} / ${q.weekly.length} · hétfőn új</span></div>`;
    html += q.weekly.map((x) => questRowHtml(x, -1, false)).join('');
    if (q.towns && q.towns.length && q.weekly.some(x => x.kind === 'w_towns')) html += `<div class="sg-q-h" style="margin:4px 2px">Ahol a héten jártál: ${q.towns.map(escapeAttr).join(', ')}</div>`;
    html += `<div class="sg-qs-bonus${q.weeklyBonus ? ' got' : ''}">${q.weeklyBonus ? '✓ ' : '🏆 '}Mind a ${q.weekly.length} kész: +${B.WEEKLY_BONUS.xp} XP, +${B.WEEKLY_BONUS.money} $</div>`;
    html += `<div class="sg-q-h" style="margin:6px 2px 12px">🧭 Felfedező bónusz: minden új terület, ahol még nem jártál, +${B.EXPLORE_XP} XP. Eddig ${q.explored || 0} területet jártál be.</div>`;
    return html;
}

function questReroll(index) { socket.emit('quest_reroll', { index }); }
socket.on('quest_result', (d) => {
    if (d && d.message) logMessage((d.success ? '⟳ ' : '⚠️ ') + d.message);
    if (d && !d.success && typeof showToast === 'function') showToast(d.message);
});
