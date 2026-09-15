// Self-serve referral endpoint — a signed-in seeker's own shareable code and
// how many people it has converted so far. No reward amount is shown here on
// purpose: see lib/referral.js's top comment for why crediting is a manual,
// ledger-only step for now (referral_conversions), not an automatic one.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const referral = require('../lib/referral');
const router = express.Router();

router.get('/mine', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const code = await referral.ensureCode(req.user.id);
    const { data: conversions, error } = await supabase.from('referral_conversions').select('id').eq('referrer_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, code, conversions: (conversions || []).length });
  } catch (e) { console.error('referral mine', e); res.status(500).json({ error: 'Could not load your referral code', code: 'ERR_SERVER' }); }
});

module.exports = router;
