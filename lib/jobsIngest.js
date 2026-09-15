'use strict';

// Licensed job-feed ingest (Section 6.1: never scraped). A scheduler job
// calls refresh() to upsert the current snapshot into `jobs`; the matching
// engine then only ever reads Postgres.
//
// Provider is picked by JOB_API_PROVIDER:
//   'adzuna'   — needs JOB_API_ID + JOB_API_KEY  (https://developer.adzuna.com)
//   'jooble'   — needs JOB_API_KEY               (https://jooble.org/api/about)
//   'seed'     — imports the handoff bundle's data/jobs.json (dev / pre-approval)
// Any other value or a missing key logs and refreshes nothing — the feed
// stays at whatever is already in the table.
//
// Countries/locations per run:
//   Adzuna:  JOB_API_COUNTRIES="ca,fr,de,ae,sa" (comma-separated 2-letter
//            codes) pulls every one of them in a single refresh(). Falls
//            back to the older, singular JOB_API_COUNTRY (one code) when
//            COUNTRIES isn't set — every existing single-country deploy
//            needs no config change at all.
//   Jooble:  same idea with JOB_API_LOCATIONS (comma-separated free-text
//            locations, e.g. "United Arab Emirates,Saudi Arabia,France"),
//            falling back to the singular JOB_API_LOCATION.
// Either plural form makes a bad/uncovered single country or location a
// logged skip instead of losing every other one's real jobs along with it.

const crypto = require('crypto');
const supabase = require('../db');
const PROVIDER = String(process.env.JOB_API_PROVIDER || 'seed').toLowerCase();

