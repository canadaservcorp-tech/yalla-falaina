const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const put = (body, token) => fetch(h.base + '/api/profile', {
  method: 'PUT', headers: auth(token), body: JSON.stringify(body),
});
const get = token => fetch(h.base + '/api/profile', { headers: auth(token) });
const user = () => actor(h, { id: 200, role: 'seeker' });

// ---------- PUT validation ----------

test('PUT rejects a blank full_name instead of silently clearing it', async () => {
  const r = await put({ full_name: '   ' }, user());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('PUT rejects an unsupported preferred_language', async () => {
  const r = await put({ preferred_language: 'xx' }, user());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('PUT rejects a non-array JSONB field', async () => {
  const r = await put({ work_history: 'plumber for 10 years' }, user());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('PUT rejects a non-boolean has_* field', async () => {
  const r = await put({ has_passport: 'yes' }, user());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('confirmed_by_user must be a strict boolean, same as confirmAge/acceptTerms at signup', async () => {
  for (const v of ['true', 1, 'yes']) {
    const r = await put({ confirmed_by_user: v }, user());
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
  }
  assert.equal(h.mock.__writes('seeker_profiles', 'upsert').length, 0);
});

// ---------- PUT writes + completeness ----------

test('PUT with no existing seeker_profiles row upserts one as conversational intake', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'en', preferred_country: null, sector: null, role_type: null }, error: null });
  h.mock.__set('seeker_profiles', { data: null, error: null }); // no prior row
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp1', is_complete: false, confirmed_by_user: false }, error: null });

  const r = await put({ preferred_language: 'en', has_passport: true }, user());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.isComplete, false);
  assert.ok(j.missing.includes('confirmed_by_user'));

  const writes = h.mock.__writes('seeker_profiles', 'upsert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.intake_method, 'conversational');
  assert.equal(writes[0].payload.has_passport, true);
  assert.equal(writes[0].payload.is_complete, false);
});

// The full Section-10 intake fixture minus confirmation — everything else answered
// (empty arrays count as answered: an explicit "none" is a valid intake answer).
const NEARLY_DONE_SEEKER = { id: 'sp-existing', confirmed_by_user: false, is_complete: false,
  work_history: [{ employer: 'X', title: 'cook' }], education: [], certifications: [], languages: [{ language: 'ar', level: 'native' }],
  has_passport: true, has_visa: false, has_legal_residency_current_country: true, has_family_or_host_abroad: false };
const FULL_PROFILE = { id: 200, preferred_language: 'en', preferred_country: 'Canada', sector: 'construction', role_type: null };

test('PUT with an existing seeker_profiles row upserts by profile_id — never a second row for the same profile', async () => {
  h.mock.__set('profiles', { data: FULL_PROFILE, error: null });
  h.mock.__set('seeker_profiles', { data: NEARLY_DONE_SEEKER, error: null });
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp-existing', is_complete: true, confirmed_by_user: true }, error: null });

  const r = await put({ confirmed_by_user: true }, user());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.isComplete, true);
  assert.deepEqual(j.missing, []);

  const writes = h.mock.__writes('seeker_profiles', 'upsert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.confirmed_by_user, true);
  assert.equal(writes[0].payload.is_complete, true);
  assert.equal(writes[0].payload.profile_id, 200);
});

test('completeness flips back off when confirmed_by_user is revoked, even if the rest is unchanged', async () => {
  h.mock.__set('profiles', { data: FULL_PROFILE, error: null });
  h.mock.__set('seeker_profiles', { data: { ...NEARLY_DONE_SEEKER, confirmed_by_user: true, is_complete: true }, error: null });
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp-existing', is_complete: false, confirmed_by_user: false }, error: null });

  const r = await put({ confirmed_by_user: false }, user());
  const j = await r.json();
  assert.equal(j.isComplete, false);
  assert.deepEqual(j.missing, ['confirmed_by_user']);
});

test('the seeker_profiles write is a real upsert(onConflict: profile_id) — the concurrency fix this whole write path exists for', async () => {
  // schema.sql's unique(profile_id) is only useful if the write path actually
  // targets that column on conflict. A regression back to a bare .upsert()
  // (which defaults to the primary key `id` — always different per row,
  // since it's uuid_generate_v4()) would silently reopen the exact
  // duplicate-row race this fix closes, while still passing every other
  // test in this file (they only check the payload, not the conflict target).
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'en', preferred_country: null, sector: null, role_type: null }, error: null });
  h.mock.__set('seeker_profiles', { data: null, error: null });
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp1', is_complete: false }, error: null });

  const r = await put({ has_passport: true }, user());
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('seeker_profiles', 'upsert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].opts && writes[0].opts.onConflict, 'profile_id');
});

test('a missing profiles row is self-healed by the upsert rather than 500ing', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'fr', preferred_country: null, sector: null, role_type: null }, error: null });
  h.mock.__set('seeker_profiles', { data: null, error: null });
  h.mock.__setOp('seeker_profiles', 'upsert', { data: { id: 'sp1', is_complete: false }, error: null });

  const r = await put({ preferred_language: 'fr' }, user());
  assert.equal(r.status, 200);
  const upserts = h.mock.__writes('profiles', 'upsert');
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].payload.id, 200);
  assert.equal(upserts[0].payload.preferred_language, 'fr');
});

