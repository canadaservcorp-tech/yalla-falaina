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

const supabase = require('../db');
const PROVIDER = String(process.env.JOB_API_PROVIDER || 'seed').toLowerCase();

const TRACK_BY_COUNTRY = {
  canada: 'western', 'united states': 'western', 'france': 'western', 'germany': 'western',
  'united kingdom': 'western', 'australia': 'western',
  'united arab emirates': 'gcc', 'saudi arabia': 'gcc', 'qatar': 'gcc', 'kuwait': 'gcc',
  'lebanon': 'zone-local', 'syria': 'zone-local', 'egypt': 'zone-local', 'jordan': 'zone-corridor', 'iraq': 'zone-corridor',
};
const trackFor = country => TRACK_BY_COUNTRY[String(country || '').toLowerCase()] || 'demand-led';

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

async function fetchAdzuna() {
  const id = process.env.JOB_API_ID, key = process.env.JOB_API_KEY;
  if (!id || !key) { console.error('jobs-ingest: adzuna needs JOB_API_ID and JOB_API_KEY'); return []; }
  const country = process.env.JOB_API_COUNTRY || 'ca';   // Adzuna country code
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${id}&app_key=${key}&results_per_page=50&content-type=application/json`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`adzuna ${r.status}`);
  const j = await r.json();
  return (j.results || []).map(x => row({
    source: 'adzuna', externalId: x.id, title: x.title,
    employer: x.company?.display_name, country: country.toUpperCase() === 'CA' ? 'Canada' : country,
    city: x.location?.display_name, category: x.category?.label,
    requirements: x.description, salaryNote: x.salary_min ? `${x.salary_min}–${x.salary_max || x.salary_min}` : null,
    postedAt: x.created, url: x.redirect_url, raw: x,
  }));
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
  return (j.jobs || []).map((x, i) => row({
    source: 'jooble', externalId: x.id || `j${i}-${x.title}`,
    title: x.title, employer: x.company, country: x.location || '',
    city: x.location, category: x.type, requirements: x.snippet,
    salaryNote: x.salary, postedAt: x.updated, url: x.link, raw: x,
  }));
}

// The handoff bundle's 12-listing mock feed, upserted so the concierge is
// testable end-to-end before a licensed provider is approved. Its informal
// listing keeps source_type = 'informal_unverified' so the guardrail is real.
async function fetchSeed() {
  const list = require('../prototype/data/jobs.json');
  return list.map(j => row({
    source: j.sourceType === 'informal_unverified' ? 'informal_submission' : 'seed',
    externalId: j.id, title: j.title, employer: j.employer,
    country: j.country, city: j.city, category: j.category,
    requirements: j.requirements, salaryNote: j.salaryNote,
    url: j.url, track: j.track,
    sourceType: j.sourceType === 'informal_unverified' ? 'informal_unverified' : 'licensed_api',
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
module.exports = { refresh, trackFor };
