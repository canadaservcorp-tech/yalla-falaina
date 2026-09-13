// routes/concierge.js's splitSentences/scrubFalseClaims/demoJob are pure
// functions exported specifically for direct testing (see that file's own
// module.exports comment) — these tests exercise them at the sentence and
// field level, rather than only indirectly through a mocked model turn.
//
// Regression coverage for three live-test findings fixed together:
//   - "scrub text mutilation": splitSentences() silently dropped characters
//     (numbered-list markers, decimals, leading ellipses) whenever the scrub
//     actually stripped a different sentence elsewhere in the same reply.
//   - "feed-claim on completion turn": covered in test/concierge.test.js
//     (jobsRetrieved), not here — that one is a response-shape/route
//     behavior, not a pure-function bug.
//   - "seed jobs presented as real": demoJob() redacts fixture/placeholder
//     listings so they can never be described or shown as a real opening.
const test = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const { splitSentences, scrubFalseClaims, demoJob } = require('../routes/concierge');

// ---------- splitSentences: no character may ever be lost ----------

test('splitSentences() reconstructs the original text exactly, whatever punctuation it splits on', () => {
  const cases = [
    'Hello world. How are you?',
    'Wait... okay.',
    '...actually, yes.',
    '1. First point. 2. Second point.',
    '3.5 kg is enough.',
    'No punctuation at all',
    'Ends with ellipsis...',
    '',
    'One! Two? Three.',
    'مرحبا. كيف حالك؟',
  ];
  for (const text of cases) {
    const rebuilt = splitSentences(text).join('');
    assert.equal(rebuilt, text, `lost or altered characters splitting: ${JSON.stringify(text)}`);
  }
});

test('splitSentences() still splits on ordinary sentence boundaries', () => {
  const parts = splitSentences('First sentence. Second sentence.');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].trim(), 'First sentence.');
  assert.equal(parts[1].trim(), 'Second sentence.');
});

// ---------- scrubFalseClaims: the mutilation regression, end to end ----------

test('scrubFalseClaims() strips a false claim without eating a numbered-list marker or a decimal number elsewhere in the reply', () => {
  const reply = '1. Your background sounds great.\n' +
    'I checked the job feed already and there is nothing yet.\n' +
    '3.5 years of experience is plenty.';
  const cleaned = scrubFalseClaims(reply, false);
  assert.doesNotMatch(cleaned, /checked the job feed/i);
  assert.match(cleaned, /^1\. Your background sounds great/, 'the leading "1." marker must survive');
  assert.match(cleaned, /3\.5 years of experience/, 'the decimal "3.5" must survive intact');
});

test('scrubFalseClaims() returns the exact same string, unchanged, when nothing needs stripping', () => {
  const reply = 'Great, tell me about your work history. 1. Where did you work last? 2. For how long?';
  assert.equal(scrubFalseClaims(reply, false), reply);
});

test('scrubFalseClaims() falls back to a plain continuation line only when the WHOLE reply was a false claim', () => {
  const reply = 'I checked the job feed already and there is nothing yet.';
  const cleaned = scrubFalseClaims(reply, false);
  assert.doesNotMatch(cleaned, /checked the job feed/i);
  assert.ok(cleaned.trim().length > 0);
});

// ---------- demoJob: seed/fixture data must never carry real-looking fields ----------

test('demoJob() redacts every field that would let a fixture listing be acted on as if it were real', () => {
  const seed = {
    id: 1, title: 'Electrician', employer: 'Real-Sounding Co', country: 'Canada', city: 'Laval',
    category: 'trades', track: 'western', salaryNote: '50000-65000', sourceType: 'seed_demo',
    sourceLabel: 'Seed Feed', url: 'https://example.test/1', honestyFlags: ['too_good_to_be_true'],
  };
  const redacted = demoJob(seed);
  assert.equal(redacted.demo, true);
  assert.equal(redacted.url, '');
  assert.equal(redacted.honestyFlags.length, 0);
  assert.equal(redacted.salaryNote, null);
  assert.doesNotMatch(redacted.employer, /Real-Sounding Co/);
  assert.doesNotMatch(redacted.requirements, /Real-Sounding Co/);
  assert.doesNotMatch(redacted.sourceLabel, /Seed Feed/);
  assert.equal(redacted.url, '', 'no application/contact path may survive');
  // Title/location/category/track are kept -- they aren't what makes a
  // listing actionable, and keeping them lets the UI still show something.
  assert.equal(redacted.title, 'Electrician');
  assert.equal(redacted.city, 'Laval');
  assert.equal(redacted.country, 'Canada');
  assert.equal(redacted.sourceType, 'seed_demo');
});
