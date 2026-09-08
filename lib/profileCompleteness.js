// Section 10's required-field gate: the concierge won't match a seeker to
// opportunities until enough is known about them to match against.
//
// The required set is the full Section 10 intake:
//   - profiles.preferred_language
//   - profiles.preferred_country
//   - profiles.sector OR profiles.role_type (either says enough to search on)
//   - seeker_profiles.work_history, education, certifications, languages
//   - seeker_profiles.has_passport, has_visa,
//     has_legal_residency_current_country, has_family_or_host_abroad
//   - seeker_profiles.confirmed_by_user === true
//
// "Required" means ANSWERED, not truthy/non-empty — the design doc is explicit
// that a negative or empty answer is a complete answer, never a block: a "no
// passport" routes to local/domestic matching rather than locking the seeker
// out, and "no certificate" must be accepted without shame. So every field
// above passes once it holds ANY explicit value — false, [], "" — and is
// missing only while never written (null/undefined). The one exception is
// confirmed_by_user: that's a confirmation, not a fact, so only === true
// satisfies it.
//
// `profile` and `seekerProfile` are plain row shapes (or {} / null-ish) — this
// module does no I/O, so both routes/profile.js and routes/concierge.js can
// call it against whatever they've already fetched without a shared round trip.
const JSON_INTAKE = ['work_history', 'education', 'certifications', 'languages'];
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
  for (const f of JSON_INTAKE) if (sp[f] == null) missing.push(f);
  for (const f of BOOLEAN_INTAKE) if (sp[f] == null) missing.push(f);
  if (sp.confirmed_by_user !== true) missing.push('confirmed_by_user');
  return { isComplete: missing.length === 0, missing };
}

module.exports = { computeCompleteness };
