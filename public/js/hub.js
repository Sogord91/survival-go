// hub.js – KARAKTER-KÖZPONT (v0.1.27)
// Az avatarra koppintva egy teljes képernyős ablak nyílik, felül fülsorral:
//   Készlet · Képesség · Profil · Barátok · Üzenetek
// Moduláris: minden fül egy meglévő ablakot „dokkol” a fülsor alá (a saját fejlécét elrejtjük),
// így a régi kód (frissítés, gombok, események) változatlanul működik. Új fül = egy új sor a HUB_TABS-ban.
// A Csapat külön, a menüsorban maradt (openSocial('team')).

const HUB_TABS = [
    { key: 'inv', name: 'Készlet', icon: 'nav-backpack', modal: 'equipment-modal',
        open: () => { document.getElementById('equipment-modal').classList.remove('hidden'); if (typeof updateUI === 'function') updateUI(); },
        close: () => { const b = document.getElementById('btn-close-equipment'); if (b) b.click(); else document.getElementById('equipment-modal').classList.add('hidden'); } },
    { key: 'skills', name: 'Képesség', icon: 'nav-skills', modal: 'skills-modal', open: () => hubRaw.openSkills(), close: () => closeSkills() },
    { key: 'profile', name: 'Profil', icon: 'nav-profile', modal: 'profile-modal', open: () => { if (player && player.username) hubRaw.openProfile(player.username); }, close: () => closeProfile() },
    { key: 'friends', name: 'Barátok', icon: 'nav-friends', modal: 'social-modal', open: () => hubRaw.openSocial('friends'), close: () => closeSocial() },
    { key: 'dm', name: 'Üzenetek', icon: 'nav-mail', modal: 'social-modal', open: () => hubRaw.openSocial('dm'), close: () => closeSocial() }
];
const hubRaw = { openSkills, openProfile, openSocial };
let hubTab = null, hubSwitching = false, hubWatch = null;
window.sgSocialMode = 'all'; // a Közösség ablak melyik füleit mutatja (social-ui.js)

function hubEl() { return document.getElementById('sg-hub'); }
function hubIsOpen() { const h = hubEl(); return !!h && !h.classList.contains('hidden'); }

function hubRenderShell() {
    const h = hubEl(); if (!h) return;
    const ava = document.querySelector('#hud-avatar img');
    const lvl = (player && player.level) || 1, rank = (document.getElementById('hud-rank') || {}).textContent || '';
    h.innerHTML = `<div class="sg-hub-head">
            <div class="sg-hub-ava">${ava ? `<img src="${ava.getAttribute('src')}" alt="">` : ''}</div>
            <div class="sg-hub-id"><b>${typeof escapeAttr === 'function' ? escapeAttr(player.username || '') : ''}</b><small>${rank} · ${lvl}. szint</small></div>
            <button class="sg-hub-x" onclick="hubClose()" aria-label="Bezár">✕</button></div>
        <div class="sg-hub-tabs">${HUB_TABS.map(t => `<button class="${t.key === hubTab ? 'on' : ''}" onclick="hubOpen('${t.key}')"><img src="/images/ui/${t.icon}.svg" alt=""><span>${t.name}</span><b id="hub-badge-${t.key}" class="nav-badge hidden">0</b></button>`).join('')}</div>`;
    hubBadges();
    // a dokkolt ablak a fülsor alatt kezdődik
    requestAnimationFrame(() => document.documentElement.style.setProperty('--sg-hub-h', h.offsetHeight + 'px'));
}

