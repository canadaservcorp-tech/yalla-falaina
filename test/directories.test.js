const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

// ---------- lib/directories.js ----------

test('the study directory page renders real rows with official source links, never invented', async () => {
  h.mock.__set('study_opportunities', { data: [{
    kind: 'scholarship', title: 'Türkiye Bursları', institution: 'Türkiye Scholarships',
    country: 'Turkey', city: 'Istanbul', degree_level: 'undergraduate',
    tuition_note: 'Full tuition + stipend', funding_coverage_pct: 100,
    eligibility_note: 'Under 21 for bachelor', deadline: '2026-02-20', source_url: 'https://www.turkiyeburslari.gov.tr',
  }], error: null });
  const body = await fetch(`${h.base}/study-opportunities`).then(x => x.text());
  assert.ok(body.includes('Türkiye Bursları'));
  assert.ok(body.includes('href="https://www.turkiyeburslari.gov.tr"'));
  assert.ok(body.includes('Scholarship'));
  assert.ok(body.includes('(100%'));
});

test('the medical providers page renders real rows with specialties and contact', async () => {
  h.mock.__set('medical_treatment_providers', { data: [{
    hospital_name: 'Memorial Şişli', country: 'Turkey', city: 'Istanbul',
    specialties: 'cardiac surgery, oncology', price_range_note: 'published self-pay rates',
    contact_email: 'intl@memorial.com.tr', contact_phone: '+90 212', source_url: 'https://www.memorial.com.tr',
  }], error: null });
  const body = await fetch(`${h.base}/medical-providers`).then(x => x.text());
  assert.ok(body.includes('Memorial'));
  assert.ok(body.includes('cardiac surgery'));
  assert.ok(body.includes('intl@memorial.com.tr'));
  assert.ok(body.includes('href="https://www.memorial.com.tr"'));
});

test('directory pages render Arabic RTL chrome on ?lang=ar', async () => {
  h.mock.__set('study_opportunities', { data: [], error: null });
  const body = await fetch(`${h.base}/study-opportunities?lang=ar`).then(x => x.text());
  assert.match(body, /<html lang="ar" dir="rtl">/);
  assert.ok(body.includes('برامج دراسية'));
});

test('directory pages only advertise ar/fr/en hreflang and link related articles', async () => {
  h.mock.__set('study_opportunities', { data: [], error: null });
  const body = await fetch(`${h.base}/study-opportunities?lang=fr`).then(x => x.text());
  assert.match(body, /hreflang="ar"/);
  assert.doesNotMatch(body, /hreflang="hi"/);
  assert.ok(body.includes('href="/blog/scholarships-arab-students'), 'missing article cross-link');
});

test('both directory pages appear in the sitemap', async () => {
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<loc>[^<]*\/study-opportunities<\/loc>/);
  assert.match(map, /<loc>[^<]*\/medical-providers<\/loc>/);
});

test('per-country study page filters rows and names the country', async () => {
  h.mock.__set('study_opportunities', { data: [
    { kind: 'scholarship', title: 'Türkiye Bursları', country: 'Turkey', source_url: 'https://tb.gov.tr' },
    { kind: 'program', title: 'KAUST Fellow', country: 'Saudi Arabia', source_url: 'https://kaust.edu.sa' },
  ], error: null });
  const body = await fetch(`${h.base}/study-opportunities/turkey`).then(x => x.text());
  assert.ok(body.includes('Türkiye Bursları'));
  assert.ok(!body.includes('KAUST Fellow'), 'other-country rows must not appear');
  assert.ok(body.includes('Programs and scholarships in Turkey'));
});

test('unknown study country slugs redirect to the index page', async () => {
  const res = await fetch(`${h.base}/study-opportunities/mars`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/study-opportunities$/);
});

test('study country pages appear in the sitemap with localized meta', async () => {
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<loc>[^<]*\/study-opportunities\/turkey<\/loc>/);
  assert.match(map, /<loc>[^<]*\/study-opportunities\/south-korea<\/loc>/);
});

test('directory pages emit ItemList JSON-LD over real rows', async () => {
  h.mock.__set('study_opportunities', { data: [
    { kind: 'scholarship', title: 'MEXT', country: 'Japan', source_url: 'https://mext.go.jp' },
  ], error: null });
  const body = await fetch(`${h.base}/study-opportunities/japan`).then(x => x.text());
  assert.ok(body.includes('"@type":"ItemList"'));
  assert.ok(body.includes('"name":"MEXT"'));
  assert.ok(body.includes('"url":"https://mext.go.jp"'));
});

test('/faq renders real Q&A with FAQPage JSON-LD and joins the sitemap', async () => {
  const body = await fetch(`${h.base}/faq`).then(x => x.text());
  assert.ok(body.includes('Frequently asked questions'));
  assert.ok(body.includes('"@type":"FAQPage"'));
  assert.ok(body.includes('"@type":"Question"'));
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<loc>[^<]*\/faq<\/loc>/);
});

test('/faq renders Arabic on ?lang=ar', async () => {
  const body = await fetch(`${h.base}/faq?lang=ar`).then(x => x.text());
  assert.match(body, /<html lang="ar" dir="rtl">/);
  assert.ok(body.includes('الأسئلة الشائعة'));
});

test('the IndexNow key file is served at /<key>.txt', async () => {
  const { INDEXNOW_KEY } = require('../lib/indexnow');
  const body = await fetch(`${h.base}/${INDEXNOW_KEY}.txt`).then(x => x.text());
  assert.equal(body.trim(), INDEXNOW_KEY);
});

test('/community renders real groups and accommodation, states they are community posts', async () => {
  h.mock.__set('community_groups', { data: [{
    country: 'Germany', city: 'Berlin', platform: 'whatsapp',
    name: 'Lebanese in Berlin', url: 'https://chat.whatsapp.com/abc', language: 'ar',
  }], error: null });
  h.mock.__set('accommodation_listings', { data: [{
    type: 'roommate', country: 'Germany', city: 'Berlin',
    budget_note: '€400/mo', description: 'Room in shared flat', contact: 'whatsapp +49…', expires_at: null,
  }], error: null });
  const body = await fetch(`${h.base}/community`).then(x => x.text());
  assert.ok(body.includes('Lebanese in Berlin'));
  assert.ok(body.includes('href="https://chat.whatsapp.com/abc"'));
  assert.ok(body.includes('€400/mo'));
  assert.ok(body.includes('community posts'), 'must disclose these are unverified posts');
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<loc>[^<]*\/community<\/loc>/);
});

test('sitemap entries carry lastmod freshness dates', async () => {
  const map = await fetch(`${h.base}/sitemap.xml`).then(x => x.text());
  assert.match(map, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test('unknown paths return 404 status but still serve the app shell (no soft-404)', async () => {
  const r = await fetch(`${h.base}/this-page-does-not-exist-xyz`);
  assert.equal(r.status, 404);
  const body = await r.text();
  assert.match(body, /<html/);
});

test('known indexable paths keep their 200', async () => {
  const r = await fetch(`${h.base}/faq`);
  assert.equal(r.status, 200);
});
