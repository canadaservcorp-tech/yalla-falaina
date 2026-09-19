// Bug report (Sept 2026): a seeker who signed up with "Continue with Google"
// closed the app, came back once their localStorage token had expired or
// been cleared, and landed on the same login screen as everyone else -- with
// nothing telling them apart from a password-account seeker. Google-created
// accounts store a random, unguessable password_hash on purpose (see
// test/google-auth.test.js's "no usable password" case), so typing anything
// into the password field can never work -- from the seeker's side, "the app
// is asking for a password" they never set.
//
// The fix can't come from the server: routes/auth.js's /login intentionally
// returns the identical "Invalid credentials" response for every failure
// reason (wrong password, no such account, or a Google-only account) to
// avoid account enumeration -- see that route's own comment. So this is a
// client-side, account-agnostic hint: shown to every visitor in login mode
// once Google sign-in is configured, never naming or confirming any specific
// account. Static checks against the raw HTML, same pattern as
// test/verticals-tagline.test.js, since this is markup/script wiring with no
// server round-trip to exercise through the app harness.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('a googlePasswordHint element sits right after the password field, hidden by default, with the i18n key wired up', () => {
  const passwordAt = html.indexOf('id="password"');
  const hintAt = html.indexOf('id="googlePasswordHint"');
  assert.ok(passwordAt > -1 && hintAt > -1);
  assert.ok(passwordAt < hintAt, 'the hint should render right after the password field, not before it');
  const hintTagEnd = html.indexOf('>', hintAt);
  const hintTag = html.slice(html.lastIndexOf('<div', hintAt), hintTagEnd + 1);
  assert.match(hintTag, /display:\s*none/, 'hidden until updateGooglePasswordHint() decides to show it');
  assert.match(hintTag, /data-i18n="googlePasswordHint"/);
});

test('the hint only shows once Google sign-in is confirmed configured AND the form is in login mode', () => {
  assert.match(script, /function updateGooglePasswordHint\(\)\s*\{\s*\$\('googlePasswordHint'\)\.style\.display = \(googleConfigured && mode === 'login'\) \? 'block' : 'none';/);
  // wired into both the point where Google's own configured-flag actually
  // arrives (the /api/health response) and every mode switch (login <-> register)
  assert.match(script, /googleConfigured = true;[^\n]*updateGooglePasswordHint\(\)/);
  assert.match(script, /function setMode\(m\) \{[\s\S]*?updateGooglePasswordHint\(\);\s*\n\s*\}/);
});

test('a failed login with ERR_INVALID_CREDENTIALS appends the same hint to the error message -- but never on a 2FA-related failure', () => {
  const authGoAt = script.indexOf('async function authGo()');
  const authGoBody = script.slice(authGoAt, script.indexOf('\n  $(\'authGo\').onclick', authGoAt));
  assert.match(authGoBody, /d\.code === 'ERR_INVALID_CREDENTIALS'/);
  assert.match(authGoBody, /t\('googlePasswordHint'\)/);
  // the hint text is appended to, never replaces, the real server error
  assert.match(authGoBody, /apiError\(d, t\('errSignInFailed'\)\) \+ hint/);
});

test('the hint is never shown while creating a new account (register mode), only when signing back in', () => {
  // setMode('register') runs the same updateGooglePasswordHint() call, which
  // itself is what turns the hint off outside login mode -- confirm the logic
  // actually branches on mode, not just on Google being configured.
  assert.match(script, /mode === 'login'\) \? 'block' : 'none'/);
});
