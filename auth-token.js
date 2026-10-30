// auth-token.js
// Függőség nélküli, HS256 aláírású, JWT formátumú belépési token (a Node beépített crypto moduljával).
// A formátum szabványos JWT, így később bármikor lecserélhető a "jsonwebtoken" csomagra.
const crypto = require('crypto');

function fail(code) {
    const err = new Error(code);
    err.code = code;
    return err;
}

function encode(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function hmac(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest();
}

// Aláírt token készítése. A payload-ba kerül az iat (kiadás) és exp (lejárat) is.
function sign(payload, secret, expiresInSeconds) {
    if (!secret) throw new Error('Hiányzik a token aláíró kulcs!');
    const now = Math.floor(Date.now() / 1000);
    const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ ...payload, iat: now, exp: now + expiresInSeconds })}`;
    return `${data}.${hmac(data, secret).toString('base64url')}`;
}

// Token ellenőrzése. Siker esetén a payload-ot adja vissza, hiba esetén a .code mezővel dob:
// TOKEN_MALFORMED (hibás formátum), TOKEN_INVALID (rossz aláírás / algoritmus), TOKEN_EXPIRED (lejárt).
function verify(token, secret) {
    if (!secret) throw new Error('Hiányzik a token aláíró kulcs!');
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) throw fail('TOKEN_MALFORMED');

    const parts = token.split('.');
    if (parts.length !== 3) throw fail('TOKEN_MALFORMED');
    const [headerPart, payloadPart, signaturePart] = parts;

    let header;
    let payload;
    try {
        header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
        payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    } catch (e) {
        throw fail('TOKEN_MALFORMED');
    }
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') throw fail('TOKEN_MALFORMED');

    // Csak a HS256 fogadható el (az "alg: none" és más algoritmusok tiltva).
    if (header.alg !== 'HS256') throw fail('TOKEN_INVALID');

    // Az aláírást a lejárat előtt ellenőrizzük, hogy hamisított tokenről ne derüljön ki semmi.
    const expected = hmac(`${headerPart}.${payloadPart}`, secret);
    const given = Buffer.from(signaturePart, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw fail('TOKEN_INVALID');

    if (typeof payload.exp !== 'number') throw fail('TOKEN_INVALID');
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw fail('TOKEN_EXPIRED');

    return payload;
}

module.exports = { sign, verify };
