// TrouvePro — how many of the 50 founding provider places are actually taken.
// Public: it is the number prospects are asked to believe, so it comes from the
// accounts that really pay, not from a hand-edited variable.
const express = require('express');
const sec = require('../lib/security');
const founding = require('../lib/founding');
const router = express.Router();

router.get('/', sec.limits.api, async (_req, res) => {
  try {
    res.json({ success: true, ...(await founding.status()) });
  } catch (e) { console.error('founding', e); res.status(500).json({ error: 'Lookup failed' }); }
});

module.exports = router;
