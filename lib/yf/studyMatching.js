'use strict';

// International-students matching -- same "code decides the candidate set,
// the model only ever sees what's already been retrieved" discipline as
// lib/yf/matching.js's job retrieval (Section 4.3/6.1). Kept as a sibling
// module rather than folded into matching.js because the field shape and the
// weighting signals (degree level, field of study) are genuinely different
// from a job's (title/salary/track) -- reusing tokenize() is enough shared
// code to be worth importing rather than duplicating; the rest diverges.

const supabase = require('../../db');
const { tokenize } = require('./matching');

const MAX_DESCRIPTION_CHARS = 2000;

// Signals that a seeker is specifically asking about financial aid/funding
// (English/French/Arabizi, since this platform is trilingual) -- used only to
// BOOST scholarship/funded rows toward the top, never as a hard filter (a
// seeker who says "financial aid" should still see a strong unfunded program
// match if nothing funded exists for their field/level).
const FINANCIAL_AID_SIGNAL_RE = /\b(financial aid|funding|funded|scholarship|bourse|grant|stipend|fee waiver|tuition waiver|assistantship|fully funded|gratuit|gratuité|free tuition)\b/i;

// requirements/eligibilityNote/tuitionNote were previously OR'd together (only
// one ever reached the search index), which meant a program's actual funding
// description (tuition_note) was never searchable at all -- a seeker asking
// "financial aid for mechanical engineering" would never match a row whose
// title/field said nothing about money even though its tuition_note read
// "Full tuition waiver + stipend". All three are real, independent fields an
// admin can fill in separately, so all three must be searchable together.
function scoreOpportunity(opp, queryTokens) {
  const description = [opp.requirements, opp.eligibilityNote, opp.tuitionNote]
    .filter(Boolean).join(' ').replace(/<[^>]*>/g, ' ').slice(0, MAX_DESCRIPTION_CHARS);
  const haystack = [
    opp.title, opp.institution, opp.country, opp.city,
    opp.degreeLevel, opp.fieldOfStudy, description,
  ].join(' ');
  const oppTokens = new Set(tokenize(haystack));
  let score = 0;
  for (const t of queryTokens) if (oppTokens.has(t)) score += 1;
  return score;
}

// A study_opportunities row becomes the flat shape the system prompt speaks,
// same reasoning as lib/yf/matching.js's toPromptOpportunity.
function toPromptOpportunity(row) {
  return {
    id: row.id,
    kind: row.kind, // 'program' | 'scholarship'
    title: row.title,
    institution: row.institution || '',
    city: row.city || '',
    country: row.country,
    degreeLevel: row.degree_level || '',
    fieldOfStudy: row.field_of_study || '',
    language: row.language || '',
    tuitionNote: row.tuition_note || '',
    // Structured, sourced-only figure -- see this column's own schema.sql
    // comment. null (not 0) means "no verified percentage on file," so the
    // prompt layer can tell "confirmed 0% covered" apart from "unknown."
    fundingCoveragePct: row.funding_coverage_pct === null || row.funding_coverage_pct === undefined ? null : row.funding_coverage_pct,
    eligibilityNote: row.eligibility_note || '',
    deadline: row.deadline || null,
    requirements: row.requirements || '',
    sourceType: row.source_type,
    url: row.source_url || '',
  };
}

// Active opportunities whose deadline (if any) hasn't already passed --
// a lapsed scholarship deadline is exactly as unusable to a seeker as an
// expired job posting, same freshness discipline as lib/yf/matching.js's
// loadJobs().
async function loadStudyOpportunities() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('study_opportunities')
    .select('id, kind, title, institution, country, city, degree_level, field_of_study, language, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_type, source_url')
    .eq('status', 'active')
    .or(`deadline.is.null,deadline.gte.${today}`)
    .limit(500);
  if (error) { console.error('study opportunities load', error.message); return []; }
  return (data || []).map(toPromptOpportunity);
}

// Top-N matches for a free-text query, weighted toward a stated destination
// country and, when known, degree level / field of study -- never a hard
// filter, same "preference, not a wall" rule as job matching. Every major
// (field_of_study is free text, never an enum) and both graduate and
// undergraduate levels are searched the same way -- there is no allow-list of
// fields or degree levels anywhere in this module, so nothing needs "adding"
// to cover a new major or level; a row just needs to exist for one.
//
// A query that reads as a financial-aid ask (see FINANCIAL_AID_SIGNAL_RE)
// also boosts scholarship-kind rows and any row with a real, published
// funding_coverage_pct or tuition_note -- still additive, never a filter, so
// an unfunded program can still surface as the closest real match when
// nothing funded exists yet for that field/country.
async function retrieveStudyOpportunities({ query, preferredCountry, degreeLevel, fieldOfStudy, limit = 5 } = {}) {
  const opportunities = await loadStudyOpportunities();
  const queryTokens = tokenize(query);
  const askingAboutFinancialAid = FINANCIAL_AID_SIGNAL_RE.test(String(query || ''));

  const scored = opportunities.map((opp) => {
    let score = scoreOpportunity(opp, queryTokens);
    if (preferredCountry && opp.country && opp.country.toLowerCase() === preferredCountry.toLowerCase()) score += 2;
    if (degreeLevel && opp.degreeLevel && opp.degreeLevel.toLowerCase() === degreeLevel.toLowerCase()) score += 2;
    if (fieldOfStudy && opp.fieldOfStudy && opp.fieldOfStudy.toLowerCase().includes(fieldOfStudy.toLowerCase())) score += 1;
    if (askingAboutFinancialAid && (opp.kind === 'scholarship' || opp.fundingCoveragePct != null || opp.tuitionNote)) score += 2;
    return { opp, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const withScore = scored.filter((s) => s.score > 0);
  const pool = withScore.length > 0 ? withScore : scored;
  return pool.slice(0, limit).map((s) => s.opp);
}

module.exports = { retrieveStudyOpportunities, loadStudyOpportunities, toPromptOpportunity, scoreOpportunity, FINANCIAL_AID_SIGNAL_RE };
