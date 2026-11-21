// daily.js
// NAPI BÓNUSZ (v0.1.11): 7 napos sor. Minden nap egyszer vehető át (magyar idő szerint éjfélkor indul az új nap).
// Ha egy nap kimarad, a sor elölről kezdődik; a 7. nap után újra az 1. jön. Közös a kliensnek és a szervernek.
(function (root) {
    const REWARDS = [
        { day: 1, items: [{ key: 'water_bottle', count: 1 }], xp: 20 },
        { day: 2, items: [{ key: 'canned_food', count: 2 }], xp: 20 },
        { day: 3, items: [{ key: 'bandage', count: 2 }], xp: 30 },
        { day: 4, items: [{ key: 'matchbox', count: 1 }, { key: 'rag', count: 3 }], xp: 30 },
        { day: 5, items: [{ key: 'mineral_water', count: 2 }, { key: 'energy_bar', count: 2 }], xp: 40 },
        { day: 6, items: [{ key: 'compression_bandage', count: 1 }, { key: 'aa_batteries', count: 2 }], xp: 40 },
        { day: 7, items: [{ key: 'duct_tape', count: 1 }, { key: 'canned_food', count: 3 }], xp: 100, money: 150 }
    ];
    const TIME_ZONE = 'Europe/Budapest';

    // 'ÉÉÉÉ-HH-NN' a magyar naptár szerint
    function dayKey(ms) {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    }
    function prevDayKey(key) {
        const [y, m, d] = key.split('-').map(Number);
        const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
        return t.toISOString().slice(0, 10);
    }
    // Ma átvehető-e, és hányadik nap jönne
    function status(daily, now) {
        const today = dayKey(now);
        const last = daily && daily.lastDay;
        const streak = (daily && daily.streak) || 0;
        if (last === today) return { available: false, today, day: streak, claimedToday: true };
        const continues = last && prevDayKey(today) === last && streak < REWARDS.length;
        return { available: true, today, day: continues ? streak + 1 : 1, claimedToday: false };
    }

    const api = { REWARDS, TIME_ZONE, dayKey, prevDayKey, status };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SurvivalDaily = api;
})(this);