// ---------- GET ----------

test('GET requires a signed-in, verified user', async () => {
  assert.equal((await fetch(h.base + '/api/profile')).status, 401);
});

test('GET lists exactly what is missing for an incomplete profile', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: null, preferred_country: null, sector: null, role_type: 'driver' }, error: null });
  h.mock.__set('seeker_profiles', { data: { confirmed_by_user: false, is_complete: false }, error: null });
  const r = await get(user());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.isComplete, false);
  assert.deepEqual(j.missing.sort(), ['certifications', 'confirmed_by_user', 'education', 'has_family_or_host_abroad', 'has_legal_residency_current_country',
    'has_passport', 'has_visa', 'languages', 'preferred_country', 'preferred_language', 'work_history']);
});

test('a false travel-status answer counts as answered — only unanswered booleans are missing', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'en', preferred_country: 'Canada', sector: 'hospitality', role_type: null }, error: null });
  h.mock.__set('seeker_profiles', { data: { confirmed_by_user: false, is_complete: false,
    work_history: [{ employer: 'X', title: 'cook' }], education: [], certifications: [], languages: [{ language: 'en', level: 'basic' }],
    has_passport: false, has_visa: false, has_legal_residency_current_country: false, has_family_or_host_abroad: false }, error: null });
  const r = await get(user());
  const j = await r.json();
  assert.equal(j.isComplete, false);
  assert.deepEqual(j.missing, ['confirmed_by_user']);
});

test('empty arrays count as answered, but unset fields still list as missing', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'en', preferred_country: 'Canada', sector: null, role_type: 'driver' }, error: null });
  h.mock.__set('seeker_profiles', { data: { confirmed_by_user: false, is_complete: false,
    work_history: [], education: [], certifications: [], languages: [],
    has_passport: false, has_visa: false, has_legal_residency_current_country: null, has_family_or_host_abroad: false }, error: null });
  const r = await get(user());
  const j = await r.json();
  assert.equal(j.isComplete, false);
  // the never-written boolean is missing; explicit [] and false are not
  assert.deepEqual(j.missing.sort(), ['confirmed_by_user', 'has_legal_residency_current_country']);
});

test('GET reports a complete profile with nothing missing', async () => {
  h.mock.__set('profiles', { data: { id: 200, preferred_language: 'ar', preferred_country: 'UAE', sector: null, role_type: 'electrician' }, error: null });
  h.mock.__set('seeker_profiles', { data: { confirmed_by_user: true, is_complete: true,
    work_history: [{ employer: 'X', title: 'tech' }], education: [], certifications: [], languages: [{ language: 'ar', level: 'native' }],
    has_passport: true, has_visa: true, has_legal_residency_current_country: true, has_family_or_host_abroad: true }, error: null });
  const r = await get(user());
  const j = await r.json();
  assert.equal(j.isComplete, true);
  assert.deepEqual(j.missing, []);
});

test('GET on an account with no profile row at all reports everything missing, not a crash', async () => {
  h.mock.__set('profiles', { data: null, error: null });
  h.mock.__set('seeker_profiles', { data: null, error: null });
  const r = await get(user());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.isComplete, false);
  assert.equal(j.profile, null);
  assert.deepEqual(j.missing.sort(), ['certifications', 'confirmed_by_user', 'education', 'has_family_or_host_abroad', 'has_legal_residency_current_country',
    'has_passport', 'has_visa', 'languages', 'preferred_country', 'preferred_language', 'sector_or_role_type', 'work_history']);
});
