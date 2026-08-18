// TrouvePro — Phase 1 server (proximity engine). Data in Supabase; auth JWT.
require('dotenv').config();
const express = require('express');
const path = require('path');
const sec = require('./lib/security');

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
app.use((req, res, next) =>
  req.originalUrl === '/api/subscription/webhook' ? next() : express.json({ limit: '8mb' })(req, res, next));
app.use(express.static('public', { dotfiles: 'ignore', index: false }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));       // GET /api/catalog
app.use('/api/providers', require('./routes/providers'));
app.use('/api/search', require('./routes/search'));  // GET /api/search?lat&lng&...
app.use('/api/chat', require('./routes/chat'));
app.use('/api/chat', require('./routes/photos'));    // /api/chat/:id/photos
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/report', require('./routes/report'));
app.use('/api/claim', require('./routes/claim'));    // claim an unclaimed RBQ seed listing

app.get('/api/health', (_req, res) => res.json({ ok: true, phase: 3 }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// last resort: log the detail, never leak internals (stack traces, SQL) to clients
app.use((err, _req, res, _next) => {
  console.error('unhandled', err);
  if (res.headersSent) return;
  const bodyProblem = err.type === 'entity.too.large' || err.type === 'entity.parse.failed';
  res.status(bodyProblem ? 400 : 500).json({ error: bodyProblem ? 'Invalid request body' : 'Internal error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`TrouvePro on ${PORT} — proximity engine live`));
module.exports = app;
