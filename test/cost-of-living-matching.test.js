// lib/yf/costOfLivingMatching.js -- admin-curated cost-of-living notes, same
// "specific city first, country-wide fallback" pattern as communityMatching.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveCostOfLiving } = require('../lib/yf/costOfLivingMatching');

test.beforeEach(() => mock.__reset());

test('with no country given, no query runs and an empty list comes back', async () => {
  const results = await retrieveCostOfLiving({});
  assert.deepEqual(results, []);
  assert.equal(mock.__writes().length, 0);
});

test('a city match is prioritized over a country-wide note, which is prioritized over a different-city note', async () => {
  mock.__set('cost_of_living_notes', {
    data: [
      { id: '1', country: 'Canada', city: 'Vancouver', category: 'overall', monthly_estimate_note: '$2,000-2,600 CAD/month', source_url: null, updated_at: '2026-01-01T00:00:00Z' },
      { id: '2', country: 'Canada', city: null, category: 'overall', monthly_estimate_note: '$1,500-2,200 CAD/month, national average', source_url: null, updated_at: '2026-01-01T00:00:00Z' },
      { id: '3', country: 'Canada', city: 'Montreal', category: 'overall', monthly_estimate_note: '$1,200-1,800 CAD/month including rent, student budget', source_url: 'https://example.gov/col', updated_at: '2026-01-02T00:00:00Z' },
    ],
    error: null,
  });
  const results = await retrieveCostOfLiving({ country: 'Canada', city: 'Montreal', limit: 5 });
  assert.equal(results.length, 3);
  assert.match(results[0].monthlyEstimateNote, /1,200-1,800/); // exact city match first
  assert.match(results[1].monthlyEstimateNote, /national average/); // country-wide fallback next
  assert.match(results[2].monthlyEstimateNote, /2,000-2,600/); // a different city last
});

test('a curated note is shaped for the prompt, including its source URL', () => {
  const { toPromptCostNote } = require('../lib/yf/costOfLivingMatching');
  const shaped = toPromptCostNote({
    id: '1', country: 'Qatar', city: 'Doha', category: 'rent',
    monthly_estimate_note: '$900-1,400 USD/month for a studio', source_url: 'https://example.com/qatar-rent',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(shaped.category, 'rent');
  assert.equal(shaped.city, 'Doha');
  assert.match(shaped.monthlyEstimateNote, /900-1,400/);
  assert.equal(shaped.sourceUrl, 'https://example.com/qatar-rent');
});

test('with no city given, results are returned as-is up to the limit', async () => {
  mock.__set('cost_of_living_notes', {
    data: [{ id: '1', country: 'Turkey', city: null, category: 'overall', monthly_estimate_note: '$600-900 USD/month', source_url: null, updated_at: '2026-01-01T00:00:00Z' }],
    error: null,
  });
  const results = await retrieveCostOfLiving({ country: 'Turkey', limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0].category, 'overall');
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('cost_of_living_notes', { data: null, error: { message: 'connection reset' } });
  const results = await retrieveCostOfLiving({ country: 'Canada' });
  assert.deepEqual(results, []);
});
