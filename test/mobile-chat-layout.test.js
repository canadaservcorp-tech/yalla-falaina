// Bug report: a new signer-up on a phone saw the paywall banner and the
// matched-jobs/medical-intake panel, but no composer ("no icon to start
// chat with concierge"). The composer (#inputRow, containing #messageInput
// and #sendBtn) is never conditionally hidden by any JS in this file --
// grep confirms it -- so this was a pure CSS layout bug: on narrow screens
// #chatPane was allowed to grow past the first screen (min-height only),
// which could push #inputRow down where a first-time user wouldn't think
// to scroll for it. Static checks, same pattern as
// test/checkout-funnel-analytics.test.js, since this is plain CSS with no
// server round-trip to exercise through the app harness.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

test('the composer is never conditionally hidden by JS based on paywall/subscription state', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /inputRow'\)\.style\.display/);
  assert.doesNotMatch(script, /messageInput'\)\.style\.display/);
  assert.doesNotMatch(script, /sendBtn'\)\.style\.display/);
});

test('#messages can shrink below its content size so it scrolls internally instead of overflowing its parent', () => {
  const rule = style.match(/#messages\s*\{[^}]*\}/)[0];
  assert.match(rule, /flex:\s*1/);
  assert.match(rule, /min-height:\s*0/);
  assert.match(rule, /overflow-y:\s*auto/);
});

test('on phones, the chat pane must not flex-shrink inside the bounded main', () => {
  // Regression from #100: body is now bounded to the viewport, so a mobile
  // column whose children exceed it shrinks them -- the tall #jobsPane
  // squeezed #chatPane to ~112px and clipped the composer inside it.
  const mobileBlock = html.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n  \}/)[1];
  const chatRule = mobileBlock.match(/#chatPane \{[^}]+\}/)[0];
  assert.match(chatRule, /flex-shrink:\s*0/);
  // Prominence: the composer is the post-signup action and must read as such.
  assert.match(mobileBlock, /#inputRow \{[^}]*border-top:\s*2px solid var\(--accent\)/);
  assert.match(mobileBlock, /#inputRow input \{[^}]*font-size:\s*16px/);
});

test('the fixed #ctaAside can never cover the composer — #chatPane is dynamically padded by the bar height', () => {
  // Live-site regression: a signed-in visitor on desktop Arabic had the
  // floating Contact/Advertise/social bar sitting directly on top of
  // #inputRow (fixed bottom, inset-inline-start = the composer's corner in
  // both directions). padForBar now measures the bar and pads the pane on
  // every viewport, not just the signup card on small screens.
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /chatPane'\)\.style\.paddingBottom/);
  assert.match(script, /cookiebar'\)\.offsetParent/, 'the consent cookiebar is the same bottom overlay and must count too');
});

test('on phones, the chat pane is capped at 60dvh (not just a floor) so the composer can never be pushed past the first screen', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  const rule = mobile.match(/#chatPane\s*\{[^}]*\}/)[0];
  assert.match(rule, /height:\s*60dvh/);
  assert.doesNotMatch(rule, /min-height/, 'a min-height (as opposed to a capped height) can grow past the fold again');
  assert.match(rule, /overflow:\s*hidden/, 'without this, content can still overflow the capped height');
});

test('on phones, the paywall banner scrolls internally and the composer never shrinks — a tall banner used to push it past the pane\'s clipped bottom', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  const paywall = mobile.match(/#paywall\s*\{[^}]*\}/);
  assert.ok(paywall, 'no #paywall rule in the mobile block — the tall-banner regression returns');
  assert.match(paywall[0], /min-height:\s*0/);
  assert.match(paywall[0], /overflow-y:\s*auto/);
  const inputRow = mobile.match(/#inputRow\s*\{[^}]*\}/);
  assert.ok(inputRow, 'no #inputRow rule in the mobile block');
  assert.match(inputRow[0], /flex-shrink:\s*0/);
});
