// Phase 3 — image moderation + enforcement.
// Nudity/explicit detection via Google Vision SafeSearch (server-side backstop).
// If GOOGLE_VISION_API_KEY is unset, it logs and ALLOWS (dev only) — set it in production.
const supabase = require('../db');
const KEY = process.env.GOOGLE_VISION_API_KEY;

async function checkImage(base64) {
  if (!KEY) { console.warn('[moderation] GOOGLE_VISION_API_KEY unset — image NOT checked (dev)'); return { safe: true, checked: false }; }
  const r = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] }),
  });
  const j = await r.json();
  const a = j?.responses?.[0]?.safeSearchAnnotation || {};
  const bad = v => v === 'LIKELY' || v === 'VERY_LIKELY';
  const unsafe = bad(a.adult) || bad(a.racy);
  return { safe: !unsafe, checked: true, adult: a.adult, racy: a.racy };
}

async function blockUser(userId, reason) {
  const { data: u } = await supabase.from('users').select('email, stripe_customer_id').eq('id', userId).maybeSingle();
  await supabase.from('users').update({ banned: true, subscription_status: 'canceled' }).eq('id', userId);
  if (u?.email) await supabase.from('banned_emails').upsert({ email: u.email, reason: reason || 'policy violation' });
  if (u?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({ customer: u.stripe_customer_id, limit: 1 });
      if (subs.data[0]) await stripe.subscriptions.cancel(subs.data[0].id);
    } catch (e) { console.error('stripe cancel failed', e.message); }
  }
  return true;
}
module.exports = { checkImage, blockUser };
