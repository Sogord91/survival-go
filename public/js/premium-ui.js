// premium-ui.js – prémium bolt a játékban (v0.1.16): bolt, ládák, gyűjtemény, credit vásárlás átutalással
let premium = { enabled: false, credits: 0, owned: [], crates: {}, keys: {}, frame: '', title: '', slotsBought: 0, orders: [] };
let premiumTab = 'shop';
let premiumPkg = null;
let premiumLastOrder = null;
const PS = () => window.SurvivalShop;
const pEsc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GEM = '<img class="sg-gem" src="/images/premium/gem.webp" alt="credit">';
const priceHtml = (credits) => `${GEM}${credits} <span style="opacity:.7">(≈ ${PS().fmtHuf(PS().huf(credits))})</span>`;
const pImg = (name) => `/images/premium/${name}.webp`;

// FESTÉKEK (v0.1.31): a festék egy tárgyfajtára kerül (pl. minden AK-47-ed rozsdás lesz); halálkor sem vész el
let paintSel = null;
function paintsHtml(paints) {
    const S = window.SurvivalShop, skins = premium.skins || {};
    const painted = Object.keys(skins);
    if (!paints.length && !painted.length) return '';
    let h = `<div class="sg-prem-h">FESTÉKEK ÉS SKINEK</div>`;
    h += paints.map(k => { const p = S.BY_KEY[k]; return `<div class="sg-found-row" style="--tc:${p.style === 'rust' ? '#c0622a' : '#8fd0ee'}"><img src="${pImg(p.img)}" alt=""><div><b>${pEsc(p.name)} ×${premium.keys[k]}</b><small>${pEsc(p.desc || '')}</small></div>
        <button class="sg-pill" onclick="paintPick('${k}')">FELFESTEM</button></div>`; }).join('');
    if (paintSel) {
        const p = S.BY_KEY[paintSel];
        // választható tárgyak: minden fajta, ami ráfér (a fiókra kerül, nem egy példányra)
        const list = Object.entries(itemDatabase).filter(([key, it]) => S.paintFits(p, it));
        h += `<div class="sg-prem-h">MIRE KERÜLJÖN? <small>(${pEsc(p.name)})</small></div><p class="sg-ann-from">A festés a tárgy minden példányára érvényes a fiókodban, és halálkor sem vész el. A festék elfogy.</p>
            <div class="sg-paint-grid">${list.map(([key, it]) => `<button class="inv-tile${skins[key] === p.style ? ' selected' : ''}" title="${pEsc(it.name)}" onclick="paintApply('${paintSel}','${key}')">${tileIconHtml(Object.assign({}, it, { _key: key, _style: p.style }))}</button>`).join('')}</div>
            <button class="sg-pill" style="margin-top:6px" onclick="paintPick(null)">MÉGSE</button>`;
    }
    if (painted.length) h += `<div class="sg-prem-h">FESTETT TÁRGYAID (${painted.length})</div><div class="sg-paint-grid">${painted.filter(k => itemDatabase[k]).map(k => `<button class="inv-tile" title="${pEsc(itemDatabase[k].name)} – koppints a levételhez" onclick="if(confirm('Leveszed a festést erről: ${pEsc(itemDatabase[k].name).replace(/'/g, '')}? A festék nem jár vissza.'))socket.emit('paint_remove',{item:'${k}'})">${tileIconHtml(Object.assign({}, itemDatabase[k], { _key: k }))}</button>`).join('')}</div>`;
    return h;
}
function paintPick(k) { paintSel = k; renderPremium(); }
function paintApply(paint, item) { paintSel = null; socket.emit('paint_apply', { paint, item }); }

