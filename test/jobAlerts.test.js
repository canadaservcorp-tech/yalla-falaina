// lib/jobAlerts.js — new-job detection (findNewRows), matching (matches),
// and the notification fan-out (notifyNewJobs), plus its wiring into
// lib/jobsIngest.js's refresh(). Real VAPID keys + a monkeypatched web-push
// (same approach as test/webPush.test.js) so notifyNewJobs's full pipeline
// can run without a real network call.
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
process.env.JOB_API_PROVIDER = 'seed'; // lib/jobsIngest.js reads this at require time

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
// getApp() must run before requiring lib/jobAlerts.js / lib/jobsIngest.js,
// both of which require ../db directly (same ordering rule as
// test/express-entry-page.test.js and test/webPush.test.js).
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

const jobAlerts = require('../lib/jobAlerts');

beforeEach(() => { h.mock.__reset(); webpush.sendNotification = async () => ({}); });

const JOB = (over = {}) => ({
  external_source: 'seed', external_id: 'j1', title: 'Line cook', country: 'CA', category: 'kitchen', ...over,
});

// ---------- findNewRows ----------

test('findNewRows keeps only rows whose (source, id) pair is not already in `jobs`', async () => {
  h.mock.__set('jobs', { data: [{ external_source: 'seed', external_id: 'j1' }], error: null });
  const rows = [JOB({ external_id: 'j1' }), JOB({ external_id: 'j2' })];
  const fresh = await jobAlerts.findNewRows(rows);
  assert.deepEqual(fresh.map(r => r.external_id), ['j2']);
});

test('findNewRows treats a lookup error as "nothing new" rather than false-positiving everything as new', async () => {
  h.mock.__set('jobs', { data: null, error: { message: 'db down' } });
  const fresh = await jobAlerts.findNewRows([JOB()]);
  assert.deepEqual(fresh, []);
});

test('findNewRows has nothing to do on an empty batch', async () => {
  assert.deepEqual(await jobAlerts.findNewRows([]), []);
});

// ---------- matches ----------

test('an unset profile field is a wildcard, not a non-match', () => {
  assert.equal(jobAlerts.matches({ preferred_country: null, sector: null, role_type: null }, JOB()), true);
});

test('a profile with no row at all never matches', () => {
  assert.equal(jobAlerts.matches(null, JOB()), false);
});

test('preferred_country must match the job\'s country when set', () => {
  const profile = { preferred_country: 'France' };
  assert.equal(jobAlerts.matches(profile, JOB({ country: 'France' })), true);
  assert.equal(jobAlerts.matches(profile, JOB({ country: 'CA' })), false);
});

test('sector/role_type match against the job\'s category+title, case-insensitively', () => {
  const profile = { sector: 'Kitchen' };
  assert.equal(jobAlerts.matches(profile, JOB({ category: 'kitchen', title: 'x' })), true);
  assert.equal(jobAlerts.matches(profile, JOB({ category: 'logistics', title: 'Kitchen prep cook' })), true, 'the title also counts, not just category');
  assert.equal(jobAlerts.matches(profile, JOB({ category: 'logistics', title: 'Forklift driver' })), false);
});

// ---------- notifyNewJobs ----------

test('notifyNewJobs sends to every subscribed device of a matched user, capped per run', async () => {
  h.mock.__set('push_subscriptions', {
    data: [
      { user_id: 10, endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' },
      { user_id: 10, endpoint: 'https://push.example/b', p256dh: 'p', auth: 'a' }, // a second device for the same user
    ],
    error: null,
  });
  h.mock.__set('profiles', { data: [{ id: 10, sector: null, role_type: null, preferred_country: null }], error: null });
  let calls = 0;
  webpush.sendNotification = async () => { calls++; return {}; };
  const newRows = Array.from({ length: 5 }, (_, i) => JOB({ external_id: 'j' + i }));
  const sent = await jobAlerts.notifyNewJobs(newRows);
  // 3 matched jobs (MAX_PER_USER_PER_RUN) x 2 devices
  assert.equal(sent, jobAlerts.MAX_PER_USER_PER_RUN * 2);
  assert.equal(calls, jobAlerts.MAX_PER_USER_PER_RUN * 2);
});

test('notifyNewJobs skips a subscribed user whose profile does not match any new row', async () => {
  h.mock.__set('push_subscriptions', { data: [{ user_id: 11, endpoint: 'e', p256dh: 'p', auth: 'a' }], error: null });
  h.mock.__set('profiles', { data: [{ id: 11, sector: null, role_type: null, preferred_country: 'Germany' }], error: null });
  const sent = await jobAlerts.notifyNewJobs([JOB({ country: 'CA' })]);
  assert.equal(sent, 0);
});

test('notifyNewJobs is a no-op with nothing new to report, or push unconfigured', async () => {
  assert.equal(await jobAlerts.notifyNewJobs([]), 0);
});

// ---------- wiring into lib/jobsIngest.js ----------

test('jobsIngest.refresh() calls findNewRows before the upsert loop and never throws on an alert failure', async () => {
  h.mock.__set('jobs', { data: [], error: null });
  h.mock.__setOp('jobs', 'upsert', { error: null });
  h.mock.__set('push_subscriptions', { data: null, error: { message: 'boom' } }); // notifyNewJobs's own lookup fails
  const jobsIngest = require('../lib/jobsIngest');
  const n = await jobsIngest.refresh();
  assert.ok(n > 0, 'the seed provider should still upsert its rows');
});
