// Abandoned-checkout recovery email: someone started subscribing (clicked
// through to PayPal or Stripe Checkout — routes/subscription.js's /checkout
// and /stripe/checkout both stamp users.checkout_started_at) but never came
// back to actually finish and activate a subscription. This job finds those
// accounts an hour after they started and sends one reminder email, exactly
// once per checkout attempt.
//
// checkout_started_at is cleared the moment a webhook actually activates the
// subscription (see the `patch.checkout_started_at = null` lines next to
// every `patch.subscription_status === 'active'` branch in
// routes/subscription.js), so a row that's still sitting here an hour later
// really did leave checkout without finishing — not a webhook delivery
// delay, which resolves in seconds, not an hour.
//   node scripts/checkout-reminder.js
require('dotenv').config();
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const paginate = require('../lib/paginate');

const REMIND_AFTER_MS = 60 * 60 * 1000; // one hour — long enough that this isn't a webhook race
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

const SUBJECT = 'Still want to subscribe to Yalla Nsafer?';
const html = () => `
  <p>You started subscribing to Yalla Nsafer Basic but didn't finish checkout —
  no charge was made, and nothing is pending on your account.</p>
  <p>If that was intentional, no action needed. If you got interrupted, you can
  pick up right where you left off:</p>
  <p><a href="${PUBLIC_URL}/">${PUBLIC_URL}/</a></p>`;

async function run() {
  const cutoff = new Date(Date.now() - REMIND_AFTER_MS).toISOString();
  // Paged (see lib/paginate.js): an unbounded .select() here would silently
  // drop rows past Supabase's per-request cap once more checkouts are
  // abandoned at once than that cap allows.
  const { data: due, error } = await paginate.fetchAllPages((from, to) =>
    supabase.from('users')
      .select('id, email, subscription_status, subscription_cancel_at, checkout_started_at')
      .not('checkout_started_at', 'is', null)
      .lte('checkout_started_at', cutoff)
      .is('checkout_reminder_sent_at', null)
      .range(from, to));
  if (error) throw error;

  // Belt-and-suspenders alongside the webhook's own checkout_started_at
  // clear: an account that is somehow already active has nothing to
  // recover — never email a real subscriber "still want to subscribe?".
  // Exception: an active row WITH a pending cancellation (subscription_cancel_at
  // set) is a PayPal "resume" flow — PayPal can't un-cancel, so the UI starts a
  // replacement checkout while the old sub still reads active until it lapses.
  // Abandoning THAT checkout is exactly what this email exists for, so keep it
  // as a candidate; only genuinely-renewing active subs are excluded.
  const candidates = (due || []).filter(u => u.subscription_status !== 'active' || u.subscription_cancel_at);

  let sent = 0;
  for (const u of candidates) {
    try {
      await sendEmail(u.email, SUBJECT, html());
      // Pinned to the checkout_started_at this run actually saw, so a brand
      // new checkout attempt that started (and reset checkout_started_at)
      // between the read above and this write still gets its own reminder
      // later, instead of being marked sent for an attempt it wasn't.
      const { error: markErr } = await supabase.from('users')
        .update({ checkout_reminder_sent_at: new Date().toISOString() })
        .eq('id', u.id).eq('checkout_started_at', u.checkout_started_at);
      // Supabase reports write failures in `error` rather than throwing — an
      // ignored failure here would leave the row eligible and re-email every
      // hourly run. Retry once and log loud; the email is already out either
      // way, so sent++ still counts it.
      if (markErr) {
        const { error: retryErr } = await supabase.from('users')
          .update({ checkout_reminder_sent_at: new Date().toISOString() })
          .eq('id', u.id).eq('checkout_started_at', u.checkout_started_at);
        console.error(`checkout reminder mark ${u.id}`, markErr.message, retryErr ? `retry: ${retryErr.message}` : '(retry ok)');
      }
      sent++;
    } catch (e) { console.error(`checkout reminder ${u.id}`, e.message); }
  }
  console.log(`checkout-reminder: ${sent} reminder(s) sent`);
  return sent;
}

if (require.main === module) run().catch(e => { console.error('checkout-reminder failed', e); process.exit(1); });
module.exports = { run };
