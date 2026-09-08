const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
const realFetch = globalThis.fetch;
let upstream = null;                                     // last request sent to the model
let respond = () => ({ status: 200, body: { content: [{ type: 'text', text: 'Ahla! Tell me where you want to go.' }] } });

// Intercept only the model call; requests to our own test server go through untouched.
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    upstream = { headers: opts.headers, body: JSON.parse(opts.body) };
    const r = respond();
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
      { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};

after(() => { globalThis.fetch = realFetch; return h.stop(); });
beforeEach(() => {
  h.mock.__reset();
  upstream = null;
  respond = () => ({ status: 200, body: { content: [{ type: 'text', text: 'Ahla! Tell me where you want to go.' }] } });
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.PAYWALL_ENFORCED;
});

let uid = 0;
// A caller: every queued users row is complete — the route reads `users` twice
// (requireActiveUser, then the subscription gate) and a partial row would 403.
const caller = (sub = {}) => {
  const id = ++uid + 100;
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    subscription_status: 'inactive', subscription_tier: 'none', ...sub };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null }, { data: row, error: null });
  return auth(actor(h, { id, role: 'seeker' }));
};
// The route is rate limited per address, so each call comes from its own visitor
// (`app.set('trust proxy', 1)` makes X-Forwarded-For the client IP).
let visitor = 0;
const ask = (body, hdrs) => fetch(h.base + '/api/concierge', {
  method: 'POST',
  headers: { 'X-Forwarded-For': '10.9.' + (++visitor % 250) + '.' + (visitor % 250), ...hdrs },
  body: JSON.stringify(body),
});

test('the concierge requires a signed-in, verified user', async () => {
  assert.equal((await ask({ message: 'hi' }, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal(upstream, null);
});

test('an empty message is refused before any paid call', async () => {
  for (const body of [{ message: '' }, { message: '   ' }, {}]) {
    assert.equal((await ask(body, caller())).status, 400);
  }
  assert.equal(upstream, null);
});

test('a normal turn reaches the model, logs both sides and charges the quota', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c1' }, error: null });
  const r = await ask({ message: 'cherche un poste au Canada' }, caller());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.ok(j.reply.length > 0);
  assert.equal(j.conversationId, 'c1');
  // the system prompt carries the JOB_CONTEXT the model may cite
  assert.match(upstream.body.system, /JOB_CONTEXT/);
  // both turns are logged; the assistant row records which jobs it was allowed to cite
  const writes = h.mock.__writes('concierge_messages', 'insert');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].payload.role, 'user');
  assert.equal(writes[1].payload.role, 'assistant');
  assert.ok('matched_job_ids' in writes[1].payload);
  assert.equal(h.mock.__writes('daily_usage', 'upsert').length, 1);
});

test('an echoed conversation id is only honored when it belongs to the caller', async () => {
  h.mock.__set('concierge_conversations', { data: null, error: null });      // not theirs -> new row
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'mine' }, error: null });
  const r = await ask({ message: 'hi', conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }, caller());
  const j = await r.json();
  assert.equal(j.conversationId, 'mine');
});

test('demo mode without a key returns the raw shortlist instead of a model reply', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const r = await ask({ message: 'electrician canada' }, caller());
  const j = await r.json();
  assert.equal(j.llmConfigured, false);
  assert.match(j.reply, /Demo mode/);
  assert.equal(upstream, null);
});

test('an upstream failure is reported, never swallowed as a fake answer', async () => {
  respond = () => ({ status: 529, body: 'overloaded' });
  const r = await ask({ message: 'hi' }, caller());
  assert.equal(r.status, 502);
});

test('a subscription is required when the paywall is enforced', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  const r = await ask({ message: 'hi' }, caller());   // caller's gate row is 'inactive'
  assert.equal(r.status, 402);
  assert.equal(upstream, null);
});
