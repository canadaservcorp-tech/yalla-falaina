// The shared store is what makes a limit global across Railway instances; if it silently
// stopped counting in Postgres we would be back to limit x instances without noticing.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';

const { createMockDb } = require('./helpers/mockDb');
const dbPath = require.resolve('../db');
const mock = createMockDb();
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };

const { store } = require('../lib/rate-store');

const reset = new Date(Date.now() + 60_000);
beforeEach(() => mock.__reset());

test('counts in the database, one bucket per limiter', async () => {
  mock.__setRpc('rate_hit', { data: [{ hits: 3, reset_at: reset.toISOString() }], error: null });
  const s = store('login');
  s.init({ windowMs: 60_000 });

  assert.deepEqual(await s.increment('1.2.3.4'), { totalHits: 3, resetTime: reset });
  const call = mock.__lastRpc('rate_hit');
  assert.equal(call.args.p_key, 'rl:login:1.2.3.4');   // namespaced, so limiters can't share a count
  assert.equal(call.args.p_window_ms, 60_000);
  assert.equal(call.args.p_step, 1);
});

test('a successful request can be refunded', async () => {
  mock.__setRpc('rate_hit', { data: [{ hits: 2, reset_at: reset.toISOString() }], error: null });
  const s = store('write');
  s.init({ windowMs: 60_000 });
  await s.decrement('1.2.3.4');
  assert.equal(mock.__lastRpc('rate_hit').args.p_step, -1);
});

test('an unreachable database still limits, in memory, without a call per request', async () => {
  mock.__setRpc('rate_hit', { data: null, error: { message: 'connection refused' } });
  const s = store('search');
  s.init({ windowMs: 60_000, limit: 5 });

  const before = mock.__rpcCalls('rate_hit').length;
  // MemoryStore hands back its live entry, so read the count before hitting it again
  const first = (await s.increment('9.9.9.9')).totalHits;
  const second = (await s.increment('9.9.9.9')).totalHits;
  assert.equal(first, 1);
  assert.equal(second, 2);                                    // still counting
  // gave up after the first failure instead of paying for a round trip per request
  assert.equal(mock.__rpcCalls('rate_hit').length - before, 1);
});
