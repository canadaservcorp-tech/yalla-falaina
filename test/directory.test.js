const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
const h = getApp();                                   // injects the mock db before lib/ loads
const dir = require('../lib/directory');
after(() => h.stop());
beforeEach(() => { h.mock.__reset(); dir.__reset(); });

const PROFS = [{ id: 1, name_fr: 'Électricien', name_en: 'Electrician' },
  { id: 2, name_fr: 'Plomberie', name_en: 'Plumbing' }];

// n providers of profession `prof` in `city`, plus whatever extra rows a test needs
function catalogue({ counts = [[1, 'Laval', 4]], extra = [] } = {}) {
  const providers = [], services = [];
  let id = 100;
  for (const [prof, city, n] of counts) {
    for (let i = 0; i < n; i++) {
      const user_id = id++;
      providers.push({ user_id, display_name: `Entreprise ${user_id}`, city, rbq_licence: `1000-0000-${user_id}`, claimed: false });
      services.push({ provider_id: user_id, profession_id: prof });
    }
  }
  for (const p of extra) { providers.push(p.provider); services.push(p.service); }
  h.mock.__set('professions', { data: PROFS, error: null });
  h.mock.__set('provider_services', { data: services, error: null });
  h.mock.__set('providers', { data: providers, error: null });
}

const get = path => fetch(h.base + path);

test('a trade and city with real providers gets its own crawlable page', async () => {
  catalogue();
  const res = await get('/services/electricien/laval');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Électricien à Laval/);
  assert.match(html, /4 prestataires/);
  assert.match(html, /Entreprise 100/);
  assert.ok(html.includes('<link rel="canonical" href="https://www.mytrouvepro.net/services/electricien/laval">'));
  assert.ok(html.includes('href="/fiche/1000-0000-100"'), 'each listing links to its claim page');
});

test('the English slug and the English page both work', async () => {
  catalogue();
  const html = await (await get('/services/electrician/laval?lang=en')).text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Electrician in Laval/);
});

test('a thin combination is not published', async () => {
  catalogue({ counts: [[1, 'Laval', 2]] });
  assert.equal((await get('/services/electricien/laval')).status, 404);
});

test('an unknown trade or a junk slug is a 404, not a crash', async () => {
  catalogue();
  assert.equal((await get('/services/astronaute/laval')).status, 404);
  assert.equal((await get('/services/electricien/..%2Fetc')).status, 404);
});

test('pages link to the same trade elsewhere and other trades in town', async () => {
  catalogue({ counts: [[1, 'Laval', 4], [1, 'Longueuil', 3], [2, 'Laval', 3]] });
  const html = await (await get('/services/electricien/laval')).text();
  assert.ok(html.includes('href="/services/electricien/longueuil"'), 'same trade, other city');
  assert.ok(html.includes('href="/services/plomberie/laval"'), 'other trade, same city');
});

test('a claimed listing carries no claim pitch', async () => {
  catalogue({ counts: [[1, 'Laval', 3]] });
  const html = await (await get('/services/electricien/laval')).text();
  assert.match(html, /Réclamez votre fiche/);

  dir.__reset();
  h.mock.__reset();
  catalogue({ counts: [] , extra: [1, 2, 3].map(i => ({
    provider: { user_id: 200 + i, display_name: `Pro ${i}`, city: 'Laval', rbq_licence: `2000-0000-0${i}`, claimed: true },
    service: { provider_id: 200 + i, profession_id: 1 },
  })) });
  const claimed = await (await get('/services/electricien/laval')).text();
  assert.ok(!claimed.includes('Réclamez votre fiche'));
});

test('the services sitemap lists only published combinations', async () => {
  catalogue({ counts: [[1, 'Laval', 4], [2, 'Laval', 2]] });
  const xml = await (await get('/sitemap-services.xml')).text();
  assert.ok(xml.includes('<loc>https://www.mytrouvepro.net/services/electricien/laval</loc>'));
  assert.ok(!xml.includes('plomberie'), 'a thin combination stays out of the sitemap');
});

test('robots points crawlers at both sitemaps', async () => {
  const txt = await (await get('/robots.txt')).text();
  assert.match(txt, /Sitemap: https:\/\/www\.mytrouvepro\.net\/sitemap\.xml/);
  assert.match(txt, /Sitemap: https:\/\/www\.mytrouvepro\.net\/sitemap-services\.xml/);
});

test('no provider address or coordinates reach the page', async () => {
  catalogue({ counts: [], extra: [1, 2, 3].map(i => ({
    provider: {
      user_id: 300 + i, display_name: `Pro ${i}`, city: 'Laval', rbq_licence: `3000-0000-0${i}`,
      claimed: false, lat: 45.5589, lng: -73.7492, address: '12 rue Secrète',
    },
    service: { provider_id: 300 + i, profession_id: 1 },
  })) });
  const html = await (await get('/services/electricien/laval')).text();
  assert.ok(!html.includes('45.5589'));
  assert.ok(!html.includes('-73.7492'));
  assert.ok(!html.includes('rue Secrète'));
});

test('a database failure answers 500 without leaking internals', async () => {
  h.mock.__set('professions', { data: null, error: { message: 'down' } });
  h.mock.__set('provider_services', { data: [], error: null });
  h.mock.__set('providers', { data: [], error: null });
  const res = await get('/services/electricien/laval');
  assert.equal(res.status, 500);
  assert.ok(!(await res.text()).includes('down'));
});
