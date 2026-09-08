// routes/subscription.js's POST /webhook is the sole mechanism that grants or
// revokes paid access — the literal place where money and external, unverified
// network input meet. CLAUDE_ROADMAP_PROMPT.md's Step 3 definition of done
// explicitly names "verify webhook signature verification rejects tampered
// calls" as a requirement. Despite that, nothing exercised this HTTP route at
// all before this file — only the pure decision function it calls
// (lib/subscription-events.js's accountPatch/subscriptionId) had tests. A
// regression here (signature check short-circuited, wrong user matched, tier
// not cleared on cancellation) would either give away paid access for free or
// lock out a paying subscriber, silently, since CI wouldn't catch it.
//
// PAYPAL_WEBHOOK_ID must exist before routes/subscription.js is first
// required — it's read into a module-level const at require time, same
// reason test/jobsIngest.test.js has to reset require.cache around its
// PROVIDER const. Since each test file runs in its own process (node --test),
// setting it here doesn't affect any other file.
process.env.PAYPAL_WEBHOOK_ID = 'test_webhook_id';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');

const paypal = installMockPaypal();
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const SIG_HEADERS = {
  'content-type': 'application/json',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/cert',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-01-01T00:00:00Z',
};

function webhook(body, headers = SIG_HEADERS) {
  return fetch(h.base + '/api/subscription/webhook', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const okSignature = () => paypal.__reply('/v1/notifications/verify-webhook-signature', { verification_status: 'SUCCESS' });
const badSignature = () => paypal.__reply('/v1/notifications/verify-webhook-signature', { verification_status: 'FAILURE' });

beforeEach(() => {
  paypal.__reset();
  h.mock.__reset();
  okSignature(); // most tests are about what a *verified* event does; the two signature tests override this
});

// ---------- signature verification (Step 3's explicit requirement) ----------

test('a tampered/unsigned webhook is rejected with 400 and never touches the database', async () => {
  badSignature();
  h.mock.__set('users', { data: { id: 1, subscription_period_end: null }, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-1', custom_id: '1' } });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Invalid signature/);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('PayPal signature verification erroring out (network/API failure) fails closed, not open', async () => {
  paypal.__reply('/v1/notifications/verify-webhook-signature', new Error('PayPal unavailable'));
  h.mock.__set('users', { data: { id: 1, subscription_period_end: null }, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-1', custom_id: '1' } });
  assert.equal(r.status, 400);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('malformed JSON body -> 400, not a crash', async () => {
  const r = await webhook('{not json', { ...SIG_HEADERS });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Bad payload/);
});

// ---------- verified events actually applied correctly ----------

test('BILLING.SUBSCRIPTION.ACTIVATED grants access: status active, tier set, any pending cancellation cleared', async () => {
  h.mock.__set('users', { data: { id: 42, subscription_period_end: null }, error: null });
  const r = await webhook({
    event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: { id: 'SUB-42', custom_id: '42', billing_info: { next_billing_time: '2026-11-01T00:00:00Z' } },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { received: true });
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.subscription_status, 'active');
  assert.equal(writes[0].payload.subscription_tier, 'basic');
  assert.equal(writes[0].payload.subscription_cancel_at, null);
  assert.equal(writes[0].payload.paypal_subscription_id, 'SUB-42');
  assert.equal(writes[0].payload.subscription_period_end, '2026-11-01T00:00:00Z');
});

test('BILLING.SUBSCRIPTION.CANCELLED starts the grace period without cutting access or clearing the tier early', async () => {
  h.mock.__set('users', { data: { id: 7, subscription_period_end: '2026-12-01T00:00:00Z' }, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-7', custom_id: '7' } });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  // GRACE only ever returns subscription_cancel_at (lib/subscription-events.js) —
  // status/tier must NOT be touched here; that stays for EXPIRED/lapse to do later.
  assert.equal(writes[0].payload.subscription_cancel_at, '2026-12-01T00:00:00Z');
  assert.ok(!('subscription_status' in writes[0].payload));
  assert.ok(!('subscription_tier' in writes[0].payload));
});

test('BILLING.SUBSCRIPTION.EXPIRED ends access: status canceled, tier cleared, retention deadline started', async () => {
  h.mock.__set('users', { data: { id: 8, subscription_period_end: null }, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.EXPIRED', resource: { id: 'SUB-8', custom_id: '8' } });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes[0].payload.subscription_status, 'canceled');
  assert.equal(writes[0].payload.subscription_tier, 'none');
  assert.ok(writes[0].payload.data_retention_deadline, 'a 30-day deletion countdown must start');
});

test('a renewal payment (PAYMENT.SALE.COMPLETED) re-fetches the agreement and re-activates by billing_agreement_id', async () => {
  paypal.__reply('/v1/billing/subscriptions/SUB-9', {
    custom_id: '9', billing_info: { next_billing_time: '2026-12-01T00:00:00Z' },
  });
  h.mock.__set('users', { data: { id: 9, subscription_period_end: null }, error: null });
  const r = await webhook({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-1', billing_agreement_id: 'SUB-9' } });
  assert.equal(r.status, 200);
  const calls = paypal.__calls('/v1/billing/subscriptions/SUB-9');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.subscription_status, 'active');
  assert.equal(writes[0].payload.subscription_tier, 'basic');
  // a renewal must not overwrite paypal_subscription_id with the sale id
  assert.ok(!('paypal_subscription_id' in writes[0].payload));
});

test('a renewal for a one-time order (no billing_agreement_id) is a no-op — never looked up or written', async () => {
  const r = await webhook({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-2' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { received: true });
  // signature verification itself still calls PayPal — it's the agreement
  // lookup/GET that must never fire for an event with no subscription to look up
  assert.equal(paypal.__calls('/v1/billing/subscriptions').length, 0);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('an event for a subscription/custom_id matching no user is a safe no-op, not a 500', async () => {
  h.mock.__set('users', { data: null, error: null });
  const r = await webhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-GHOST', custom_id: '999999' } });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('an unrelated event type changes nothing but still acknowledges receipt', async () => {
  h.mock.__set('users', { data: { id: 5, subscription_period_end: null }, error: null });
  const r = await webhook({ event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { id: 'SUB-5', custom_id: '5' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { received: true });
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});
