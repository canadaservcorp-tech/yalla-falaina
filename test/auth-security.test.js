// Account-level login lockout (schema.sql's record_login_result()) and
// two-factor authentication (lib/totp.js, RFC 6238) — the two additions
// routes/auth.js's /login and /totp/* endpoints layer on top of the
// pre-existing bcrypt + JWT flow. lib/totp.js's own correctness against the
// RFC's published test vectors is covered separately in test/totp.test.js;
// everything here is about how routes/auth.js wires that module in.
const { test, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { getApp, actor, auth } = require('./helpers/appHarness');
const totp = require('../lib/totp');

const h = getApp();
after(() => h.stop());

const EMAIL = 'seeker@example.invalid';
const PASSWORD = 'correct-horse-battery-1';
const PASSWORD_HASH = require('bcryptjs').hashSync(PASSWORD, 4); // low rounds — fast tests, hashing logic is bcryptjs's own to trust

function setUser(overrides = {}) {
  h.mock.__set('users', {
    data: {
      id: 1, email: EMAIL, name: 'Seeker', role: 'seeker', banned: false, email_verified: true,
      password_hash: PASSWORD_HASH, totp_secret: null, totp_enabled: false, locked_until: null,
      ...overrides,
    },
    error: null,
  });
}

const login = body => fetch(h.base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// ---------- account lockout ----------

test('a wrong password records a failed attempt keyed on the account, not just the IP', async () => {
  h.mock.__reset();
  setUser();
  const r = await login({ email: EMAIL, password: 'not the password' });
  assert.equal(r.status, 401);
  const call = h.mock.__lastRpc('record_login_result');
  assert.ok(call, 'expected record_login_result to be called');
  assert.equal(call.args.p_user_id, 1);
  assert.equal(call.args.p_success, false);
});

test('a correct password with no 2FA resets the lockout counter and signs in', async () => {
  h.mock.__reset();
  setUser();
  const r = await login({ email: EMAIL, password: PASSWORD });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.token);
  const call = h.mock.__lastRpc('record_login_result');
  assert.equal(call.args.p_success, true);
});

test('an account with locked_until in the future is refused with the SAME generic message as a wrong password (no account-existence leak)', async () => {
  h.mock.__reset();
  setUser({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  const r = await login({ email: EMAIL, password: PASSWORD }); // correct password, but locked
  assert.equal(r.status, 401);
  const body = await r.json();
  assert.equal(body.code, 'ERR_INVALID_CREDENTIALS');
  assert.equal(body.error, 'Invalid credentials');
});

test('a lock already in effect is not re-recorded (retrying during a lock must not extend it indefinitely)', async () => {
  h.mock.__reset();
  setUser({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  await login({ email: EMAIL, password: PASSWORD });
  assert.equal(h.mock.__rpcCalls('record_login_result').length, 0);
});

test('an account whose lock has already expired is treated as unlocked', async () => {
  h.mock.__reset();
  setUser({ locked_until: new Date(Date.now() - 60 * 1000).toISOString() }); // in the past
  const r = await login({ email: EMAIL, password: PASSWORD });
  assert.equal(r.status, 200);
});

test('a non-existent account never calls record_login_result (nothing to key it on) and still returns the generic message', async () => {
  h.mock.__reset();
  h.mock.__set('users', { data: null, error: null });
  const r = await login({ email: 'nobody@example.invalid', password: 'whatever12' });
  assert.equal(r.status, 401);
  const body = await r.json();
  assert.equal(body.code, 'ERR_INVALID_CREDENTIALS');
  assert.equal(h.mock.__rpcCalls('record_login_result').length, 0);
});

// ---------- TOTP setup / confirm / disable ----------

test('POST /totp/setup issues a fresh secret and a matching otpauth:// URL, but does not enable 2FA yet', async () => {
  h.mock.__reset();
  const token = actor(h, { id: 1, extra: { totp_enabled: false } });
  const r = await fetch(h.base + '/api/auth/totp/setup', { method: 'POST', headers: auth(token) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.secret);
  assert.ok(body.otpauthUrl.includes(body.secret));
  const write = h.mock.__writes('users', 'update').pop();
  assert.equal(write.payload.totp_secret, body.secret);
  assert.equal('totp_enabled' in write.payload, false, 'setup must not flip totp_enabled on its own');
});

test('POST /totp/setup refuses to run again once 2FA is already enabled', async () => {
  h.mock.__reset();
  const token = actor(h, { id: 1, extra: { totp_enabled: true } });
  const r = await fetch(h.base + '/api/auth/totp/setup', { method: 'POST', headers: auth(token) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_TOTP_ALREADY_ENABLED');
});

test('POST /totp/confirm with the right code enables 2FA; with the wrong code it does not', async () => {
  h.mock.__reset();
  const secret = totp.generateSecret();
  const token = actor(h, { id: 1, extra: { totp_secret: secret, totp_enabled: false } });

  const wrong = await fetch(h.base + '/api/auth/totp/confirm', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ token: '000000' }),
  });
  assert.equal(wrong.status, 401);
  assert.equal(h.mock.__writes('users', 'update').length, 0, 'a wrong code must not enable anything');

  const right = await fetch(h.base + '/api/auth/totp/confirm', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ token: totp.generateTOTP(secret) }),
  });
  assert.equal(right.status, 200);
  assert.equal(h.mock.__writes('users', 'update').pop().payload.totp_enabled, true);
});

test('POST /totp/confirm without a prior /totp/setup is refused, not silently accepted', async () => {
  h.mock.__reset();
  const token = actor(h, { id: 1, extra: { totp_secret: null, totp_enabled: false } });
  const r = await fetch(h.base + '/api/auth/totp/confirm', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ token: '123456' }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_TOTP_NOT_STARTED');
});

test('POST /totp/disable requires BOTH the current password AND a valid code — either alone is refused', async () => {
  h.mock.__reset();
  const secret = totp.generateSecret();
  const token = actor(h, { id: 1, extra: { password_hash: PASSWORD_HASH, totp_secret: secret, totp_enabled: true } });

  const passwordOnly = await fetch(h.base + '/api/auth/totp/disable', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ password: PASSWORD, token: '000000' }),
  });
  assert.equal(passwordOnly.status, 401);

  const codeOnly = await fetch(h.base + '/api/auth/totp/disable', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ password: 'wrong', token: totp.generateTOTP(secret) }),
  });
  assert.equal(codeOnly.status, 401);
  assert.equal(h.mock.__writes('users', 'update').length, 0, 'neither partial attempt may disable 2FA');

  const both = await fetch(h.base + '/api/auth/totp/disable', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ password: PASSWORD, token: totp.generateTOTP(secret) }),
  });
  assert.equal(both.status, 200);
  const write = h.mock.__writes('users', 'update').pop();
  assert.equal(write.payload.totp_enabled, false);
  assert.equal(write.payload.totp_secret, null);
});

