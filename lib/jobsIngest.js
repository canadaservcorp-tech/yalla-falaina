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

async function fetchAdzuna() {
  const id = process.env.JOB_API_ID, key = process.env.JOB_API_KEY;
  if (!id || !key) { console.error('jobs-ingest: adzuna needs JOB_API_ID and JOB_API_KEY'); return []; }
  const country = process.env.JOB_API_COUNTRY || 'ca';   // Adzuna country code
  const countryName = adzunaCountryName(country);
  const rows = [];
  // Adzuna's `/search/N` is 1-indexed. Stops when a page comes back shorter
  // than a full page (the natural "no more results" signal, and the only one
  // that's safe to rely on — see below) or once the response's own `count`
  // says we've already gathered everything, whichever comes first.
  for (let page = 1; page <= ADZUNA_MAX_PAGES; page++) {
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?app_id=${id}&app_key=${key}&results_per_page=${ADZUNA_RESULTS_PER_PAGE}&content-type=application/json`;
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

async function fetchJooble() {
  const key = process.env.JOB_API_KEY;
  if (!key) { console.error('jobs-ingest: jooble needs JOB_API_KEY'); return []; }
  const r = await fetch(`https://jooble.org/api/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: process.env.JOB_API_KEYWORDS || '', location: process.env.JOB_API_LOCATION || '' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`jooble ${r.status}`);
  const j = await r.json();
  return (j.jobs || []).map(x => row({
    // The previous fallback (`j${i}-${x.title}`) keyed on the result's
    // position in THIS run's array — the same real listing sliding from
    // index 4 to index 2 next run (because something above it disappeared)
    // silently changed its own external_id, defeating the whole point of
    // `unique (external_source, external_id)` and duplicating instead of
    // updating. stableExternalId hashes stable content instead, so the same
    // listing gets the same id regardless of where it lands in the results.
    source: 'jooble', externalId: x.id || stableExternalId(x.title, x.company, x.link),
    title: x.title, employer: x.company, country: x.location || '',
    city: x.location, category: x.type, requirements: x.snippet,
    salaryNote: x.salary, postedAt: x.updated, url: x.link, raw: x,
  }));
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

async function refresh() {
  const fetch_ = ADAPTERS[PROVIDER];
  if (!fetch_) { console.error(`jobs-ingest: unknown JOB_API_PROVIDER '${PROVIDER}'`); return 0; }
  const rows = (await fetch_()).filter(r => r.title && r.country);
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
module.exports = { refresh, trackFor, fetchAdzuna, fetchJooble, fetchSeed };
