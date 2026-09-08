// Section 10's required-field gate: the concierge won't match a seeker to
// opportunities until enough is known about them to match against.
//
// This is a first cut at the "minimal set" and is deliberately small — flagged
// here for review rather than buried in a route. A stricter set (work_history,
// languages, has_passport/has_visa, etc.) may turn out to be more correct once
// real seeker intake data comes in; this only requires:
//   - profiles.preferred_language
//   - profiles.preferred_country
//   - profiles.sector OR profiles.role_type (either says enough to search on)
//   - seeker_profiles.confirmed_by_user === true (the strict-boolean "yes, this
//     is accurate" the seeker gives once their intake data is in place)
//
// `profile` and `seekerProfile` are plain row shapes (or {} / null-ish) — this
// module does no I/O, so both routes/profile.js and routes/concierge.js can
// call it against whatever they've already fetched without a shared round trip.
function computeCompleteness({ profile, seekerProfile } = {}) {
  const p = profile || {};
  const sp = seekerProfile || {};
  const missing = [];
  if (!p.preferred_language) missing.push('preferred_language');
  if (!p.preferred_country) missing.push('preferred_country');
  if (!p.sector && !p.role_type) missing.push('sector_or_role_type');
  if (sp.confirmed_by_user !== true) missing.push('confirmed_by_user');
  return { isComplete: missing.length === 0, missing };
}

module.exports = { computeCompleteness };
