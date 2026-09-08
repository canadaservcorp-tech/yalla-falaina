// PayPal webhook contract: every event must pass verify-webhook-signature
// before it can touch the database, and each event type maps to exactly the
// account patch lib/subscription-events.js defines — CANCELLED only schedules
// (the grace period ends access later, via the lapse job), a renewal payment
// re-fetches the agreement for the next billing date and must not overwrite
// the stored paypal_subscription_id with the sale's own id.
process.env.PAYPAL_WEBHOOK_ID = 'test_webhook_id'; // read at require time by routes/subscription.js

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');
const paypal = installMockPaypal();
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

const SIG_HEADERS = {
  'Content-Type': 'application/json',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-transmission-id': 'tr-1',
  'paypal-transmission-sig': 'sig-1',
  'paypal-transmission-time': '2026-09-08T00:00:00Z',
};

function goodSignature() {
  paypal.__reply('/v1/notifications/verify-webhook-signature', { verification_status: 'SUCCESS' });
}
function badSignature() {
  paypal.__reply('/v1/notifications/verify-webhook-signature', { verification_status: 'FAILURE' });
}
function webhook(body) {
  return fetch(h.base + '/api/subscription/webhook', { method: 'POST', headers: SIG_HEADERS, body: JSON.stringify(body) });
}

beforeEach(() => { paypal.__reset(); h.mock.__reset(); goodSignature(); });

test('a tampered/unsigned webhook is rejected with 400 and never touches the database', async () => {
  badSignature();
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-1', custom_id: '1' } });
  assert.equal(r.status, 400);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('BILLING.SUBSCRIPTION.CANCELLED starts the grace period without cutting access or clearing the tier early', async () => {
  h.mock.__set('users', { data: { id: 7, subscription_period_end: '2026-12-01T00:00:00Z' }, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-7', custom_id: '7' } });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.subscription_cancel_at, '2026-12-01T00:00:00Z'); // keeps the paid days
  assert.ok(!('subscription_status' in writes[0].payload));  // must not jump the gun — EXPIRED does that later
  assert.ok(!('subscription_tier' in writes[0].payload));
});

test('a renewal payment (PAYMENT.SALE.COMPLETED) re-fetches the agreement and re-activates by billing_agreement_id', async () => {
  h.mock.__set('users', { data: { id: 9, subscription_period_end: '2026-10-01T00:00:00Z' }, error: null });
  paypal.__reply('/v1/billing/subscriptions/SUB-9', { custom_id: '9', billing_info: { next_billing_time: '2026-12-01T00:00:00Z' } });
  const r = await webhook({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-1', billing_agreement_id: 'SUB-9' } });
  assert.equal(r.status, 200);
  assert.equal(paypal.__calls('/v1/billing/subscriptions/SUB-9').length, 1);  // next billing date re-read
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.subscription_status, 'active');
  assert.equal(writes[0].payload.subscription_period_end, '2026-12-01T00:00:00Z');
  assert.ok(!('paypal_subscription_id' in writes[0].payload)); // must not overwrite it with the sale's own id
});

test('an event for an unknown subscription writes nothing but still acks 200', async () => {
  h.mock.__set('users', { data: null, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-404', custom_id: '404' } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});
