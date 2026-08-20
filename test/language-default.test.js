const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('the app state starts in French', () => {
  assert.match(ui, /const S = \{ lang:'fr'/);
});

test('a language choice lasts for the visit only, so every visit opens in French', () => {
  assert.match(ui, /sessionStorage\.setItem\('tp_lang'/);
  assert.match(ui, /sessionStorage\.getItem\('tp_lang'/);
  // an English choice saved by an older build must not outlive the visit either
  assert.match(ui, /localStorage\.removeItem\('tp_lang'\)/);
  assert.ok(!/localStorage\.setItem\('tp_lang'/.test(ui), 'the language must not persist across visits');
});

test('English is still reachable, by the switch or by ?lang=en', () => {
  assert.match(ui, /setLang\('en'\)/);
  assert.match(ui, /\[asked,saved\]\.includes\('en'\)\?'en':'fr'/);
});

test('the seeker can search by keyword on both the hero and the results toolbar', () => {
  assert.match(ui, /id="fq"/);
  assert.match(ui, /id="rq"/);
  assert.match(ui, /qs\.set\('q',kw\)/);
});

test('a keyword and a picked service never both apply', () => {
  assert.match(ui, /function clearService\(\)/);
  assert.match(ui, /function clearKeyword\(\)/);
  assert.match(ui, /id="fservice" onchange="clearKeyword\(\)"/);
});

test('the keyword labels exist in both languages', () => {
  for (const key of ['kw:', 'kwph:', 'kwhint:']) {
    assert.equal(ui.split(key).length - 1, 2, key + ' must be defined for fr and en');
  }
});
