const { test } = require('node:test');
const assert = require('node:assert');
const ev = require('../lib/subscription-events');

const NOW = new Date('2026-03-01T00:00:00.000Z');
const FUTURE = '2026-03-20T00:00:00.000Z';
const PAST = '2026-02-20T00:00:00.000Z';

test('activation marks the account active and clears any pending lapse', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.ACTIVATED', { billing_info: { next_billing_time: FUTURE } }, NOW);
  assert.deepEqual(p, { subscription_status: 'active', subscription_cancel_at: null, subscription_period_end: FUTURE });
});

test('a cancellation keeps the paid days instead of ending access at once', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.CANCELLED', { billing_info: { next_billing_time: FUTURE } }, NOW);
  assert.deepEqual(p, { subscription_cancel_at: FUTURE });
  assert.ok(!('subscription_status' in p));
});

test('a cancellation with nothing left paid for lapses now', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.SUSPENDED', { billing_info: { next_billing_time: PAST } }, NOW);
  assert.deepEqual(p, { subscription_cancel_at: NOW.toISOString() });
});

test('a cancelled agreement carries no next billing date, so the stored one is kept', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.CANCELLED', { status: 'CANCELLED' }, NOW, FUTURE);
  assert.deepEqual(p, { subscription_cancel_at: FUTURE });
  const spent = ev.accountPatch('BILLING.SUBSCRIPTION.CANCELLED', { status: 'CANCELLED' }, NOW, PAST);
  assert.deepEqual(spent, { subscription_cancel_at: NOW.toISOString() });
});

test('expiry keeps the period end it already had', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.EXPIRED', {}, NOW, FUTURE);
  assert.ok(!('subscription_period_end' in p));
});

test('expiry ends access immediately', () => {
  const p = ev.accountPatch('BILLING.SUBSCRIPTION.EXPIRED', {}, NOW);
  assert.equal(p.subscription_status, 'canceled');
  assert.equal(p.subscription_cancel_at, null);
});

test('a renewal payment re-activates and cancels a pending lapse', () => {
  const p = ev.accountPatch('PAYMENT.SALE.COMPLETED', { billing_info: { next_billing_time: FUTURE } }, NOW);
  assert.equal(p.subscription_status, 'active');
  assert.equal(p.subscription_cancel_at, null);
  assert.equal(p.subscription_period_end, FUTURE);
});

test('an unrelated event changes nothing', () => {
  assert.equal(ev.accountPatch('CHECKOUT.ORDER.APPROVED', {}, NOW), null);
});

test('a renewal is attributed to its agreement, not to the payment id', () => {
  assert.equal(ev.subscriptionId('PAYMENT.SALE.COMPLETED', { id: 'SALE-1', billing_agreement_id: 'I-SUB' }), 'I-SUB');
  assert.equal(ev.subscriptionId('PAYMENT.SALE.COMPLETED', { id: 'SALE-1' }), '');
  assert.equal(ev.subscriptionId('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB' }), 'I-SUB');
});