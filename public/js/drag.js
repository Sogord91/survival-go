// Tárgyak húzása egérrel és ujjal (Készlet, később a menedék raktára is).
// Ujjal: rövid nyomva tartás (0,25 mp) után indul, így a sima csúsztatás továbbra is görget.
// Telefonon az érintés-eseményeket használjuk: a böngésző a görgetés megkezdésekor
// megszakítja a "pointer" eseményeket (pointercancel), az érintés-eseményeknél viszont
// a preventDefault() megtartja az ujjat a húzásnak.
(function (root) {
    const HOLD_MS = 250, MOVE_SLOP = 10;
    const configs = [];
    const st = { pending: null, active: null, ghost: null, justDropped: false, hot: null, lastY: undefined };

    function bind(cfg) { configs.push(cfg); }

    function findTile(target) {
        if (!target || !target.closest) return null;
        for (const cfg of configs) {
            const tile = target.closest(cfg.tiles);
            if (tile && !tile.disabled && (!cfg.canDrag || cfg.canDrag(tile))) return { tile, cfg };
        }
        return null;
    }

    function start() {
        const p = st.pending;
        if (!p) return;
        clearTimeout(p.timer);
        st.pending = null;
        st.active = p;
        const img = p.tile.querySelector('img, .tile-emoji');
        const ghost = document.createElement('div');
        ghost.className = 'sg-drag-ghost';
        ghost.innerHTML = img ? img.outerHTML : '📦';
        document.body.appendChild(ghost);
        st.ghost = ghost;
        p.tile.classList.add('sg-dragging');
        document.documentElement.classList.add('sg-drag-on');
        move(p.x, p.y);
        autoScroll();
        if (!p.mouse && navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { } }
    }

    function zoneAt(x, y, a) {
        const el = document.elementFromPoint(x, y);
        const zone = el && el.closest ? el.closest(a.cfg.zones) : null;
        if (!zone || zone === a.tile) return null;
        return zone;
    }

    function move(x, y) {
        if (!st.ghost) return;
        st.lastY = y;
        st.ghost.style.transform = `translate(${x - 28}px, ${y - 28}px)`;
        const zone = zoneAt(x, y, st.active);
        if (st.hot && st.hot !== zone) st.hot.classList.remove('sg-drop-hot');
        if (zone) zone.classList.add('sg-drop-hot');
        st.hot = zone;
    }

    // A húzott tárgy a görgethető lista szélénél görgeti a listát
    function autoScroll() {
        const a = st.active;
        if (!a) return;
        const boxes = a.cfg.scrollers ? a.cfg.scrollers() : [];
        const y = st.lastY;
        boxes.forEach(box => {
            if (!box || y === undefined) return;
            const r = box.getBoundingClientRect();
            if (y < r.top + 40 && y > r.top - 60) box.scrollTop -= 8;
            else if (y > r.bottom - 40 && y < r.bottom + 60) box.scrollTop += 8;
        });
        requestAnimationFrame(autoScroll);
    }

    function end(x, y, cancelled) {
        if (st.pending) { clearTimeout(st.pending.timer); st.pending = null; }
        const a = st.active;
        if (!a) return;
        st.active = null;
        if (st.ghost) st.ghost.remove();
        st.ghost = null;
        if (st.hot) st.hot.classList.remove('sg-drop-hot');
        st.hot = null;
        a.tile.classList.remove('sg-dragging');
        document.documentElement.classList.remove('sg-drag-on');
        // a húzás végét követő "click" ne nyissa meg a tárgy lapját
        st.justDropped = true;
        setTimeout(() => { st.justDropped = false; }, 400);
        if (cancelled) return;
        const zone = zoneAt(x, y, a);
        if (zone) a.cfg.onDrop(a.tile, zone);
    }

    function begin(target, x, y, mouse) {
        const found = findTile(target);
        if (!found) return false;
        const p = { tile: found.tile, cfg: found.cfg, x, y, sx: x, sy: y, mouse };
        if (!mouse) p.timer = setTimeout(start, HOLD_MS);
        st.pending = p;
        return true;
    }

    function pendingMove(x, y) {
        const p = st.pending;
        if (!p) return;
        p.x = x; p.y = y;
        const moved = Math.hypot(x - p.sx, y - p.sy);
        if (p.mouse && moved > 6) start();
        else if (!p.mouse && moved > MOVE_SLOP) { clearTimeout(p.timer); st.pending = null; } // görgetni akar
    }

    // --- egér (és toll): pointer események ---
    document.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        begin(e.target, e.clientX, e.clientY, true);
    });
    document.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        pendingMove(e.clientX, e.clientY);
        if (st.active && st.active.mouse) move(e.clientX, e.clientY);
    });
    document.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'touch') return;
        if (st.pending && st.pending.mouse) { st.pending = null; return; }
        if (st.active && st.active.mouse) end(e.clientX, e.clientY, false);
    });

    // --- ujj: érintés események ---
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { if (st.active) end(0, 0, true); else if (st.pending) { clearTimeout(st.pending.timer); st.pending = null; } return; }
        const t = e.touches[0];
        begin(e.target, t.clientX, t.clientY, false);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (!t) return;
        if (st.active && !st.active.mouse) {
            if (e.cancelable) e.preventDefault(); // húzás közben ne görgessen
            move(t.clientX, t.clientY);
            return;
        }
        pendingMove(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        if (st.pending && !st.pending.mouse) { clearTimeout(st.pending.timer); st.pending = null; return; }
        if (st.active && !st.active.mouse) {
            if (e.cancelable) e.preventDefault();
            end(t ? t.clientX : 0, t ? t.clientY : 0, false);
        }
    }, { passive: false });
    document.addEventListener('touchcancel', () => {
        if (st.pending) { clearTimeout(st.pending.timer); st.pending = null; }
        if (st.active) end(0, 0, true);
    });
    // nyomva tartásra a telefon ne nyisson helyi menüt / kijelölést
    document.addEventListener('contextmenu', (e) => { if (st.active || st.pending || findTile(e.target)) e.preventDefault(); });
    // a húzás utáni kattintás elnyelése
    document.addEventListener('click', (e) => {
        if (st.justDropped && findTile(e.target)) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    const api = { bind, isDragging: () => !!st.active, justDropped: () => st.justDropped };
    root.SurvivalDrag = api;
})(typeof window !== 'undefined' ? window : globalThis);
