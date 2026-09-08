// Ends access for cancelled subscriptions once the period they already paid for is over.
// Cancelling in PayPal only records subscription_cancel_at, so a seeker keeps the days
// they bought (as the Terms promise) instead of losing the concierge the same minute.
//   node scripts/subscription-lapse.js
require('dotenv').config();
const supabase = require('../db');
const sec = require('../lib/security');

async function run() {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase.from('users')
    .select('id, role, subscription_status')
    .not('subscription_cancel_at', 'is', null)
    .lte('subscription_cancel_at', now);
  if (error) throw error;

  // Anything already ended only needs the spent date cleared, so a later
  // reactivation cannot be lapsed by a date that belongs to the previous run.
  const stale = (rows || []).filter(u => !(u.subscription_status === 'active'));
  if (stale.length) {
    const { error: e } = await supabase.from('users')
      .update({ subscription_cancel_at: null }).in('id', stale.map(u => u.id));
    if (e) throw e;
  }

  const due = (rows || []).filter(u => u.subscription_status === 'active');
  for (const u of due) {
    const { error: e } = await supabase.from('users')
      // access ends now — the retention policy's 30-day deletion window starts,
      // and the pre-deletion warning flag resets for this lapse
      .update({ subscription_status: 'canceled', subscription_tier: 'none', subscription_cancel_at: null,
        data_retention_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        retention_warned_at: null }).eq('id', u.id);
    if (e) throw e;
    sec.dropUserFromCache(String(u.id));
  }
  console.log(`subscription-lapse: ${due.length} subscription(s) ended, ${stale.length} stale date(s) cleared`);
  return due.length;
}

if (require.main === module) run().catch(e => { console.error('subscription-lapse failed', e); process.exit(1); });
module.exports = { run };
