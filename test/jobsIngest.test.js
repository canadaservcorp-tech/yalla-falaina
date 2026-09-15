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
  delete process.env.JOB_API_LOCATION;
  delete process.env.JOB_API_COUNTRIES;
  delete process.env.JOB_API_LOCATIONS;
  delete process.env.JOOBLE_API_KEY;
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

// ---------- fetchAdzuna: pagination (Devin's plan item 2) ----------

function adzunaPage(ids, count) {
  return new Response(JSON.stringify({
    count,
    results: ids.map(id => ({
      id, title: `Job ${id}`, company: { display_name: 'Acme' }, location: { display_name: 'Laval, QC' },
      category: { label: 'Trades' }, description: 'desc', created: '2026-08-01', redirect_url: `https://example.test/${id}`,
    })),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('fetchAdzuna follows pagination past page 1 when a page comes back full, and stops once a page comes back short', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  const requestedUrls = [];
  const full50 = Array.from({ length: 50 }, (_, i) => `p1-${i}`);
  const full50b = Array.from({ length: 50 }, (_, i) => `p2-${i}`);
  const short10 = Array.from({ length: 10 }, (_, i) => `p3-${i}`);
  const pages = [adzunaPage(full50), adzunaPage(full50b), adzunaPage(short10)];
  globalThis.fetch = async (url) => { requestedUrls.push(String(url)); return pages.shift(); };
  const rows = await fetchAdzuna();
  assert.equal(requestedUrls.length, 3, 'should stop after the first short page, not keep going to a 4th empty one');
  assert.match(requestedUrls[0], /\/search\/1\?/);
  assert.match(requestedUrls[1], /\/search\/2\?/);
  assert.match(requestedUrls[2], /\/search\/3\?/);
  assert.equal(rows.length, 110); // 50 + 50 + 10, every page's results kept
});

test('fetchAdzuna stops once the response\'s own `count` says everything has been gathered, without an extra request', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  let calls = 0;
  const full50 = Array.from({ length: 50 }, (_, i) => `p1-${i}`);
  const full50b = Array.from({ length: 50 }, (_, i) => `p2-${i}`);
  const pages = [adzunaPage(full50, 100), adzunaPage(full50b, 100)]; // count says exactly 100 exist
  globalThis.fetch = async () => { calls++; return pages.shift(); };
  const rows = await fetchAdzuna();
  assert.equal(calls, 2, 'must not fire a 3rd request once `count` is already satisfied');
  assert.equal(rows.length, 100);
});

test('fetchAdzuna never exceeds its page-count safety cap, even against an API that always returns a full page', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return adzunaPage(Array.from({ length: 50 }, (_, i) => `p${calls}-${i}`)); }; // no `count`, always full -- would loop forever without a cap
  const rows = await fetchAdzuna();
  assert.equal(calls, 20, 'the safety cap, not an accident of the mock');
  assert.equal(rows.length, 1000);
});

test('fetchAdzuna keeps the jobs already fetched from earlier pages when a LATER page fails (e.g. mid-run rate limit), instead of discarding them', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  const full50 = Array.from({ length: 50 }, (_, i) => `p1-${i}`);
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return adzunaPage(full50); // page 1 succeeds, full page -- pagination continues
    return new Response('rate limited', { status: 429 }); // page 2 hits a rate limit
  };
  const errors = [];
  const origErr = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let rows;
  try { rows = await fetchAdzuna(); } finally { console.error = origErr; }
  assert.equal(rows.length, 50, 'page 1\'s 50 real jobs must survive page 2\'s failure, not be thrown away with it');
  assert.ok(errors.some(e => /adzuna page 2 failed/.test(e)));
});

test('fetchAdzuna still throws (fetches nothing) when the very FIRST page fails -- there is nothing yet to preserve', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  globalThis.fetch = async () => new Response('rate limited', { status: 429 });
  await assert.rejects(() => fetchAdzuna(), /adzuna 429/);
});

// ---------- fetchAdzuna: multi-country (queued item 3) ----------

