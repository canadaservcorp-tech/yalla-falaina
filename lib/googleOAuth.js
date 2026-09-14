// "Continue with Google": the authorization-code flow, done server-side.
//
// Why not Google's in-page button (GIS): it needs a third-party script and a
// wider CSP than lib/security.js grants, for an audience that mostly arrives
// on cheap Android phones over slow mobile data. A plain redirect costs no
// extra bytes and works with the CSP exactly as it stands.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALLBACK_PATH = '/api/auth/google/callback';
const STATE_TTL = '10m';
const FETCH_MS = 10000;

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';
const configured = () => Boolean(clientId() && clientSecret());
const redirectUri = () => (process.env.PUBLIC_URL || 'http://localhost:3000') + CALLBACK_PATH;

// The state parameter is a short-lived signed token rather than a session
// entry: it survives a restart mid-login, needs no cookie (nothing else in
// this app sets one), and still can't be forged without JWT_SECRET.
function issueState(extra = {}) {
  return jwt.sign({ ...extra, n: crypto.randomBytes(12).toString('hex'), purpose: 'google_oauth' },
    process.env.JWT_SECRET, { expiresIn: STATE_TTL });
}

function readState(state) {
  try {
    const claims = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    return claims.purpose === 'google_oauth' ? claims : null;
  } catch (e) { return null; }
}

function authUrl(state) {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return AUTH_URL + '?' + q.toString();
}

// Base64url payload of the id_token. Verifying its RS256 signature against
// Google's JWKS would be redundant here: the token came straight back from
// Google's token endpoint over TLS, in a request authenticated with our own
// client secret — there is no untrusted party in between to forge it. (That
// changes the day an id_token arrives from the browser instead.)
function decodeIdToken(idToken) {
  const part = String(idToken || '').split('.')[1];
  if (!part) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code: String(code || ''),
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error('token exchange failed: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const claims = decodeIdToken((await res.json()).id_token);
  if (claims.aud !== clientId()) throw new Error('id_token audience mismatch');
  // An unverified Google address would let someone claim an email they don't
  // own — and this flow is exactly what skips our own verification step.
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('google email not verified');
  if (!claims.email || !claims.sub) throw new Error('id_token missing email/sub');
  return { sub: String(claims.sub), email: String(claims.email), name: claims.name || '' };
}

module.exports = { configured, authUrl, issueState, readState, exchangeCode, redirectUri, CALLBACK_PATH };
