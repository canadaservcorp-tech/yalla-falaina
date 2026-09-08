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
// A full Section-10-complete profile pair — the completeness gate recomputes
// live from the row fields on every call, so fixtures need the whole set.
const COMPLETE_PROFILE = { id: 0, preferred_language: 'en', preferred_country: 'canada', sector: 'hospitality', role_type: null };
const COMPLETE_SEEKER = { is_complete: true, confirmed_by_user: true,
  work_history: [{ employer: 'X', title: 'cook' }], languages: [{ language: 'ar', level: 'native' }],
  has_passport: true, has_visa: false, has_legal_residency_current_country: true, has_family_or_host_abroad: false };
// A caller: every queued users row is complete — the route reads `users` twice
// (requireActiveUser, then the subscription gate) and a partial row would 403.
// Defaults to a complete profile pair too, so every existing test below
// clears the profile-completeness gate the same way it always implicitly
// did before that gate existed; pass seekerProfile explicitly to test intake mode.
const caller = (sub = {}, seekerProfile = COMPLETE_SEEKER, profile = COMPLETE_PROFILE) => {
  const id = ++uid + 100;
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    subscription_status: 'inactive', subscription_tier: 'none', ...sub };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null }, { data: row, error: null });
  h.mock.__set('seeker_profiles', { data: seekerProfile, error: null });
  h.mock.__set('profiles', { data: profile ? { ...profile, id } : null, error: null });
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

test('an incomplete profile enters intake mode instead of being refused, with no job retrieval', async () => {
  process.env.PAYWALL_ENFORCED = 'true';   // intake mode also bypasses the paywall
  h.mock.__set('profiles', { data: { preferred_language: null, preferred_country: null, sector: null, role_type: null }, error: null });
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-intake' }, error: null });
  const r = await ask({ message: 'hi' }, caller({}, { is_complete: false, confirmed_by_user: false }, { preferred_language: null, preferred_country: null, sector: null, role_type: null }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, true);
  assert.equal(j.isComplete, false);
  assert.deepEqual(j.jobs, []);
  assert.ok(j.missing.includes('preferred_language'));
  assert.ok(j.missing.includes('work_history'));
  assert.ok(j.missing.includes('has_passport'));
  assert.match(upstream.body.system, /INTAKE MODE/);
  assert.match(upstream.body.system, /Do NOT mention, list, or recommend any jobs/);
});

test('no seeker_profiles row at all is intake mode, not a crash', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-intake2' }, error: null });
  const r = await ask({ message: 'hi' }, caller({}, null, null));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, true);
  assert.equal(j.isComplete, false);
});

test('intake mode persists a ---PROFILE--- extraction block through the shared write path and strips it from the reply', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-intake3' }, error: null });
  respond = () => ({ status: 200, body: { content: [{ type: 'text', text: 'Thanks! Saved that.\n---PROFILE---\n{"preferred_country":"canada","has_passport":true}\n---END---' }] } });
  const r = await ask({ message: 'I want Canada and I have a passport' }, caller({}, { id: 'sp-prior', is_complete: false, confirmed_by_user: false }, { preferred_language: 'en', preferred_country: null, sector: 'hospitality', role_type: null }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, true);
  assert.doesNotMatch(j.reply, /PROFILE---/);
  assert.match(j.reply, /Thanks! Saved that/);
  // an existing seeker_profiles row is updated by id, not duplicated
  const writes = h.mock.__writes('seeker_profiles', 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.has_passport, true);
  assert.equal(writes[0].payload.intake_method, 'conversational');
});

test('a complete profile passes straight through to matching', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c2' }, error: null });
  const r = await ask({ message: 'electrician canada' }, caller());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, false);
  assert.match(upstream.body.system, /JOB_CONTEXT/);
});
