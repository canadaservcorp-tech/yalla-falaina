// scripts/document-retention.js enforces the short retention window on
// uploaded documents (Sections 6.3/4.3): the document_uploads table existing
// isn't the policy — this job is what makes the deletion window real. Nothing
// exercised it before this file, unlike its sibling scripts/profile-retention.js.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run } = require('../scripts/document-retention');

test.beforeEach(() => mock.__reset());

test('an expired upload is removed from storage and its row deleted', async () => {
  mock.__set('document_uploads', { data: [{ id: 'd1', storage_path: 'cv/7.pdf' }], error: null });
  const removed = await run();
  assert.equal(removed, 1);
  const rowDeletes = mock.__writes('document_uploads', 'delete');
  assert.equal(rowDeletes.length, 1);
});

test('no expired uploads -> 0 removed, no writes', async () => {
  mock.__set('document_uploads', { data: [], error: null });
  const removed = await run();
  assert.equal(removed, 0);
  assert.equal(mock.__writes().length, 0);
});

test('multiple expired uploads are each removed independently', async () => {
  mock.__set('document_uploads', { data: [
    { id: 'd1', storage_path: 'cv/1.pdf' },
    { id: 'd2', storage_path: 'cv/2.pdf' },
    { id: 'd3', storage_path: 'passport/3.jpg' },
  ], error: null });
  const removed = await run();
  assert.equal(removed, 3);
  assert.equal(mock.__writes('document_uploads', 'delete').length, 3);
});

test('a storage removal failure logs and skips that row — the DB row is kept, not deleted, so it is retried next run', async () => {
  mock.__set('document_uploads', { data: [{ id: 'd1', storage_path: 'cv/7.pdf' }], error: null });
  const origRemove = mock.storage.from;
  mock.storage.from = () => ({ remove: async () => ({ data: null, error: { message: 'storage unreachable' } }) });
  const logs = [];
  const origErr = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const removed = await run();
    assert.equal(removed, 0);
  } finally { mock.storage.from = origRemove; console.error = origErr; }
  assert.equal(mock.__writes('document_uploads', 'delete').length, 0);
  assert.ok(logs.some(l => /retention storage d1/.test(l) && /storage unreachable/.test(l)));
});

test('a row-delete failure after successful storage removal is logged and not counted as removed (object is gone; the row lingers for a manual look, not silently double-counted)', async () => {
  mock.__set('document_uploads', { data: [{ id: 'd1', storage_path: 'cv/7.pdf' }], error: null });
  mock.__setOp('document_uploads', 'delete', { data: null, error: { message: 'row locked' } });
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const removed = await run();
    assert.equal(removed, 0);
  } finally { console.error = orig; }
  assert.ok(logs.some(l => /retention row d1/.test(l) && /row locked/.test(l)));
});

test('one failing row does not block the rest of the batch', async () => {
  mock.__set('document_uploads', { data: [
    { id: 'd1', storage_path: 'cv/1.pdf' },
    { id: 'd2', storage_path: 'cv/2.pdf' },
  ], error: null });
  const origRemove = mock.storage.from;
  let call = 0;
  mock.storage.from = () => ({
    remove: async () => (++call === 1 ? { data: null, error: { message: 'nope' } } : { data: [], error: null }),
  });
  const orig = console.error;
  console.error = () => {};
  try {
    const removed = await run();
    assert.equal(removed, 1); // only the second one succeeds
  } finally { mock.storage.from = origRemove; console.error = orig; }
  assert.equal(mock.__writes('document_uploads', 'delete').length, 1);
});

test('a DB error listing expired candidates propagates instead of being swallowed', async () => {
  mock.__set('document_uploads', { data: null, error: { message: 'connection refused' } });
  await assert.rejects(run(), err => err.message === 'connection refused');
});
