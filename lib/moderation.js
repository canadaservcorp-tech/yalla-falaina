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

// Text screening for the conduct banned by the Terms (drugs, prostitution/sexual services).
// Word-boundary matching in FR + EN; a hit blocks the text and opens a report for human review
// (words are far less reliable than image analysis, so it never bans on its own).
const BANNED_TERMS = [
  // drugs
  // (generic trade words like "crack", "weed" or "dealer" are deliberately excluded — false positives)
  'cocaine', 'coca[iï]ne', 'h[eé]ro[iï]ne', 'heroin', 'm[eé]thamph[eé]tamine', 'methamphetamine',
  'fentanyl', 'ecstasy', 'mdma', 'lsd', 'k[eé]tamine', 'ketamine', 'crystal meth', 'crack cocaine',
  'hashish', 'haschich', 'champignons magiques', 'magic mushrooms', 'stup[eé]fiants', 'narcotiques',
  'revendeur de drogue', 'vendre de la drogue', 'sell(?:ing)? drugs', 'buy(?:ing)? drugs', 'drug deal(?:er|ing)?',
  // prostitution / sexual services
  'prostitu\\w*', 'escorte?s?', 'escort', 'call ?girl', 'gigolo', 'travail du sexe', 'sex ?work(?:er)?',
  'services? sexuels?', 'sexual services?', 'massage [eé]rotique', 'erotic massage', 'happy ending',
  'p[eé]nis', 'vagin', 'blowjob', 'fellation', 'nude?s?', 'nudit[eé]', 'porno\\w*',
  'sexe tarif[eé]', 'paid sex', 'sugar (?:daddy|baby)',
];
const BANNED_RE = new RegExp('(?:^|[^\\p{L}])(' + BANNED_TERMS.join('|') + ')(?:[^\\p{L}]|$)', 'iu');

function checkText(text) {
  if (typeof text !== 'string' || !text) return { safe: true };
  const m = BANNED_RE.exec(text.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
  return m ? { safe: false, term: m[1].toLowerCase() } : { safe: true };
}

// Records a violation for human review; enforcement (block + subscription termination, no refund)
// is applied by moderators or automatically for image hits.
async function flagText(userId, term, where) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: null, target_user_id: userId, kind: 'other',
    reason: `auto-detected prohibited term "${term}" in ${where}`, status: 'open',
  });
  if (error) console.error('flagText', error);
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
module.exports = { checkImage, checkText, flagText, blockUser };
