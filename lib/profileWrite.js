// Shared profile write path — used by routes/profile.js (the client-driven
// intake endpoint) and routes/concierge.js (intake mode, where the concierge
// persists answers it extracted from conversation). One validation + write
// implementation so both callers enforce identical rules.
const supabase = require('../db');
const sec = require('./security');
const { computeCompleteness } = require('./profileCompleteness');

// Kept in sync with routes/auth.js's LANGUAGES by hand — not shared, so that
// registration's dialect list and profile completion can diverge later without
// coupling the two files together.
const LANGUAGES = ['ar-LB', 'ar-SY', 'ar-EG', 'ar-AE', 'ar', 'fr', 'hi', 'en', 'tr'];
const JSON_ARRAY_FIELDS = ['work_history', 'education', 'certifications', 'languages'];
const MAX_JSON_ITEMS = 40;
const MAX_JSON_BYTES = 20000; // generous for real intake data, small next to the 128kb body cap
const BOOL_FIELDS = ['has_passport', 'has_visa', 'has_legal_residency_current_country', 'has_family_or_host_abroad'];

const SEEKER_SELECT = 'id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user';
// preferred_city/seeking_study/target_degree_level/target_field_of_study are
// the international-students-vertical additions (schema.sql) -- optional,
// additive signals only, never part of lib/profileCompleteness.js's required
// set, so a pure job-seeker profile is unaffected either way.
const PROFILE_SELECT = 'id, full_name, city, country, preferred_language, preferred_country, preferred_city, sector, role_type, seeking_study, target_degree_level, target_field_of_study, seeking_treatment';

// Minimal shape validation, not a schema check on each item's fields — Section 10's
// intake accepts free-form entries (a work_history row from a CV upload looks
// different from one built conversationally) and the model reads these as context,
// not as strictly-typed data the app itself branches on.
function cleanJsonArray(v) {
  if (v === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(v)) return { ok: false };
  const value = v.slice(0, MAX_JSON_ITEMS);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_JSON_BYTES) return { ok: false };
  return { ok: true, value };
}

// body -> validated patches. Returns { ok: true, profilePatch, seekerPatch } or
// { ok: false, error }. Unknown keys are ignored — only the whitelisted intake
// fields are ever written.
function validateIntake(body) {
  const profilePatch = {};
  if ('full_name' in body) {
    const v = sec.clean(body.full_name, 80);
    if (!v) return { ok: false, error: 'full_name cannot be empty' };
    profilePatch.full_name = v;
  }
  if ('city' in body) profilePatch.city = sec.clean(body.city, 80) || null;
  if ('country' in body) profilePatch.country = sec.clean(body.country, 60) || null;
  if ('preferred_language' in body) {
    if (!LANGUAGES.includes(body.preferred_language))
      return { ok: false, error: 'Invalid preferred_language' };
    profilePatch.preferred_language = body.preferred_language;
  }
  if ('preferred_country' in body) profilePatch.preferred_country = sec.clean(body.preferred_country, 60) || null;
  if ('preferred_city' in body) profilePatch.preferred_city = sec.clean(body.preferred_city, 80) || null;
  if ('sector' in body) profilePatch.sector = sec.clean(body.sector, 80) || null;
  if ('role_type' in body) profilePatch.role_type = sec.clean(body.role_type, 80) || null;
  // International-students vertical: optional signals, same "answered, not
  // truthy" spirit as the has_* booleans below is NOT needed here since these
  // are never part of the required-field gate -- a plain boolean/string check
  // is enough.
  if ('seeking_study' in body) {
    if (typeof body.seeking_study !== 'boolean')
      return { ok: false, error: 'seeking_study must be true or false' };
    profilePatch.seeking_study = body.seeking_study;
  }
  if ('target_degree_level' in body) profilePatch.target_degree_level = sec.clean(body.target_degree_level, 40) || null;
  if ('target_field_of_study' in body) profilePatch.target_field_of_study = sec.clean(body.target_field_of_study, 80) || null;

  const seekerPatch = {};
  for (const field of JSON_ARRAY_FIELDS) {
    if (!(field in body)) continue;
    const { ok, value } = cleanJsonArray(body[field]);
    if (!ok) return { ok: false, error: `${field} must be a reasonably small array` };
    seekerPatch[field] = value;
  }
  for (const field of BOOL_FIELDS) {
    if (!(field in body)) continue;
    if (typeof body[field] !== 'boolean')
      return { ok: false, error: `${field} must be true or false` };
    seekerPatch[field] = body[field];
  }
  // Strict boolean, same as confirmAge/acceptTerms at signup — a truthy string
  // ("true", "1") must never silently count as confirmation.
  if ('confirmed_by_user' in body) {
    if (body.confirmed_by_user !== true && body.confirmed_by_user !== false)
      return { ok: false, error: 'confirmed_by_user must be true or false' };
    seekerPatch.confirmed_by_user = body.confirmed_by_user;
  }
  return { ok: true, profilePatch, seekerPatch };
}