socket.on('premium_state', (data) => {
    premium = Object.assign({ owned: [], crates: {}, keys: {}, orders: [], skins: {} }, data || {});
    window.sgSkins = premium.skins || {};
    if (typeof updateUI === 'function') try { updateUI(); } catch (e) { /* */ }
    const btn = document.getElementById('btn-open-premium');
    // zárt boltnál csak akkor látszik (Gyűjtemény néven), ha már van nyert kinézete vagy kristálya
    const hasStuff = (premium.owned || []).length > 0 || (premium.credits || 0) > 0;
    if (btn) {
        btn.classList.toggle('hidden', !premium.enabled && !(premium.collection && hasStuff));
        const lbl = btn.querySelector('.sg-prem-lbl');
        if (lbl) lbl.textContent = premium.enabled ? 'Prémium bolt' : 'Gyűjteményem';
    }
    const chip = document.getElementById('premium-menu-credits');
    if (chip) chip.textContent = premium.credits || 0;
    player.cosmetic = (premium.enabled || premium.collection) ? { frame: premium.frame || '', title: premium.title || '' } : null;
    if (typeof renderStaffHud === 'function') renderStaffHud();
    if (typeof refreshMyMarker === 'function') refreshMyMarker();
    if (!document.getElementById('premium-modal').classList.contains('hidden')) renderPremium();
});
socket.on('premium_result', (data) => {
    if (data && data.reveal) return showCrateReveal(data.reveal, data.message);
    if (typeof logMessage === 'function' && data && data.message) logMessage((data.success ? '💎 ' : '⚠️ ') + data.message);
    const note = document.getElementById('premium-msg');
    if (note && data) { note.textContent = data.message || ''; note.style.color = data.success ? '#cfe08a' : '#f0a090'; }
});
socket.on('premium_order_result', (data) => {
    if (!data || !data.success) {
        const m = document.getElementById('prem-pop-msg') || document.getElementById('premium-msg');
        if (m) { m.textContent = (data && data.message) || 'Hiba.'; m.style.color = '#f0a090'; }
        const b = document.getElementById('premium-order-btn'); if (b) b.disabled = false;
        return;
    }
    premiumLastOrder = data.order;
    premiumPop('UTALD EL AZ ÖSSZEGET', transferHtml(data.order), '#e8c35a');
    socket.emit('premium_state');
});

function openPremium() {
    const s = document.getElementById('settings-modal'); if (s) s.classList.add('hidden');
    document.getElementById('premium-modal').classList.remove('hidden');
    socket.emit('premium_state');
    renderPremium();
}
function closePremium() { closePremiumPop(); document.getElementById('premium-modal').classList.add('hidden'); }
document.querySelectorAll('#premium-tabs button').forEach(b => b.addEventListener('click', () => { premiumTab = b.dataset.pt; renderPremium(); }));

function rarityOf(def) { return PS().RARITY[def.rarity] || { name: '', color: '#b9b29c' }; }
function cosmeticPreview(def) {
    if (def.kind === 'frame') return `<div class="sg-prem-prev" style="box-shadow:0 0 0 3px ${def.color}${def.glow ? `, 0 0 12px ${def.color}` : ''};${def.style === 'camo' ? 'outline:2px dashed ' + def.color + ';outline-offset:2px' : ''}"></div>`;
    return `<div class="sg-prem-title-prev"><span class="sg-marker-title" style="position:static;transform:none;display:inline-block;--cos-c:${def.color}">${pEsc(def.name.toUpperCase())}</span></div>`;
}
function shopCard(def, action) {
    const r = def.rarity ? rarityOf(def) : null;
    return `<div class="sg-prem-card" style="--rc:${r ? r.color : '#d9c58a'}">${def.kind ? cosmeticPreview(def) : def.img ? `<img class="sg-prem-icon" src="${pImg(def.img)}" alt="">` : ''}${r ? `<div class="rar">${r.name.toUpperCase()}</div>` : ''}<b>${pEsc(def.name)}</b><small>${pEsc(def.desc || '')}</small>${action}</div>`;
}
function buyBtn(def, extraDisabled, label) {
    const owned = def.kind && premium.owned.includes(def.key);
    const cant = premium.credits < def.price;
    return `<button ${owned || extraDisabled || cant ? 'disabled' : ''} onclick="premiumBuy('${def.key}')">${owned ? 'MEGVAN' : label || priceHtml(def.price)}</button>`;
}
function premiumBuy(key) {
    const def = PS().BY_KEY[key];
    if (!def) return;
    if (!confirm(`Megveszed: ${def.name}\nÁra: ${def.price} credit (≈ ${PS().fmtHuf(PS().huf(def.price))})`)) return;
    socket.emit('premium_buy', { key });
}

