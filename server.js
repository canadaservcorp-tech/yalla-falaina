// Yalla Nsafer — Phase 1 server. Forked from the trouvepro codebase: same
// Express + Supabase + Railway skeleton, security stack and auth; the
// marketplace surface (listings, GPS search, bookings, RBQ) is gone and the
// product surface is the AI concierge.
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const sec = require('./lib/security');
const seo = require('./lib/seo');
const geo = require('./lib/geo');
const analytics = require('./lib/analytics');
const paypal = require('./lib/paypal');
const stripeLib = require('./lib/stripe');
const transcribeLib = require('./lib/transcribe');
const webPush = require('./lib/webPush');
const expressEntryPage = require('./lib/expressEntryPage');
const gccGuides = require('./lib/gccGuides');

const need = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const k of need) if (!process.env[k]) { console.error(`FATAL: missing env ${k}`); process.exit(1); }
if (process.env.JWT_SECRET.length < 32) { console.error('FATAL: JWT_SECRET must be at least 32 characters'); process.exit(1); }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);          // Railway terminates TLS in front of us
app.use(sec.forceHttps);
app.use(sec.nonce);                 // must run before sec.headers — the CSP below reads res.locals.cspNonce
app.use(sec.headers);
app.use(sec.permissionsPolicy);
app.use(sec.corsSameOrigin);

// Emergency, redeploy-only full-stop (see SECURITY-INCIDENT-RESPONSE.md): set
// SITE_LOCKDOWN=true and redeploy to immediately take every /api route but
// the health check offline while investigating a suspected active
// compromise. Nothing is deleted or rolled back — clearing the variable and
// redeploying again is the entire way back to normal.
const LOCKDOWN = String(process.env.SITE_LOCKDOWN || '').toLowerCase() === 'true';
if (LOCKDOWN) console.error('SITE_LOCKDOWN is set — every /api route (except /api/health) is returning 503 until it is cleared');
app.use('/api', sec.limits.api);
app.use('/api', (req, res, next) => {
  if (LOCKDOWN && req.path !== '/health') return res.status(503).json({ error: 'Temporarily unavailable', code: 'ERR_LOCKDOWN' });
  next();
});
app.use((req, res, next) => {
  // raw body for both webhooks, verified downstream (PayPal's own signature
  // check; Stripe's local HMAC check) against the exact bytes received
  if (req.originalUrl === '/api/subscription/webhook' || req.originalUrl === '/api/subscription/stripe/webhook') return next();
  // a voice note is audio bytes, not JSON, and needs a far bigger ceiling than
  // the 128kb one below (lib/transcribe.js enforces the same limit again)
  if (req.originalUrl === '/api/voice/transcribe')
    return express.raw({ type: () => true, limit: transcribeLib.MAX_BYTES })(req, res, next);
  express.json({ limit: '128kb' })(req, res, next);
});
app.get('/index.html', (_req, res) => res.redirect(301, '/'));   // one canonical home URL
// public/admin.html needs the same per-request CSP nonce stamped onto its own
// inline <script> as the SPA shell below gets — express.static alone would
// serve its bytes unmodified and CSP would then block that script outright
// now that scriptSrc no longer carries 'unsafe-inline'. Registered before the
// static middleware so this handles the request instead of it.
const ADMIN_SHELL = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
app.get('/admin.html', (_req, res) => res.type('html').send(sec.applyNonce(ADMIN_SHELL, res.locals.cspNonce)));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: false }));

app.get('/robots.txt', (_req, res) => res.type('text/plain').send(seo.robots()));
app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(seo.sitemap()));

// Real, crawlable GCC work-sponsorship guide pages (lib/gccGuides.js) --
// registered ahead of the catch-all below, same pattern and reasoning as
// /express-entry-draws: static, sourced content with zero client JS, and
// zero DB dependency (unlike the draws page, this content isn't ingested
// from anywhere -- it's static reference data).
// The guide pages exist in en/fr/ar only (lib/gccGuides.js has no hi copy —
// same "original over invented translation" rule as the news ticker's Hindi
// fallback), so the route's language set is narrower than seo.LANGS.
const GUIDE_LANGS = ['en', 'fr', 'ar'];
for (const country of gccGuides.COUNTRIES) {
  app.get(`/${country.slug}`, (req, res) => {
    const asked = GUIDE_LANGS.includes(req.query.lang) ? req.query.lang : null;
    const lang = asked || geo.pickLang(req, GUIDE_LANGS) || 'en';
    const head = seo.head(`/${country.slug}`, lang, asked || 'en');
    // Only the ?lang-pinned response is a stable shared-cache entry — a bare
    // URL's language comes from the visitor's geo/Accept-Language, so caching
    // it publicly would serve the first visitor's language to everyone else.
    res.set('Cache-Control', asked ? 'public, max-age=3600' : 'private, no-cache');
    res.type('html').send(gccGuides.renderPage({ country, lang, head }));
  });
}

