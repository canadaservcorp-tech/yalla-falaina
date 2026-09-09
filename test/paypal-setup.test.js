// scripts/paypal-setup.js provisions the live PayPal product/plan/webhook —
// had zero test coverage. Most valuable to lock down: the PUBLIC_URL safety
// guard before registering a live webhook (see that file's own comment) —
// registering a webhook at the .env.example localhost default would
// silently break every subscription activation from that point on, since
// checkout would still work and PayPal would still charge the seeker, but
// the activation event would have nowhere real to land.
const { test, afterEach } = require('node:test');
const assert = require('node:assert');

const MOD_PATH = require.resolve('../scripts/paypal-setup');
const PAYPAL_PATH = require.resolve('../lib/paypal');

// scripts/paypal-setup.js reads PUBLIC_URL/PAYPAL_PRICE/etc into module-level
// consts at require time (same pattern as lib/jobsIngest.js's provider
// const), so switching PUBLIC_URL between tests means a fresh require after
// clearing the cache — same trick test/jobsIngest.test.js uses.
function freshModule({ publicUrl, pp, configured = () => true } = {}) {
  if (publicUrl !== undefined) process.env.PUBLIC_URL = publicUrl; else delete process.env.PUBLIC_URL;
  delete require.cache[MOD_PATH];
  require.cache[PAYPAL_PATH] = { id: PAYPAL_PATH, filename: PAYPAL_PATH, loaded: true, exports: { configured, pp, BASE: 'https://api-m.paypal.com' } };
  return require('../scripts/paypal-setup');
}

afterEach(() => {
  delete require.cache[MOD_PATH];
  delete require.cache[PAYPAL_PATH];
  delete process.env.PUBLIC_URL;
});

// A minimal fake of lib/paypal's pp() that answers the specific calls
// main() makes, in order, without hitting the network.
function fakePp({ productExists = false } = {}) {
  const calls = [];
  return {
    calls,
    pp: async (method, path, body) => {
      calls.push({ method, path, body });
      if (path.startsWith('/v1/catalogs/products?')) return { products: productExists ? [{ id: 'prod_1', name: 'Yalla Nsafer Basic' }] : [] };
      if (path === '/v1/catalogs/products') return { id: 'prod_new' };
      if (path === '/v1/billing/plans') return { id: 'plan_123' };
      if (path === '/v1/notifications/webhooks' && method === 'GET') return { webhooks: [] };
      if (path === '/v1/notifications/webhooks' && method === 'POST') return { id: 'hook_456' };
      throw new Error('unexpected call: ' + method + ' ' + path);
    },
  };
}

test('missing PayPal credentials fails before any API call', async () => {
  const { main } = freshModule({ configured: () => false });
  await assert.rejects(main(), /PAYPAL_CLIENT_ID/);
});

test('a real https PUBLIC_URL registers the webhook normally', async () => {
  const { pp, calls } = fakePp();
  const { main } = freshModule({ publicUrl: 'https://yallansafer.com', pp });
  await main();
  const hookCreate = calls.find(c => c.path === '/v1/notifications/webhooks' && c.method === 'POST');
  assert.ok(hookCreate, 'expected the webhook to be registered');
  assert.equal(hookCreate.body.url, 'https://yallansafer.com/api/subscription/webhook');
});

test('PUBLIC_URL left at the localhost default refuses to register a live webhook', async () => {
  const { pp, calls } = fakePp();
  // deliberately not setting PUBLIC_URL, so the module falls back to its own
  // 'http://localhost:3000' default, exactly like a forgotten env var would
  const { main } = freshModule({ pp });
  await assert.rejects(main(), /Refusing to register a live PayPal webhook/);
  // the plan itself is still created — only the webhook step is refused
  assert.ok(calls.some(c => c.path === '/v1/billing/plans'));
  assert.ok(!calls.some(c => c.path === '/v1/notifications/webhooks'));
});

test('an explicit non-https PUBLIC_URL is refused the same way, not just the exact default string', async () => {
  const { pp, calls } = fakePp();
  const { main } = freshModule({ publicUrl: 'http://staging.example.com', pp });
  await assert.rejects(main(), /Refusing to register a live PayPal webhook/);
  assert.ok(!calls.some(c => c.path === '/v1/notifications/webhooks'));
});

test('--plan-only skips the webhook step entirely, so the PUBLIC_URL guard never even runs', async () => {
  const origArgv = process.argv;
  process.argv = [...origArgv, '--plan-only'];
  try {
    const { pp, calls } = fakePp();
    // no PUBLIC_URL set at all -- would fail the guard above if the webhook
    // step ran, but --plan-only must return before ever reaching it
    const { main } = freshModule({ pp });
    await main();
    assert.ok(!calls.some(c => c.path === '/v1/notifications/webhooks'));
  } finally { process.argv = origArgv; }
});

test('an existing product with the same name is reused instead of creating a duplicate', async () => {
  const { pp, calls } = fakePp({ productExists: true });
  const { main } = freshModule({ publicUrl: 'https://yallansafer.com', pp });
  await main();
  assert.ok(!calls.some(c => c.method === 'POST' && c.path === '/v1/catalogs/products'), 'should not create a second product');
  const planCreate = calls.find(c => c.path === '/v1/billing/plans');
  assert.equal(planCreate.body.product_id, 'prod_1');
});

test('an existing webhook already pointed at this URL is reused instead of registering a second one', async () => {
  const calls = [];
  const pp = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path.startsWith('/v1/catalogs/products?')) return { products: [] };
    if (path === '/v1/catalogs/products') return { id: 'prod_new' };
    if (path === '/v1/billing/plans') return { id: 'plan_123' };
    if (path === '/v1/notifications/webhooks' && method === 'GET')
      return { webhooks: [{ id: 'hook_existing', url: 'https://yallansafer.com/api/subscription/webhook' }] };
    throw new Error('unexpected call: ' + method + ' ' + path);
  };
  const { main } = freshModule({ publicUrl: 'https://yallansafer.com', pp });
  await main();
  assert.ok(!calls.some(c => c.method === 'POST' && c.path === '/v1/notifications/webhooks'), 'should not register a duplicate webhook');
});