function renderPremium() {
    const S = PS();
    document.getElementById('premium-credits').textContent = premium.credits || 0;
    document.getElementById('premium-test-note').classList.toggle('hidden', premium.mode !== 'staff');
    document.querySelectorAll('#premium-tabs button').forEach(b => b.classList.toggle('on', b.dataset.pt === premiumTab));
    const body = document.getElementById('premium-body');
    const msg = '<div id="premium-msg" class="sg-ann-from" style="min-height:14px;margin-bottom:4px"></div>';
    // zárt bolt: csak a Gyűjtemény (a nyert keretek, címek felvehetők; a kristályok megmaradnak)
    document.getElementById('premium-tabs').classList.toggle('hidden', !premium.enabled);
    if (!premium.enabled) {
        if (!premium.collection) { body.innerHTML = '<p class="sg-ann-from">A prémium bolt hamarosan érkezik.</p>'; return; }
        const mine = S.COSMETICS.filter(c => (premium.owned || []).includes(c.key));
        const eqBtn = (c) => { const on = premium[c.kind] === c.key; return `<button class="${on ? '' : 'eq'}" onclick="socket.emit('premium_equip',{kind:'${c.kind}',key:'${on ? '' : c.key}'})">${on ? 'LEVÉTEL' : 'FELVÉTEL'}</button>`; };
        const paints = Object.keys(premium.keys || {}).filter(k => S.BY_KEY[k] && S.BY_KEY[k].paint && premium.keys[k] > 0);
        body.innerHTML = msg + `<div class="sg-prem-h">KERETEK ÉS CÍMEK (${mine.length})</div>` +
            (mine.length ? `<div class="sg-prem-grid">${mine.map(c => shopCard(c, eqBtn(c))).join('')}</div>` : '<p class="sg-ann-from">Még nincs nyert kinézeted. Az adventi naptárban és a szerencsekeréken szerezhetsz!</p>') +
            paintsHtml(paints) +
            `<p class="sg-ann-from" style="margin-top:10px">${premium.credits ? `💎 ${premium.credits} kristályod van. ` : ''}A bolt később nyílik; a nyert kinézeteid és kristályaid addig is megmaradnak, halálkor sem vesznek el.</p>`;
        return;
    }

    if (premiumTab === 'shop') {
        const buyable = S.COSMETICS.filter(c => c.price);
        body.innerHTML = msg +
            `<div class="sg-prem-h">KINÉZET – A TÖBBIEK IS LÁTJÁK</div><div class="sg-prem-grid">${buyable.map(c => shopCard(c, buyBtn(c))).join('')}</div>` +
            `<div class="sg-prem-h">KÉNYELEM</div><div class="sg-prem-grid">${S.COMFORT.map(c => shopCard(c, c.key === 'slots_2'
                ? buyBtn(c, premium.slotsBought >= c.max, premium.slotsBought >= c.max ? 'MAXIMUM' : null) + `<small style="text-align:center;margin-top:3px">${premium.slotsBought}/${c.max} megvéve</small>`
                : buyBtn(c))).join('')}</div>` +
            `<p class="sg-ann-from" style="margin-top:10px">A credit csak kinézetre és kényelemre költhető, harcban és zsákmányban nem ad előnyt. 1 credit = ${S.CREDIT_HUF} Ft.</p>`;
    } else if (premiumTab === 'crates') {
        const found = S.CRATES.filter(c => premium.crates[c.key] > 0);
        const keys = premium.keys.key_basic || 0;
        const foundHtml = found.length ? `<div class="sg-found">${found.map(c => `<div class="sg-found-row" style="--tc:${c.color}"><img src="${pImg(c.img)}" alt="" onclick="showCrateContents('${c.key}')"><div onclick="showCrateContents('${c.key}')"><b>${pEsc(c.name)} ×${premium.crates[c.key]}</b><small>Talált láda · ${c.keyItem ? `kulcs kell (nálad: ${keys})` : 'nyitható'}</small></div>
            <button class="sg-pill" ${!c.keyItem || keys ? '' : 'disabled'} onclick="socket.emit('premium_open_crate',{key:'${c.key}'})">KINYITÁS</button></div>`).join('')}
            <div class="sg-found-row" style="--tc:#d9c58a"><img src="${pImg('key')}" alt=""><div><b>Láda kulcs ×${keys}</b><small>A talált Kis ládához</small></div><button class="sg-pill" ${premium.credits < S.BY_KEY.key_basic.price ? 'disabled' : ''} onclick="premiumBuy('key_basic')">${priceHtml(S.BY_KEY.key_basic.price)}</button></div></div>` : '';
        body.innerHTML = msg + foundHtml + `<div class="sg-showcase">${S.CRATES.map(c => {
            const rc = S.rarityChances(c.key);
            return `<div class="sg-crate" style="--tc:${c.color}">
                ${c.popular ? '<span class="sg-badge">NÉPSZERŰ</span>' : ''}
                <div class="sg-crate-stage" onclick="showCrateContents('${c.key}')"><img src="${pImg(c.img)}" alt=""></div>
                <div class="sg-crate-name" onclick="showCrateContents('${c.key}')">${pEsc(c.name).toUpperCase()}</div>
                <div class="sg-crate-cat">${pEsc(c.cat || '')}</div>
                <div class="sg-crate-bars">${Object.keys(S.RARITY).map(r => rc[r] ? `<i style="flex:${rc[r]};background:${S.RARITY[r].color}" title="${S.RARITY[r].name}: ${(rc[r] * 100).toFixed(0)}%"></i>` : '').join('')}</div>
                <button class="sg-pill big" ${premium.credits < c.price ? 'disabled' : ''} onclick="premiumBuy('${c.key}')"><span>MEGVESZEM</span><b>${GEM}${c.price}</b><small>≈ ${S.fmtHuf(S.huf(c.price))}</small></button>
                <button class="sg-odds-link" onclick="showCrateContents('${c.key}')">TARTALOM ÉS ESÉLYEK ▸</button>
            </div>`;
        }).join('')}</div>
        <p class="sg-ann-from" style="margin-top:8px">Minden láda egy kinézeti tárgyat ad; a láda neve alatt látod, milyen fajtát. Koppints egy ládára a teljes tartalmáért. Ha olyat kapsz, ami már megvan, helyette creditet: ${Object.values(S.RARITY).map(r => `${r.name.toLowerCase()} ${r.dupRefund}`).join(', ')}. A Kis ládát épületekben is megtalálhatod.</p>`;
    } else if (premiumTab === 'mine') {
        const mine = S.COSMETICS.filter(c => premium.owned.includes(c.key));
        const eqBtn = (c) => { const on = premium[c.kind] === c.key; return `<button class="${on ? '' : 'eq'}" onclick="socket.emit('premium_equip',{kind:'${c.kind}',key:'${on ? '' : c.key}'})">${on ? 'LEVÉTEL' : 'FELVÉTEL'}</button>`; };
        const renames = premium.keys.rename || 0;
        body.innerHTML = msg +
            `<div class="sg-prem-h">KERETEK ÉS CÍMEK (${mine.length}/${S.COSMETICS.length})</div>` +
            (mine.length ? `<div class="sg-prem-grid">${mine.map(c => shopCard(c, eqBtn(c))).join('')}</div>` : '<p class="sg-ann-from">Még nincs kinézeted. Nézz körül a Boltban vagy nyiss ládát!</p>') +
            paintsHtml(Object.keys(premium.keys || {}).filter(k => S.BY_KEY[k] && S.BY_KEY[k].paint && premium.keys[k] > 0)) +
            `<div class="sg-prem-h">EGYÉB</div><p class="sg-ann-from">Prémium hátizsák-hely: +${premium.slotsBought * 2} · Ládák: ${Object.values(premium.crates).reduce((a, b) => a + b, 0)} · Kulcsok: ${premium.keys.key_basic || 0}</p>` +
            (renames ? `<div class="sg-prem-card"><b>🏷 Névváltoztatás (${renames})</b><small>Az új neveddel kell majd belépned. 3–16 betű vagy szám.</small><input id="premium-newname" maxlength="16" style="width:100%;padding:6px;margin-bottom:5px;background:#ece6d6;color:#2a2620;border:2px solid #15170f"><button onclick="const n=document.getElementById('premium-newname').value.trim(); if(n && confirm('Biztos? Az új neved: '+n)) socket.emit('premium_rename',{newName:n})">NÉV MEGVÁLTOZTATÁSA</button></div>` : '') +
            `<div class="sg-prem-h">RENDELÉSEIM</div>` + (premium.orders.length ? `<table class="sg-odds">${premium.orders.map(o => `<tr><td>${pEsc(o.code)}</td><td>${S.fmtHuf(o.huf)} → ◆ ${o.credits}</td><td class="n">${{ pending: '⏳ utalásra vár', paid: '✔ jóváírva', cancelled: '✕ törölve', expired: '⌛ lejárt' }[o.status] || o.status}</td></tr>`).join('')}</table>` : '<p class="sg-ann-from">Még nincs rendelésed.</p>');
    } else if (premiumTab === 'buy') {
        body.innerHTML = msg +
            `<div class="sg-prem-h">VÁLASSZ CSOMAGOT</div><div class="sg-pkgs">` + S.PACKAGES.map((p, i) => `<button class="sg-pkg" onclick="openPackage('${p.key}')">${p.popular ? '<span class="sg-badge">NÉPSZERŰ</span>' : ''}
                <span class="sg-pkg-gems">${Array.from({ length: i + 1 }, (_, k) => `<img src="${pImg(p.img)}" alt="" style="--k:${k}">`).join('')}</span>
                <b>${GEM}${p.credits}</b><small>${pEsc(p.name)}</small><span class="sg-pkg-price">${S.fmtHuf(p.huf)}</span></button>`).join('') + `</div>` +
            `<p class="sg-ann-from" style="margin-top:10px">Koppints egy csomagra. Fizetés banki átutalással; a credit akkor kerül jóváírásra, amikor az utalás megérkezett (általában 1–2 munkanap). A rendeléseidet a Gyűjteményem fülön látod.</p>`;
    }
}

