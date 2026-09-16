// Every new signup pings the operator inbox (NOTIFY_EMAIL, falling back to
// CONTACT_EMAIL). The harness unsets RESEND_API_KEY, so lib/email.js takes
// its dev-log path — these tests stub global.fetch for api.resend.com only
// and set the key, to observe what the route actually sends.
const { test, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());

const origFetch = global.fetch;
let sent;
beforeEach(() => {
  h.mock.__reset();
  h.mock.__set('banned_emails', { data: null, error: null });
  h.mock.__set('users', { data: null, error: null });                       // address is free
  h.mock.__setOp('users', 'insert', { data: { id: 7, role: 'seeker' }, error: null });
  sent = [];
  global.fetch = (url, opts) => String(url).includes('api.resend.com')
    ? Promise.resolve((sent.push(JSON.parse(opts.body)), new Response('{}', { status: 200 })))
    : origFetch(url, opts);
  process.env.RESEND_API_KEY = 'test-resend-key';
});
afterEach(() => { global.fetch = origFetch; delete process.env.RESEND_API_KEY; delete process.env.NOTIFY_EMAIL; delete process.env.CONTACT_EMAIL; });

let n = 0;
// sec.limits.register is a per-IP ceiling (8/hour) -- this file registers
// more than that across all its tests, so each call needs its own address,
// same pattern as test/voice.test.js/test/cv.test.js's own rate-limit dodge.
// Post-increment, same as the original `n++` — later assertions rely on the
// exact newbieN numbering by call order (e.g. "newbie3@example.invalid").
const register = () => {
  const id = n++;
  return fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.${id % 250}.${(id + 1) % 250}` },
    body: JSON.stringify({
      email: `newbie${id}@example.invalid`, password: 'longenoughpw1',
      name: 'New Seeker', role: 'seeker', acceptTerms: true, confirmAge: true,
    }),
  });
};

test('a signup notifies NOTIFY_EMAIL with the seeker details', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  const r = await register();
  assert.equal(r.status, 200);
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.ok(notify, 'operator notification email should have been sent');
  assert.equal(notify.to, 'ops@example.invalid');
  assert.match(notify.html, /New Seeker/);
  assert.match(notify.html, /newbie0@example\.invalid/);
  assert.match(notify.html, /User ID: 7/);
});

test('without NOTIFY_EMAIL the notification falls back to CONTACT_EMAIL', async () => {
  process.env.CONTACT_EMAIL = 'contact@example.invalid';
  await register();
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.equal(notify.to, 'contact@example.invalid');
});

test('with neither inbox set, only the seeker verification email goes out', async () => {
  await register();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'Confirm your email — Yalla Nsafer');
});

test('the seeker verification email still goes out alongside the notification', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  await register();
  const verify = sent.find(m => m.subject === 'Confirm your email — Yalla Nsafer');
  assert.equal(verify.to, 'newbie3@example.invalid');
});

// ---------- accountType: student vs. job seeker signup ----------
// accountType is a UI/onboarding-intent signal, never an authorization
// concept -- both tracks create the same role: 'seeker' account (see
// routes/auth.js's own comment), so these tests check only the profile
// fields it maps onto (seeking_study/target_degree_level/target_field_of_study),
// never `role`.

const registerWithBody = extra => {
  const id = n++;
  return fetch(h.base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.${id % 250}.${(id + 1) % 250}` },
    body: JSON.stringify({
      email: `newbie${id}@example.invalid`, password: 'longenoughpw1',
      name: 'New Seeker', role: 'seeker', acceptTerms: true, confirmAge: true,
      ...extra,
    }),
  });
};

test('a student signup sets seeking_study true and stores target degree level and field of study', async () => {
  const r = await registerWithBody({ accountType: 'student', targetDegreeLevel: 'graduate', targetFieldOfStudy: 'computer science' });
  assert.equal(r.status, 200);
  const [profile] = h.mock.__writes('profiles', 'insert');
  assert.equal(profile.payload.seeking_study, true);
  assert.equal(profile.payload.target_degree_level, 'graduate');
  assert.equal(profile.payload.target_field_of_study, 'computer science');
});

test('a job-seeker signup (default/omitted accountType) leaves seeking_study false and stores no target fields, even if the body includes them', async () => {
  const r = await registerWithBody({ targetDegreeLevel: 'graduate', targetFieldOfStudy: 'computer science', sector: 'kitchen' });
  assert.equal(r.status, 200);
  const [profile] = h.mock.__writes('profiles', 'insert');
  assert.equal(profile.payload.seeking_study, false);
  assert.equal(profile.payload.target_degree_level, null);
  assert.equal(profile.payload.target_field_of_study, null);
  assert.equal(profile.payload.sector, 'kitchen');
});

test('accountType never touches the account\'s role -- both tracks create a role: seeker account', async () => {
  const studentResult = await registerWithBody({ accountType: 'student' });
  assert.equal(studentResult.status, 200);
  const [userInsert] = h.mock.__writes('users', 'insert');
  assert.ok(!('accountType' in (userInsert?.payload || {})), 'accountType must never reach the users table');
});

test('the operator-notification email states the account type', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  await registerWithBody({ accountType: 'student' });
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.match(notify.html, /Account type: Student/);
});

// ---------- accountType: treatment (medical-travel) signup ----------
// Immigration is NOT its own account type (Hicham's call) -- it stays part
// of the job_seeker/work track, which already carries visa/immigration
// guidance. treatment is the third and last track alongside job_seeker and
// student.

test('a treatment signup sets seeking_treatment true on the profile', async () => {
  const r = await registerWithBody({ accountType: 'treatment' });
  assert.equal(r.status, 200);
  const [profile] = h.mock.__writes('profiles', 'insert');
  assert.equal(profile.payload.seeking_treatment, true);
  assert.equal(profile.payload.seeking_study, false); // tracks don't leak into each other
});

test('a treatment signup with requiredTreatment also creates a medical_intake_requests row', async () => {
  const r = await registerWithBody({ accountType: 'treatment', requiredTreatment: 'total hip replacement', medicalHistoryNote: 'osteoarthritis, right hip' });
  assert.equal(r.status, 200);
  const [intake] = h.mock.__writes('medical_intake_requests', 'insert');
  assert.equal(intake.payload.required_treatment, 'total hip replacement');
  assert.equal(intake.payload.medical_history_note, 'osteoarthritis, right hip');
});

test('a treatment signup with no requiredTreatment stated creates no medical_intake_requests row -- it can be added later', async () => {
  const r = await registerWithBody({ accountType: 'treatment' });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('medical_intake_requests', 'insert').length, 0);
});

test('a job-seeker or student signup never creates a medical_intake_requests row even if requiredTreatment is somehow present in the body', async () => {
  const r = await registerWithBody({ accountType: 'student', requiredTreatment: 'total hip replacement' });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('medical_intake_requests', 'insert').length, 0);
  const [profile] = h.mock.__writes('profiles', 'insert');
  assert.equal(profile.payload.seeking_treatment, false);
});

test('the operator-notification email states "Medical treatment" for a treatment signup', async () => {
  process.env.NOTIFY_EMAIL = 'ops@example.invalid';
  await registerWithBody({ accountType: 'treatment' });
  const notify = sent.find(m => m.subject === 'New signup — Yalla Nsafer');
  assert.match(notify.html, /Account type: Medical treatment/);
});
