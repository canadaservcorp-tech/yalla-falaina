// POST /api/subscription/stripe/webhook — Stripe's analog of
// test/subscription-webhook.test.js. Same stakes as that file's own header
// comment explains: this is the sole mechanism that grants or revokes paid
// access for Stripe subscribers, so it gets the same full HTTP-level
// coverage — signature verification, event-type dispatch, and the exact
// shape of what gets written to `users` — rather than trusting the pure
// lib/stripe-events.js tests (test/stripe-events.test.js) to stand in for it.
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockStripe } = require('./helpers/mockStripe');

const stripe = installMockStripe();
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

function webhook(body) {
  return fetch(h.base + '/api/subscription/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=whatever' }, // mocked verify accepts by default
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => { stripe.__reset(); h.mock.__reset(); });

// ---------- signature verification ----------

test('a webhook that fails signature verification is rejected with 400 and never touches the database', async () => {
  stripe.__setVerify(() => false);
  h.mock.__set('users', { data: { id: 1, subscription_period_end: null }, error: null });
  const r = await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active' } } });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Invalid signature/);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('an unparseable body is rejected with 400', async () => {
  const r = await webhook('not json');
  assert.equal(r.status, 400);
});

// ---------- checkout.session.completed ----------

test('checkout.session.completed (subscription mode) links the user, fetches the live subscription, and writes the full patch', async () => {
  stripe.__reply('/subscriptions/sub_new', {
    id: 'sub_new', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
    current_period_end: Math.floor(new Date('2026-10-08T00:00:00.000Z').getTime() / 1000),
  });
  h.mock.__set('users', { data: { id: 40, subscription_period_end: null }, error: null });

  const r = await webhook({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: 'sub_new', customer: 'cus_1', client_reference_id: '40' } },
  });
  assert.equal(r.status, 200);

  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  const patch = writes[0].payload;
  assert.equal(patch.subscription_status, 'active');
  assert.equal(patch.subscription_tier, 'basic');
  assert.equal(patch.stripe_customer_id, 'cus_1');
  assert.equal(patch.stripe_subscription_id, 'sub_new');
  assert.equal(patch.payment_provider, 'stripe');
});

test('checkout.session.completed in payment mode (a one-time purchase, not ours) is ignored', async () => {
  const r = await webhook({ type: 'checkout.session.completed', data: { object: { mode: 'payment', client_reference_id: '40' } } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
  assert.equal(stripe.__calls('/subscriptions/').length, 0, 'must not even look up a subscription that was never created');
});

test('checkout.session.completed with no client_reference_id is ignored (nothing to link it to)', async () => {
  const r = await webhook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_x' } } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('checkout.session.completed for a user id that does not exist is ignored, not a 500', async () => {
  stripe.__reply('/subscriptions/sub_ghost', { id: 'sub_ghost', status: 'active' });
  h.mock.__set('users', { data: null, error: null });
  const r = await webhook({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: 'sub_ghost', client_reference_id: '999' } },
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

// ---------- customer.subscription.updated / deleted ----------

test('customer.subscription.updated (still active, not cancelling) refreshes the period end and clears any retention countdown', async () => {
  h.mock.__set('users', { data: { id: 41, subscription_period_end: '2026-09-08T00:00:00.000Z' }, error: null });
  const r = await webhook({
    type: 'customer.subscription.updated',
    data: { object: {
      id: 'sub_41', status: 'active', cancel_at_period_end: false,
      current_period_end: Math.floor(new Date('2026-10-08T00:00:00.000Z').getTime() / 1000),
    } },
  });
  assert.equal(r.status, 200);
  const patch = h.mock.__writes('users', 'update')[0].payload;
  assert.equal(patch.subscription_status, 'active');
  assert.equal(patch.subscription_tier, 'basic');
  assert.equal(patch.data_retention_deadline, null);
});

test('customer.subscription.updated with cancel_at_period_end -> only subscription_cancel_at is written (a GRACE patch, same as PayPal cancellation)', async () => {
  h.mock.__set('users', { data: { id: 42, subscription_period_end: null }, error: null });
  const r = await webhook({
    type: 'customer.subscription.updated',
    data: { object: {
      id: 'sub_42', status: 'active', cancel_at_period_end: true,
      current_period_end: Math.floor(new Date('2026-10-08T00:00:00.000Z').getTime() / 1000),
    } },
  });
  assert.equal(r.status, 200);
  const patch = h.mock.__writes('users', 'update')[0].payload;
  assert.deepEqual(Object.keys(patch), ['subscription_cancel_at']);
  assert.equal(patch.subscription_cancel_at, '2026-10-08T00:00:00.000Z');
});

test('customer.subscription.deleted ends access: status canceled, tier none, retention countdown started', async () => {
  h.mock.__set('users', { data: { id: 43, subscription_period_end: '2026-09-08T00:00:00.000Z' }, error: null });
  const r = await webhook({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_43', status: 'canceled' } },
  });
  assert.equal(r.status, 200);
  const patch = h.mock.__writes('users', 'update')[0].payload;
  assert.equal(patch.subscription_status, 'canceled');
  assert.equal(patch.subscription_tier, 'none');
  assert.ok(patch.data_retention_deadline);
});

test('customer.subscription.deleted forces status canceled even if the event object somehow omits it', async () => {
  h.mock.__set('users', { data: { id: 44, subscription_period_end: null }, error: null });
  const r = await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_44' } } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update')[0].payload.subscription_status, 'canceled');
});

test('a subscription.updated event for an id not on file is ignored, not a 500', async () => {
  h.mock.__set('users', { data: null, error: null });
  const r = await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_unknown', status: 'active' } } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

// ---------- everything else ----------

test('an unrecognized event type is acknowledged and ignored', async () => {
  const r = await webhook({ type: 'invoice.created', data: { object: {} } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { received: true });
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});
