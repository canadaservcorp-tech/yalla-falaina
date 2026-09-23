// The concierge response names WHICH quick-reply pool fits the turn
// (data.suggest) — the client renders the wording. Pins the priority:
// intake before the gate; what actually matched this turn (jobs, then
// study, then medical) over the seeker's signup track; track as the
// fallback when nothing matched.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
const realFetch = globalThis.fetch;
let respond = () => ({ status: 200, body: { content: [{ type: 'text', text: 'Here is what I found.' }] } });
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const r = respond();
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};
after(() => { globalThis.fetch = realFetch; return h.stop(); });
beforeEach(() => { h.mock.__reset(); process.env.ANTHROPIC_API_KEY = 'test-key'; delete process.env.PAYWALL_ENFORCED; });

let uid = 0;
const COMPLETE_SEEKER = { is_complete: true, confirmed_by_user: true,
  work_history: [{ employer: 'X', title: 'cook' }], education: [], certifications: [], languages: [{ language: 'ar', level: 'native' }],
  has_passport: true, has_visa: false, has_legal_residency_current_country: true, has_family_or_host_abroad: false };
const caller = (profile = {}, sub = {}) => {
  const id = ++uid + 500;
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    subscription_status: 'active', subscription_tier: 'basic', ...sub };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null }, { data: row, error: null });
  h.mock.__set('seeker_profiles', { data: COMPLETE_SEEKER, error: null });
  h.mock.__set('profiles', { data: { id, preferred_language: 'en', preferred_country: 'canada', sector: 'hospitality', ...profile }, error: null });
  return auth(actor(h, { id, role: 'seeker' }));
};
let visitor = 0;
const ask = (body, hdrs) => fetch(h.base + '/api/concierge', {
  method: 'POST',
  headers: { 'X-Forwarded-For': '10.7.' + (++visitor % 250) + '.' + (visitor % 250), 'Content-Type': 'application/json', ...hdrs },
  body: JSON.stringify(body),
});

test('an incomplete profile gets the intake pool', async () => {
  const agent = caller();
  h.mock.__set('seeker_profiles', { data: null, error: null });   // AFTER caller() -- it sets a complete row
  const r = await ask({ message: 'hello' }, agent);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.suggest, 'intake');
});

test('matched jobs beat everything else — the chips ask job follow-ups', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-sugg' }, error: null });
  h.mock.__set('jobs', { data: [
    { id: 5, title: 'Electrician', employer: 'Acme', country: 'Canada', city: 'Laval', category: 'trades', track: 'western', source_type: 'licensed_api', external_source: 'seed', source_url: 'https://example.test/5', raw: {} },
  ], error: null });
  const r = await ask({ message: 'electrician canada' }, caller());
  assert.equal((await r.json()).suggest, 'jobs');
});

test('a student with no matches gets the study pool from their track', async () => {
  const r = await ask({ message: 'tell me more' }, caller({ seeking_study: true }));
  assert.equal((await r.json()).suggest, 'study');
});

test('a treatment seeker with no matches gets the medical pool', async () => {
  const r = await ask({ message: 'tell me more' }, caller({ seeking_treatment: true }));
  assert.equal((await r.json()).suggest, 'medical');
});

test('a plain job-seeker with no matches gets the work pool', async () => {
  const r = await ask({ message: 'what can you do' }, caller());
  assert.equal((await r.json()).suggest, 'work');
});
