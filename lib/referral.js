// Referral code attribution — shared by routes/auth.js (capture a code at
// signup), routes/referral.js (a user's own code + count), and
// routes/subscription.js's webhook handlers (conversion crediting on a
// genuine inactive -> active transition). See schema.sql's referral_*
// columns and the referral_conversions table.
//
// The reward: 30 days of paid-tier access for the REFERRER (see
// grantReferralBonus below), stacked on repeat referrals, via
// users.bonus_access_until — never by touching subscription_status/
// subscription_tier/subscription_period_end, which belong entirely to the
// PayPal/Stripe webhook handlers and must keep meaning exactly what they've
// always meant. lib/access.js is what actually turns bonus_access_until into
// real access at every gate.
const crypto = require('crypto');
const supabase = require('../db');

const BONUS_DAYS = 30;

// No 0/O/1/I — a code read aloud or handwritten shouldn't be ambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 7;
const MAX_ATTEMPTS = 5; // collision retries against the unique constraint

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// Returns the user's existing code, minting and persisting one on first call.
// Lazy self-heal, same pattern as other one-shot per-user fields in this
// codebase (e.g. totp_secret) — every account created before this feature
// shipped simply gets its code the first time it's asked for.
async function ensureCode(userId) {
  const { data: u, error: readErr } = await supabase.from('users').select('referral_code').eq('id', userId).maybeSingle();
  if (readErr) throw readErr;
  if (u && u.referral_code) return u.referral_code;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    const { error } = await supabase.from('users').update({ referral_code: code }).eq('id', userId);
    if (!error) return code;
    // a unique-violation on the code column means a collision — try again
    // with a new random code; any other error is real and should surface.
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not allocate a referral code after ' + MAX_ATTEMPTS + ' attempts');
}

// Resolves a submitted referral code to the referring user's id, or null when
// it doesn't match anyone. A bad or mistyped code must never block signup, so
// callers treat null as "no referrer" rather than an error.
async function resolveCode(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  try {
    const { data } = await supabase.from('users').select('id').eq('referral_code', trimmed).maybeSingle();
    return data ? data.id : null;
  } catch (e) { console.error('referral resolveCode', e.message); return null; }
}

// Called from routes/subscription.js's PayPal/Stripe webhook handlers right
// before they write `patch` to `users`, whenever that patch is about to set
// subscription_status to 'active'. `user` must already carry referred_by,
// referral_credited and subscription_status (the caller's own select); this
// mutates `patch` in place by adding referral_credited:true so both changes
// land together in the caller's single update() call, and inserts the ledger
// row (schema.sql's referral_conversions).
//
// Guards against crediting a renewal (user.subscription_status was already
// 'active') and against double-crediting the same account across a later
// cancel/resubscribe cycle (referral_credited already true). Never throws —
// a referral-crediting hiccup must not fail the payment webhook itself, since
// both PayPal and Stripe retry a non-2xx response and re-processing the same
// event has to stay safe either way.
// Grants the referrer BONUS_DAYS of access, stacked on top of any bonus
// they're already mid-way through rather than reset from today — a referrer
// who converts three friends this month should end up with three months of
// runway, not have each new conversion overwrite the last. Never throws:
// same "a reward hiccup must not break anything real" discipline as the
// caller, creditConversionIfNew.
async function grantReferralBonus(referrerId) {
  try {
    const { data: referrer, error: readErr } = await supabase.from('users')
      .select('bonus_access_until').eq('id', referrerId).maybeSingle();
    if (readErr) { console.error('referral bonus lookup', readErr.message); return; }
    const now = new Date();
    const current = referrer && referrer.bonus_access_until ? new Date(referrer.bonus_access_until) : null;
    const base = current && current > now ? current : now;
    const until = new Date(base.getTime() + BONUS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: writeErr } = await supabase.from('users').update({ bonus_access_until: until }).eq('id', referrerId);
    if (writeErr) console.error('referral bonus grant', writeErr.message);
  } catch (e) { console.error('referral bonus grant', e.message); }
}

async function creditConversionIfNew(user, patch) {
  if (!user || !patch || patch.subscription_status !== 'active') return;
  if (!user.referred_by || user.referral_credited) return;
  if (user.subscription_status === 'active') return; // a renewal, not a fresh conversion
  try {
    const { error } = await supabase.from('referral_conversions')
      .insert({ referrer_id: user.referred_by, referred_id: user.id });
    if (error) {
      // 23505 = unique violation on referred_id: a concurrent webhook retry
      // already recorded this exact conversion. Still fine to mark credited,
      // but the bonus was (or will be) granted by whichever attempt actually
      // won the insert — granting it again here would double-pay for one conversion.
      if (error.code === '23505') { patch.referral_credited = true; return; }
      console.error('referral credit insert', error.message);
      return;
    }
    patch.referral_credited = true;
    await grantReferralBonus(user.referred_by);
  } catch (e) { console.error('referral credit', e.message); }
}

module.exports = { randomCode, ensureCode, resolveCode, creditConversionIfNew, grantReferralBonus, BONUS_DAYS, CODE_LEN };
