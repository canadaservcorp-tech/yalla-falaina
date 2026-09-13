'use strict';

// RFC 6238 TOTP — the same algorithm Google Authenticator, Authy, 1Password,
// and Microsoft Authenticator all implement — built on Node's built-in
// `crypto` only, so two-factor auth doesn't need a new dependency for
// something this security-sensitive. Verified in test/totp.test.js against
// RFC 6238 Appendix B's own published test vectors and RFC 4648's own base32
// test vectors, not just self-consistency (a TOTP implementation that only
// agrees with itself can still be wrong in a way that happens to round-trip).

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;   // industry-standard window every mainstream authenticator app assumes
const DIGITS = 6;          // ditto — RFC 6238's own examples use 8, but no popular app does

function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  const rem = bits.length % 5;
  if (rem) out += BASE32_ALPHABET[parseInt(bits.slice(-rem).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// A fresh random secret per enrollment — 20 bytes (160 bits) is what RFC 4226
// itself recommends and what every authenticator app expects.
function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

// otpauth:// is the de-facto provisioning URI every authenticator app's QR
// scanner (and "enter code manually" fallback) understands.
function otpauthUrl(secret, accountLabel, issuer = 'Yalla Nsafer') {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// RFC 4226 HOTP: HMAC-SHA1 over an 8-byte big-endian counter, then "dynamic
// truncation" of the digest down to a DIGITS-length decimal code. `secretBuf`
// is the raw (already base32-decoded) key — kept separate from the public
// generate/verify functions below so test/totp.test.js can check this exact
// step against RFC 6238's own published test vectors independent of this
// file's own base32 implementation.
function hotp(secretBuf, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0');
}

function generateTOTP(secret, forEpochSeconds = Math.floor(Date.now() / 1000)) {
  return hotp(base32Decode(secret), Math.floor(forEpochSeconds / STEP_SECONDS));
}

// window=1 accepts the code from one step before/after "now" (±30s) — the
// same tolerance every mainstream verifier uses, to absorb clock drift and
// the few seconds between reading a code off a phone and typing it in.
// Every candidate is compared with a timing-safe equality check, same
// discipline as routes/auth.js's own sameToken() for verification links.
function verifyTOTP(secret, token, window = 1, forEpochSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token) || typeof secret !== 'string' || !secret) return false;
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(forEpochSeconds / STEP_SECONDS);
  const want = Buffer.from(token);
  for (let e = -window; e <= window; e++) {
    const candidate = Buffer.from(hotp(secretBuf, counter + e));
    if (candidate.length === want.length && crypto.timingSafeEqual(candidate, want)) return true;
  }
  return false;
}

module.exports = {
  generateSecret, otpauthUrl, generateTOTP, verifyTOTP,
  base32Encode, base32Decode, hotp, STEP_SECONDS, DIGITS,
};
