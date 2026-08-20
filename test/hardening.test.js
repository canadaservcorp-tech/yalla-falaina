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

test('ordinary API requests cannot post megabytes', async () => {
  const r = await fetch(h.base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) }),
  });
  assert.equal(r.status, 400);
});
