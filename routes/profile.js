// Profile completeness gate (Section 10). This is the client-driven intake
// write path — the concierge chat's intake mode persists extracted answers
// through the same lib/profileWrite.js logic, so both enforce identical rules.
// PUT is a partial update: only fields actually present in the body are
// touched, nothing else is cleared. GET returns the merged profile plus which
// fields are still missing, for the client to render the gate.
const express = require('express');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { computeCompleteness } = require('../lib/profileCompleteness');
const { loadCurrent, applyIntake } = require('../lib/profileWrite');
const router = express.Router();

router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { profile, seekerProfile } = await loadCurrent(req.user.id);
    const { isComplete, missing } = computeCompleteness({ profile, seekerProfile });
    res.json({ success: true, profile: profile || null, seekerProfile: seekerProfile || null, isComplete, missing });
  } catch (e) {
    console.error('profile get', e);
    res.status(500).json({ error: 'Could not load profile', code: 'ERR_SERVER' });
  }
});

router.put('/', sec.limits.write, authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const result = await applyIntake(req.user.id, req.body);
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.isValidation)
      return res.status(400).json({ error: e.message, code: 'ERR_BAD_INPUT' });
    console.error('profile put', e);
    res.status(500).json({ error: 'Could not save profile', code: 'ERR_SERVER' });
  }
});

module.exports = router;
