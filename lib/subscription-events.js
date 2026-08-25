// Decides what a PayPal billing event means for an account, so the rules are
// testable without PayPal in the loop.
//
// Cancelling keeps the access already paid for (the Terms promise access until the
// end of the paid period), so a cancellation only records when it lapses; a job
// (scripts/subscription-lapse.js) flips the account once that moment passes.
const ACTIVE = new Set(['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.RE-ACTIVATED']);
const GRACE = new Set([
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
]);
const ENDED = new Set(['BILLING.SUBSCRIPTION.EXPIRED']);
const RENEWAL = 'PAYMENT.SALE.COMPLETED';

// The subscription a recurring payment belongs to; a sale's own id identifies the
// payment, not the agreement.
function subscriptionId(eventType, resource = {}) {
  if (eventType === RENEWAL) return resource.billing_agreement_id || '';
  return resource.id || resource.billing_agreement_id || '';
}

function boostUserId(eventType, resource = {}) {
  const tag = String(resource.custom_id || resource.custom || '');
  const m = /^boost:(\d+)/.exec(tag);
  return m ? Number(m[1]) : null;
}

// null = the event says nothing about access (e.g. a one-time order payment).
// knownPeriodEnd is the date already stored for the account: PayPal drops
// next_billing_time from a cancelled agreement, and without it a cancellation
// would throw away days that were paid for.
function accountPatch(eventType, resource = {}, now = new Date(), knownPeriodEnd = null) {
  const periodEnd = resource.billing_info?.next_billing_time || null;
  if (ACTIVE.has(eventType) || eventType === RENEWAL) {
    const patch = { subscription_status: 'active', subscription_cancel_at: null };
    if (periodEnd) patch.subscription_period_end = periodEnd;
    return patch;
  }
  if (ENDED.has(eventType)) {
    const patch = { subscription_status: 'canceled', subscription_cancel_at: null };
    if (periodEnd) patch.subscription_period_end = periodEnd;
    return patch;
  }
  if (GRACE.has(eventType)) {
    // keep the paid days; lapse now when nothing is paid for
    const paidUntil = [periodEnd, knownPeriodEnd].find(d => d && new Date(d) > now) || null;
    return { subscription_cancel_at: paidUntil || now.toISOString() };
  }
  return null;
}

module.exports = { accountPatch, subscriptionId, boostUserId, ACTIVE, GRACE, ENDED, RENEWAL };
