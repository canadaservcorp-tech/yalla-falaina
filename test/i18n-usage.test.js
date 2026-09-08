// A translated string only helps if something actually displays it. This
// codebase has already shipped this exact bug twice — resendGenericFallback
// and resendVerifyLink both existed translated in all 3 languages while
// index.html quietly used hardcoded English (or no data-i18n attribute) at
// their call site instead. test/error-i18n-wiring.test.js locks in the fix
// for one specific family of that bug (server error codes); this file is the
// general version — every STRINGS key must be referenced somewhere in
// public/index.html (via data-i18n, data-i18n-ph, or t('key')), and every
// reference in the page must point at a key that actually exists.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS } = require('../public/i18n.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function extractKeys(pattern) {
  return [...html.matchAll(pattern)].map(m => m[1]);
}

const dataI18n = extractKeys(/data-i18n="([a-zA-Z0-9_]+)"/g);
const dataI18nPh = extractKeys(/data-i18n-ph="([a-zA-Z0-9_]+)"/g);
const tCalls = extractKeys(/\bt\('([a-zA-Z0-9_]+)'/g);
const usedKeys = new Set([...dataI18n, ...dataI18nPh, ...tCalls]);

test('every data-i18n / data-i18n-ph / t(\'...\') reference in index.html points at a real STRINGS key', () => {
  const allKeys = new Set([...dataI18n, ...dataI18nPh, ...tCalls]);
  const missing = [...allKeys].filter(k => !(k in STRINGS.en));
  assert.deepEqual(missing, [], `index.html references i18n key(s) that don't exist: ${missing.join(', ')}`);
});

test('every translated STRINGS key is actually referenced somewhere in index.html — no silently-dead translations', () => {
  const allStringKeys = Object.keys(STRINGS.en);
  const unused = allStringKeys.filter(k => !usedKeys.has(k));
  assert.deepEqual(unused, [], `these i18n.js keys are translated but never displayed by index.html: ${unused.join(', ')} — ` +
    `either wire them up (the resendGenericFallback / resendVerifyLink bugs this test exists to catch) or remove them`);
});

test('sanity check: the extraction itself actually finds a realistic number of references', () => {
  // Guards against a regex typo silently making both tests above vacuously pass.
  assert.ok(usedKeys.size > 50, `expected many i18n keys in use, found only ${usedKeys.size} — the scan may be broken`);
});
