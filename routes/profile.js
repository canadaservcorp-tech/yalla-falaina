// Roadmap Step 6 — profile completeness gate (Section 10). This is the
// conversational-intake write path the concierge chat will call as it collects
// answers turn by turn, so PUT is a partial update: only fields actually present
// in the body are touched, nothing else is cleared. GET returns the merged
// profile plus which fields are still missing, for the client to render the gate.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { computeCompleteness } = require('../lib/profileCompleteness');
const router = express.Router();

// Kept in sync with routes/auth.js's LANGUAGES by hand — not shared, so that
// registration's dialect list and profile completion can diverge later without
// coupling the two files together.
const LANGUAGES = ['ar-LB', 'ar-SY', 'ar-EG', 'ar', 'fr', 'en'];
const JSON_ARRAY_FIELDS = ['work_history', 'education', 'certifications', 'languages'];
const MAX_JSON_ITEMS = 40;
const MAX_JSON_BYTES = 20000; // generous for real intake data, small next to the 128kb body cap
const BOOL_FIELDS = ['has_passport', 'has_visa', 'has_legal_residency_current_country', 'has_family_or_host_abroad'];

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

async function loadCurrent(profileId) {
  const { data: profile } = await supabase.from('profiles')
    .select('id, full_name, city, country, preferred_language, preferred_country, sector, role_type')
    .eq('id', profileId).maybeSingle();
  // No unique constraint on seeker_profiles.profile_id (schema.sql) — a real
  // upsert-by-profile_id isn't possible yet, so this reads the most recent row
  // by hand and the write below updates-by-id or inserts, never upserts.
  const { data: seekerProfile } = await supabase.from('seeker_profiles')
    .select('id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { profile, seekerProfile };
}

router.get('/', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { profile, seekerProfile } = await loadCurrent(req.user.id);
    const { isComplete, missing } = computeCompleteness({ profile, seekerProfile });
    res.json({ success: true, profile: profile || null, seekerProfile: seekerProfile || null, isComplete, missing });
  } catch (e) {
    console.error('profile get', e);
    res.status(500).json({ error: 'Could not load profile', code: 'ERR_SERVER' });
  }
});

router.put('/', sec.limits.write, authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const body = req.body || {};
    const profilePatch = {};
    if ('full_name' in body) {
      const v = sec.clean(body.full_name, 80);
      if (!v) return res.status(400).json({ error: 'full_name cannot be empty', code: 'ERR_BAD_INPUT' });
      profilePatch.full_name = v;
    }
    if ('city' in body) profilePatch.city = sec.clean(body.city, 80) || null;
    if ('country' in body) profilePatch.country = sec.clean(body.country, 60) || null;
    if ('preferred_language' in body) {
      if (!LANGUAGES.includes(body.preferred_language))
        return res.status(400).json({ error: 'Invalid preferred_language', code: 'ERR_BAD_INPUT' });
      profilePatch.preferred_language = body.preferred_language;
    }
    if ('preferred_country' in body) profilePatch.preferred_country = sec.clean(body.preferred_country, 60) || null;
    if ('sector' in body) profilePatch.sector = sec.clean(body.sector, 80) || null;
    if ('role_type' in body) profilePatch.role_type = sec.clean(body.role_type, 80) || null;

    const seekerPatch = {};
    for (const field of JSON_ARRAY_FIELDS) {
      if (!(field in body)) continue;
      const { ok, value } = cleanJsonArray(body[field]);
      if (!ok) return res.status(400).json({ error: `${field} must be a reasonably small array`, code: 'ERR_BAD_INPUT' });
      seekerPatch[field] = value;
    }
    for (const field of BOOL_FIELDS) {
      if (!(field in body)) continue;
      if (typeof body[field] !== 'boolean')
        return res.status(400).json({ error: `${field} must be true or false`, code: 'ERR_BAD_INPUT' });
      seekerPatch[field] = body[field];
    }
    // Strict boolean, same as confirmAge/acceptTerms at signup — a truthy string
    // ("true", "1") must never silently count as confirmation.
    if ('confirmed_by_user' in body) {
      if (body.confirmed_by_user !== true && body.confirmed_by_user !== false)
        return res.status(400).json({ error: 'confirmed_by_user must be true or false', code: 'ERR_BAD_INPUT' });
      seekerPatch.confirmed_by_user = body.confirmed_by_user;
    }

    // profiles.id is the primary key, so this both self-heals a profile row a
    // failed signup-time insert left missing (routes/auth.js) and applies the
    // patch — same pattern routes/concierge.js already uses to ensure the row.
    const { data: profile, error: pErr } = await supabase.from('profiles')
      .upsert({ id: req.user.id, ...profilePatch }, { onConflict: 'id' })
      .select('id, full_name, city, country, preferred_language, preferred_country, sector, role_type')
      .single();
    if (pErr) throw pErr;

    const { data: existingSeeker, error: sErr } = await supabase.from('seeker_profiles')
      .select('*').eq('profile_id', req.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (sErr) throw sErr;

    const mergedSeeker = { ...(existingSeeker || {}), ...seekerPatch };
    const { isComplete, missing } = computeCompleteness({ profile, seekerProfile: mergedSeeker });
    const seekerRow = {
      profile_id: req.user.id,
      intake_method: 'conversational',
      ...seekerPatch,
      is_complete: isComplete,
      updated_at: new Date().toISOString(),
    };

    let seekerProfile;
    if (existingSeeker) {
      const { data, error } = await supabase.from('seeker_profiles')
        .update(seekerRow).eq('id', existingSeeker.id)
        .select('id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user')
        .single();
      if (error) throw error;
      seekerProfile = data;
    } else {
      const { data, error } = await supabase.from('seeker_profiles')
        .insert(seekerRow)
        .select('id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user')
        .single();
      if (error) throw error;
      seekerProfile = data;
    }

    res.json({ success: true, profile, seekerProfile, isComplete, missing });
  } catch (e) {
    console.error('profile put', e);
    res.status(500).json({ error: 'Could not save profile', code: 'ERR_SERVER' });
  }
});

module.exports = router;