// Real-world API results don't always carry a stable native id (Adzuna's
// `id` is normally present but not guaranteed by contract; a listing missing
// it previously fell through to `external_id: null`, and Postgres treats
// every NULL as distinct for a unique constraint — so `jobs:refresh` would
// insert a brand-new duplicate row for that same listing every single run
// instead of updating one. This derives a stable id from content that
// should stay the same for the same real listing across runs (title +
// employer + the listing's own URL, when present) — deterministic, so the
// SAME listing hashes to the SAME id next time, letting `unique
// (external_source, external_id)` actually dedupe it.
function stableExternalId(...parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

const TRACK_BY_COUNTRY = {
  canada: 'western', 'united states': 'western', 'france': 'western', 'germany': 'western',
  'united kingdom': 'western', 'australia': 'western',
  'united arab emirates': 'gcc', 'saudi arabia': 'gcc', 'qatar': 'gcc', 'kuwait': 'gcc',
  'lebanon': 'zone-local', 'syria': 'zone-local', 'egypt': 'zone-local', 'jordan': 'zone-corridor', 'iraq': 'zone-corridor',
};
const trackFor = country => TRACK_BY_COUNTRY[String(country || '').toLowerCase()] || 'demand-led';

// Adzuna identifies countries by 2-letter code, but TRACK_BY_COUNTRY (and the
// rest of the app) key on full country names — this maps every western-track
// code Adzuna supports today. A code not listed here falls through to the raw
// code (previous behavior), which trackFor() cannot match and defaults to
// 'demand-led'; that's a real gap (Section 6.1 tracks drive matching), not a
// silent success, so it's logged rather than guessed at.
const ADZUNA_COUNTRY_NAMES = {
  ca: 'Canada', us: 'United States', gb: 'United Kingdom', fr: 'France', de: 'Germany', au: 'Australia',
};
function adzunaCountryName(code) {
  const name = ADZUNA_COUNTRY_NAMES[String(code || '').toLowerCase()];
  if (!name) console.error(`jobs-ingest: no country-name mapping for Adzuna code '${code}' — track will default to 'demand-led'`);
  return name || code;
}

// Jooble's own REST API docs confirm `location` is a single free-text string
// per job ("city, region, or country" -- there is no separate country
// field), usually echoing back whatever shape the source posting used
// ("Dubai, United Arab Emirates", "Riyadh", "UAE", ...). TRACK_BY_COUNTRY's
// exact-match lookup silently missed almost every real Gulf/MENA row because
// of this -- the same class of gap ADZUNA_COUNTRY_NAMES closes for Adzuna's
// country codes, just never closed here. This is deliberately a small,
// explicit alias table (matching this file's existing style) rather than a
// geocoding dependency: it only needs to resolve the handful of countries
// TRACK_BY_COUNTRY actually assigns a track to, everything else keeps
// falling through to 'demand-led' exactly as before this fix.
const JOOBLE_COUNTRY_ALIASES = {
  'united arab emirates': 'United Arab Emirates', uae: 'United Arab Emirates', 'u a e': 'United Arab Emirates',
  dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', sharjah: 'United Arab Emirates',
  'saudi arabia': 'Saudi Arabia', ksa: 'Saudi Arabia', saudi: 'Saudi Arabia', riyadh: 'Saudi Arabia', jeddah: 'Saudi Arabia',
  qatar: 'Qatar', doha: 'Qatar',
  kuwait: 'Kuwait', 'kuwait city': 'Kuwait',
  lebanon: 'Lebanon', beirut: 'Lebanon',
  syria: 'Syria', damascus: 'Syria',
  egypt: 'Egypt', cairo: 'Egypt', alexandria: 'Egypt',
  jordan: 'Jordan', amman: 'Jordan',
  iraq: 'Iraq', baghdad: 'Iraq',
  canada: 'Canada', 'united states': 'United States', usa: 'United States', us: 'United States',
  'united kingdom': 'United Kingdom', uk: 'United Kingdom', france: 'France', germany: 'Germany', australia: 'Australia',
};
// Strips punctuation (periods in "U.A.E.", Arabic-script directional marks
// that sometimes ride along in RTL text) so 'U.A.E.' and 'uae' hash the same.
const normalizeCountryToken = s => String(s || '').toLowerCase().replace(/[.‎‏]/g, '').trim();

// Tries, in order: the last comma-separated segment of the row's OWN
// location text (the common "City, Country" shape), the whole location text
// (rows that are already just a bare country or a recognizable city), then
// the query location this particular Jooble call was made for (the
// country/region this run is actually asking about — see fetchJoobleLocation
// above and its multi-location caller, fetchJooble) -- returns the first
// that resolves via the alias table above, or null if none do. A null means
// the row's country stays whatever raw text Jooble sent (same as before
// this fix -- logged as a real gap rather than silently guessed at, per
// Section 6.1's tracks driving matching).
function joobleCountryFor(locationText, queryLocation) {
  const parts = String(locationText || '').split(',').map(s => s.trim()).filter(Boolean);
  const candidates = [parts[parts.length - 1], locationText, queryLocation];
  for (const candidate of candidates) {
    const hit = JOOBLE_COUNTRY_ALIASES[normalizeCountryToken(candidate)];
    if (hit) return hit;
  }
  return null;
}

// Every adapter normalizes to this row shape (columns of the jobs table).
function row({ source, externalId, title, employer, country, city, category, requirements, salaryNote, postedAt, url, raw, track, sourceType }) {
  return {
    external_source: source,
    external_id: externalId ? String(externalId) : null,
    track: track || trackFor(country),
    source_type: sourceType || 'licensed_api',
    title, employer, country, city,
    category: category || null,
    requirements: requirements || null,
    salary_note: salaryNote || null,
    posted_at: postedAt || null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // freshness window, Section 4.3
    status: 'active',
    source_url: url || null,
    raw: raw || null,
  };
}

const ADZUNA_RESULTS_PER_PAGE = 50;
// Safety cap, not an expected ceiling: 20 pages x 50/page = 1000 jobs is far
// more than a single-country/single-market demand-led feed should ever
// return in practice. Without a cap, a broad/misconfigured query returning a
// huge `count` would mean this ingest keeps paginating sequentially for a
// very long time (and burns a lot of the API's rate-limit budget) on every
// scheduled run.
const ADZUNA_MAX_PAGES = 20;

// One country's worth of the pagination loop, unchanged from before the
// multi-country extension below — a page-1 failure still throws (nothing was
// fetched for THIS country) rather than logging and returning an empty list,
// so a single-country deploy (the only shape that existed before) keeps its
// exact original behavior: fetchAdzuna() below calls this directly, with
// nothing to catch the error, whenever only one country is configured.
async function fetchAdzunaCountry(code) {
  const id = process.env.JOB_API_ID, key = process.env.JOB_API_KEY;
  const countryName = adzunaCountryName(code);
  const rows = [];
  // Adzuna's `/search/N` is 1-indexed. Stops when a page comes back shorter
  // than a full page (the natural "no more results" signal, and the only one
  // that's safe to rely on — see below) or once the response's own `count`
  // says we've already gathered everything, whichever comes first.
  for (let page = 1; page <= ADZUNA_MAX_PAGES; page++) {
    const url = `https://api.adzuna.com/v1/api/jobs/${code}/search/${page}?app_id=${id}&app_key=${key}&results_per_page=${ADZUNA_RESULTS_PER_PAGE}&content-type=application/json`;
    let results, count;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`adzuna ${r.status}`);
      const j = await r.json();
      results = j.results || [];
      count = j.count;
    } catch (e) {
      // A first-page failure (bad key, immediate rate-limit) means nothing
      // was fetched at all this run — throwing here matches the pre-
      // pagination behavior refresh() already handles (0 rows upserted,
      // nothing in `jobs` touched, so nothing existing is lost). A LATER
      // page failing mid-run (a rate limit that only kicks in after a few
      // pages) is different: pages already fetched are real, good data —
      // discarding them along with the failed page would throw away
      // legitimate jobs over an unrelated later failure, which is exactly
      // the "partial ingest must not wipe existing rows" case this was
      // written to avoid. So only page 1 re-throws; every later page logs
      // and returns what was already collected instead.
      if (page === 1) throw e;
      console.error(`jobs-ingest: adzuna page ${page} failed (${e.message}) — keeping the ${rows.length} job(s) already fetched from earlier pages`);
      break;
    }
    for (const x of results) {
      rows.push(row({
        source: 'adzuna', externalId: x.id || stableExternalId(x.title, x.company?.display_name, x.redirect_url),
        title: x.title, employer: x.company?.display_name, country: countryName,
        city: x.location?.display_name, category: x.category?.label,
        requirements: x.description, salaryNote: x.salary_min ? `${x.salary_min}–${x.salary_max || x.salary_min}` : null,
        postedAt: x.created, url: x.redirect_url, raw: x,
      }));
    }
    // Fewer results than a full page means this was the last page — the
    // ONLY signal safe to rely on unconditionally, since `count` is absent
    // from some Adzuna responses. When `count` IS present, it lets this stop
    // a page early rather than firing one extra (now-empty) request.
    if (results.length < ADZUNA_RESULTS_PER_PAGE) break;
    if (typeof count === 'number' && rows.length >= count) break;
  }
  return rows;
}

