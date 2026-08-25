// Ends access for cancelled subscriptions once the period they already paid for is over.
// Cancelling in PayPal only records subscription_cancel_at, so a provider keeps the days
// they bought (as the Terms promise) instead of disappearing from search the same minute.
//   node scripts/subscription-lapse.js
require('dotenv').config();
const supabase = require('../db');
const sec = require('../lib/security');

async function run() {
  const now = new Date().toISOString();
  const { data: due, error } = await supabase.from('users')
    .select('id')
    .eq('subscription_status', 'active')
    .not('subscription_cancel_at', 'is', null)
    .lte('subscription_cancel_at', now);
  if (error) throw error;

  for (const u of due || []) {
    const { error: e } = await supabase.from('users')
      .update({ subscription_status: 'canceled', subscription_cancel_at: null }).eq('id', u.id);
    if (e) throw e;
    sec.dropUserFromCache(String(u.id));
  }
  console.log(`subscription-lapse: ${(due || []).length} subscription(s) ended`);
  return (due || []).length;
}

if (require.main === module) run().catch(e => { console.error('subscription-lapse failed', e); process.exit(1); });
module.exports = { run };
