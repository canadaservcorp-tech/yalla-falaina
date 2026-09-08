// lib/yf/matching.js is the core retrieval/scoring engine behind "filter with
// code before the AI ever sees the results" (Section 4.3) — the concierge is
// never shown more than what this file shortlists. DEVIN_BUILD_BRIEF.md notes
// this logic already had a real false-positive bug caught and fixed once
// (stopwords like "to" matching across unrelated listings/queries), and its
// own comments describe deliberate, non-obvious tuning (diacritic stripping,
// a scripted "no passport, no money" fallback bias) that nothing exercised
// directly before this file — every prior touch of this module was
// incidental, through concierge.test.js's hand-built job fixtures.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveJobs, loadJobs, toPromptJob, tokenize, scoreJob } = require('../lib/yf/matching');

test.beforeEach(() => mock.__reset());

// ---------- tokenize() ----------

test('tokenize() lowercases and strips the stopwords that caused the original false positives', () => {
  // The exact case DEVIN_BUILD_BRIEF.md references: "to" overlapping between
  // "Egypt to Jordan" (a job) and "no money to travel" (a query) must not
  // itself count as a match once both are tokenized.
  assert.deepEqual(tokenize('Egypt to Jordan'), ['egypt', 'jordan']);
  assert.deepEqual(tokenize('no money to travel'), ['money', 'travel']);
  assert.ok(!tokenize('Egypt to Jordan').some(t => tokenize('no money to travel').includes(t)),
    'a shared stopword must never make these two phrases look related');
});

test('tokenize() strips diacritics for looser matching', () => {
  assert.deepEqual(tokenize('café Montréal'), ['cafe', 'montreal']);
});

test('tokenize() keeps Arabic content words as their own tokens (Arabic stopwords are deliberately NOT filtered)', () => {
  assert.deepEqual(tokenize('مهندس مدني في بيروت'), ['مهندس', 'مدني', 'في', 'بيروت']);
});

test('tokenize() never throws on empty/null/undefined input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

// ---------- scoreJob() ----------

test('scoreJob() counts one point per distinct query token found in title/category/country/city/keywords', () => {
  const job = { title: 'Line cook', category: 'restaurant', country: 'Lebanon', city: 'Beirut', keywords: ['kitchen', 'urgent'] };
  assert.equal(scoreJob(job, tokenize('urgent kitchen cook needed')), 3); // cook, kitchen, urgent
  assert.equal(scoreJob(job, tokenize('warehouse forklift')), 0);
});

test('scoreJob() is stopword-blind on both sides — shared function words never inflate the score', () => {
  const job = { title: 'Driver to Amman', category: '', country: '', city: '', keywords: [] };
  assert.equal(scoreJob(job, tokenize('a job to relocate')), 0); // only "to" overlaps, and it's filtered
});

// ---------- toPromptJob() ----------

test('toPromptJob() maps a jobs row to the prompt/UI shape, falling back into raw for provider-supplied fields', () => {
  const row = {
    id: 'j1', title: 'Cook', employer: null, country: 'Lebanon', city: 'Beirut',
    category: 'food service', requirements: '2 years experience', salary_note: '$800/mo',
    track: 'zone-local', source_type: 'informal_unverified', external_source: 'informal_submission',
    source_url: '', raw: { employer: 'Beirut Diner', sourceLabel: 'Community post', honestyFlags: ['unverified_employer'], keywords: ['diner'] },
  };
  const out = toPromptJob(row);
  assert.equal(out.employer, 'Beirut Diner'); // falls back to raw.employer when the column is null
  assert.equal(out.sourceLabel, 'Community post'); // falls back to raw.sourceLabel over external_source
  assert.deepEqual(out.honestyFlags, ['unverified_employer']);
  assert.deepEqual(out.keywords, ['diner']);
  assert.equal(out.url, '');
});

test('toPromptJob() never throws when `raw` is missing entirely', () => {
  const row = { id: 'j2', title: 'Driver', country: 'Canada', track: 'demand-led', source_type: 'licensed_feed', external_source: 'adzuna' };
  const out = toPromptJob(row);
  assert.equal(out.employer, '');
  assert.equal(out.sourceLabel, 'adzuna'); // falls back to external_source with no raw.sourceLabel
  assert.deepEqual(out.honestyFlags, []);
});

// ---------- loadJobs() ----------

test('loadJobs() maps every row through toPromptJob()', async () => {
  mock.__set('jobs', { data: [
    { id: 'a', title: 'Cook', country: 'Lebanon', track: 'zone-local', source_type: 'seed', external_source: 'seed' },
  ], error: null });
  const jobs = await loadJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'a');
});

