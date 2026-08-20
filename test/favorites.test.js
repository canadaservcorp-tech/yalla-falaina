const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

process.env.PAYWALL_ENFORCED = 'true';   // production setting: contact follows the subscription
const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const post = (path, token, body) =>
  fetch(h.base + path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });
const get = (path, token) => fetch(h.base + path, { headers: auth(token) });

// the seeker check reads users, then the list reads the providers' subscription rows
const listing = (h, id, providers, subs) => {
  h.mock.__queue('users',
    { data: { id, role: 'seeker', banned: false, email_verified: true }, error: null },
    { data: subs, error: null });
  h.mock.__set('favorites', { data: providers.map(p => ({ provider_id: p.user_id })), error: null });
  h.mock.__set('providers', { data: providers, error: null });
};

test('favorites without a token -> 401', async () => {
  assert.equal((await fetch(h.base + '/api/favorites')).status, 401);
});

test('a provider cannot use favorites -> 403', async () => {
  const token = actor(h, { id: 31, role: 'provider' });
  assert.equal((await get('/api/favorites', token)).status, 403);
});

test('a banned seeker is refused -> 403', async () => {
  const token = actor(h, { id: 32, banned: true });
  assert.equal((await get('/api/favorites', token)).status, 403);
});

test('an unclaimed provider cannot be favorited -> 404', async () => {
  const token = actor(h, { id: 33 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: false }, error: null });
  assert.equal((await post('/api/favorites', token, { providerId: 5 })).status, 404);
});

test('a claimed provider is favorited -> 200', async () => {
  const token = actor(h, { id: 34 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  const r = await post('/api/favorites', token, { providerId: 5 });
  assert.equal(r.status, 200);
  assert.deepEqual(h.mock.__writes('favorites', 'upsert').pop().payload,
    { seeker_id: 34, provider_id: 5 });
});

test('a failed write is not reported as saved -> 500', async () => {
  const token = actor(h, { id: 35 });
  h.mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  h.mock.__setOp('favorites', 'upsert', { data: null, error: { message: 'nope' } });
  assert.equal((await post('/api/favorites', token, { providerId: 5 })).status, 500);
});

test('an available subscribed favorite exposes its city', async () => {
  const token = actor(h, { id: 36 });
  listing(h, 36,
    [{ user_id: 5, display_name: 'Live Pro', city: 'Laval', availability: 'available', is_licensed: true, rating: 5, review_count: 9, claimed: true }],
    [{ id: 5, subscription_status: 'active' }]);
  const j = await (await get('/api/favorites', token)).json();
  assert.equal(j.favorites[0].contactable, true);
  assert.equal(j.favorites[0].city, 'Laval');
});

test('an offline favorite leaks no city and is flagged unavailable', async () => {
  const token = actor(h, { id: 37 });
  listing(h, 37,
    [{ user_id: 5, display_name: 'Away Pro', city: 'Laval', availability: 'away', is_licensed: true, rating: 4.5, review_count: 3, claimed: true }],
    [{ id: 5, subscription_status: 'active' }]);
  const j = await (await get('/api/favorites', token)).json();
  const fav = j.favorites[0];
  assert.equal(fav.contactable, false);
  assert.equal(fav.unavailable, true);
  assert.equal(fav.city, undefined);
  assert.equal(fav.name, 'Away Pro');       // name and badge stay visible
  assert.equal(fav.is_licensed, true);
});

test('an expired subscription hides the city while the paywall is on', async () => {
  const token = actor(h, { id: 38 });
  listing(h, 38,
    [{ user_id: 5, display_name: 'Expired Pro', city: 'Laval', availability: 'available', is_licensed: false, rating: 3, review_count: 1, claimed: true }],
    [{ id: 5, subscription_status: 'expired' }]);
  const j = await (await get('/api/favorites', token)).json();
  assert.equal(j.favorites[0].contactable, false);
  assert.equal(j.favorites[0].city, undefined);
});

test('no favorites -> empty list', async () => {
  const token = actor(h, { id: 39 });
  h.mock.__set('favorites', { data: [], error: null });
  const j = await (await get('/api/favorites', token)).json();
  assert.deepEqual(j.favorites, []);
});
