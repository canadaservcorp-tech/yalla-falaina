// Google Analytics must stay off until the visitor accepts, and off entirely without a
// configured measurement id. This file boots the app WITH an id (the harness is a singleton
// per process, so the disabled case is covered by unit-testing lib/analytics directly).
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.GA_MEASUREMENT_ID = 'G-TEST12345';
process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';

const analytics = require('../lib/analytics');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const SHELL = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('only a well-formed measurement id is published', () => {
  const cases = { 'G-ABC123': 'G-ABC123', 'g-abc123': 'G-ABC123', '': '', 'UA-12345-1': '', 'G-!!': '', 'nonsense': '' };
  for (const [given, want] of Object.entries(cases)) {
    process.env.GA_MEASUREMENT_ID = given;
    assert.equal(analytics.measurementId(), want, given);
  }
  process.env.GA_MEASUREMENT_ID = 'G-TEST12345';
});

test('no measurement id means no analytics at all', () => {
  delete process.env.GA_MEASUREMENT_ID;
  assert.equal(analytics.head(), '');
  process.env.GA_MEASUREMENT_ID = 'G-TEST12345';
});

test('the served page publishes the id but loads no tag itself', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  assert.match(body, /window\.TP_GA_ID="G-TEST12345"/);
  // the marker must be consumed, and nothing may fetch gtag.js before consent
  assert.ok(!body.includes('<!--analytics-->'), 'marker left in the response');
  assert.ok(!/<script[^>]+googletagmanager\.com/.test(body), 'gtag.js requested without consent');
});

test('health reports whether analytics is configured', async () => {
  const j = await fetch(h.base + '/api/health').then(r => r.json());
  assert.equal(j.analytics, true);
});

test('the policy allows Google Analytics only when it is configured', async () => {
  const csp = await fetch(h.base + '/').then(r => r.headers.get('content-security-policy'));
  assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/www\.google-analytics\.com/);
  for (const list of Object.values(analytics.ORIGINS)) {
    for (const o of list) assert.ok(o.startsWith('https://'), o);
  }
});

test('the consent bar is hidden until the visitor is asked', () => {
  assert.match(SHELL, /class="cookiebar" id="cookiebar"/);
  assert.match(SHELL, /\.cookiebar\{[^}]*display:none/);
  assert.match(SHELL, /function startAnalytics\(\)\{\s*\n\s*if\(!window\.TP_GA_ID\) return;/);
});

test('accepting loads the tag, refusing does not, and the answer is remembered', () => {
  assert.match(SHELL, /localStorage\.setItem\('tp_analytics',answer\)/);
  assert.match(SHELL, /if\(answer==='yes'\) loadAnalytics\(\)/);
  assert.match(SHELL, /if\(c==='no'\) return;/);
  assert.match(SHELL, /gtag\('config', id, \{ anonymize_ip:true \}\)/);
});

test('the consent copy exists in French and in English', () => {
  for (const s of ['Google Analytics', 'Accepter', 'Refuser', 'Accept', 'Decline']) {
    assert.ok(SHELL.includes(s), s);
  }
  assert.match(SHELL, /cookietxt:'Nous aimerions mesurer/);
  assert.match(SHELL, /cookietxt:'We would like to measure/);
});

test('the privacy policy documents the consent-gated analytics', () => {
  const legal = fs.readFileSync(path.join(__dirname, '..', 'public', 'legal.js'), 'utf8');
  assert.match(legal, /Google Analytics \(Google Ireland\/LLC\)/);
  assert.ok(!/aucun t[eé]moin.*ni de traceurs tiers/i.test(legal), 'stale "no third-party trackers" claim');
  assert.ok(!/no advertising cookies and no third-party trackers/.test(legal), 'stale English claim');
});
