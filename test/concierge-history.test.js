// GET /api/concierge/history (routes/concierge.js) -- Hicham's ask: "if he
// closed during the subscription, all chat will be saved, and continued,
// without missing any shared info with agent." concierge_conversations /
// concierge_messages already durably logged every turn (logTurn(), same
// file); the actual gap was public/index.html never reading it back on
// load. This endpoint is the fix, exercised directly here.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

// actor() itself is what sets the mocked 'users' row (see helpers/
// appHarness.js) -- passing banned/verified/extra through ITS params, not a
// separate __set('users', ...) call before/after it, since actor()'s own
// __set would otherwise just overwrite whatever this function set first.
const caller = ({ banned = false } = {}) => actor(h, { id: 800 + Math.floor(Math.random() * 100000), role: 'seeker', banned });

test('GET /api/concierge/history without a token -> 401', async () => {
  const r = await fetch(h.base + '/api/concierge/history');
  assert.equal(r.status, 401);
});

test('GET /api/concierge/history with no prior conversation returns conversationId:null and an empty list, not an error', async () => {
  const token = caller();
  h.mock.__set('concierge_conversations', { data: null, error: null });
  const r = await fetch(h.base + '/api/concierge/history', { headers: auth(token) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.success, true);
  assert.equal(body.conversationId, null);
  assert.deepEqual(body.messages, []);
});

test('GET /api/concierge/history returns the most recent conversation\'s messages, oldest first, role+content only', async () => {
  const token = caller();
  h.mock.__set('concierge_conversations', { data: { id: 'c-42' }, error: null });
  h.mock.__set('concierge_messages', {
    data: [
      { role: 'user', content: 'Bonjour, je cherche un emploi en electricite', created_at: '2026-01-01T10:00:00Z', matched_job_ids: null, units_charged: 1 },
      { role: 'assistant', content: 'Bien sur, parlons de ton experience.', created_at: '2026-01-01T10:00:05Z', matched_job_ids: null, units_charged: null },
    ],
    error: null,
  });
  const r = await fetch(h.base + '/api/concierge/history', { headers: auth(token) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.conversationId, 'c-42');
  assert.deepEqual(body.messages, [
    { role: 'user', content: 'Bonjour, je cherche un emploi en electricite' },
    { role: 'assistant', content: 'Bien sur, parlons de ton experience.' },
  ]);
  // internal bookkeeping columns (matched_job_ids, units_charged, created_at)
  // never leak to the client -- only role/content, same shape the chat UI
  // already renders from a live turn.
  for (const m of body.messages) assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
});

test('GET /api/concierge/history with an empty message list (a conversation row exists but nothing logged yet) returns an empty array, not null/undefined', async () => {
  const token = caller();
  h.mock.__set('concierge_conversations', { data: { id: 'c-empty' }, error: null });
  h.mock.__set('concierge_messages', { data: [], error: null });
  const r = await fetch(h.base + '/api/concierge/history', { headers: auth(token) });
  const body = await r.json();
  assert.equal(body.conversationId, 'c-empty');
  assert.deepEqual(body.messages, []);
});

test('GET /api/concierge/history for a banned account -> 403 (requireActiveUser), never reaching the conversation lookup', async () => {
  const token = caller({ banned: true });
  const r = await fetch(h.base + '/api/concierge/history', { headers: auth(token) });
  assert.equal(r.status, 403);
});
