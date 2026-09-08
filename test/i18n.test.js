// public/i18n.js holds the trilingual UI-chrome strings (see its own header
// comment for what's deliberately out of scope: server error text and
// provider-supplied honestyFlags). The one failure mode that actually matters
// for a dictionary like this is silent drift — someone adds an English string
// and forgets French or Arabic — so the parity test below is the real point
// of this file; the rest just locks in the lookup function's edge cases.
const { test } = require('node:test');
const assert = require('node:assert');
const { STRINGS, LANGS, isRTL, t } = require('../public/i18n.js');

test('en, fr, and ar all exist and cover the same key set — no silent drift', () => {
  assert.deepEqual(LANGS.sort(), ['ar', 'en', 'fr']);
  const enKeys = Object.keys(STRINGS.en).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), enKeys, `${lang} is missing or has extra keys vs. en`);
  }
});

test('no translation is an empty or placeholder string', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} should be a string`);
      assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test('t() returns the right language for a known key', () => {
  assert.equal(t('en', 'sendBtn'), 'Send');
  assert.equal(t('fr', 'sendBtn'), 'Envoyer');
  assert.equal(t('ar', 'sendBtn'), 'إرسال');
});

test('t() falls back to English for an unsupported language code', () => {
  assert.equal(t('de', 'sendBtn'), 'Send');
  assert.equal(t(undefined, 'sendBtn'), 'Send');
});

test('t() never throws on an unknown key — falls back to the key itself', () => {
  assert.equal(t('en', 'thisKeyDoesNotExist'), 'thisKeyDoesNotExist');
  assert.equal(t('ar', 'thisKeyDoesNotExist'), 'thisKeyDoesNotExist');
});

test('t() interpolates {vars} into the translated string', () => {
  assert.equal(t('en', 'subActiveRenews', { date: '2026-10-01' }), 'Basic — active (renews 2026-10-01)');
  assert.equal(t('fr', 'subActiveRenews', { date: '2026-10-01' }), 'Basique — actif (renouvellement le 2026-10-01)');
  assert.ok(t('ar', 'subActiveRenews', { date: '2026-10-01' }).includes('2026-10-01'));
});

test('isRTL is true only for Arabic', () => {
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('en'), false);
  assert.equal(isRTL('fr'), false);
  assert.equal(isRTL(undefined), false);
});
