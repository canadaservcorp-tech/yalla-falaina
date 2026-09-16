// routes/study-opportunities.js (public submit) + routes/admin-study-opportunities.js
// (moderation queue) -- same submit -> pending -> admin-review -> live-row shape as
// test/informal-listings.test.js, for the international-students vertical.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const submit = body => fetch(h.base + '/api/study-opportunities', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const admin = () => auth(actor(h, { id: 910, role: 'admin' }));

test('missing contact, kind, or title is refused before touching the database', async () => {
  for (const body of [{ title: 'x', kind: 'program' }, { contact: 'c', kind: 'program' }, { contact: 'c', title: 'x' }, {}]) {
    const r = await submit(body);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
  }
  assert.equal(h.mock.__writes('study_opportunity_submissions', 'insert').length, 0);
});

test('an unrecognized kind is treated as missing, not silently accepted', async () => {
  const r = await submit({ contact: 'c', title: 'x', kind: 'internship' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('a malformed deadline is dropped rather than stored garbage or rejecting the submission', async () => {
  const r = await submit({ contact: 'whatsapp +96170000000', title: 'Master in CS', kind: 'program', country: 'France', deadline: '15 janvier' });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('study_opportunity_submissions', 'insert');
  assert.equal(writes[0].payload.deadline, null);
});

test('an obviously prohibited submission is refused, never stored', async () => {
  const r = await submit({ contact: 'c', title: 'Scholarship for onlyfans creators', kind: 'scholarship', country: 'Canada' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'ERR_FORBIDDEN');
  assert.equal(h.mock.__writes('study_opportunity_submissions', 'insert').length, 0);
});

test('a normal submission is accepted and stored as pending', async () => {
  const r = await submit({
    contact: 'whatsapp +96170000000', title: 'Master in Computer Science', kind: 'program',
    institution: 'Université Laval', country: 'Canada', city: 'Québec', degreeLevel: 'masters',
    fieldOfStudy: 'computer science', deadline: '2027-01-15', description: 'Bourse d\'excellence available.',
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).success, true);
  const writes = h.mock.__writes('study_opportunity_submissions', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.kind, 'program');
  assert.equal(writes[0].payload.institution, 'Université Laval');
  assert.equal(writes[0].payload.deadline, '2027-01-15');
  assert.ok(!('review_status' in writes[0].payload));
});

test('a DB error on submit returns a clean 500, not a leaked stack trace', async () => {
  h.mock.__setOp('study_opportunity_submissions', 'insert', { data: null, error: { message: 'connection refused' } });
  const r = await submit({ contact: 'c', title: 't', kind: 'program' });
  assert.equal(r.status, 500);
  assert.equal((await r.json()).code, 'ERR_SERVER');
});

test('admin routes require a signed-in admin, not just a signed-in user', async () => {
  assert.equal((await fetch(h.base + '/api/admin/study-opportunities')).status, 401);
  const seekerToken = auth(actor(h, { id: 911, role: 'seeker' }));
  const r = await fetch(h.base + '/api/admin/study-opportunities', { headers: seekerToken });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'ERR_FORBIDDEN');
});

test('GET /api/admin/study-opportunities defaults to pending and lists rows', async () => {
  const rows = [{ id: 's1', title: 'Master in CS', review_status: 'pending' }];
  h.mock.__set('study_opportunity_submissions', { data: rows, error: null });
  const r = await fetch(h.base + '/api/admin/study-opportunities', { headers: admin() });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).submissions, rows);
});

test('approving a pending submission creates a study_opportunities row marked consultant_submission', async () => {
  const sub = {
    id: 'a1b2c3d4-0000-4000-8000-000000000021', kind: 'scholarship', title: 'Excellence Bourse',
    institution: 'UQAM', country: 'Canada', city: 'Montréal', degree_level: 'masters',
    field_of_study: 'engineering', deadline: '2027-03-01', description: 'Full tuition waiver.',
    review_status: 'pending',
  };
  h.mock.__set('study_opportunity_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/study-opportunities/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 200);
  const oppWrites = h.mock.__writes('study_opportunities', 'insert');
  assert.equal(oppWrites.length, 1);
  assert.equal(oppWrites[0].payload.source_type, 'consultant_submission');
  assert.equal(oppWrites[0].payload.kind, 'scholarship');
  assert.equal(oppWrites[0].payload.institution, 'UQAM');
  assert.equal(oppWrites[0].payload.requirements, sub.description);
  const subWrites = h.mock.__writes('study_opportunity_submissions', 'update');
  assert.equal(subWrites[0].payload.review_status, 'approved');
});

test('rejecting a submission requires a reason and never touches study_opportunities', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000022', title: 'x', kind: 'program', review_status: 'pending' };
  h.mock.__set('study_opportunity_submissions', { data: sub, error: null });
  const noReason = await fetch(h.base + `/api/admin/study-opportunities/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected' }),
  });
  assert.equal(noReason.status, 400);

  const r = await fetch(h.base + `/api/admin/study-opportunities/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected', reason: 'not credible' }),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('study_opportunities', 'insert').length, 0);
  assert.equal(h.mock.__writes('study_opportunity_submissions', 'update')[0].payload.rejection_reason, 'not credible');
});

test('a submission that no longer exists resolves to a 404, not a 500', async () => {
  h.mock.__set('study_opportunity_submissions', { data: null, error: null });
  const r = await fetch(h.base + '/api/admin/study-opportunities/a1b2c3d4-0000-4000-8000-000000000099/review', {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 404);
});

test('a submission already reviewed cannot be reviewed again', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000023', title: 'x', kind: 'program', review_status: 'approved' };
  h.mock.__set('study_opportunity_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/study-opportunities/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 400);
  assert.equal(h.mock.__writes('study_opportunities', 'insert').length, 0);
});

test('a prohibited submission that slipped past the public guard is re-checked and refused at approval time', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000024', title: 'Onlyfans mentorship program', kind: 'program', review_status: 'pending' };
  h.mock.__set('study_opportunity_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/study-opportunities/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 403);
  assert.equal(h.mock.__writes('study_opportunities', 'insert').length, 0);
});
