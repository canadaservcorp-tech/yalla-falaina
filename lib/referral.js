// Referral code attribution — shared by routes/auth.js (capture a code at
// signup), routes/referral.js (a user's own code + count), and
// routes/subscription.js's webhook handlers (conversion crediting on a
// genuine inactive -> active transition). See schema.sql's referral_*
// columns and the referral_conversions table.
//
// Deliberately scoped to attribution + a conversion ledger ONLY. No reward is
// auto-issued here — no extended subscription period, no discount — because
// crediting real billing across two payment providers (PayPal + Stripe) needs
// a chosen reward mechanic first, and that is a product decision for the
// account owner, not something to invent unprompted. referral_conversions is
// the record a human can act on by hand.
const crypto = require('crypto');
const supabase = require('../db');

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
async function creditConversionIfNew(user, patch) {
  if (!user || !patch || patch.subscription_status !== 'active') return;
  if (!user.referred_by || user.referral_credited) return;
  if (user.subscription_status === 'active') return; // a renewal, not a fresh conversion
  try {
    const { error } = await supabase.from('referral_conversions')
      .insert({ referrer_id: user.referred_by, referred_id: user.id });
    // 23505 = unique violation on referred_id: a concurrent webhook retry
    // already recorded this exact conversion — still fine to mark credited.
    if (error && error.code !== '23505') { console.error('referral credit insert', error.message); return; }
    patch.referral_credited = true;
  } catch (e) { console.error('referral credit', e.message); }
}

module.exports = { randomCode, ensureCode, resolveCode, creditConversionIfNew, CODE_LEN };
