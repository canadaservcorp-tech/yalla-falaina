// routes/medical-intake.js -- the seeker's own request for help finding a
// medical treatment/procedure abroad, plus the document-upload/extraction
// path that backs it. Not a moderation queue (see the route's own comment):
// this is the seeker's own data about themselves, so no admin-review layer.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const PDFDocument = require('pdfkit');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

function makePdf(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
}

const post = (token, body) => fetch(h.base + '/api/medical-intake', {
  method: 'POST', headers: auth(token), body: JSON.stringify(body),
});
const get = token => fetch(h.base + '/api/medical-intake', { headers: auth(token) });
const postDocument = (token, buffer, contentType) => fetch(h.base + '/api/medical-intake/documents', {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': contentType },
  body: buffer,
});

// ---------- POST /api/medical-intake (text intake) ----------

test('missing requiredTreatment is refused before touching the database', async () => {
  const token = actor(h, { id: 501 });
  const r = await post(token, { medicalHistoryNote: 'some history' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
  assert.equal(h.mock.__writes('medical_intake_requests', 'insert').length, 0);
});

test('a normal intake request is accepted, stored, and flags the profile as seeking_treatment', async () => {
  const token = actor(h, { id: 502 });
  h.mock.__setOp('medical_intake_requests', 'insert', { data: { id: 'm1' }, error: null });
  const r = await post(token, { requiredTreatment: 'total hip replacement', medicalHistoryNote: 'osteoarthritis, right hip' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).success, true);
  const writes = h.mock.__writes('medical_intake_requests', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.required_treatment, 'total hip replacement');
  assert.equal(writes[0].payload.medical_history_note, 'osteoarthritis, right hip');
  const profileWrites = h.mock.__writes('profiles', 'update');
  assert.equal(profileWrites[0].payload.seeking_treatment, true);
});

test('medicalHistoryNote is optional and stored as null when omitted', async () => {
  const token = actor(h, { id: 503 });
  const r = await post(token, { requiredTreatment: 'cardiac bypass surgery' });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('medical_intake_requests', 'insert');
  assert.equal(writes[0].payload.medical_history_note, null);
});

test('a DB error on insert returns a clean 500, not a leaked stack trace', async () => {
  const token = actor(h, { id: 504 });
  h.mock.__setOp('medical_intake_requests', 'insert', { data: null, error: { message: 'connection refused' } });
  const r = await post(token, { requiredTreatment: 'kidney transplant evaluation' });
  assert.equal(r.status, 500);
  assert.equal((await r.json()).code, 'ERR_SERVER');
});

test('GET returns the most recent request', async () => {
  const token = actor(h, { id: 505 });
  h.mock.__set('medical_intake_requests', {
    data: { id: 'm1', required_treatment: 'total hip replacement', medical_history_note: null, status: 'pending' },
    error: null,
  });
  const r = await get(token);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.request.required_treatment, 'total hip replacement');
});

test('GET with nothing on file returns null, not a 404', async () => {
  const token = actor(h, { id: 506 });
  h.mock.__set('medical_intake_requests', { data: null, error: null });
  const r = await get(token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).request, null);
});

// ---------- POST /api/medical-intake/documents (upload + extraction) ----------