function hubOpen(key) {
    key = key || hubTab || localStorageGet('sg_hub_tab') || 'inv';
    const tab = HUB_TABS.find(t => t.key === key) || HUB_TABS[0];
    if (typeof radialClose === 'function') radialClose();
    // egy fölötte nyitva maradt idegen profil vagy a Csapat ablak ne takarja el
    const pm = document.getElementById('profile-modal'); if (pm && !pm.classList.contains('in-hub') && !pm.classList.contains('hidden')) closeProfile();
    const sm = document.getElementById('social-modal'); if (sm && !sm.classList.contains('in-hub') && !sm.classList.contains('hidden')) closeSocial();
    hubSwitching = true;
    const prev = HUB_TABS.find(t => t.key === hubTab);
    if (prev && hubIsOpen()) { try { prev.close(); } catch (e) { /* */ } document.getElementById(prev.modal).classList.remove('in-hub'); }
    hubTab = tab.key; localStorageSet('sg_hub_tab', tab.key);
    window.sgSocialMode = tab.key === 'friends' ? 'friends' : tab.key === 'dm' ? 'dm' : 'all';
    hubEl().classList.remove('hidden');
    hubRenderShell();
    const m = document.getElementById(tab.modal);
    m.classList.add('in-hub');
    try { tab.open(); } catch (e) { console.warn('hub', e); }
    hubSwitching = false;
    // ha a dokkolt ablakot valami más zárja be (pl. egy gomb), a központ is bezárul
    if (hubWatch) hubWatch.disconnect();
    hubWatch = new MutationObserver(() => { if (!hubSwitching && m.classList.contains('hidden') && hubIsOpen()) hubClose(true); });
    hubWatch.observe(m, { attributes: true, attributeFilter: ['class'] });
    const hint = document.getElementById('hud-id'); if (hint) hint.classList.remove('sg-hint');
    localStorageSet('sg_hub_seen', '1');
}

function hubClose(already) {
    if (hubWatch) { hubWatch.disconnect(); hubWatch = null; }
    const t = HUB_TABS.find(x => x.key === hubTab);
    if (t) {
        const m = document.getElementById(t.modal);
        hubSwitching = true;
        if (!already) { try { t.close(); } catch (e) { /* */ } }
        m.classList.remove('in-hub');
        hubSwitching = false;
    }
    window.sgSocialMode = 'all';
    const h = hubEl(); if (h) h.classList.add('hidden');
}

// a régi belépési pontok a központba irányítanak
window.openSkills = () => hubOpen('skills');
window.openMyProfile = () => hubOpen('profile');
window.openInventory = () => hubOpen('inv');
window.openSocial = (tab) => {
    if (tab === 'team') { // a Csapat külön ablak (a menüsorból)
        if (hubIsOpen()) hubClose();
        window.sgSocialMode = 'team';
        return hubRaw.openSocial('team');
    }
    if (tab === 'invite' || tab === 'share') { hubOpen('friends'); if (typeof socialSetTab === 'function') socialSetTab(tab); return; }
    return hubOpen(tab === 'dm' ? 'dm' : 'friends');
};
// saját profil megnyitása máshonnan (pl. ranglista) → a központ Profil füle
window.openProfile = (name) => (player && name && name === player.username ? hubOpen('profile') : hubRaw.openProfile(name));

// ---------- jelvények: avatar (összesen), fülek, Csapat gomb ----------
function hubCounts() {
    const st = (typeof socialState !== 'undefined' && socialState) || {};
    let skills = 0;
    try { if (player && typeof SurvivalSkills !== 'undefined' && typeof skillsState === 'function') skills = SurvivalSkills.available(skillsState(), player.level || 1) || 0; } catch (e) { /* */ }
    const friends = (st.friends || []).filter(f => f.incoming).length;
    const dm = typeof dmUnread !== 'undefined' ? dmUnread || 0 : 0;
    const team = typeof teamAlerts === 'function' ? teamAlerts(st) || 0 : (st.teamInvites || []).length;
    return { inv: 0, skills, profile: 0, friends, dm, team };
}
function setBadge(id, n) { const b = document.getElementById(id); if (!b) return; b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !(n > 0)); }
function hubBadges() {
    const c = hubCounts();
    HUB_TABS.forEach(t => setBadge('hub-badge-' + t.key, c[t.key]));
    setBadge('hud-ava-badge', c.skills + c.friends + c.dm);
    setBadge('nav-team-badge', c.team);
}
setInterval(hubBadges, 1500);

// apró segédek (a localStorage néhol nem érhető el)
function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } }

// Vissza gomb (Android): előbb a központ záródik
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hubIsOpen()) hubClose(); });

// első alkalommal: a pulzáló gyűrű és egy rövid tipp mutatja, hová költözött a Készlet
setTimeout(() => {
    if (localStorageGet('sg_hub_seen')) return;
    const id = document.getElementById('hud-id'); if (id) id.classList.add('sg-hint');
    if (typeof logMessage === 'function') logMessage('🎒 Új: a Készlet, a Képességek, a Profil, a Barátok és az Üzenetek az avatarodra koppintva nyílnak. A Csapat lent, a menüsorban van.');
}, 4000);
