// Roadmap Step 5 — the "urgent informal listing" pattern (Section 4.1's example:
// "shawarma master needed today"), alongside the structured licensed job feed.
// Public, no account required: a low-profile poster may not have a fixed-format
// email/phone to give, so `contact` is free text — WhatsApp handle, phone, email,
// whatever reaches them. Nothing submitted here is a live job until an admin
// approves it (routes/admin-informal-listings.js); see schema.sql's
// informal_listing_submissions table this writes to.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

router.post('/', sec.limits.report, async (req, res) => {
  try {
    const contact = sec.clean(req.body.contact, 120);
    const title = sec.clean(req.body.title, 120);
    const country = sec.clean(req.body.country, 60) || null;
    const category = sec.clean(req.body.category, 60) || null;
    const description = sec.clean(req.body.description, 1000) || null;
    if (!contact || !title)
      return res.status(400).json({ error: 'contact and title are required', code: 'ERR_BAD_INPUT' });

    // Same crude keyword guard reused at review time (Section 6.6) — a human still
    // reviews every submission that gets past this; it's a first filter against
    // obvious abuse, not a claim of full moderation coverage.
    if (isProhibited(title, category, description))
      return res.status(403).json({ error: 'This category is not accepted on Yalla Falaina', code: 'ERR_FORBIDDEN' });

    const { error } = await supabase.from('informal_listing_submissions')
      .insert({ submitted_by_contact: contact, title, country, category, description });
    if (error) throw error;
    res.json({ success: true, message: "Thanks — we'll review this and post it if it looks good." });
  } catch (e) {
    console.error('informal-listings submit', e);
    res.status(500).json({ error: 'Could not submit right now', code: 'ERR_SERVER' });
  }
});

module.exports = router;