// ---------- felugró ablak (láda tartalma, csomag vásárlás) ----------
function premiumPop(title, html, accent) {
    let pop = document.getElementById('prem-pop');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'prem-pop';
        pop.innerHTML = '<div class="sg-pop-box"><div class="sg-pop-head"><span id="prem-pop-title"></span><button onclick="closePremiumPop()">✕</button></div><div id="prem-pop-body" class="sg-pop-body"></div></div>';
        pop.addEventListener('click', (e) => { if (e.target === pop) closePremiumPop(); });
        document.body.appendChild(pop);
    }
    pop.style.setProperty('--tc', accent || '#d9c58a');
    document.getElementById('prem-pop-title').innerHTML = title;
    document.getElementById('prem-pop-body').innerHTML = html;
    pop.classList.remove('hidden');
}
function closePremiumPop() { const p = document.getElementById('prem-pop'); if (p) p.classList.add('hidden'); premiumPkg = null; }

// A láda tartalma kis rácsban: minden tárgy a ritkaság színével, mellette az esély
function showCrateContents(crateKey) {
    const S = PS(), c = S.CRATES.find(x => x.key === crateKey);
    if (!c) return;
    const odds = S.crateOdds(c.key).slice().sort((a, b) => a.chance - b.chance);
    const rc = S.rarityChances(c.key);
    const tile = (o) => {
        const d = S.BY_KEY[o.key], r = rarityOf(d), own = premium.owned.includes(d.key);
        const prev = d.kind === 'frame'
            ? `<span class="sg-ct-frame" style="--cc:${d.color};${d.glow ? `box-shadow:0 0 0 3px ${d.color},0 0 10px ${d.color}` : ''}"></span>`
            : `<span class="sg-ct-title" style="color:${d.color}">${pEsc(d.name.toUpperCase())}</span>`;
        return `<div class="sg-ct ${own ? 'own' : ''}" style="--rc:${r.color}" title="${pEsc(d.name)} – ${pEsc(d.desc || '')}">${own ? '<i class="sg-ct-own">✔</i>' : ''}${prev}<b>${pEsc(d.name)}</b><small>${(o.chance * 100).toFixed(2).replace('.', ',')}%</small></div>`;
    };
    const legend = Object.keys(S.RARITY).filter(r => rc[r]).map(r => `<span style="color:${S.RARITY[r].color}">■ ${S.RARITY[r].name} ${(rc[r] * 100).toFixed(0)}%</span>`).join(' ');
    const canOpen = premium.crates[c.key] > 0 && (!c.keyItem || (premium.keys.key_basic || 0) > 0);
    const action = premium.crates[c.key] > 0
        ? `<button class="sg-pill big" ${canOpen ? '' : 'disabled'} onclick="closePremiumPop();socket.emit('premium_open_crate',{key:'${c.key}'})"><span>NÁLAD: ${premium.crates[c.key]} DB</span><b>KINYITÁS</b>${c.keyItem ? '<small>kulcs kell</small>' : ''}</button>`
        : c.price ? `<button class="sg-pill big" ${premium.credits < c.price ? 'disabled' : ''} onclick="closePremiumPop();premiumBuy('${c.key}')"><span>MEGVESZEM</span><b>${GEM}${c.price}</b><small>≈ ${S.fmtHuf(S.huf(c.price))}</small></button>` : '';
    premiumPop(`${pEsc(c.name).toUpperCase()} <small class="sg-pop-cat">${pEsc((c.cat || '').toUpperCase())}</small>`, `
        <div class="sg-ct-hero"><img src="${pImg(c.img)}" alt=""></div>
        <div class="sg-crate-bars" style="margin:0 auto 4px">${Object.keys(S.RARITY).map(r => rc[r] ? `<i style="flex:${rc[r]};background:${S.RARITY[r].color}"></i>` : '').join('')}</div>
        <div class="sg-ct-legend">${legend}</div>
        <div class="sg-ct-grid">${odds.map(tile).join('')}</div>
        <p class="sg-ann-from" style="margin:8px 0">${pEsc(c.desc || '')} Egy nyitás egy tárgyat ad. Ha már megvan, helyette creditet kapsz. A ✔ jelűek már a tieid.</p>
        <div style="text-align:center">${action}</div>`, c.color);
}

