// The informal-listings moderation API (routes/admin-informal-listings.js) had
// no way for an admin to actually use it short of curl/Postman. public/admin.html
// is a lightweight console over that same API — this locks in that it's served
// and that it talks to the real endpoints, not a typo'd path.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /admin.html serves the moderation console', async () => {
  const r = await fetch(h.base + '/admin.html');
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /<title>Yalla Nsafer — Admin/);
  assert.match(body, /noindex/);
});

test('admin.html calls the real login and moderation endpoints', async () => {
  const body = await fetch(h.base + '/admin.html').then(r => r.text());
  assert.match(body, /\/api\/auth\/login/);
  assert.match(body, /\/api\/admin\/informal-listings/);
  assert.match(body, /\$\{id\}\/review/);
});

test('admin.html’s own inline <script> carries the same per-request CSP nonce as its response header', async () => {
  const r = await fetch(h.base + '/admin.html');
  const csp = r.headers.get('content-security-policy');
  const nonce = csp.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/)[1];
  const body = await r.text();
  // plain substring check, not a RegExp built from the nonce — base64 nonces
  // can contain '+', a regex metacharacter, which broke this exact assertion
  // the first time it ran against a real nonce.
  assert.ok(body.includes(`<script nonce="${nonce}">`), `expected the page's script tag to carry nonce ${nonce}`);
});

test('admin.html wires up its own two-factor authentication settings (enable/confirm/disable), not just the moderation queue', async () => {
  const body = await fetch(h.base + '/admin.html').then(r => r.text());
  assert.match(body, /\/api\/auth\/totp\/status/);
  assert.match(body, /\/api\/auth\/totp\/setup/);
  assert.match(body, /\/api\/auth\/totp\/confirm/);
  assert.match(body, /\/api\/auth\/totp\/disable/);
});
