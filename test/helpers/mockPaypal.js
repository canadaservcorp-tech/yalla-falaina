// Replaces lib/paypal in the module cache, so booking tests can assert what the
// app asks PayPal to do (authorize / capture / void) without any network call.
// Must be installed BEFORE the app is required.
function installMockPaypal() {
  const p = require.resolve('../../lib/paypal');
  const calls = [];
  const replies = {};      // 'METHOD /path/suffix' -> value or Error
  const mock = {
    configured: () => true,
    BASE: 'https://paypal.test',
    async pp(method, path, body) {
      calls.push({ method, path, body });
      const key = Object.keys(replies).find(k => `${method} ${path}`.includes(k));
      const reply = key ? replies[key] : null;
      if (reply instanceof Error) throw reply;
      return reply || {};
    },
    __calls: (match) => match ? calls.filter(c => c.path.includes(match)) : calls,
    __reply: (key, value) => { replies[key] = value; },
    __reset: () => { calls.length = 0; for (const k in replies) delete replies[k]; },
  };
  require.cache[p] = { id: p, filename: p, loaded: true, exports: mock };
  return mock;
}
module.exports = { installMockPaypal };
