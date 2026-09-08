'use strict';

// "Filter with code before the AI ever sees the results" (idea-configuration
// doc, Section 4.3): the model is never asked to find jobs unconstrained —
// this keyword scorer shortlists real rows from the `jobs` table (populated
// by lib/jobsIngest.js from licensed feeds) and only that shortlist reaches
// the prompt. Same scoring discipline as the handoff prototype's
// lib/matching.js, but the candidate set now comes from Postgres, not JSON.

const supabase = require('../../db');

// English/French function-words whose overlap caused false positives in the
// prototype (e.g. "to" in "Egypt to Jordan" vs "no money to travel").
// Deliberately not filtering Arabic stopwords — content words carry the
// signal, and over-filtering risks stripping meaningful short words.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are',
  'i', 'me', 'my', 'you', 'your', 'it', 'this', 'that', 'with', 'have', 'has',
  'no', 'not', 'do', 'does', 'be', 'am', 'we', 'want', 'de', 'la', 'le', 'un',
  'une', 'et', 'je', 'des', 'du', 'au', 'aux'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics for looser matching
    .split(/[^a-z0-9؀-ۿ]+/i)
    .filter((t) => t && !STOPWORDS.has(t));
}

function scoreJob(job, queryTokens) {
  const haystack = [
    job.title,
    job.category,
    job.country,
    job.city,
    ...(job.keywords || [])
  ].join(' ');
  const jobTokens = new Set(tokenize(haystack));
  let score = 0;
  for (const t of queryTokens) {
    if (jobTokens.has(t)) score += 1;
  }
  return score;
}

// A `jobs` row becomes the flat shape the system prompt and the chat UI
// already speak (same field names as the prototype's jobs.json entries).
function toPromptJob(row) {
  const raw = row.raw || {};
  return {
    id: row.id,
    title: row.title,
    employer: row.employer || raw.employer || '',
    city: row.city || '',
    country: row.country,
    track: row.track,
    category: row.category || '',
    requirements: row.requirements || '',
    salaryNote: row.salary_note || '',
    sourceType: row.source_type,
    sourceLabel: raw.sourceLabel || row.external_source,
    url: row.source_url || '',
    honestyFlags: raw.honestyFlags || [],
    keywords: raw.keywords || [],
  };
}

// Fetch the live candidate pool: active, unexpired jobs. The scorer then
// ranks in-process — the table stays small enough (a daily feed snapshot,
// not a job board) that ranking everything is cheaper than pushing a
// full-text index for Phase 1.
async function loadJobs() {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('jobs')
    .select('id, title, employer, country, city, category, requirements, salary_note, track, source_type, external_source, source_url, raw')
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(500);
  if (error) {
    console.error('jobs load', error.message);
    return [];
  }
  return (data || []).map(toPromptJob);
}

// Top-N matches for a free-text query, weighted toward a stated country
// preference (never a hard filter — a stated country is a preference, not a
// wall that hides every other option).
async function retrieveJobs({ query, preferredCountry, limit = 5 }) {
  const jobs = await loadJobs();
  const queryTokens = tokenize(query);

  // The doc's "no passport, no money" scenario: neither word ever matches a
  // real listing, so bias the fallback toward Zone/local and corridor
  // listings — the honest pivot for someone who isn't travel-ready yet.
  const signalsNotTravelReady = queryTokens.includes('passport') && queryTokens.includes('money');

  const scored = jobs.map((job) => {
    let score = scoreJob(job, queryTokens);
    if (preferredCountry && job.country && job.country.toLowerCase() === preferredCountry.toLowerCase()) {
      score += 2; // weight, don't filter
    }
    if (signalsNotTravelReady && (job.track === 'zone-local' || job.track === 'zone-corridor')) {
      score += 1;
    }
    return { job, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Only real, non-zero matches — unless nothing matched at all, in which
  // case fall back to a small diverse sample so the concierge still has
  // something real to lead with rather than an empty list.
  const withScore = scored.filter((s) => s.score > 0);
  const pool = withScore.length > 0 ? withScore : scored;

  return pool.slice(0, limit).map((s) => s.job);
}

module.exports = { retrieveJobs, loadJobs, toPromptJob, tokenize, scoreJob };
