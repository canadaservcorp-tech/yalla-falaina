// The composer's 📎 attach button: one document per call (CV, university
// letter, contract, photo of a document...), raw bytes in — same shape as
// routes/voice.js and routes/medical-intake.js/documents, and the same
// express.raw() carve-out in server.js. Uploads are a subscriber perk
// (Hicham: "any kind of documents... all can be uploaded after
// subscription"), gated only when the paywall is actually enforced so
// dev/staging keeps working.
//
// Unlike the medical upload this does NOT merge text into
// medical_intake_requests — a CV or an admission letter has nothing to do
// with a named treatment. The extracted text lives on the document_uploads
// row itself and routes/concierge.js feeds the seeker's recent documents
// into the prompt as their own uploaded material (see DOCUMENTS_CONTEXT).
const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const supabase = require('../db');
const { extractDocumentText, isAllowedType, MAX_DOCUMENT_BYTES } = require('../lib/documentExtract');
const access = require('../lib/access');
const router = express.Router();

const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';
// Same window as the medical upload's own flagged assumption — a CV or an
// admission letter stays relevant through a real application cycle.
const RETENTION_DAYS = 180;
const EXT_BY_TYPE = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'text/plain': 'txt', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
const DOCUMENT_KINDS = ['cv', 'letter', 'document'];

router.post('/', sec.limits.upload, authenticate, sec.requireActiveUser, async (req, res) => {
  const contentType = req.get('content-type');
  const kind = DOCUMENT_KINDS.includes(req.query.kind) ? req.query.kind : 'document';
  // Raw bytes carry no filename — the client passes it as ?name=.
  const fileName = sec.clean(req.query.name, 200) || null;
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || !buffer.length)
    return res.status(400).json({ error: 'A document is required', code: 'ERR_BAD_INPUT' });
  if (buffer.length > MAX_DOCUMENT_BYTES)
    return res.status(413).json({ error: 'That document is too large', code: 'ERR_DOC_TOO_LARGE' });
  if (!isAllowedType(contentType))
    return res.status(415).json({ error: 'Upload a PDF or a clear photo (JPEG/PNG) of the document', code: 'ERR_BAD_DOC_TYPE' });

  try {
    if (process.env.PAYWALL_ENFORCED === 'true') {
      const { data: u, error: uErr } = await supabase.from('users')
        .select('subscription_status, subscription_tier, bonus_access_until')
        .eq('id', req.user.id).maybeSingle();
      if (uErr) throw uErr;
      if (!access.hasAccess(u))
        return res.status(402).json({ error: 'Uploading documents is included with a subscription', upgrade: true, code: 'ERR_PAYWALL' });
    }

    // Extraction BEFORE storage, same discipline as the medical upload: a
    // document we can't read at all shouldn't occupy storage and a row.
    const text = await extractDocumentText(buffer, contentType);

    const ext = EXT_BY_TYPE[String(contentType).split(';')[0].trim().toLowerCase()] || 'bin';
    const storagePath = `seeker-documents/${req.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(storagePath, buffer, { contentType: String(contentType).split(';')[0].trim() });
    if (upErr) throw upErr;

    const { error: docErr } = await supabase.from('document_uploads').insert({
      profile_id: req.user.id, kind, storage_path: storagePath, file_name: fileName,
      extracted_text: text || null,
      retention_expires_at: new Date(Date.now() + RETENTION_DAYS * 864e5).toISOString(),
    });
    if (docErr) console.error('document row', docErr.message); // file is stored; row failure is logged, not fatal

    res.json({ success: true, fileName, kind, extractedChars: (text || '').length });
  } catch (e) {
    const code = e.code || 'ERR_SERVER';
    const status = code === 'ERR_DOC_TOO_LARGE' ? 413
      : code === 'ERR_BAD_DOC_TYPE' ? 415
      : code === 'ERR_OCR_UNAVAILABLE' ? 503
      : code === 'ERR_DOC_EMPTY' || code === 'ERR_DOC_UNREADABLE' ? 422
      : code === 'ERR_BAD_INPUT' ? 400
      : 500;
    if (status >= 500) console.error('document upload', e.message || e);
    res.status(status).json({ error: 'Could not process that document', code });
  }
});

module.exports = router;