// Csomag kiválasztása: a számlázási adatok és az átutalás külön ablakban
function openPackage(key) {
    const S = PS(), p = S.PACKAGES.find(x => x.key === key);
    if (!p) return;
    premiumPkg = key;
    premiumPop(`${GEM} ${p.credits} CREDIT – ${pEsc(p.name).toUpperCase()}`, `
        <div class="sg-pop-sum"><img src="${pImg(p.img)}" alt=""><div><b>${GEM}${p.credits} credit</b><small>Fizetendő: ${S.fmtHuf(p.huf)}</small></div></div>
        <div id="prem-pop-msg" class="sg-ann-from" style="min-height:14px"></div>
        <div class="sg-prem-form"><div class="sg-prem-h">SZÁMLÁZÁSI ADATOK</div>
            <input id="pb-name" placeholder="Név (a számlára)" maxlength="80">
            <div style="display:flex;gap:5px"><input id="pb-zip" placeholder="Irsz." maxlength="10" style="width:32%"><input id="pb-city" placeholder="Település" maxlength="60"></div>
            <input id="pb-address" placeholder="Utca, házszám" maxlength="120">
            <input id="pb-email" placeholder="E-mail (a számlához, nem kötelező)" maxlength="120">
            <label class="chk"><input type="checkbox" id="pb-terms"> <span>Elolvastam és elfogadom a <a href="/aszf" target="_blank" rel="noopener">vásárlási feltételeket (ÁSZF)</a> és az <a href="/adatvedelem.html" target="_blank" rel="noopener">adatkezelési tájékoztatót</a>.</span></label>
            <label class="chk"><input type="checkbox" id="pb-immediate"> <span>Kérem, hogy a credit az utalás beérkezése után azonnal jóváírásra kerüljön, és tudomásul veszem, hogy a jóváírással elveszítem a 14 napos elállási jogomat.</span></label>
            <button id="premium-order-btn" class="sg-tu-big" style="margin-top:10px" onclick="premiumOrder()">TOVÁBB AZ ÁTUTALÁSHOZ</button>
        </div>`, '#e8c35a');
    const me = player && player.email; if (me) { const e = document.getElementById('pb-email'); if (e) e.value = me; }
}
function premiumOrder() {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const m = document.getElementById('prem-pop-msg') || document.getElementById('premium-msg');
    if (!premiumPkg) { m.textContent = 'Válassz csomagot.'; m.style.color = '#f0a090'; return; }
    document.getElementById('premium-order-btn').disabled = true;
    socket.emit('premium_order', {
        pkg: premiumPkg,
        billing: { name: v('pb-name'), zip: v('pb-zip'), city: v('pb-city'), address: v('pb-address'), email: v('pb-email') },
        consents: { terms: document.getElementById('pb-terms').checked, immediate: document.getElementById('pb-immediate').checked }
    });
}
function transferHtml(o) {
    const S = PS();
    const copy = (t) => `<button onclick="navigator.clipboard && navigator.clipboard.writeText('${pEsc(t)}');this.textContent='MÁSOLVA'">MÁSOL</button>`;
    return `<div class="sg-xfer">
            Összeg: <b>${S.fmtHuf(o.huf)}</b> ${copy(String(o.huf))}<br>
            Közlemény: <b>${pEsc(o.code)}</b> ${copy(o.code)}<br>
            Kedvezményezett: <b>${pEsc(o.payee || '–')}</b><br>
            Számlaszám: <b>${pEsc(o.account || '–')}</b> ${o.account ? copy(o.account) : ''}<br>
            ${o.bank ? `Bank: ${pEsc(o.bank)}<br>` : ''}
        </div>
        <div class="box" style="margin-top:8px;padding:8px;border-left:4px solid #e8c35a;background:rgba(0,0,0,.3);color:var(--sg-thread);font:600 12px/1.45 var(--sg-font)">
            ⚠️ A <b>közleménybe pontosan ezt írd: ${pEsc(o.code)}</b> – ebből tudjuk, kié az utalás.<br>
            Ha megérkezett, jóváírjuk a(z) ◆ ${o.credits} creditet, és értesítést kapsz. A rendelés ${o.expiresDays} napig érvényes.
        </div>
        <button class="sg-prem-btn" style="margin-top:10px" onclick="premiumLastOrder=null;closePremiumPop();premiumTab='mine';renderPremium()">RENDBEN – RENDELÉSEIM</button>`;
}

