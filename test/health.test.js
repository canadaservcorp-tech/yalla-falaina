const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

test('GET /api/health -> 200 with feature booleans only', async () => {
  const res = await fetch(h.base + '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true, phase: 1,
    paywall: process.env.PAYWALL_ENFORCED === 'true',
    concierge: Boolean(process.env.ANTHROPIC_API_KEY),
    jobsFeed: process.env.JOB_API_PROVIDER || 'seed',
    analytics: Boolean(process.env.GA_MEASUREMENT_ID),
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
  });
});
