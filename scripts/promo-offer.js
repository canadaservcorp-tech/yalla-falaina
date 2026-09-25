// Launch-offer announcement + grant (lib/promo.js): every existing account
// gets 3 months of free full access via users.bonus_access_until and one
// announcement email. Idempotent — promo_offer_notified_at marks an account
// as already-granted-and-notified, so this is safe to run on a schedule;
// every run picks up accounts registered since the last one.
//   node scripts/promo-offer.js
require('dotenv').config();
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const promo = require('../lib/promo');
const paginate = require('../lib/paginate');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const SUBJECT = 'Yalla Nsafer — 3 months of full access, free';

const html = (bonusUntil) => `
  <p>Good news — to celebrate our launch, every Yalla Nsafer account gets
  <b>3 months of full access, completely free</b>: the concierge, real
  verified jobs, universities and hospitals, document uploads, CV export —
  everything.</p>
  <p>Your free access is already active and runs until <b>${bonusUntil.slice(0, 10)}</b>.
  No card, no commitment — subscribe later only if you want to keep it.</p>
  <p><a href="${PUBLIC_URL}/">${PUBLIC_URL}/</a></p>`;

async function run() {
  const grant = promo.promoBonusUntil(); // 3 months from now, for everyone granted in this run
  const { data: due, error } = await paginate.fetchAllPages((from, to) =>
    supabase.from('users')
      .select('id, email, bonus_access_until')
      .is('promo_offer_notified_at', null)
      .is('banned', false)
      .range(from, to));
  if (error) throw error;

  let sent = 0;
  for (const u of due || []) {
    const bonusUntil =
      u.bonus_access_until && new Date(u.bonus_access_until) > new Date(grant)
        ? u.bonus_access_until // a longer grant (e.g. referral stacking, a comp) wins
        : grant;
    try {
      await sendEmail(u.email, SUBJECT, html(bonusUntil));
      // Grant + notify-stamp in one write so a re-run can never grant-or-
      // email twice. Pinned on promo_offer_notified_at still being null so a
      // concurrently-stamped row isn't overwritten.
      const { error: markErr } = await supabase.from('users')
        .update({ bonus_access_until: bonusUntil, promo_offer_notified_at: new Date().toISOString() })
        .eq('id', u.id).is('promo_offer_notified_at', null);
      if (markErr) console.error('promo-offer mark failed for', u.id, markErr.message);
      sent++;
    } catch (e) {
      console.error('promo-offer send failed for', u.id, e.message); // unstamped rows retry next run
    }
  }
  console.log(`promo-offer: granted+notified ${sent} account(s)`);
  return sent;
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
module.exports = { run };
