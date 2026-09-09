const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

// The retention script reads ../db at require time — inject the mock first,
// same trick appHarness uses for the server.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
delete process.env.RESEND_API_KEY; // dev-mode email logs to console, never sends
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run } = require('../scripts/profile-retention');
const paginate = require('../lib/paginate');

const inDays = n => new Date(Date.now() + n * 86400000).toISOString();

test.beforeEach(() => mock.__reset());
const originalPageSize = paginate.PAGE_SIZE;
test.afterEach(() => { paginate.PAGE_SIZE = originalPageSize; });

test('a user past the deadline loses profile + intake data but keeps the account', async () => {
  mock.__set('users', { data: [{ id: 7, email: 'gone@example.com', data_retention_deadline: inDays(-1), retention_warned_at: inDays(-20) }], error: null });
  mock.__set('document_uploads', { data: [{ id: 'd1', storage_path: 'cv/7.pdf' }], error: null });

  const r = await run();
  assert.equal(r.deleted, 1);

  // conversations are deleted explicitly (the FK would only SET NULL them)
  const convDel = mock.__writes('concierge_conversations', 'delete');
  assert.equal(convDel.length, 1);
  // the profiles row goes (cascading seeker_profiles / document_uploads / daily_usage)
  assert.equal(mock.__writes('profiles', 'delete').length, 1);
  // the users account row is only updated, never deleted
  assert.equal(mock.__writes('users', 'delete').length, 0);
  const clear = mock.__writes('users', 'update');
  assert.equal(clear.length, 1);
  assert.equal(clear[0].payload.data_retention_deadline, null);
  // profile data register() copied onto the account row goes with the profile
  assert.equal(clear[0].payload.name, null);
  assert.equal(clear[0].payload.phone, null);
});

test('a failed deletion step keeps the deadline so the next run retries', async () => {
  mock.__set('users', { data: [{ id: 7, email: 'gone@example.com', data_retention_deadline: inDays(-1), retention_warned_at: null }], error: null });
  // the document lookup itself fails — nothing downstream may run
  mock.__set('document_uploads', { data: null, error: { message: 'db unreachable' } });
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try { await run(); } finally { console.error = orig; }
  assert.equal(mock.__writes('concierge_conversations', 'delete').length, 0);
  assert.equal(mock.__writes('profiles', 'delete').length, 0);
  assert.equal(mock.__writes('users', 'update').length, 0);   // deadline stays set
  assert.ok(logs.some(l => /retention docs/.test(l)));
});

test('a deadline inside the warning window sends the email once', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    mock.__set('users', { data: [{ id: 8, email: 'warn@example.com', data_retention_deadline: inDays(3), retention_warned_at: null }], error: null });
    const r = await run();
    assert.equal(r.warned, 1);
    assert.equal(r.deleted, 0);
  } finally { console.log = orig; }
  assert.ok(logs.some(l => /email:dev.*warn@example\.com/.test(l)));
  assert.equal(mock.__writes('users', 'update')[0].payload.retention_warned_at != null, true);
  assert.equal(mock.__writes('profiles', 'delete').length, 0);
});

test('already-warned and far-out deadlines are left alone', async () => {
  mock.__set('users', { data: [
    { id: 9, email: 'a@x.com', data_retention_deadline: inDays(3), retention_warned_at: inDays(-1) },
    { id: 10, email: 'b@x.com', data_retention_deadline: inDays(20), retention_warned_at: null },
  ], error: null });
  const r = await run();
  assert.equal(r.warned, 0);
  assert.equal(r.deleted, 0);
  assert.equal(mock.__writes().length, 0);
});

test('more retention-due accounts than one page — every row across every page is processed, not just the first page', async () => {
  paginate.PAGE_SIZE = 2;
  mock.__queue('users',
    { data: [
        { id: 1, email: 'a@example.com', data_retention_deadline: inDays(-1), retention_warned_at: null },
        { id: 2, email: 'b@example.com', data_retention_deadline: inDays(-1), retention_warned_at: null },
      ], error: null },
    { data: [
        { id: 3, email: 'c@example.com', data_retention_deadline: inDays(-1), retention_warned_at: null },
      ], error: null });
  // After the two queued pages are consumed, every per-row revalidation
  // .maybeSingle() re-check also reads this same 'users' fixture (the mock
  // can't distinguish queries by shape, only by table) — a generic truthy
  // fallback lets each one confirm "still overdue" so this test stays about
  // pagination, not about the revalidation logic (already covered above).
  mock.__set('users', { data: { id: 0 }, error: null });
  const r = await run();
  assert.equal(r.deleted, 3);
  assert.equal(mock.__writes('profiles', 'delete').length, 3);
});