// A second live-model retest found the model copying computeCompleteness's
// MISSING-LIST DISPLAY NAME verbatim into the block instead of a real column
// name: it emitted `"sector_or_role_type": "logistics"` because that's the
// exact label intakeInstructions' `Missing: ...` line shows it, and
// `sector_or_role_type` isn't a real field — validateIntake silently ignored
// it (unknown keys are ignored by design, so this failed with no error at
// all), and the seeker's own, correctly-heard answer never made it to
// storage. Audited against every other entry lib/profileCompleteness.js's
// `missing` array can contain — preferred_language, preferred_country,
// work_history, education, certifications, languages, the four has_*
// booleans, and confirmed_by_user all already match their real column name
// exactly; `sector_or_role_type` is the ONLY display name that doesn't,
// because it's the one place completeness collapses two real columns
// (sector, role_type) into one human-readable label. Routed to `sector`
// (the broader, and more likely, of the two for a free-text answer like
// "logistics") rather than `role_type` — the model is never asked to know
// which of the two backs the label, so guessing wrong here would just move
// the same failure to the other column.
const FIELD_ALIASES = { sector_or_role_type: 'sector' };

// Same collapse-into-one-label case as sector_or_role_type: completeness
// reports `target_degree_level_or_field_of_study`, which is TWO real columns.
// Route by the answer's shape — a degree-level word goes to
// target_degree_level, anything else is a field of study. Either column
// satisfies computeCompleteness's student gate, so a misroute only mislabels
// the data, it can't strand the gate.
const DEGREE_LEVEL_RE = /^\s*(undergraduate|bachelor'?s?|b\.?a\.?|b\.?sc\.?|graduate|master'?s?|m\.?a\.?|m\.?sc\.?|mba|ph\.?d\.?|doctorate|vocational|language\s+programs?|diploma)\b/i;

function resolveAlias(rawField, value) {
  if (rawField === 'target_degree_level_or_field_of_study')
    return DEGREE_LEVEL_RE.test(String(value || '')) ? 'target_degree_level' : 'target_field_of_study';
  return FIELD_ALIASES[rawField] || rawField;
}

// Lenient variant for the concierge's ---PROFILE--- extraction: the model is
// probabilistic, not a form, so one malformed field must not cost the good
// answers in the same block. Each candidate field is validated independently
// through the same rules — invalid ones are dropped and reported, everything
// valid still lands. `rejected` is [{ field, reason }]; PUT keeps the strict
// all-or-nothing validator above so a human gets one clear 400.
function validateIntakeLenient(body) {
  const profilePatch = {}, seekerPatch = {}, medicalPatch = {}, rejected = [];
  for (const rawField of Object.keys(body || {})) {
    let value = body[rawField];
    const field = resolveAlias(rawField, value);
    // Medical-travel fields write to medical_intake_requests, not profiles /
    // seeker_profiles — intercept before validateIntake's unknown-key ignore
    // would let them pass with nothing stored. required_treatment is
    // completeness's missing-label for a seeking_treatment profile, so the
    // model emits exactly this name (same display-name mechanism as the
    // sector_or_role_type alias above).
    if (field === 'required_treatment') {
      const v = sec.clean(value, 300);
      if (!v) { rejected.push({ field, reason: 'required_treatment cannot be empty' }); continue; }
      medicalPatch.required_treatment = v;
      continue;
    }
    if (field === 'medical_history_note') {
      medicalPatch.medical_history_note = sec.clean(value, 2000) || null;
      continue;
    }
    // Live-model verification found a real failure: the model sometimes
    // answers a list field with a plain string ("Bachelor's in Business,
    // XYZ University, 2015" for education) instead of the documented
    // array-of-objects shape, and cleanJsonArray's strict `Array.isArray`
    // check threw the whole answer away over a shape mismatch a
    // probabilistic model will keep making — so intake never reached
    // isComplete even though the seeker had genuinely answered. The strict
    // PUT-form path (validateIntake, used directly by routes/profile.js)
    // deliberately keeps rejecting a bare string — a human client sending
    // one is a real client bug worth a 400 — so this normalization is
    // scoped to extraction only: a non-empty string becomes a single-item
    // array (the seeker's own words, verbatim, are still real data even
    // unstructured); an empty string becomes an empty array, same as an
    // explicit "no entries" answer.
    if (JSON_ARRAY_FIELDS.includes(field) && typeof value === 'string') {
      const s = value.trim();
      value = s ? [s] : [];
    }
    const v = validateIntake({ [field]: value });
    if (!v.ok) { rejected.push({ field, reason: v.error }); continue; }
    Object.assign(profilePatch, v.profilePatch);
    Object.assign(seekerPatch, v.seekerPatch);
  }
  return { profilePatch, seekerPatch, medicalPatch, rejected };
}

