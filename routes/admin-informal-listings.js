// Admin moderation queue for routes/informal-listings.js submissions (Section 4.1/6.6).
// Approving one turns it into a real `jobs` row with source_type='informal_unverified' —
// the same flag the concierge's system prompt already treats with extra caution when
// citing a listing to a seeker. Rejecting one just records the reason; nothing else happens.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { trackFor } = require('../lib/jobsIngest');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

const STATUSES = ['pending', 'approved', 'rejected'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const JOB_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // same freshness window as the licensed feed (lib/jobsIngest.js)

router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const { data, error } = await supabase.from('informal_listing_submissions')
    .select('id, submitted_by_contact, title, country, category, description, review_status, rejection_reason, reviewed_by, reviewed_at, created_at')
    .eq('review_status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('informal-listings list', error.message);
    return res.status(500).json({ error: 'Could not load submissions', code: 'ERR_SERVER' });
  }
  res.json({ success: true, submissions: data || [] });
});

router.post('/:id/review', authenticate, sec.requireActiveUser, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });
  if (!UUID_RE.test(req.params.id))
    return res.status(400).json({ error: 'Invalid submission id', code: 'ERR_BAD_INPUT' });
  const decision = req.body.decision;
  if (decision !== 'approved' && decision !== 'rejected')
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'", code: 'ERR_BAD_INPUT' });
  const reason = sec.clean(req.body.reason, 200) || null;
  if (decision === 'rejected' && !reason)
    return res.status(400).json({ error: 'A rejection reason is required to reject', code: 'ERR_BAD_INPUT' });

  try {
    const { data: sub, error: fErr } = await supabase.from('informal_listing_submissions')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!sub) return res.status(404).json({ error: 'Submission not found', code: 'ERR_NOT_FOUND' });
    if (sub.review_status !== 'pending')
      return res.status(400).json({ error: 'This submission was already reviewed', code: 'ERR_BAD_INPUT' });

    if (decision === 'approved') {
      // Re-check here too — the keyword list may have grown since this was
      // submitted, and this is the last gate before it becomes a live job.
      if (isProhibited(sub.title, sub.category, sub.description))
        return res.status(403).json({ error: 'This submission cannot be approved as-is', code: 'ERR_FORBIDDEN' });
      // jobs.country is NOT NULL but the submission's is optional — '' satisfies
      // the constraint without inventing a country that was never given.
      const { error: jErr } = await supabase.from('jobs').insert({
        external_source: 'informal_submission',
        external_id: sub.id,
        track: trackFor(sub.country),
        source_type: 'informal_unverified',
        title: sub.title,
        employer: null,
        country: sub.country || '',
        city: null,
        category: sub.category,
        requirements: sub.description,
        salary_note: null,
        posted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + JOB_EXPIRY_MS).toISOString(),
        status: 'active',
        source_url: null,
        raw: sub,
      });
      if (jErr) throw jErr;
    }

    const patch = { review_status: decision, reviewed_by: String(req.user.id), reviewed_at: new Date().toISOString() };
    if (decision === 'rejected') patch.rejection_reason = reason;
    const { error: uErr } = await supabase.from('informal_listing_submissions').update(patch).eq('id', req.params.id);
    if (uErr) throw uErr;
    res.json({ success: true });
  } catch (e) {
    console.error('informal-listings review', e);
    res.status(500).json({ error: 'Could not process review', code: 'ERR_SERVER' });
  }
});

module.exports = router;
