const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const get = (path, token) => fetch(h.base + path, { headers: auth(token) });
const post = (path, token, body) =>
  fetch(h.base + path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

// the list reads the page, then counts the unread ones in a second query
const page = (rows, unread) =>
  h.mock.__queue('notifications', { data: rows, error: null }, { count: unread, data: null, error: null });

test('notifications without a token -> 401', async () => {
  assert.equal((await fetch(h.base + '/api/notifications')).status, 401);
});

test('a banned user cannot read notifications -> 403', async () => {
  const token = actor(h, { id: 60, banned: true });
  assert.equal((await get('/api/notifications', token)).status, 403);
});

test('an unverified user cannot read notifications -> 403', async () => {
  const token = actor(h, { id: 61, verified: false });
  assert.equal((await get('/api/notifications', token)).status, 403);
});

test('the list returns my page and the unread count from SQL', async () => {
  const token = actor(h, { id: 62, role: 'provider' });
  page([
    { id: 2, type: 'boost_ending', title: 't', body: 'b', read: false },
    { id: 1, type: 'new_message', title: 't', body: 'b', read: true },
  ], 51);   // more unread than the page holds
  const j = await (await get('/api/notifications', token)).json();
  assert.equal(j.notifications.length, 2);
  assert.equal(j.unread, 51);
  assert.equal(j.notify_email, true);
});

test('the list reports an unsubscribed user as opted out', async () => {
  const token = actor(h, { id: 68, extra: { notify_email: false } });
  page([], 0);
  assert.equal((await (await get('/api/notifications', token)).json()).notify_email, false);
});

test('marking one read only touches my own rows', async () => {
  const token = actor(h, { id: 63 });
  h.mock.__set('notifications', { data: [], error: null });
  assert.equal((await post('/api/notifications/read', token, { id: 7 })).status, 200);
  assert.deepEqual(h.mock.__writes('notifications', 'update').pop().payload, { read: true });
});

test('a bad notification id is refused -> 400', async () => {
  const token = actor(h, { id: 64 });
  assert.equal((await post('/api/notifications/read', token, { id: 'all' })).status, 400);
});

test('a failed read update is not reported as success -> 500', async () => {
  const token = actor(h, { id: 65 });
  h.mock.__setOp('notifications', 'update', { data: null, error: { message: 'nope' } });
  assert.equal((await post('/api/notifications/read', token, {})).status, 500);
});

test('email-pref toggles the unsubscribe flag', async () => {
  const token = actor(h, { id: 66 });
  const r = await post('/api/notifications/email-pref', token, { enabled: false });
  assert.equal((await r.json()).notify_email, false);
  assert.deepEqual(h.mock.__writes('users', 'update').pop().payload, { notify_email: false });
});

test('email-pref requires a boolean -> 400', async () => {
  const token = actor(h, { id: 67 });
  assert.equal((await post('/api/notifications/email-pref', token, { enabled: 'no' })).status, 400);
});
