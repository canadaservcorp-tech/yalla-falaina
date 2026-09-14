// Operator announcements for the news ticker. Australia, the EU and the Gulf
// publish nothing we can ingest reliably (checked: no stable public feed), so
// anything outside IRCC's open data reaches the ticker by being posted here.
// Same admin gate as the informal-listing queue.
const express = require('express');
const crypto = require('crypto');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });

router.get('/', authenticate, sec.requireActiveUser, adminOnly, async (_req, res) => {
  const { data, error } = await supabase.from('news_items')
    .select('id, source, country, category, title_en, title_fr, title_ar, url, published_at')
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('admin-news list', error.message);
    return res.status(500).json({ error: 'Could not load the news items', code: 'ERR_SERVER' });
  }
  res.json({ success: true, items: data || [] });
});

router.post('/', authenticate, sec.requireActiveUser, adminOnly, async (req, res) => {
  const title_en = sec.clean(req.body.title_en, 240);
  const title_fr = sec.clean(req.body.title_fr, 240) || null;
  const title_ar = sec.clean(req.body.title_ar, 240) || null;
  const url = sec.clean(req.body.url, 500);
  const country = sec.clean(req.body.country, 60) || null;
  if (!title_en) return res.status(400).json({ error: 'An English headline is required', code: 'ERR_BAD_INPUT' });
  // A ticker item a visitor cannot verify is exactly what this product
  // refuses to publish, so the source link is mandatory and must be https.
  if (!/^https:\/\/[^\s]+$/i.test(url))
    return res.status(400).json({ error: 'An https source link is required', code: 'ERR_BAD_INPUT' });

  const { error } = await supabase.from('news_items').insert({
    source: 'operator',
    external_id: crypto.randomUUID(),
    country, category: 'announcement',
    title_en, title_fr, title_ar, url,
    published_at: new Date().toISOString(),
  });
  if (error) {
    console.error('admin-news insert', error.message);
    return res.status(500).json({ error: 'Could not save the announcement', code: 'ERR_SERVER' });
  }
  res.json({ success: true });
});

// Only operator rows: an ingested IRCC item would come straight back on the
// next refresh, so deleting one would look broken rather than moderated.
router.delete('/:id', authenticate, sec.requireActiveUser, adminOnly, async (req, res) => {
  if (!UUID_RE.test(req.params.id))
    return res.status(400).json({ error: 'Invalid id', code: 'ERR_BAD_INPUT' });
  const { data, error } = await supabase.from('news_items')
    .delete().eq('id', req.params.id).eq('source', 'operator').select('id');
  if (error) {
    console.error('admin-news delete', error.message);
    return res.status(500).json({ error: 'Could not delete the announcement', code: 'ERR_SERVER' });
  }
  if (!data || !data.length)
    return res.status(404).json({ error: 'No operator announcement with that id', code: 'ERR_NOT_FOUND' });
  res.json({ success: true });
});

module.exports = router;
