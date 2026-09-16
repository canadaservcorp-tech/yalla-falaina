// lib/yf/communityMatching.js -- a plain curated directory lookup, not a
// keyword scorer (see that module's own comment for why).
const test = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
const mock = createMockDb();
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock };
const { retrieveCommunityGroups } = require('../lib/yf/communityMatching');

test.beforeEach(() => mock.__reset());

test('with no country given, no query runs and an empty list comes back', async () => {
  const results = await retrieveCommunityGroups({});
  assert.deepEqual(results, []);
  assert.equal(mock.__writes().length, 0); // no reason to assert writes here, but confirms no accidental mutation path
});

test('a city match is prioritized over a country-wide group, which is prioritized over a different-city group', async () => {
  mock.__set('community_groups', {
    data: [
      { id: '1', country: 'Canada', city: 'Vancouver', platform: 'facebook', name: 'Vancouver Arabs', url: 'https://fb.com/a', language: 'ar' },
      { id: '2', country: 'Canada', city: null, platform: 'whatsapp', name: 'Canada-wide Arab Community', url: 'https://chat.whatsapp.com/b', language: 'ar' },
      { id: '3', country: 'Canada', city: 'Montreal', platform: 'facebook', name: 'Montreal Lebanese Diaspora', url: 'https://fb.com/c', language: 'fr' },
    ],
    error: null,
  });
  const results = await retrieveCommunityGroups({ country: 'Canada', city: 'Montreal', limit: 5 });
  assert.equal(results.length, 3);
  assert.equal(results[0].name, 'Montreal Lebanese Diaspora'); // exact city match first
  assert.equal(results[1].name, 'Canada-wide Arab Community'); // country-wide fallback next
  assert.equal(results[2].name, 'Vancouver Arabs'); // a different city last
});

test('with no city given, results are returned as-is up to the limit', async () => {
  mock.__set('community_groups', {
    data: [{ id: '1', country: 'Qatar', city: null, platform: 'telegram', name: 'Qatar Arabs', url: 'https://t.me/x', language: 'ar' }],
    error: null,
  });
  const results = await retrieveCommunityGroups({ country: 'Qatar', limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0].platform, 'telegram');
});

test('a DB error resolves to an empty list rather than throwing', async () => {
  mock.__set('community_groups', { data: null, error: { message: 'connection reset' } });
  const results = await retrieveCommunityGroups({ country: 'Canada' });
  assert.deepEqual(results, []);
});
