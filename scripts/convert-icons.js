// scripts/convert-icons.js
// Az ikoncsomagok képeit alakítja át a játék számára (128x128 WebP, átlátszó háttér, középre igazítva).
// Csak azokat a képeket dolgozza fel, amelyek a scripts/icons-needed.json listában szerepelnek,
// és a public/images/items/ mappába menti őket "<img>.webp" néven (ezt a nevet használja az items.js).
//
// Használat (a projekt mappájában):
//   npm install --no-save sharp                       (egyszer; a package.json-hoz nem nyúl)
//   node scripts/convert-icons.js "D:\Ikonok\Survival pack"
//   node scripts/convert-icons.js "D:\Ikonok\Weapons pack"
//
// Kapcsolók:
//   --force      a már meglévő .webp fájlokat is újra elkészíti
//   --size 128   a kimeneti méret pixelben (alapértelmezés: 128)
//
// A forrásmappát az almappáival együtt végignézi. Ha egy kép több méretben is megvan (256/512/1024 mappák),
// a 256-os változatot használja (gyorsabb, és 128 px-hez bőven elég).

const fs = require('fs');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('Hiányzik a "sharp" csomag. Telepítsd így (a projekt mappájában):');
    console.error('  npm install --no-save sharp');
    process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const LIST_FILE = path.join(__dirname, 'icons-needed.json');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'items');

function parseArgs(argv) {
    const opts = { source: null, force: false, size: 128 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--force') opts.force = true;
        else if (a === '--size') opts.size = parseInt(argv[++i], 10);
        else if (!opts.source) opts.source = a;
    }
    if (!Number.isFinite(opts.size) || opts.size < 16 || opts.size > 1024) opts.size = 128;
    return opts;
}

// Az összes .png fájl a mappában és az almappáiban: fájlnév (kisbetűsen) -> elérési utak
function indexPngs(dir, index = new Map()) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) indexPngs(full, index);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
            const key = entry.name.toLowerCase();
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(full);
        }
    }
    return index;
}

// Több méret közül a 256-os mappában lévőt választja, ha nincs, akkor az első találatot
function pickSource(paths) {
    const by = (size) => paths.find(p => p.split(path.sep).some(part => part.includes(String(size))));
    return by(256) || by(512) || paths[0];
}

async function convert(src, dest, size) {
    const inner = Math.round(size * 0.9); // kis szegély, hogy az ikonok ne érjenek a cella széléig
    let img = sharp(src).ensureAlpha();
    try {
        // az átlátszó (vagy egyszínű) szegély levágása, hogy minden ikon hasonló méretben látsszon
        const trimmed = await img.clone().trim({ threshold: 10 }).png().toBuffer();
        img = sharp(trimmed);
    } catch (e) {
        // ha nincs mit levágni, marad az eredeti
    }
    await img
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({
            top: Math.floor((size - inner) / 2), bottom: Math.ceil((size - inner) / 2),
            left: Math.floor((size - inner) / 2), right: Math.ceil((size - inner) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 85, alphaQuality: 90 })
        .toFile(dest);
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.source || !fs.existsSync(opts.source) || !fs.statSync(opts.source).isDirectory()) {
        console.error('Add meg az ikoncsomag (kicsomagolt) mappáját, pl.:');
        console.error('  node scripts/convert-icons.js "D:\\Ikonok\\Survival pack"');
        process.exit(1);
    }

    const needed = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
    fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log('Képek keresése: ' + opts.source);
    const index = indexPngs(opts.source);
    console.log(index.size + ' png fájl található a mappában.');

    let done = 0, skipped = 0, failed = 0;
    const notHere = [];

    for (const entry of needed) {
        const dest = path.join(OUT_DIR, entry.img + '.webp');
        const found = index.get(String(entry.file).toLowerCase());
        if (!found) { notHere.push(entry); continue; }
        if (!opts.force && fs.existsSync(dest)) { skipped++; continue; }
        try {
            await convert(pickSource(found), dest, opts.size);
            done++;
        } catch (e) {
            failed++;
            console.error('HIBA: ' + entry.file + ' -> ' + e.message);
        }
    }

    console.log('');
    console.log('Elkészült: ' + done + ' ikon');
    if (skipped) console.log('Már megvolt (kihagyva): ' + skipped + '  (újrakészítés: --force)');
    if (failed) console.log('Hibás: ' + failed);
    if (notHere.length) {
        console.log('Ebben a mappában nincs meg: ' + notHere.length + ' ikon (lehet, hogy a másik csomagban van).');
        const missingAll = notHere.filter(e => !fs.existsSync(path.join(OUT_DIR, e.img + '.webp')));
        if (missingAll.length) {
            console.log('Még egyáltalán nincs kész: ' + missingAll.length + ' ikon, pl.:');
            missingAll.slice(0, 10).forEach(e => console.log('  - ' + e.file));
        }
    }
    console.log('Kimenet: ' + OUT_DIR);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
