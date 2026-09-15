// Unverified-signup nudge email: someone registered but never clicked the
// confirmation link (routes/auth.js's own registration email, or a manual
// /resend-verification). This job finds accounts still unverified a day
// later and sends one nudge, exactly once, reusing routes/auth.js's own
// token-rotation logic (POST /resend-verification) rather than inventing a
// second way to issue a verification link — the original signup email may be
// long gone from an inbox by now, or its link may have already been
// superseded by a later manual resend, so a genuinely fresh token (not the
// original, possibly-stale one) is what actually gets someone verified.
//
// GET /api/auth/verify (routes/auth.js) is what a click on this link hits;
// that route already flips email_verified and clears verify_token, at which
// point this job's own query (email_verified = false) simply stops matching
// the row — no explicit "cancel the reminder" step needed.
//   node scripts/verify-reminder.js
require('dotenv').config();
const crypto = require('crypto');
const supabase = require('../db');
const { sendEmail } = require('../lib/email');
const paginate = require('../lib/paginate');

const REMIND_AFTER_MS = 24 * 60 * 60 * 1000; // a day — long enough that "just hasn't checked email yet" has passed
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

const SUBJECT = 'Confirm your email — Yalla Nsafer';
const html = link => `
  <p>You created a Yalla Nsafer account but haven't confirmed your email yet —
  the concierge stays locked until you do.</p>
  <p><a href="${link}">${link}</a></p>`;

async function run() {
  const cutoff = new Date(Date.now() - REMIND_AFTER_MS).toISOString();
  // Paged (see lib/paginate.js): an unbounded .select() here would silently
  // drop rows past Supabase's per-request cap once more unverified signups
  // are due at once than that cap allows.
  const { data: due, error } = await paginate.fetchAllPages((from, to) =>
    supabase.from('users')
      .select('id, email, email_verified, banned, verify_token, created_at')
      .eq('email_verified', false)
      .eq('banned', false)
      .lte('created_at', cutoff)
      .is('verify_reminder_sent_at', null)
      .range(from, to));
  if (error) throw error;

  let sent = 0;
  for (const u of due || []) {
    try {
      // Same compare-and-swap rotation as routes/auth.js's
      // POST /resend-verification: a fresh token so an old leaked/expired
      // link stops working, guarded against a concurrent resend racing this
      // job for the same account.
      const verify_token = crypto.randomBytes(32).toString('hex');
      let upd = supabase.from('users').update({ verify_token }).eq('id', u.id);
      upd = u.verify_token == null ? upd.is('verify_token', null) : upd.eq('verify_token', u.verify_token);
      const { data: rotated, error: rotErr } = await upd.select('id');
      if (rotErr) { console.error(`verify reminder rotate ${u.id}`, rotErr.message); continue; }
      if (rotated && rotated.length === 0) continue; // another issuance already in flight — leave it to that one

      const link = `${PUBLIC_URL}/api/auth/verify?token=${verify_token}&id=${u.id}`;
      try {
        await sendEmail(u.email, SUBJECT, html(link));
        await supabase.from('users').update({ verify_reminder_sent_at: new Date().toISOString() }).eq('id', u.id);
        sent++;
      } catch (sendErr) {
        console.error(`verify reminder send ${u.id}`, sendErr.message);
        // Nothing new was actually delivered — restore the previous token
        // (CAS'd against the one we just set) so an earlier still-valid link
        // keeps working instead of leaving the account with a dead end, same
        // discipline as routes/auth.js's own resend-verification failure path.
        await supabase.from('users').update({ verify_token: u.verify_token })
          .eq('id', u.id).eq('verify_token', verify_token);
      }
    } catch (e) { console.error(`verify reminder ${u.id}`, e.message); }
  }
  console.log(`verify-reminder: ${sent} reminder(s) sent`);
  return sent;
}

if (require.main === module) run().catch(e => { console.error('verify-reminder failed', e); process.exit(1); });
module.exports = { run };
