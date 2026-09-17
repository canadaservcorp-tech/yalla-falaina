'use strict';

// Text extraction for uploaded medical/lab report documents
// (routes/medical-intake.js). Deliberately narrow: this module's only job is
// turning document bytes into plain text for KEYWORD MATCHING against
// medical_treatment_providers (lib/yf/medicalMatching.js) -- it never
// interprets, summarizes, or reasons about what the text says. That
// discipline is enforced in lib/yf/systemPrompt.js's guardrails, not here,
// but it's why this module hands back raw text and nothing more.
//
// PDF extraction works for real right now via pdf-parse -- a local, pure-JS
// library. Nothing is sent to a third party to read a PDF report. Image OCR
// (a phone photo of a paper report) is a genuinely different problem: real
// accuracy needs either a bundled OCR engine with trained language models or
// a cloud vision API, both real vendor/infra decisions -- so it follows the
// same thin-wrapper "configured() gate, honest error, nothing invented"
// pattern as lib/flightSearch.js/lib/hotelSearch.js/lib/translate.js,
// deliberately left unwired pending Hicham's vendor choice (e.g. AWS
// Textract, Google Cloud Vision, Azure Document Intelligence).

const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // lab reports/scans run bigger than a voice note
const PDF_TIMEOUT_MS = 20000;

// Read late (not at module load) so tests and /api/health see env changes,
// same convention as lib/transcribe.js's own configured().
const ocrConfigured = () => Boolean(process.env.OCR_API_KEY);

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error(message); e.code = 'ERR_SERVER'; reject(e); }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function extractPdfText(buffer) {
  if (!buffer || !buffer.length) { const e = new Error('empty document'); e.code = 'ERR_BAD_INPUT'; throw e; }
  if (buffer.length > MAX_DOCUMENT_BYTES) { const e = new Error('document too large'); e.code = 'ERR_DOC_TOO_LARGE'; throw e; }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await withTimeout(parser.getText(), PDF_TIMEOUT_MS, 'PDF parsing timed out');
    // Strip pdf-parse's own page-boundary markers ("-- N of M --") and
    // collapse whitespace -- noise for a keyword search, never content.
    const text = String(result.text || '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) { const e = new Error('no extractable text in that PDF'); e.code = 'ERR_DOC_EMPTY'; throw e; }
    return text;
  } catch (e) {
    if (e.code) throw e;
    const wrapped = new Error('Could not read that PDF — it may be corrupted, password-protected, or a scanned image with no embedded text.');
    wrapped.code = 'ERR_DOC_UNREADABLE';
    throw wrapped;
  } finally {
    if (typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
  }
}

async function extractImageText(buffer) {
  if (!buffer || !buffer.length) { const e = new Error('empty document'); e.code = 'ERR_BAD_INPUT'; throw e; }
  if (!ocrConfigured()) {
    const e = new Error('Reading a photo of a report is not set up yet — please upload the PDF version instead, or type the required treatment/procedure directly.');
    e.code = 'ERR_OCR_UNAVAILABLE';
    throw e;
  }
  // No OCR vendor wired in yet (see module comment) -- this branch exists so
  // the moment Hicham picks one, only this function needs a real
  // implementation; every caller and every guardrail above it is already in
  // place and already tested against the ERR_OCR_UNAVAILABLE path.
  const e = new Error('Image OCR is enabled but not implemented yet');
  e.code = 'ERR_SERVER';
  throw e;
}

async function extractPlainText(buffer) {
  if (!buffer || !buffer.length) { const e = new Error('empty document'); e.code = 'ERR_BAD_INPUT'; throw e; }
  const text = buffer.toString('utf8').replace(/\s+/g, ' ').trim();
  if (!text) { const e = new Error('no readable text in that file'); e.code = 'ERR_DOC_EMPTY'; throw e; }
  return text;
}

// Word .docx -- mammoth is the established pure-JS reader (nothing sent to
// a third party, same rule as pdf-parse above). The older binary .doc
// format has no reliable pure-JS parser; asking for PDF instead is the
// honest answer there.
async function extractDocxText(buffer) {
  if (!buffer || !buffer.length) { const e = new Error('empty document'); e.code = 'ERR_BAD_INPUT'; throw e; }
  if (buffer.length > MAX_DOCUMENT_BYTES) { const e = new Error('document too large'); e.code = 'ERR_DOC_TOO_LARGE'; throw e; }
  try {
    const { value } = await withTimeout(mammoth.extractRawText({ buffer }), PDF_TIMEOUT_MS, 'DOCX parsing timed out');
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) { const e = new Error('no extractable text in that document'); e.code = 'ERR_DOC_EMPTY'; throw e; }
    return text;
  } catch (e) {
    if (e.code) throw e;
    const wrapped = new Error('Could not read that Word file — it may be corrupted or an older .doc (save it as PDF or .docx instead).');
    wrapped.code = 'ERR_DOC_UNREADABLE';
    throw wrapped;
  }
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const isAllowedType = ct => ALLOWED_TYPES.includes(String(ct || '').split(';')[0].trim().toLowerCase());

// Content-type dispatch -- the route decides what it received; this module
// only knows how to read it.
async function extractDocumentText(buffer, contentType) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct === 'application/pdf') return extractPdfText(buffer);
  if (ct === 'text/plain') return extractPlainText(buffer);
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocxText(buffer);
  if (ct.startsWith('image/')) return extractImageText(buffer);
  const e = new Error('Unsupported document type — upload a PDF, Word (.docx), plain-text file, or a clear photo (JPEG/PNG).');
  e.code = 'ERR_BAD_DOC_TYPE';
  throw e;
}

module.exports = {
  extractDocumentText, extractPdfText, extractImageText, extractPlainText, extractDocxText,
  ocrConfigured, isAllowedType, ALLOWED_TYPES, MAX_DOCUMENT_BYTES,
};
