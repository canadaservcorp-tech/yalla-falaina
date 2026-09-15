// POST /api/subscription/stripe/checkout — the Stripe analog of the existing
// PayPal /checkout route. Unlike PayPal's version, this route must NOT write
// any subscription-identity field to `users` (see routes/subscription.js's
// comment: a Checkout Session doesn't create the subscription until payment
// completes) -- it DOES write checkout_started_at, purely as a timestamp for
// scripts/checkout-reminder.js's abandoned-checkout email.
process.env.STRIPE_PRICE_ID = 'price_test_basic_monthly';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockStripe } = require('./helpers/mockStripe');

const stripe = installMockStripe();
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => { stripe.__reset(); h.mock.__reset(); });

const checkout = token => fetch(h.base + '/api/subscription/stripe/checkout', { method: 'POST', headers: auth(token) });

test('starts a Stripe Checkout session and returns its url, writing only checkout_started_at (no subscription id yet)', async () => {
  stripe.__reply('/checkout/sessions', { id: 'cs_test_1', url: 'https://checkout.stripe.test/pay/cs_test_1' });
  const token = actor(h, { id: 30, role: 'seeker', extra: { email: 'seeker@example.com' } });

  const res = await checkout(token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.url, 'https://checkout.stripe.test/pay/cs_test_1');

  const calls = stripe.__calls('/checkout/sessions');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.mode, 'subscription');
  assert.equal(calls[0].params.client_reference_id, '30');
  assert.equal(calls[0].params.customer_email, 'seeker@example.com');
  assert.deepEqual(calls[0].params.line_items, [{ price: 'price_test_basic_monthly', quantity: 1 }]);

  const [update] = h.mock.__writes('users', 'update');
  assert.deepEqual(Object.keys(update.payload).sort(), ['checkout_reminder_sent_at', 'checkout_started_at']);
  assert.ok(Date.parse(update.payload.checkout_started_at) > 0);
  assert.equal(update.payload.checkout_reminder_sent_at, null);
});

test('a Stripe API failure -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  stripe.__reply('/checkout/sessions', new Error('Stripe 500'));
  const token = actor(h, { id: 31, role: 'seeker', extra: { email: 'seeker2@example.com' } });
  const res = await checkout(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});

test('a session with no url in the response -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  stripe.__reply('/checkout/sessions', { id: 'cs_test_2' }); // no url
  const token = actor(h, { id: 32, role: 'seeker', extra: { email: 'seeker3@example.com' } });
  const res = await checkout(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});

test('requires auth like every other subscription route', async () => {
  const res = await fetch(h.base + '/api/subscription/stripe/checkout', { method: 'POST' });
  assert.equal(res.status, 401);
});
