const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/subscription/status without token -> 401', async () => {
  const res = await fetch(h.base + '/api/subscription/status');
  assert.equal(res.status, 401);
});

test('GET /api/subscription/status with token -> { success, status, tier, periodEnd }', async () => {
  const token = actor(h, { id: 11, role: 'seeker', extra: { subscription_status: 'active', subscription_tier: 'basic', subscription_period_end: null } });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, 'active');
  assert.equal(body.tier, 'basic');
  assert.ok('periodEnd' in body);
});

test('an unverified account cannot use authenticated endpoints -> 403', async () => {
  const token = actor(h, { id: 12, role: 'seeker', verified: false });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('a banned account is refused -> 403', async () => {
  const token = actor(h, { id: 13, role: 'seeker', banned: true });
  const res = await fetch(h.base + '/api/subscription/status', { headers: auth(token) });
  assert.equal(res.status, 403);
});
