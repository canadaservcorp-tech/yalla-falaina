// lib/yf/systemPrompt.js is pure text assembly (no network, no DB), so its
// guardrail sections are covered directly here rather than only indirectly
// through test/concierge.test.js's mocked-model requests.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSystemPrompt } = require('../lib/yf/systemPrompt');

const prompt = () => buildSystemPrompt({ jobs: [], dialectHint: null });

test('the concierge is told to decline personal/off-topic questions instead of answering them', () => {
  const p = prompt();
  assert.match(p, /STAYING IN SCOPE/);
  assert.match(p, /do not attempt to answer it, not even partially/);
  // the actual scope it must redirect to, per Hicham's wording (Sept 2026)
  for (const phrase of ['building', 'resume', 'finding', 'real job', 'process stands', 'onboard', 'travel documents', 'speeding up']) {
    assert.match(p, new RegExp(phrase, 'i'), `expected the in-scope description to mention "${phrase}"`);
  }
});

test('the scope guardrail explicitly carves out CV/job/visa/platform questions as still in scope', () => {
  const p = prompt();
  assert.match(p, /does NOT apply to questions about the user's CV, their job search, their visa or travel-document process/);
});

test('the scope guardrail sits alongside the age gate, not buried after the job-matching rules', () => {
  const p = prompt();
  const ageGateAt = p.indexOf('=== AGE GATE ===');
  const scopeAt = p.indexOf('=== STAYING IN SCOPE');
  const jobFactsAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: JOB FACTS ===');
  assert.ok(ageGateAt > -1 && scopeAt > -1 && jobFactsAt > -1);
  assert.ok(ageGateAt < scopeAt && scopeAt < jobFactsAt, 'expected AGE GATE, then STAYING IN SCOPE, then the job-facts rules');
});
