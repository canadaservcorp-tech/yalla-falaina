// routes/cv.js: CV export (PDF/Word) is a hard, always-on subscription gate
// (see that file's header comment) -- these tests cover the gate itself
// (unauthenticated, unsubscribed, subscribed-but-not-ready, subscribed) and
// the free /preview tease. lib/cvBuilder.js's pure data-shaping functions
// are covered directly, without needing a request at all.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');
const { buildCvData, cvReadiness, describeWorkEntry, describeEducationEntry, describeCertification, describeLanguage } = require('../lib/cvBuilder');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

// ---------- lib/cvBuilder.js: pure functions, no request needed ----------

test('buildCvData prefers profiles.full_name over users.name, and pulls contact info from users', () => {
  const data = buildCvData({
    user: { name: 'Fallback Name', email: 'a@b.com', phone: '555-0100' },
    profile: { full_name: 'Real Name', city: 'Laval', country: 'Canada', role_type: 'Electrician' },
    seekerProfile: {},
    lang: 'en',
  });
  assert.equal(data.name, 'Real Name');
  assert.equal(data.email, 'a@b.com');
  assert.equal(data.phone, '555-0100');
  assert.equal(data.headline, 'Electrician');
});

test('buildCvData falls back to users.name when profiles.full_name is unset', () => {
  const data = buildCvData({ user: { name: 'Fallback Name' }, profile: {}, seekerProfile: {}, lang: 'en' });
  assert.equal(data.name, 'Fallback Name');
});

test('buildCvData defaults an unrecognized/missing lang to "en", never Arabic (see file header: this platform never renders an Arabic CV)', () => {
  assert.equal(buildCvData({ profile: {}, seekerProfile: {} }).lang, 'en');
  assert.equal(buildCvData({ profile: {}, seekerProfile: {}, lang: 'ar' }).lang, 'en');
  assert.equal(buildCvData({ profile: {}, seekerProfile: {}, lang: 'fr' }).lang, 'fr');
});

test('buildCvData coerces a non-array work_history/education/etc. to an empty array rather than throwing', () => {
  const data = buildCvData({ profile: {}, seekerProfile: { work_history: 'not an array', education: null } });
  assert.deepEqual(data.workHistory, []);
  assert.deepEqual(data.education, []);
});

test('cvReadiness requires a name AND at least one substantive section', () => {
  assert.deepEqual(cvReadiness({ name: '', workHistory: [], education: [], certifications: [] }), { ready: false, reason: 'missing_name' });
  assert.deepEqual(cvReadiness({ name: 'X', workHistory: [], education: [], certifications: [] }), { ready: false, reason: 'no_content' });
  assert.equal(cvReadiness({ name: 'X', workHistory: [{}], education: [], certifications: [] }).ready, true);
  assert.equal(cvReadiness({ name: 'X', workHistory: [], education: [], certifications: ['ASP'] }).ready, true);
});

test('the describe* helpers accept a bare string as well as the documented object shape (both are real intake shapes -- see lib/profileWrite.js)', () => {
  assert.deepEqual(describeWorkEntry('Freelance electrician'), { title: 'Freelance electrician', subtitle: '', body: '' });
  assert.equal(describeWorkEntry({ title: 'Electrician', employer: 'Acme' }).title, 'Electrician — Acme');
  assert.deepEqual(describeEducationEntry('Self-taught'), { title: 'Self-taught', subtitle: '' });
  assert.equal(describeCertification('ASP Card'), 'ASP Card');
  assert.equal(describeCertification({ name: 'First Aid', issuer: 'Red Cross' }), 'First Aid — Red Cross');
  assert.equal(describeLanguage('English'), 'English');
  assert.equal(describeLanguage({ language: 'French', level: 'Native' }), 'French – Native');
});

// ---------- routes ----------

// Returns the raw JWT (see helpers/appHarness.js) -- call sites wrap it in
// auth(token) themselves. (Earlier draft returned auth(actor(...)) directly,
// which double-wrapped: auth() called again on an already-built headers
// object serializes to "Bearer [object Object]", so every request came back
// 401 regardless of the fixture -- caught by running this file.)
const caller = (userExtra = {}, profile = {}, seekerProfile = {}) => {
  const id = 900 + Math.floor(Math.random() * 100000);
  const row = { id, role: 'seeker', banned: false, email_verified: true,
    name: 'Test User', email: 'test@example.com', phone: '555-0100',
    subscription_status: 'inactive', ...userExtra };
  h.mock.__queue('users', { data: row, error: null }, { data: row, error: null });
  h.mock.__set('profiles', { data: profile, error: null });
  h.mock.__set('seeker_profiles', { data: seekerProfile, error: null });
  return actor(h, { id, role: 'seeker' });
};

// routes/cv.js's /export is behind sec.limits.cv (6 requests/minute/IP --
// lib/security.js), applied before the auth check, so every /export hit in
// this file -- 401s included -- counts against the same bucket. This file
// makes more than 6 such calls, so each gets its own X-Forwarded-For (the
// same spread-IPs trick test/error-codes.test.js uses), keyed off trust
// proxy 1 in server.js, rather than sharing one IP and tripping the limiter
// partway through the file.
let exportCallNum = 0;
const exportHeaders = token => ({ ...auth(token), 'X-Forwarded-For': '10.44.' + (++exportCallNum % 250) + '.1' });

const READY_PROFILE = { full_name: 'Jean Dupont', city: 'Laval', country: 'Canada', role_type: 'Electrician' };
const READY_SEEKER = { work_history: [{ employer: 'Acme', title: 'Electrician', start_date: '2019', end_date: '2024' }], education: [], certifications: [], languages: [] };

