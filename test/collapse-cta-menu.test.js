// Hicham's ask (Sept 2026, second decluttering pass): the Contact/
// Promote/Instagram/Express-Entry/share-bar widget (#ctaAside) AND the two
// pre-login "Working in the Gulf" / "Guides" link blocks that used to live
// inside #authCard together read as one crowded screen. All of it folds
// behind a single "..." toggle, closed by default. Third pass: the toggle
// moved into the header's controls (top of the screen, same green as
// Send), and the dropdown is one tidy stacked list rather than floating
// buttons.
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

test('the toggle is a green "..." button, closed by default, at the top of the page inside the header', () => {
  const toggleAt = html.indexOf('id="ctaAsideToggle"');
  assert.ok(toggleAt > -1);
  const toggleEl = html.slice(html.lastIndexOf('<button', toggleAt), html.indexOf('</button>', toggleAt) + '</button>'.length);
  assert.match(toggleEl, /aria-expanded="false"/, 'must start closed');
  assert.match(toggleEl, /aria-controls="ctaAsideBody jobsPane"/, 'controls both the dropdown and (on a phone) the revealed #jobsPane');
  assert.match(toggleEl, />⋮</, 'the three-dot glyph itself');
  // top right: the menu is the last item of the header's .controls (the
  // logical inline end -- mirrored to the top left in RTL, like every
  // other control)
  assert.ok(toggleAt > html.indexOf('<header>') && toggleAt < html.indexOf('</header>'),
    'the toggle must live inside <header>');
  assert.ok(toggleAt > html.indexOf('id="langSwitch"'), 'last item of .controls, at the row\'s end');
  // same green as the Send button, not the old panel/border look
  const toggleRule = style.match(/#ctaAsideToggle\s*\{[^}]*\}/)[0];
  assert.match(toggleRule, /background:\s*#2f9e44/, 'same green as #sendBtn');
});

test('#ctaAsideBody is hidden until opened, and holds every relocated control', () => {
  const bodyRule = style.match(/#ctaAsideBody\s*\{[^}]*\}/)[0];
  assert.match(bodyRule, /display:\s*none/, 'closed by default');
  assert.match(style, /#ctaAsideBody\.open\s*\{[^}]*display:\s*flex/, 'an .open class is what reveals it');

  const bodyStart = html.indexOf('id="ctaAsideBody"');
  // the menu lives inside <header> now; every relocated id is unique in the
  // document, so bounding the slice at </header> still proves containment
  const bodyEnd = html.indexOf('</header>');
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

test('the same click also flips a ctaMenuOpen class on <body>, since #jobsPane lives outside the menu\'s subtree', () => {
  const handlerAt = script.indexOf("$('ctaAsideToggle').onclick");
  const handler = script.slice(handlerAt, script.indexOf('};', handlerAt) + 2);
  assert.match(handler, /document\.body\.classList\.toggle\('ctaMenuOpen', open\)/);
});

test('#jobsPane (matched jobs / CV / medical / security / notifications / referral) is hidden until the menu is opened, on every viewport', () => {
  // Hicham's cleanup ask: the signed-in screen is just chat + composer;
  // the side column appears only when the "..." menu is open, desktop
  // included -- the rule lives in the BASE styles, not the media query.
  const baseStyle = style.slice(0, style.indexOf('@media (max-width: 720px)'));
  assert.match(baseStyle, /#jobsPane\s*\{[^}]*display:\s*none/, 'hidden by default everywhere');
  assert.match(baseStyle, /body\.ctaMenuOpen #jobsPane\s*\{[^}]*display:\s*block/, 'revealed by the toggle everywhere');
});

test('account actions (subscription status, cancel/resume, sign out) live in the menu, not the header', () => {
  // they used to crowd the header's .controls row when signed in
  const bodyStart = html.indexOf('id="ctaAsideBody"');
  const bodyEnd = html.indexOf('</header>');
  const body = html.slice(bodyStart, bodyEnd);
  for (const id of ['accountSection', 'subBar', 'resumeSubBtn', 'cancelSubBtn', 'cancelSubConfirm', 'logoutBtn']) {
    assert.ok(body.includes(`id="${id}"`), `#${id} must live inside the menu's account section`);
  }
  // the section is hidden until signed in -- no empty bordered box for visitors
  const acctEl = html.slice(html.lastIndexOf('<div', body.indexOf('id="accountSection"') + bodyStart), body.indexOf('id="accountSection"') + bodyStart + 200);
  assert.match(acctEl, /display:\s*none/);
  // and it only appears on sign-in
  const enterAt = script.indexOf('async function enter()');
  const enter = script.slice(enterAt, script.indexOf('resumed', enterAt));
  assert.match(enter, /\$\('accountSection'\)\.style\.display = 'block'/);
});

test('the toggle has a translated tooltip wired through the existing data-i18n-title mechanism', () => {
  assert.match(html, /id="ctaAsideToggle"[^>]*data-i18n-title="moreMenuTitle"/);
  assert.match(script, /data-i18n-title]'\)\.forEach\(el => \{ el\.title = t\(el\.getAttribute\('data-i18n-title'\)\); \}\)/);
});

test('the opened body is one tidy stacked list: full-width rows, section separators, same on phones', () => {
  // a dropdown panel under the header button, never a floating corner bar
  const bodyRule = style.match(/#ctaAsideBody\s*\{[^}]*\}/)[0];
  assert.match(bodyRule, /position:\s*absolute/);
  assert.match(bodyRule, /top:\s*calc\(100% \+ 8px\)/);
  assert.match(bodyRule, /inset-inline-end:\s*0/);
  assert.match(style, /#ctaAsideBody\.open\s*\{[^}]*flex-direction:\s*column/, 'a stacked column, not a wrapped row');
  assert.match(style, /#ctaAsideBody > button,\s*#ctaAsideBody > a\.menuItem\s*\{[^}]*width:\s*100%/, 'each action fills the row');
  assert.match(style, /#ctaAsideBody \.menuSection\s*\{[^}]*border-top/, 'link groups separated by a rule');
  // phones keep the same list -- the old mobile override is gone
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(mobile, /#ctaAside\s*\{[^}]*position:\s*fixed|#ctaAside\s*\{[^}]*bottom/, 'no bottom-corner anchor anywhere');
  assert.doesNotMatch(mobile, /#ctaAsideBody\s*\{[^}]*flex-wrap/, 'no cramped wrapped-row layout on phones');
});
