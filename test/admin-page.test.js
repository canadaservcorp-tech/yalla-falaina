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
