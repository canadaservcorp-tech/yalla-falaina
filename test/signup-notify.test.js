// Every new signup pings the operator inbox (NOTIFY_EMAIL, falling back to
// CONTACT_EMAIL). The harness unsets RESEND_API_KEY, so lib/email.js takes
// its dev-log path — these tests stub global.fetch for api.resend.com only
// and set the key, to observe what the route actually sends.
const { test, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const origFetch = global.fetch;
let sent;
beforeEach(() => {
  h.mock.__reset();
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null });                       // address is free
  h.mock.__setOp('users', 'insert', { data: { id: 7, role: 'seeker' }, error: null });
  sent = [];
  global.fetch = (url, opts) => String(url).includes('api.resend.com')
    ? Promise.resolve((sent.push(JSON.parse(opts.body)), new Response('{}', { status: 200 })))
    : origFetch(url, opts);
  process.env.RESEND_API_KEY = 'test-resend-key';
});
afterEach(() => { global.fetch = origFetch; delete process.env.RESEND_API_KEY; delete process.env.NOTIFY_EMAIL; delete process.env.CONTACT_EMAIL; });

let n = 0;
const register = () => fetch(h.base + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `newbie${n++}@example.invalid`, password: 'longenoughpw1',
    name: 'New Seeker', role: 'seeker', acceptTerms: true, confirmAge: true,
  }),
});

test('a signup notifies NOTIFY_EMAIL with the seeker details', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  const r = await register();
  assert.equal(r.status, 200);
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.ok(notify, 'operator notification email should have been sent');
  assert.equal(notify.to, 'ops@example.invalid');
  assert.match(notify.html, /New Seeker/);
  assert.match(notify.html, /newbie0@example\.invalid/);
  assert.match(notify.html, /User ID: 7/);
});

test('without NOTIFY_EMAIL the notification falls back to CONTACT_EMAIL', async () => {
  process.env.CONTACT_EMAIL = 'contact@example.invalid';
  await register();
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.equal(notify.to, 'contact@example.invalid');
});

test('with neither inbox set, only the seeker verification email goes out', async () => {
  await register();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'Confirm your email — Yalla Nsafer');
});

test('the seeker verification email still goes out alongside the notification', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  await register();
  const verify = sent.find(m => m.subject === 'Confirm your email — Yalla Nsafer');
  assert.equal(verify.to, 'newbie3@example.invalid');
});
