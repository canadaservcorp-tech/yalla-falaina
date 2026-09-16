// Admin moderation queues for routes/community.js's two submission types --
// same two-step pattern as routes/admin-informal-listings.js, kept together
// in one file since routes/community.js already treats them as a pair.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

const STATUSES = ['pending', 'approved', 'rejected'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
// Same freshness window as an approved informal job listing
// (routes/admin-informal-listings.js's JOB_EXPIRY_MS) -- a couch-surfing or
// roommate post goes stale exactly as fast as an urgent job lead.
const ACCOMMODATION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function requireAdmin(req, res) {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' }); return false; }
  return true;
}

router.get('/groups', authenticate, sec.requireActiveUser, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const { data, error } = await supabase.from('community_group_submissions')
    .select('id, submitted_by_contact, country, city, platform, name, url, language, review_status, rejection_reason, reviewed_by, reviewed_at, created_at')
    .eq('review_status', status).order('created_at', { ascending: false }).limit(200);
  if (error) { console.error('community groups list', error.message); return res.status(500).json({ error: 'Could not load submissions', code: 'ERR_SERVER' }); }
  res.json({ success: true, submissions: data || [] });
});

router.post('/groups/:id/review', authenticate, sec.requireActiveUser, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid submission id', code: 'ERR_BAD_INPUT' });
  const decision = req.body.decision;
  if (decision !== 'approved' && decision !== 'rejected')
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'", code: 'ERR_BAD_INPUT' });
  const reason = sec.clean(req.body.reason, 200) || null;
  if (decision === 'rejected' && !reason)
    return res.status(400).json({ error: 'A rejection reason is required to reject', code: 'ERR_BAD_INPUT' });

  try {
    const { data: sub, error: fErr } = await supabase.from('community_group_submissions').select('*').eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!sub) return res.status(404).json({ error: 'Submission not found', code: 'ERR_NOT_FOUND' });
    if (sub.review_status !== 'pending') return res.status(400).json({ error: 'This submission was already reviewed', code: 'ERR_BAD_INPUT' });

    if (decision === 'approved') {
      if (isProhibited(sub.name)) return res.status(403).json({ error: 'This submission cannot be approved as-is', code: 'ERR_FORBIDDEN' });
      const { error: gErr } = await supabase.from('community_groups').insert({
        country: sub.country || '', city: sub.city, platform: sub.platform || 'other', name: sub.name, url: sub.url, language: sub.language,
      });
      if (gErr) throw gErr;
    }
    const patch = { review_status: decision, reviewed_by: String(req.user.id), reviewed_at: new Date().toISOString() };
    if (decision === 'rejected') patch.rejection_reason = reason;
    const { error: uErr } = await supabase.from('community_group_submissions').update(patch).eq('id', req.params.id);
    if (uErr) throw uErr;
    res.json({ success: true });
  } catch (e) {
    console.error('community groups review', e);
    res.status(500).json({ error: 'Could not process review', code: 'ERR_SERVER' });
  }
});

router.get('/accommodation', authenticate, sec.requireActiveUser, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const { data, error } = await supabase.from('accommodation_submissions')
    .select('id, submitted_by_contact, type, country, city, budget_note, description, review_status, rejection_reason, reviewed_by, reviewed_at, created_at')
    .eq('review_status', status).order('created_at', { ascending: false }).limit(200);
  if (error) { console.error('accommodation list', error.message); return res.status(500).json({ error: 'Could not load submissions', code: 'ERR_SERVER' }); }
  res.json({ success: true, submissions: data || [] });
});

router.post('/accommodation/:id/review', authenticate, sec.requireActiveUser, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid submission id', code: 'ERR_BAD_INPUT' });
  const decision = req.body.decision;
  if (decision !== 'approved' && decision !== 'rejected')
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'", code: 'ERR_BAD_INPUT' });
  const reason = sec.clean(req.body.reason, 200) || null;
  if (decision === 'rejected' && !reason)
    return res.status(400).json({ error: 'A rejection reason is required to reject', code: 'ERR_BAD_INPUT' });

  try {
    const { data: sub, error: fErr } = await supabase.from('accommodation_submissions').select('*').eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!sub) return res.status(404).json({ error: 'Submission not found', code: 'ERR_NOT_FOUND' });
    if (sub.review_status !== 'pending') return res.status(400).json({ error: 'This submission was already reviewed', code: 'ERR_BAD_INPUT' });

    if (decision === 'approved') {
      if (isProhibited(sub.description)) return res.status(403).json({ error: 'This submission cannot be approved as-is', code: 'ERR_FORBIDDEN' });
      const { error: aErr } = await supabase.from('accommodation_listings').insert({
        type: sub.type, country: sub.country, city: sub.city, budget_note: sub.budget_note, description: sub.description,
        contact: sub.submitted_by_contact, status: 'active',
        expires_at: new Date(Date.now() + ACCOMMODATION_EXPIRY_MS).toISOString(), raw: sub,
      });
      if (aErr) throw aErr;
    }
    const patch = { review_status: decision, reviewed_by: String(req.user.id), reviewed_at: new Date().toISOString() };
    if (decision === 'rejected') patch.rejection_reason = reason;
    const { error: uErr } = await supabase.from('accommodation_submissions').update(patch).eq('id', req.params.id);
    if (uErr) throw uErr;
    res.json({ success: true });
  } catch (e) {
    console.error('accommodation review', e);
    res.status(500).json({ error: 'Could not process review', code: 'ERR_SERVER' });
  }
});

module.exports = router;