test('GET /totp/status reports the account’s current 2FA state without mutating anything', async () => {
  h.mock.__reset();
  const off = actor(h, { id: 1, extra: { totp_enabled: false } });
  const rOff = await fetch(h.base + '/api/auth/totp/status', { headers: auth(off) });
  assert.deepEqual((await rOff.json()).totpEnabled, false);

  h.mock.__reset();
  const on = actor(h, { id: 1, extra: { totp_enabled: true } });
  const rOn = await fetch(h.base + '/api/auth/totp/status', { headers: auth(on) });
  assert.deepEqual((await rOn.json()).totpEnabled, true);
  assert.equal(h.mock.__writes('users').length, 0, 'a status read must never write anything');
});

// ---------- 2FA at login ----------

test('login on a 2FA-enabled account without a code is challenged, not signed in', async () => {
  h.mock.__reset();
  const secret = totp.generateSecret();
  setUser({ totp_secret: secret, totp_enabled: true });
  const r = await login({ email: EMAIL, password: PASSWORD });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'ERR_TOTP_REQUIRED');
});

test('login on a 2FA-enabled account with the wrong code is refused and recorded as a failed attempt', async () => {
  h.mock.__reset();
  const secret = totp.generateSecret();
  setUser({ totp_secret: secret, totp_enabled: true });
  const r = await login({ email: EMAIL, password: PASSWORD, totpToken: '000000' });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'ERR_INVALID_TOTP');
  assert.equal(h.mock.__lastRpc('record_login_result').args.p_success, false);
});

test('login on a 2FA-enabled account with the right password and code succeeds', async () => {
  h.mock.__reset();
  const secret = totp.generateSecret();
  setUser({ totp_secret: secret, totp_enabled: true });
  const r = await login({ email: EMAIL, password: PASSWORD, totpToken: totp.generateTOTP(secret) });
  assert.equal(r.status, 200);
  assert.ok((await r.json()).token);
});

// ---------- emergency global JWT revocation (AUTH_MIN_ISSUED_AT) ----------

test('AUTH_MIN_ISSUED_AT rejects a token issued before it, and a normal token still works when it is unset', async () => {
  h.mock.__reset();
  h.mock.__set('users', { data: { id: 1, role: 'seeker', banned: false, email_verified: true }, error: null });
  const staleToken = jwt.sign(
    { id: 1, role: 'seeker', name: 'T1', iat: Math.floor(Date.now() / 1000) - 3600 },
    process.env.JWT_SECRET, { expiresIn: '2d' },
  );
  try {
    const before = await fetch(h.base + '/api/profile', { headers: auth(staleToken) });
    assert.equal(before.status, 200, 'without the kill switch set, a normal token still works');

    process.env.AUTH_MIN_ISSUED_AT = new Date().toISOString(); // "now" — after the token's iat
    const after1 = await fetch(h.base + '/api/profile', { headers: auth(staleToken) });
    assert.equal(after1.status, 401, 'a token issued before the kill-switch moment must be rejected');

    const freshToken = actor(h, { id: 1 }); // signed just now, iat is "now"
    const after2 = await fetch(h.base + '/api/profile', { headers: auth(freshToken) });
    assert.equal(after2.status, 200, 'a token issued AFTER the kill-switch moment must still work');
  } finally {
    delete process.env.AUTH_MIN_ISSUED_AT;
  }
});
