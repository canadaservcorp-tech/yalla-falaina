// lib/yf/accommodationMatching.js -- couch-surfing/roommate/sublet board
// retrieval, same city/country directory-lookup shape as community groups.
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveAccommodationListings } = require('../lib/yf/accommodationMatching');

test.beforeEach(() => mock.__reset());

test('with no country given, no query runs and an empty list comes back', async () => {
  assert.deepEqual(await retrieveAccommodationListings({}), []);
});

test('a city match sorts before a different-city listing in the same country', async () => {
  mock.__set('accommodation_listings', {
    data: [
      { id: '1', type: 'roommate', country: 'UAE', city: 'Abu Dhabi', budget_note: '$400/mo', description: 'Shared flat', contact: 'whatsapp +971...', expires_at: null },
      { id: '2', type: 'couchsurf', country: 'UAE', city: 'Dubai', budget_note: 'free', description: 'Spare room for a week', contact: 'whatsapp +971...', expires_at: null },
    ],
    error: null,
  });
  const results = await retrieveAccommodationListings({ country: 'UAE', city: 'Dubai', limit: 5 });
  assert.equal(results.length, 2);
  assert.equal(results[0].city, 'Dubai');
  assert.equal(results[1].city, 'Abu Dhabi');
});

test('the prompt shape carries the raw contact through, unmodified, for the "verify independently" caution to attach to', async () => {
  mock.__set('accommodation_listings', {
    data: [{ id: '1', type: 'sublet', country: 'Canada', city: 'Toronto', budget_note: '$900/mo', description: 'Sublet June-Aug', contact: 'email a@example.com', expires_at: null }],
    error: null,
  });
  const [listing] = await retrieveAccommodationListings({ country: 'Canada', city: 'Toronto' });
  assert.equal(listing.contact, 'email a@example.com');
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('accommodation_listings', { data: null, error: { message: 'connection reset' } });
  assert.deepEqual(await retrieveAccommodationListings({ country: 'Canada' }), []);
});
