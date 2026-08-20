const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const post = (path, token, body) =>
  fetch(h.base + path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

test('review without a token -> 401', async () => {
  const r = await fetch(h.base + '/api/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(r.status, 401);
});

test('a provider cannot post a review -> 403', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  const r = await post('/api/reviews', token, { providerId: 9, rating: 5 });
  assert.equal(r.status, 403);
});

test('an unverified seeker cannot post a review -> 403', async () => {
  const token = actor(h, { id: 2, verified: false });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 5 });
  assert.equal(r.status, 403);
});

test('a banned seeker cannot post a review -> 403', async () => {
  const token = actor(h, { id: 3, banned: true });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 5 });
  assert.equal(r.status, 403);
});

test('rating outside 1-5 -> 400', async () => {
  const token = actor(h, { id: 11 });
  assert.equal((await post('/api/reviews', token, { providerId: 5, rating: 9 })).status, 400);
  assert.equal((await post('/api/reviews', token, { providerId: 5, rating: 0 })).status, 400);
  assert.equal((await post('/api/reviews', token, { providerId: 5, rating: 4.5 })).status, 400);
});

test('prohibited wording is refused and flagged -> 400', async () => {
  const token = actor(h, { id: 12 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('conversations', { data: { id: 7 }, error: null });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 5, body: 'offers escort services' });
  assert.equal(r.status, 400);
});

test('an unclaimed RBQ listing cannot be reviewed -> 404', async () => {
  const token = actor(h, { id: 13 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: false }, error: null });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 4 });
  assert.equal(r.status, 404);
});

test('a review needs a prior conversation -> 403', async () => {
  const token = actor(h, { id: 14 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('conversations', { data: null, error: null });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 4 });
  assert.equal(r.status, 403);
});

test('a valid review is stored and the rating recomputed', async () => {
  const token = actor(h, { id: 15 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('conversations', { data: { id: 7 }, error: null });
  h.mock.__set('reviews', { data: null, error: null });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 5, body: 'Excellent travail' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).success, true);
  assert.deepEqual(h.mock.__lastRpc('recompute_provider_rating').args, { p_provider: 5 });
});

test('a failed write is reported as an error, never as published -> 500', async () => {
  const token = actor(h, { id: 16 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('conversations', { data: { id: 7 }, error: null });
  h.mock.__set('reviews', { data: null, error: null });
  h.mock.__setOp('reviews', 'insert', { data: null, error: { message: 'relation does not exist' } });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 5, body: 'Bon service' });
  assert.equal(r.status, 500);
  assert.equal(h.mock.__rpcCalls('recompute_provider_rating').length, 0);
});

test('editing a review clears the provider answer written under the old text', async () => {
  const token = actor(h, { id: 17 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('conversations', { data: { id: 7 }, error: null });
  h.mock.__set('reviews', { data: { id: 3 }, error: null });
  const r = await post('/api/reviews', token, { providerId: 5, rating: 1, body: 'Finalement décevant' });
  assert.equal(r.status, 200);
  const upd = h.mock.__writes('reviews', 'update').pop();
  assert.equal(upd.payload.provider_reply, null);
  assert.equal(upd.payload.replied_at, null);
});

test('reporting your own review -> 400', async () => {
  const token = actor(h, { id: 18 });
  h.mock.__set('reviews', { data: { id: 3, seeker_id: 18 }, error: null });
  const r = await post('/api/reviews/3/report', token, { reason: 'oops' });
  assert.equal(r.status, 400);
  assert.equal(h.mock.__writes('reports', 'insert').length, 0);
});

test('reporting someone else\'s review is queued for moderation -> 200', async () => {
  const token = actor(h, { id: 19 });
  h.mock.__set('reviews', { data: { id: 3, seeker_id: 42 }, error: null });
  const r = await post('/api/reviews/3/report', token, { reason: 'contenu interdit' });
  assert.equal(r.status, 200);
  const rep = h.mock.__writes('reports', 'insert').pop();
  assert.equal(rep.payload.target_user_id, 42);
  assert.equal(rep.payload.kind, 'other');
});

test('public list returns a short author name and no seeker id', async () => {
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__set('reviews', {
    data: [{ id: 1, seeker_id: 42, rating: 4, body: 'ok', provider_reply: null, replied_at: null, created_at: 'now' }],
    error: null,
  });
  h.mock.__set('users', { data: [{ id: 42, name: 'Marie Tremblay' }], error: null });
  const r = await fetch(h.base + '/api/reviews/5');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.reviews[0].author, 'Marie T.');
  assert.equal(j.reviews[0].seeker_id, undefined);
});

test('public list for an unclaimed provider -> 404', async () => {
  h.mock.__set('providers', { data: { user_id: 5, claimed: false }, error: null });
  assert.equal((await fetch(h.base + '/api/reviews/5')).status, 404);
});

test('a provider cannot reply to someone else\'s review -> 403', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  h.mock.__set('reviews', { data: { id: 3, provider_id: 99, provider_reply: null }, error: null });
  assert.equal((await post('/api/reviews/3/reply', token, { reply: 'merci' })).status, 403);
});

test('a provider cannot reply twice -> 409', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  h.mock.__set('reviews', { data: { id: 3, provider_id: 5, provider_reply: 'déjà' }, error: null });
  assert.equal((await post('/api/reviews/3/reply', token, { reply: 'encore' })).status, 409);
});

test('a provider replies once -> 200', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  h.mock.__set('reviews', { data: { id: 3, provider_id: 5, provider_reply: null }, error: null });
  const r = await post('/api/reviews/3/reply', token, { reply: 'Merci beaucoup' });
  assert.equal(r.status, 200);
});
