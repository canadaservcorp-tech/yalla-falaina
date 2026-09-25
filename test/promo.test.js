// lib/promo.js + the signup grant: every new account created while the
// launch offer runs gets 3 free months of full access (bonus_access_until),
// counted from signup day; the offer stops granting to new accounts after
// Dec 31 2026. Hicham's request: "free for 3 months before subscription is
// obligatory, to increase traffic; new users' 3 months count from day one
// of subscription until end of December 2026."
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const promo = require('../lib/promo');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const DAY = 24 * 3600 * 1000;

test('promoActive() is true now and false after PROMO_END (2026-12-31)', () => {
  assert.equal(promo.promoActive(), true);
  assert.equal(promo.promoActive(new Date('2026-12-31T23:59:59Z')), true);
  assert.equal(promo.promoActive(new Date('2027-01-01T00:00:01Z')), false);
});

test('promoBonusUntil() counts 3 months from the grant day', () => {
  const before = Date.now();
  const until = new Date(promo.promoBonusUntil()).getTime();
  const after2 = Date.now();
  // ~3 calendar months out (89-93 days depending on the month lengths)
  assert.ok(until > before + 80 * DAY && until <= after2 + 95 * DAY, `expected ~3 months out, got ${new Date(until).toISOString()}`);
});

const register = () => fetch(h.base + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `promo${Date.now()}-${Math.random()}@example.invalid`, password: 'longenoughpw1',
    name: 'P', acceptTerms: true, confirmAge: true,
  }),
});

test('a new signup while the offer runs is granted bonus_access_until ~3 months out', async () => {
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null });
  h.mock.__setOp('users', 'insert', { data: { id: 77, role: 'seeker' }, error: null });
  assert.equal((await register()).status, 200);
  const insert = h.mock.__writes('users', 'insert').slice(-1)[0].payload;
  const until = new Date(insert.bonus_access_until).getTime();
  assert.ok(until > Date.now() + 80 * DAY, `grant should be ~3 months out, got ${insert.bonus_access_until}`);
});
