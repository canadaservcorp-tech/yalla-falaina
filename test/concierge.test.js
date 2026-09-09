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
  work_history: [{ employer: 'X', title: 'cook' }], education: [], certifications: [], languages: [{ language: 'ar', level: 'native' }],
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
  // lib/usage.js charges atomically via schema.sql's usage_charge() RPC, not
  // a plain daily_usage upsert (see lib/usage.js's charge() for why).
  assert.equal(h.mock.__rpcCalls('usage_charge').length, 1);
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

test('a subscription is required when the paywall is enforced and the free preview is used up', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  const r = await ask({ message: 'hi' }, caller({ free_preview_used: 3 }));   // caller's gate row is 'inactive'
  assert.equal(r.status, 402);
  assert.equal(upstream, null);
});

// ---------- free preview (first 3 messages) ----------

test('the first free-preview turn reaches the model with redacted jobs, not a 402', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-preview1' }, error: null });
  h.mock.__set('jobs', { data: [
    { id: 9, title: 'Electrician', employer: 'Acme', country: 'Canada', city: 'Laval', category: 'trades', track: 'western', source_type: 'licensed_api', external_source: 'seed', source_url: 'https://example.test/9', raw: {} },
  ], error: null });
  const r = await ask({ message: 'electrician canada' }, caller({ free_preview_used: 0 }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.preview, true);
  assert.equal(j.previewRemaining, 2);
  // the redacted shape reaches the client: no application link, no real requirements text
  assert.ok(j.jobs.every(job => job.teaser === true && job.url === ''));
  assert.match(upstream.body.system, /FREE PREVIEW MODE/);
  assert.match(upstream.body.system, /subscribe to see the full requirements/);
  assert.doesNotMatch(upstream.body.system, /url: https/);
  // preview turns still go through matching/logging/quota exactly like a paid turn
  assert.equal(h.mock.__rpcCalls('usage_charge').length, 1);
});

test('the free-preview counter increments atomically so the 4th matching turn hits the paywall', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-preview2' }, error: null });
  const r = await ask({ message: 'hi' }, caller({ free_preview_used: 2 }));   // last free reply
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.preview, true);
  assert.equal(j.previewRemaining, 0);
  // markPreviewUsed() calls schema.sql's increment_free_preview() RPC, not a
  // plain `update ... set free_preview_used = previewUsed + 1` — that old
  // form computed the new value from a value read earlier in the request,
  // the exact TOCTOU shape fixed across this whole sweep (see routes/
  // concierge.js's markPreviewUsed for the full story). Asserting no bare
  // `users` update happened, alongside the RPC call, is what would catch a
  // regression back to that pattern.
  assert.equal(h.mock.__writes('users', 'update').length, 0);
  const calls = h.mock.__rpcCalls('increment_free_preview');
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].args.p_user_id, 'number');
});

