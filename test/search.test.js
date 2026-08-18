const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const LL = 'lat=45.57&lng=-73.75';
const search = qs => fetch(h.base + '/api/search?' + qs);

test('rejects a request without coordinates', async () => {
  const res = await search('radius_km=10');
  assert.equal(res.status, 400);
});

test('available_now is forwarded to SQL for true/1 and off otherwise', async () => {
  for (const [value, expected] of [['true', true], ['1', true], ['false', false], ['yes', false]]) {
    await search(`${LL}&available_now=${value}`);
    assert.equal(h.mock.__lastRpc('search_providers').args.p_available_now, expected, value);
  }
  await search(LL);
  assert.equal(h.mock.__lastRpc('search_providers').args.p_available_now, false);
});

test('languages are parsed to an array and null when absent', async () => {
  await search(`${LL}&languages=fr,en`);
  assert.deepEqual(h.mock.__lastRpc('search_providers').args.p_languages, ['fr', 'en']);

  await search(LL);
  assert.equal(h.mock.__lastRpc('search_providers').args.p_languages, null);

  await search(`${LL}&languages=,%20,`);
  assert.equal(h.mock.__lastRpc('search_providers').args.p_languages, null);
});

test('languages input is bounded (max 6 values, 20 chars each)', async () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join(',');
  await search(`${LL}&languages=${many}&`);
  const langs = h.mock.__lastRpc('search_providers').args.p_languages;
  assert.equal(langs.length, 6);

  await search(`${LL}&languages=${'x'.repeat(50)}`);
  assert.equal(h.mock.__lastRpc('search_providers').args.p_languages[0].length, 20);
});

test('offline providers are returned without distance and without contact', async () => {
  h.mock.__setRpc('search_providers', {
    data: [
      { user_id: 1, display_name: 'Paid', claimed: true, subscribed: true, contactable: true, distance_m: 1200, available_now: true },
      { user_id: 2, display_name: 'Expired', claimed: true, subscribed: false, contactable: false, distance_m: null, available_now: true },
      { user_id: 3, display_name: 'Unclaimed RBQ', claimed: false, subscribed: false, contactable: false, distance_m: null, available_now: false },
    ],
    error: null,
  });
  const body = await (await search(`${LL}&available_now=true`)).json();
  assert.equal(body.count, 3);

  const [paid, expired, unclaimed] = body.providers;
  assert.equal(paid.contactable, true);
  assert.ok(paid.distance_label, 'active subscriber keeps an approximate distance');
  assert.ok(!/1200/.test(paid.distance_label), 'distance stays approximate');

  for (const p of [expired, unclaimed]) {
    assert.equal(p.contactable, false);
    assert.equal(p.distance_label, null);
  }
  assert.equal(unclaimed.claimed, false);
});

test('a SQL error never leaks details to the client', async () => {
  h.mock.__setRpc('search_providers', { data: null, error: { message: 'relation "providers" does not exist' } });
  const res = await search(LL);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Search failed' });
});
