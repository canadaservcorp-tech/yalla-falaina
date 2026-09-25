'use strict';

// Medical-treatment/travel vertical -- same "code decides the candidate set,
// the model only ever sees what's already been retrieved" discipline as
// every other vertical (lib/yf/matching.js's job retrieval, studyMatching.js,
// etc.). Two retrieval functions live here:
//   - retrieveMedicalIntake: the seeker's OWN most recent request (what they
//     said they need, plus any extracted report text) -- not a search,
//     just "give me the latest one for this profile."
//   - retrieveMedicalProviders: curated hospitals/clinics
//     (medical_treatment_providers) scored against that request.
//
// Deliberately diverges from studyMatching.js's "never return an empty list,
// fall back to a diverse sample" behavior: showing an unrelated hospital when
// nothing matches a seeker's actual stated treatment is not a harmless
// fallback here the way an unrelated study program might be -- it's actively
// misleading in a medical-travel context. When nothing curated matches, this
// returns empty and the prompt layer says so honestly.

const supabase = require('../../db');
const { tokenize } = require('./matching');

function toPromptIntake(row) {
  return {
    id: row.id,
    requiredTreatment: row.required_treatment,
    medicalHistoryNote: row.medical_history_note || '',
    extractedReportText: row.extracted_report_text || '',
    status: row.status,
  };
}

// The seeker may have filed more than one request over time (Section on
// medical_intake_requests in schema.sql) -- only the latest one is live
// context for the concierge.
async function retrieveMedicalIntake({ profileId } = {}) {
  if (!profileId) return null;
  const { data, error } = await supabase.from('medical_intake_requests')
    .select('id, required_treatment, medical_history_note, extracted_report_text, status')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('medical intake load', error.message); return null; }
  return data ? toPromptIntake(data) : null;
}

function toPromptProvider(row) {
  return {
    id: row.id,
    hospitalName: row.hospital_name,
    country: row.country,
    city: row.city || '',
    specialties: row.specialties,
    priceRangeNote: row.price_range_note || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    sourceUrl: row.source_url || '',
  };
}

// A plain keyword score against the seeker's stated treatment + whatever
// text was pulled from an uploaded report -- reusing tokenize() rather than
// duplicating it, same reasoning as studyMatching.js's own comment on why it
// imports rather than reinvents this.
function scoreProvider(provider, queryTokens) {
  const haystack = [provider.hospitalName, provider.country, provider.city, provider.specialties]
    .filter(Boolean).join(' ');
  const providerTokens = new Set(tokenize(haystack));
  let score = 0;
  for (const t of queryTokens) if (providerTokens.has(t)) score += 1;
  return score;
}

async function loadMedicalProviders() {
  const { data, error } = await supabase.from('medical_treatment_providers')
    .select('id, country, city, hospital_name, specialties, price_range_note, contact_email, contact_phone, source_url')
    .eq('status', 'active')
    .limit(500);
  if (error) { console.error('medical providers load', error.message); return []; }
  return (data || []).map(toPromptProvider);
}

// query is free text -- normally the seeker's required_treatment plus any
// extracted_report_text, combined by the caller (routes/concierge.js).
// Intentionally NOT filtered or weighted by preferred country the way
// jobs/study are: a seeker's destination preference for work or school has
// nothing to do with where a specific procedure is actually available or
// cheapest, and hard-filtering to their preferred country would silently
// hide exactly the kind of option (Cuba, South Korea, Russia) this vertical
// exists to surface.
// preferredCountry is a SOFT weight only — a matching-country provider gets
// a +1 nudge in ordering, never a filter: a seeker who'd rather be treated
// in Turkey still sees the Korean option their treatment actually needs,
// and the comment below on why nothing is hard-filtered still stands.
async function retrieveMedicalProviders({ query, preferredCountry, limit = 8 } = {}) {
  const providers = await loadMedicalProviders();
  if (!providers.length) return [];
  const queryTokens = tokenize(String(query || ''));
  if (!queryTokens.length) return [];
  const pref = String(preferredCountry || '').trim().toLowerCase();
  const scored = providers
    .map(p => ({ p, score: scoreProvider(p, queryTokens) +
      (pref && String(p.country).toLowerCase() === pref ? 1 : 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ p }) => p);
}

module.exports = {
  retrieveMedicalIntake, retrieveMedicalProviders,
  loadMedicalProviders, toPromptIntake, toPromptProvider, scoreProvider,
};
