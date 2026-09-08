const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const seo = require('../lib/seo');

const h = getApp();
after(() => h.stop());

const html = (p = '/') => fetch(h.base + p).then(r => r.text());

test('each indexable page gets its own title and description', async () => {
  const seen = new Set();
  for (const p of seo.INDEXABLE) {
    const body = await html(p);
    const title = (body.match(/<title>([^<]+)<\/title>/) || [])[1];
    const desc = (body.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    assert.ok(title && desc, p);
    assert.ok(!seen.has(title), `duplicate title on ${p}`);
    seen.add(title);
    assert.equal(body.match(/<title>/g).length, 1, `one title on ${p}`);
  }
});

test('unknown paths fall back to the home metadata', async () => {
  const body = await html('/nope');
  assert.match(body, /<title>Yalla Falaina — Your Assistant to Travel<\/title>/);
});

test('the page is indexable in all three product languages', async () => {
  for (const l of ['en', 'fr', 'ar']) {
    const body = await html(`/?lang=${l}`);
    assert.ok(body.includes(`hreflang="${l}"`), l);
  }
});

test('robots and sitemap exist and stay consistent', async () => {
  const robots = await fetch(h.base + '/robots.txt').then(r => r.text());
  assert.match(robots, /Disallow: \/api\//);
  const map = await fetch(h.base + '/sitemap.xml').then(r => r.text());
  for (const p of seo.INDEXABLE) assert.ok(map.includes(`<loc>`), p);
});