test('GET /api/cv/preview without a token -> 401', async () => {
  const r = await fetch(h.base + '/api/cv/preview');
  assert.equal(r.status, 401);
});

test('GET /api/cv/preview is free for an unsubscribed seeker: reports readiness and counts, subscribed:false, never the file', async () => {
  const token = caller({}, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/preview', { headers: auth(token) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ready, true);
  assert.equal(body.subscribed, false);
  assert.equal(body.counts.workHistory, 1);
});

test('GET /api/cv/preview reports ready:false, reason "no_content", once there is a name but no work/education/certifications yet', async () => {
  // caller()'s fixture row always has users.name set ('Test User'), and
  // buildCvData falls back to it when profiles.full_name is unset (see
  // lib/cvBuilder.js) -- so an empty profile/seekerProfile still resolves a
  // name, and the gap this hits is "no substantive section," not "no name."
  const token = caller({}, {}, {});
  const r = await fetch(h.base + '/api/cv/preview', { headers: auth(token) });
  const body = await r.json();
  assert.equal(body.ready, false);
  assert.equal(body.reason, 'no_content');
});

test('GET /api/cv/preview reports ready:false, reason "missing_name", when neither profiles.full_name nor users.name is set', async () => {
  const token = caller({ name: '' }, {}, {});
  const r = await fetch(h.base + '/api/cv/preview', { headers: auth(token) });
  const body = await r.json();
  assert.equal(body.ready, false);
  assert.equal(body.reason, 'missing_name');
});

test('GET /api/cv/export without a token -> 401', async () => {
  const r = await fetch(h.base + '/api/cv/export');
  assert.equal(r.status, 401);
});

test('GET /api/cv/export refuses an unsubscribed seeker with 402 ERR_CV_SUBSCRIPTION_REQUIRED -- the hard gate, unconditional on PAYWALL_ENFORCED', async () => {
  delete process.env.PAYWALL_ENFORCED; // deliberately unset/false -- the CV gate must hold anyway
  const token = caller({ subscription_status: 'inactive' }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export', { headers: exportHeaders(token) });
  assert.equal(r.status, 402);
  const body = await r.json();
  assert.equal(body.code, 'ERR_CV_SUBSCRIPTION_REQUIRED');
});

test('GET /api/cv/export refuses a subscribed seeker with too little collected yet -- 422 ERR_CV_NOT_READY, not a blank/broken file', async () => {
  const token = caller({ subscription_status: 'active' }, {}, {});
  const r = await fetch(h.base + '/api/cv/export', { headers: exportHeaders(token) });
  assert.equal(r.status, 422);
  const body = await r.json();
  assert.equal(body.code, 'ERR_CV_NOT_READY');
});

// ---------- referral bonus access (lib/access.js) ----------
// A referral-reward bonus (users.bonus_access_until) must open this same hard
// gate with no real subscription at all -- see lib/access.js and this file's
// header comment on why the CV export gate has to honor it too.
const FUTURE_BONUS = new Date(Date.now() + 5 * 86400000).toISOString();
const PAST_BONUS = new Date(Date.now() - 5 * 86400000).toISOString();

test('GET /api/cv/preview reports subscribed:true for an unsubscribed seeker with a live referral bonus', async () => {
  const token = caller({ subscription_status: 'inactive', bonus_access_until: FUTURE_BONUS }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/preview', { headers: auth(token) });
  const body = await r.json();
  assert.equal(body.subscribed, true);
});

test('GET /api/cv/export succeeds for an unsubscribed seeker with a live referral bonus -- no real subscription needed', async () => {
  const token = caller({ subscription_status: 'inactive', bonus_access_until: FUTURE_BONUS }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export', { headers: exportHeaders(token) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
});

test('GET /api/cv/export still refuses an unsubscribed seeker once their referral bonus has expired', async () => {
  const token = caller({ subscription_status: 'inactive', bonus_access_until: PAST_BONUS }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export', { headers: exportHeaders(token) });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).code, 'ERR_CV_SUBSCRIPTION_REQUIRED');
});

test('GET /api/cv/export?format=pdf returns a real PDF, attached, once subscribed and ready', async () => {
  const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export?format=pdf', { headers: exportHeaders(token) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="CV-Jean-Dupont\.pdf"$/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.match(buf.toString('latin1', 0, 5), /^%PDF-/); // real PDF magic bytes, not a stub
});

test('GET /api/cv/export?format=docx returns a real .docx, attached, once subscribed and ready', async () => {
  const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export?format=docx', { headers: exportHeaders(token) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(r.headers.get('content-disposition'), /filename="CV-Jean-Dupont\.docx"$/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.toString('latin1', 0, 2), 'PK'); // .docx is a zip container -- real magic bytes, not a stub
});

test('an unrecognized format query param falls back to pdf rather than erroring', async () => {
  const token = caller({ subscription_status: 'active' }, READY_PROFILE, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export?format=exe', { headers: exportHeaders(token) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
});

test('a name with punctuation/spaces produces a safe filename slug, not a broken Content-Disposition header', async () => {
  const token = caller({ subscription_status: 'active' }, { ...READY_PROFILE, full_name: "O'Brien-Smith, Jr." }, READY_SEEKER);
  const r = await fetch(h.base + '/api/cv/export', { headers: exportHeaders(token) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="CV-O-Brien-Smith-Jr\.pdf"$/);
});
