// TrouvePro — shared security controls (headers, rate limits, input validation).
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const supabase = require('../db');
const rateStore = require('./rate-store');
const analytics = require('./analytics');

const PUBLIC_URL = process.env.PUBLIC_URL || '';
// uploaded photos are served from Supabase storage; nothing else may supply images
const SUPABASE_ORIGIN = (() => {
  try { return new URL(process.env.SUPABASE_URL || '').origin; } catch { return ''; }
})();
const TRUSTED_ORIGINS = [PUBLIC_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean);

// ---------- headers ----------
// A fresh random nonce every request, threaded through res.locals so the CSP
// directive below (a function, called per-request by helmet) can read it and
// so server.js can stamp the same value onto the page's own inline <script>
// tags (applyNonce below). Must run BEFORE `headers` in the middleware chain.
function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

// Stamps nonce="..." onto every <script> tag in a server-rendered page (both
// the SPA shell and the admin console are read once and reused per request —
// see server.js) so THIS page's own inline scripts satisfy the nonce-based
// CSP below, while anything an attacker manages to inject some other way
// (a stored/reflected value that ends up in the HTML unescaped) has no way
// to predict this request's nonce ahead of time and so cannot execute.
// Deliberately not `<script src="/i18n.js">`-specific: adding the attribute
// to every <script> tag, external or inline, is harmless either way.
function applyNonce(html, nonce) {
  return html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`);
}

// The frontend is a single hand-written page with inline <script> blocks (no
// inline onclick/onchange attributes anywhere — those are wired up with
// addEventListener inside the scripts themselves, confirmed by grep before
// this was written) — so script-src used to need 'unsafe-inline', which
// means CSP provided NO real defense against script injection: an attacker
// who found any way to get an unescaped `<script>` into the page could run
// it, nonce or no nonce, as long as 'unsafe-inline' was listed. Per-request
// nonces close that gap: only THIS response's own two inline blocks (the
// page's own script, and analytics.head()'s tiny injected one) carry the
// correct value, and it changes on every request. styleSrc keeps
// 'unsafe-inline' — the page uses inline style="" attributes throughout,
// which nonces cannot cover (only <style> blocks), and rewriting every one of
// them into a stylesheet is a separate, much lower-value effort (CSS
// injection cannot execute script) left for later.
const HTTPS_SITE = PUBLIC_URL.startsWith('https://');
const directives = {
  defaultSrc: ["'self'"],
  // no third-party script origin: image moderation is server-side only
  scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
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
// Only widened when a measurement id is configured, so a deployment without analytics keeps
// the strict policy and an accepted banner cannot pull in a tag we did not ask for.
if (analytics.measurementId()) {
  directives.scriptSrc.push(...analytics.ORIGINS.script);
  directives.connectSrc.push(...analytics.ORIGINS.connect);
  directives.imgSrc.push(...analytics.ORIGINS.img);
}

const headers = helmet({
  contentSecurityPolicy: { useDefaults: false, directives },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
  frameguard: { action: 'deny' },
});

// Not part of helmet's own default bundle (Permissions-Policy churned enough
// as a spec that helmet dropped it from defaults) — nothing in this app uses
// the camera, microphone, geolocation, USB, or payment-request browser APIs,
// so refusing every one of them outright shrinks what an XSS or a
// compromised third-party script could try to reach even if it did get past
// the CSP above.
function permissionsPolicy(req, res, next) {
  // microphone=(self): chat voice notes record in-page via MediaRecorder
  // (routes/voice.js). Kept as self rather than * so an embedded third-party
  // frame still cannot reach the mic. Everything else stays denied outright.
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
}

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
// Counters live in Postgres (lib/rate-store): the process-local default store would give
// every Railway instance its own budget, so the effective ceiling was limit x instances.
const limiter = (name, windowMs, max, message) => rateLimit({
  windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  store: rateStore.store(name),
  message: { error: message || 'Too many requests — please slow down.' },
});
// keyed on the account being targeted as well as the IP, so a botnet can't spray one inbox
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  store: rateStore.store('credentials'),
  keyGenerator: (req, res) => `${rateLimit.ipKeyGenerator(req, res)}|${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Too many attempts — try again in 15 minutes.' },
});

// The credential limiter is keyed on IP+email, which stops password spraying but lets one
// IP mint an account per new address; registration also needs a plain per-IP ceiling.
const limits = {
  register: limiter('register', 60 * 60 * 1000, 8, 'Too many accounts created from here — try again later.'),
  api: limiter('api', 15 * 60 * 1000, 1000),                 // blanket ceiling for /api
  credentials: credentialLimiter,                            // login / register / resend
  verify: limiter('verify', 15 * 60 * 1000, 40),             // e-mail confirmation links
  claim: limiter('claim', 60 * 60 * 1000, 20, 'Too many claim attempts — try again later.'),
  write: limiter('write', 60 * 1000, 60),                    // chat messages, profile saves
  upload: limiter('upload', 60 * 60 * 1000, 20, 'Too many uploads — try again later.'),
  report: limiter('report', 60 * 60 * 1000, 20),
  search: limiter('search', 60 * 1000, 60),                  // unauthenticated PostGIS queries
  // every concierge turn is a paid model call from an anonymous visitor: cap the burst and
  // the hourly spend one address can cause.
  concierge: [
    limiter('concierge-min', 60 * 1000, 8, 'Please wait a moment before writing again.'),
    limiter('concierge-hour', 60 * 60 * 1000, 40, 'Assistant limit reached — try again later.'),
  ],
  // A 6-digit TOTP code is only ~1-in-a-million to guess, which is fine
  // against a handful of tries but not an unthrottled one — this bounds
  // /totp/confirm and /totp/disable the same way sec.limits.credentials
  // already bounds guessing a password.
  totp: limiter('totp', 15 * 60 * 1000, 8, 'Too many authentication code attempts — try again in 15 minutes.'),
  // PDF/DOCX rendering is real CPU work, unlike most /api routes -- bounds
  // one account regenerating their CV in a tight loop. Generous enough that
  // nobody downloading a couple of copies in both formats ever notices it.
  cv: limiter('cv', 60 * 1000, 6, 'Please wait a moment before generating another CV.'),
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
  headers, corsSameOrigin, forceHttps, limits, nonce: cspNonce, applyNonce, permissionsPolicy,
  isEmail, normalizeEmail, isText, clean, isId, passwordProblem,
  requireActiveUser, dropUserFromCache,
};
