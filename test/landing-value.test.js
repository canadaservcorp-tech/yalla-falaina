// The signed-out landing must keep selling the product: the value bullets,
// the honest price line, and the sample-question chips that hand a new
// seeker a first ask. Pins the structure and the chip -> composer handoff.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS, LANGS } = require('../public/i18n.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const script = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));

test('the landing shows a value block below the sign-in card', () => {
  const authWrap = html.slice(html.indexOf('id="authWrap"'), html.indexOf('<main id="appMain"'));
  assert.ok(authWrap.indexOf('id="authCard"') < authWrap.indexOf('id="landingValue"'),
    'the value block must sit under the card, not above it');
  for (const key of ['landingBullet1', 'landingBullet2', 'landingBullet3', 'landingPrice']) {
    assert.ok(authWrap.includes(`data-i18n="${key}"`), `missing ${key}`);
  }
});

test('three sample-question chips are wired and translated in all five languages', () => {
  const wrap = html.slice(html.indexOf('id="sampleQs"'), html.indexOf('</div>', html.indexOf('id="sampleQs"')));
  const chips = wrap.match(/class="sampleQ"/g) || [];
  assert.equal(chips.length, 3);
  for (const lang of LANGS) {
    for (const key of ['sampleQsLabel', 'sampleQ1', 'sampleQ2', 'sampleQ3']) {
      assert.ok(STRINGS[lang][key], `${lang} is missing ${key}`);
    }
  }
});

test('a chip click stashes the question and switches to create-account; enter() drops it in the composer', () => {
  assert.match(script, /sessionStorage\.setItem\('yf_pending_q', b\.textContent\.trim\(\)\)/);
  const chipAt = script.indexOf("sessionStorage.setItem('yf_pending_q'");
  assert.match(script.slice(chipAt, chipAt + 400), /setMode\('register'\)/);
  assert.match(script, /sessionStorage\.removeItem\('yf_pending_q'\); \$\('messageInput'\)\.value = pendingQ/);
});

test('on phones the landing scrolls from the top so the cookiebar never covers Sign in', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  assert.match(mobile, /#authWrap\s*\{[^}]*justify-content:\s*flex-start/);
  // and the 5-line tagline collapses to one on a phone
  assert.match(mobile, /\.verticals-tagline \.line:nth-child\(n\+2\)\s*\{[^}]*display:\s*none/);
});