test('loadJobs() fails safe: a DB error is logged and returns an empty list, never throws', async () => {
  mock.__set('jobs', { data: null, error: { message: 'connection refused' } });
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  let jobs;
  try { jobs = await loadJobs(); } finally { console.error = orig; }
  assert.deepEqual(jobs, []);
  assert.ok(logs.some(l => /jobs load/.test(l) && /connection refused/.test(l)));
});

// ---------- retrieveJobs() ----------

const LB_COOK = { id: '1', title: 'Line cook', category: 'restaurant', country: 'Lebanon', city: 'Beirut', track: 'zone-local', keywords: [] };
const QC_DRIVER = { id: '2', title: 'Delivery driver', category: 'logistics', country: 'Canada', city: 'Laval', track: 'demand-led', keywords: [] };
const QA_COOK = { id: '3', title: 'Line cook', category: 'restaurant', country: 'Qatar', city: 'Doha', track: 'zone-corridor', keywords: [] };

function setJobs(rows) { mock.__set('jobs', { data: rows, error: null }); }

test('retrieveJobs() ranks by keyword overlap and respects `limit`', async () => {
  setJobs([LB_COOK, QC_DRIVER, QA_COOK]);
  const results = await retrieveJobs({ query: 'looking for a cook job', limit: 1 });
  assert.equal(results.length, 1);
  assert.ok(['1', '3'].includes(results[0].id)); // one of the two cook listings, not the driver
});

test('retrieveJobs() weights (never filters) toward a stated preferred country', async () => {
  setJobs([LB_COOK, QA_COOK]); // both "line cook", tied on keyword score
  const results = await retrieveJobs({ query: 'cook', preferredCountry: 'Qatar', limit: 2 });
  assert.equal(results[0].id, '3', 'the Qatar listing should outrank the tied Lebanon one');
  assert.equal(results.length, 2, 'the non-preferred country must still be returned, not filtered out');
});

test('retrieveJobs() preferred-country weighting is case-insensitive', async () => {
  setJobs([LB_COOK, QA_COOK]);
  const results = await retrieveJobs({ query: 'cook', preferredCountry: 'QATAR', limit: 1 });
  assert.equal(results[0].id, '3');
});

test('retrieveJobs() implements the "no passport, no money" pivot: biases toward zone-local/zone-corridor when neither word matches a real listing', async () => {
  setJobs([QC_DRIVER, LB_COOK]); // neither mentions passport or money; QC_DRIVER is demand-led, LB_COOK is zone-local
  const results = await retrieveJobs({ query: 'i have no passport and no money', limit: 2 });
  assert.equal(results[0].id, '1', 'the zone-local listing should be biased ahead of the demand-led one');
});

test('retrieveJobs() falls back to a diverse sample (never an empty list) when nothing scores above zero', async () => {
  setJobs([LB_COOK, QC_DRIVER]);
  const results = await retrieveJobs({ query: 'xyzzy nonsense query', limit: 5 });
  assert.equal(results.length, 2, 'with no real matches, the concierge should still get something real to lead with');
});

test('retrieveJobs() returns an empty list when there are no candidate jobs at all', async () => {
  setJobs([]);
  const results = await retrieveJobs({ query: 'cook', limit: 5 });
  assert.deepEqual(results, []);
});
