// lib/prohibited-categories.js is the Section 6.6 legal-safety gate: it's
// what routes/informal-listings.js checks before a submission is even
// stored, and what routes/admin-informal-listings.js re-checks before an
// approval becomes a live job. Despite gating what can become a live
// listing, nothing exercised it before this file.
//
// It's a deliberately crude, documented-as-such filter (its own file
// comment: "a first filter against obvious abuse, not full moderation
// coverage" — a human still reviews everything that gets past it). These
// tests pin down its actual behavior, including the tradeoffs that
// design implies, rather than asserting a stricter behavior it never
// claimed to have.
const { test } = require('node:test');
const assert = require('node:assert');
const { isProhibited, KEYWORDS } = require('../lib/prohibited-categories');

test('KEYWORDS is a non-empty list covering both prohibited categories the Terms name', () => {
  assert.ok(Array.isArray(KEYWORDS));
  assert.ok(KEYWORDS.length > 0);
  assert.ok(KEYWORDS.some(k => /escort|sex|strip|erotic|onlyfans|sugar/.test(k)), 'sexual-services keywords present');
  assert.ok(KEYWORDS.some(k => /drug|traffick/.test(k)), 'drug-dealing keywords present');
});

test('a keyword in the title alone is caught', () => {
  assert.equal(isProhibited('Escort needed for events', null, null), true);
});

test('a keyword in the category alone is caught', () => {
  assert.equal(isProhibited('Weekend help', 'onlyfans promotion', null), true);
});

test('a keyword in the description alone is caught', () => {
  assert.equal(isProhibited('Weekend help', null, 'Looking for someone to sell drugs on the side'), true);
});

test('matching is case-insensitive', () => {
  assert.equal(isProhibited('ESCORT Needed', null, null), true);
  assert.equal(isProhibited('Sugar Daddy wanted', null, null), true);
});

test('every listed keyword is individually detected when present on its own', () => {
  for (const k of KEYWORDS) {
    assert.equal(isProhibited(k, null, null), true, `expected "${k}" to be caught`);
  }
});

test('a straightforward, ordinary job listing is not flagged', () => {
  assert.equal(isProhibited('Electrician needed', 'trades', 'Rewire a two-bedroom apartment, must have own tools'), false);
  assert.equal(isProhibited('Shawarma master needed', 'food service', 'Urgent, start this week'), false);
  assert.equal(isProhibited('Nanny for two kids', 'childcare', 'Weekday afternoons, references required'), false);
});

test('null, undefined, and empty-string fields are all safely ignored, not crashed on', () => {
  assert.equal(isProhibited(null, undefined, ''), false);
  assert.equal(isProhibited(), false);
  assert.equal(isProhibited('Cleaner wanted', undefined, null), false);
});

test('fields are joined with a space before matching, so a phrase can span the boundary between two fields', () => {
  // Documents the join behavior in lib/prohibited-categories.js
  // (`fields.filter(Boolean).join(' ')`) rather than asserting it should be
  // different — a two-word keyword phrase can be accidentally completed by
  // adjacent field values that individually look innocuous.
  assert.equal(isProhibited('Sugar', 'daddy wanted', null), true);
  // The same mechanism means an incomplete phrase split awkwardly across
  // fields, with nothing bridging the gap, is NOT caught — this is a plain
  // substring filter, not phrase-aware NLP (the file's own stated limit).
  assert.equal(isProhibited('Sugar', null, 'wanted, no daddy issues'), false);
});

test('a benign phrase that happens to contain a keyword phrase as a literal substring is still flagged — a known false-positive tradeoff of plain substring matching, not something this filter tries to avoid', () => {
  // "sell coke" is meant to catch cocaine dealing, but it's also a literal
  // substring of "sell cokes" (soda). This isn't asserting desired behavior,
  // just documenting the actual tradeoff of the crude-keyword-guard design
  // the file's own comment already owns up to — worth knowing about since a
  // false positive here hard-rejects a submission before any human sees it
  // (routes/informal-listings.js returns 403 without ever storing the row).
  assert.equal(isProhibited('Kiosk staff needed', 'retail', 'We sell cokes and snacks at the stadium'), true);
});

test('the admin re-check and the public submission gate use the exact same function', () => {
  // Both routes/informal-listings.js and routes/admin-informal-listings.js
  // import isProhibited from this module rather than each keeping their own
  // copy — a keyword list update in one place protects both call sites,
  // including the admin one, which exists specifically because "the keyword
  // list may have grown since this was submitted" (that route's own comment).
  const fs = require('fs');
  const path = require('path');
  const submitRoute = fs.readFileSync(path.join(__dirname, '../routes/informal-listings.js'), 'utf8');
  const adminRoute = fs.readFileSync(path.join(__dirname, '../routes/admin-informal-listings.js'), 'utf8');
  assert.match(submitRoute, /require\(['"]\.\.\/lib\/prohibited-categories['"]\)/);
  assert.match(adminRoute, /require\(['"]\.\.\/lib\/prohibited-categories['"]\)/);
});