test('fetchAdzuna with JOB_API_COUNTRIES pulls every listed country in one run and merges their jobs', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRIES = 'ca, fr , de';   // stray whitespace must not break parsing
  const { fetchAdzuna } = freshModule();
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const code = String(url).match(/\/jobs\/([a-z]{2})\/search\//)[1];
    return new Response(JSON.stringify({
      results: [{ id: `${code}-1`, title: `Job in ${code}`, company: {}, location: {}, redirect_url: `https://example.test/${code}` }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchAdzuna();
  assert.equal(rows.length, 3, 'one job per country');
  assert.deepEqual(rows.map(r => r.country).sort(), ['Canada', 'France', 'Germany']);
  assert.ok(rows.every(r => r.track === 'western'));
  assert.equal(requestedUrls.filter(u => /\/jobs\/ca\//.test(u)).length, 1);
  assert.equal(requestedUrls.filter(u => /\/jobs\/fr\//.test(u)).length, 1);
  assert.equal(requestedUrls.filter(u => /\/jobs\/de\//.test(u)).length, 1);
});

test('JOB_API_COUNTRIES takes priority over the singular JOB_API_COUNTRY when both are set', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRY = 'ca';
  process.env.JOB_API_COUNTRIES = 'ae,sa';
  const { fetchAdzuna } = freshModule();
  globalThis.fetch = async (url) => new Response(JSON.stringify({
    results: [{ id: '1', title: 'Job', company: {}, location: {}, redirect_url: null }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchAdzuna();
  assert.equal(rows.length, 2);
  assert.ok(!rows.some(r => r.country === 'Canada'), 'the plural var must win, not merge with the singular one');
});

test('fetchAdzuna multi-country: one country failing entirely is logged and skipped, the others\' real jobs survive', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRIES = 'ca,fr';
  const { fetchAdzuna } = freshModule();
  globalThis.fetch = async (url) => {
    if (/\/jobs\/fr\//.test(String(url))) return new Response('rate limited', { status: 429 });
    return new Response(JSON.stringify({
      results: [{ id: 'ca-1', title: 'Job', company: {}, location: {}, redirect_url: null }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  let rows;
  try { rows = await fetchAdzuna(); } finally { console.error = origError; }
  assert.equal(rows.length, 1, 'Canada\'s real job must survive France\'s total failure');
  assert.equal(rows[0].country, 'Canada');
  assert.ok(errors.some(e => /adzuna country 'fr' failed entirely/.test(e)));
});

test('fetchAdzuna with a single country in JOB_API_COUNTRIES still throws on a page-1 failure, same as the singular-var contract', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  process.env.JOB_API_COUNTRIES = 'ca';
  const { fetchAdzuna } = freshModule();
  globalThis.fetch = async () => new Response('rate limited', { status: 429 });
  await assert.rejects(() => fetchAdzuna(), /adzuna 429/);
});

// ---------- fetchAdzuna / fetchJooble: dedupe across runs (Devin's plan item 2) ----------

test('fetchAdzuna falls back to a STABLE derived id (not null) when a result has no native id, so re-runs update the same row instead of duplicating it', async () => {
  process.env.JOB_API_ID = 'id1';
  process.env.JOB_API_KEY = 'key1';
  const { fetchAdzuna } = freshModule();
  const noIdResult = () => new Response(JSON.stringify({
    results: [{ title: 'Warehouse Associate', company: { display_name: 'Acme' }, location: {}, redirect_url: 'https://example.test/w1' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = noIdResult;
  const run1 = await fetchAdzuna();
  globalThis.fetch = noIdResult; // a second, independent "run" of the same live listing
  const run2 = await fetchAdzuna();
  assert.ok(run1[0].external_id, 'must never fall through to null -- that defeats the unique constraint entirely');
  assert.equal(run1[0].external_id, run2[0].external_id, 'the SAME real listing must hash to the SAME id every run');
});

test('fetchJooble falls back to a STABLE derived id when a result has no native id, independent of its position in the results array', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  const twoJobs = (order) => new Response(JSON.stringify({
    jobs: order === 'first'
      ? [{ title: 'Line Cook', company: 'Acme Diner', link: 'https://example.test/cook' }, { title: 'Driver', company: 'Acme Logistics', link: 'https://example.test/driver' }]
      : [{ title: 'Driver', company: 'Acme Logistics', link: 'https://example.test/driver' }, { title: 'Line Cook', company: 'Acme Diner', link: 'https://example.test/cook' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async () => twoJobs('first');
  const run1 = await fetchJooble();
  globalThis.fetch = async () => twoJobs('second'); // the API returns the SAME two real listings, reordered
  const run2 = await fetchJooble();
  const cookId1 = run1.find(r => r.title === 'Line Cook').external_id;
  const cookId2 = run2.find(r => r.title === 'Line Cook').external_id;
  assert.equal(cookId1, cookId2, 'the same real listing must get the same id regardless of array position -- the old `j${i}-title` fallback broke exactly this');
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
  // 'Montreal' matches no known-country alias (deliberately not one of
  // TRACK_BY_COUNTRY's entries via Jooble in this repo -- Canada's real
  // feed is Adzuna) -- unresolved rows keep the raw text exactly as before
  // this fix, logged rather than guessed at.
  assert.equal(rows[0].country, 'Montreal');
  assert.equal(rows[0].track, 'demand-led');
});

// ---------- fetchJooble: Gulf/MENA country resolution ----------
// Jooble's `location` field is one free-text string with no separate
// country field (confirmed against Jooble's own REST API docs) -- these
// lock in the fix that resolves it into something trackFor() can actually
// match, closing the same class of gap ADZUNA_COUNTRY_NAMES already closed
// for Adzuna's country codes (Section 6.1: tracks drive matching).
test('fetchJooble resolves a "City, Country" location into the gcc track', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    jobs: [{ id: 1, title: 'Site Engineer', company: 'Acme', location: 'Dubai, United Arab Emirates', link: 'https://example.test/1' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchJooble();
  assert.equal(rows[0].country, 'United Arab Emirates');
  assert.equal(rows[0].track, 'gcc');
});

test('fetchJooble resolves a bare city name (no comma) via the alias table', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    jobs: [{ id: 2, title: 'Nurse', company: 'Acme', location: 'Riyadh', link: 'https://example.test/2' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchJooble();
  assert.equal(rows[0].country, 'Saudi Arabia');
  assert.equal(rows[0].track, 'gcc');
});

test('fetchJooble resolves a bare abbreviation, punctuation and case-insensitively', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    jobs: [{ id: 3, title: 'Driver', company: 'Acme', location: 'U.A.E.', link: 'https://example.test/3' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchJooble();
  assert.equal(rows[0].country, 'United Arab Emirates');
  assert.equal(rows[0].track, 'gcc');
});

test('fetchJooble falls back to the deploy\'s own JOB_API_LOCATION when the row\'s own text does not resolve', async () => {
  process.env.JOB_API_KEY = 'jkey';
  process.env.JOB_API_LOCATION = 'Qatar';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    // A location string with no recognizable country/city segment at all --
    // this deploy's own configured target is the reasonable fallback.
    jobs: [{ id: 4, title: 'Cashier', company: 'Acme', location: 'Remote', link: 'https://example.test/4' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchJooble();
  assert.equal(rows[0].country, 'Qatar');
  assert.equal(rows[0].track, 'gcc');
  delete process.env.JOB_API_LOCATION;
});

test('fetchJooble logs (does not throw) when a location resolves to nothing at all', async () => {
  process.env.JOB_API_KEY = 'jkey';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async () => new Response(JSON.stringify({
    jobs: [{ id: 5, title: 'Cook', company: 'Acme', location: 'Nowhereville', link: 'https://example.test/5' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const rows = await fetchJooble();
    assert.equal(rows[0].country, 'Nowhereville');
    assert.ok(errors.some(e => /no country-name mapping for Jooble location/.test(e)));
  } finally { console.error = origError; }
});

// ---------- fetchJooble: multi-location (queued item 3) ----------

test('fetchJooble with JOB_API_LOCATIONS queries every listed location in one run and merges their jobs', async () => {
  process.env.JOB_API_KEY = 'jkey';
  process.env.JOB_API_LOCATIONS = 'United Arab Emirates, Saudi Arabia , France';
  const { fetchJooble } = freshModule();
  const sentLocations = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sentLocations.push(body.location);
    return new Response(JSON.stringify({
      jobs: [{ id: `${body.location}-1`, title: `Job in ${body.location}`, company: 'Acme', location: body.location, link: 'https://example.test/1' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchJooble();
  assert.equal(rows.length, 3);
  assert.deepEqual(sentLocations, ['United Arab Emirates', 'Saudi Arabia', 'France']);
  assert.deepEqual(rows.map(r => r.track).sort(), ['gcc', 'gcc', 'western']);
});

test('JOB_API_LOCATIONS takes priority over the singular JOB_API_LOCATION when both are set', async () => {
  process.env.JOB_API_KEY = 'jkey';
  process.env.JOB_API_LOCATION = 'Canada';
  process.env.JOB_API_LOCATIONS = 'Qatar,Kuwait';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async (url, opts) => new Response(JSON.stringify({
    jobs: [{ id: '1', title: 'Job', company: 'Acme', location: 'Remote', link: null }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rows = await fetchJooble();
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.track === 'gcc'), 'the plural var must win, not merge with the singular one');
});

test('fetchJooble multi-location: one location failing entirely is logged and skipped, the others\' real jobs survive', async () => {
  process.env.JOB_API_KEY = 'jkey';
  process.env.JOB_API_LOCATIONS = 'Qatar,Kuwait';
  const { fetchJooble } = freshModule();
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.location === 'Kuwait') return new Response('rate limited', { status: 429 });
    return new Response(JSON.stringify({
      jobs: [{ id: '1', title: 'Job', company: 'Acme', location: 'Qatar', link: null }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  let rows;
  try { rows = await fetchJooble(); } finally { console.error = origError; }
  assert.equal(rows.length, 1, 'Qatar\'s real job must survive Kuwait\'s total failure');
  assert.ok(errors.some(e => /jooble location 'Kuwait' failed entirely/.test(e)));
});

// ---------- fetchSeed ----------

// Live-test finding ("seed jobs presented as real"): every non-informal seed
// row used to get source_type 'licensed_api' — indistinguishable from a real
// Adzuna/Jooble row to routes/concierge.js's guardrail. They now get their
// own 'seed_demo' label so demoJob() can redact them before a live seeker
// ever sees fixture data presented as a real opening.
test('fetchSeed loads the handoff bundle and preserves its track, marking the informal listing unverified and every other row seed_demo (never licensed_api)', async () => {
  const { fetchSeed } = freshModule();
  const rows = await fetchSeed();
  assert.ok(rows.length > 0);
  const informal = rows.find(r => r.source_type === 'informal_unverified');
  assert.ok(informal, 'the seed bundle is expected to include an informal listing');
  assert.equal(informal.external_source, 'informal_submission');
  const demo = rows.find(r => r.source_type === 'seed_demo');
  assert.ok(demo);
  assert.equal(demo.external_source, 'seed');
  assert.ok(!rows.some(r => r.source_type === 'licensed_api'), 'fixture data must never carry the same label as a real licensed-feed row');
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

// ---------- fetchJoobleSupplement (secondary Gulf feed) ----------

test('fetchJoobleSupplement returns nothing without a key or locations', async () => {
  const { fetchJoobleSupplement } = freshModule();
  assert.deepEqual(await fetchJoobleSupplement(), []);
  process.env.JOOBLE_API_KEY = 'jk2';
  delete require.cache[MOD_PATH];
  const mod2 = require('../lib/jobsIngest');
  assert.deepEqual(await mod2.fetchJoobleSupplement(), []);
});

test('fetchJoobleSupplement queries every JOB_API_LOCATIONS entry with the supplement key', async () => {
  process.env.JOOBLE_API_KEY = 'jk2';
  process.env.JOB_API_LOCATIONS = 'United Arab Emirates,Saudi Arabia';
  const { fetchJoobleSupplement } = freshModule();
  const sent = [];
  globalThis.fetch = async (url, opts) => {
    sent.push({ url: String(url), body: JSON.parse(opts.body) });
    return new Response(JSON.stringify({
      jobs: [{ id: 1, title: 'Site Engineer', company: 'Acme', location: 'Dubai, United Arab Emirates', link: 'https://example.test/1' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchJoobleSupplement();
  assert.equal(sent.length, 2);
  assert.match(sent[0].url, /jooble\.org\/api\/jk2$/);
  assert.deepEqual(sent.map(s => s.body.location), ['United Arab Emirates', 'Saudi Arabia']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].country, 'United Arab Emirates');
  assert.equal(rows[0].track, 'gcc');
});

test('fetchJoobleSupplement keeps the surviving locations when one call fails', async () => {
  process.env.JOOBLE_API_KEY = 'jk2';
  process.env.JOB_API_LOCATIONS = 'United Arab Emirates,Saudi Arabia';
  const { fetchJoobleSupplement } = freshModule();
  globalThis.fetch = async (url, opts) => {
    if (JSON.parse(opts.body).location === 'United Arab Emirates') return new Response('x', { status: 500 });
    return new Response(JSON.stringify({ jobs: [{ id: 2, title: 'Nurse', company: 'B', location: 'Riyadh', link: 'https://example.test/2' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = await fetchJoobleSupplement();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Nurse');
});
