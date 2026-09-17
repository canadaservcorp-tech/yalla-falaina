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

test('on phones, the chat pane is capped at 60dvh (not just a floor) so the composer can never be pushed past the first screen', () => {
  const mobile = style.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
  const rule = mobile.match(/#chatPane\s*\{[^}]*\}/)[0];
  assert.match(rule, /height:\s*60dvh/);
  assert.doesNotMatch(rule, /min-height/, 'a min-height (as opposed to a capped height) can grow past the fold again');
  assert.match(rule, /overflow:\s*hidden/, 'without this, content can still overflow the capped height');
});
