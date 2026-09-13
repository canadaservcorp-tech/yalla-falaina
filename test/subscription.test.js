const { test, after } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');
const { installMockStripe } = require('./helpers/mockStripe');

// Both mocks replace their real lib/* module in require.cache — must run
// before server.js (and therefore getApp()) is first required, or the real
// (unconfigured) module would already be cached.
const paypal = installMockPaypal();
const stripe = installMockStripe();
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/subscription/status without token -> 401', async () => {
  const res = await fetch(h.base + '/api/subscription/status');
  assert.equal(res.status, 401);
});

test('GET /api/subscription/status with token -> { success, status, tier, periodEnd, cancelAt }', async () => {
  const token = actor(h, { id: 11, role: 'seeker', extra: { subscription_status: 'active', subscription_tier: 'basic', subscription_period_end: null } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, 'active');
  assert.equal(body.tier, 'basic');
  assert.ok('periodEnd' in body);
  assert.equal(body.cancelAt, null, 'no cancellation on file');
});

// The grace-period banner bug: cancel_at_period_end (routes/subscription.js's
// /cancel) leaves subscription_status = 'active' until the paid period
// actually ends — status alone can't tell "will renew" from "already
// canceled, just counting down to expiry" apart. Without cancelAt, the
// client showed "active (renews {date})" to someone who had, in fact,
// already canceled.
test('GET /api/subscription/status surfaces subscription_cancel_at as cancelAt, so a canceled-but-still-active subscriber can be told apart from a genuinely renewing one', async () => {
  const token = actor(h, { id: 14, role: 'seeker', extra: {
    subscription_status: 'active', subscription_tier: 'basic',
    subscription_period_end: '2026-10-15T00:00:00.000Z',
    subscription_cancel_at: '2026-10-15T00:00:00.000Z',
  } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  const body = await res.json();
  assert.equal(body.status, 'active', 'status stays active through the paid-out period');
  assert.equal(body.cancelAt, '2026-10-15T00:00:00.000Z');
});

test('GET /api/subscription/status surfaces payment_provider as provider, defaulting to paypal for a pre-Stripe row', async () => {
  const token = actor(h, { id: 15, role: 'seeker', extra: { subscription_status: 'active', subscription_tier: 'basic' } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  const body = await res.json();
  assert.equal(body.provider, 'paypal', 'no payment_provider column set at all -- must default to paypal, the only rail that could have written a row like this');
});

test('GET /api/subscription/status surfaces provider: stripe for a Stripe subscriber', async () => {
  const token = actor(h, { id: 16, role: 'seeker', extra: { subscription_status: 'active', payment_provider: 'stripe' } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  const body = await res.json();
  assert.equal(body.provider, 'stripe');
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

// ---------- cancel: the Stripe branch ----------
// Same route, same idempotency/error shapes — only the provider dispatch
// (payment_provider column) and which API gets called should differ.

test('cancel: payment_provider stripe calls Stripe with cancel_at_period_end, not PayPal, and does not touch the DB directly', async () => {
  paypal.__reset(); stripe.__reset();
  const writesBefore = h.mock.__writes('users', 'update').length;
  const token = actor(h, { id: 50, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_50', subscription_cancel_at: null,
  } });
  const res = await cancel(token);
  assert.equal(res.status, 200);
  assert.ok(/keep access/i.test((await res.json()).message));

  const calls = stripe.__calls('/subscriptions/sub_50');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].params.cancel_at_period_end, 'true');
  assert.equal(paypal.__calls().length, 0, 'a Stripe subscriber must never hit the PayPal API');
  assert.equal(h.mock.__writes('users', 'update').length, writesBefore, 'the route must leave the state transition to the Stripe webhook');
});

test('cancel: payment_provider stripe but no stripe_subscription_id on file -> 400 ERR_NO_ACTIVE_SUBSCRIPTION, Stripe never called', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 51, role: 'seeker', extra: { subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: null } });
  const res = await cancel(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NO_ACTIVE_SUBSCRIPTION');
  assert.equal(stripe.__calls().length, 0);
});

test('cancel: Stripe API failure -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  paypal.__reset(); stripe.__reset();
  stripe.__reply('/subscriptions/sub_52', new Error('Stripe 500'));
  const token = actor(h, { id: 52, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_52', subscription_cancel_at: null,
  } });
  const res = await cancel(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});

test('cancel: already scheduled (Stripe subscriber) -> idempotent 200 without calling Stripe again', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 53, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_53', subscription_cancel_at: '2026-10-01T00:00:00.000Z',
  } });
  const res = await cancel(token);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);
  assert.equal(stripe.__calls().length, 0);
});

