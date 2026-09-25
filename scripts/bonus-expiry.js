// "Your free access ends soon" warning (scripts/promo-offer.js's counterpart):
// emails an account ~7 days before its users.bonus_access_until runs out, so
// the launch-offer period ends on a clear heads-up, not a silent paywall.
// Idempotent: bonus_expiry_warned_at is stamped per send; a later re-grant
// that pushes bonus_access_until further out re-arms the warning because the
// old stamp then sits more than WARN_DAYS before the new expiry.
//   node scripts/bonus-expiry.js
require('dotenv').config();
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const paginate = require('../lib/paginate');

const WARN_DAYS = 7;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const SUBJECT = 'Your Yalla Nsafer free access ends soon';

const html = (until) => `
  <p>Your free access to Yalla Nsafer ends on <b>${until.slice(0, 10)}</b> — in
  about a week. After that the concierge, uploads and CV export need a
  subscription ($25/month).</p>
  <p>To keep everything without interruption, subscribe from the app:</p>
  <p><a href="${PUBLIC_URL}/">${PUBLIC_URL}/</a></p>`;

async function run() {
  const now = Date.now();
  const horizon = new Date(now + WARN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due, error } = await paginate.fetchAllPages((from, to) =>
    supabase.from('users')
      .select('id, email, bonus_access_until, bonus_expiry_warned_at, subscription_status')
      .gt('bonus_access_until', new Date(now).toISOString())
      .lte('bonus_access_until', horizon)
      .range(from, to));
  if (error) throw error;

  let sent = 0;
  for (const u of due || []) {
    if (u.subscription_status === 'active' && !u.bonus_access_until) continue;
    // Already warned for THIS expiry date? warned_at is stamped ~WARN_DAYS
    // before the expiry it was sent for — a re-grant that pushed the expiry
    // further out leaves the old stamp >WARN_DAYS before the new one, which
    // correctly re-arms the warning.
    if (u.bonus_expiry_warned_at &&
        new Date(u.bonus_access_until) - new Date(u.bonus_expiry_warned_at) <= WARN_DAYS * 24 * 60 * 60 * 1000) continue;
    try {
      await sendEmail(u.email, SUBJECT, html(u.bonus_access_until));
      const { error: markErr } = await supabase.from('users')
        .update({ bonus_expiry_warned_at: new Date().toISOString() })
        .eq('id', u.id).eq('bonus_access_until', u.bonus_access_until);
      if (markErr) console.error('bonus-expiry mark failed for', u.id, markErr.message);
      sent++;
    } catch (e) {
      console.error('bonus-expiry send failed for', u.id, e.message);
    }
  }
  console.log(`bonus-expiry: warned ${sent} account(s)`);
  return sent;
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
module.exports = { run };
