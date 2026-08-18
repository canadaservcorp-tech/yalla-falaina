const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const VERIFY_OPTS = { algorithms: ['HS256'], maxAge: '2d' };

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme || '') || !token) return null;
  try { return jwt.verify(token, JWT_SECRET, VERIFY_OPTS); } catch { return null; }
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
