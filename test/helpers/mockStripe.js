// Replaces lib/stripe in the module cache — same shape/purpose as
// mockPaypal.js's installMockPaypal(). Must be installed BEFORE the app is
// required. Signature verification defaults to always-valid so tests about
// what the webhook DOES with an event don't also have to construct a real
// HMAC; the two signature-specific tests override __verifySig to check the
// route actually calls it and respects the result.
function installMockStripe() {
  const p = require.resolve('../../lib/stripe');
  const calls = [];
  const replies = {};      // 'METHOD /path/suffix' -> value or Error
  let verifySig = () => true;
  const mock = {
    configured: () => true,
    BASE: 'https://api.stripe.test/v1',
    async stripeApi(method, path, params) {
      calls.push({ method, path, params });
      const key = Object.keys(replies).find(k => `${method} ${path}`.includes(k));
      const reply = key ? replies[key] : null;
      if (reply instanceof Error) throw reply;
      return reply || {};
    },
    verifyWebhookSignature: (...args) => verifySig(...args),
    __calls: (match) => match ? calls.filter(c => c.path.includes(match)) : calls,
    __reply: (key, value) => { replies[key] = value; },
    __setVerify: (fn) => { verifySig = fn; },
    __reset: () => { calls.length = 0; for (const k in replies) delete replies[k]; verifySig = () => true; },
  };
  require.cache[p] = { id: p, filename: p, loaded: true, exports: mock };
  return mock;
}
module.exports = { installMockStripe };
