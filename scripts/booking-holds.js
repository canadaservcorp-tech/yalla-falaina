// Keeps booking deposits honest between the API calls:
//   1. reminds seekers to authorize once the slot is close enough for a hold to survive;
//   2. drops requests and unauthorized bookings whose slot has passed;
//   3. releases holds that PayPal is about to stop honouring, so nothing is charged late.
// Idempotent — safe to run hourly.
//   node scripts/booking-holds.js
require('dotenv').config();
const supabase = require('../db');
const { notify } = require('../lib/notify');
const { releaseHold } = require('../routes/bookings');

const iso = ms => new Date(ms).toISOString();

async function run() {
  const now = Date.now();
  const { data, error } = await supabase.from('bookings')
    .select('id, seeker_id, provider_id, status, scheduled_at, authorize_from, auth_expires_at, auth_reminded_at, paypal_authorization_id, deposit_cents')
    .in('status', ['requested', 'accepted', 'authorized']);
  if (error) { console.error('booking-holds read', error.message); process.exitCode = 1; return; }
  const rows = Array.isArray(data) ? data : [];
  let reminded = 0, closed = 0, released = 0;

  for (const b of rows) {
    const slot = new Date(b.scheduled_at).getTime();

    // the slot came and went without a deposit: the booking never became real
    if (b.status !== 'authorized' && slot < now) {
      await supabase.from('bookings')
        .update({ status: 'cancelled_void', cancelled_by: 'seeker', updated_at: iso(now) })
        .eq('id', b.id).eq('status', b.status);
      await notify(b.provider_id, 'booking_cancelled');
      closed++;
      continue;
    }

    // hold window open and still no deposit: ask the seeker once
    if (b.status === 'accepted' && new Date(b.authorize_from).getTime() <= now && !b.auth_reminded_at) {
      await supabase.from('bookings').update({ auth_reminded_at: iso(now) })
        .eq('id', b.id).is('auth_reminded_at', null);
      await notify(b.seeker_id, 'booking_auth_due');
      reminded++;
      continue;
    }

    // PayPal stops honouring an authorization after ~3 days; release it rather than
    // let it lapse silently while both sides still believe a deposit is held
    if (b.status === 'authorized' && b.auth_expires_at
        && new Date(b.auth_expires_at).getTime() - now < 6 * 60 * 60 * 1000) {
      const r = await releaseHold(b);
      if (!r.ok) { console.error('booking-holds release', b.id, r.error); continue; }
      await supabase.from('bookings')
        .update({ status: 'expired', updated_at: iso(now) })
        .eq('id', b.id).eq('status', 'authorized');
      await notify(b.seeker_id, 'booking_expired');
      await notify(b.provider_id, 'booking_expired');
      released++;
    }
  }
  console.log(`booking-holds: ${rows.length} open, ${reminded} reminded, ${closed} closed, ${released} released`);
}

if (require.main === module) run().then(() => process.exit(process.exitCode || 0));
module.exports = { run };
