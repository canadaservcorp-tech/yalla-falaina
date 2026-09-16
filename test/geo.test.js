const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());
const geo = require('../lib/geo');

const LANGS = ['en', 'fr', 'ar', 'hi', 'tr'];
const req = (headers = {}, ip = null) => ({ headers, ip });

test('the countries the operator named get the language they asked for', () => {
  for (const c of ['IQ', 'EG', 'LB', 'SY']) assert.equal(geo.COUNTRY_LANG[c], 'ar', c);
  assert.equal(geo.COUNTRY_LANG.TN, 'fr');
  for (const c of ['SA', 'AE', 'KW', 'QA', 'BH', 'OM']) assert.equal(geo.COUNTRY_LANG[c], 'en', c);
  assert.equal(geo.COUNTRY_LANG.IN, 'hi');
  assert.equal(geo.COUNTRY_LANG.TR, 'tr');
});

test('country beats Accept-Language, because phones in this market report en', () => {
  // the exact case this feature exists for: an Egyptian handset set to English
  assert.equal(geo.pickLang(req({ 'cf-ipcountry': 'EG', 'accept-language': 'en-US,en;q=0.9' }), LANGS), 'ar');
  assert.equal(geo.pickLang(req({ 'cf-ipcountry': 'ae', 'accept-language': 'ar' }), LANGS), 'en');
});

test('a country with no rule of its own gets English', () => {
  assert.equal(geo.pickLang(req({ 'cf-ipcountry': 'CA' }), LANGS), 'en');
});

test('Accept-Language decides only when the country is unknown', () => {
  assert.equal(geo.pickLang(req({ 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }), LANGS), 'fr');
  assert.equal(geo.pickLang(req({ 'accept-language': 'en;q=0.4,ar;q=0.9' }), LANGS), 'ar');
  assert.equal(geo.pickLang(req({ 'accept-language': 'de,ja' }), LANGS), null);
  assert.equal(geo.pickLang(req({}), LANGS), null);
});

test('a junk country header is ignored rather than trusted', () => {
  assert.equal(geo.pickLang(req({ 'cf-ipcountry': 'XXXX', 'accept-language': 'ar' }), LANGS), 'ar');
  assert.equal(geo.pickLang(req({ 'cf-ipcountry': '', 'accept-language': 'ar' }), LANGS), 'ar');
});

test('the IP database resolves real addresses in the target markets', () => {
  assert.equal(geo.country(req({}, '41.44.0.1')), 'EG');
  assert.equal(geo.country(req({}, '::ffff:8.8.8.8')), 'US');
  assert.equal(geo.country(req({}, 'not-an-ip')), null);
  assert.equal(geo.country(req({}, '::1')), null);
});

test('the served page is Arabic and RTL for an Arabic-reading country', async () => {
  const body = await fetch(h.base + '/', { headers: { 'cf-ipcountry': 'EG' } }).then(r => r.text());
  assert.match(body, /<html lang="ar"[^>]*dir="rtl"/);
  assert.match(body, /<title>يلا نسافر/);
});

test('India lands on the Hindi page', async () => {
  const body = await fetch(h.base + '/', { headers: { 'cf-ipcountry': 'IN' } }).then(r => r.text());
  assert.match(body, /<html lang="hi"/);
  assert.match(body, /<title>यल्ला नसाफ़िर/);
  assert.doesNotMatch(body, /<html[^>]*dir="rtl"/);
});

test('Turkey lands on the Turkish page', async () => {
  const body = await fetch(h.base + '/', { headers: { 'cf-ipcountry': 'TR' } }).then(r => r.text());
  assert.match(body, /<html lang="tr"/);
  assert.match(body, /<title>Yalla Nsafer — Seyahatiniz/);
  assert.doesNotMatch(body, /<html[^>]*dir="rtl"/);
});

test('the server stamps a local-currency price label for the country', async () => {
  const cases = { AE: 'AED 92', SA: 'SAR 94', IN: '₹2,100', US: 'USD 25' };
  for (const [cc, price] of Object.entries(cases)) {
    const body = await fetch(h.base + '/', { headers: { 'cf-ipcountry': cc } }).then(r => r.text());
    assert.ok(body.includes(`data-sub-price="${price}"`), `${cc} expected ${price}`);
  }
});

test('the paywall copy renders the stamped price through the {price} placeholder', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const rows = src.match(/paywallText: '[^']*'|paywallText: "[^"]*"/g);
  assert.equal(rows.length, 5);
  for (const r of rows) assert.ok(r.includes('{price}'), `${r} lost the price placeholder`);
});

test('the geo-picked page still canonicalises to the bare URL', async () => {
  const res = await fetch(h.base + '/', { headers: { 'cf-ipcountry': 'TN' } });
  const body = await res.text();
  assert.match(body, /<html lang="fr"/);
  const canonical = (body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  assert.ok(canonical && !canonical.includes('lang='), canonical);
  assert.match(res.headers.get('vary') || '', /Accept-Language/i);
});

test('an explicit ?lang= overrides the country and owns the canonical', async () => {
  const body = await fetch(h.base + '/?lang=en', { headers: { 'cf-ipcountry': 'EG' } }).then(r => r.text());
  assert.match(body, /<html lang="en"/);
  const body2 = await fetch(h.base + '/?lang=ar', { headers: { 'cf-ipcountry': 'SA' } }).then(r => r.text());
  assert.match(body2, /<html lang="ar"[^>]*dir="rtl"/);
  assert.match(body2, /<link rel="canonical" href="[^"]+\?lang=ar"/);
});

test('the client only inherits the server language when the visitor has no choice stored', () => {
  const fs = require('fs');
  const page = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const order = page.indexOf("const currentLang = i18n.LANGS.includes(qsLang)");
  assert.ok(order > 0, 'language pick moved — re-check the precedence below');
  const block = page.slice(order, order + 400);
  assert.ok(block.indexOf("localStorage.getItem('yf_lang')") < block.indexOf('document.documentElement.lang'),
    'stored visitor choice must be preferred over the server/geo guess');
});
