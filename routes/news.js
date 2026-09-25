// Public immigration-news ticker feed (lib/newsIngest.js writes the rows).
// Unauthenticated on purpose: the ticker is the one part of the product a
// visitor sees before signing up, so it has to work with no account.
const express = require('express');
const supabase = require('../db');
const router = express.Router();

const LANGS = ['en', 'fr', 'ar', 'hi', 'tr'];
const LIMIT = 12;

// Falls back to the English headline when a source published only that one
// (the IRCC news feed does) — an English headline with its official link is
// more use than a hole in the ticker.
const localize = (row, lang) => row['title_' + lang] || row.title_en;

router.get('/', async (req, res) => {
  const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'en';
  const { data, error } = await supabase.from('news_items')
    .select('id, source, country, category, title_en, title_fr, title_ar, title_hi, title_tr, url, published_at')
    .order('published_at', { ascending: false })
    .limit(LIMIT);
  if (error) {
    console.error('news list', error.message);
    return res.status(500).json({ error: 'Could not load the news feed', code: 'ERR_SERVER' });
  }
  res.json({
    success: true,
    items: (data || []).map(r => ({
      id: r.id,
      title: localize(r, lang),
      url: r.url,
      country: r.country,
      category: r.category,
      official: r.source !== 'operator',
      published_at: r.published_at,
    })),
  });
});

module.exports = router;
