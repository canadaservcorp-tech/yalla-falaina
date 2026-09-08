const { test, after } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');

// installMockPaypal() replaces lib/paypal in require.cache — it must run
// before server.js (and therefore getApp()) is first required, or the real
// (unconfigured) module would already be cached.
const paypal = installMockPaypal();
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/subscription/status without token -> 401', async () => {
  const res = await fetch(h.base + '/api/subscription/status');
  assert.equal(res.status, 401);
});

test('GET /api/subscription/status with token -> { success, status, tier, periodEnd }', async () => {
  const token = actor(h, { id: 11, role: 'seeker', extra: { subscription_status: 'active', subscription_tier: 'basic', subscription_period_end: null } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, 'active');
  assert.equal(body.tier, 'basic');
  assert.ok('periodEnd' in body);
});

test('an unverified account cannot use authenticated endpoints -> 403', async () => {
  const token = actor(h, { id: 12, role: 'seeker', verified: false });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('a banned account is refused -> 403', async () => {
  const token = actor(h, { id: 13, role: 'seeker', banned: true });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 403);
});

// ---------- POST /api/subscription/cancel ----------
// The route is a thin PayPal-API wrapper — the actual state transition
// (subscription_cancel_at, retention deadline, etc.) is left entirely to the
// existing BILLING.SUBSCRIPTION.CANCELLED webhook handler, so these tests
// also confirm the route does NOT write to `users` itself.

const cancel = token => fetch(h.base + '/api/subscription/cancel', { method: 'POST', headers: auth(token) });

test('cancel: an active subscription calls PayPal\'s cancel API and does not touch the DB directly', async () => {
  paypal.__reset();
  const writesBefore = h.mock.__writes('users', 'update').length;
  const token = actor(h, { id: 20, role: 'seeker', extra: {
    subscription_status: 'active', paypal_subscription_id: 'SUB-20', subscription_cancel_at: null,
  } });
  const res = await cancel(token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(/keep access/i.test(body.message));

  const calls = paypal.__calls('/v1/billing/subscriptions/SUB-20/cancel');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(typeof calls[0].body.reason, 'string');

  assert.equal(h.mock.__writes('users', 'update').length, writesBefore, 'the route must leave the state transition to the webhook, not write it itself');
});

test('cancel: no subscription at all -> 400 ERR_NO_ACTIVE_SUBSCRIPTION, and PayPal is never called', async () => {
  paypal.__reset();
  const token = actor(h, { id: 21, role: 'seeker', extra: { subscription_status: 'inactive', paypal_subscription_id: null } });
  const res = await cancel(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NO_ACTIVE_SUBSCRIPTION');
  assert.equal(paypal.__calls().length, 0);
});

test('cancel: subscription_status active but no paypal_subscription_id on file -> 400 ERR_NO_ACTIVE_SUBSCRIPTION', async () => {
  paypal.__reset();
  const token = actor(h, { id: 22, role: 'seeker', extra: { subscription_status: 'active', paypal_subscription_id: null } });
  const res = await cancel(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NO_ACTIVE_SUBSCRIPTION');
  assert.equal(paypal.__calls().length, 0);
});

test('cancel: already scheduled to cancel -> idempotent 200 without calling PayPal again', async () => {
  paypal.__reset();
  const token = actor(h, { id: 23, role: 'seeker', extra: {
    subscription_status: 'active', paypal_subscription_id: 'SUB-23', subscription_cancel_at: '2026-10-01T00:00:00.000Z',
  } });
  const res = await cancel(token);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);
  assert.equal(paypal.__calls().length, 0, 'a subscription already scheduled to cancel must not re-hit PayPal');
});

test('cancel: PayPal API failure -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  paypal.__reset();
  paypal.__reply('/v1/billing/subscriptions/SUB-24/cancel', new Error('PayPal 500'));
  const token = actor(h, { id: 24, role: 'seeker', extra: {
    subscription_status: 'active', paypal_subscription_id: 'SUB-24', subscription_cancel_at: null,
  } });
  const res = await cancel(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});
