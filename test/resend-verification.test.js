// POST /api/auth/resend-verification exists because register's resilience fix
// (2d0fd17) can leave a real account stuck with no way back in when the first
// verification email never arrives — this is that way back in. Every case here
// must land on the same generic response: the endpoint must never let a caller
// tell a registered address apart from an unregistered one, or a verified
// account apart from an unverified one, from the response alone.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const GENERIC = 'If that account needs verifying, we just sent a new link.';

beforeEach(() => {
  h.mock.__reset();
  h.mock.__set('users', { data: null, error: null });
});

const resend = email => fetch(h.base + '/api/auth/resend-verification', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
});

test('an email with no matching account gets the generic response, not a 404 or a hint', async () => {
  const r = await resend('nobody@example.invalid');
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.message, GENERIC);
  assert.equal(h.mock.__writes('users', 'update').length, 0, 'no account to touch means no write');
});

test('an already-verified account gets the same generic response, not a different one', async () => {
  h.mock.__set('users', { data: { id: 42, email_verified: true }, error: null });
  const r = await resend('verified@example.invalid');
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.message, GENERIC);
  assert.equal(h.mock.__writes('users', 'update').length, 0, 'a verified account never gets a new token');
});

test('an unverified account gets a fresh token and the generic response', async () => {
  h.mock.__set('users', { data: { id: 7, email_verified: false }, error: null });
  const r = await resend('pending@example.invalid');
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.message, GENERIC);
  const write = h.mock.__writes('users', 'update').slice(-1)[0];
  assert.ok(write, 'expected the verify_token to be rewritten');
  assert.equal(typeof write.payload.verify_token, 'string');
  assert.ok(write.payload.verify_token.length >= 32, 'token should not be trivially guessable');
});

test('two requests for the same unverified account issue two different tokens', async () => {
  h.mock.__set('users', { data: { id: 7, email_verified: false }, error: null });
  await resend('pending@example.invalid');
  await resend('pending@example.invalid');
  const writes = h.mock.__writes('users', 'update');
  assert.equal(writes.length, 2);
  assert.notEqual(writes[0].payload.verify_token, writes[1].payload.verify_token, 'an old link should stop working once a new one is issued');
});

test('malformed or missing email never reaches the database', async () => {
  for (const bad of ['not-an-email', '', undefined, null]) {
    const r = await resend(bad);
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.message, GENERIC);
  }
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('a database error on the token update still resolves to the generic response, never a 500', async () => {
  h.mock.__set('users', { data: { id: 9, email_verified: false }, error: null });
  h.mock.__setOp('users', 'update', { error: { message: 'connection reset' } });
  const r = await resend('flaky@example.invalid');
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.message, GENERIC);
});
