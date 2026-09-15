// Public read-only job-feed stats. The landing page shows a live count of
// the REAL postings in the feed — the honest version of a credibility
// counter: every number it shows is a row a seeker could actually be matched
// to. Unauthenticated like /api/news, for the same reason.
const express = require('express');
const supabase = require('../db');
const router = express.Router();

const CACHE_MS = 60 * 60 * 1000; // an hour — the feed refreshes every 6h
let cache = { n: 0, at: 0 };

router.get('/count', async (req, res) => {
  if (Date.now() - cache.at < CACHE_MS) {
    return res.json({ success: true, count: cache.n });
  }
  const { count, data, error } = await supabase.from('jobs').select('id', { count: 'exact', head: true });
  if (error) {
    console.error('jobs count', error.message);
    return res.status(500).json({ error: 'Could not load the feed count', code: 'ERR_SERVER' });
  }
  // data can be null on a head-only count; fall back to its length when a
  // client returns rows anyway.
  const n = typeof count === 'number' ? count : (data ? data.length : 0);
  cache = { n, at: Date.now() };
  res.json({ success: true, count: n });
});

module.exports = router;
