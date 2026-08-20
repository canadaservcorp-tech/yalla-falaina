// TrouvePro — shared security controls (headers, rate limits, input validation).
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const supabase = require('../db');

const PUBLIC_URL = process.env.PUBLIC_URL || '';
// uploaded photos are served from Supabase storage; nothing else may supply images
const SUPABASE_ORIGIN = (() => {
  try { return new URL(process.env.SUPABASE_URL || '').origin; } catch { return ''; }
})();
const TRUSTED_ORIGINS = [PUBLIC_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean);

// ---------- headers ----------
// The frontend is a single hand-written page with inline <script>/<style> and
// onclick handlers, so script/style need 'unsafe-inline'; everything else is
// locked to same-origin and framing/plugins are refused outright.
const HTTPS_SITE = PUBLIC_URL.startsWith('https://');
const directives = {
  defaultSrc: ["'self'"],
  // no third-party script origin: image moderation is server-side only
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', SUPABASE_ORIGIN].filter(Boolean),
  connectSrc: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
};
if (HTTPS_SITE) directives.upgradeInsecureRequests = [];

const headers = helmet({
  contentSecurityPolicy: { useDefaults: false, directives },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
  frameguard: { action: 'deny' },
});

// Browsers only send the API cross-origin if another site tries to; refuse that.
function corsSameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !TRUSTED_ORIGINS.includes(origin))
    return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

function forceHttps(req, res, next) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (HTTPS_SITE && proto && proto !== 'https') {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return res.status(403).json({ error: 'HTTPS required' });
    return res.redirect(308, PUBLIC_URL + req.originalUrl);
  }
  next();
}

// ---------- rate limits ----------
const limiter = (windowMs, max, message) => rateLimit({
  windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: message || 'Too many requests — please slow down.' },
});
// keyed on the account being targeted as well as the IP, so a botnet can't spray one inbox
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req, res) => `${rateLimit.ipKeyGenerator(req, res)}|${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Too many attempts — try again in 15 minutes.' },
});

// The credential limiter is keyed on IP+email, which stops password spraying but lets one
// IP mint an account per new address; registration also needs a plain per-IP ceiling.
const limits = {
  register: limiter(60 * 60 * 1000, 8, 'Too many accounts created from here — try again later.'),
  api: limiter(15 * 60 * 1000, 1000),                       // blanket ceiling for /api
  credentials: credentialLimiter,                            // login / register / resend
  verify: limiter(15 * 60 * 1000, 40),                       // e-mail confirmation links
  claim: limiter(60 * 60 * 1000, 20, 'Too many claim attempts — try again later.'),
  write: limiter(60 * 1000, 60),                             // chat messages, profile saves
  upload: limiter(60 * 60 * 1000, 20, 'Too many uploads — try again later.'),
  report: limiter(60 * 60 * 1000, 20),
  search: limiter(60 * 1000, 60),                            // unauthenticated PostGIS queries
};

// ---------- input validation ----------
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const isEmail = v => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
const normalizeEmail = v => String(v || '').trim().toLowerCase();
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : undefined;
const isId = v => Number.isSafeInteger(Number(v)) && Number(v) > 0;
// Passwords: length beats composition rules, and long ones are hashed fine by bcrypt<=72 bytes.
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters';
  if (Buffer.byteLength(pw) > 72) return 'Password is too long (max 72 bytes)';
  if (/^(.)\1+$/.test(pw)) return 'Password is too weak';
  return null;
}

// ---------- session state ----------
// A JWT stays valid for days, so a banned/deleted account must be re-checked on
// every state-changing request. Cached briefly to keep it off the hot path.
const CACHE_MS = 30 * 1000;
const CACHE_MAX = 5000;
const cache = new Map();
async function requireActiveUser(req, res, next) {
  try {
    if (!req.user || !Number.isSafeInteger(req.user.id)) return res.status(401).json({ error: 'Invalid token' });
    if (cache.size > CACHE_MAX) cache.clear();
    const hit = cache.get(req.user.id);
    let row = hit && hit.at > Date.now() - CACHE_MS ? hit.row : null;
    if (!row) {
      const { data } = await supabase.from('users').select('id, role, banned, email_verified').eq('id', req.user.id).maybeSingle();
      row = data || null;
      cache.set(req.user.id, { row, at: Date.now() });
    }
    if (!row) return res.status(401).json({ error: 'Account no longer exists' });
    if (row.banned) return res.status(403).json({ error: 'Account blocked' });
    if (!row.email_verified) return res.status(403).json({ error: 'Please verify your email first' });
    req.user.role = row.role;   // trust the database, not the token, for privileges
    next();
  } catch (e) { console.error('requireActiveUser', e); res.status(500).json({ error: 'Internal error' }); }
}
const dropUserFromCache = id => cache.delete(Number(id));

module.exports = {
  headers, corsSameOrigin, forceHttps, limits,
  isEmail, normalizeEmail, isText, clean, isId, passwordProblem,
  requireActiveUser, dropUserFromCache,
};
