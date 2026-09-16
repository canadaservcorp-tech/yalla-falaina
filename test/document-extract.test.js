// lib/documentExtract.js -- text extraction for uploaded medical/lab
// reports. PDF extraction is real (pdf-parse, no vendor key); image OCR is a
// thin, honestly-gated vendor wrapper (same pattern as lib/flightSearch.js/
// lib/hotelSearch.js/lib/translate.js) until Hicham picks an OCR vendor.
const test = require('node:test');
const assert = require('node:assert');
const PDFDocument = require('pdfkit');
const {
  extractDocumentText, extractPdfText, extractImageText,
  ocrConfigured, isAllowedType, MAX_DOCUMENT_BYTES,
} = require('../lib/documentExtract');

// Builds a real, valid PDF in memory with the given text -- a genuine
// end-to-end test of the extraction library, not a mocked one.
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

test('a real PDF with text is extracted correctly', async () => {
  const pdf = await makePdf('Patient requires: total hip replacement, right side. Diagnosis code M16.1.');
  const text = await extractPdfText(pdf);
  assert.match(text, /total hip replacement/);
  assert.match(text, /M16\.1/);
});

test('pdf-parse page-boundary markers are stripped, not left as noise in the extracted text', async () => {
  const pdf = await makePdf('Required treatment: cardiac bypass surgery.');
  const text = await extractPdfText(pdf);
  assert.doesNotMatch(text, /--\s*\d+\s*of\s*\d+\s*--/);
});

test('an empty buffer is rejected as bad input, not silently returning empty text', async () => {
  await assert.rejects(() => extractPdfText(Buffer.alloc(0)), { code: 'ERR_BAD_INPUT' });
});

test('a buffer over the size ceiling is rejected before any parsing is attempted', async () => {
  const big = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
  await assert.rejects(() => extractPdfText(big), { code: 'ERR_DOC_TOO_LARGE' });
});

test('garbage bytes that are not a real PDF are rejected as unreadable, not crashing the process', async () => {
  await assert.rejects(() => extractPdfText(Buffer.from('this is not a pdf file at all')), { code: 'ERR_DOC_UNREADABLE' });
});

test('image OCR is honestly gated behind ocrConfigured() -- unconfigured by default, refuses rather than pretending to read the image', async () => {
  delete process.env.OCR_API_KEY;
  assert.equal(ocrConfigured(), false);
  await assert.rejects(() => extractImageText(Buffer.from([0xff, 0xd8, 0xff])), { code: 'ERR_OCR_UNAVAILABLE' });
});

test('extractDocumentText dispatches by content type -- PDF works for real, an unsupported type is refused', async () => {
  const pdf = await makePdf('Required treatment: kidney transplant evaluation.');
  const text = await extractDocumentText(pdf, 'application/pdf');
  assert.match(text, /kidney transplant/);

  await assert.rejects(() => extractDocumentText(Buffer.from('x'), 'text/plain'), { code: 'ERR_BAD_DOC_TYPE' });
});

test('isAllowedType accepts PDF and common image types, rejects everything else', () => {
  assert.equal(isAllowedType('application/pdf'), true);
  assert.equal(isAllowedType('image/jpeg'), true);
  assert.equal(isAllowedType('image/png'), true);
  assert.equal(isAllowedType('application/zip'), false);
  assert.equal(isAllowedType('text/plain'), false);
});
