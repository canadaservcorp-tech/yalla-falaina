// Daily reminders: subscriptions ending in 7 days, boosts ending within 24h.
// Safe to run repeatedly — the unique index in schema-notifications.sql keeps one
// unread reminder of each kind per user.
//   node scripts/notify-expiries.js
require('dotenv').config();
const supabase = require('../db');
const { notify } = require('../lib/notify');

const HOURS = h => new Date(Date.now() + h * 3600 * 1000).toISOString();

async function run() {
  let subs = 0, boosts = 0;

  // subscriptions renewing in 6-7 days (a day-wide window, so a daily run can't skip anyone)
  const { data: expiring, error: subErr } = await supabase.from('users')
    .select('id, subscription_period_end')
    .eq('subscription_status', 'active')
    .gt('subscription_period_end', HOURS(6 * 24))
    .lte('subscription_period_end', HOURS(7 * 24));
  if (subErr) throw subErr;
  for (const u of expiring || []) {
    if ((await notify(u.id, 'sub_expiring')).sent) subs++;
  }

  const { data: ending, error: boostErr } = await supabase.from('providers')
    .select('user_id, boost_until')
    .gt('boost_until', new Date().toISOString())
    .lte('boost_until', HOURS(24));
  if (boostErr) throw boostErr;
  for (const p of ending || []) {
    if ((await notify(p.user_id, 'boost_ending')).sent) boosts++;
  }

  console.log(`notify-expiries: ${subs} subscription reminder(s), ${boosts} boost reminder(s)`);
}

if (require.main === module) run().catch(e => { console.error('notify-expiries failed', e); process.exit(1); });
module.exports = { run };
