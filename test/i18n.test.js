// public/i18n.js holds the trilingual UI-chrome strings (see its own header
// comment for what's deliberately out of scope: server error text and
// provider-supplied honestyFlags). The one failure mode that actually matters
// for a dictionary like this is silent drift — someone adds an English string
// and forgets French or Arabic — so the parity test below is the real point
// of this file; the rest just locks in the lookup function's edge cases.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS, LANGS, isRTL, t, tErr } = require('../public/i18n.js');

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

// ---------- tErr — Roadmap Step 1's "map codes -> translated strings" half ----------
// The `code` field itself was already stamped on every 4xx/5xx JSON response
// (test/error-codes.test.js locks that in); this covers the mapping that was
// still missing, and the file's own no-drift test above doesn't reach this
// separate ERRORS table.

test('tErr() returns the right language for a known code', () => {
  assert.equal(tErr('en', 'ERR_PAYWALL'), 'A subscription is required to use the concierge.');
  assert.match(tErr('fr', 'ERR_PAYWALL'), /abonnement/);
  assert.match(tErr('ar', 'ERR_PAYWALL'), /الاشتراك/);
});

test('tErr() falls back to English for an unsupported language, and to null for an unknown or missing code', () => {
  assert.equal(tErr('de', 'ERR_PAYWALL'), tErr('en', 'ERR_PAYWALL'));
  assert.equal(tErr('en', 'ERR_THIS_CODE_DOES_NOT_EXIST'), null);
  assert.equal(tErr('en', undefined), null);
  assert.equal(tErr('en', ''), null);
});

test('every ERR_ code the seeker-facing routes can actually return has a translation in all 3 languages', () => {
  // Scan the real route source rather than hand-maintaining a list here — the
  // point is to catch the next `code: 'ERR_...'` someone adds to the API
  // without ever teaching the client to translate it (exactly the gap this
  // file closes for the codes that existed when it was written). ERRORS is
  // not re-exported (it's an implementation detail of tErr), so this reads
  // the module source directly for its key list instead of importing it.
  const routesDir = path.join(__dirname, '..', 'routes');
  const codesInUse = new Set();
  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    for (const m of src.matchAll(/code:\s*'([A-Z_]+)'/g)) codesInUse.add(m[1]);
  }
  assert.ok(codesInUse.size > 0, 'sanity check: the scan itself should find some codes');

  const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const mapped = new Set([...i18nSrc.matchAll(/^\s{4}(ERR_[A-Z_]+):\s*\{/gm)].map(m => m[1]));

  const missing = [...codesInUse].filter(c => !mapped.has(c));
  assert.deepEqual(missing, [], `these API error codes have no translation in public/i18n.js's ERRORS map: ${missing.join(', ')}`);

  // And every mapped code actually resolves in all 3 languages (catches a
  // typo'd key or a language missing from one entry, same drift concern as
  // the STRINGS parity test above).
  for (const code of mapped) {
    for (const lang of LANGS) assert.ok(tErr(lang, code), `${code} has no ${lang} translation`);
  }
});
