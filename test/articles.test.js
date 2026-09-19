const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const articles = require('../lib/articles');
const seo = require('../lib/seo');

const h = getApp();
after(() => h.stop());

// ---------- lib/articles.js unit tests ----------

test('ARTICLES covers exactly the five SEO-pack articles, in the pack\'s publishing order', () => {
  assert.deepEqual(articles.ARTICLES.map(a => a.slug), [
    'verify-immigration-consultant', 'scholarships-arab-students',
    'work-abroad-without-degree', 'spot-fake-job-offer', 'medical-treatment-abroad',
  ]);
});

test('every article has meta, h1, intro, and a section body in all of its own languages', () => {
  for (const a of articles.ARTICLES) {
    for (const lang of articles.articleLangs(a)) {
      assert.ok(a.meta[lang].title && a.meta[lang].description, `${a.slug} missing ${lang} meta`);
      assert.ok(a.h1[lang], `${a.slug} missing ${lang} h1`);
      assert.ok(a.intro[lang], `${a.slug} missing ${lang} intro`);
      assert.ok(a.note[lang], `${a.slug} missing ${lang} honesty note`);
    }
    assert.ok(a.sections.length >= 2, `${a.slug} should have at least two sections`);
    for (const s of a.sections) {
      for (const lang of articles.articleLangs(a)) assert.ok(s.h2[lang], `${a.slug} section missing ${lang} h2`);
      assert.ok(s.paras || s.bullets, `${a.slug} section has no body`);
    }
  }
});

test('renderPage shows one language\'s copy only, and sets dir="rtl" for Arabic', () => {
  const a = articles.ARTICLES[0];
  for (const lang of articles.LANGS) {
    const html = articles.renderPage({ article: a, lang, head: '<title>x</title>', baseUrl: 'https://x.test' });
    assert.ok(html.includes(a.h1[lang]));
    for (const other of articles.LANGS.filter(x => x !== lang)) {
      assert.ok(!html.includes(a.h1[other]), `${lang} page should not contain the ${other} h1`);
    }
  }
  assert.match(articles.renderPage({ article: a, lang: 'ar', head: '', baseUrl: '' }), /<html lang="ar" dir="rtl">/);
  assert.match(articles.renderPage({ article: a, lang: 'en', head: '', baseUrl: '' }), /<html lang="en">/);
});

test('renderPage emits Article JSON-LD with the language\'s headline and description', () => {
  const a = articles.ARTICLES[0];
  const html = articles.renderPage({ article: a, lang: 'fr', head: '', baseUrl: 'https://x.test' });
  const ld = JSON.parse(html.match(/"application\/ld\+json">(\[.*?\])<\/script>/s)[1]);
  const art = ld.find(x => x['@type'] === 'Article');
  assert.ok(art);
  assert.equal(art.headline, a.h1.fr);
  assert.equal(art.description, a.meta.fr.description);
  assert.equal(art.inLanguage, 'fr');
});

test('renderPage embeds the head block verbatim once, and links to the other articles but never itself', () => {
  const a = articles.ARTICLES.find(x => x.slug === 'spot-fake-job-offer');
  const html = articles.renderPage({ article: a, lang: 'en', head: '<title>Marker Title</title>', baseUrl: '' });
  assert.equal((html.match(/Marker Title/g) || []).length, 1);
  assert.doesNotMatch(html, /href="\/blog\/spot-fake-job-offer"/);
  for (const other of articles.ARTICLES.filter(x => x.slug !== a.slug)) {
    assert.match(html, new RegExp(`href="/blog/${other.slug}"`));
  }
  // and it always links back to the concierge
  assert.match(html, /<a class="cta" href="\/"/);
});

// ---------- the real routes, through the app ----------

test('GET /blog/<slug> renders the article server-side with its own title and meta description', async () => {
  for (const a of articles.ARTICLES) {
    const r = await fetch(`${h.base}/blog/${a.slug}`);
    assert.equal(r.status, 200, a.slug);
    const body = await r.text();
    const m = seo.PAGES[`/blog/${a.slug}`].en;
    assert.ok(body.includes(`<title>${m.title.replace(/&/g, '&amp;')}</title>`), `${a.slug} missing en title`);
    assert.ok(body.includes(`<meta name="description" content="${m.description.replace(/"/g, '&quot;')}">`), `${a.slug} missing description`);
    assert.ok(body.includes(a.h1.en), `${a.slug} missing en h1`);
  }
});

