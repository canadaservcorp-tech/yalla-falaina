// scripts/subscription-lapse.js flips access off once a cancelled subscription's
// already-paid-for period actually ends, and starts the 30-day data-retention
// countdown at the same moment (scripts/profile-retention.js then acts on that
// deadline — see test/profile-retention.test.js for its own well-covered path).
// Nothing exercised this script before this file, unlike its sibling.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run } = require('../scripts/subscription-lapse');
const sec = require('../lib/security'); // same module instance the script holds
const paginate = require('../lib/paginate');

const inDays = n => new Date(Date.now() + n * 86400000).toISOString();

test.beforeEach(() => mock.__reset());
const originalPageSize = paginate.PAGE_SIZE;
test.afterEach(() => { paginate.PAGE_SIZE = originalPageSize; });

test('an active subscription past its cancel_at date lapses: status/tier cleared, retention deadline started, cache dropped', async () => {
  mock.__set('users', { data: [{ id: 7, role: 'seeker', subscription_status: 'active' }], error: null });
  const dropped = [];
  const orig = sec.dropUserFromCache;
  sec.dropUserFromCache = id => { dropped.push(id); orig(id); };
  try {
    const due = await run();
    assert.equal(due, 1);
  } finally { sec.dropUserFromCache = orig; }

  const writes = mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.subscription_status, 'canceled');
  assert.equal(writes[0].payload.subscription_tier, 'none');
  assert.equal(writes[0].payload.subscription_cancel_at, null);
  assert.equal(writes[0].payload.retention_warned_at, null);
  assert.ok(writes[0].payload.data_retention_deadline, 'a 30-day deletion countdown must start');
  assert.equal(dropped[0], '7');
});

test('a row already past cancellation (not active) only gets the stale date cleared — the active-only lapse patch never runs on it', async () => {
  mock.__set('users', { data: [{ id: 9, role: 'seeker', subscription_status: 'canceled' }], error: null });
  const due = await run();
  assert.equal(due, 0);

  const writes = mock.__writes('users', 'update');
  assert.equal(writes.length, 1);
  // exactly the stale-clear shape — no status/tier/retention fields, so a
  // pending reactivation is never lapsed by a leftover date from before it
  assert.deepEqual(Object.keys(writes[0].payload).sort(), ['subscription_cancel_at']);
  assert.equal(writes[0].payload.subscription_cancel_at, null);
});

test('stale and due rows in the same run are each updated with their own patch shape, not conflated', async () => {
  mock.__set('users', {
    data: [
      { id: 1, role: 'seeker', subscription_status: 'active' },
      { id: 2, role: 'seeker', subscription_status: 'canceled' },
    ],
    error: null,
  });
  const due = await run();
  assert.equal(due, 1);
  // one batched .in() update for the stale row, one per-id update for the due row
  const writes = mock.__writes('users', 'update');
  assert.equal(writes.length, 2);
  const staleWrite = writes.find(w => Object.keys(w.payload).length === 1);
  const dueWrite = writes.find(w => w !== staleWrite);
  assert.equal(staleWrite.payload.subscription_cancel_at, null);
  assert.equal(dueWrite.payload.subscription_status, 'canceled');
});

test('no rows past subscription_cancel_at -> no writes, returns 0', async () => {
  mock.__set('users', { data: [], error: null });
  const due = await run();
  assert.equal(due, 0);
  assert.equal(mock.__writes().length, 0);
});

test('a DB error reading candidate rows propagates instead of being swallowed', async () => {
  mock.__set('users', { data: null, error: { message: 'connection refused' } });
  await assert.rejects(run(), err => err.message === 'connection refused');
});

test('a DB error while lapsing a due subscription propagates rather than under-reporting success', async () => {
  mock.__set('users', { data: [{ id: 5, role: 'seeker', subscription_status: 'active' }], error: null });
  mock.__setOp('users', 'update', { data: null, error: { message: 'write failed' } });
  await assert.rejects(run(), err => err.message === 'write failed');
});

test('more due subscriptions than one page — every row across every page lapses, not just the first page', async () => {
  paginate.PAGE_SIZE = 2;
  mock.__queue('users',
    { data: [{ id: 1, role: 'seeker', subscription_status: 'active' }, { id: 2, role: 'seeker', subscription_status: 'active' }], error: null },
    { data: [{ id: 3, role: 'seeker', subscription_status: 'active' }], error: null });
  const due = await run();
  assert.equal(due, 3);
  assert.equal(mock.__writes('users', 'update').length, 3);
});