async function loadCurrent(profileId) {
  const { data: profile } = await supabase.from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', profileId).maybeSingle();
  // schema.sql's unique(profile_id) guarantees at most one row — a plain
  // lookup, not a "most recent of possibly several" query.
  const { data: seekerProfile } = await supabase.from('seeker_profiles')
    .select(SEEKER_SELECT)
    .eq('profile_id', profileId)
    .maybeSingle();
  return { profile, seekerProfile };
}

// Validates body and persists it. Returns { profile, seekerProfile, isComplete,
// missing, rejected } on success; throws on validation or DB failure — callers
// map that to their own error shape. With `{ lenient: true }` (the concierge's
// extraction path), bad fields are dropped into `rejected` instead of throwing.
async function applyIntake(userId, body, { lenient = false } = {}) {
  let profilePatch, seekerPatch, medicalPatch = {}, rejected = [];
  if (lenient) {
    ({ profilePatch, seekerPatch, medicalPatch, rejected } = validateIntakeLenient(body));
  } else {
    const v = validateIntake(body || {});
    if (!v.ok) {
      const e = new Error(v.error);
      e.isValidation = true;
      throw e;
    }
    ({ profilePatch, seekerPatch } = v);
  }

  // Filing a treatment need marks the treatment track — the same additive
  // flag routes/medical-intake.js's own POST sets.
  if (medicalPatch.required_treatment) profilePatch.seeking_treatment = true;

  // profiles.id is the primary key, so this both self-heals a profile row a
  // failed signup-time insert left missing (routes/auth.js) and applies the
  // patch — same pattern routes/concierge.js already uses to ensure the row.
  const { data: profile, error: pErr } = await supabase.from('profiles')
    .upsert({ id: userId, ...profilePatch }, { onConflict: 'id' })
    .select(PROFILE_SELECT)
    .single();
  if (pErr) throw pErr;

  const { data: existingSeeker, error: sErr } = await supabase.from('seeker_profiles')
    .select('*').eq('profile_id', userId).maybeSingle();
  if (sErr) throw sErr;

  if (medicalPatch.required_treatment) {
    const { error: mErr } = await supabase.from('medical_intake_requests')
      .insert({ profile_id: userId, required_treatment: medicalPatch.required_treatment,
                medical_history_note: medicalPatch.medical_history_note || null });
    if (mErr) throw mErr;
  }
  // A medical_intake_requests row is what satisfies the treatment track's
  // target slot in computeCompleteness — the row this call may have just
  // inserted counts, otherwise one lookup.
  let hasMedicalIntake = Boolean(medicalPatch.required_treatment);
  if (!hasMedicalIntake && profile.seeking_treatment) {
    const { data: medRow } = await supabase.from('medical_intake_requests')
      .select('id').eq('profile_id', userId).limit(1).maybeSingle();
    hasMedicalIntake = Boolean(medRow);
  }

  const mergedSeeker = { ...(existingSeeker || {}), ...seekerPatch };
  const { isComplete, missing } = computeCompleteness({ profile, seekerProfile: mergedSeeker, hasMedicalIntake });
  const seekerRow = {
    profile_id: userId,
    intake_method: 'conversational',
    ...seekerPatch,
    is_complete: isComplete,
    updated_at: new Date().toISOString(),
  };

  // A real upsert-by-profile_id, atomic in the database — schema.sql's
  // unique(profile_id) is what makes onConflict meaningful here. This
  // replaces a former read-then-insert-or-update: two concurrent calls for
  // the same profile (the PUT endpoint and the concierge's conversational
  // intake genuinely can overlap) used to be able to both read "no row yet"
  // and both insert, leaving two permanent rows with no way to reconcile
  // them — one of them (and whatever it held) would silently vanish from
  // every future read. Postgres's ON CONFLICT DO UPDATE only touches the
  // columns actually present in seekerRow, so a field this call didn't
  // patch is left exactly as `existingSeeker` had it, same as the old
  // update-by-id path did.
  const { data: seekerProfile, error } = await supabase.from('seeker_profiles')
    .upsert(seekerRow, { onConflict: 'profile_id' })
    .select(SEEKER_SELECT)
    .single();
  if (error) throw error;
  return { profile, seekerProfile, isComplete, missing, rejected };
}

module.exports = { loadCurrent, applyIntake, validateIntake, validateIntakeLenient, LANGUAGES };
