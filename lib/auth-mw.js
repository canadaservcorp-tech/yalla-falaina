const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const VERIFY_OPTS = { algorithms: ['HS256'], maxAge: '2d' };

// Emergency, redeploy-only kill switch (see SECURITY-INCIDENT-RESPONSE.md).
// A JWT normally stays valid for its own 2-day life no matter what happens
// afterward — there's no server-side session table to delete from. Setting
// AUTH_MIN_ISSUED_AT to any parseable timestamp (e.g. the moment a
// compromise was discovered) and redeploying makes every token issued before
// that moment invalid immediately, everywhere, for every account at once —
// including a token an attacker holds that its real owner never sees and so
// could never think to log out of. Read fresh on every call (not cached at
// module load) so the very first request after a redeploy already enforces
// it, and left unset in normal operation, where it costs nothing.
function minIssuedAtSeconds() {
  const raw = process.env.AUTH_MIN_ISSUED_AT;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme || '') || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, VERIFY_OPTS);
    if (typeof payload.iat === 'number' && payload.iat < minIssuedAtSeconds()) return null;
    return payload;
  } catch { return null; }
}

function authenticate(req, res, next) {
  if (!(req.headers.authorization || '').trim()) return res.status(401).json({ error: 'No token' });
  const payload = readToken(req);
  if (!payload || !Number.isSafeInteger(payload.id)) return res.status(401).json({ error: 'Invalid token' });
  req.user = payload;
  next();
}

// attaches req.user when a valid token is present, but never rejects
function optionalAuth(req, _res, next) {
  const payload = readToken(req);
  if (payload && Number.isSafeInteger(payload.id)) req.user = payload;
  next();
}

module.exports = { authenticate, optionalAuth };
