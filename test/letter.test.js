// routes/letter.js: letter generation (motivation letter for jobs, letter
// of interest for universities) -- the same hard access gate as the CV
// export, drafted from the seeker's real profile, rendered as a PDF.
// Gate cases run without ANTHROPIC_API_KEY; the happy path stubs global
// fetch for api.anthropic.com only, delegating everything else.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');
const { buildCvData } = require('../lib/cvBuilder');

const h = getApp();
after(() => h.stop());
beforeEach(() => { h.mock.__reset(); delete process.env.ANTHROPIC_API_KEY; });

const READY_PROFILE = { full_name: 'Jean Dupont', city: 'Laval', country: 'Canada', role_type: 'Electrician' };
const READY_SEEKER = { work_history: [{ employer: 'Acme', title: 'Electrician', start_date: '2019', end_date: '2024' }], education: [], certifications: [], languages: [] };

// ---------- the student CV variant itself (lib/cvBuilder.js) ----------

test('buildCvData picks the student variant for a seeking_study profile, professional otherwise, and honours an explicit override', () => {
  assert.equal(buildCvData({ user: {}, profile: { seeking_study: true }, seekerProfile: {} }).variant, 'student');
  assert.equal(buildCvData({ user: {}, profile: {}, seekerProfile: {} }).variant, 'professional');
  assert.equal(buildCvData({ user: {}, profile: { seeking_study: true }, seekerProfile: {}, variant: 'professional' }).variant, 'professional');
});

test('a student CV headline falls back to the target degree + field when no role_type is known', () => {
  const data = buildCvData({
    user: { name: 'S' },
    profile: { seeking_study: true, target_degree_level: 'graduate', target_field_of_study: 'agriculture' },
    seekerProfile: {},
  });
  assert.equal(data.headline, 'graduate — agriculture');
});

const caller = (userExtra = {}, profile = {}, seekerProfile = {}) => {
  const id = 900 + Math.floor(Math.random() * 100000);
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    name: 'Test User', email: 'test@example.com', subscription_status: 'inactive', ...userExtra };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null });
  h.mock.__set('profiles', { data: profile, error: null });
  h.mock.__set('seeker_profiles', { data: seekerProfile, error: null });
  return actor(h, { id, role: 'seeker' });
};

let callNum = 0;
const post = (token, body) => fetch(h.base + '/api/letter', {
  method: 'POST',
  headers: { ...auth(token), 'X-Forwarded-For': '10.55.' + (++callNum % 250) + '.1' },
  body: JSON.stringify(body),
});

test('POST /api/letter without a token -> 401', async () => {
  const r = await fetch(h.base + '/api/letter', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.55.250.9' },
    body: JSON.stringify({ type: 'motivation' }),
  });
  assert.equal(r.status, 401);
});

test('POST /api/letter refuses a bad type with 400', async () => {
  const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
  const r = await post(token, { type: 'love' });
  assert.equal(r.status, 400);
});

test('POST /api/letter accepts the scholarship type (422 on a thin profile proves type validation passed)', async () => {
  const token = caller({ subscription_status: 'active' }, {}, {});
  const r = await post(token, { type: 'scholarship' });
  assert.equal(r.status, 422);
});

test('POST /api/letter refuses an unsubscribed seeker with 402 -- the hard gate, same as the CV', async () => {
  const token = caller({ subscription_status: 'inactive' }, READY_PROFILE, READY_SEEKER);
  const r = await post(token, { type: 'motivation' });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).code, 'ERR_LETTER_SUBSCRIPTION_REQUIRED');
});

test('POST /api/letter accepts a launch-offer bonus as access (bonus_access_until in the future)', async () => {
  const token = caller({ bonus_access_until: new Date(Date.now() + 30 * 86400000).toISOString() }, {}, {});
  // thin profile -> 422 NOT_READY proves the 402 gate already passed
  const r = await post(token, { type: 'interest' });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, 'ERR_LETTER_NOT_READY');
});

test('POST /api/letter 422s a subscribed seeker whose profile is too thin to draft from', async () => {
  const token = caller({ subscription_status: 'active' }, {}, {});
  const r = await post(token, { type: 'motivation' });
  assert.equal(r.status, 422);
});

test('POST /api/letter returns a real PDF attachment on the happy path', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => String(url).includes('api.anthropic.com')
    ? Promise.resolve(new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Dear Hiring Manager,\n\nI am writing about the electrician opening.\n\nSincerely,\nJean Dupont' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, opts);
  try {
    const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
    const r = await post(token, { type: 'motivation', target: 'Acme Electric — electrician', lang: 'en' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.ok(/Motivation-Letter/.test(r.headers.get('content-disposition')));
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  } finally { globalThis.fetch = realFetch; }
});

const anthropicText = (text) => Promise.resolve(new Response(JSON.stringify({
  content: [{ type: 'text', text }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

test('POST /api/letter regenerates once when the draft asserts an unstated hardship', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, opts) => String(url).includes('api.anthropic.com')
    ? (calls.push(JSON.parse(opts.body)),
       calls.length === 1
         ? anthropicText('Dear Scholarship Committee,\n\nI cannot afford my tuition due to my family\'s financial hardship and the loss of my father.\n\nSincerely,\nJean')
         : anthropicText('Dear Scholarship Committee,\n\n' + 'I am eager to pursue graduate study in agriculture and to contribute to my field through dedicated research and honest work over the coming years. '.repeat(3) + '\n\nSincerely,\nJean'))
    : realFetch(url, opts);
  try {
    const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
    const r = await post(token, { type: 'scholarship' });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages[0].content, /cannot afford/);
  } finally { globalThis.fetch = realFetch; }
});

test('POST /api/letter strips ungrounded sentences if the retry still violates', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (url, opts) => String(url).includes('api.anthropic.com')
    ? (++calls && anthropicText('Dear Scholarship Committee,\n\n' + 'I am eager to pursue graduate study in agriculture and to contribute to my field through dedicated research and honest work over the coming years. '.repeat(3) + 'I fled the war in my country which destroyed my family home.\n\nSincerely,\nJean'))
    : realFetch(url, opts);
  try {
    const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
    const r = await post(token, { type: 'scholarship' });
    assert.equal(r.status, 200); // scrubbed body still renders a PDF
    assert.equal(calls, 2);
  } finally { globalThis.fetch = realFetch; }
});
