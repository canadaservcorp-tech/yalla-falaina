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
const LANGUAGES = ['ar-LB', 'ar-SY', 'ar-EG', 'ar', 'fr', 'en'];
const JSON_ARRAY_FIELDS = ['work_history', 'education', 'certifications', 'languages'];
const MAX_JSON_ITEMS = 40;
const MAX_JSON_BYTES = 20000; // generous for real intake data, small next to the 128kb body cap
const BOOL_FIELDS = ['has_passport', 'has_visa', 'has_legal_residency_current_country', 'has_family_or_host_abroad'];

const SEEKER_SELECT = 'id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user';
const PROFILE_SELECT = 'id, full_name, city, country, preferred_language, preferred_country, sector, role_type';

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
  if ('sector' in body) profilePatch.sector = sec.clean(body.sector, 80) || null;
  if ('role_type' in body) profilePatch.role_type = sec.clean(body.role_type, 80) || null;

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

// Lenient variant for the concierge's ---PROFILE--- extraction: the model is
// probabilistic, not a form, so one malformed field must not cost the good
// answers in the same block. Each candidate field is validated independently
// through the same rules — invalid ones are dropped and reported, everything
// valid still lands. `rejected` is [{ field, reason }]; PUT keeps the strict
// all-or-nothing validator above so a human gets one clear 400.
function validateIntakeLenient(body) {
  const profilePatch = {}, seekerPatch = {}, rejected = [];
  for (const field of Object.keys(body || {})) {
    const v = validateIntake({ [field]: body[field] });
    if (!v.ok) { rejected.push({ field, reason: v.error }); continue; }
    Object.assign(profilePatch, v.profilePatch);
    Object.assign(seekerPatch, v.seekerPatch);
  }
  return { profilePatch, seekerPatch, rejected };
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
  let profilePatch, seekerPatch, rejected = [];
  if (lenient) {
    ({ profilePatch, seekerPatch, rejected } = validateIntakeLenient(body));
  } else {
    const v = validateIntake(body || {});
    if (!v.ok) {
      const e = new Error(v.error);
      e.isValidation = true;
      throw e;
    }
    ({ profilePatch, seekerPatch } = v);
  }

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

  const mergedSeeker = { ...(existingSeeker || {}), ...seekerPatch };
  const { isComplete, missing } = computeCompleteness({ profile, seekerProfile: mergedSeeker });
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
