// Having translated ERR_* strings in public/i18n.js (test/i18n.test.js) is
// only half the fix — the client actually has to call tErr() instead of
// showing the server's raw English `error` text. This locks that wiring in
// so a future edit can't quietly reintroduce a raw `d.error` / `data.error`
// display and silently regress back to English-only errors for ar/fr users.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('index.html defines an apiError() helper backed by i18n.tErr', () => {
  assert.match(script, /const apiError = \(d, fallback\) => .*i18n\.tErr\(currentLang, d\.code\)/);
});

test('every user-facing error display in the auth, listing, checkout, cancel and concierge flows goes through apiError() or an already-translated t() string', () => {
  // A bare `d.error`/`data.error` reaching a message-display call is exactly
  // the pre-fix bug: raw English regardless of the chosen UI language.
  const bareErrorDisplay = /\$\('(authMsg|subMsg)'\)\.textContent\s*=\s*d\.error(?!\s*=)/;
  assert.doesNotMatch(script, bareErrorDisplay);
  assert.doesNotMatch(script, /addMessage\('system',\s*data\.error\)/);
  assert.doesNotMatch(script, /textContent = d\.error \|\|/);

  // And apiError() is actually called at each of those sites, not just defined.
  const sites = [
    /apiError\(d, t\('resendFailedFallback'\)\)/,
    /apiError\(d, t\('errRegistrationFailed'\)\)/,
    /apiError\(d, t\('errSignInFailed'\)\)/,
    /apiError\(d, t\('postListingFailed'\)\)/,
    /apiError\(d, t\('checkoutUnavailable'\)\)/,
    /apiError\(d, t\('cancelSubFailed'\)\)/,
    /apiError\(data, data\.error\)/,
  ];
  for (const re of sites) assert.match(script, re, `expected ${re} in public/index.html's script`);
});

test('the previously-unused resendGenericFallback i18n key is now actually referenced', () => {
  // It existed in public/i18n.js for all 3 languages but index.html hardcoded
  // the English string directly instead of calling t('resendGenericFallback').
  assert.match(script, /t\('resendGenericFallback'\)/);
});
