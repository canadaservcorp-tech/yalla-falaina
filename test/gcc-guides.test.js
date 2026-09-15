const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const gccGuides = require('../lib/gccGuides');

const h = getApp();
after(() => h.stop());

// A few real facts (e.g. the UAE's "Green Visa") contain a literal double
// quote, which renderPage's esc() correctly turns into &quot; in the HTML
// output -- match on the same escaped form rather than the raw fact text.
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- lib/gccGuides.js unit tests ----------

test('COUNTRIES lists exactly the four countries this platform tracks as the GCC job-feed track (lib/jobsIngest.js)', () => {
  assert.deepEqual(gccGuides.COUNTRIES.map(c => c.slug).sort(), [
    'work-in-kuwait', 'work-in-qatar', 'work-in-saudi-arabia', 'work-in-uae',
  ]);
});

test('every country has real facts, a title phrase, and an official source link in every supported language', () => {
  for (const c of gccGuides.COUNTRIES) {
    for (const lang of ['en', 'fr', 'ar']) {
      assert.ok(Array.isArray(c.facts[lang]) && c.facts[lang].length > 0, `${c.slug} missing facts for ${lang}`);
      assert.ok(c.title[lang], `${c.slug} missing title phrase for ${lang}`);
      assert.ok(c.official.label[lang], `${c.slug} missing official source label for ${lang}`);
    }
    assert.match(c.official.url, /^https:\/\//, `${c.slug} official.url should be a real link`);
  }
});

test('renderPage shows the right language\'s own facts, not another language\'s or a mix', () => {
  const uae = gccGuides.COUNTRIES.find(c => c.slug === 'work-in-uae');
  for (const lang of ['en', 'fr', 'ar']) {
    const html = gccGuides.renderPage({ country: uae, lang, head: '<title>x</title>' });
    for (const fact of uae.facts[lang]) assert.ok(html.includes(escHtml(fact)), `expected ${lang} page to include its own fact text`);
    // none of the OTHER languages' facts should have leaked in
    for (const other of ['en', 'fr', 'ar'].filter(x => x !== lang)) {
      for (const fact of uae.facts[other]) assert.ok(!html.includes(escHtml(fact)), `${lang} page should not include ${other} fact text`);
    }
  }
});

test('renderPage falls back to the English facts for an unsupported language (e.g. Hindi) rather than throwing', () => {
  const uae = gccGuides.COUNTRIES.find(c => c.slug === 'work-in-uae');
  const html = gccGuides.renderPage({ country: uae, lang: 'hi', head: '<title>x</title>' });
  assert.ok(html.includes(uae.facts.en[0]));
  assert.match(html, /<html lang="en">/);
});

test('renderPage links straight to the real official government source, not a paraphrase', () => {
  for (const c of gccGuides.COUNTRIES) {
    const html = gccGuides.renderPage({ country: c, lang: 'en', head: '<title>x</title>' });
    assert.match(html, new RegExp(`href="${c.official.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});

test('renderPage sets lang and dir="rtl" only for Arabic', () => {
  const c = gccGuides.COUNTRIES[0];
  assert.match(gccGuides.renderPage({ country: c, lang: 'ar', head: '' }), /<html lang="ar" dir="rtl">/);
  assert.match(gccGuides.renderPage({ country: c, lang: 'en', head: '' }), /<html lang="en">/);
  assert.doesNotMatch(gccGuides.renderPage({ country: c, lang: 'en', head: '' }), /dir="rtl"/);
});

test('renderPage embeds the head block it is given verbatim, once', () => {
  const c = gccGuides.COUNTRIES[0];
  const html = gccGuides.renderPage({ country: c, lang: 'en', head: '<title>Marker Title</title>' });
  const hits = html.match(/Marker Title/g) || [];
  assert.equal(hits.length, 1);
});

test('renderPage links to the other three countries\' guide pages, for internal linking, but never to itself', () => {
  const c = gccGuides.COUNTRIES.find(x => x.slug === 'work-in-qatar');
  const html = gccGuides.renderPage({ country: c, lang: 'en', head: '' });
  assert.doesNotMatch(html, /href="\/work-in-qatar"/);
  for (const other of gccGuides.COUNTRIES.filter(x => x.slug !== 'work-in-qatar')) {
    assert.match(html, new RegExp(`href="/${other.slug}"`));
  }
});

// ---------- the real routes, through the app ----------

test('GET /work-in-uae renders real, sourced content server-side, no JS required', async () => {
  const r = await fetch(h.base + '/work-in-uae');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const body = await r.text();
  const uae = gccGuides.COUNTRIES.find(c => c.slug === 'work-in-uae');
  assert.ok(body.includes(uae.facts.en[0]));
  assert.ok(body.includes(uae.official.url));
});

test('GET /work-in-qatar respects ?lang= the same way the homepage does', async () => {
  const r = await fetch(h.base + '/work-in-qatar?lang=fr');
  const body = await r.text();
  const qatar = gccGuides.COUNTRIES.find(c => c.slug === 'work-in-qatar');
  assert.ok(body.includes(qatar.facts.fr[0]));
  assert.match(body, /<html lang="fr">/);
});

test('all four GCC guide pages are listed in the sitemap', async () => {
  const map = await fetch(h.base + '/sitemap.xml').then(x => x.text());
  for (const c of gccGuides.COUNTRIES) {
    assert.match(map, new RegExp(`<loc>[^<]*/${c.slug}</loc>`), `${c.slug} missing from sitemap`);
  }
});

test('each GCC guide page gets its own <title> from lib/seo.js, not the homepage\'s', async () => {
  const r = await fetch(h.base + '/work-in-kuwait');
  const body = await r.text();
  assert.match(body, /<title>Working in Kuwait/);
});
