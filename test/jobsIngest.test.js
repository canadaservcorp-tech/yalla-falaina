// Roadmap Step 4 — licensed job feed. lib/jobsIngest.js had zero coverage;
// this locks in the adapter contracts, the country -> track mapping, and
// refresh()'s upsert/filter behavior with a mocked Supabase client, none of
// which need a real Adzuna/Jooble key.
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { createMockDb } = require('./helpers/mockDb');

const DB_PATH = require.resolve('../db');
const MOD_PATH = require.resolve('../lib/jobsIngest');
const realFetch = globalThis.fetch;

// jobsIngest.js reads JOB_API_PROVIDER into a module-level const at require
// time (same pattern as routes/concierge.js's MODEL), so switching providers
// between tests means a fresh require after the cache is cleared.
function freshModule({ provider, mock } = {}) {
  if (provider !== undefined) process.env.JOB_API_PROVIDER = provider;
  delete require.cache[MOD_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: mock || createMockDb() };
  return require('../lib/jobsIngest');
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete require.cache[MOD_PATH];
  delete require.cache[DB_PATH];
  delete process.env.JOB_API_PROVIDER;
  delete process.env.JOB_API_ID;
  delete process.env.JOB_API_KEY;
  delete process.env.JOB_API_COUNTRY;
});

// ---------- trackFor ----------

test('trackFor maps known countries and defaults unmatched ones to demand-led', () => {
  const { trackFor } = freshModule();
  assert.equal(trackFor('Canada'), 'western');
  assert.equal(trackFor('canada'), 'western');           // case-insensitive
  assert.equal(trackFor('United States'), 'western');
  assert.equal(trackFor('United Arab Emirates'), 'gcc');
  assert.equal(trackFor('Lebanon'), 'zone-local');
  assert.equal(trackFor('Jordan'), 'zone-corridor');
  assert.equal(trackFor('Ghana'), 'demand-led');
  assert.equal(trackFor(''), 'demand-led');
  assert.equal(trackFor(undefined), 'demand-led');
});

// ---------- fetchAdzuna ----------

test('fetchAdzuna returns nothing and logs, rather than throwing, when credentials are missing', async () => {
  const { fetchAdzuna } = freshModule();
  const rows = await fetchAdzuna();
  assert.deepEqual(rows, []);
});

test('fetchAdzuna maps a result to the row shape, with the correct track for the requested country', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRY = 'ca';
  const { fetchAdzuna } = freshModule();
  let requestedUrl = null;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      results: [{
        id: 42, title: 'Electrician', company: { display_name: 'Acme' },
        location: { display_name: 'Laval, QC' }, category: { label: 'Trades' },
        description: 'Licensed electrician needed.', salary_min: 50000, salary_max: 65000,
        created: '2026-08-01T00:00:00Z', redirect_url: 'https://example.test/job/42',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchAdzuna();
  assert.match(requestedUrl, /^https:\/\/api\.adzuna\.com\/v1\/api\/jobs\/ca\/search\/1\?/);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.external_source, 'adzuna');
  assert.equal(r.external_id, '42');
  assert.equal(r.title, 'Electrician');
  assert.equal(r.employer, 'Acme');
  assert.equal(r.country, 'Canada');
  assert.equal(r.track, 'western');          // only correct because country resolved to 'Canada'
  assert.equal(r.source_type, 'licensed_api');
  assert.equal(r.salary_note, '50000–65000');
  assert.equal(r.source_url, 'https://example.test/job/42');
  assert.ok(r.expires_at);
});

