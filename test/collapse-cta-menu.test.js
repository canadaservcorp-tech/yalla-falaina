// Hicham's ask (Sept 2026, second decluttering pass): the fixed Contact/
// Promote/Instagram/Express-Entry/share-bar widget (#ctaAside) AND the two
// pre-login "Working in the Gulf" / "Guides" link blocks that used to live
// inside #authCard together read as one crowded screen. All of it now folds
// behind a single "..." toggle, closed by default, on the right edge of the
// screen -- the only thing visible until a visitor actually opens it.
// Static checks against the raw HTML, same pattern as
// test/google-password-hint.test.js, since this is markup/CSS/script wiring
// with no server round-trip to exercise through the app harness.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('the toggle is a "..." button, closed by default, anchored to the right edge', () => {
  const toggleAt = html.indexOf('id="ctaAsideToggle"');
  assert.ok(toggleAt > -1);
  const toggleEl = html.slice(html.lastIndexOf('<button', toggleAt), html.indexOf('</button>', toggleAt) + '</button>'.length);
  assert.match(toggleEl, /aria-expanded="false"/, 'must start closed');
  assert.match(toggleEl, /aria-controls="ctaAsideBody"/);
  assert.match(toggleEl, />⋮</, 'the three-dot glyph itself');
  // right edge, not the old left-corner position
  const asideRule = style.match(/#ctaAside\s*\{[^}]*\}/)[0];
  assert.match(asideRule, /inset-inline-end/, 'anchored to the right (logical) edge, not inset-inline-start');
});

test('#ctaAsideBody is hidden until opened, and holds every relocated control', () => {
  const bodyRule = style.match(/#ctaAsideBody\s*\{[^}]*\}/)[0];
  assert.match(bodyRule, /display:\s*none/, 'closed by default');
  assert.match(style, /#ctaAsideBody\.open\s*\{[^}]*display:\s*flex/, 'an .open class is what reveals it');

  const bodyStart = html.indexOf('id="ctaAsideBody"');
  const bodyEnd = html.indexOf('\n</div>\n\n<div id="cookiebar"');
  assert.ok(bodyStart > -1 && bodyEnd > bodyStart);
  const body = html.slice(bodyStart, bodyEnd);
  for (const id of ['contactForm', 'showContact', 'showPromote', 'shareBar', 'gccGuideLinks', 'guideLinks']) {
    assert.ok(body.includes(`id="${id}"`), `#${id} must live inside #ctaAsideBody`);
  }
  assert.match(body, /instagram\.com\/yalla\.nsafir/, 'the Instagram link must live inside #ctaAsideBody');
  assert.match(body, /express-entry-draws/, 'the Express Entry link must live inside #ctaAsideBody');
});

test('the Gulf/Guides link blocks are gone from #authCard -- they only exist now inside #ctaAsideBody', () => {
  const authCardStart = html.indexOf('<div id="authCard">');
  const authCardEnd = html.indexOf('\n</div>\n\n<main id="appMain"');
  assert.ok(authCardStart > -1 && authCardEnd > authCardStart);
  const authCard = html.slice(authCardStart, authCardEnd);
  assert.doesNotMatch(authCard, /id="gccGuideLinks"/, 'moved out of the scrolling sign-in card');
  assert.doesNotMatch(authCard, /id="guideLinks"/, 'moved out of the scrolling sign-in card');
});

test('clicking the toggle flips the .open class and aria-expanded on #ctaAsideBody / #ctaAsideToggle', () => {
  assert.match(script, /\$\('ctaAsideToggle'\)\.onclick = \(\) => \{/);
  const handlerAt = script.indexOf("$('ctaAsideToggle').onclick");
  const handler = script.slice(handlerAt, script.indexOf('};', handlerAt) + 2);
  assert.match(handler, /classList\.contains\('open'\)/);
  assert.match(handler, /classList\.toggle\('open', open\)/);
  assert.match(handler, /setAttribute\('aria-expanded', String\(open\)\)/);
});

test('the toggle has a translated tooltip wired through the existing data-i18n-title mechanism', () => {
  assert.match(html, /id="ctaAsideToggle"[^>]*data-i18n-title="moreMenuTitle"/);
  assert.match(script, /data-i18n-title]'\)\.forEach\(el => \{ el\.title = t\(el\.getAttribute\('data-i18n-title'\)\); \}\)/);
});

test('on phones the toggle stays put in its own corner and the opened body wraps into a compact row, not ~90px-tall stacked buttons', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  assert.match(mobile, /#ctaAside\s*\{[^}]*inset-inline-end/);
  assert.match(mobile, /#ctaAsideBody\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(mobile, /#ctaAsideBody\.open\s*\{[^}]*display:\s*flex/);
});
