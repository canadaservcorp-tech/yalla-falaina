const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const founding = require('../lib/founding');

test('the public counter reports the places really taken', async () => {
  h.mock.__set('users', { count: 12, data: null, error: null });
  const res = await fetch(h.base + '/api/founding');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, limit: 50, taken: 12, remaining: 38 });
});

test('the counter never promises places that no longer exist', async () => {
  h.mock.__set('users', { count: 57, data: null, error: null });
  const j = await (await fetch(h.base + '/api/founding')).json();
  assert.equal(j.taken, 50);
  assert.equal(j.remaining, 0);
});

test('a place is handed out on activation and keeps its number afterwards', async () => {
  h.mock.__queue('users', { data: { founding_number: null }, error: null }, { count: 7, error: null });
  assert.equal(await founding.assign(9), 8);
  const [write] = h.mock.__writes('users', 'update');
  assert.deepEqual(write.payload, { founding_number: 8 });

  h.mock.__reset();
  h.mock.__set('users', { data: { founding_number: 3 }, error: null });
  assert.equal(await founding.assign(9), 3);
  assert.equal(h.mock.__writes('users', 'update').length, 0, 'an existing founder is not renumbered');
});

test('the 51st paying provider gets no place', async () => {
  h.mock.__queue('users', { data: { founding_number: null }, error: null }, { count: 50, error: null });
  assert.equal(await founding.assign(9), null);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('a database failure leaves the account unnumbered instead of breaking activation', async () => {
  h.mock.__set('users', { data: null, error: { message: 'down' } });
  assert.equal(await founding.assign(9), null);
});

test('the claim landing page shows the real count, and nothing when it is unknown', async () => {
  const page = require('../lib/claim-page');
  const listing = { display_name: 'Émard', city: 'Laval', rbq_licence: '1104-8618-06', claimed: false, trades: [] };

  const fr = page.render(listing, { founding: { limit: 50, taken: 12, remaining: 38 } });
  assert.match(fr, /12 des 50 places sont prises/);

  const en = page.render(listing, { lang: 'en', founding: { limit: 50, taken: 50, remaining: 0 } });
  assert.match(en, /All 50 founding provider places are taken/);

  const unknown = page.render(listing, { founding: null });
  assert.ok(!unknown.includes('fondateur'), 'an unavailable counter invents no number');
});

test('search marks a founder only while their subscription is paid', async () => {
  h.mock.__setRpc('search_providers', {
    data: [
      { user_id: 1, display_name: 'A', founding: true, subscribed: true, contactable: true, distance_m: 800 },
      { user_id: 2, display_name: 'B', founding: false, subscribed: false, contactable: false, distance_m: null },
    ],
    error: null,
  });
  const j = await (await fetch(h.base + '/api/search?lat=45.6&lng=-73.7&radius=10')).json();
  assert.equal(j.providers[0].founding, true);
  assert.equal(j.providers[1].founding, false);
});
