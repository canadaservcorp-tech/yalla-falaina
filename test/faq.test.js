// The FAQ quotes prices and policy in prose, so it drifts silently when the code changes.
// These tests pin every number in it to the module that actually charges it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rules = require('../lib/booking-rules');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// routes/boost.js opens a Supabase client on require, so read its price table as text
const boostAmounts = [...read('routes/boost.js').matchAll(/amount:\s*([\d.]+)/g)].map(m => Number(m[1]));

const sandbox = { window: {} };
vm.runInNewContext(read('public/faq.js'), sandbox);
const FAQ = sandbox.window.FAQ;
const text = lang => FAQ[lang].map(([q, a]) => `${q} ${a}`).join('\n');

test('both languages answer the same questions', () => {
  assert.equal(FAQ.fr.length, FAQ.en.length);
  assert.ok(FAQ.fr.length >= 15);
  for (const lang of ['fr', 'en'])
    for (const [q, a] of FAQ[lang]) {
      assert.ok(q && q.length > 5, `short question: ${q}`);
      assert.ok(a && a.length > 40, `short answer to: ${q}`);
    }
});

test('the quoted subscription price is the one the UI charges', () => {
  const ui = read('public/index.html');
  // pulled from the checkout button so the FAQ can't quote a stale price
  assert.ok(ui.includes('5,49 $/mois les 3 premiers mois, puis 10,66 $/mois'));
  assert.ok(text('fr').includes('5,49 $') && text('fr').includes('10,66 $'));
  assert.ok(text('en').includes('$5.49') && text('en').includes('$10.66'));
});

test('every boost plan price appears in both languages', () => {
  assert.ok(boostAmounts.length >= 4, 'no boost prices found in routes/boost.js');
  for (const amount of boostAmounts) {
    const en = `$${amount.toFixed(2)}`;
    const fr = `${amount.toFixed(2).replace('.', ',')} $`;
    assert.ok(text('en').includes(en), `missing ${en} in EN`);
    assert.ok(text('fr').includes(fr), `missing ${fr} in FR`);
  }
});

test('the deposit and cancellation answers match booking-rules', () => {
  const pct = Math.round(rules.RATE * 100);
  const min = rules.MIN_CENTS / 100, max = rules.MAX_CENTS / 100;
  const freeCancelH = rules.FREE_CANCEL_MS / 3600e3;
  const authH = rules.AUTH_WINDOW_MS / 3600e3;
  assert.ok(text('fr').includes(`${pct} %`));
  assert.ok(text('en').includes(`${pct}%`));
  for (const lang of ['fr', 'en']) {
    const s = text(lang);
    assert.ok(s.includes(String(min)) && s.includes(String(max)), `deposit bounds missing in ${lang}`);
    assert.ok(s.includes(`${freeCancelH} h`) || s.includes(`${freeCancelH}h`), `cancel window missing in ${lang}`);
    assert.ok(s.includes(`${authH} h`) || s.includes(`${authH}h`), `auth window missing in ${lang}`);
  }
});

test('the photo answers describe review, not an instant ban', () => {
  assert.ok(/mod\u00e9rateur/i.test(text('fr')));
  assert.ok(/moderator/i.test(text('en')));
  // chat photo cap is enforced in routes/photos.js
  assert.ok(read('routes/photos.js').includes('>= 3'));
  assert.ok(text('fr').includes('3 photos') && text('en').includes('3 photos'));
});

test('the FAQ is served and cached as part of the app shell', () => {
  assert.ok(read('public/sw.js').includes("'/faq.js'"));
  const ui = read('public/index.html');
  assert.ok(ui.includes('src="/faq.js"'));
  assert.ok(ui.includes('id="view-faq"'));
  assert.ok(ui.includes('openFaq()'));
});
