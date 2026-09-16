// lib/yf/medicalMatching.js -- the medical-treatment/travel vertical's
// retrieval: the seeker's own latest intake request, and curated hospitals
// scored against it.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveMedicalIntake, retrieveMedicalProviders, scoreProvider } = require('../lib/yf/medicalMatching');

test.beforeEach(() => mock.__reset());

// ---------- retrieveMedicalIntake ----------

test('with no profileId given, no query runs and null comes back', async () => {
  assert.equal(await retrieveMedicalIntake({}), null);
});

test('the most recent intake request is shaped for the prompt', async () => {
  mock.__set('medical_intake_requests', {
    data: { id: 'm1', required_treatment: 'total hip replacement', medical_history_note: 'osteoarthritis, right hip', extracted_report_text: 'X-ray shows severe joint degeneration', status: 'pending' },
    error: null,
  });
  const intake = await retrieveMedicalIntake({ profileId: 42 });
  assert.equal(intake.requiredTreatment, 'total hip replacement');
  assert.equal(intake.medicalHistoryNote, 'osteoarthritis, right hip');
  assert.match(intake.extractedReportText, /joint degeneration/);
});

test('no intake request on file resolves to null, not an error', async () => {
  mock.__set('medical_intake_requests', { data: null, error: null });
  assert.equal(await retrieveMedicalIntake({ profileId: 42 }), null);
});

test('a DB error on intake load resolves to null rather than throwing', async () => {
  mock.__set('medical_intake_requests', { data: null, error: { message: 'connection reset' } });
  assert.equal(await retrieveMedicalIntake({ profileId: 42 }), null);
});

// ---------- retrieveMedicalProviders ----------

test('scoreProvider() counts one point per distinct query token found across hospital name/country/city/specialties', () => {
  const provider = { hospitalName: 'CIMEQ', country: 'Cuba', city: 'Havana', specialties: 'cardiac surgery, orthopedic hip and knee replacement' };
  assert.equal(scoreProvider(provider, ['hip', 'replacement', 'havana']), 3);
  assert.equal(scoreProvider(provider, ['dental', 'cosmetic']), 0);
});

test('with an empty query, no provider is returned even if providers exist', async () => {
  mock.__set('medical_treatment_providers', {
    data: [{ id: '1', country: 'Cuba', city: 'Havana', hospital_name: 'CIMEQ', specialties: 'orthopedics', price_range_note: null, contact_email: null, contact_phone: null, source_url: null }],
    error: null,
  });
  assert.deepEqual(await retrieveMedicalProviders({ query: '' }), []);
});

test('a curated provider matching the query is returned, shaped for the prompt', async () => {
  mock.__set('medical_treatment_providers', {
    data: [{ id: '1', country: 'Cuba', city: 'Havana', hospital_name: 'CIMEQ', specialties: 'orthopedic hip and knee replacement', price_range_note: '$9,000-12,000 USD for a hip replacement, published self-pay rate', contact_email: 'intl@cimeq.example', contact_phone: '+53...', source_url: 'https://example.com/cimeq' }],
    error: null,
  });
  const results = await retrieveMedicalProviders({ query: 'total hip replacement' });
  assert.equal(results.length, 1);
  assert.equal(results[0].hospitalName, 'CIMEQ');
  assert.equal(results[0].country, 'Cuba');
  assert.match(results[0].priceRangeNote, /9,000-12,000/);
  assert.equal(results[0].contactEmail, 'intl@cimeq.example');
});

test('a provider that does not match the stated treatment is never returned as a fallback -- unlike study matching, an irrelevant hospital is actively misleading here', async () => {
  mock.__set('medical_treatment_providers', {
    data: [{ id: '1', country: 'Turkey', city: 'Istanbul', hospital_name: 'Istanbul Dental Center', specialties: 'cosmetic dentistry, veneers', price_range_note: null, contact_email: null, contact_phone: null, source_url: null }],
    error: null,
  });
  const results = await retrieveMedicalProviders({ query: 'kidney transplant' });
  assert.deepEqual(results, []);
});

test('results are never weighted or filtered by a preferred country -- Cuba/Korea/Russia surface exactly like any other real match', async () => {
  mock.__set('medical_treatment_providers', {
    data: [
      { id: '1', country: 'Canada', city: 'Montreal', hospital_name: 'Montreal General', specialties: 'cardiac surgery, valve replacement', price_range_note: '$45,000-60,000 CAD, published estimate', contact_email: null, contact_phone: null, source_url: null },
      { id: '2', country: 'South Korea', city: 'Seoul', hospital_name: 'Seoul National University Hospital', specialties: 'cardiac surgery, valve replacement', price_range_note: '$12,000-18,000 USD, published international-patient rate', contact_email: 'intl@snuh.example', contact_phone: null, source_url: null },
    ],
    error: null,
  });
  const results = await retrieveMedicalProviders({ query: 'heart valve replacement surgery' });
  assert.equal(results.length, 2); // both real matches, no country weighting or filtering
  const countries = results.map(r => r.country);
  assert.ok(countries.includes('South Korea'));
  assert.ok(countries.includes('Canada'));
});

test('a DB error on provider load resolves to an empty list rather than throwing', async () => {
  mock.__set('medical_treatment_providers', { data: null, error: { message: 'connection reset' } });
  assert.deepEqual(await retrieveMedicalProviders({ query: 'hip replacement' }), []);
});
