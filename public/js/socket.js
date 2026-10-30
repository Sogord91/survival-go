// socket.js
// A socket létrehozása és a belépési token tárolása.
// EZ A FÁJL TÖLTŐDIK BE ELSŐKÉNT (a socket.io kliens után), hogy a többi modul már a betöltéskor
// regisztrálhassa az eseménykezelőit. A kapcsolat csak bejelentkezés után épül fel (autoConnect: false).

const AUTH_TOKEN_KEY = 'survival_go_token';
let memoryToken = ''; // tartalék, ha a böngésző tárolója nem elérhető (pl. privát mód)

function getAuthToken() {
    if (memoryToken) return memoryToken;
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { return ''; }
}

function setAuthToken(token) {
    memoryToken = token || '';
    try { localStorage.setItem(AUTH_TOKEN_KEY, memoryToken); } catch (e) { /* a token csak az oldal élettartamára marad meg */ }
}

function clearAuthToken() {
    memoryToken = '';
    try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) { /* nincs teendő */ }
}

// Minden (újra)csatlakozáskor a legfrissebb tokent küldi el.
const socket = io({
    autoConnect: false,
    auth: (cb) => cb({ token: getAuthToken() })
});

function connectSocket() {
    if (!socket.connected) socket.connect();
}

function disconnectSocket() {
    socket.disconnect();
}

// Hitelesítési hiba (hiányzó, lejárt vagy érvénytelen token): vissza a belépő képernyőre.
// Hálózati hibánál a socket magától újracsatlakozik, ahhoz nem nyúlunk.
socket.on('connect_error', (err) => {
    const reason = err && err.message;
    if (reason === 'AUTH_REQUIRED' || reason === 'AUTH_INVALID' || reason === 'AUTH_EXPIRED') {
        clearAuthToken();
        showAuthScreen(reason === 'AUTH_EXPIRED'
            ? 'A munkamenet lejárt, jelentkezz be újra.'
            : 'Érvénytelen munkamenet, jelentkezz be újra.');
    }
});

// Ugyanezzel a fiókkal máshol is beléptek: a szerver ezt a kapcsolatot lebontotta.
socket.on('session_replaced', () => {
    showAuthScreen('Ezzel a fiókkal máshol is beléptek, ez a munkamenet megszűnt. Frissítsd az oldalt, ha itt szeretnél folytatni.');
});
