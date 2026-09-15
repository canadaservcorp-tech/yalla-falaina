// POST /api/subscription/checkout (PayPal) — happy path plus the
// checkout_started_at/checkout_reminder_sent_at bookkeeping that feeds
// scripts/checkout-reminder.js's abandoned-checkout email. The
// unconfigured-provider error path is already covered in test/error-codes.test.js.
process.env.PAYPAL_PLAN_ID = 'P-TEST-PLAN';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');

const paypal = installMockPaypal();
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => { paypal.__reset(); h.mock.__reset(); });

const checkout = token => fetch(h.base + '/api/subscription/checkout', { method: 'POST', headers: auth(token) });

test('starts a PayPal subscription and stamps checkout_started_at (resetting any prior reminder)', async () => {
  paypal.__reply('/v1/billing/subscriptions', {
    id: 'SUB-99', links: [{ rel: 'approve', href: 'https://paypal.test/approve/SUB-99' }],
  });
  const token = actor(h, { id: 40, role: 'seeker', extra: { email: 'seeker@example.com' } });
  const res = await checkout(token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.url, 'https://paypal.test/approve/SUB-99');

  const [update] = h.mock.__writes('users', 'update');
  assert.equal(update.payload.paypal_subscription_id, 'SUB-99');
  assert.ok(Date.parse(update.payload.checkout_started_at) > 0);
  assert.equal(update.payload.checkout_reminder_sent_at, null, 'a new attempt clears any reminder from a previous abandoned one');
});

test('no approval link in the PayPal response -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  paypal.__reply('/v1/billing/subscriptions', { id: 'SUB-100', links: [] });
  const token = actor(h, { id: 41, role: 'seeker', extra: { email: 'seeker2@example.com' } });
  const res = await checkout(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});

test('requires auth like every other subscription route', async () => {
  const res = await fetch(h.base + '/api/subscription/checkout', { method: 'POST' });
  assert.equal(res.status, 401);
});
