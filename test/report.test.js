const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('POST /api/report rejects invalid kind -> 400', async () => {
  const token = actor(h, { id: 21 });
  const res = await fetch(h.base + '/api/report', {
    method: 'POST', headers: auth(token),
    body: JSON.stringify({ kind: 'not-a-kind', conversationId: 1 }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/report accepts a valid kind -> 200', async () => {
  const token = actor(h, { id: 22 });
  h.mock.__set('conversations', { data: { id: 1, seeker_id: 22, provider_id: 99 }, error: null });
  h.mock.__set('reports', { data: { id: 10, kind: 'abuse' }, error: null });
  const res = await fetch(h.base + '/api/report', {
    method: 'POST', headers: auth(token),
    body: JSON.stringify({ kind: 'abuse', conversationId: 1 }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);
});

test('POST /api/report refuses a conversation you are not in -> 403', async () => {
  const token = actor(h, { id: 23 });
  h.mock.__set('conversations', { data: { id: 1, seeker_id: 500, provider_id: 501 }, error: null });
  const res = await fetch(h.base + '/api/report', {
    method: 'POST', headers: auth(token),
    body: JSON.stringify({ kind: 'abuse', conversationId: 1 }),
  });
  assert.equal(res.status, 403);
});

test('GET /api/report/admin/queue -> 403 for non-admin', async () => {
  const token = actor(h, { id: 24, role: 'seeker' });
  const res = await fetch(h.base + '/api/report/admin/queue', { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('POST /api/report/admin/:id/action -> 403 for non-admin', async () => {
  const token = actor(h, { id: 25, role: 'seeker' });
  const res = await fetch(h.base + '/api/report/admin/5/action', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ action: 'block' }),
  });
  assert.equal(res.status, 403);
});

test('an "admin" claim in the token alone does not grant admin -> 403', async () => {
  const jwt = require('jsonwebtoken');
  h.mock.__set('users', { data: { id: 26, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 26, role: 'admin' }, process.env.JWT_SECRET);
  const res = await fetch(h.base + '/api/report/admin/queue', { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('GET /api/report/admin/queue with a real admin -> 200', async () => {
  const token = actor(h, { id: 27, role: 'admin' });
  h.mock.__set('reports', { data: [], error: null });
  const res = await fetch(h.base + '/api/report/admin/queue', { headers: auth(token) });
  assert.equal(res.status, 200);
});