test('intake mode never touches the preview counter, even with PAYWALL_ENFORCED on', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-preview3' }, error: null });
  const r = await ask({ message: 'hi' }, caller({ free_preview_used: 0 }, { is_complete: false, confirmed_by_user: false },
    { preferred_language: null, preferred_country: null, sector: null, role_type: null }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, true);
  assert.ok(!j.preview);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
  assert.equal(h.mock.__rpcCalls('increment_free_preview').length, 0);
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
  assert.ok(j.missing.includes('education'));
  assert.ok(j.missing.includes('certifications'));
  assert.ok(j.missing.includes('has_passport'));
  assert.match(upstream.body.system, /INTAKE MODE/);
  assert.match(upstream.body.system, /Do NOT mention, list, or recommend any jobs/);
  // intake turns are free — the daily quota is neither checked nor charged,
  // and the logged turn records 0 units rather than the matching cost
  assert.equal(h.mock.__rpcCalls('usage_charge').length, 0);
  assert.equal(h.mock.__writes('concierge_messages', 'insert')[0].payload.units_charged, 0);
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
  // an existing seeker_profiles row is upserted by profile_id, not duplicated
  const writes = h.mock.__writes('seeker_profiles', 'upsert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.has_passport, true);
  assert.equal(writes[0].payload.intake_method, 'conversational');
});

test('a malformed field in a ---PROFILE--- block is dropped and logged, not allowed to sink the valid fields', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-lenient' }, error: null });
  respond = () => ({ status: 200, body: { content: [{ type: 'text', text:
    'Noted.\n---PROFILE---\n{"preferred_language":"klingon","city":"Tripoli","country":"LB","sector":"construction","has_passport":false,"work_history":[]}\n---END---' }] } });
  const errors = [];
  const origErr = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const r = await ask({ message: 'details' }, caller({}, { id: 'sp-prior', is_complete: false, confirmed_by_user: false },
      { preferred_language: null, preferred_country: null, sector: null, role_type: null }));
    assert.equal(r.status, 200);
  } finally { console.error = origErr; }

  // the four good fields persisted; the bad language code did not
  const profWrites = h.mock.__writes('profiles', 'upsert');
  const intakeWrite = profWrites[profWrites.length - 1].payload; // last = applyIntake (an earlier {id}-only upsert ensures the row)
  assert.equal(intakeWrite.city, 'Tripoli');
  assert.equal(intakeWrite.sector, 'construction');
  assert.ok(!('preferred_language' in intakeWrite));
  const seekerWrites = h.mock.__writes('seeker_profiles', 'upsert');
  assert.equal(seekerWrites.length, 1);
  assert.equal(seekerWrites[0].payload.has_passport, false);
  assert.deepEqual(seekerWrites[0].payload.work_history, []);
  // ...and the rejection left a trace in the server log
  assert.ok(errors.some(e => /concierge intake extraction rejected/.test(e) && /preferred_language/.test(e)));
});

test('a complete profile passes straight through to matching', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c2' }, error: null });
  const r = await ask({ message: 'electrician canada' }, caller());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.intake, false);
  assert.match(upstream.body.system, /JOB_CONTEXT/);
});

// ---------- feeding the stored profile into every turn ----------

test('a complete profile is injected into the system prompt so the seeker is never asked to repeat themselves', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-ctx' }, error: null });
  const r = await ask({ message: 'electrician canada' }, caller());
  assert.equal(r.status, 200);
  assert.match(upstream.body.system, /SEEKER PROFILE/);
  assert.match(upstream.body.system, /Preferred destination country: canada/);
  assert.match(upstream.body.system, /Sector: hospitality/);
  assert.match(upstream.body.system, /Work history.*cook/);
  // a "no"/false answer is real, already-given information, not a gap to hide
  assert.match(upstream.body.system, /Has visa: false/);
});

test('an incomplete profile still gets what has already been answered fed into intake mode', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-ctx2' }, error: null });
  const r = await ask({ message: 'hi' }, caller({}, { is_complete: false, confirmed_by_user: false, has_passport: true },
    { preferred_language: null, preferred_country: null, sector: 'hospitality', role_type: null }));
  assert.equal(r.status, 200);
  assert.match(upstream.body.system, /INTAKE MODE/);
  assert.match(upstream.body.system, /SEEKER PROFILE/);
  assert.match(upstream.body.system, /Sector: hospitality/);
  assert.match(upstream.body.system, /Has passport: true/);
});

test('a profile with nothing answered yet adds no SEEKER PROFILE block', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-ctx3' }, error: null });
  const r = await ask({ message: 'hi' }, caller({}, null, null));
  assert.equal(r.status, 200);
  assert.doesNotMatch(upstream.body.system, /SEEKER PROFILE/);
});

test('an omitted preferredCountry falls back to the profile\'s stored destination for ranking', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-ctx4' }, error: null });
  h.mock.__set('jobs', { data: [
    { id: 1, title: 'Cook', employer: 'A', country: 'France', city: 'Paris', category: 'hospitality', track: 'western', source_type: 'licensed_api', external_source: 'seed', raw: {} },
    { id: 2, title: 'Cook', employer: 'B', country: 'Canada', city: 'Laval', category: 'hospitality', track: 'western', source_type: 'licensed_api', external_source: 'seed', raw: {} },
  ], error: null });
  // no preferredCountry in the request body — only the stored profile (canada, from `caller()`'s default) says where
  const r = await ask({ message: 'cook job' }, caller());
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.jobs[0].country, 'Canada');   // the profile's preferred_country wins the tie, not request order
});
