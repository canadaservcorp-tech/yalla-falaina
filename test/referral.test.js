// lib/referral.js (code minting/lookup) + routes/referral.js (GET /mine) +
// routes/admin-referrals.js (the admin ledger view). The webhook conversion-
// crediting path (creditConversionIfNew exercised through real payment
// webhooks) has its own file, test/referral-crediting.test.js, for the same
// reason test/subscription-webhook.test.js is separate from
// test/subscription-events.test.js: HTTP-level webhook coverage matters on
// its own, not just the pure decision logic.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
// getApp() must run before requiring lib/referral.js — that lib requires
// ../db directly, and getApp() is what installs the mocked db into
// require.cache before anything else gets a chance to load the real one
// (same ordering requirement as test/express-entry-page.test.js and
// test/jobsIngest.test.js).
const { getApp, auth } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

const referral = require('../lib/referral');

beforeEach(() => h.mock.__reset());

// ---------- lib/referral.js ----------

test('randomCode produces a code of the declared length from the declared alphabet', () => {
  for (let i = 0; i < 20; i++) {
    const code = referral.randomCode();
    assert.equal(code.length, referral.CODE_LEN);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/, 'no ambiguous 0/O/1/I characters');
  }
});

test('ensureCode returns an existing code without writing anything', async () => {
  h.mock.__set('users', { data: { referral_code: 'ABCD123' }, error: null });
  const code = await referral.ensureCode(99);
  assert.equal(code, 'ABCD123');
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('ensureCode mints and persists a new code on first call', async () => {
  h.mock.__set('users', { data: { referral_code: null }, error: null });
  const code = await referral.ensureCode(100);
  assert.equal(code.length, referral.CODE_LEN);
  const [update] = h.mock.__writes('users', 'update');
  assert.equal(update.payload.referral_code, code);
});

test('ensureCode retries past a unique-constraint collision', async () => {
  h.mock.__queue('users',
    { data: { referral_code: null }, error: null },              // the read
    { data: null, error: { code: '23505', message: 'dup' } },    // 1st mint attempt collides
    { data: null, error: null },                                 // 2nd mint attempt succeeds
  );
  const code = await referral.ensureCode(101);
  assert.equal(code.length, referral.CODE_LEN);
  assert.equal(h.mock.__writes('users', 'update').length, 2, 'both attempts should have been tried');
});

test('ensureCode gives up after repeated non-collision failures rather than looping forever', async () => {
  h.mock.__queue('users', { data: { referral_code: null }, error: null });
  h.mock.__setOp('users', 'update', { error: { code: '23505', message: 'always collides' } });
  await assert.rejects(() => referral.ensureCode(102));
});

test('resolveCode matches a code case-insensitively and trims whitespace', async () => {
  h.mock.__set('users', { data: { id: 7 }, error: null });
  assert.equal(await referral.resolveCode(' abcd123 '), 7);
});

test('resolveCode returns null for an unmatched, blank, or non-string code — never blocks signup', async () => {
  h.mock.__set('users', { data: null, error: null });
  assert.equal(await referral.resolveCode('NOSUCHCODE'), null);
  assert.equal(await referral.resolveCode(''), null);
  assert.equal(await referral.resolveCode('   '), null);
  assert.equal(await referral.resolveCode(undefined), null);
  assert.equal(await referral.resolveCode({ evil: true }), null);
});

// ---------- routes/referral.js ----------

test('GET /api/referral/mine mints a code on first use and reports the conversion count', async () => {
  h.mock.__queue('users',
    { data: { id: 5, role: 'seeker', banned: false, email_verified: true }, error: null }, // requireActiveUser
    { data: { referral_code: null }, error: null },                                        // ensureCode's read
    { data: null, error: null },                                                           // ensureCode's update
  );
  h.mock.__set('referral_conversions', { data: [{ id: 1 }, { id: 2 }], error: null });
  const token = jwt.sign({ id: 5, role: 'seeker' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/referral/mine', { headers: auth(token) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.success, true);
  assert.equal(d.code.length, referral.CODE_LEN);
  assert.equal(d.conversions, 2);
});

test('GET /api/referral/mine requires a real, verified account (same gate as every other seeker route)', async () => {
  const r = await fetch(h.base + '/api/referral/mine', { headers: auth('not-a-real-token') });
  assert.equal(r.status, 401);
});

// ---------- routes/admin-referrals.js ----------

test('GET /api/admin/referrals is refused to a non-admin', async () => {
  h.mock.__set('users', { data: { id: 6, role: 'seeker', banned: false, email_verified: true }, error: null });
  const token = jwt.sign({ id: 6, role: 'seeker' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/admin/referrals', { headers: auth(token) });
  assert.equal(r.status, 403);
});

test('GET /api/admin/referrals lists conversions with both parties\' emails resolved', async () => {
  h.mock.__queue('users',
    { data: { id: 1, role: 'admin', banned: false, email_verified: true }, error: null },  // requireActiveUser
    { data: [{ id: 7, email: 'referrer@example.invalid' }, { id: 42, email: 'referred@example.invalid' }], error: null }, // email lookup
  );
  h.mock.__set('referral_conversions', {
    data: [{ id: 1, referrer_id: 7, referred_id: 42, created_at: '2026-09-01T00:00:00Z' }],
    error: null,
  });
  const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const r = await fetch(h.base + '/api/admin/referrals', { headers: auth(token) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].referrerEmail, 'referrer@example.invalid');
  assert.equal(d.items[0].referredEmail, 'referred@example.invalid');
});

// ---------- routes/auth.js wiring: capturing a referral code at signup ----------

test('POST /api/auth/register attributes a matching referral code to referred_by', async () => {
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__queue('users',
    { data: null, error: null },        // exists check: address is free
    { data: { id: 3 }, error: null },   // resolveCode: matches referrer id 3
  );
  h.mock.__setOp('users', 'insert', { data: { id: 200, email: 'new@example.invalid', name: 'N', role: 'seeker' }, error: null });
  const r = await fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'new@example.invalid', password: 'longenoughpw1', name: 'N',
      acceptTerms: true, confirmAge: true, referralCode: 'ABCD123',
    }),
  });
  assert.equal(r.status, 200);
  const [insert] = h.mock.__writes('users', 'insert');
  assert.equal(insert.payload.referred_by, 3);
});

test('POST /api/auth/register with an unmatched or missing referral code signs up referrer-less, never blocked', async () => {
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null }); // exists check AND resolveCode both resolve to "no match"
  h.mock.__setOp('users', 'insert', { data: { id: 201, email: 'new2@example.invalid', name: 'N', role: 'seeker' }, error: null });
  const r = await fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'new2@example.invalid', password: 'longenoughpw1', name: 'N',
      acceptTerms: true, confirmAge: true, referralCode: 'NOSUCHCODE',
    }),
  });
  assert.equal(r.status, 200);
  const [insert] = h.mock.__writes('users', 'insert');
  assert.equal(insert.payload.referred_by, null);
});
