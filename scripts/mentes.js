// scripts/mentes.js
// ÉJSZAKAI ADATBÁZIS-MENTÉS (v0.1.12): minden gyűjteményt egy tömörített JSON fájlba ír.
// A szerveren a cron futtatja (lásd a telepítési lépéseket); a MONGO_URI-t a /etc/survival-go.env-ből kapja.
// Visszaállításhoz: node scripts/mentes.js --visszaallit /var/backups/survival-go/sg-ÉÉÉÉ-HH-NN.json.gz
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const DIR = process.env.BACKUP_DIR || '/var/backups/survival-go';
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 14;

async function backup() {
    fs.mkdirSync(DIR, { recursive: true });
    const db = mongoose.connection.db;
    const out = {};
    for (const c of await db.listCollections().toArray()) {
        out[c.name] = await db.collection(c.name).find({}).toArray();
    }
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(DIR, `sg-${day}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out)));
    fs.chmodSync(file, 0o600);
    const counts = Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(', ');
    console.log(`Mentés kész: ${file} (${counts})`);
    // régi mentések törlése
    const limit = Date.now() - KEEP_DAYS * 86400000;
    for (const f of fs.readdirSync(DIR)) {
        const full = path.join(DIR, f);
        if (/^sg-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f) && fs.statSync(full).mtimeMs < limit) fs.unlinkSync(full);
    }
}

async function restore(file) {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
    const db = mongoose.connection.db;
    const { ObjectId } = mongoose.Types;
    for (const [name, docs] of Object.entries(data)) {
        // az _id-ket visszaalakítjuk ObjectId-vé, ahol annak tűnnek
        docs.forEach(d => { if (typeof d._id === 'string' && /^[0-9a-f]{24}$/.test(d._id)) d._id = new ObjectId(d._id); });
        await db.collection(name).deleteMany({});
        if (docs.length) await db.collection(name).insertMany(docs);
        console.log(`Visszaállítva: ${name} (${docs.length})`);
    }
}

(async () => {
    if (!process.env.MONGO_URI) { console.error('Hiányzik a MONGO_URI.'); process.exit(1); }
    await mongoose.connect(process.env.MONGO_URI);
    const i = process.argv.indexOf('--visszaallit');
    if (i > 0) await restore(process.argv[i + 1]); else await backup();
    await mongoose.disconnect();
})().catch(err => { console.error('Mentési hiba:', err); process.exit(1); });
