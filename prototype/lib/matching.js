'use strict';

/**
 * matching.js
 *
 * Implements the "filter with code before the AI ever sees the results"
 * discipline from the idea-configuration doc (Section 4.3): the model is
 * never asked to "find matching jobs" unconstrained. Instead, plain keyword
 * matching runs against the mock job feed first, and only the resulting
 * shortlist is ever handed to the AI to discuss. In production this module
 * would query a real database populated from licensed job-aggregator APIs
 * (Adzuna, Jooble, Careerjet, Talent.com, Job Bank) instead of a JSON file.
 */

const fs = require('fs');
const path = require('path');

const JOBS_PATH = path.join(__dirname, '..', 'data', 'jobs.json');

function loadJobs() {
  const raw = fs.readFileSync(JOBS_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Very simple keyword-overlap scorer. This is intentionally basic for a
 * prototype: normalize both the query and each job's keyword/text fields,
 * count overlapping tokens, and rank by score. A production build would
 * replace this with a real search index or embeddings-based retrieval, but
 * the *pattern* — code decides the candidate set, the model never invents
 * one — stays the same regardless of how sophisticated the scorer gets.
 */
// Common short function-words in English/French that would otherwise cause
// false-positive matches (e.g. the "to" in "Egypt to Jordan" overlapping the
// "to" in "I have no passport and no money to travel"). Deliberately not
// filtering Arabic stopwords here — the content words carry the signal for
// this small demo dataset either way, and over-filtering Arabic risks
// stripping meaningful short words without native-speaker review.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are',
  'i', 'me', 'my', 'you', 'your', 'it', 'this', 'that', 'with', 'have', 'has',
  'no', 'not', 'do', 'does', 'be', 'am', 'we', 'want', 'de', 'la', 'le', 'un',
  'une', 'et', 'je', 'un', 'des', 'du', 'au', 'aux'
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

/**
 * Retrieve the top-N matching jobs for a free-text query, optionally
 * weighted toward a stated country preference (never a hard filter — per
 * the doc's "lead with the opportunity" pattern, a stated country is a
 * preference to weight toward, not a wall that hides every other option).
 */
function retrieveJobs({ query, preferredCountry, limit = 5 }) {
  const jobs = loadJobs();
  const queryTokens = tokenize(query);

  // Direct signal for the doc's own "no passport, no money" scenario
  // (Section 4.3's fourth model answer): when neither word matched a real
  // job (score would be 0 anyway, since no listing mentions "passport" or
  // "money"), bias the fallback toward Zone/local and corridor listings
  // rather than an arbitrary slice of the whole feed — that's the honest
  // pivot the doc describes for someone who isn't travel-ready yet.
  const signalsNotTravelReady = queryTokens.includes('passport') && queryTokens.includes('money');

  const scored = jobs.map((job) => {
    let score = scoreJob(job, queryTokens);
    if (preferredCountry && job.country && job.country.toLowerCase() === preferredCountry.toLowerCase()) {
      score += 2; // weight, don't filter
    }
    if (signalsNotTravelReady && (job.track === 'zone-local' || job.track === 'zone-corridor')) {
      score += 1; // bias the fallback pool, never a hard filter
    }
    return { job, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Only return jobs with a real, non-zero match unless nothing matched at
  // all, in which case fall back to a small diverse sample so the concierge
  // still has *something* real to lead with (the "always provide a
  // solution" instinct from Section 4.1) rather than an empty list.
  const withScore = scored.filter((s) => s.score > 0);
  const pool = withScore.length > 0 ? withScore : scored;

  return pool.slice(0, limit).map((s) => s.job);
}

function getAllJobs() {
  return loadJobs();
}

module.exports = { retrieveJobs, getAllJobs };