test('uploading a document with no intake request on file yet is refused, not silently accepted', async () => {
  const token = actor(h, { id: 507 });
  h.mock.__set('medical_intake_requests', { data: null, error: null });
  const pdf = await makePdf('Required treatment: total hip replacement.');
  const r = await postDocument(token, pdf, 'application/pdf');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('a real PDF report is extracted and merged into the intake request, and stored as a document_uploads row', async () => {
  const token = actor(h, { id: 508 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1', extracted_report_text: null }, error: null });
  const pdf = await makePdf('X-ray shows severe joint degeneration, right hip.');
  const r = await postDocument(token, pdf, 'application/pdf');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).success, true);

  const docWrites = h.mock.__writes('document_uploads', 'insert');
  assert.equal(docWrites.length, 1);
  assert.equal(docWrites[0].payload.kind, 'medical_report');
  assert.equal(docWrites[0].payload.profile_id, 508);

  const updateWrites = h.mock.__writes('medical_intake_requests', 'update');
  assert.match(updateWrites[0].payload.extracted_report_text, /joint degeneration/);
});

test('a second report appends to, rather than overwrites, previously extracted text', async () => {
  const token = actor(h, { id: 509 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1', extracted_report_text: 'First report: prior surgery in 2019.' }, error: null });
  const pdf = await makePdf('Second report: current bloodwork within normal limits.');
  const r = await postDocument(token, pdf, 'application/pdf');
  assert.equal(r.status, 200);
  const updateWrites = h.mock.__writes('medical_intake_requests', 'update');
  assert.match(updateWrites[0].payload.extracted_report_text, /prior surgery in 2019/);
  assert.match(updateWrites[0].payload.extracted_report_text, /bloodwork within normal limits/);
});

test('the kind query param selects lab_report vs. the medical_report default', async () => {
  const token = actor(h, { id: 510 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1', extracted_report_text: null }, error: null });
  const pdf = await makePdf('Lab result: hemoglobin 11.2 g/dL.');
  const r = await fetch(h.base + '/api/medical-intake/documents?kind=lab_report', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' }, body: pdf,
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('document_uploads', 'insert')[0].payload.kind, 'lab_report');
});

test('an unsupported document type is refused with 415', async () => {
  const token = actor(h, { id: 511 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1' }, error: null });
  const r = await postDocument(token, Buffer.from('plain text report'), 'text/plain');
  assert.equal(r.status, 415);
  assert.equal((await r.json()).code, 'ERR_BAD_DOC_TYPE');
});

test('a photo (image) upload is refused with 503 while OCR is unconfigured, rather than pretending to read it', async () => {
  delete process.env.OCR_API_KEY;
  const token = actor(h, { id: 512 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1' }, error: null });
  const r = await postDocument(token, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'ERR_OCR_UNAVAILABLE');
});

test('a corrupted/unreadable PDF is refused with 422, not a 500', async () => {
  const token = actor(h, { id: 513 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1' }, error: null });
  const r = await postDocument(token, Buffer.from('this is not a real pdf'), 'application/pdf');
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, 'ERR_DOC_UNREADABLE');
});

test('a document over the size ceiling is refused with 413 at the body-parser level', async () => {
  const token = actor(h, { id: 515 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1' }, error: null });
  const { MAX_DOCUMENT_BYTES } = require('../lib/documentExtract');
  const r = await postDocument(token, Buffer.alloc(MAX_DOCUMENT_BYTES + 1), 'application/pdf');
  assert.equal(r.status, 413);
  assert.equal((await r.json()).code, 'ERR_DOC_TOO_LARGE');
});

test('an empty body is refused as bad input', async () => {
  const token = actor(h, { id: 514 });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1' }, error: null });
  const r = await postDocument(token, Buffer.alloc(0), 'application/pdf');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

// ---------- the upload paywall gate (Hicham: all document uploads are a
// subscriber perk, same family as voice notes) ----------

test('with the paywall enforced, an unsubscribed seeker gets 402 before any upload work', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  try {
    const token = actor(h, { id: 516, extra: { subscription_status: 'none', bonus_access_until: null } });
    const pdf = await makePdf('Required treatment: knee replacement.');
    const r = await postDocument(token, pdf, 'application/pdf');
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'ERR_PAYWALL');
    assert.equal(h.mock.__writes('document_uploads', 'insert').length, 0);
  } finally { delete process.env.PAYWALL_ENFORCED; }
});

test('with the paywall enforced, an active subscriber still uploads fine', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  try {
    const token = actor(h, { id: 517, extra: { subscription_status: 'active', subscription_tier: 'basic' } });
    h.mock.__set('medical_intake_requests', { data: { id: 'm1', extracted_report_text: null }, error: null });
    const pdf = await makePdf('MRI shows a torn ACL.');
    const r = await postDocument(token, pdf, 'application/pdf');
    assert.equal(r.status, 200);
  } finally { delete process.env.PAYWALL_ENFORCED; }
});

test('with the paywall NOT enforced, uploads work for everyone (dev/staging behavior preserved)', async () => {
  delete process.env.PAYWALL_ENFORCED;
  const token = actor(h, { id: 518, extra: { subscription_status: 'none' } });
  h.mock.__set('medical_intake_requests', { data: { id: 'm1', extracted_report_text: null }, error: null });
  const pdf = await makePdf('Ultrasound: gallstones present.');
  const r = await postDocument(token, pdf, 'application/pdf');
  assert.equal(r.status, 200);
});
