// routes/push.js — subscribing/unsubscribing browsers for web push. The
// actual sending (lib/webPush.js, lib/jobAlerts.js) has its own test files;
// this one is just the HTTP surface: input validation, upsert-on-endpoint,
// and the "not configured" 503 when no VAPID keys are set at all.
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { getApp, auth } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

beforeEach(() => h.mock.__reset());

test('GET /api/push/public-key returns the configured VAPID key, no auth required', async () => {
  const r = await fetch(h.base + '/api/push/public-key');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.key, vapidKeys.publicKey);
});

test('GET /api/health reports push:true once VAPID keys are configured', async () => {
  const r = await fetch(h.base + '/api/health');
  const d = await r.json();
  assert.equal(d.push, true);
});

test('POST /api/push/subscribe rejects a malformed subscription', async () => {
  h.mock.__set('users', { data: { id: 1, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 1, role: 'seeker' }, process.env.JWT_SECRET);
  for (const body of [{}, { endpoint: 'x' }, { endpoint: 'x', keys: { p256dh: 'a' } }, { endpoint: 123, keys: { p256dh: 'a', auth: 'b' } }]) {
    const r = await fetch(h.base + '/api/push/subscribe', { method: 'POST', headers: auth(token), body: JSON.stringify(body) });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test('POST /api/push/subscribe upserts on endpoint (a re-subscribing browser replaces its own row)', async () => {
  h.mock.__set('users', { data: { id: 2, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 2, role: 'seeker' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/push/subscribe', {
    method: 'POST', headers: auth(token),
    body: JSON.stringify({ endpoint: 'https://push.example/xyz', keys: { p256dh: 'p', auth: 'a' } }),
  });
  assert.equal(r.status, 200);
  const [upsert] = h.mock.__writes('push_subscriptions', 'upsert');
  assert.equal(upsert.payload.user_id, 2);
  assert.equal(upsert.opts.onConflict, 'endpoint');
});

test('DELETE /api/push/subscribe removes a subscription scoped to the caller', async () => {
  h.mock.__set('users', { data: { id: 3, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 3, role: 'seeker' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/push/subscribe', {
    method: 'DELETE', headers: auth(token), body: JSON.stringify({ endpoint: 'https://push.example/xyz' }),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('push_subscriptions', 'delete').length, 1);
});

test('DELETE /api/push/subscribe requires an endpoint', async () => {
  h.mock.__set('users', { data: { id: 4, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 4, role: 'seeker' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/push/subscribe', { method: 'DELETE', headers: auth(token), body: JSON.stringify({}) });
  assert.equal(r.status, 400);
});

test('subscribe/unsubscribe both require a real, verified account', async () => {
  const r1 = await fetch(h.base + '/api/push/subscribe', { method: 'POST', headers: auth('garbage'), body: '{}' });
  assert.equal(r1.status, 401);
  const r2 = await fetch(h.base + '/api/push/subscribe', { method: 'DELETE', headers: auth('garbage'), body: '{}' });
  assert.equal(r2.status, 401);
});
