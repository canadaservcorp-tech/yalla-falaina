// Diaspora & community groups + accommodation board (couch-surfing/roommate/
// sublet) -- Section 5 of the build brief ("Travel, Arrival & Community").
// Two small, closely-related public-submission endpoints in one file rather
// than four near-identical files: both are free-text-contact, admin-
// moderated directories with no data shape complex enough to earn its own
// module, same reasoning that already put jobs and informal-listings in
// separate files (a job has real structure worth its own file; these don't).
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

const PLATFORMS = ['facebook', 'whatsapp', 'telegram', 'instagram', 'other'];
const ACCOMMODATION_TYPES = ['couchsurf', 'roommate', 'sublet'];

router.post('/groups', sec.limits.report, async (req, res) => {
  try {
    const contact = sec.clean(req.body.contact, 120);
    const name = sec.clean(req.body.name, 160);
    const url = sec.clean(req.body.url, 300);
    const platform = PLATFORMS.includes(req.body.platform) ? req.body.platform : null;
    const country = sec.clean(req.body.country, 60) || null;
    const city = sec.clean(req.body.city, 80) || null;
    const language = sec.clean(req.body.language, 40) || null;

    if (!contact || !name || !url)
      return res.status(400).json({ error: 'contact, name, and url are required', code: 'ERR_BAD_INPUT' });
    if (isProhibited(name, req.body.description))
      return res.status(403).json({ error: 'This submission is not accepted on Yalla Nsafer', code: 'ERR_FORBIDDEN' });

    const { error } = await supabase.from('community_group_submissions').insert({
      submitted_by_contact: contact, name, url, platform, country, city, language,
    });
    if (error) throw error;
    res.json({ success: true, message: "Thanks — we'll review this and post it if it looks good." });
  } catch (e) {
    console.error('community groups submit', e);
    res.status(500).json({ error: 'Could not submit right now', code: 'ERR_SERVER' });
  }
});

router.post('/accommodation', sec.limits.report, async (req, res) => {
  try {
    const contact = sec.clean(req.body.contact, 120);
    const type = ACCOMMODATION_TYPES.includes(req.body.type) ? req.body.type : null;
    const country = sec.clean(req.body.country, 60);
    const city = sec.clean(req.body.city, 80);
    const budgetNote = sec.clean(req.body.budgetNote, 80) || null;
    const description = sec.clean(req.body.description, 1000) || null;

    if (!contact || !type || !country || !city)
      return res.status(400).json({ error: 'contact, type, country, and city are required', code: 'ERR_BAD_INPUT' });
    if (isProhibited(description))
      return res.status(403).json({ error: 'This submission is not accepted on Yalla Nsafer', code: 'ERR_FORBIDDEN' });

    const { error } = await supabase.from('accommodation_submissions').insert({
      submitted_by_contact: contact, type, country, city, budget_note: budgetNote, description,
    });
    if (error) throw error;
    res.json({ success: true, message: "Thanks — we'll review this and post it if it looks good." });
  } catch (e) {
    console.error('accommodation submit', e);
    res.status(500).json({ error: 'Could not submit right now', code: 'ERR_SERVER' });
  }
});

module.exports = router;
