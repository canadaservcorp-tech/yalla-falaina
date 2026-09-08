// lib/stripe-events.js is Stripe's analog of lib/subscription-events.js — the
// pure decision function the webhook route (routes/subscription.js) leans on
// for every state transition. Tested directly and thoroughly here, the same
// way test/subscription-events... — actually there is no standalone file for
// the PayPal version either, so this file also closes that gap for the
// shared pattern: a pure mapping function this important deserves direct
// unit coverage, not just incidental exercise through the HTTP webhook tests.
const test = require('node:test');
const assert = require('node:assert');
const { accountPatch } = require('../lib/stripe-events');

const NOW = new Date('2026-09-08T00:00:00.000Z');
const unix = iso => Math.floor(new Date(iso).getTime() / 1000);

test('active, not scheduled to cancel -> ACTIVE patch: status active, cancel_at cleared, retention cleared', () => {
  const sub = { status: 'active', cancel_at_period_end: false, current_period_end: unix('2026-10-08T00:00:00.000Z') };
  const patch = accountPatch(sub, NOW, null);
  assert.deepEqual(patch, {
    subscription_status: 'active', subscription_cancel_at: null,
    data_retention_deadline: null, retention_warned_at: null,
    subscription_period_end: '2026-10-08T00:00:00.000Z',
  });
});

test('trialing counts as live/active too', () => {
  const sub = { status: 'trialing', cancel_at_period_end: false, current_period_end: unix('2026-10-08T00:00:00.000Z') };
  assert.equal(accountPatch(sub, NOW, null).subscription_status, 'active');
});

test('active with no current_period_end on the object -> ACTIVE patch omits subscription_period_end rather than writing null over a good value', () => {
  const patch = accountPatch({ status: 'active', cancel_at_period_end: false }, NOW, null);
  assert.equal('subscription_period_end' in patch, false);
});

test('active + cancel_at_period_end -> GRACE patch: only subscription_cancel_at is set, status/tier untouched', () => {
  const sub = { status: 'active', cancel_at_period_end: true, current_period_end: unix('2026-10-08T00:00:00.000Z') };
  const patch = accountPatch(sub, NOW, null);
  assert.deepEqual(patch, { subscription_cancel_at: '2026-10-08T00:00:00.000Z' });
});

test('GRACE prefers the live event\'s own period end when it has one, even over a different stored value', () => {
  const sub = { status: 'active', cancel_at_period_end: true, current_period_end: unix('2026-09-10T00:00:00.000Z') };
  const patch = accountPatch(sub, NOW, '2026-10-20T00:00:00.000Z');
  assert.equal(patch.subscription_cancel_at, '2026-09-10T00:00:00.000Z');
});

test('GRACE falls back to the already-stored period end when the event carries none at all (never throws away paid days)', () => {
  const sub = { status: 'active', cancel_at_period_end: true }; // no current_period_end on this payload
  const patch = accountPatch(sub, NOW, '2026-10-20T00:00:00.000Z');
  assert.equal(patch.subscription_cancel_at, '2026-10-20T00:00:00.000Z');
});

test('GRACE falls back to now() when neither Stripe nor the stored record has a future period end', () => {
  const sub = { status: 'active', cancel_at_period_end: true };
  const patch = accountPatch(sub, NOW, null);
  assert.equal(patch.subscription_cancel_at, NOW.toISOString());
});

test('canceled -> ENDED patch: status canceled, cancel_at cleared, a 30-day retention countdown starts', () => {
  const sub = { status: 'canceled', current_period_end: unix('2026-09-08T00:00:00.000Z') };
  const patch = accountPatch(sub, NOW, null);
  assert.equal(patch.subscription_status, 'canceled');
  assert.equal(patch.subscription_cancel_at, null);
  assert.equal(patch.retention_warned_at, null);
  assert.equal(patch.data_retention_deadline, new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
});

test('unpaid and incomplete_expired also count as ENDED', () => {
  assert.equal(accountPatch({ status: 'unpaid' }, NOW, null).subscription_status, 'canceled');
  assert.equal(accountPatch({ status: 'incomplete_expired' }, NOW, null).subscription_status, 'canceled');
});

test('past_due -> GRACE-shaped patch, same as PayPal PAYMENT.FAILED: paid days kept, nothing else touched', () => {
  const sub = { status: 'past_due', current_period_end: unix('2026-09-20T00:00:00.000Z') };
  const patch = accountPatch(sub, NOW, null);
  assert.deepEqual(patch, { subscription_cancel_at: '2026-09-20T00:00:00.000Z' });
});

test('incomplete (first payment not yet resolved) and any unrecognized status -> null (no-op)', () => {
  assert.equal(accountPatch({ status: 'incomplete' }, NOW, null), null);
  assert.equal(accountPatch({ status: 'some_future_stripe_status' }, NOW, null), null);
  assert.equal(accountPatch({}, NOW, null), null);
});
