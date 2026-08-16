// Phase 3 — image moderation + enforcement.
// Nudity/explicit detection via Google Vision SafeSearch (server-side backstop).
// Without GOOGLE_VISION_API_KEY uploads are refused, unless ALLOW_UNMODERATED_PHOTOS=true (dev only).
const supabase = require('../db');
const paypal = require('./paypal');
const KEY = process.env.GOOGLE_VISION_API_KEY;
const ALLOW_UNCHECKED = process.env.ALLOW_UNMODERATED_PHOTOS === 'true';

async function checkImage(base64) {
  if (!KEY) {
    console.warn('[moderation] GOOGLE_VISION_API_KEY unset — image not checked; ' + (ALLOW_UNCHECKED ? 'allowed (dev)' : 'refused'));
    return { safe: ALLOW_UNCHECKED, checked: false, unavailable: true };
  }
  const r = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] }),
  });
  const j = await r.json();
  const a = j?.responses?.[0]?.safeSearchAnnotation;
  if (!a) {
    console.error('[moderation] Vision returned no verdict', j?.error?.message || r.status);
    return { safe: ALLOW_UNCHECKED, checked: false, unavailable: true };
  }
  const bad = v => v === 'LIKELY' || v === 'VERY_LIKELY';
  const unsafe = bad(a.adult) || bad(a.racy);
  return { safe: !unsafe, checked: true, adult: a.adult, racy: a.racy };
}

async function blockUser(userId, reason) {
  const { data: u } = await supabase.from('users').select('email, paypal_subscription_id').eq('id', userId).maybeSingle();
  await supabase.from('users').update({ banned: true, subscription_status: 'canceled' }).eq('id', userId);
  if (u?.email) await supabase.from('banned_emails').upsert({ email: u.email, reason: reason || 'policy violation' });
  if (u?.paypal_subscription_id && paypal.configured()) {
    try {
      await paypal.pp('POST', `/v1/billing/subscriptions/${u.paypal_subscription_id}/cancel`, { reason: reason || 'policy violation' });
    } catch (e) { console.error('paypal cancel failed', e.message); }
  }
  return true;
}
module.exports = { checkImage, blockUser };
