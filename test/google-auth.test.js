// "Continue with Google" removes the password and the verification email from
// signup, so it also removes two places we used to check who someone is. These
// tests pin what replaces them: a signed state parameter, a verified Google
// address, one account per person, and a session token that never rides in a URL.
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.PUBLIC_URL = 'https://www.yallansafir.com';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const totp = require('../lib/totp');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
const SECRET = process.env.JWT_SECRET;

const idToken = claims => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
const GOOGLE_CLAIMS = {
  aud: process.env.GOOGLE_CLIENT_ID, sub: 'google-uid-1',
  email: 'Seeker@Gmail.com', email_verified: true, name: 'Amina B.',
};

function stubGoogle(claims = GOOGLE_CLAIMS) {
  const orig = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ id_token: idToken(claims) }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return orig(url, opts);
  };
  return () => { global.fetch = orig; };
}

// A real browser follows the redirect to Google; here we stop at it.
const noRedirect = { redirect: 'manual' };
const startState = async () => {
  const r = await fetch(h.base + '/api/auth/google', noRedirect);
  return new URL(r.headers.get('location')).searchParams.get('state');
};

beforeEach(() => h.mock.__reset());

test('the entry point sends the seeker to Google with our client id and callback', async () => {
  const r = await fetch(h.base + '/api/auth/google', noRedirect);
  assert.equal(r.status, 302);
  const url = new URL(r.headers.get('location'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), process.env.GOOGLE_CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.yallansafir.com/api/auth/google/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  // signed, so a callback can't be driven by a state we never issued
  assert.equal(jwt.verify(url.searchParams.get('state'), SECRET).purpose, 'google_oauth');
});

test('a callback with a forged or missing state is refused before any token exchange', async () => {
  const restore = stubGoogle();
  try {
    for (const state of ['', 'not-a-jwt', jwt.sign({ purpose: 'something_else' }, SECRET)]) {
      const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, noRedirect);
      assert.match(r.headers.get('location'), /googleError=state/);
    }
  } finally { restore(); }
});

test('a first-time Google seeker gets one verified account, no password login', async () => {
  const restore = stubGoogle();
  h.mock.__set('users', { data: null, error: null });                    // no existing match
  h.mock.__setOp('users', 'insert', { data: { id: 51, email: 'seeker@gmail.com', name: 'Amina B.', role: 'seeker' }, error: null });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin + loc.pathname, 'https://www.yallansafir.com/');

    const [insert] = h.mock.__writes('users', 'insert');
    assert.equal(insert.payload.email, 'seeker@gmail.com', 'the address should be normalized');
    assert.equal(insert.payload.google_sub, 'google-uid-1');
    assert.equal(insert.payload.email_verified, true, 'Google already proved the address');
    assert.ok(insert.payload.terms_accepted_at, 'terms acceptance must still be recorded');
    // no usable password: the hash is random, never anything a client sent
    assert.ok(insert.payload.password_hash && insert.payload.password_hash.startsWith('$2'));
    assert.equal(h.mock.__writes('profiles', 'insert').length, 1, 'the 18+ profile row is created too');
  } finally { restore(); }
});

test('an unverified Google address is refused — it would let someone claim an email they do not own', async () => {
  const restore = stubGoogle({ ...GOOGLE_CLAIMS, email_verified: false });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    assert.match(r.headers.get('location'), /googleError=failed/);
    assert.equal(h.mock.__writes('users', 'insert').length, 0);
  } finally { restore(); }
});

test('an id_token minted for a different client is refused', async () => {
  const restore = stubGoogle({ ...GOOGLE_CLAIMS, aud: 'someone-elses-client-id' });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    assert.match(r.headers.get('location'), /googleError=failed/);
    assert.equal(h.mock.__writes('users', 'insert').length, 0);
  } finally { restore(); }
});

