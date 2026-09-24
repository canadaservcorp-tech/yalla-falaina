// Streaming turns (req.body.stream === true): the reply is pushed over SSE —
// 'stage' events narrating real pipeline steps, 'delta' events streaming the
// answer as it generates, then one 'done' event carrying the exact same
// payload the JSON path returns. Pinned here: the transport, the event
// order, that ---PROFILE--- fencing never reaches a delta, and that
// non-stream callers are untouched.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
const realFetch = globalThis.fetch;
// Anthropic's stream:true answer shape. respond() returns the SSE text the
// upstream would emit for a given reply string.
let replyText = 'Here is what I found.';
const sseFor = (text) =>
  'event: content_block_delta\n' +
  `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, Math.ceil(text.length / 2)) } })}\n\n` +
  'event: content_block_delta\n' +
  `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(Math.ceil(text.length / 2)) } })}\n\n` +
  'event: message_stop\n' +
  'data: {"type":"message_stop"}\n\n';
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    // Streaming turns get Anthropic's SSE shape; non-stream turns get the
    // normal JSON body — the server picks its transport from req.body.stream.
    if (JSON.parse(opts.body).stream === true)
      return new Response(sseFor(replyText), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: replyText }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};
after(() => { globalThis.fetch = realFetch; return h.stop(); });
beforeEach(() => { h.mock.__reset(); process.env.ANTHROPIC_API_KEY = 'test-key'; delete process.env.PAYWALL_ENFORCED; replyText = 'Here is what I found.'; });

let uid = 0;
const COMPLETE_SEEKER = { is_complete: true, confirmed_by_user: true,
  work_history: [{ employer: 'X', title: 'cook' }], education: [], certifications: [], languages: [{ language: 'ar', level: 'native' }],
  has_passport: true, has_visa: false, has_legal_residency_current_country: true, has_family_or_host_abroad: false };
const caller = (profile = {}, sub = {}) => {
  const id = ++uid + 900;
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    subscription_status: 'active', subscription_tier: 'basic', ...sub };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null }, { data: row, error: null });
  h.mock.__set('seeker_profiles', { data: COMPLETE_SEEKER, error: null });
  h.mock.__set('profiles', { data: { id, preferred_language: 'en', preferred_country: 'canada', sector: 'hospitality', ...profile }, error: null });
  return auth(actor(h, { id, role: 'seeker' }));
};
let visitor = 0;
const post = (body, hdrs) => fetch(h.base + '/api/concierge', {
  method: 'POST',
  headers: { 'X-Forwarded-For': '10.9.' + (++visitor % 250) + '.' + (visitor % 250), 'Content-Type': 'application/json', ...hdrs },
  body: JSON.stringify(body),
});
// SSE wire text -> [{event, data}]
const parseSse = (text) => text.split('\n\n').filter(f => f.includes('data:')).map(f => ({
  event: (f.split('\n').find(l => l.startsWith('event:')) || 'message').replace('event:', '').trim(),
  data: JSON.parse(f.split('\n').find(l => l.startsWith('data:')).slice(5).trim()),
}));

test('a stream:true turn answers over SSE: searching → found → writing → deltas → done', async () => {
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'c-stream' }, error: null });
  h.mock.__set('jobs', { data: [
    { id: 7, title: 'Electrician', employer: 'Acme', country: 'Canada', city: 'Laval', category: 'trades', track: 'western', source_type: 'licensed_api', external_source: 'seed', source_url: 'https://example.test/7', raw: {} },
  ], error: null });
  replyText = 'Found a real match for you.';
  const r = await post({ message: 'electrician canada', stream: true }, caller());
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const events = parseSse(await r.text());
  const kinds = events.map(e => e.event);
  assert.deepEqual(kinds.filter(k => k === 'stage').length >= 3, true, 'searching + found + writing stages');
  const stages = events.filter(e => e.event === 'stage').map(e => e.data.stage);
  assert.deepEqual(stages[0], 'searching');
  assert.deepEqual(stages[stages.length - 1], 'writing');
  assert.ok(stages.includes('found'), 'a found stage between searching and writing');
  const found = events.find(e => e.event === 'stage' && e.data.stage === 'found');
  assert.equal(found.data.n, 1, 'the real matched count, not a made-up number');
  const deltas = events.filter(e => e.event === 'delta').map(e => e.data.text).join('');
  assert.equal(deltas, replyText, 'deltas carry the full reply, in order');
  const done = events.find(e => e.event === 'done');
  assert.ok(done, 'a done event carries the final payload');
  assert.equal(done.data.success, true);
  assert.equal(done.data.reply, replyText);
  assert.equal(done.data.suggest, 'jobs');
  assert.ok(done.data.jobsRetrieved);
  assert.equal(kinds[kinds.length - 1], 'done', 'done is the last event');
});

test('the ---PROFILE--- block is withheld from deltas but still parsed for the done payload', async () => {
  const agent = caller();
  h.mock.__set('seeker_profiles', { data: null, error: null });   // AFTER caller() -- it sets a complete row
  h.mock.__setOp('seeker_profiles', 'insert', { data: { id: 'sp-1' }, error: null });
  h.mock.__setOp('seeker_profiles', 'update', { data: { id: 'sp-1' }, error: null });
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp-1' }, error: null });
  replyText = '---PROFILE---{"full_name":"Sam"}---END---Thanks! And which country?';
  const r = await post({ message: 'my name is Sam', stream: true }, agent);
  const events = parseSse(await r.text());
  const deltaText = events.filter(e => e.event === 'delta').map(e => e.data.text).join('');
  assert.ok(!deltaText.includes('---PROFILE---'), 'raw fencing never reaches the client mid-stream');
  assert.ok(!deltaText.includes('"full_name"'), 'the block content never reaches the client mid-stream');
  const done = events.find(e => e.event === 'done');
  assert.equal(done.data.reply, 'Thanks! And which country?');
});

test('a non-stream caller still gets plain JSON, identical shape', async () => {
  const r = await post({ message: 'hello' }, caller());
  assert.match(r.headers.get('content-type'), /application\/json/);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.equal(j.reply, replyText);
});
