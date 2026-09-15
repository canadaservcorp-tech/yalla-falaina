// Single source of truth for "does this account currently have paid-tier
// access" — a real subscription is not the only way to get there anymore
// (lib/referral.js's grantReferralBonus() gives a referrer 30 days of access
// via users.bonus_access_until without touching subscription_status/
// subscription_tier at all, on purpose: those two columns are written by the
// PayPal/Stripe webhook handlers as a pair, and a real cancellation event
// resets subscription_tier to 'none' independent of any bonus — overloading
// them for a bonus grant would let an unrelated real-billing event silently
// wipe out a still-active bonus, or vice versa).
//
// Every place that gates on "is this seeker allowed the paid product" —
// routes/concierge.js, routes/cv.js, routes/voice.js, routes/subscription.js's
// /status — must go through here instead of reading subscription_status
// directly, so a bonus grant actually works everywhere at once.
function bonusActive(user, now = new Date()) {
  return Boolean(user && user.bonus_access_until && new Date(user.bonus_access_until) > now);
}

function hasAccess(user, now = new Date()) {
  if (!user) return false;
  return user.subscription_status === 'active' || bonusActive(user, now);
}

// The tier a quota/feature check should apply. A bonus grant reads as the
// same 'basic' tier a real subscription would — Phase 1 has exactly one paid
// tier, so there's nothing else for a bonus to grant access to.
function effectiveTier(user, now = new Date()) {
  if (!user) return 'none';
  if (user.subscription_status === 'active') return user.subscription_tier || 'basic';
  return bonusActive(user, now) ? 'basic' : 'none';
}

module.exports = { hasAccess, bonusActive, effectiveTier };