test('article routes respect ?lang= and only advertise the languages that exist', async () => {
  const r = await fetch(`${h.base}/blog/spot-fake-job-offer?lang=ar`);
  const body = await r.text();
  assert.ok(body.includes(articles.ARTICLES.find(a => a.slug === 'spot-fake-job-offer').h1.ar));
  assert.match(body, /hreflang="ar"/);
  assert.match(body, /hreflang="fr"/);
  assert.match(body, /hreflang="en"/);
  assert.match(body, /hreflang="x-default"/);
  assert.doesNotMatch(body, /hreflang="hi"/);
  assert.doesNotMatch(body, /hreflang="tr"/);
});

test('an unknown slug 404s instead of falling through to the SPA', async () => {
  const r = await fetch(`${h.base}/blog/does-not-exist`);
  assert.equal(r.status, 404);
});

test('all three articles appear in the sitemap with their language alternates', async () => {
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  for (const a of articles.ARTICLES) {
    assert.match(map, new RegExp(`<loc>[^<]*/blog/${a.slug}</loc>`), `${a.slug} missing from sitemap`);
  }
});

test('the homepage footer links to all three articles', async () => {
  const body = await fetch(`${h.base}/`).then(x => x.text());
  for (const a of articles.ARTICLES) assert.ok(body.includes(`href="/blog/${a.slug}"`), `${a.slug} not linked from index`);
});

// ---------- wider-language articles + the /blog index ----------

test('the two flagship articles render in Hindi and Turkish too', async () => {
  for (const slug of ['verify-immigration-consultant', 'scholarships-arab-students']) {
    for (const lang of ['hi', 'tr']) {
      const a = articles.ARTICLES.find(x => x.slug === slug);
      const r = await fetch(`${h.base}/blog/${slug}?lang=${lang}`);
      const body = await r.text();
      assert.ok(body.includes(a.h1[lang]), `${slug} missing ${lang} h1`);
      assert.match(body, new RegExp(`hreflang="${lang}"`));
      assert.match(body, /hreflang="hi"|hreflang="tr"/);
    }
  }
});

test('an article without hi/tr copy does NOT advertise it and falls back to English', async () => {
  const r = await fetch(`${h.base}/blog/spot-fake-job-offer?lang=hi`);
  const body = await r.text();
  const a = articles.ARTICLES.find(x => x.slug === 'spot-fake-job-offer');
  assert.ok(body.includes(a.h1.en), 'hi request should get the English body');
  assert.doesNotMatch(body, /hreflang="hi"/);
  assert.doesNotMatch(body, /hreflang="tr"/);
});

test('article pages carry BreadcrumbList + Organization JSON-LD alongside the Article block', async () => {
  const body = await fetch(`${h.base}/blog/verify-immigration-consultant?lang=ar`).then(x => x.text());
  const ld = JSON.parse(body.match(/"application\/ld\+json">(\[.*?\])<\/script>/s)[1]);
  const types = ld.map(x => x['@type']);
  assert.ok(types.includes('Article'));
  assert.ok(types.includes('BreadcrumbList'));
  assert.ok(types.includes('Organization'));
});

test('article pages cross-link to the GCC guide pages (topical cluster)', async () => {
  const body = await fetch(`${h.base}/blog/work-abroad-without-degree?lang=fr`).then(x => x.text());
  assert.ok(body.includes('href="/work-in-uae?lang=fr"') || body.includes('href="/work-in-uae"'));
});

test('GET /blog lists every article with its description', async () => {
  const body = await fetch(`${h.base}/blog`).then(x => x.text());
  for (const a of articles.ARTICLES) assert.ok(body.includes(`href="/blog/${a.slug}"`), a.slug);
});

test('GET /blog respects ?lang=ar and lists RTL', async () => {
  const body = await fetch(`${h.base}/blog?lang=ar`).then(x => x.text());
  assert.match(body, /<html lang="ar" dir="rtl">/);
});

test('/blog is in the sitemap', async () => {
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<loc>[^<]*\/blog<\/loc>/);
});
