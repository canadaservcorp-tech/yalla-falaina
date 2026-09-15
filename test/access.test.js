// lib/access.js — the single source of truth for "does this account currently
// have paid-tier access," now that a referral bonus (users.bonus_access_until)
// is a second way to get there alongside a real subscription_status='active'
// row. Pure functions, no request/db needed — every real gate that consumes
// this (routes/concierge.js, routes/cv.js, routes/voice.js,
// routes/subscription.js's /status) is covered at the route level in their
// own test files instead of re-deriving these truth tables there.
const { test } = require('node:test');
const assert = require('node:assert');
const access = require('../lib/access');

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// ---------- bonusActive ----------

test('bonusActive: true only when bonus_access_until is set and still in the future', () => {
  assert.equal(access.bonusActive({ bonus_access_until: FUTURE }), true);
  assert.equal(access.bonusActive({ bonus_access_until: PAST }), false);
  assert.equal(access.bonusActive({ bonus_access_until: null }), false);
  assert.equal(access.bonusActive({}), false);
  assert.equal(access.bonusActive(null), false);
});

test('bonusActive respects an injected "now" rather than always using the real clock', () => {
  const until = '2026-06-15T00:00:00Z';
  assert.equal(access.bonusActive({ bonus_access_until: until }, new Date('2026-06-01T00:00:00Z')), true);
  assert.equal(access.bonusActive({ bonus_access_until: until }, new Date('2026-07-01T00:00:00Z')), false);
});

// ---------- hasAccess ----------

test('hasAccess: a real active subscription grants access with no bonus at all', () => {
  assert.equal(access.hasAccess({ subscription_status: 'active', bonus_access_until: null }), true);
});

test('hasAccess: a live bonus grants access with no real subscription at all', () => {
  assert.equal(access.hasAccess({ subscription_status: 'inactive', bonus_access_until: FUTURE }), true);
  assert.equal(access.hasAccess({ subscription_status: 'canceled', bonus_access_until: FUTURE }), true);
});

test('hasAccess: an expired bonus and no real subscription is no access', () => {
  assert.equal(access.hasAccess({ subscription_status: 'inactive', bonus_access_until: PAST }), false);
});

test('hasAccess: no user at all is no access', () => {
  assert.equal(access.hasAccess(null), false);
  assert.equal(access.hasAccess(undefined), false);
});

// ---------- effectiveTier ----------

test('effectiveTier: a real active subscription reports its own subscription_tier', () => {
  assert.equal(access.effectiveTier({ subscription_status: 'active', subscription_tier: 'basic' }), 'basic');
});

test('effectiveTier: a real active subscription with no tier column set still reports basic (Phase 1 has one paid tier)', () => {
  assert.equal(access.effectiveTier({ subscription_status: 'active', subscription_tier: null }), 'basic');
});

test('effectiveTier: a live bonus with no real subscription reports basic', () => {
  assert.equal(access.effectiveTier({ subscription_status: 'inactive', subscription_tier: 'none', bonus_access_until: FUTURE }), 'basic');
});

test('effectiveTier: neither a real subscription nor a live bonus reports none', () => {
  assert.equal(access.effectiveTier({ subscription_status: 'inactive', subscription_tier: 'none', bonus_access_until: PAST }), 'none');
  assert.equal(access.effectiveTier({ subscription_status: 'canceled' }), 'none');
  assert.equal(access.effectiveTier(null), 'none');
});
