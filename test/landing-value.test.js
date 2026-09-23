// The "Why Yalla Nsafer" pitch (bullets, price line, sample-question chips)
// lives inside the "..." menu — Hicham's call: the landing stays clean, the
// pitch is one tap away. Pins the menu placement and both chip paths
// (signed-out → Create account stash; signed-in → straight to composer).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS, LANGS } = require('../public/i18n.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const script = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));

test('the value block is inside the "..." menu, not on the landing itself', () => {
  const menu = html.slice(html.indexOf('id="ctaAsideBody"'), html.indexOf('</header>'));
  assert.ok(menu.includes('id="whySection"'), 'whySection must live in the dropdown');
  for (const key of ['whyHeading', 'landingBullet1', 'landingBullet2', 'landingBullet3', 'landingPrice']) {
    assert.ok(menu.includes(`data-i18n="${key}"`), `menu is missing ${key}`);
  }
  // and NOT between the auth card and appMain -- the landing is just the card
  const landing = html.slice(html.indexOf('id="authWrap"'), html.indexOf('<main id="appMain"'));
  assert.ok(!landing.includes('id="whySection"') && !landing.includes('id="landingValue"'),
    'the landing itself must stay clean');
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

test('a chip click sends the question to the right place for each auth state', () => {
  assert.match(script, /sessionStorage\.setItem\('yf_pending_q', q\)/);
  const chipAt = script.indexOf("sessionStorage.setItem('yf_pending_q'");
  assert.match(script.slice(chipAt, chipAt + 400), /setMode\('register'\)/, 'signed-out path switches to Create account');
  // signed-in path: straight into the composer, menu closes
  assert.match(script, /\$\('appMain'\)\.style\.display === 'flex'/);
  assert.match(script, /\$\('messageInput'\)\.value = q;/);
  assert.match(script, /classList\.remove\('ctaMenuOpen'\)/);
  // enter() consumes the stash on fresh sign-in
  assert.match(script, /sessionStorage\.removeItem\('yf_pending_q'\); \$\('messageInput'\)\.value = pendingQ/);
});

test('concierge replies carry one-tap suggestion chips keyed by server context', () => {
  // server names the pool; client renders the localized wording
  for (const pool of ['intake', 'jobs', 'study', 'medical', 'work']) {
    assert.match(script, new RegExp(`${pool}:\\s*\\(\\) => \\[t\\('sugg`), `missing pool ${pool}`);
  }
  assert.match(script, /addSuggestions\(data\.suggest\)/);
  assert.match(script, /b\.onclick = \(\) => \{ row\.remove\(\); inputEl\.value = b\.textContent; sendMessage\(\); \}/);
  for (const lang of LANGS) {
    for (const n of [1, 2, 3])
      for (const p of ['Intake', 'Jobs', 'Study', 'Medical', 'Work'])
        assert.ok(STRINGS[lang][`sugg${p}${n}`], `${lang} missing sugg${p}${n}`);
  }
});

test('a typing bubble shows while the concierge thinks', () => {
  assert.match(script, /className = 'msg bot typing'/);
  assert.match(script, /const typing = showTyping\(\);/);
  assert.match(style, /\.msg\.typing span \{[^}]*animation: typeBlink/);
});

test('on phones the landing scrolls from the top so the cookiebar never covers Sign in', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  assert.match(mobile, /#authWrap\s*\{[^}]*justify-content:\s*flex-start/);
  // and the 5-line tagline collapses to one on a phone
  assert.match(mobile, /\.verticals-tagline \.line:nth-child\(n\+2\)\s*\{[^}]*display:\s*none/);
});
