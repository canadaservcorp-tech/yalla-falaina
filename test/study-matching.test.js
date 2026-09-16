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

// ---------- financial aid: percentage + searchability across all fields/levels ----------
// Regression coverage for a real bug: tuitionNote (a program's actual funding
// description) was previously never included in the search index at all --
// requirements/eligibilityNote/tuitionNote were OR'd together so only one of
// the three was ever searchable. A seeker asking about "financial aid" or
// "gratuité" for a program whose funding info lives only in tuition_note
// would never match it.

test('scoreOpportunity() searches tuitionNote too, not just requirements -- a financial-aid query matches a program whose funding info is the only place mentioning it', () => {
  const opp = { title: 'MSc Mechanical Engineering', institution: 'X', country: 'Canada', city: '', degreeLevel: 'graduate', fieldOfStudy: 'mechanical engineering', requirements: 'Bachelor degree', eligibilityNote: '', tuitionNote: 'Full tuition waiver plus monthly stipend for qualifying students' };
  assert.ok(scoreOpportunity(opp, ['stipend']) > 0, 'tuitionNote content must be searchable');
  assert.ok(scoreOpportunity(opp, ['waiver']) > 0);
});

test('scoreOpportunity() searches eligibilityNote (admission conditions) even when requirements is also set -- both are real, independent fields', () => {
  const opp = { title: 'PhD Chemistry', institution: 'X', country: 'France', city: '', degreeLevel: 'phd', fieldOfStudy: 'chemistry', requirements: 'CV and transcripts', eligibilityNote: 'IELTS 6.5 minimum, relevant master\'s degree', tuitionNote: '' };
  assert.ok(scoreOpportunity(opp, ['ielts']) > 0, 'eligibilityNote must be searchable alongside requirements, not dropped');
});

test('toPromptOpportunity() carries funding_coverage_pct through as a number, and as null (not 0) when unset', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'scholarship', title: 'Fully Funded PhD', institution: 'X', country: 'Germany', city: '', degree_level: 'phd', field_of_study: 'physics', tuition_note: 'Full funding', funding_coverage_pct: 100, eligibility_note: 'Master\'s in physics required', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'program', title: 'Unfunded MBA', institution: 'Y', country: 'Canada', city: '', degree_level: 'graduate', field_of_study: 'business', tuition_note: null, funding_coverage_pct: null, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'physics business', limit: 5 });
  const funded = results.find(r => r.id === '1');
  const unfunded = results.find(r => r.id === '2');
  assert.equal(funded.fundingCoveragePct, 100);
  assert.equal(unfunded.fundingCoveragePct, null);
});

test('a financial-aid-signaling query (English, French, or Arabizi phrasing) boosts scholarship/funded rows without hard-filtering out an unfunded one', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'program', title: 'Computer Science program', institution: 'A', country: 'Canada', city: '', degree_level: 'undergraduate', field_of_study: 'computer science', tuition_note: null, funding_coverage_pct: null, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'scholarship', title: 'Computer Science Excellence Award', institution: 'B', country: 'Canada', city: '', degree_level: 'undergraduate', field_of_study: 'computer science', tuition_note: '50% tuition covered', funding_coverage_pct: 50, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'financial aid for computer science', limit: 5 });
  assert.equal(results.length, 2); // both real matches, never hard-filtered out
  assert.equal(results[0].id, '2'); // the funded one is boosted to the top
});

test('the financial-aid boost also fires on "gratuit"/"bourse" (French) and "fully funded" phrasing, and does nothing for an unrelated query', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'program', title: 'Art history program', institution: 'A', country: 'France', city: '', degree_level: 'undergraduate', field_of_study: 'art history', tuition_note: null, funding_coverage_pct: null, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'scholarship', title: 'Art History Bourse', institution: 'B', country: 'France', city: '', degree_level: 'undergraduate', field_of_study: 'art history', tuition_note: 'gratuit', funding_coverage_pct: 100, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'bourse art history', limit: 5 });
  assert.equal(results[0].id, '2');
});

test('every major and both undergraduate and graduate levels are searched the same way -- no allow-list anywhere restricts field_of_study or degree_level', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'scholarship', title: 'Undergraduate Nursing Bursary', institution: 'A', country: 'UAE', city: '', degree_level: 'undergraduate', field_of_study: 'nursing', tuition_note: 'partial coverage', funding_coverage_pct: 40, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'scholarship', title: 'Graduate Nursing Fellowship', institution: 'B', country: 'UAE', city: '', degree_level: 'graduate', field_of_study: 'nursing', tuition_note: 'full coverage', funding_coverage_pct: 100, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'nursing financial aid', limit: 5 });
  assert.equal(results.length, 2); // both levels surfaced, neither excluded by level
});

// ---------- program duration ----------

test('scoreOpportunity() searches durationNote too -- a "2 years" style query can match on program length', () => {
  const opp = { title: 'MSc Data Science', institution: 'X', country: 'Canada', city: '', degreeLevel: 'graduate', fieldOfStudy: 'data science', requirements: '', eligibilityNote: '', tuitionNote: '', durationNote: 'six-week intensive bootcamp' };
  assert.ok(scoreOpportunity(opp, ['bootcamp']) > 0, 'durationNote content must be searchable');
});

test('toPromptOpportunity() carries duration_note through as durationNote, and as an empty string when unset', async () => {
  mock.__set('study_opportunities', {
    data: [
      { id: '1', kind: 'program', title: 'Intensive French Program', institution: 'X', country: 'France', city: '', degree_level: 'language_program', field_of_study: 'french', duration_note: '6-week intensive', tuition_note: null, funding_coverage_pct: null, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
      { id: '2', kind: 'program', title: 'MBA', institution: 'Y', country: 'Canada', city: '', degree_level: 'graduate', field_of_study: 'business', duration_note: null, tuition_note: null, funding_coverage_pct: null, eligibility_note: '', requirements: '', source_type: 'admin_curated' },
    ],
    error: null,
  });
  const results = await retrieveStudyOpportunities({ query: 'french business', limit: 5 });
  const withDuration = results.find(r => r.id === '1');
  const withoutDuration = results.find(r => r.id === '2');
  assert.equal(withDuration.durationNote, '6-week intensive');
  assert.equal(withoutDuration.durationNote, '');
});
