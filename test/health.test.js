const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/health -> 200 { ok:true, phase:3 }', async () => {
  const res = await fetch(h.base + '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, phase: 3, paywall: false, moderation: false });
});
