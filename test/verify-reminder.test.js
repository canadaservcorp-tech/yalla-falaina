// scripts/verify-reminder.js — the unverified-signup nudge email. Same
// "inject the mock db before requiring the script" pattern as
// test/profile-retention.test.js and test/checkout-reminder.test.js.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
delete process.env.RESEND_API_KEY; // dev-mode email logs to console, never sends
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run } = require('../scripts/verify-reminder');
const paginate = require('../lib/paginate');

const hoursAgo = n => new Date(Date.now() - n * 3600000).toISOString();

test.beforeEach(() => mock.__reset());
const originalPageSize = paginate.PAGE_SIZE;
test.afterEach(() => { paginate.PAGE_SIZE = originalPageSize; });

test('an account still unverified a day later, with no reminder sent yet, gets one -- and its token is rotated', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    mock.__set('users', {
      data: [{ id: 7, email: 'pending@example.com', email_verified: false, banned: false, verify_token: 'old-token', created_at: hoursAgo(30) }],
      error: null,
    });
    mock.__setOp('users', 'update', { data: [{ id: 7 }], error: null }); // the CAS rotation's own .select('id')
    const sent = await run();
    assert.equal(sent, 1);
  } finally { console.log = orig; }
  assert.ok(logs.some(l => /email:dev.*pending@example\.com/.test(l)));
  // both the token rotation and the final verify_reminder_sent_at mark are users.update writes
  const writes = mock.__writes('users', 'update');
  assert.ok(writes.some(w => typeof w.payload.verify_token === 'string' && w.payload.verify_token !== 'old-token'));
  assert.ok(writes.some(w => w.payload.verify_reminder_sent_at != null));
});

test('the emailed link carries the freshly rotated token, not the stale one on file', async () => {
  let emailedHtml = '';
  const origLog = console.log;
  console.log = (...a) => { emailedHtml += a.join(' '); };
  try {
    mock.__set('users', {
      data: [{ id: 8, email: 'a@example.com', email_verified: false, banned: false, verify_token: 'old-token', created_at: hoursAgo(30) }],
      error: null,
    });
    mock.__setOp('users', 'update', { data: [{ id: 8 }], error: null });
    await run();
  } finally { console.log = origLog; }
  assert.doesNotMatch(emailedHtml, /token=old-token/);
  assert.match(emailedHtml, /\/api\/auth\/verify\?token=[0-9a-f]{64}&id=8/);
});

test('a lost compare-and-swap (a concurrent resend already rotated the token) is left alone, not double-sent', async () => {
  mock.__set('users', {
    data: [{ id: 9, email: 'a@example.com', email_verified: false, banned: false, verify_token: 'old-token', created_at: hoursAgo(30) }],
    error: null,
  });
  mock.__setOp('users', 'update', { data: [], error: null }); // CAS matched zero rows -- someone else already rotated it
  const sent = await run();
  assert.equal(sent, 0);
});

test('a signup less than a day old is left alone -- not a nudge candidate yet', async () => {
  // lte(cutoff) is a query-level filter (real Postgres would already exclude
  // this row); simulate that the same way the checkout-reminder tests do.
  mock.__set('users', { data: [], error: null });
  const sent = await run();
  assert.equal(sent, 0);
});

test('a send failure restores the previous token rather than leaving the account with a dead end', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('provider down', { status: 500 });
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    mock.__set('users', {
      data: [{ id: 10, email: 'a@example.com', email_verified: false, banned: false, verify_token: 'old-token', created_at: hoursAgo(30) }],
      error: null,
    });
    mock.__setOp('users', 'update', { data: [{ id: 10 }], error: null });
    const sent = await run();
    assert.equal(sent, 0);
  } finally { console.error = orig; global.fetch = originalFetch; delete process.env.RESEND_API_KEY; }
  assert.ok(logs.some(l => /verify reminder send 10/.test(l)));
  const writes = mock.__writes('users', 'update');
  // rotate, then restore to the ORIGINAL token -- verify_reminder_sent_at must never be set
  assert.ok(writes.some(w => w.payload.verify_token === 'old-token'));
  assert.ok(!writes.some(w => 'verify_reminder_sent_at' in w.payload));
});

test('more due accounts than one page — every row across every page is processed', async () => {
  paginate.PAGE_SIZE = 2;
  mock.__queue('users',
    { data: [
        { id: 1, email: 'a@example.com', email_verified: false, banned: false, verify_token: null, created_at: hoursAgo(30) },
        { id: 2, email: 'b@example.com', email_verified: false, banned: false, verify_token: null, created_at: hoursAgo(30) },
      ], error: null },
    { data: [
        { id: 3, email: 'c@example.com', email_verified: false, banned: false, verify_token: null, created_at: hoursAgo(30) },
      ], error: null });
  mock.__setOp('users', 'update', { data: [{ id: 0 }], error: null });
  const sent = await run();
  assert.equal(sent, 3);
});

test('propagates a real query error rather than silently returning zero', async () => {
  mock.__set('users', { data: null, error: { message: 'connection reset' } });
  await assert.rejects(() => run());
});
