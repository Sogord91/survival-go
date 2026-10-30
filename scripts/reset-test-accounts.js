// scripts/reset-test-accounts.js
// EGYSZERI tisztítás: TÖRLI AZ ÖSSZES FIÓKOT az adatbázisból (a régi tesztfiókok a régi formátumot használják).
// Futtatás (a projekt mappájából, ugyanazzal a MONGO_URI-val, amit a szerver használ):
//   MONGO_URI="mongodb+srv://..." node scripts/reset-test-accounts.js --yes
// A --yes nélkül csak kiírja, hány fiók van, és nem töröl semmit.
const mongoose = require('mongoose');
const config = require('../config');

(async () => {
    await mongoose.connect(config.MONGO_URI, {});
    const users = mongoose.connection.collection('survivalusers');
    const count = await users.countDocuments();
    console.log(`Adatbázis: ${mongoose.connection.name} | fiókok száma: ${count}`);

    if (!process.argv.includes('--yes')) {
        console.log('Nem töröltem semmit. A törléshez futtasd újra a --yes kapcsolóval.');
    } else {
        const result = await users.deleteMany({});
        console.log(`Törölve: ${result.deletedCount} fiók.`);
    }
    await mongoose.disconnect();
})().catch(err => {
    console.error('Hiba:', err);
    process.exit(1);
});
