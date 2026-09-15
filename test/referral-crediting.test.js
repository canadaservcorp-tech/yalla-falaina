// The referral-conversion-crediting hook (lib/referral.js's
// creditConversionIfNew, called from both of routes/subscription.js's webhook
// handlers) is the one piece of this feature that touches real payment
// webhooks, so — same philosophy as test/subscription-webhook.test.js and
// test/subscription-stripe-webhook.test.js — it gets full HTTP-level
// coverage rather than trusting the pure lib/referral.js unit tests (see
// test/referral.test.js) to stand in for it. What matters here specifically:
// a genuine inactive->active transition credits exactly once, a renewal of an
// already-active subscriber never does, and an already-credited account never
// double-credits across a later cancel/resubscribe cycle.
process.env.PAYPAL_WEBHOOK_ID = 'test_webhook_id';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');
const { installMockStripe } = require('./helpers/mockStripe');

const paypal = installMockPaypal();
const stripe = installMockStripe();
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const PP_SIG_HEADERS = {
  'content-type': 'application/json',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/cert',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-01-01T00:00:00Z',
};
const ppWebhook = body => fetch(h.base + '/api/subscription/webhook', {
  method: 'POST', headers: PP_SIG_HEADERS, body: JSON.stringify(body),
});
const stripeWebhook = body => fetch(h.base + '/api/subscription/stripe/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=whatever' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  paypal.__reset();
  stripe.__reset();
  h.mock.__reset();
  paypal.__reply('/v1/notifications/verify-webhook-signature', { verification_status: 'SUCCESS' });
});

// ---------- PayPal ----------

test('PayPal: a first-time activation for a referred account credits the referrer exactly once', async () => {
  h.mock.__set('users', {
    data: { id: 42, subscription_period_end: null, subscription_status: 'inactive', referred_by: 7, referral_credited: false },
    error: null,
  });
  const r = await ppWebhook({
    event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: { id: 'SUB-42', custom_id: '42' },
  });
  assert.equal(r.status, 200);

  const conversions = h.mock.__writes('referral_conversions', 'insert');
  assert.equal(conversions.length, 1);
  assert.deepEqual(conversions[0].payload, { referrer_id: 7, referred_id: 42 });

  // Two separate users.update writes land: grantReferralBonus's own
  // read-modify-write on the REFERRER's bonus_access_until (see
  // lib/referral.js), and the webhook's own patch on the REFERRED account
  // (subscription_status/referral_credited) -- find each by its shape rather
  // than assuming array order.
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 2, 'both the bonus grant and the activation patch should have written');
  const activation = writes.find(w => 'subscription_status' in w.payload);
  assert.equal(activation.payload.subscription_status, 'active');
  assert.equal(activation.payload.referral_credited, true);
  const bonusGrant = writes.find(w => 'bonus_access_until' in w.payload);
  assert.ok(bonusGrant, 'the referrer should have been granted a bonus for this fresh conversion');
  assert.ok(new Date(bonusGrant.payload.bonus_access_until) > new Date(), 'the grant should be in the future');
});

test('PayPal: a renewal payment for an already-active referred account never re-credits', async () => {
  h.mock.__set('users', {
    data: { id: 43, subscription_period_end: '2026-08-01T00:00:00Z', subscription_status: 'active', referred_by: 7, referral_credited: true },
    error: null,
  });
  const r = await ppWebhook({
    event_type: 'PAYMENT.SALE.COMPLETED',
    resource: { billing_agreement_id: 'SUB-43', custom_id: '43' },
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('referral_conversions', 'insert').length, 0);
  const [update] = h.mock.__writes('users', 'update');
  assert.equal(update.payload.referral_credited, undefined, 'a renewal patch should not even mention referral_credited');
});

test('PayPal: an account with no referrer never touches the ledger', async () => {
  h.mock.__set('users', {
    data: { id: 44, subscription_period_end: null, subscription_status: 'inactive', referred_by: null, referral_credited: false },
    error: null,
  });
  await ppWebhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-44', custom_id: '44' } });
  assert.equal(h.mock.__writes('referral_conversions', 'insert').length, 0);
});

test('PayPal: reactivating an already-credited account (a later cancel/resubscribe) does not double-credit', async () => {
  h.mock.__set('users', {
    data: { id: 45, subscription_period_end: null, subscription_status: 'canceled', referred_by: 7, referral_credited: true },
    error: null,
  });
  await ppWebhook({ event_type: 'BILLING.SUBSCRIPTION.RE-ACTIVATED', resource: { id: 'SUB-45', custom_id: '45' } });
  assert.equal(h.mock.__writes('referral_conversions', 'insert').length, 0);
});

test('PayPal: a concurrent duplicate credit (unique-violation on insert) still marks credited, doesn\'t fail the webhook', async () => {
  h.mock.__set('users', {
    data: { id: 46, subscription_period_end: null, subscription_status: 'inactive', referred_by: 7, referral_credited: false },
    error: null,
  });
  h.mock.__setOp('referral_conversions', 'insert', { error: { code: '23505', message: 'duplicate key' } });
  const r = await ppWebhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-46', custom_id: '46' } });
  assert.equal(r.status, 200);
  const [update] = h.mock.__writes('users', 'update');
  assert.equal(update.payload.referral_credited, true);
});

// ---------- Stripe ----------

test('Stripe: checkout.session.completed for a referred first-time subscriber credits the referrer', async () => {
  stripe.__reply('/subscriptions/sub_ref', {
    id: 'sub_ref', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
    current_period_end: Math.floor(new Date('2026-10-08T00:00:00.000Z').getTime() / 1000),
  });
  h.mock.__set('users', {
    data: { id: 50, subscription_period_end: null, subscription_status: 'inactive', referred_by: 9, referral_credited: false },
    error: null,
  });
  const r = await stripeWebhook({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: 'sub_ref', customer: 'cus_1', client_reference_id: '50' } },
  });
  assert.equal(r.status, 200);
  const conversions = h.mock.__writes('referral_conversions', 'insert');
  assert.equal(conversions.length, 1);
  assert.deepEqual(conversions[0].payload, { referrer_id: 9, referred_id: 50 });
  // Same two-write shape as the PayPal case above -- find by payload shape.
  const writes = h.mock.__writes('users', 'update');
  const activation = writes.find(w => 'referral_credited' in w.payload);
  assert.equal(activation.payload.referral_credited, true);
  const bonusGrant = writes.find(w => 'bonus_access_until' in w.payload);
  assert.ok(bonusGrant, 'the referrer should have been granted a bonus for this fresh conversion');
});

test('Stripe: customer.subscription.updated reactivating a lapsed referred account credits once', async () => {
  h.mock.__set('users', {
    data: { id: 51, subscription_period_end: null, subscription_status: 'canceled', referred_by: 9, referral_credited: false },
    error: null,
  });
  const r = await stripeWebhook({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_51', status: 'active', cancel_at_period_end: false, current_period_end: Math.floor(Date.now() / 1000) + 86400 } },
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('referral_conversions', 'insert').length, 1);
});

test('Stripe: a plain renewal-style update for an already-active referred account never re-credits', async () => {
  h.mock.__set('users', {
    data: { id: 52, subscription_period_end: null, subscription_status: 'active', referred_by: 9, referral_credited: true },
    error: null,
  });
  await stripeWebhook({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_52', status: 'active', cancel_at_period_end: false, current_period_end: Math.floor(Date.now() / 1000) + 86400 } },
  });
  assert.equal(h.mock.__writes('referral_conversions', 'insert').length, 0);
});
