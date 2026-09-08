const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../lib/booking-rules');

test('the deposit is 15% of the quote, clamped to $20-$150', () => {
  assert.equal(R.depositCents(20000), 3000);        // $200 -> $30
  assert.equal(R.depositCents(10000), 2000);        // $100 -> 15$ raised to the $20 floor
  assert.equal(R.depositCents(500), 2000);          // tiny job still owes the floor
  assert.equal(R.depositCents(500000), 15000);      // $5000 -> $750 capped at $150
  assert.equal(R.depositCents(13334), 2000);        // exactly at the floor boundary
  assert.equal(R.depositCents(13400), 2010);        // just above it, the rate takes over
});

test('a hold is only offered inside PayPal 72h honour window', () => {
  const now = Date.now();
  const far = new Date(now + 20 * 24 * 3600 * 1000);
  assert.equal(R.authorizeFrom(far, now).getTime(), far.getTime() - R.AUTH_WINDOW_MS);
  const soon = new Date(now + 3 * 3600 * 1000);
  assert.equal(R.authorizeFrom(soon, now).getTime(), now);   // never in the past
});

test('24h is the free-cancellation cutoff', () => {
  const now = Date.now();
  assert.equal(R.cancelIsLate(new Date(now + 25 * 3600 * 1000), now), false);
  assert.equal(R.cancelIsLate(new Date(now + 23 * 3600 * 1000), now), true);
  assert.equal(R.cancelIsLate(new Date(now - 3600 * 1000), now), true);
});

test('the policy states the computed deposit in both languages', () => {
  const fr = R.policyText('fr', 3000), en = R.policyText('en', 3000);
  assert.match(fr.lines[0], /30\.00 \$ CAD/);
  assert.match(en.lines[0], /\$30\.00 CAD/);
  assert.match(fr.lines[1], /24 h/);
  assert.match(en.lines[2], /no-show/);
  assert.equal(R.policyText('de', 3000).accept, fr.accept);   // unknown locale falls back to French
});
