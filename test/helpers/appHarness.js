// Boots the real Express app with db.js replaced by a mock, on an ephemeral port.
// Singleton per process (node --test runs each file in its own process = isolated).
const http = require('http');
const jwt = require('jsonwebtoken');
const { createMockDb } = require('./mockDb');

let started = null;
function getApp() {
  if (started) return started;
  // required env BEFORE requiring server.js (it exits if these are missing)
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_at_least_32_chars_long!';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';

  // inject the mock into the module cache so every require('../db') gets it
  const dbPath = require.resolve('../../db');
  const mock = createMockDb();
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };

  const app = require('../../server');                    // exports the express app
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  started = { app, server, base, mock, stop: () => new Promise(r => server.close(r)) };
  return started;
}

// The app trusts the database, not the token, for role/verification/ban state
// (lib/security.requireActiveUser), so an authenticated call needs a users row too.
function actor(h, { id, role = 'seeker', verified = true, banned = false, extra = {} } = {}) {
  h.mock.__set('users', { data: { id, role, banned, email_verified: verified, ...extra }, error: null });
  return jwt.sign({ id, role, name: 'T' + id }, process.env.JWT_SECRET);
}
const auth = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });

module.exports = { getApp, actor, auth };
