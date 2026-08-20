// Deposit and cancellation rules for bookings, in one place so the API, the
// reminder job and the policy shown to the seeker can never disagree.
//
// Deposit: 15% of the quoted price, at least $20 and at most $150 (CAD).
// Cancellation: a seeker who cancels 24h or more before the slot owes nothing;
// later than that, or a no-show, and the held deposit is captured. A provider
// who cancels or does not show releases the hold in full.
const RATE = 0.15;
const MIN_CENTS = 2000;
const MAX_CENTS = 15000;
const FREE_CANCEL_MS = 24 * 60 * 60 * 1000;

// PayPal only guarantees an authorization for about three days, so the hold is
// taken close to the slot instead of at booking time for anything further out.
const AUTH_WINDOW_MS = 72 * 60 * 60 * 1000;

// A slot must leave time to travel to it, and quotes stale beyond a season.
const MIN_LEAD_MS = 2 * 60 * 60 * 1000;
const MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;

const POLICY_VERSION = '2026-08-1';

const depositCents = quotedCents =>
  Math.min(MAX_CENTS, Math.max(MIN_CENTS, Math.round(quotedCents * RATE)));

// When the seeker may authorize: never before the hold would outlive its honour period.
const authorizeFrom = (scheduledAt, now = Date.now()) =>
  new Date(Math.max(now, new Date(scheduledAt).getTime() - AUTH_WINDOW_MS));

// true when cancelling now costs the seeker the deposit
const cancelIsLate = (scheduledAt, now = Date.now()) =>
  new Date(scheduledAt).getTime() - now < FREE_CANCEL_MS;

const money = cents => (cents / 100).toFixed(2);

// Shown at booking and accepted explicitly; the accepted version is stored per booking.
function policyText(lang, depositC) {
  const fr = {
    title: 'Politique de réservation',
    lines: [
      `Dépôt de ${money(depositC)} $ CAD (15 % du prix estimé, min. 20 $, max. 150 $) — autorisé sur votre carte, non prélevé.`,
      'Annulation 24 h ou plus avant le rendez-vous : autorisation annulée, aucun frais.',
      'Annulation moins de 24 h avant, ou absence : le dépôt est prélevé et versé au prestataire.',
      'Si le prestataire annule ou ne se présente pas : le dépôt est libéré en entier, vous ne payez rien.',
      'Le solde se règle directement avec le prestataire. TrouvePro met en relation et ne certifie pas les travaux.',
    ],
    accept: 'J’accepte la politique de réservation',
  };
  const en = {
    title: 'Booking policy',
    lines: [
      `Deposit of $${money(depositC)} CAD (15% of the estimated price, min $20, max $150) — authorized on your card, not charged.`,
      'Cancel 24h or more before the appointment: the authorization is released, no charge.',
      'Cancel less than 24h before, or no-show: the deposit is captured and paid to the provider.',
      'If the provider cancels or does not show up: the deposit is released in full and you pay nothing.',
      'The balance is settled directly with the provider. TrouvePro connects people; it does not certify work.',
    ],
    accept: 'I accept the booking policy',
  };
  return lang === 'en' ? en : fr;
}

module.exports = {
  RATE, MIN_CENTS, MAX_CENTS, FREE_CANCEL_MS, AUTH_WINDOW_MS,
  MIN_LEAD_MS, MAX_LEAD_MS, POLICY_VERSION,
  depositCents, authorizeFrom, cancelIsLate, policyText, money,
};
