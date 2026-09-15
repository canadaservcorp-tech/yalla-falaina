// The "no VAPID keys set" state — deliberately its own file/process (see
// test/push-route.test.js and test/webPush.test.js, which both set
// VAPID_PUBLIC_KEY/PRIVATE_KEY at the top and can't also exercise this path).
const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());

test('GET /api/push/public-key is unavailable when no VAPID keys are configured', async () => {
  const r = await fetch(h.base + '/api/push/public-key');
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'ERR_PUSH_UNAVAILABLE');
});

test('GET /api/health reports push:false with nothing configured', async () => {
  const r = await fetch(h.base + '/api/health');
  assert.equal((await r.json()).push, false);
});
