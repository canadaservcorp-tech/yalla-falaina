const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

beforeEach(() => {
  h.mock.__reset();
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null });                       // address is free
  h.mock.__setOp('users', 'insert', { data: { id: 7, role: 'seeker' }, error: null });
});

let n = 0;
const register = source => fetch(h.base + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `src${n++}@example.invalid`, password: 'longenoughpw1',
    name: 'S', role: 'seeker', acceptTerms: true, confirmAge: true, source,
  }),
});
const inserted = () => h.mock.__writes('users', 'insert').slice(-1)[0].payload;

test('the campaign that brought a signup is stored as a slug', async () => {
  assert.equal((await register('instagram')).status, 200);
  assert.equal(inserted().signup_source, 'instagram');
});

test('a hostile source value is reduced to a harmless slug', async () => {
  await register('Instagram <script>x</script>/reels?a=1');
  assert.equal(inserted().signup_source, 'instagramscriptxscriptreelsa1');
});

test('a source longer than the column contract is truncated', async () => {
  await register('i'.repeat(200));
  assert.equal(inserted().signup_source.length, 40);
});

test('signups without a campaign store nothing rather than an empty string', async () => {
  await register(undefined);
  assert.equal(inserted().signup_source, null);
  await register('');
  assert.equal(inserted().signup_source, null);
});

test('a non-string source cannot reach the database', async () => {
  const r = await fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'objsrc@example.invalid', password: 'longenoughpw1',
      name: 'S', role: 'seeker', acceptTerms: true, confirmAge: true, source: { evil: true },
    }),
  });
  assert.equal(r.status, 200);
  assert.equal(inserted().signup_source, null);
});
