// Section 10's required-field gate: the concierge won't match a seeker to
// opportunities until enough is known about them to match against.
//
// The required set is the full Section 10 intake:
//   - profiles.preferred_language
//   - profiles.preferred_country
//   - profiles.sector OR profiles.role_type (either says enough to search on)
//   - seeker_profiles.work_history — a non-empty array (free-form intake rows
//     are fine; the items' inner shape is not enforced here)
//   - seeker_profiles.languages — a non-empty array
//   - seeker_profiles.has_passport, has_visa,
//     has_legal_residency_current_country, has_family_or_host_abroad —
//     each answered as a boolean; false counts as answered, null/missing
//     counts as unanswered
//   - seeker_profiles.confirmed_by_user === true (the strict-boolean "yes,
//     this is accurate" the seeker gives once their intake data is in place)
//
// education and certifications stay optional — a seeker may legitimately
// have none.
//
// `profile` and `seekerProfile` are plain row shapes (or {} / null-ish) — this
// module does no I/O, so both routes/profile.js and routes/concierge.js can
// call it against whatever they've already fetched without a shared round trip.
const BOOLEAN_INTAKE = [
  'has_passport',
  'has_visa',
  'has_legal_residency_current_country',
  'has_family_or_host_abroad',
];

function computeCompleteness({ profile, seekerProfile } = {}) {
  const p = profile || {};
  const sp = seekerProfile || {};
  const missing = [];
  if (!p.preferred_language) missing.push('preferred_language');
  if (!p.preferred_country) missing.push('preferred_country');
  if (!p.sector && !p.role_type) missing.push('sector_or_role_type');
  if (!Array.isArray(sp.work_history) || sp.work_history.length === 0) missing.push('work_history');
  if (!Array.isArray(sp.languages) || sp.languages.length === 0) missing.push('languages');
  for (const f of BOOLEAN_INTAKE) if (typeof sp[f] !== 'boolean') missing.push(f);
  if (sp.confirmed_by_user !== true) missing.push('confirmed_by_user');
  return { isComplete: missing.length === 0, missing };
}

module.exports = { computeCompleteness };
