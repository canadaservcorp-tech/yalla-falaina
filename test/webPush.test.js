// lib/webPush.js — the thin wrapper around the `web-push` library. Real VAPID
// keys are generated once below (setVapidDetails validates key SHAPE, so a
// dummy string throws before any test gets to run) and web-push's own
// sendNotification is monkeypatched so nothing here makes a real network call.
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
process.env.VAPID_CONTACT_EMAIL = 'ops@example.invalid';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
// getApp() must run before requiring lib/webPush.js, which requires ../db
// directly for its 404/410 cleanup delete (same ordering rule as
// test/express-entry-page.test.js and test/jobsIngest.test.js).
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

const webPush = require('../lib/webPush');

beforeEach(() => { h.mock.__reset(); webpush.sendNotification = async () => ({}); });

const SUB = { endpoint: 'https://push.example/abc', p256dh: 'p256dh-key', auth: 'auth-key' };

test('configured() is true once both VAPID keys are present', () => {
  assert.equal(webPush.configured(), true);
});

test('publicKey() returns the configured public key', () => {
  assert.equal(webPush.publicKey(), vapidKeys.publicKey);
});

test('sendNotification calls web-push with the subscription reassembled into its expected shape', async () => {
  let seen = null;
  webpush.sendNotification = async (sub, body) => { seen = { sub, body }; return {}; };
  const result = await webPush.sendNotification(SUB, { title: 'Hi', body: 'There', url: '/' });
  assert.equal(result.sent, true);
  assert.deepEqual(seen.sub, { endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } });
  assert.deepEqual(JSON.parse(seen.body), { title: 'Hi', body: 'There', url: '/' });
});

test('a 410 Gone response deletes the subscription and reports sent:false without throwing', async () => {
  webpush.sendNotification = async () => { const e = new Error('gone'); e.statusCode = 410; throw e; };
  const result = await webPush.sendNotification(SUB, { title: 'x' });
  assert.deepEqual(result, { sent: false, reason: 'gone' });
  const [del] = h.mock.__writes('push_subscriptions', 'delete');
  assert.ok(del, 'the stale subscription should be removed');
});

test('a 404 is treated the same as 410', async () => {
  webpush.sendNotification = async () => { const e = new Error('not found'); e.statusCode = 404; throw e; };
  const result = await webPush.sendNotification(SUB, { title: 'x' });
  assert.equal(result.reason, 'gone');
});

test('a transient failure does not delete the subscription and does not throw', async () => {
  webpush.sendNotification = async () => { throw new Error('network blip'); };
  const result = await webPush.sendNotification(SUB, { title: 'x' });
  assert.deepEqual(result, { sent: false, reason: 'error' });
  assert.equal(h.mock.__writes('push_subscriptions', 'delete').length, 0);
});
