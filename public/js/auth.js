let isRegisterMode = false;
let selectedAvatar = 'avatar1.png'; // Alapértelmezett

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('auth-title');
    const emailGroup = document.getElementById('email-group');
    const avatarGroup = document.getElementById('avatar-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchBtn = document.getElementById('auth-switch-btn');
    const msg = document.getElementById('auth-message');

    msg.textContent = '';

    if (isRegisterMode) {
        title.textContent = 'Új Túlélő Regisztráció';
        emailGroup.classList.remove('hidden');
        avatarGroup.classList.remove('hidden');
        submitBtn.textContent = 'Regisztráció';
        switchBtn.textContent = 'Már van fiókod? Bejelentkezés';
    } else {
        title.textContent = 'Túlélő Bejelentkezés';
        emailGroup.classList.add('hidden');
        avatarGroup.classList.add('hidden');
        submitBtn.textContent = 'Belépés';
        switchBtn.textContent = 'Még nincs fiókod? Regisztráció';
    }
}

function selectAvatar(avatarName, imgElement) {
    selectedAvatar = avatarName;
    // Leszedjük a keretet az összesről, majd rárakjuk a kiválasztultra
    document.querySelectorAll('.avatar-option').forEach(img => {
        img.classList.remove('border-amber-400', 'scale-110');
    });
    imgElement.classList.add('border-amber-400', 'scale-110');
}

// Üzenet a belépő ablakban (ok = true: zöld siker-üzenet, különben piros hiba)
function setAuthMessage(text, ok) {
    const msg = document.getElementById('auth-message');
    if (!msg) return;
    msg.className = ok
        ? 'mb-4 text-sm text-center text-emerald-400'
        : 'mb-4 text-xs text-center text-red-400 font-bold';
    msg.textContent = text;
}

// A belépő képernyő újra megjelenítése (lejárt vagy kidobott munkamenet után)
function showAuthScreen(message) {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
    setAuthMessage(message || '', false);
}

// A játék indítása a szerver által küldött adatokkal. Ide fut a kézi belépés és az automatikus belépés is.
function enterGame(data) {
    if (data.token) setAuthToken(data.token);

    Object.assign(player, data.player);
    player.username = data.username;
    player.avatar = data.avatar;
    player.earlySurvivor = !!data.earlySurvivor; // "Korai túlélő" jelvény

    // Az épületeket a térkép tölti be az OSM-ből, a zárakat (globális, mindenkire érvényes)
    // a szervertől kérdezi le a betöltött épületekre (building_status)
    buildingLocks = {};

    // A teljes játék HUD feloldása és a belépő ablak elrejtése
    const hudContainer = document.getElementById('game-hud-container');
    if (hudContainer) hudContainer.classList.remove('hud-hidden');

    const hudName = document.getElementById('hud-name');
    if (hudName) hudName.textContent = data.username;

    document.getElementById('auth-modal').classList.add('hidden');

    updateUI();
    if (typeof refreshMapMarkers === 'function') refreshMapMarkers(); // ha a térkép már él (újrabelépés)

    // A szerver kapcsolat csak most épül fel, a mentett tokennel
    connectSocket();

    // GPS alapú térkép és játék indítása
    initMapAndGame();
}

async function handleAuthSubmit() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const email = document.getElementById('auth-email').value.trim();

    if (!username || !password || (isRegisterMode && !email)) {
        setAuthMessage('Kérlek tölts ki minden mezőt!', false);
        return;
    }

    // Regisztrációnál előre jelezzük a szabályokat (a szerver ugyanezt ellenőrzi)
    if (isRegisterMode) {
        if (!/^[\p{L}\p{N}]{3,16}$/u.test(username)) {
            setAuthMessage('A felhasználónév 3-16 karakter lehet, csak betűkből és számokból.', false);
            return;
        }
        if (password.length < 4) {
            setAuthMessage('A jelszó legalább 4 karakter legyen.', false);
            return;
        }
    }

    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    const payload = isRegisterMode
        ? { username, email, password, avatar: selectedAvatar }
        : { username, password };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.success) {
            setAuthMessage(data.message || 'Hiba történt!', false);
            return;
        }

        if (isRegisterMode) {
            // Siker regisztráció után átváltunk sima bejelentkezésre
            toggleAuthMode(); // ez törli az üzenetet, ezért utána írjuk ki a sikert
            setAuthMessage('Sikeres regisztráció! Most már bejelentkezhetsz.', true);
        } else {
            // Sikeres bejelentkezés!
            setAuthMessage('Sikeres belépés! Játék betöltése...', true);
            if (data.token) setAuthToken(data.token);

            setTimeout(() => enterGame(data), 1000);
        }
    } catch (err) {
        console.error("Hiba a hálózati kérés során:", err);
        setAuthMessage('Szerverhiba vagy hálózati hiba.', false);
    }
}

// Automatikus belépés oldalfrissítés után a mentett tokennel
async function tryAutoLogin() {
    const token = getAuthToken();
    if (!token) return;

    setAuthMessage('Munkamenet visszaállítása...', true);
    try {
        const response = await fetch('/api/session', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (response.status === 401) {
            // lejárt vagy érvénytelen token: marad a belépő ablak
            clearAuthToken();
            setAuthMessage('', false);
            return;
        }

        const data = await response.json();
        if (data && data.success) {
            enterGame(data);
        } else {
            setAuthMessage((data && data.message) || '', false);
        }
    } catch (err) {
        // hálózati hiba: a token megmarad, a következő frissítés újra megpróbálja
        console.error("Hiba a munkamenet visszaállításakor:", err);
        setAuthMessage('Nem sikerült visszaállítani a munkamenetet, jelentkezz be.', false);
    }
}

function logout() {
    clearAuthToken();
    disconnectSocket();
    location.reload();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoLogin);
} else {
    tryAutoLogin();
}
