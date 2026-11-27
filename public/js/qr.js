// qr.js – saját, függőség nélküli QR-kód készítő (v0.1.24, QR-matricákhoz).
// Bájt mód, "M" hibajavítási szint (kb. 15% sérülést kibír), 1–10. verzió (max. 213 bájt), automatikus maszkválasztás.
// SurvivalQR.matrix(text) -> négyzetes tömb (true = sötét modul); SurvivalQR.svg(text, opts) -> SVG szöveg.
(function (root) {
    'use strict';
    // [ec kódszó / blokk, 1. csoport blokkjai, adat / blokk, 2. csoport blokkjai, adat / blokk] – M szint
    const EC_M = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
        [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
    const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

    // GF(256) a 0x11D polinommal
    const EXP = new Array(512), LOG = new Array(256);
    (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
    const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
    function rsGenerator(n) {
        let g = [1];
        for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); } g = next; }
        return g;
    }
    function rsRemainder(data, n) {
        const gen = rsGenerator(n), res = data.concat(new Array(n).fill(0));
        for (let i = 0; i < data.length; i++) { const c = res[i]; if (c !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], c); }
        return res.slice(data.length);
    }
    function utf8(str) { return Array.from(unescape(encodeURIComponent(String(str)))).map(c => c.charCodeAt(0)); }

    function dataCapacity(v) { const e = EC_M[v]; return e[1] * e[2] + e[3] * e[4]; }
    function pickVersion(len) {
        for (let v = 1; v <= 10; v++) { const bits = 4 + (v < 10 ? 8 : 16) + len * 8; if (bits <= dataCapacity(v) * 8) return v; }
        throw new Error('A QR-kód szövege túl hosszú.');
    }
    function codewords(bytes, v) {
        const cap = dataCapacity(v), bits = [];
        const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
        put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
        put(0, Math.min(4, cap * 8 - bits.length));
        while (bits.length % 8) bits.push(0);
        const data = [];
        for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
        for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xEC);
        // blokkokra bontás, hibajavító kódok, összefésülés
        const [ecn, b1, d1, b2, d2] = EC_M[v], blocks = [];
        let k = 0;
        for (let i = 0; i < b1; i++) { blocks.push(data.slice(k, k + d1)); k += d1; }
        for (let i = 0; i < b2; i++) { blocks.push(data.slice(k, k + d2)); k += d2; }
        const ecs = blocks.map(b => rsRemainder(b, ecn)), out = [];
        for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
        for (let i = 0; i < ecn; i++) ecs.forEach(e => out.push(e[i]));
        return out;
    }

    function bch(value, poly, polyBits) { let v = value << (polyBits - 1); const top = (x) => 31 - Math.clz32(x); while (v && top(v) >= polyBits - 1) v ^= poly << (top(v) - (polyBits - 1)); return v; }
    const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
        (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];

    function build(v, cw, mask) {
        const n = 17 + 4 * v, m = [], fn = [];
        for (let i = 0; i < n; i++) { m.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)); }
        const set = (r, c, d) => { m[r][c] = d; fn[r][c] = true; };
        // keresőminták + elválasztók
        [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r0, c0]) => {
            for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
                const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
                const d = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
                set(rr, cc, d);
            }
        });
        // igazító minták
        const al = ALIGN[v];
        al.forEach(r => al.forEach(c => {
            if (fn[r][c]) return;
            for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }));
        // időzítő vonalak
        for (let i = 8; i < n - 8; i++) { if (!fn[6][i]) set(6, i, i % 2 === 0); if (!fn[i][6]) set(i, 6, i % 2 === 0); }
        set(n - 8, 8, true); // sötét modul
        // formátum (M = 00) és verzió információ
        const fmt = (((0 << 3) | mask) << 10 | bch((0 << 3) | mask, 0x537, 11)) ^ 0x5412;
        const fb = (i) => ((fmt >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) set(i, 8, fb(i));
        set(7, 8, fb(6)); set(8, 8, fb(7)); set(8, 7, fb(8));
        for (let i = 9; i < 15; i++) set(8, 14 - i, fb(i));
        for (let i = 0; i < 8; i++) set(8, n - 1 - i, fb(i));
        for (let i = 8; i < 15; i++) set(n - 15 + i, 8, fb(i));
        if (v >= 7) {
            const ver = (v << 12) | bch(v, 0x1F25, 13);
            for (let i = 0; i < 18; i++) { const d = ((ver >>> i) & 1) === 1, a = n - 11 + (i % 3), b = Math.floor(i / 3); set(b, a, d); set(a, b, d); }
        }
        // adatbitek cikcakkban, maszkkal
        const bits = []; cw.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1); });
        let k = 0, up = true;
        for (let col = n - 1; col > 0; col -= 2) {
            if (col === 6) col = 5;
            for (let i = 0; i < n; i++) {
                const r = up ? n - 1 - i : i;
                for (let j = 0; j < 2; j++) {
                    const c = col - j; if (fn[r][c]) continue;
                    let d = k < bits.length ? bits[k] === 1 : false; k++;
                    if (MASKS[mask](r, c)) d = !d;
                    m[r][c] = d;
                }
            }
            up = !up;
        }
        return m;
    }
    function penalty(m) {
        const n = m.length; let p = 0;
        const line = (get) => {
            for (let i = 0; i < n; i++) {
                let run = 1;
                for (let j = 1; j < n; j++) { if (get(i, j) === get(i, j - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
                for (let j = 0; j + 10 < n; j++) {
                    const s = []; for (let q = 0; q < 11; q++) s.push(get(i, j + q) ? 1 : 0); const t = s.join('');
                    if (t === '10111010000' || t === '00001011101') p += 40;
                }
            }
        };
        line((i, j) => m[i][j]); line((i, j) => m[j][i]);
        for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const d = m[r][c]; if (d === m[r][c + 1] && d === m[r + 1][c] && d === m[r + 1][c + 1]) p += 3; }
        let dark = 0; m.forEach(row => row.forEach(x => { if (x) dark++; }));
        p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
        return p;
    }
    function matrix(text) {
        const bytes = utf8(text), v = pickVersion(bytes.length), cw = codewords(bytes, v);
        let best = null, bp = Infinity;
        for (let mask = 0; mask < 8; mask++) { const m = build(v, cw, mask), p = penalty(m); if (p < bp) { bp = p; best = m; } }
        return best;
    }
    function svg(text, opts) {
        const o = opts || {}, m = matrix(text), n = m.length, q = o.quiet === undefined ? 4 : o.quiet, size = n + q * 2;
        let d = '';
        m.forEach((row, r) => row.forEach((x, c) => { if (x) d += `M${c + q} ${r + q}h1v1h-1z`; }));
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"${o.size ? ` width="${o.size}" height="${o.size}"` : ''}><rect width="${size}" height="${size}" fill="${o.bg || '#fff'}"/><path d="${d}" fill="${o.fg || '#000'}"/></svg>`;
    }

    const api = { matrix, svg };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SurvivalQR = api;
})(typeof window !== 'undefined' ? window : globalThis);
