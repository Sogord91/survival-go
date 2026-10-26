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

async function handleAuthSubmit() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const msg = document.getElementById('auth-message');

    if (!username || !password || (isRegisterMode && !email)) {
        msg.textContent = 'Kérlek tölts ki minden mezőt!';
        return;
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
            msg.textContent = data.message || 'Hiba történt!';
            return;
        }

        if (isRegisterMode) {
            // Siker regisztráció után átváltunk sima bejelentkezésre
            msg.className = 'mb-4 text-sm text-center text-emerald-400';
            msg.textContent = 'Sikeres regisztráció! Most már bejelentkezhetsz.';
            toggleAuthMode();
        } else {
            // Sikeres bejelentkezés!
            msg.className = 'mb-4 text-sm text-center text-emerald-400';
            msg.textContent = 'Sikeres belépés! Játék betöltése...';

            // Betöltjük a játékos adatait a globális 'player' változóba
            window.player = data.player;
            window.player.username = data.username;
            window.player.avatar = data.avatar;
            
            // Frissítjük a nevet a HUD-ban a valós regisztrációs névre!
            const hudName = document.getElementById('hud-name');
            if (hudName) {
                hudName.textContent = data.username || data.player.username;
            }

            // ---> ITT FRISSÍTJÜK A HUD-OT ÉS A TÖBBI UI ELEMET IS! <---
            if (typeof updateUI === 'function') {
                updateUI();
            }

            // Ha vannak mentett épületek, átadjuk a map.js-nek
            if (data.buildings && typeof savedBuildings !== 'undefined') {
                savedBuildings = data.buildings;
            }

            // Eltüntetjük a modális ablakot
            setTimeout(() => {
                document.getElementById('auth-modal').classList.add('hidden');
                // Ha van térkép inicializáló függvényünk, itt indíthatjuk el
                if (typeof initMapAndGame === 'function') {
                    initMapAndGame();
                }
            }, 1000);
        }
    } catch (err) {
        console.error("Hiba a hálózati kérés során:", err);
        msg.textContent = 'Szerverhiba vagy hálózati hiba.';
    }
}