'use strict';

// Launch offer (Hicham, Sept 2026): every account gets FREE full access for
// 3 months to drive traffic — existing users from the day the promo-offer
// script grants it, new signups counting from their signup day. The offer
// stops being granted to new accounts after December 31, 2026; grants already
// made keep running their full 3 months.
//
// Mechanism: users.bonus_access_until (lib/access.js) — the same channel the
// referral reward uses, deliberately separate from subscription_status so a
// promo grant can never be wiped out by a real-billing webhook event (or
// wipe one out).
//
// promo_offer_notified_at / bonus_expiry_warned_at are bookkeeping columns
// (schema.sql users table) written by scripts/promo-offer.js and
// scripts/bonus-expiry.js, both idempotent daily jobs.

const PROMO_END = new Date('2026-12-31T23:59:59.999Z');
const PROMO_MONTHS = 3;

function promoActive(now = new Date()) {
  return now <= PROMO_END;
}

// The bonus_access_until a promo grant should set: 3 calendar months from
// now (UTC so the math is timezone-stable).
function promoBonusUntil(now = new Date()) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + PROMO_MONTHS);
  return d.toISOString();
}

module.exports = { PROMO_END, PROMO_MONTHS, promoActive, promoBonusUntil };
