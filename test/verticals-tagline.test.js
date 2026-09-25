// Hicham's ask: the three verticals (study/treatment/work+immigration) as
// Arabic phrases paired with their English translation, shown right after
// the "Yalla Nsafer" title -- and, per his own words, "will appear somewhere
// in website all the time," i.e. static markup like .subtitle above it, not
// gated behind data-i18n/?lang= the way most of the page's copy is. Static
// checks against the raw HTML, same pattern as
// test/mobile-chat-layout.test.js, since this is plain markup/CSS with no
// server round-trip to exercise through the app harness.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const taglineAt = html.indexOf('class="verticals-tagline"');
const controlsAt = html.indexOf('class="controls"', taglineAt);
const taglineBlock = html.slice(taglineAt, controlsAt);

test('the three verticals appear right after the "Yalla Nsafer" title, each with its English translation', () => {
  const titleAt = html.indexOf('<h1>Yalla Nsafer — يلا نسافر</h1>');
  assert.ok(titleAt > -1 && taglineAt > -1 && controlsAt > -1);
  assert.ok(titleAt < taglineAt, 'the tagline block should come after the title, not before it');

  assert.match(taglineBlock, /للدراسة في الخارج والمنح التعليمية/);
  assert.match(taglineBlock, /For studying abroad and educational scholarships/);
  assert.match(taglineBlock, /للعلاج في الخارج، بثقة وأمان/);
  assert.match(taglineBlock, /For treatment abroad, with trust and safety/);
  assert.match(taglineBlock, /للعمل والهجرة، خطوة بخطوة معك/);
  assert.match(taglineBlock, /For work and immigration, step by step with you/);
});

test('the tagline block is static markup, not gated behind a data-i18n key (it should show regardless of ?lang=, like .subtitle above it)', () => {
  assert.doesNotMatch(taglineBlock, /data-i18n/);
});

test('each of the three lines carries dir="auto" so its own Arabic-first text resolves right-to-left independent of the page\'s overall lang/dir', () => {
  const lines = taglineBlock.match(/<div class="line" dir="auto">.*?<\/div>/g) || [];
  assert.strictEqual(lines.length, 3, 'expected exactly 3 tagline lines, each with dir="auto"');
});

test('the tagline block sits inside the header, alongside the existing subtitle, not somewhere unrelated in the page', () => {
  const headerBlock = html.match(/<header>[\s\S]*?<\/header>/)[0];
  assert.match(headerBlock, /class="subtitle"/);
  assert.match(headerBlock, /class="verticals-tagline"/);
});
