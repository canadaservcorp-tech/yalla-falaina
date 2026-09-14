// The share bar is the only in-app growth surface, and the analytics tag it
// reports to is consent-gated: both live in the served shell, so both are
// asserted against the real response rather than the source file alone.
process.env.GA_MEASUREMENT_ID = 'G-TEST12345';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getApp } = require('./helpers/appHarness');
const analytics = require('../lib/analytics');

const h = getApp();
after(() => h.stop());

const SHELL = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const home = () => fetch(h.base + '/').then(r => r.text());

test('the page publishes the measurement id but requests no tag itself', async () => {
  const body = await home();
  assert.match(body, /window\.TP_GA_ID="G-TEST12345"/);
  assert.ok(!body.includes('<!--analytics-->'), 'marker left unconsumed');
  assert.ok(!/<script[^>]+googletagmanager\.com/.test(body), 'gtag.js requested before consent');
});

test('only a well-formed measurement id is published', () => {
  for (const [given, want] of Object.entries({ 'g-abc123': 'G-ABC123', 'UA-1-1': '', 'G-!!': '', '': '' })) {
    process.env.GA_MEASUREMENT_ID = given;
    assert.equal(analytics.measurementId(), want, given);
  }
  process.env.GA_MEASUREMENT_ID = 'G-TEST12345';
});

test('the consent bar is hidden until the visitor is asked, and a refusal loads nothing', () => {
  assert.match(SHELL, /#cookiebar \{[^}]*display: none/);
  assert.match(SHELL, /if \(c === 'no'\) return;/);
  assert.match(SHELL, /if \(answer === 'yes'\) loadAnalytics\(\);/);
  assert.match(SHELL, /gtag\('config', id, \{ anonymize_ip: true \}\)/);
});

test('the analytics origins the policy opens are all https', async () => {
  const csp = await fetch(h.base + '/').then(r => r.headers.get('content-security-policy'));
  assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
  for (const list of Object.values(analytics.ORIGINS)) {
    for (const o of list) assert.ok(o.startsWith('https://'), o);
  }
});

test('the share bar offers every channel and reports each one', async () => {
  const body = await home();
  for (const id of ['shareWhatsapp', 'shareFacebook', 'shareTelegram', 'shareCopy']) {
    assert.ok(body.includes(`id="${id}"`), id);
  }
  assert.match(SHELL, /wa\.me\/\?text=/);
  assert.match(SHELL, /facebook\.com\/sharer\/sharer\.php\?u=/);
  assert.match(SHELL, /t\.me\/share\/url\?url=/);
  assert.match(SHELL, /track\('share', \{ method: 'copy'/);
});

test('tracking is a no-op until consent has loaded gtag', () => {
  assert.match(SHELL, /function track\(name, params\) \{ if \(window\.gtag\)/);
});
