// lib/yf/partnerMatching.js -- trusted-partner referrals, reading the
// existing b2b_partners table. The licence_verified/status filtering happens
// in the query itself (Postgres enforces it in production, same as jobs'
// status='active' filter — test/matching.test.js doesn't re-test that either
// since the mock DB is a passthrough); what's tested here is the JS-side
// country-priority ordering and row shaping.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveTrustedPartners } = require('../lib/yf/partnerMatching');

test.beforeEach(() => mock.__reset());

test('a partner serving the destination country sorts before a general one', async () => {
  mock.__set('b2b_partners', {
    data: [
      { id: 'a', company_name: 'General Immigration Co', contact_email: 'a@x.com', contact_phone: null, licence_number: 'L1', category: 'immigration_consultant', countries_served: ['France'], listing_tier: 'basic' },
      { id: 'b', company_name: 'Canada Immigration Experts', contact_email: 'b@x.com', contact_phone: '+1...', licence_number: 'L2', category: 'immigration_consultant', countries_served: ['Canada', 'USA'], listing_tier: 'premium' },
    ],
    error: null,
  });
  const results = await retrieveTrustedPartners({ country: 'Canada', limit: 3 });
  assert.equal(results.length, 2);
  assert.equal(results[0].companyName, 'Canada Immigration Experts');
  assert.equal(results[1].companyName, 'General Immigration Co');
});

test('with no country given, results come back as-is up to the limit', async () => {
  mock.__set('b2b_partners', {
    data: [{ id: 'a', company_name: 'Any Agency', contact_email: 'a@x.com', contact_phone: null, licence_number: 'L1', category: 'travel_agency', countries_served: [], listing_tier: 'basic' }],
    error: null,
  });
  const results = await retrieveTrustedPartners({ limit: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].category, 'travel_agency');
});

test('a partner with no countries_served array does not throw and sorts as general', async () => {
  mock.__set('b2b_partners', {
    data: [{ id: 'a', company_name: 'No Countries Listed', contact_email: 'a@x.com', contact_phone: null, licence_number: null, category: null, countries_served: null, listing_tier: null }],
    error: null,
  });
  const results = await retrieveTrustedPartners({ country: 'Canada' });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].countriesServed, []);
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('b2b_partners', { data: null, error: { message: 'connection reset' } });
  assert.deepEqual(await retrieveTrustedPartners({ country: 'Canada' }), []);
});