test('an existing password account is linked, never duplicated', async () => {
  const restore = stubGoogle();
  h.mock.__queue('users',
    { data: null, error: null },                                          // no google_sub match
    { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker', banned: false, google_sub: null, email_verified: false }, error: null });
  try {
    await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    assert.equal(h.mock.__writes('users', 'insert').length, 0, 'a second account was created for the same person');
    const [update] = h.mock.__writes('users', 'update');
    assert.equal(update.payload.google_sub, 'google-uid-1');
    assert.equal(update.payload.email_verified, true, 'a stuck unverified account is unblocked by signing in with Google');
  } finally { restore(); }
});

test('a banned account cannot slip back in through Google', async () => {
  const restore = stubGoogle();
  h.mock.__set('banned_emails', { data: { email: 'seeker@gmail.com' }, error: null });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    assert.match(r.headers.get('location'), /googleError=blocked/);
    assert.equal(h.mock.__writes('users', 'insert').length, 0);
  } finally { restore(); }
});

test('the redirect carries a short-lived handoff, not the session token', async () => {
  const restore = stubGoogle();
  h.mock.__set('users', { data: null, error: null });
  h.mock.__setOp('users', 'insert', { data: { id: 51, email: 'seeker@gmail.com', name: 'Amina B.', role: 'seeker' }, error: null });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    const handoff = new URL(r.headers.get('location')).searchParams.get('google');
    const claims = jwt.verify(handoff, SECRET);
    assert.equal(claims.purpose, 'google_handoff');
    assert.equal(claims.role, undefined, 'the handoff must not be usable as a session token');
    assert.ok(claims.exp - claims.iat <= 120, 'the handoff should expire in minutes, not days');
  } finally { restore(); }
});

test('exchange trades a valid handoff for a session token, and refuses anything else', async () => {
  h.mock.__set('users', { data: { id: 51, email: 'seeker@gmail.com', name: 'Amina B.', role: 'seeker', banned: false }, error: null });
  const post = handoff => fetch(h.base + '/api/auth/google/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handoff }),
  });

  const ok = await post(jwt.sign({ id: 51, purpose: 'google_handoff' }, SECRET, { expiresIn: '2m' }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  const session = jwt.verify(body.token, SECRET);
  assert.equal(session.id, 51);
  assert.equal(session.role, 'seeker');

  // a session token is not a handoff, and neither is an expired one
  assert.equal((await post(body.token)).status, 401);
  assert.equal((await post(jwt.sign({ id: 51, purpose: 'google_handoff' }, SECRET, { expiresIn: '-1s' }))).status, 401);
  assert.equal((await post('garbage')).status, 401);
});

// The page declares `let history = []` for the chat transcript, which shadows
// window.history for the whole script. A bare history.replaceState() therefore
// throws at load — and because this runs top-level, it took the sign-in
// handlers below it down with it, leaving the auth card completely inert.
test('the page never reaches for a bare `history` — it is the chat array, not the browser one', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /let history = \[\]/, 'the shadowing declaration this guards against is gone — revisit this test');
  const bare = html.match(/(^|[^.\w])history\s*\.\s*(replaceState|pushState|back|forward|go)\b/m);
  assert.equal(bare, null, 'use window.history.' + (bare ? bare[2] : 'replaceState') + '()');
});

// Same failure mode, second cause: the handler reads t(), currentLang and
// enter(), all declared further down the file. Running it where it is defined
// threw "Cannot access 't' before initialization" — again at top level, again
// taking the auth handlers with it. It has to be CALLED after those exist.
test('the Google return handler is called after the page is initialized, not where it is defined', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /\(function finishGoogleSignIn\(\)/,
    'finishGoogleSignIn must not be an immediately-invoked function');
  const declared = html.indexOf('function finishGoogleSignIn()');
  const called = html.indexOf('finishGoogleSignIn();');
  const tDefined = html.indexOf('const t = (key, vars)');
  assert.ok(declared > -1 && called > -1 && tDefined > -1);
  assert.ok(called > tDefined, 'the call must come after t() exists');
});

test('a banned user holding a valid handoff still gets nothing', async () => {
  h.mock.__set('users', { data: { id: 51, email: 'seeker@gmail.com', name: 'x', role: 'seeker', banned: true }, error: null });
  const r = await fetch(h.base + '/api/auth/google/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handoff: jwt.sign({ id: 51, purpose: 'google_handoff' }, SECRET, { expiresIn: '2m' }) }),
  });
  assert.equal(r.status, 401);
});

// ---------- Google sign-in must not skip an account's own 2FA ----------
// Google only proves the email address. An account that turned TOTP on did
// so specifically so a compromised credential elsewhere (a Google account
// included) still is not enough on its own -- /login already enforces this;
// the callback must route the same accounts through the same check instead
// of handing out a handoff straight away just because the credential this
// time came from Google.