// Multi-country extension (queued item 3): an Egypt-facing push wants Gulf,
// France and Germany opportunities alongside whatever the deploy's own
// JOB_API_COUNTRY already pulls, not one country per run. JOB_API_COUNTRIES
// (plural, comma-separated Adzuna codes, e.g. "ca,fr,de,ae,sa") takes
// priority when set; JOB_API_COUNTRY (singular) stays exactly as before for
// every deploy that hasn't opted in. The single-country case is deliberately
// routed straight through to fetchAdzunaCountry() with nothing catching its
// errors, preserving the exact pre-existing throw-on-page-1-failure contract
// (and its tests) unchanged. Multi-country is the new behavior: one bad
// country (a code Adzuna doesn't cover, a transient failure) is logged and
// skipped rather than losing every other country's real jobs along with it —
// same "partial failure must not wipe good data" philosophy as the
// mid-pagination failure handling above, just one level up.
async function fetchAdzuna() {
  const id = process.env.JOB_API_ID, key = process.env.JOB_API_KEY;
  if (!id || !key) { console.error('jobs-ingest: adzuna needs JOB_API_ID and JOB_API_KEY'); return []; }
  const raw = process.env.JOB_API_COUNTRIES || process.env.JOB_API_COUNTRY || 'ca';
  const codes = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const countries = codes.length ? codes : ['ca'];
  if (countries.length === 1) return fetchAdzunaCountry(countries[0]);
  const rows = [];
  for (const code of countries) {
    try { rows.push(...(await fetchAdzunaCountry(code))); }
    catch (e) { console.error(`jobs-ingest: adzuna country '${code}' failed entirely (${e.message}) — skipping it this run`); }
  }
  return rows;
}

