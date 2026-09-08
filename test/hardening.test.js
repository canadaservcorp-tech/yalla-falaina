const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('CSP allows no third-party script origin', async () => {
  const r = await fetch(h.base + '/api/health');
  const csp = r.headers.get('content-security-policy');
  assert.ok(!csp.includes('cdn.jsdelivr.net'), csp);
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"), csp);
  // images come from us or Supabase storage, never from any https host
  assert.ok(!/img-src[^;]*\bhttps:\s/.test(csp), csp);
});

test('one IP cannot mint accounts with fresh addresses forever', async () => {
  const reg = i => fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `burst${i}@example.invalid`, password: 'longenoughpw1', name: 'B', role: 'seeker', acceptTerms: true }),
  });
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await reg(i)).status === 429;
  assert.ok(limited, 'registration should be capped per IP regardless of the address used');
});

test('ordinary API requests cannot post megabytes', async () => {
  const r = await fetch(h.base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) }),
  });
  assert.equal(r.status, 400);
});
