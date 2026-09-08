// Roadmap Step 1 — every 4xx/5xx JSON response in routes/auth.js,
// routes/concierge.js and routes/subscription.js carries a stable `code`
// alongside the existing English `error` text (unchanged, still the
// fallback). The client-side code -> translated-string mapping is a later
// step (blocked on the i18n PR); this only locks in the contract itself.
//
// Deliberately NOT covered here, and not in scope for this pass: plain-text
// (non-JSON) responses — GET /api/auth/verify's invalid/expired-link replies
// and the PayPal webhook's signature-failure replies are res.send(), not
// res.json() — and errors raised by middleware outside these three files
// (lib/auth-mw.js's authenticate, lib/security.js's requireActiveUser and
// rate limiters) which still return a codeless `{ error }` today.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

beforeEach(() => {
  h.mock.__reset();
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null });
});

// ---------- routes/auth.js ----------

let n = 0;
const register = overrides => fetch(h.base + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `code${n++}@example.invalid`, password: 'longenoughpw1', name: 'S',
    acceptTerms: true, confirmAge: true, ...overrides,
  }),
});
const login = body => fetch(h.base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('register: missing/invalid fields -> ERR_BAD_INPUT', async () => {
  const r = await register({ email: 'not-an-email' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('register: a weak password -> ERR_WEAK_PASSWORD', async () => {
  const r = await register({ password: 'short' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_WEAK_PASSWORD');
});

test('register: terms not accepted -> ERR_TERMS_REQUIRED', async () => {
  const r = await register({ acceptTerms: false });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_TERMS_REQUIRED');
});

test('register: age not confirmed -> ERR_AGE_GATE', async () => {
  const r = await register({ confirmAge: false });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_AGE_GATE');
});

test('register: a blocked email -> ERR_EMAIL_BLOCKED', async () => {
  h.mock.__set('banned_emails', { data: { email: 'blocked@example.invalid' }, error: null });
  const r = await register({ email: 'blocked@example.invalid' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'ERR_EMAIL_BLOCKED');
});

test('login: bad credentials -> ERR_INVALID_CREDENTIALS, and the same code whether the account exists or not', async () => {
  const noAccount = await login({ email: 'nobody@example.invalid', password: 'whatever1' });
  assert.equal(noAccount.status, 401);
  assert.equal((await noAccount.json()).code, 'ERR_INVALID_CREDENTIALS');

  h.mock.__set('users', { data: { id: 1, password_hash: '$2a$notarealhash', banned: false, email_verified: true }, error: null });
  const wrongPassword = await login({ email: 'real@example.invalid', password: 'whatever1' });
  assert.equal(wrongPassword.status, 401);
  assert.equal((await wrongPassword.json()).code, 'ERR_INVALID_CREDENTIALS');
});

test('login: an unverified account -> ERR_UNVERIFIED', async () => {
  const bcrypt = require('bcryptjs');
  h.mock.__set('users', {
    data: { id: 2, password_hash: bcrypt.hashSync('correcthorse1', 10), banned: false, email_verified: false },
    error: null,
  });
  const r = await login({ email: 'pending@example.invalid', password: 'correcthorse1' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'ERR_UNVERIFIED');
});

// ---------- routes/concierge.js ----------

let uid = 0, visitor = 0;
const caller = (sub = {}) => {
  const id = ++uid + 200;
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    subscription_status: 'inactive', subscription_tier: 'none', ...sub };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null }, { data: row, error: null });
  return auth(actor(h, { id, role: 'seeker' }));
};
const ask = (body, hdrs) => fetch(h.base + '/api/concierge', {
  method: 'POST',
  headers: { 'X-Forwarded-For': '10.9.' + (++visitor % 250) + '.' + (visitor % 250), ...hdrs },
  body: JSON.stringify(body),
});

test('concierge: an empty message -> ERR_BAD_INPUT', async () => {
  const r = await ask({ message: '' }, caller());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('concierge: paywall enforced on an inactive subscription -> ERR_PAYWALL (402)', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  try {
    const r = await ask({ message: 'hi' }, caller());
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'ERR_PAYWALL');
  } finally { delete process.env.PAYWALL_ENFORCED; }
});

test('concierge: daily quota exhausted -> ERR_QUOTA (429)', async () => {
  h.mock.__set('daily_usage', { data: { units_used: 5 }, error: null }); // 'none' tier limit is 5
  const r = await ask({ message: 'hi' }, caller());
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'ERR_QUOTA');
});

// ---------- routes/subscription.js ----------

test('subscription: checkout with PayPal unconfigured -> ERR_PAYMENT_UNAVAILABLE', async () => {
  const token = actor(h, { id: 300, role: 'seeker' });
  const r = await fetch(h.base + '/api/subscription/checkout', { method: 'POST', headers: auth(token) });
  assert.equal(r.status, 500);
  assert.equal((await r.json()).code, 'ERR_PAYMENT_UNAVAILABLE');
});

// ---------- the existing English `error` text must be unchanged ----------

test('adding `code` never changes or removes the existing `error` text', async () => {
  const r = await login({ email: 'nobody@example.invalid', password: 'whatever1' });
  const body = await r.json();
  assert.equal(body.error, 'Invalid credentials');
  assert.ok('code' in body);
});
