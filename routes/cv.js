// CV export (PDF/Word) — Hicham's explicit instruction: the concierge stays
// free to chat with and collect information from an unsubscribed seeker, but
// the CV file itself must never be generated or downloadable without an
// active, paid subscription. This is a HARD gate, unconditional on
// PAYWALL_ENFORCED: that flag sequences the go-live rollout of the general
// chat/matching paywall (routes/concierge.js), while the CV gate is a
// separate, always-on rule by design -- the free tier's job is to build
// interest and collect enough to make a CV worth generating, never to hand
// over the generated file itself.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { loadCurrent } = require('../lib/profileWrite');
const { buildCvData, cvReadiness } = require('../lib/cvBuilder');
const { renderCvPdf } = require('../lib/cvPdf');
const { renderCvDocx } = require('../lib/cvDocx');
const access = require('../lib/access');
const router = express.Router();

async function loadCvContext(userId) {
  const [{ data: user }, { profile, seekerProfile }] = await Promise.all([
    supabase.from('users').select('id, name, email, phone, subscription_status, bonus_access_until').eq('id', userId).maybeSingle(),
    loadCurrent(userId),
  ]);
  return { user, profile, seekerProfile };
}

// Free to call while unsubscribed -- this IS the tease (same "show there's a
// real match, withhold the payoff" mechanic as routes/concierge.js's
// teaserJob): reports what's collected and whether there's enough for a
// real CV, but never the file itself, and never in a shape a client could
// reconstruct a document from.
router.get('/preview', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { user, profile, seekerProfile } = await loadCvContext(req.user.id);
    const lang = req.query.lang === 'fr' ? 'fr' : 'en';
    const data = buildCvData({ user, profile, seekerProfile, lang });
    const { ready, reason } = cvReadiness(data);
    res.json({
      success: true, ready, reason,
      counts: {
        workHistory: data.workHistory.length,
        education: data.education.length,
        certifications: data.certifications.length,
        languages: data.languages.length,
      },
      subscribed: access.hasAccess(user),
    });
  } catch (e) {
    console.error('cv preview', e);
    res.status(500).json({ error: 'Could not load CV preview', code: 'ERR_SERVER' });
  }
});

router.get('/export', sec.limits.cv, authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { user, profile, seekerProfile } = await loadCvContext(req.user.id);
    if (!user) return res.status(403).json({ error: 'Account not found', code: 'ERR_NOT_FOUND' });
    // The hard gate -- see file header. Deliberately checks real access via
    // lib/access.js (a real subscription OR a referral bonus grant), not the
    // concierge's paywallOn()/inPreview machinery, so this stays enforced
    // even before Hicham flips PAYWALL_ENFORCED=true for the rest of the app.
    if (!access.hasAccess(user))
      return res.status(402).json({ error: 'Subscribe to download your CV', upgrade: true, code: 'ERR_CV_SUBSCRIPTION_REQUIRED' });

    const format = req.query.format === 'docx' ? 'docx' : 'pdf';
    const lang = req.query.lang === 'fr' ? 'fr' : 'en';
    const data = buildCvData({ user, profile, seekerProfile, lang });
    const { ready, reason } = cvReadiness(data);
    if (!ready)
      return res.status(422).json({ error: 'Not enough information yet to build a CV — keep chatting with the concierge first', code: 'ERR_CV_NOT_READY', reason });

    // A safe, short filename: strip everything but letters/digits so a name
    // with punctuation, accents, or Arabic script never produces a
    // Content-Disposition header a browser mishandles.
    const slug = (data.name || 'yalla-nsafer').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'yalla-nsafer';

    if (format === 'docx') {
      const buf = await renderCvDocx(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="CV-${slug}.docx"`);
      return res.send(buf);
    }
    const buf = await renderCvPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CV-${slug}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error('cv export', e);
    res.status(500).json({ error: 'Could not generate CV', code: 'ERR_SERVER' });
  }
});

module.exports = router;
