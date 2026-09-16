// lib/yf/riskMatching.js -- curated country-risk notes.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveCountryRisks } = require('../lib/yf/riskMatching');

test.beforeEach(() => mock.__reset());

test('with no country given, no query runs and an empty list comes back', async () => {
  assert.deepEqual(await retrieveCountryRisks({}), []);
});

test('a curated note is shaped for the prompt', async () => {
  mock.__set('country_risk_notes', {
    data: [{ id: '1', country: 'Lebanon', category: 'scam_prevalence', risk_level: 'high', summary: 'Fake "guaranteed visa" offers requiring upfront payment are common.', source_url: 'https://example.gov/advisory', updated_at: '2026-01-01T00:00:00Z' }],
    error: null,
  });
  const [risk] = await retrieveCountryRisks({ country: 'Lebanon' });
  assert.equal(risk.category, 'scam_prevalence');
  assert.equal(risk.riskLevel, 'high');
  assert.match(risk.summary, /guaranteed visa/);
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('country_risk_notes', { data: null, error: { message: 'connection reset' } });
  assert.deepEqual(await retrieveCountryRisks({ country: 'Lebanon' }), []);
});
