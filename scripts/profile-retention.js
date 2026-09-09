// Enforces the 30-day post-cancellation retention policy: when a subscription
// lapses, users.data_retention_deadline is set to lapse+30d (subscription-lapse.js
// / subscription-events.js). This job (a) emails a one-time warning shortly
// before the deadline, and (b) past the deadline permanently deletes the
// profile and everything the seeker shared — profile row, intake answers,
// concierge conversations, uploaded documents — while the users row (account
// credentials) stays so they can return and start over.
//   node scripts/profile-retention.js
require('dotenv').config();
const supabase = require('../db');
const { sendEmail } = require('../lib/email');

const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';
const WARN_BEFORE_MS = 7 * 24 * 60 * 60 * 1000; // warn a week out — "never a surprise"

const WARN_SUBJECT = 'Your Yalla Nsafer profile will be deleted soon';
const warnHtml = deadline => `
  <p>Your Yalla Nsafer subscription ended, and the 30-day window to reactivate
  closes on <b>${new Date(deadline).toDateString()}</b>.</p>
  <p>If you resubscribe before then, everything stays exactly as you left it.
  Otherwise your profile and the intake information you shared with the
  concierge — work history, education, languages, and travel-readiness answers —
  are permanently deleted. Your account itself stays, so you can always sign
  back in, but the details would need to be rebuilt from scratch.</p>`;

// Removes everything derived from the profile while keeping the users row.
// Returns false on ANY failure and leaves the deadline untouched so the next
// run retries — a partial deletion must not strand the remaining data paths.
// Order matters: storage objects have no cascade, and concierge_conversations
// only SET NULLs profile_id — both must be removed by hand before the
// profiles row goes (it cascades seeker_profiles, document_uploads, daily_usage,
// and with them the storage_path a retry would need).
async function deleteProfileData(userId) {
  const { data: docs, error: dSelErr } = await supabase.from('document_uploads')
    .select('id, storage_path').eq('profile_id', userId);
  if (dSelErr) { console.error(`retention docs ${userId}`, dSelErr.message); return false; }
  for (const d of docs || []) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([d.storage_path]);
    if (sErr) { console.error(`retention storage ${d.id}`, sErr.message); return false; }
  }
  const { error: cErr } = await supabase.from('concierge_conversations')
    .delete().eq('profile_id', userId);
  if (cErr) { console.error(`retention conversations ${userId}`, cErr.message); return false; }
  const { error: pErr } = await supabase.from('profiles').delete().eq('id', userId);
  if (pErr) { console.error(`retention profiles ${userId}`, pErr.message); return false; }
  return true;
}

async function run() {
  const now = Date.now();
  const { data: due, error } = await supabase.from('users')
    .select('id, email, data_retention_deadline, retention_warned_at')
    .eq('subscription_status', 'canceled')
    .not('data_retention_deadline', 'is', null);
  if (error) throw error;

  let warned = 0, deleted = 0;
  for (const u of due || []) {
    const deadline = new Date(u.data_retention_deadline).getTime();
    if (deadline <= now) {
      // Revalidate immediately before destructive work — a concurrent PayPal
      // activation/renewal can clear the deadline between this list read and
      // the deletes, and that user must keep their data.
      const { data: still } = await supabase.from('users')
        .select('id').eq('id', u.id)
        .eq('subscription_status', 'canceled')
        .eq('data_retention_deadline', u.data_retention_deadline)
        .maybeSingle();
      if (!still) continue;
      if (!(await deleteProfileData(u.id))) continue; // leave the deadline — retry next run
      // The account survives as credentials only: the profile fields register()
      // copied here (name, phone) are part of the deleted profile data.
      // The conditional .eq on the deadline keeps a concurrent reactivation
      // from being overwritten — if it fired, this update matches no row.
      const { error: e } = await supabase.from('users')
        .update({ name: null, phone: null, data_retention_deadline: null, retention_warned_at: null })
        .eq('id', u.id).eq('data_retention_deadline', u.data_retention_deadline);
      if (e) console.error(`retention clear ${u.id}`, e.message); else deleted++;
    } else if (!u.retention_warned_at && deadline - now <= WARN_BEFORE_MS) {
      try {
        await sendEmail(u.email, WARN_SUBJECT, warnHtml(u.data_retention_deadline));
        await supabase.from('users').update({ retention_warned_at: new Date().toISOString() }).eq('id', u.id);
        warned++;
      } catch (e) { console.error(`retention warn ${u.id}`, e.message); }
    }
  }
  console.log(`profile-retention: ${warned} warning(s) sent, ${deleted} profile(s) permanently deleted`);
  return { warned, deleted };
}

if (require.main === module) run().catch(e => { console.error('profile-retention failed', e); process.exit(1); });
module.exports = { run };
