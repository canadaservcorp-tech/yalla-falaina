// TrouvePro — Phase 1 server (proximity engine). Data in Supabase; auth JWT.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const need = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const k of need) if (!process.env[k]) { console.error(`FATAL: missing env ${k}`); process.exit(1); }

const app = express();
app.use(cors());
app.use((req, res, next) =>
  req.originalUrl === '/api/subscription/webhook' ? next() : express.json({ limit: '8mb' })(req, res, next));
app.use(express.static('public'));

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
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TrouvePro on ${PORT} — proximity engine live`));
module.exports = app;
