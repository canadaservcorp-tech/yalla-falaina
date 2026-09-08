// Roadmap Step 5's other half: routes/informal-listings.js (the public submit
// endpoint) and the admin moderation console both existed with no way for a
// visitor to actually reach the submit endpoint. public/index.html now has an
// inline, pre-auth form for it (no account needed, matching the route itself).
// This locks in that the page ships the form and wires it to the real endpoint
// with the fields the route requires, not a stale/typo'd path.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET / serves a pre-auth informal-listing submission form', async () => {
  const r = await fetch(h.base + '/');
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /id="postListingForm"/);
  assert.match(body, /id="plContact"/);
  assert.match(body, /id="plTitle"/);
});

test('the form posts to the real, unauthenticated informal-listings endpoint', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  assert.match(body, /fetch\('\/api\/informal-listings'/);
  // contact/title are required by the route; country/category/description are optional
  assert.match(body, /contact,\s*\n?\s*title,/);
});

test('the form lives outside authWrap so signed-in visitors can still reach it', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  // The aside sits after </main> — inside neither the signed-out authWrap
  // nor the signed-in appMain, which enter()/logout() toggle between.
  assert.ok(body.indexOf('id="postListingAside"') > body.indexOf('</main>'),
    'postListingAside must render outside the mutually exclusive auth/app containers');
  assert.equal(body.indexOf('id="authWrap"') < body.indexOf('</main>'), true);
});

test('inputs carry maxlengths matching the route\'s clean() caps', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  // mirrors sec.clean() limits in routes/informal-listings.js so oversized
  // entries hit a visible browser cap instead of being silently truncated
  for (const [id, max] of [['plContact', 120], ['plTitle', 120], ['plCountry', 60], ['plCategory', 60], ['plDescription', 1000]]) {
    assert.match(body, new RegExp(`id="${id}"[^>]*maxlength="${max}"`), `${id} missing maxlength=${max}`);
  }
});
