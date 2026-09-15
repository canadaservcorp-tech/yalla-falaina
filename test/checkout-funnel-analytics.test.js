// Before this, the checkout funnel was invisible past "did PayPal/Stripe's own
// dashboard show a payment" -- no event fired when someone clicked Subscribe,
// and the server's own `?sub=cancel` return param (routes/subscription.js has
// always sent it) was read by nothing on the client. These are static checks
// against public/index.html's script, same pattern as
// test/error-i18n-wiring.test.js, since this is plain client JS with no
// server round-trip to exercise through the app harness.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('starting checkout fires a labeled checkout_start event for both providers', () => {
  assert.match(script, /track\('checkout_start', \{ provider \}\)/);
  assert.match(script, /startCheckout\('\/api\/subscription\/checkout', 'paypal'\)/);
  assert.match(script, /startCheckout\('\/api\/subscription\/stripe\/checkout', 'stripe'\)/);
  // the resume flow's PayPal fallback path is the same funnel entry point,
  // not a separate one -- it must carry the same label, not go unlabeled
  assert.match(script, /startCheckout\('\/api\/subscription\/checkout', 'paypal'\); return; \}/);
});

test('actually reaching the provider redirect is tracked separately from just clicking subscribe', () => {
  // distinguishes "server never returned a checkout url" from "seeker left
  // for PayPal/Stripe" -- the two have very different causes and fixes
  assert.match(script, /track\('checkout_redirect', \{ provider \}\); location\.href = d\.url;/);
  assert.match(script, /track\('checkout_result', \{ provider, result: 'start_failed' \}\)/);
});

test('?sub=cancel is now read: it shows a message and is tracked, not silently ignored', () => {
  assert.match(script, /subParam === 'cancel'/);
  assert.match(script, /track\('checkout_result', \{ result: 'cancel' \}\)/);
  assert.match(script, /t\('checkoutCancelled'\)/);
});

test('a confirmed vs. timed-out webhook after a successful return are tracked as different outcomes', () => {
  assert.match(script, /track\('checkout_result', \{ result: 'success_confirmed' \}\)/);
  assert.match(script, /track\('checkout_result', \{ result: 'success_pending_timeout' \}\)/);
});

test('both sub=success and sub=cancel scrub the one-shot param so a reload cannot re-fire the event', () => {
  assert.match(script, /const cleanSubParam = \(\) => \{/);
  assert.match(script, /if \(subParam === 'success'\) \{ cleanSubParam\(\); pollSubAfterCheckout\(\); \}/);
  assert.match(script, /else if \(subParam === 'cancel'\) \{\s*cleanSubParam\(\);/);
});

test('checkoutCancelled has a translation in all four UI languages', () => {
  const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const hits = i18n.match(/checkoutCancelled:/g) || [];
  assert.equal(hits.length, 4, 'expected en/fr/ar/hi, one checkoutCancelled entry each');
});
