// Medical-treatment/travel vertical -- the seeker's own request for help
// finding a treatment/procedure abroad, and the document upload that backs
// it. Two very different bodies share this router (JSON vs. raw file bytes),
// same reasoning and dispatch pattern as routes/voice.js: server.js routes
// POST /api/medical-intake/documents through express.raw() (see its own
// comment) and everything else through the normal express.json() path.
//
// This is deliberately NOT a moderation queue like study-opportunities.js --
// a seeker submitting their OWN medical situation isn't content that needs
// admin approval before it's "real"; it's their data about themselves, same
// as routes/profile.js's direct writes.
const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const supabase = require('../db');
const { extractDocumentText, isAllowedType, MAX_DOCUMENT_BYTES } = require('../lib/documentExtract');
const router = express.Router();

const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';
// Longer than the 30-day voice-note window: a medical-travel referral can
// genuinely take a few months to resolve, and the seeker's own report is
// still needed by a human coordinator throughout. Flagged for Hicham to
// confirm/adjust rather than guessed silently and left undocumented -- same
// spirit as lib/voiceNotes.js's own flagged assumption on cancellation
// timing.
const RETENTION_DAYS = 180;
const EXT_BY_TYPE = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
const DOCUMENT_KINDS = ['medical_report', 'lab_report'];

router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  const { data, error } = await supabase.from('medical_intake_requests')
    .select('id, required_treatment, medical_history_note, status, created_at, updated_at')
    .eq('profile_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('medical-intake get', error.message);
    return res.status(500).json({ error: 'Could not load your medical-travel request', code: 'ERR_SERVER' });
  }
  res.json({ success: true, request: data || null });
});

router.post('/', sec.limits.write, authenticate, sec.requireActiveUser, async (req, res) => {
  const requiredTreatment = sec.clean(req.body.requiredTreatment, 300);
  const medicalHistoryNote = sec.clean(req.body.medicalHistoryNote, 2000) || null;
  if (!requiredTreatment)
    return res.status(400).json({ error: 'requiredTreatment is required — the treatment/procedure your doctor told you that you need', code: 'ERR_BAD_INPUT' });

  try {
    const { data, error } = await supabase.from('medical_intake_requests').insert({
      profile_id: req.user.id, required_treatment: requiredTreatment, medical_history_note: medicalHistoryNote,
    }).select('id').maybeSingle();
    if (error) throw error;
    // Marks the seeker as being on the treatment track (additive signal only,
    // same discipline as seeking_study -- see that column's own schema.sql
    // comment) so the concierge's medical-travel section engages even for
    // someone who signed up on the work/study track and only later needed this.
    const { error: pErr } = await supabase.from('profiles').update({ seeking_treatment: true }).eq('id', req.user.id);
    if (pErr) console.error('medical-intake seeking_treatment flag', pErr.message); // request still stands
    res.json({ success: true, id: data && data.id });
  } catch (e) {
    console.error('medical-intake submit', e.message || e);
    res.status(500).json({ error: 'Could not save your medical-travel request', code: 'ERR_SERVER' });
  }
});

// Raw document bytes in, extracted text merged into the seeker's latest
// intake request. One document per call, same "one clip per call" shape as
// routes/voice.js. Requires an existing intake request (POST / above) so
// there is somewhere to attach the extracted text -- a document with no
// stated required_treatment alongside it has nothing for
// lib/yf/medicalMatching.js to search with anyway.
router.post('/documents', sec.limits.upload, authenticate, sec.requireActiveUser, async (req, res) => {
  const contentType = req.get('content-type');
  const kind = DOCUMENT_KINDS.includes(req.query.kind) ? req.query.kind : 'medical_report';
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || !buffer.length)
    return res.status(400).json({ error: 'A document is required', code: 'ERR_BAD_INPUT' });
  if (buffer.length > MAX_DOCUMENT_BYTES)
    return res.status(413).json({ error: 'That document is too large', code: 'ERR_DOC_TOO_LARGE' });
  if (!isAllowedType(contentType))
    return res.status(415).json({ error: 'Upload a PDF or a clear photo (JPEG/PNG) of the report', code: 'ERR_BAD_DOC_TYPE' });

  try {
    const { data: latest, error: lErr } = await supabase.from('medical_intake_requests')
      .select('id, extracted_report_text').eq('profile_id', req.user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (lErr) throw lErr;
    if (!latest)
      return res.status(400).json({ error: 'Tell us the required treatment first (POST /api/medical-intake) before uploading a report', code: 'ERR_BAD_INPUT' });

    // Extraction happens BEFORE storage: a document we can't read at all
    // (encrypted, corrupted, no embedded text) shouldn't still occupy
    // storage and a document_uploads row with nothing useful behind it.
    const text = await extractDocumentText(buffer, contentType);

    const ext = EXT_BY_TYPE[String(contentType).split(';')[0].trim().toLowerCase()] || 'bin';
    const storagePath = `medical-documents/${req.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(storagePath, buffer, { contentType: String(contentType).split(';')[0].trim() });
    if (upErr) throw upErr;

    const { error: docErr } = await supabase.from('document_uploads').insert({
      profile_id: req.user.id, kind, storage_path: storagePath,
      retention_expires_at: new Date(Date.now() + RETENTION_DAYS * 864e5).toISOString(),
    });
    if (docErr) console.error('medical document row', docErr.message); // file is stored; row failure is logged, not fatal

    // Multiple reports accumulate as separate paragraphs -- never overwritten
    // -- so a second lab result doesn't erase what the first one said.
    const merged = [latest.extracted_report_text, text].filter(Boolean).join('\n\n');
    const { error: updErr } = await supabase.from('medical_intake_requests')
      .update({ extracted_report_text: merged, updated_at: new Date().toISOString() })
      .eq('id', latest.id);
    if (updErr) throw updErr;

    res.json({ success: true, message: 'Report received — the required treatment you told us about now includes this document.' });
  } catch (e) {
    const code = e.code || 'ERR_SERVER';
    const status = code === 'ERR_DOC_TOO_LARGE' ? 413
      : code === 'ERR_BAD_DOC_TYPE' ? 415
      : code === 'ERR_OCR_UNAVAILABLE' ? 503
      : code === 'ERR_DOC_EMPTY' || code === 'ERR_DOC_UNREADABLE' ? 422
      : code === 'ERR_BAD_INPUT' ? 400
      : 500;
    if (status >= 500) console.error('medical document upload', e.message || e);
    res.status(status).json({ error: e.message || 'Could not process that document', code });
  }
});

module.exports = router;
