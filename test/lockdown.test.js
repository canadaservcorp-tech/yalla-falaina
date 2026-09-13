// SITE_LOCKDOWN is read ONCE, at server.js module load (server.js:33) — unlike
// AUTH_MIN_ISSUED_AT (read fresh on every request, tested in
// test/auth-security.test.js), so it needs the env var set BEFORE server.js
// is ever required. That must not be the shared appHarness singleton other
// test files already loaded without it — this file gets node --test's normal
// one-file-one-process isolation, so setting it here and requiring fresh is safe.
const { test, after } = require('node:test');
const assert = require('node:assert');

process.env.SITE_LOCKDOWN = 'true';
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => { delete process.env.SITE_LOCKDOWN; return h.stop(); });

test('SITE_LOCKDOWN takes every /api route offline except /api/health', async () => {
  const r = await fetch(h.base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.co', password: 'whatever12' }),
  });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'ERR_LOCKDOWN');
});

test('SITE_LOCKDOWN still lets /api/health through, so an operator can confirm the app is up and deliberately locked down', async () => {
  const r = await fetch(h.base + '/api/health');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});

test('SITE_LOCKDOWN blocks the admin API too — a lockdown has no special-case exceptions', async () => {
  const r = await fetch(h.base + '/api/admin/informal-listings');
  assert.equal(r.status, 503);
});