// This is the Step-4 bug: every Adzuna country besides 'ca' passed straight
// through as a raw 2-letter code, which trackFor() can never match, so a
// 'us' or 'gb' feed was silently mis-tracked as 'demand-led' instead of
// 'western'. Locks in the fix for every western-track code Adzuna supports.
test('fetchAdzuna resolves non-Canada country codes to the full name so the western track still applies', async () => {
  for (const [code, expectedName] of [['us', 'United States'], ['gb', 'United Kingdom'], ['fr', 'France'], ['de', 'Germany'], ['au', 'Australia']]) {
    process.env.JOB_API_ID = 'id1';
    process.env.JOB_API_KEY = 'key1';
    process.env.JOB_API_COUNTRY = code;
    const { fetchAdzuna } = freshModule();
    globalThis.fetch = async () => new Response(JSON.stringify({
      results: [{ id: 1, title: 'Cook', company: {}, location: {}, created: '2026-08-01', redirect_url: null }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const rows = await fetchAdzuna();
    assert.equal(rows[0].country, expectedName, `code '${code}' should resolve to '${expectedName}'`);
    assert.equal(rows[0].track, 'western', `code '${code}' should land on the western track`);
  }
});

test('fetchAdzuna falls back to the raw code (and logs) for a country not yet mapped', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRY = 'zz';
  const { fetchAdzuna, trackFor } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    results: [{ id: 1, title: 'Cook', company: {}, location: {}, created: '2026-08-01', redirect_url: null }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchAdzuna();
  assert.equal(rows[0].country, 'zz');
  assert.equal(trackFor(rows[0].country), 'demand-led');   // documented, not a silent success
});

test('fetchAdzuna throws on a non-2xx upstream response', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  await assert.rejects(() => fetchAdzuna(), /adzuna 500/);
});

// ---------- fetchJooble ----------

test('fetchJooble returns nothing when the key is missing', async () => {
  const { fetchJooble } = freshModule();
  assert.deepEqual(await fetchJooble(), []);
});

test('fetchJooble maps a result to the row shape', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  let sent = null;
  globalThis.fetch = async (url, opts) => {
    sent = { url: String(url), body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({
      jobs: [{ id: 9, title: 'Plumber', company: 'Acme', location: 'Montreal', type: 'Trades', snippet: 'desc', salary: '25/h', updated: '2026-08-01', link: 'https://example.test/9' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchJooble();
  assert.match(sent.url, /jooble\.org\/api\/jkey$/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].external_source, 'jooble');
  assert.equal(rows[0].title, 'Plumber');
  assert.equal(rows[0].country, 'Montreal');
});

// ---------- fetchSeed ----------

test('fetchSeed loads the handoff bundle and preserves its track, marking the informal listing unverified', async () => {
  const { fetchSeed } = freshModule();
  const rows = await fetchSeed();
  assert.ok(rows.length > 0);
  const informal = rows.find(r => r.source_type === 'informal_unverified');
  assert.ok(informal, 'the seed bundle is expected to include an informal listing');
  assert.equal(informal.external_source, 'informal_submission');
  const licensed = rows.find(r => r.source_type === 'licensed_api');
  assert.ok(licensed);
  assert.equal(licensed.external_source, 'seed');
  // seed rows keep the handoff bundle's own track rather than the country heuristic
  assert.ok(rows.every(r => r.track));
});

// ---------- refresh() ----------

test('refresh upserts every row with title and country, skipping ones that are missing either', async () => {
  process.env.JOB_API_PROVIDER = 'seed';
  const mock = createMockDb();
  const { refresh } = freshModule({ mock });
  const n = await refresh();
  const writes = mock.__writes('jobs', 'upsert');
  assert.equal(writes.length, n);
  assert.ok(n > 0);
  assert.ok(writes.every(w => w.payload.title && w.payload.country));
});

test('refresh counts only successful upserts and logs the rest, never throwing on a partial failure', async () => {
  process.env.JOB_API_PROVIDER = 'seed';
  const mock = createMockDb();
  mock.__setOp('jobs', 'upsert', { data: null, error: { message: 'conflict' } });
  const { refresh } = freshModule({ mock });
  const n = await refresh();
  assert.equal(n, 0);
});

test('refresh returns 0 and logs for an unknown provider, without touching the database', async () => {
  process.env.JOB_API_PROVIDER = 'not-a-real-provider';
  const mock = createMockDb();
  const { refresh } = freshModule({ mock });
  const n = await refresh();
  assert.equal(n, 0);
  assert.equal(mock.__writes('jobs').length, 0);
});