test('an existing account with 2FA on gets a pending token, never a session handoff, straight from Google', async () => {
  const restore = stubGoogle();
  const secret = totp.generateSecret();
  h.mock.__queue('users',
    { data: null, error: null }, // no google_sub match
    { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker', banned: false,
      google_sub: null, email_verified: true, totp_enabled: true, totp_secret: secret }, error: null });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.searchParams.has('google'), false, 'must not receive the full-privilege handoff');
    const pending = loc.searchParams.get('googlePending');
    assert.ok(pending, 'expected a pending token instead');
    const claims = jwt.verify(pending, SECRET);
    assert.equal(claims.purpose, 'google_totp_pending');
    assert.equal(claims.id, 9);
    assert.ok(claims.exp - claims.iat <= 300, 'the pending token should expire in minutes, not days');
    // reaching a 2FA challenge must not itself count as a successful login
    assert.equal(h.mock.__rpcCalls('record_login_result').length, 0);
  } finally { restore(); }
});

test('an account with 2FA off still gets the normal one-step handoff', async () => {
  const restore = stubGoogle();
  h.mock.__queue('users',
    { data: null, error: null },
    { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker', banned: false,
      google_sub: null, email_verified: true, totp_enabled: false, totp_secret: null }, error: null });
  try {
    const r = await fetch(h.base + `/api/auth/google/callback?code=abc&state=${await startState()}`, noRedirect);
    const loc = new URL(r.headers.get('location'));
    assert.ok(loc.searchParams.get('google'), 'expected the normal handoff');
    assert.equal(loc.searchParams.has('googlePending'), false);
  } finally { restore(); }
});

test('POST /google/totp-verify with the right code exchanges a pending token for a real session, and records the login', async () => {
  const secret = totp.generateSecret();
  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: false, totp_enabled: true, totp_secret: secret }, error: null });
  const pending = jwt.sign({ id: 9, purpose: 'google_totp_pending' }, SECRET, { expiresIn: '5m' });

  const r = await fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pending, totpToken: totp.generateTOTP(secret) }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  const session = jwt.verify(body.token, SECRET);
  assert.equal(session.id, 9);
  assert.equal(session.role, 'seeker');
  assert.equal(h.mock.__lastRpc('record_login_result').args.p_success, true);
});

test('POST /google/totp-verify with a wrong code is refused and counts as a failed attempt, same as /login', async () => {
  const secret = totp.generateSecret();
  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: false, totp_enabled: true, totp_secret: secret }, error: null });
  const pending = jwt.sign({ id: 9, purpose: 'google_totp_pending' }, SECRET, { expiresIn: '5m' });

  const r = await fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pending, totpToken: '000000' }),
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'ERR_INVALID_TOTP');
  assert.equal(h.mock.__lastRpc('record_login_result').args.p_success, false);
});

test('POST /google/totp-verify with no code at all asks for one instead of silently failing', async () => {
  const secret = totp.generateSecret();
  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: false, totp_enabled: true, totp_secret: secret }, error: null });
  const pending = jwt.sign({ id: 9, purpose: 'google_totp_pending' }, SECRET, { expiresIn: '5m' });

  const r = await fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pending }),
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'ERR_TOTP_REQUIRED');
});

test('POST /google/totp-verify refuses a handoff token (wrong purpose), an expired pending token, and garbage', async () => {
  const secret = totp.generateSecret();
  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: false, totp_enabled: true, totp_secret: secret }, error: null });
  const code = totp.generateTOTP(secret);
  const post = pending => fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pending, totpToken: code }),
  });
  assert.equal((await post(jwt.sign({ id: 9, purpose: 'google_handoff' }, SECRET, { expiresIn: '2m' }))).status, 401);
  assert.equal((await post(jwt.sign({ id: 9, purpose: 'google_totp_pending' }, SECRET, { expiresIn: '-1s' }))).status, 401);
  assert.equal((await post('garbage')).status, 401);
});

test('POST /google/totp-verify refuses a banned account, and re-checks 2FA is still on rather than trusting the token', async () => {
  const pending = jwt.sign({ id: 9, purpose: 'google_totp_pending' }, SECRET, { expiresIn: '5m' });

  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: true, totp_enabled: true, totp_secret: totp.generateSecret() }, error: null });
  assert.equal((await fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pending, totpToken: '123456' }),
  })).status, 401);

  // 2FA turned off in the meantime (e.g. via /totp/disable) since the pending
  // token was issued -- the token's own premise is not enough on its own.
  h.mock.__set('users', { data: { id: 9, email: 'seeker@gmail.com', name: 'Amina', role: 'seeker',
    banned: false, totp_enabled: false, totp_secret: null }, error: null });
  const r = await fetch(h.base + '/api/auth/google/totp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pending, totpToken: '123456' }),
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'ERR_INVALID_TOKEN');
});