test('cancel: a row with no payment_provider set at all defaults to the PayPal branch (pre-Stripe rows)', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 54, role: 'seeker', extra: {
    subscription_status: 'active', paypal_subscription_id: 'SUB-54', subscription_cancel_at: null,
    // no payment_provider field at all
  } });
  const res = await cancel(token);
  assert.equal(res.status, 200);
  assert.equal(paypal.__calls('/v1/billing/subscriptions/SUB-54/cancel').length, 1);
  assert.equal(stripe.__calls().length, 0);
});

// ---------- POST /api/subscription/resume (Devin's review on PR #56) ----------
// Stripe can genuinely undo a pending cancel_at_period_end on the SAME
// subscription; PayPal cannot (its own /cancel above is an immediate,
// terminal cancellation on PayPal's side) -- this route only ever handles
// the Stripe branch and explicitly refuses the PayPal one rather than
// pretending to support it. The client calls POST /checkout directly for a
// PayPal account instead (see public/index.html's resumeSubBtn handler).

const resume = token => fetch(h.base + '/api/subscription/resume', { method: 'POST', headers: auth(token) });

test('resume: a Stripe subscriber mid-grace-period gets cancel_at_period_end flipped back to false, and the route does not write to the DB directly', async () => {
  paypal.__reset(); stripe.__reset();
  const writesBefore = h.mock.__writes('users', 'update').length;
  const token = actor(h, { id: 60, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_60',
    subscription_cancel_at: '2026-10-15T00:00:00.000Z',
  } });
  const res = await resume(token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);

  const calls = stripe.__calls('/subscriptions/sub_60');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].params.cancel_at_period_end, 'false');
  assert.equal(paypal.__calls().length, 0);
  assert.equal(h.mock.__writes('users', 'update').length, writesBefore, 'the state transition is left to the Stripe webhook, same discipline as /cancel');
});

test('resume: nothing pending to resume (no subscription_cancel_at) -> 400 ERR_NOT_CANCELING, Stripe never called', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 61, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_61', subscription_cancel_at: null,
  } });
  const res = await resume(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NOT_CANCELING');
  assert.equal(stripe.__calls().length, 0);
});

test('resume: no subscription at all -> 400 ERR_NOT_CANCELING', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 62, role: 'seeker', extra: { subscription_status: 'inactive', subscription_cancel_at: null } });
  const res = await resume(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NOT_CANCELING');
});

test('resume: a PayPal subscriber mid-grace-period is explicitly refused -> 400 ERR_RESUME_NEEDS_NEW_PAYPAL_SUB, neither provider called', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 63, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'paypal', paypal_subscription_id: 'SUB-63',
    subscription_cancel_at: '2026-10-15T00:00:00.000Z',
  } });
  const res = await resume(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_RESUME_NEEDS_NEW_PAYPAL_SUB');
  assert.equal(paypal.__calls().length, 0);
  assert.equal(stripe.__calls().length, 0);
});

test('resume: a row with no payment_provider set at all (pre-Stripe) is treated as PayPal and refused, not silently routed to Stripe', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 64, role: 'seeker', extra: {
    subscription_status: 'active', subscription_cancel_at: '2026-10-15T00:00:00.000Z',
    // no payment_provider field at all
  } });
  const res = await resume(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_RESUME_NEEDS_NEW_PAYPAL_SUB');
  assert.equal(stripe.__calls().length, 0);
});

test('resume: Stripe subscriber mid-grace-period but no stripe_subscription_id on file -> 400 ERR_NO_ACTIVE_SUBSCRIPTION', async () => {
  paypal.__reset(); stripe.__reset();
  const token = actor(h, { id: 65, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: null,
    subscription_cancel_at: '2026-10-15T00:00:00.000Z',
  } });
  const res = await resume(token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'ERR_NO_ACTIVE_SUBSCRIPTION');
  assert.equal(stripe.__calls().length, 0);
});

test('resume: Stripe API failure -> 500 ERR_PAYMENT_UNAVAILABLE', async () => {
  paypal.__reset(); stripe.__reset();
  stripe.__reply('/subscriptions/sub_66', new Error('Stripe 500'));
  const token = actor(h, { id: 66, role: 'seeker', extra: {
    subscription_status: 'active', payment_provider: 'stripe', stripe_subscription_id: 'sub_66',
    subscription_cancel_at: '2026-10-15T00:00:00.000Z',
  } });
  const res = await resume(token);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});
