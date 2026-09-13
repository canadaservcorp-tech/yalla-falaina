// lib/voiceNotes.js is the voice-note POLICY layer (duration cap, per-tier
// daily count ceiling, cancellation cleanup) -- recording/upload itself
// isn't built yet (see that file's header comment), but the limits Hicham
// asked for are real, decided rules this exercises directly against a mock
// db, same pattern as test/document-retention.test.js for the identical
// storage-then-row deletion mechanism this module reuses.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const voiceNotes = require('../lib/voiceNotes');

test.beforeEach(() => mock.__reset());

// ---------- MAX_VOICE_SECONDS / validateVoiceDuration ----------

test('validateVoiceDuration accepts anything from just-above-zero up to the 30s cap', () => {
  assert.equal(voiceNotes.MAX_VOICE_SECONDS, 30);
  assert.equal(voiceNotes.validateVoiceDuration(1), true);
  assert.equal(voiceNotes.validateVoiceDuration(30), true);
  assert.equal(voiceNotes.validateVoiceDuration(29.9), true);
});

test('validateVoiceDuration rejects zero, negative, over-cap, and non-numeric input', () => {
  for (const bad of [0, -1, 31, 30.01, '30', null, undefined, NaN]) {
    assert.equal(voiceNotes.validateVoiceDuration(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

// ---------- VOICE_NOTE_DAILY_LIMIT / checkVoiceNoteQuota ----------

test('voiceNoteDailyLimit: no subscription gets zero -- voice notes are a subscriber perk, not part of the free preview', () => {
  assert.equal(voiceNotes.voiceNoteDailyLimit('none'), 0);
});

test('voiceNoteDailyLimit: an unrecognized tier falls back to the "none" (zero) ceiling, same fail-closed default as lib/usage.js', () => {
  assert.equal(voiceNotes.voiceNoteDailyLimit('made-up-tier'), 0);
});

test('checkVoiceNoteQuota allows a basic subscriber under today\'s count', async () => {
  mock.__set('document_uploads', { data: null, error: null, count: 2 });
  const r = await voiceNotes.checkVoiceNoteQuota(7, 'basic');
  assert.deepEqual(r, { allowed: true, used: 2, limit: 5, tier: 'basic' });
});

test('checkVoiceNoteQuota refuses once today\'s count reaches the tier ceiling', async () => {
  mock.__set('document_uploads', { data: null, error: null, count: 5 });
  const r = await voiceNotes.checkVoiceNoteQuota(7, 'basic');
  assert.equal(r.allowed, false);
  assert.equal(r.used, 5);
  assert.equal(r.limit, 5);
});

test('checkVoiceNoteQuota refuses a non-subscriber outright (limit 0), regardless of count', async () => {
  mock.__set('document_uploads', { data: null, error: null, count: 0 });
  const r = await voiceNotes.checkVoiceNoteQuota(7, 'none');
  assert.equal(r.allowed, false);
  assert.equal(r.limit, 0);
});

test('checkVoiceNoteQuota fails CLOSED on a broken count read -- the opposite default from lib/usage.js#checkQuota, since count (not spend) is the entire point here', async () => {
  mock.__set('document_uploads', { data: null, error: { message: 'db unreachable' } });
  const r = await voiceNotes.checkVoiceNoteQuota(7, 'basic');
  assert.equal(r.allowed, false);
});

// ---------- deleteAllVoiceNotes (cancellation cleanup) ----------

test('deleteAllVoiceNotes removes storage objects then rows for every voice note on the profile', async () => {
  mock.__set('document_uploads', { data: [
    { id: 'v1', storage_path: 'voice_note/1.webm' },
    { id: 'v2', storage_path: 'voice_note/2.webm' },
  ], error: null });
  const removed = await voiceNotes.deleteAllVoiceNotes(42);
  assert.equal(removed, 2);
  assert.equal(mock.__writes('document_uploads', 'delete').length, 2);
});

test('deleteAllVoiceNotes has nothing to do when there are no voice notes -- 0 removed, no writes', async () => {
  mock.__set('document_uploads', { data: [], error: null });
  const removed = await voiceNotes.deleteAllVoiceNotes(42);
  assert.equal(removed, 0);
  assert.equal(mock.__writes().length, 0);
});

test('deleteAllVoiceNotes skips (does not delete the row for) a clip whose storage removal fails, same as scripts/document-retention.js\'s own retry-safety rule', async () => {
  mock.__set('document_uploads', { data: [{ id: 'v1', storage_path: 'voice_note/1.webm' }], error: null });
  const origFrom = mock.storage.from;
  mock.storage.from = () => ({ remove: async () => ({ data: null, error: { message: 'storage unreachable' } }) });
  try {
    const removed = await voiceNotes.deleteAllVoiceNotes(42);
    assert.equal(removed, 0);
  } finally { mock.storage.from = origFrom; }
  assert.equal(mock.__writes('document_uploads', 'delete').length, 0);
});
