// lib/stripe.js's verifyWebhookSignature() is the entire security boundary
// for POST /api/subscription/stripe/webhook — the literal place where money
// and unverified network input meet, same category CLAUDE_ROADMAP_PROMPT.md's
// Step 3 called out for the PayPal webhook. Unlike PayPal (whose signature
// check is a live call to PayPal's own API, exercised via the mock in
// test/subscription-webhook.test.js), Stripe's is a pure local HMAC
// computation — which means it can and should be tested directly, without a
// mock standing in for it, the same way test/matching.test.js tests the real
// scoring logic directly instead of only through the concierge route.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../lib/stripe');

const SECRET = 'whsec_test_secret';
const BODY = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });

function sign(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return { header: `t=${timestamp},v1=${sig}`, timestamp };
}

test('a correctly-signed, fresh payload verifies', () => {
  const { header } = sign(BODY, SECRET);
  assert.equal(verifyWebhookSignature(BODY, header, SECRET), true);
});

test('a payload signed with the wrong secret is rejected', () => {
  const { header } = sign(BODY, 'whsec_wrong_secret');
  assert.equal(verifyWebhookSignature(BODY, header, SECRET), false);
});

test('a tampered body (valid signature for different bytes) is rejected', () => {
  const { header } = sign(BODY, SECRET);
  const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted' });
  assert.equal(verifyWebhookSignature(tampered, header, SECRET), false);
});

test('a stale timestamp outside the tolerance window is rejected even with a correct signature', () => {
  const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
  const { header } = sign(BODY, SECRET, staleTimestamp);
  assert.equal(verifyWebhookSignature(BODY, header, SECRET), false);
});

test('a missing, malformed, or empty header is rejected without throwing', () => {
  assert.equal(verifyWebhookSignature(BODY, '', SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, 'not-a-valid-header', SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, 't=123', SECRET), false);   // no v1
});

test('a signature of a different length than expected never throws (timingSafeEqual length mismatch is handled)', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(verifyWebhookSignature(BODY, `t=${timestamp},v1=deadbeef`, SECRET), false);
});

test('missing rawBody or secret is rejected without throwing', () => {
  const { header } = sign(BODY, SECRET);
  assert.equal(verifyWebhookSignature('', header, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, header, ''), false);
});
