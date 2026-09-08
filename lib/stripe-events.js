// Decides what a Stripe subscription event means for an account — the Stripe
// analog of lib/subscription-events.js, kept as its own file (rather than
// merged into it) because Stripe's event shape is genuinely different: every
// event that matters here carries the FULL current subscription object
// (status, cancel_at_period_end, current_period_end), not a partial resource
// keyed by event-type name the way PayPal's webhooks are. So instead of a
// per-event-type Set lookup, this reads the subscription's own `status`
// directly — but produces the exact same three-way ACTIVE/GRACE/ENDED patch
// shapes as the PayPal version, so routes/subscription.js's webhook handler
// can apply either one identically.
//
// Same cancellation philosophy as PayPal: the Terms promise access until the
// end of the paid period, so a subscriber-initiated cancel only ever sets
// `cancel_at_period_end` on Stripe's side — that surfaces here as a GRACE
// patch (cancel_at recorded, status/tier untouched). The ENDED transition
// only happens when Stripe itself reports the subscription gone
// (`customer.subscription.deleted`, fired once the paid period actually
// elapses), mirroring PayPal's BILLING.SUBSCRIPTION.EXPIRED.
const LIVE = new Set(['active', 'trialing']);
const DEAD = new Set(['canceled', 'unpaid', 'incomplete_expired']);
// 'past_due': a renewal charge failed but Stripe is still retrying — same
// "keep the paid days, don't cancel yet" grace as PayPal's PAYMENT.FAILED.
// 'incomplete': the very first payment on a brand-new subscription hasn't
// resolved yet — nothing to do until it becomes 'active' or expires.

function isoFromUnix(seconds) {
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

// sub: a Stripe subscription object (from checkout.session's linked
// subscription, or the object embedded in customer.subscription.* events).
// now/knownPeriodEnd mirror subscription-events.js's accountPatch signature.
function accountPatch(sub = {}, now = new Date(), knownPeriodEnd = null) {
  const status = sub.status;
  const periodEnd = isoFromUnix(sub.current_period_end);

  if (LIVE.has(status)) {
    if (sub.cancel_at_period_end) {
      const paidUntil = [periodEnd, knownPeriodEnd].find(d => d && new Date(d) > now) || null;
      return { subscription_cancel_at: paidUntil || now.toISOString() };
    }
    const patch = {
      subscription_status: 'active', subscription_cancel_at: null,
      data_retention_deadline: null, retention_warned_at: null,
    };
    if (periodEnd) patch.subscription_period_end = periodEnd;
    return patch;
  }

  if (DEAD.has(status)) {
    const patch = {
      subscription_status: 'canceled', subscription_cancel_at: null,
      data_retention_deadline: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      retention_warned_at: null,
    };
    if (periodEnd) patch.subscription_period_end = periodEnd;
    return patch;
  }

  if (status === 'past_due') {
    const paidUntil = [periodEnd, knownPeriodEnd].find(d => d && new Date(d) > now) || null;
    return { subscription_cancel_at: paidUntil || now.toISOString() };
  }

  return null; // 'incomplete' and anything unrecognized: not yet actionable
}

module.exports = { accountPatch, LIVE, DEAD };
