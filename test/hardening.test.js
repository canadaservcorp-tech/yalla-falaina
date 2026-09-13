const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('CSP allows no third-party script origin and carries no unsafe-inline for scripts', async () => {
  const r = await fetch(h.base + '/api/health');
  const csp = r.headers.get('content-security-policy');
  assert.ok(!csp.includes('cdn.jsdelivr.net'), csp);
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/, csp);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'script-src must not fall back to unsafe-inline: ' + csp);
  // images come from us or Supabase storage, never from any https host
  assert.ok(!/img-src[^;]*\bhttps:\s/.test(csp), csp);
});

test('the CSP nonce is fresh on every request, not a value baked in once at boot', async () => {
  const [r1, r2] = await Promise.all([fetch(h.base + '/api/health'), fetch(h.base + '/api/health')]);
  const nonce = csp => csp.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/)[1];
  assert.notEqual(nonce(r1.headers.get('content-security-policy')), nonce(r2.headers.get('content-security-policy')),
    'a fixed nonce would be readable from any prior response and then reusable by an attacker forever, same as unsafe-inline');
});

test('the SPA shell’s own inline <script> tags carry the SAME nonce as that response’s CSP header', async () => {
  const r = await fetch(h.base + '/');
  const csp = r.headers.get('content-security-policy');
  const nonce = csp.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/)[1];
  const body = await r.text();
  const scriptTags = body.match(/<script[^>]*>/g) || [];
  assert.ok(scriptTags.length > 0, 'expected at least one <script> tag in the page');
  for (const tag of scriptTags) assert.ok(tag.includes(`nonce="${nonce}"`), `tag missing/mismatched nonce: ${tag}`);
});

test('Permissions-Policy locks down device APIs this app never uses', async () => {
  const r = await fetch(h.base + '/api/health');
  const pp = r.headers.get('permissions-policy');
  for (const feature of ['camera=()', 'geolocation=()', 'payment=()']) assert.ok(pp.includes(feature), pp);
  // the mic is the one device API the app does use (chat voice notes), and only
  // same-origin — an embedded third-party frame still must not reach it
  assert.ok(pp.includes('microphone=(self)'), pp);
  assert.ok(!/microphone=\*/.test(pp), pp);
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
