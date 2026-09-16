// Admin moderation queue for routes/study-opportunities.js submissions.
// Same two-step pattern as routes/admin-informal-listings.js: approving one
// turns it into a real study_opportunities row; rejecting just records why.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { isProhibited } = require('../lib/prohibited-categories');
const router = express.Router();

const STATUSES = ['pending', 'approved', 'rejected'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
// study_opportunities has no unique constraint tying it back to a submission
// (unlike jobs' unique(external_source, external_id)), so a retry after a
// partial failure is guarded by review_status alone -- see the 'already
// reviewed' check below, same purpose as admin-informal-listings.js's retry
// note, simpler here because there's no external-feed dedupe key to race.

router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const { data, error } = await supabase.from('study_opportunity_submissions')
    .select('id, submitted_by_contact, kind, title, institution, country, city, degree_level, field_of_study, tuition_note, funding_coverage_pct, eligibility_note, deadline, description, review_status, rejection_reason, reviewed_by, reviewed_at, created_at')
    .eq('review_status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('study-opportunities list', error.message);
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
    const { data: sub, error: fErr } = await supabase.from('study_opportunity_submissions')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!sub) return res.status(404).json({ error: 'Submission not found', code: 'ERR_NOT_FOUND' });
    if (sub.review_status !== 'pending')
      return res.status(400).json({ error: 'This submission was already reviewed', code: 'ERR_BAD_INPUT' });

    if (decision === 'approved') {
      if (isProhibited(sub.title, sub.institution, sub.description, sub.tuition_note, sub.eligibility_note))
        return res.status(403).json({ error: 'This submission cannot be approved as-is', code: 'ERR_FORBIDDEN' });
      const { error: oErr } = await supabase.from('study_opportunities').insert({
        kind: sub.kind,
        source_type: 'consultant_submission',
        title: sub.title,
        institution: sub.institution,
        country: sub.country || '',
        city: sub.city,
        degree_level: sub.degree_level,
        field_of_study: sub.field_of_study,
        // Carried straight through from the submitter's own tuition_note/
        // funding_coverage_pct/eligibility_note -- this admin approval step
        // IS the verification that makes it safe for the concierge to state
        // as a published fact (see study_opportunities' own schema.sql
        // comment on why funding_coverage_pct must only ever be a real,
        // checked figure).
        tuition_note: sub.tuition_note,
        funding_coverage_pct: sub.funding_coverage_pct,
        eligibility_note: sub.eligibility_note,
        deadline: sub.deadline,
        requirements: sub.description,
        status: 'active',
        raw: sub,
      });
      if (oErr) throw oErr;
    }

    const patch = { review_status: decision, reviewed_by: String(req.user.id), reviewed_at: new Date().toISOString() };
    if (decision === 'rejected') patch.rejection_reason = reason;
    const { error: uErr } = await supabase.from('study_opportunity_submissions').update(patch).eq('id', req.params.id);
    if (uErr) throw uErr;
    res.json({ success: true });
  } catch (e) {
    console.error('study-opportunities review', e);
    res.status(500).json({ error: 'Could not process review', code: 'ERR_SERVER' });
  }
});

module.exports = router;
