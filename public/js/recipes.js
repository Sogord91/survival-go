// recipes.js
const craftingRecipes = [
    { key: 'bandage', name: 'Rongy kötszer', desc: 'Gyors vérzéscsillapító', icon: '🩹', req: { rag: 2 } },
    { key: 'mre_ration', name: 'MRE Csomag', desc: 'Katonai fejadag', icon: '📦', req: { canned_food: 2, water_bottle: 1 } },
    { key: 'ammo_9mm', name: '9mm Lőszer', desc: 'Pisztoly lőszer', icon: 'bullet', req: { scrap_metal: 2, gunpowder: 1 } },
    { key: 'ammo_762', name: '7.62 Lőszer', desc: 'Puska lőszer', icon: 'bullet', req: { scrap_metal: 3, gunpowder: 2 } },
    { key: 'kevlar_vest', name: 'Kevlár Mellény', desc: 'Védelmet nyújt', icon: '🦺', req: { scrap_metal: 5, duct_tape: 2 } },
    { key: 'lockpick', name: 'Álkulcs', desc: 'Zárak feltöréséhez', icon: '🔑', req: { scrap_metal: 1, wire: 1 } }
    // <-- Bármilyen új receptet ide írsz be a jövőben, és kész is!
];

// Böngésző támogatás (ha még nem létezett, rátesszük a window-ra)
if (typeof window !== 'undefined') {
    if (!window.craftingRecipes) {
        window.craftingRecipes = craftingRecipes;
    }
}

// Szerver (Node.js) támogatás
if (typeof module !== 'undefined' && module.exports) {
    module.exports = craftingRecipes;
}