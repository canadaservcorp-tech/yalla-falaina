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
