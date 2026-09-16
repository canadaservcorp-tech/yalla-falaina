// lib/yf/studyMatching.js -- the international-students retrieval/scoring
// engine, same "code decides the candidate set" discipline as
// lib/yf/matching.js's job retrieval (test/matching.test.js).
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveStudyOpportunities, scoreOpportunity } = require('../lib/yf/studyMatching');

test.beforeEach(() => mock.__reset());

test('scoreOpportunity() counts one point per distinct query token found across title/institution/country/city/degree/field/requirements', () => {
  const opp = { title: 'MSc Computer Science', institution: 'University of Toronto', country: 'Canada', city: 'Toronto', degreeLevel: 'graduate', fieldOfStudy: 'computer science', requirements: 'Bachelor degree required' };
  assert.equal(scoreOpportunity(opp, ['computer', 'science', 'toronto']), 3);
  assert.equal(scoreOpportunity(opp, ['welding', 'forklift']), 0);
});

test('retrieveStudyOpportunities() only returns active, non-expired rows shaped for the prompt', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'scholarship', title: 'Fully-funded Master\'s Scholarship', institution: 'McGill', country: 'Canada', city: 'Montreal', degree_level: 'graduate', field_of_study: 'engineering', language: 'en', tuition_note: null, eligibility_note: 'GPA 3.0+', deadline: '2027-01-01', requirements: 'engineering background', source_type: 'admin_curated', source_url: 'https://mcgill.ca/scholarship' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'engineering scholarship', limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0].institution, 'McGill');
  assert.equal(results[0].kind, 'scholarship');
  assert.equal(results[0].url, 'https://mcgill.ca/scholarship');
});

test('retrieveStudyOpportunities() weights toward a stated destination country and degree level without hard-filtering others out', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'program', title: 'Business program', institution: 'A', country: 'Canada', city: '', degree_level: 'undergraduate', field_of_study: 'business', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'program', title: 'Business program', institution: 'B', country: 'Qatar', city: '', degree_level: 'undergraduate', field_of_study: 'business', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'business program', preferredCountry: 'Canada', limit: 5 });
  assert.equal(results.length, 2); // both real matches, never hard-filtered
  assert.equal(results[0].country, 'Canada'); // weighted first
});

test('retrieveStudyOpportunities() falls back to a diverse sample rather than an empty list when nothing scores', async () => {
  mock.__set('study_opportunities', {
    data: [{ id: '1', kind: 'program', title: 'Unrelated program', institution: 'X', country: 'France', city: '', degree_level: 'undergraduate', field_of_study: 'art', requirements: '', source_type: 'admin_curated' }],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'nuclear physics doctorate', limit: 5 });
  assert.equal(results.length, 1);
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('study_opportunities', { data: null, error: { message: 'connection reset' } });
  const results = await retrieveStudyOpportunities({ query: 'anything' });
  assert.deepEqual(results, []);
});