// A real, crawlable page (lib/expressEntryPage.js), not another view of the
// SPA shell -- registered ahead of the catch-all below so it isn't swallowed
// by it. No inline script at all, so no CSP nonce is needed here.
app.get('/express-entry-draws', async (req, res) => {
  const asked = seo.LANGS.includes(req.query.lang) ? req.query.lang : null;
  const lang = asked || geo.pickLang(req, seo.LANGS) || 'en';
  const draws = await expressEntryPage.loadDraws();
  const head = seo.head('/express-entry-draws', lang, asked || 'en');
  // Real, shared content (unlike the per-visitor SPA shell below) -- safe to
  // cache briefly at the edge/browser; news_items only changes on the news
  // ingest schedule (lib/scheduler.js), not per request.
  res.set('Cache-Control', asked ? 'public, max-age=300' : 'private, no-cache');
  res.type('html').send(expressEntryPage.renderPage({ lang, draws, head }));
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/concierge', require('./routes/concierge')); // the AI concierge — the product
app.use('/api/profile', require('./routes/profile'));
app.use('/api/cv', require('./routes/cv')); // CV export (PDF/Word) -- subscription-gated, see routes/cv.js
app.use('/api/informal-listings', require('./routes/informal-listings'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/jobs', require('./routes/jobs'));      // public feed stats (the live count on the landing page)
app.use('/api/news', require('./routes/news'));      // immigration-news ticker (public)
app.use('/api/voice', require('./routes/voice'));    // chat voice notes -> transcript -> /api/concierge
app.use('/api/admin/informal-listings', require('./routes/admin-informal-listings'));
app.use('/api/admin/news', require('./routes/admin-news'));
app.use('/api/push', require('./routes/push'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/admin/referrals', require('./routes/admin-referrals'));
app.use('/api/study-opportunities', require('./routes/study-opportunities'));
app.use('/api/admin/study-opportunities', require('./routes/admin-study-opportunities'));
app.use('/api/community', require('./routes/community'));               // diaspora groups + accommodation board
app.use('/api/admin/community', require('./routes/admin-community'));

// booleans only: enough to tell a missing key from a rejected one without revealing either.
// Step 7 (deployment prep) — paypal/email are configuration checks, same as
// concierge/analytics below: no live network call to PayPal or Resend here.
app.get('/api/health', (_req, res) => res.json({
  ok: true, phase: 1,
  paywall: process.env.PAYWALL_ENFORCED === 'true',
  concierge: Boolean(process.env.ANTHROPIC_API_KEY),
  jobsFeed: process.env.JOB_API_PROVIDER || 'seed',
  analytics: Boolean(analytics.measurementId()),
  paypal: paypal.configured(),
  stripe: stripeLib.configured(),
  email: Boolean(process.env.RESEND_API_KEY),
  voice: transcribeLib.configured(),
  google: require('./lib/googleOAuth').configured(),
  push: webPush.configured(),
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// the SPA is a single file, so give crawlers per-route <head> metadata on the way out
const SHELL = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
app.get('*', (req, res) => {
  const route = seo.INDEXABLE.includes(req.path) ? req.path : '/';
  // ?lang= is the visitor's own choice and always wins; without it the country
  // the request comes from picks the first page's language (lib/geo.js).
  const asked = seo.LANGS.includes(req.query.lang) ? req.query.lang : null;
  const lang = asked || geo.pickLang(req, seo.LANGS) || 'en';
  // The response body differs by visitor location and browser language; the
  // page must never be served to a second visitor out of a shared cache, and
  // Vary covers the fallback signal. (Railway fronts us with no shared cache
  // today — this guards the day that stops being true.)
  res.set('Vary', 'Accept-Language, CF-IPCountry, X-Vercel-IP-Country, X-Country-Code, X-Geo-Country');
  res.set('Cache-Control', 'private, no-cache');
  // function replacer: prices in the copy would otherwise be read as $-patterns
  const html = SHELL.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => seo.head(route, lang, asked || 'en'))
    .replace('<!--analytics-->', () => analytics.head())
    .replace(/<html lang="[a-z]+">/, `<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''} data-sub-price="${geo.priceLabel(req)}">`);
  res.type('html').send(sec.applyNonce(html, res.locals.cspNonce));
});

// last resort: log the detail, never leak internals (stack traces, SQL) to clients
app.use((err, _req, res, _next) => {
  console.error('unhandled', err);
  if (res.headersSent) return;
  const bodyProblem = err.type === 'entity.too.large' || err.type === 'entity.parse.failed';
  // Oversized audio is the one over-limit body a seeker can hit deliberately
  // (a long voice note), so it gets a real status + code, not a generic 400.
  if (err.type === 'entity.too.large' && _req.originalUrl === '/api/voice/transcribe')
    return res.status(413).json({ error: 'That recording is too long', code: 'ERR_TOO_LARGE' });
  res.status(bodyProblem ? 400 : 500).json({ error: bodyProblem ? 'Invalid request body' : 'Internal error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Yalla Nsafer on ${PORT} — concierge live`));
  require('./lib/scheduler').start();
}
module.exports = app;
