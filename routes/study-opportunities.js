// International-students vertical -- public submission of a study program or
// scholarship (Section 4 of the build brief: "universities, admissions,
// scholarships/bourse"). Same shape as routes/informal-listings.js: public,
// no account required, free-text contact, nothing goes live until an admin
// approves it (routes/admin-study-opportunities.js).
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

const KINDS = ['program', 'scholarship'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.post('/', sec.limits.report, async (req, res) => {
  try {
    const contact = sec.clean(req.body.contact, 120);
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : null;
    const title = sec.clean(req.body.title, 160);
    const institution = sec.clean(req.body.institution, 160) || null;
    const country = sec.clean(req.body.country, 60) || null;
    const city = sec.clean(req.body.city, 80) || null;
    const degreeLevel = sec.clean(req.body.degreeLevel, 40) || null;
    const fieldOfStudy = sec.clean(req.body.fieldOfStudy, 80) || null;
    const deadline = typeof req.body.deadline === 'string' && DATE_RE.test(req.body.deadline) ? req.body.deadline : null;
    const description = sec.clean(req.body.description, 2000) || null;

    if (!contact || !kind || !title)
      return res.status(400).json({ error: 'contact, kind, and title are required', code: 'ERR_BAD_INPUT' });

    // Same crude keyword guard as informal listings (Section 6.6) -- a human
    // still reviews every submission that gets past this.
    if (isProhibited(title, institution, description))
      return res.status(403).json({ error: 'This submission is not accepted on Yalla Nsafer', code: 'ERR_FORBIDDEN' });

    const { error } = await supabase.from('study_opportunity_submissions').insert({
      submitted_by_contact: contact, kind, title, institution, country, city,
      degree_level: degreeLevel, field_of_study: fieldOfStudy, deadline, description,
    });
    if (error) throw error;
    res.json({ success: true, message: "Thanks — we'll review this and post it if it looks good." });
  } catch (e) {
    console.error('study-opportunities submit', e);
    res.status(500).json({ error: 'Could not submit right now', code: 'ERR_SERVER' });
  }
});

module.exports = router;
