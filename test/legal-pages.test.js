// Terms of Use / Privacy Policy — static pages served straight from public/
// (express.static, before the SPA catch-all). The registration checkbox
// links to both; this locks in that they actually exist and that the
// version stamped on acceptance (routes/auth.js's TERMS_VERSION) doesn't
// silently drift from the date printed on the page itself.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /terms.html serves the Terms of Use', async () => {
  const r = await fetch(h.base + '/terms.html');
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /<title>Terms of Use/);
  assert.match(body, /18 years of age or older/);
  assert.match(body, /href="\/privacy\.html"/);
});

test('GET /privacy.html serves the Privacy Policy', async () => {
  const r = await fetch(h.base + '/privacy.html');
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /<title>Privacy Policy/);
  assert.match(body, /href="\/terms\.html"/);
});

test('the registration form links to both, not just a bare checkbox', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  assert.match(body, /href="\/terms\.html"/);
  assert.match(body, /href="\/privacy\.html"/);
});

test("the terms page's printed version matches what routes/auth.js stamps on acceptance", () => {
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  const termsHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'terms.html'), 'utf8');
  const codeVersion = authSrc.match(/TERMS_VERSION = '([^']+)'/)?.[1];
  assert.ok(codeVersion, 'routes/auth.js should define TERMS_VERSION');
  assert.match(termsHtml, new RegExp(`Version ${codeVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `terms.html's printed version should match TERMS_VERSION ('${codeVersion}') — update whichever one drifted`);
});
