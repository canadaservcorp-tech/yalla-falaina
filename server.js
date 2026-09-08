// Yalla Falaina — Phase 1 server. Forked from the trouvepro codebase: same
// Express + Supabase + Railway skeleton, security stack and auth; the
// marketplace surface (listings, GPS search, bookings, RBQ) is gone and the
// product surface is the AI concierge.
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const sec = require('./lib/security');
const seo = require('./lib/seo');
const analytics = require('./lib/analytics');

const need = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const k of need) if (!process.env[k]) { console.error(`FATAL: missing env ${k}`); process.exit(1); }
if (process.env.JWT_SECRET.length < 32) { console.error('FATAL: JWT_SECRET must be at least 32 characters'); process.exit(1); }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);          // Railway terminates TLS in front of us
app.use(sec.forceHttps);
app.use(sec.headers);
app.use(sec.corsSameOrigin);
app.use('/api', sec.limits.api);
app.use((req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') return next();   // raw body, verified downstream
  express.json({ limit: '128kb' })(req, res, next);
});
app.get('/index.html', (_req, res) => res.redirect(301, '/'));   // one canonical home URL
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: false }));

app.get('/robots.txt', (_req, res) => res.type('text/plain').send(seo.robots()));
app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(seo.sitemap()));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/concierge', require('./routes/concierge')); // the AI concierge — the product

// booleans only: enough to tell a missing key from a rejected one without revealing either
app.get('/api/health', (_req, res) => res.json({
  ok: true, phase: 1,
  paywall: process.env.PAYWALL_ENFORCED === 'true',
  concierge: Boolean(process.env.ANTHROPIC_API_KEY),
  jobsFeed: process.env.JOB_API_PROVIDER || 'seed',
  analytics: Boolean(analytics.measurementId()),
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// the SPA is a single file, so give crawlers per-route <head> metadata on the way out
const SHELL = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
app.get('*', (req, res) => {
  const route = seo.INDEXABLE.includes(req.path) ? req.path : '/';
  const lang = seo.LANGS.includes(req.query.lang) ? req.query.lang : 'en';
  // function replacer: prices in the copy would otherwise be read as $-patterns
  res.type('html').send(SHELL.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => seo.head(route, lang))
    .replace('<!--analytics-->', () => analytics.head())
    .replace(/<html lang="[a-z]+">/, `<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}>`));
});

// last resort: log the detail, never leak internals (stack traces, SQL) to clients
app.use((err, _req, res, _next) => {
  console.error('unhandled', err);
  if (res.headersSent) return;
  const bodyProblem = err.type === 'entity.too.large' || err.type === 'entity.parse.failed';
  res.status(bodyProblem ? 400 : 500).json({ error: bodyProblem ? 'Invalid request body' : 'Internal error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Yalla Falaina on ${PORT} — concierge live`));
  require('./lib/scheduler').start();
}
module.exports = app;
