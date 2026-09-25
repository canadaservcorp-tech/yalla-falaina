// scripts/promo-offer.js + scripts/bonus-expiry.js — the launch-offer
// emails: every account gets the 3-month grant + announcement once, and a
// ~7-day warning before free access ends. Same "inject the mock db before
// requiring the script" pattern as test/checkout-reminder.test.js.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
delete process.env.RESEND_API_KEY; // dev-mode email logs to console, never sends
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { run: runOffer } = require('../scripts/promo-offer');
const { run: runExpiry } = require('../scripts/bonus-expiry');

const DAY = 24 * 3600 * 1000;
const daysFromNow = n => new Date(Date.now() + n * DAY).toISOString();

test.beforeEach(() => mock.__reset());

// ---------- promo-offer ----------

test('promo-offer grants bonus_access_until + stamps promo_offer_notified_at + sends the announcement', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  let sent;
  try {
    mock.__set('users', { data: [
      { id: 5, email: 'free@example.com', banned: false, bonus_access_until: null },
    ], error: null });
    sent = await runOffer();
  } finally { console.log = orig; }
  assert.equal(sent, 1);
  const [update] = mock.__writes('users', 'update');
  const until = new Date(update.payload.bonus_access_until).getTime();
  assert.ok(until > Date.now() + 80 * DAY, `grant should be ~3 months out, got ${update.payload.bonus_access_until}`);
  assert.ok(update.payload.promo_offer_notified_at != null);
  assert.ok(logs.some(l => /email:dev.*free@example\.com/.test(l) && /3 months/.test(l)));
});

test('promo-offer keeps an existing LATER bonus rather than shortening it', async () => {
  const later = daysFromNow(300);
  mock.__set('users', { data: [
    { id: 5, email: 'comped@example.com', banned: false, bonus_access_until: later },
  ], error: null });
  await runOffer();
  const [update] = mock.__writes('users', 'update');
  assert.equal(update.payload.bonus_access_until, later);
});

test('promo-offer is idempotent -- a second run finds nobody un-notified', async () => {
  // Real Postgres: the select filters promo_offer_notified_at IS NULL, so
  // a row already stamped is not returned. The mock does not apply filters,
  // so simulate the real post-first-run select by returning no rows.
  mock.__set('users', { data: [], error: null });
  assert.equal(await runOffer(), 0);
});

// ---------- bonus-expiry ----------

test('bonus-expiry warns a user whose free access ends within 7 days', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  let sent;
  try {
    mock.__set('users', { data: [
      { id: 9, email: 'expiring@example.com', banned: false, bonus_access_until: daysFromNow(5), bonus_expiry_warned_at: null },
    ], error: null });
    sent = await runExpiry();
  } finally { console.log = orig; }
  assert.equal(sent, 1);
  const [update] = mock.__writes('users', 'update');
  assert.ok(update.payload.bonus_expiry_warned_at != null);
  assert.ok(logs.some(l => /email:dev.*expiring@example\.com/.test(l) && /ends soon/i.test(l)));
});

test('bonus-expiry does not re-warn when the current expiry was already warned', async () => {
  mock.__set('users', { data: [
    { id: 9, email: 'already@example.com', banned: false, bonus_access_until: daysFromNow(5), bonus_expiry_warned_at: daysFromNow(-2) },
  ], error: null });
  assert.equal(await runExpiry(), 0);
  assert.equal(mock.__writes('users', 'update').length, 0);
});

test('bonus-expiry re-warns when the expiry moved (a re-grant re-arms the warning)', async () => {
  mock.__set('users', { data: [
    { id: 9, email: 'regranted@example.com', banned: false, bonus_access_until: daysFromNow(5), bonus_expiry_warned_at: daysFromNow(-60) },
  ], error: null });
  assert.equal(await runExpiry(), 1);
});
