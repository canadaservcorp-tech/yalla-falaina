const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

// getApp() must run BEFORE lib/expressEntryPage.js is required: it swaps a
// mock into require.cache for '../db' (see test/helpers/appHarness.js), and
// expressEntryPage.js requires that same module path directly (same pattern
// as test/jobsIngest.test.js needs for lib/jobsIngest.js).
const h = getApp();
const expressEntryPage = require('../lib/expressEntryPage');
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const DRAW = {
  title_en: 'Canada — Express Entry draw #300 (General): 3,500 invitations, CRS cutoff 481 · March 1, 2026',
  title_fr: "Canada — Ronde Entrée express n° 300 (General) : 3 500 invitations, score SCG minimal 481 · March 1, 2026",
  title_ar: 'كندا — سحب الدخول السريع رقم 300 (General): 3,500 دعوة، الحد الأدنى لنقاط CRS 481 · March 1, 2026',
  url: 'https://www.canada.ca/en/immigration-refugees-citizenship/express-entry-rounds/invitations.html?q=300',
  published_at: '2026-03-01T00:00:00.000Z',
};

// ---------- lib/expressEntryPage.js unit tests ----------

test('loadDraws only asks for ircc_draw rows, newest first', async () => {
  h.mock.__set('news_items', { data: [DRAW], error: null });
  const draws = await expressEntryPage.loadDraws();
  assert.deepEqual(draws, [DRAW]);
});

test('loadDraws degrades to an empty list rather than throwing on a DB error', async () => {
  h.mock.__set('news_items', { data: null, error: { message: 'connection reset' } });
  const draws = await expressEntryPage.loadDraws();
  assert.deepEqual(draws, []);
});

test('titleField picks the native headline for en/fr/ar, and English for Hindi/Turkish (no machine-translated CRS numbers)', () => {
  assert.equal(expressEntryPage.titleField('en'), 'title_en');
  assert.equal(expressEntryPage.titleField('fr'), 'title_fr');
  assert.equal(expressEntryPage.titleField('ar'), 'title_ar');
  assert.equal(expressEntryPage.titleField('hi'), 'title_en');
  assert.equal(expressEntryPage.titleField('tr'), 'title_en');
});

test('renderPage shows the right native headline per language, and falls back to title_en for Hindi/Turkish', () => {
  for (const [lang, expected] of [['en', DRAW.title_en], ['fr', DRAW.title_fr], ['ar', DRAW.title_ar], ['hi', DRAW.title_en], ['tr', DRAW.title_en]]) {
    const html = expressEntryPage.renderPage({ lang, draws: [DRAW], head: '<title>x</title>' });
    assert.ok(html.includes(expected), `expected ${lang} page to include its own headline text`);
  }
});

test('renderPage links each draw straight to its real IRCC source url, not a paraphrase', () => {
  const html = expressEntryPage.renderPage({ lang: 'en', draws: [DRAW], head: '<title>x</title>' });
  assert.match(html, new RegExp(`href="${DRAW.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});

test('renderPage shows an honest empty state instead of an empty list when there is no data yet', () => {
  const html = expressEntryPage.renderPage({ lang: 'en', draws: [], head: '<title>x</title>' });
  assert.match(html, /No draws are loaded yet/);
  assert.doesNotMatch(html, /<li>/);
});

test('renderPage embeds the head block it is given verbatim, once', () => {
  const html = expressEntryPage.renderPage({ lang: 'en', draws: [], head: '<title>Marker Title</title>' });
  const hits = html.match(/Marker Title/g) || [];
  assert.equal(hits.length, 1);
});

test('renderPage sets lang and dir="rtl" only for Arabic', () => {
  assert.match(expressEntryPage.renderPage({ lang: 'ar', draws: [], head: '' }), /<html lang="ar" dir="rtl">/);
  assert.match(expressEntryPage.renderPage({ lang: 'en', draws: [], head: '' }), /<html lang="en">/);
  assert.doesNotMatch(expressEntryPage.renderPage({ lang: 'en', draws: [], head: '' }), /dir="rtl"/);
});

// ---------- the real route, through the app ----------

test('GET /express-entry-draws renders real draw content server-side, no JS required', async () => {
  h.mock.__set('news_items', { data: [DRAW], error: null });
  const r = await fetch(h.base + '/express-entry-draws');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const body = await r.text();
  assert.ok(body.includes(DRAW.title_en));
  assert.ok(body.includes(DRAW.url));
  assert.match(body, /<title>Canada Express Entry Draws/);
});

test('GET /express-entry-draws respects ?lang= the same way the homepage does', async () => {
  h.mock.__set('news_items', { data: [DRAW], error: null });
  const r = await fetch(h.base + '/express-entry-draws?lang=fr');
  const body = await r.text();
  assert.ok(body.includes(DRAW.title_fr));
  assert.match(body, /<html lang="fr">/);
});

test('GET /express-entry-draws is listed in the sitemap and survives an empty news_items table', async () => {
  h.mock.__set('news_items', { data: null, error: null });
  const r = await fetch(h.base + '/express-entry-draws');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /No draws are loaded yet/);

  const map = await fetch(h.base + '/sitemap.xml').then(x => x.text());
  assert.match(map, /<loc>[^<]*\/express-entry-draws<\/loc>/);
});