// One location's worth of Jooble's search — Jooble's API takes a single
// free-text `location` per call (confirmed against its own REST API docs;
// see JOOBLE_COUNTRY_ALIASES's comment above), so "several countries per
// run" for this adapter means several calls, not one call with a list.
async function fetchJoobleLocation(location, key = process.env.JOB_API_KEY) {
  const r = await fetch(`https://jooble.org/api/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: process.env.JOB_API_KEYWORDS || '', location: location || '' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`jooble ${r.status}`);
  const j = await r.json();
  return (j.jobs || []).map(x => {
    const resolvedCountry = joobleCountryFor(x.location, location);
    if (!resolvedCountry) console.error(`jobs-ingest: no country-name mapping for Jooble location '${x.location}' — track will default to 'demand-led'`);
    return row({
      // The previous fallback (`j${i}-${x.title}`) keyed on the result's
      // position in THIS run's array — the same real listing sliding from
      // index 4 to index 2 next run (because something above it disappeared)
      // silently changed its own external_id, defeating the whole point of
      // `unique (external_source, external_id)` and duplicating instead of
      // updating. stableExternalId hashes stable content instead, so the same
      // listing gets the same id regardless of where it lands in the results.
      source: 'jooble', externalId: x.id || stableExternalId(x.title, x.company, x.link),
      title: x.title, employer: x.company, country: resolvedCountry || x.location || '',
      city: x.location, category: x.type, requirements: x.snippet,
      salaryNote: x.salary, postedAt: x.updated, url: x.link, raw: x,
    });
  });
}

// Multi-location extension, same shape and same reasoning as fetchAdzuna()
// above: JOB_API_LOCATIONS (plural, comma-separated, e.g. "United Arab
// Emirates,Saudi Arabia,France") takes priority when set; JOB_API_LOCATION
// (singular) is unchanged for every deploy that hasn't opted in, and the
// single-location case is routed straight through with nothing catching its
// errors so that existing behavior (and its tests) stays identical.
async function fetchJooble() {
  const key = process.env.JOB_API_KEY;
  if (!key) { console.error('jobs-ingest: jooble needs JOB_API_KEY'); return []; }
  const raw = process.env.JOB_API_LOCATIONS || process.env.JOB_API_LOCATION || '';
  const locations = raw.split(',').map(s => s.trim()).filter(Boolean);
  const list = locations.length ? locations : [''];
  if (list.length === 1) return fetchJoobleLocation(list[0]);
  const rows = [];
  for (const loc of list) {
    try { rows.push(...(await fetchJoobleLocation(loc))); }
    catch (e) { console.error(`jobs-ingest: jooble location '${loc}' failed entirely (${e.message}) — skipping it this run`); }
  }
  return rows;
}

// The handoff bundle's 12-listing mock feed, upserted so the concierge is
// testable end-to-end before a licensed provider is approved. Its informal
// listing keeps source_type = 'informal_unverified' so the guardrail is real.
//
// A live-test finding ("seed jobs presented as real"): every OTHER seed row
// used to fall through to row()'s default source_type of 'licensed_api' —
// the exact same label a genuine Adzuna/Jooble row gets (fetchAdzuna/
// fetchJooble below never pass sourceType, so they get that same default on
// purpose). That made this fixture data indistinguishable, downstream, from
// a real licensed listing: routes/concierge.js's guardrail only added a
// disclosure for 'informal_unverified', so the concierge could present a
// made-up employer/requirements/contact path to a live seeker as a real,
// currently-open opportunity. 'seed_demo' is its own explicit label so
// routes/concierge.js's demoJob() can redact these before either the model
// or the seeker ever sees the fake fields, instead of relying on a prompt
// instruction the model could ignore. This only affects rows this adapter
// produces — fetchAdzuna/fetchJooble are untouched and keep 'licensed_api'.
async function fetchSeed() {
  const list = require('../prototype/data/jobs.json');
  return list.map(j => row({
    source: j.sourceType === 'informal_unverified' ? 'informal_submission' : 'seed',
    externalId: j.id, title: j.title, employer: j.employer,
    country: j.country, city: j.city, category: j.category,
    requirements: j.requirements, salaryNote: j.salaryNote,
    url: j.url, track: j.track,
    sourceType: j.sourceType === 'informal_unverified' ? 'informal_unverified' : 'seed_demo',
    raw: { sourceLabel: j.sourceLabel, honestyFlags: j.honestyFlags, keywords: j.keywords, contactNote: j.contactNote },
  }));
}

const ADAPTERS = { adzuna: fetchAdzuna, jooble: fetchJooble, seed: fetchSeed };

// Optional second rail on top of whatever JOB_API_PROVIDER runs: Adzuna's
// API has no Gulf endpoints (ae/sa aren't valid country codes there), so a
// Dubai/Saudi feed needs a second source. JOOBLE_API_KEY + JOB_API_LOCATIONS
// (same comma list the primary-Jooble path already reads) turn it on.
async function fetchJoobleSupplement() {
  const key = process.env.JOOBLE_API_KEY;
  const raw = process.env.JOB_API_LOCATIONS || process.env.JOB_API_LOCATION || '';
  const locations = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!key || !locations.length) return [];
  const rows = [];
  for (const loc of locations) {
    try { rows.push(...(await fetchJoobleLocation(loc, key))); }
    catch (e) { console.error(`jobs-ingest: jooble supplement '${loc}' failed (${e.message}) — skipping it this run`); }
  }
  return rows;
}

async function refresh() {
  const fetch_ = ADAPTERS[PROVIDER];
  if (!fetch_) { console.error(`jobs-ingest: unknown JOB_API_PROVIDER '${PROVIDER}'`); return 0; }
  const rows = (await fetch_()).filter(r => r.title && r.country);
  rows.push(...(await fetchJoobleSupplement()).filter(r => r.title && r.country));
  // seed rows keep their handoff track instead of the country heuristic
  let n = 0;
  for (const r of rows) {
    const q = supabase.from('jobs').upsert(r, { onConflict: 'external_source,external_id' });
    const { error } = await q;
    if (error) console.error('jobs-ingest upsert', error.message); else n++;
  }
  console.log(`jobs-ingest: ${n}/${rows.length} jobs upserted from ${PROVIDER}`);
  return n;
}

if (require.main === module) {
  require('dotenv').config();
  refresh().catch(e => { console.error('jobs-ingest failed', e); process.exit(1); });
}
module.exports = { refresh, trackFor, fetchAdzuna, fetchJooble, fetchJoobleSupplement, fetchSeed };
