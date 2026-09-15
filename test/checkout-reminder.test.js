// scripts/checkout-reminder.js — the abandoned-checkout recovery email.
// Same "inject the mock db before requiring the script" pattern as
// test/profile-retention.test.js.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
delete process.env.RESEND_API_KEY; // dev-mode email logs to console, never sends
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run } = require('../scripts/checkout-reminder');
const paginate = require('../lib/paginate');

const hoursAgo = n => new Date(Date.now() - n * 3600000).toISOString();

test.beforeEach(() => mock.__reset());
const originalPageSize = paginate.PAGE_SIZE;
test.afterEach(() => { paginate.PAGE_SIZE = originalPageSize; });

test('a checkout abandoned over an hour ago with no reminder yet gets one', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    mock.__set('users', { data: [
      { id: 7, email: 'abandoned@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
    ], error: null });
    const sent = await run();
    assert.equal(sent, 1);
  } finally { console.log = orig; }
  assert.ok(logs.some(l => /email:dev.*abandoned@example\.com/.test(l)));
  const [update] = mock.__writes('users', 'update');
  assert.equal(update.payload.checkout_reminder_sent_at != null, true);
});

test('only marks checkout_reminder_sent_at -- never touches checkout_started_at or subscription fields itself', async () => {
  mock.__set('users', { data: [
    { id: 7, email: 'a@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
  ], error: null });
  await run();
  const [update] = mock.__writes('users', 'update');
  assert.deepEqual(Object.keys(update.payload), ['checkout_reminder_sent_at']);
});

test('a checkout started less than an hour ago is left alone -- not abandoned yet, could just be mid-payment', async () => {
  mock.__set('users', { data: [], error: null }); // the .lte(cutoff) filter itself would exclude it in real Postgres;
  const sent = await run();                        // simulate that by returning no rows for a too-recent start
  assert.equal(sent, 0);
  assert.equal(mock.__writes('users', 'update').length, 0);
});

test('an account that already has a reminder on file for this attempt is never emailed twice', async () => {
  // is('checkout_reminder_sent_at', null) is a query-level filter (real
  // Postgres would already exclude this row) -- simulate that the same way
  // as the "too recent" test above: nothing comes back from the query.
  mock.__set('users', { data: [], error: null });
  const sent = await run();
  assert.equal(sent, 0);
});

test('an account that is somehow already active is skipped -- belt-and-suspenders alongside the webhook clearing checkout_started_at', async () => {
  mock.__set('users', { data: [
    { id: 8, email: 'active@example.com', subscription_status: 'active', checkout_started_at: hoursAgo(3) },
  ], error: null });
  const sent = await run();
  assert.equal(sent, 0);
  assert.equal(mock.__writes('users', 'update').length, 0);
});

test('a send failure for one account does not stop the rest from being processed', async () => {
  // lib/email.js's sendEmail only makes a real network call (and can only
  // fail) once RESEND_API_KEY is set — force that path and stub fetch so one
  // recipient's send genuinely rejects, rather than trying to swap out the
  // sendEmail binding checkout-reminder.js already captured at require time.
  process.env.RESEND_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.to === 'bad@example.com') return new Response('provider down', { status: 500 });
    return new Response(JSON.stringify({ id: 'sent' }), { status: 200 });
  };
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    mock.__set('users', { data: [
      { id: 9, email: 'bad@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
      { id: 10, email: 'good@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
    ], error: null });
    const sent = await run();
    assert.equal(sent, 1);
  } finally { console.error = orig; global.fetch = originalFetch; delete process.env.RESEND_API_KEY; }
  assert.ok(logs.some(l => /checkout reminder 9/.test(l)));
});

test('more abandoned checkouts than one page — every row across every page is processed', async () => {
  paginate.PAGE_SIZE = 2;
  mock.__queue('users',
    { data: [
        { id: 1, email: 'a@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
        { id: 2, email: 'b@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
      ], error: null },
    { data: [
        { id: 3, email: 'c@example.com', subscription_status: 'inactive', checkout_started_at: hoursAgo(2) },
      ], error: null });
  const sent = await run();
  assert.equal(sent, 3);
});

test('propagates a real query error rather than silently returning zero', async () => {
  mock.__set('users', { data: null, error: { message: 'connection reset' } });
  await assert.rejects(() => run());
});
