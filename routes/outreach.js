// TrouvePro — marketing outreach list (RBQ licence holders invited to subscribe).
// Only the unsubscribe endpoint is public: CASL requires a working opt-out in every
// commercial message, and the token must work without logging in.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const router = express.Router();

// GET /api/outreach/unsubscribe?token=... — one click, no auth, always answers 200 HTML
router.get('/unsubscribe', sec.limits.api, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let ok = false;
  if (/^[a-f0-9]{32}$/.test(token)) {
    const { error } = await supabase.from('outreach_contacts')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('unsubscribe_token', token).is('unsubscribed_at', null);
    if (error) console.error('outreach unsubscribe', error);
    else ok = true;
  }
  res.type('html').send(
    `<!doctype html><meta charset="utf-8"><title>TrouvePro</title>` +
    `<body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto">` +
    (ok
      ? `<h2>Désabonnement enregistré</h2><p>Vous ne recevrez plus de courriels promotionnels de TrouvePro.</p>` +
        `<h2>Unsubscribed</h2><p>You will no longer receive promotional emails from TrouvePro.</p>`
      : `<h2>Lien invalide / Invalid link</h2><p>Écrivez-nous à contact@mytrouvepro.net.</p>`) +
    `</body>`);
});
// GET /api/outreach/invite?token=... — what the campaign link in an email points at.
// Public by necessity (the recipient has no account yet) and deliberately narrow: it answers
// with the business name we already printed in their own email, never the address on the list.
router.get('/invite', sec.limits.api, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: 'Unknown link' });
  const { data, error } = await supabase.from('outreach_contacts')
    .select('business_name, city, lang, claimed_user_id')
    .eq('unsubscribe_token', token).maybeSingle();
  if (error) { console.error('outreach invite', error); return res.status(500).json({ error: 'Lookup failed' }); }
  if (!data) return res.status(404).json({ error: 'Unknown link' });
  res.json({
    success: true,
    business_name: data.business_name || '',
    city: data.city || '',
    lang: data.lang === 'en' ? 'en' : 'fr',
    claimed: !!data.claimed_user_id,
  });
});

module.exports = router;