// ---------- láda nyitás ----------
function showCrateReveal(rev, message) {
    const S = PS();
    const box = document.getElementById('crate-reveal');
    const spin = document.getElementById('crate-spin'), res = document.getElementById('crate-result'), ok = document.getElementById('crate-ok');
    box.classList.remove('hidden'); ok.classList.add('hidden'); res.textContent = '';
    const crate = S.CRATES.find(c => c.key === rev.crate) || S.CRATES[0];
    const ci = document.getElementById('crate-img');
    if (ci) { ci.src = pImg(crate.img); ci.className = 'sg-crate-shake'; ci.style.setProperty('--tc', crate.color); }
    const names = S.COSMETICS.filter(c => !c.event);
    let i = 0, delay = 60;
    const step = () => {
        const c = names[i++ % names.length];
        spin.textContent = c.name; spin.style.color = rarityOf(c).color;
        delay *= 1.12;
        if (delay < 420) setTimeout(step, delay);
        else {
            const d = S.BY_KEY[rev.key], r = rarityOf(d);
            spin.textContent = d.name; spin.style.color = r.color;
            spin.style.textShadow = `0 0 18px ${r.color}`;
            if (ci) ci.className = 'sg-crate-open';
            res.innerHTML = `${r.name.toUpperCase()}<br>${rev.refund ? `Ez már megvolt – helyette ◆ ${rev.refund} credit` : 'Új kinézet! A Gyűjteményben felveheted.'}`;
            ok.classList.remove('hidden');
            if (typeof playSound === 'function') playSound('win');
        }
    };
    step();
    void message;
}
function closeCrateReveal() { document.getElementById('crate-reveal').classList.add('hidden'); document.getElementById('crate-spin').style.textShadow = ''; renderPremium(); }
