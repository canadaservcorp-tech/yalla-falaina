// Paid top placement must stay provider-only, subscription-gated and untamperable.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/boost/plans without token -> 401', async () => {
  const res = await fetch(h.base + '/api/boost/plans');
  assert.equal(res.status, 401);
});

test('a seeker cannot see boost plans -> 403', async () => {
  const token = actor(h, { id: 31, role: 'seeker' });
  const res = await fetch(h.base + '/api/boost/plans', { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('a seeker cannot buy a boost -> 403', async () => {
  const token = actor(h, { id: 32, role: 'seeker' });
  const res = await fetch(h.base + '/api/boost/checkout', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ plan: 'd7' }),
  });
  assert.equal(res.status, 403);
});

test('plans are the confirmed durations and prices, taxes on top', async () => {
  const token = actor(h, { id: 33, role: 'provider', extra: { subscription_status: 'active' } });
  const res = await fetch(h.base + '/api/boost/plans', { headers: auth(token) });
  assert.equal(res.status, 200);
  const body = await res.json();
  const byId = Object.fromEntries(body.plans.map(p => [p.id, p]));
  assert.deepEqual([byId.d3.days, byId.d7.days, byId.d30.days], [3, 7, 30]);
  assert.deepEqual([byId.d3.amount, byId.d7.amount, byId.d30.amount], ['9.99', '19.99', '59.99']);
  assert.equal(byId.d7.total, '22.98');           // 19.99 + 14.975% GST/QST
  assert.equal(body.topSlots, 5);
});

test('boost is only offered once more than the top slots are taken', async () => {
  const token = actor(h, { id: 34, role: 'provider', extra: { subscription_status: 'active' } });
  const res = await fetch(h.base + '/api/boost/plans', { headers: auth(token) });
  const body = await res.json();
  assert.equal(body.competitors, 0);              // mocked rpc -> no nearby subscribers
  assert.equal(body.eligible, false);
});

test('an unknown plan is rejected -> 400', async () => {
  const token = actor(h, { id: 35, role: 'provider', extra: { subscription_status: 'active' } });
  const res = await fetch(h.base + '/api/boost/checkout', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ plan: 'd3; drop table', amount: '0.01' }),
  });
  assert.equal(res.status, 400);
});

test('a provider without an active subscription cannot boost -> 403', async () => {
  const token = actor(h, { id: 36, role: 'provider', extra: { subscription_status: 'canceled' } });
  const res = await fetch(h.base + '/api/boost/checkout', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ plan: 'd3' }),
  });
  assert.equal(res.status, 403);
});

test('capture refuses an order that is not the caller\'s -> 404', async () => {
  const token = actor(h, { id: 37, role: 'provider', extra: { subscription_status: 'active' } });
  h.mock.__set('boost_orders', { data: null, error: null });
  const res = await fetch(h.base + '/api/boost/capture', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ orderId: '5O190127TN364715T' }),
  });
  assert.equal(res.status, 404);
});
