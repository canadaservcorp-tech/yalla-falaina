// lib/totp.js is hand-rolled RFC 6238 on Node's built-in crypto (no new
// dependency for something this security-sensitive) — so unlike most modules
// in this repo, "internally consistent" isn't enough proof it's right. Every
// test below checks against a PUBLISHED, independent standard: RFC 6238
// Appendix B's own HOTP/TOTP test vectors, and RFC 4648's own base32 test
// vectors — not just that generate() and verify() agree with each other.
const test = require('node:test');
const assert = require('node:assert');
const totp = require('../lib/totp');

// ---------- base32 (RFC 4648 §10 test vectors, padding stripped —
// authenticator apps and this module both use unpadded base32) ----------

test('base32Encode() matches RFC 4648’s own published test vectors', () => {
  const cases = [
    ['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(totp.base32Encode(Buffer.from(input, 'ascii')), expected, `encode(${JSON.stringify(input)})`);
  }
});

test('base32Decode() inverts base32Encode() for the same vectors', () => {
  const cases = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'];
  for (const input of cases) {
    const roundTripped = totp.base32Decode(totp.base32Encode(Buffer.from(input, 'ascii'))).toString('ascii');
    assert.equal(roundTripped, input);
  }
});

test('base32Decode() is case-insensitive and ignores stray formatting characters', () => {
  const secret = totp.generateSecret();
  const messy = secret.toLowerCase().match(/.{1,4}/g).join('-'); // "abcd-efgh-..." the way a human might type it
  assert.deepEqual(totp.base32Decode(messy), totp.base32Decode(secret));
});

// ---------- HOTP core (RFC 4226 Appendix D / RFC 6238 Appendix B test
// vectors — secret is the literal ASCII bytes "12345678901234567890", used
// directly as the HMAC key, exactly as both RFCs specify) ----------

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
// RFC 6238 Appendix B publishes these as 8-digit codes; this module always
// truncates to 6. (a % 10^8) % 10^6 === a % 10^6, so the last 6 digits of the
// RFC's own 8-digit values are exactly what a correct 6-digit implementation
// must produce — computed here from the RFC's literal published numbers, not
// re-derived, so a mistake in this file's own math can't quietly cancel out.
const RFC_VECTORS = [
  { time: 59, counter: 1, rfc8digit: '94287082' },
  { time: 1111111109, counter: 37037036, rfc8digit: '07081804' },
  { time: 1111111111, counter: 37037037, rfc8digit: '14050471' },
  { time: 1234567890, counter: 41152263, rfc8digit: '89005924' },
  { time: 2000000000, counter: 66666666, rfc8digit: '69279037' },
];

test('hotp() matches RFC 6238 Appendix B’s published HMAC-SHA1 test vectors (truncated to 6 digits)', () => {
  for (const v of RFC_VECTORS) {
    const expected6 = String(Number(v.rfc8digit) % 1e6).padStart(6, '0');
    assert.equal(totp.hotp(RFC_SECRET, v.counter), expected6, `counter=${v.counter}`);
  }
});

test('generateTOTP() reproduces the same RFC vectors when given the RFC times, through the real base32 secret path', () => {
  const secret = totp.base32Encode(RFC_SECRET);
  for (const v of RFC_VECTORS) {
    const expected6 = String(Number(v.rfc8digit) % 1e6).padStart(6, '0');
    assert.equal(totp.generateTOTP(secret, v.time), expected6, `time=${v.time}`);
  }
});

// ---------- verifyTOTP() ----------

test('verifyTOTP() accepts the code generated for the current moment', () => {
  const secret = totp.generateSecret();
  const now = Math.floor(Date.now() / 1000);
  const code = totp.generateTOTP(secret, now);
  assert.equal(totp.verifyTOTP(secret, code, 1, now), true);
});

test('verifyTOTP() rejects a wrong code', () => {
  const secret = totp.generateSecret();
  const now = Math.floor(Date.now() / 1000);
  const wrong = totp.generateTOTP(secret, now) === '000000' ? '111111' : '000000';
  assert.equal(totp.verifyTOTP(secret, wrong, 1, now), false);
});

test('verifyTOTP() tolerates one step of clock drift (±30s) but not two', () => {
  const secret = totp.generateSecret();
  const now = Math.floor(Date.now() / 1000);
  const oneStepAgo = totp.generateTOTP(secret, now - totp.STEP_SECONDS);
  const twoStepsAgo = totp.generateTOTP(secret, now - 2 * totp.STEP_SECONDS);
  assert.equal(totp.verifyTOTP(secret, oneStepAgo, 1, now), true, 'one step of drift should still verify');
  assert.equal(totp.verifyTOTP(secret, twoStepsAgo, 1, now), false, 'two steps of drift should not verify');
});

test('verifyTOTP() rejects malformed input instead of throwing', () => {
  const secret = totp.generateSecret();
  for (const bad of [undefined, null, '', '12345', '1234567', 'abcdef', 123456]) {
    assert.equal(totp.verifyTOTP(secret, bad), false, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(totp.verifyTOTP('', '123456'), false, 'an empty/missing secret must never verify');
  assert.equal(totp.verifyTOTP(undefined, '123456'), false);
});

test('otpauthUrl() produces a standard otpauth:// URI an authenticator app can parse', () => {
  const secret = totp.generateSecret();
  const url = totp.otpauthUrl(secret, 'admin@example.com');
  assert.match(url, /^otpauth:\/\/totp\//);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('secret'), secret);
  assert.equal(parsed.searchParams.get('issuer'), 'Yalla Nsafer');
  assert.equal(parsed.searchParams.get('digits'), '6');
  assert.equal(parsed.searchParams.get('period'), '30');
  assert.ok(decodeURIComponent(parsed.pathname).includes('admin@example.com'));
});

test('generateSecret() returns a fresh, sufficiently long secret every call', () => {
  const a = totp.generateSecret(), b = totp.generateSecret();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32, 'a 20-byte secret base32-encodes to 32 characters');
});
