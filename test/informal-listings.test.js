const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const submit = body => fetch(h.base + '/api/informal-listings', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const admin = () => auth(actor(h, { id: 900, role: 'admin' }));

test('missing contact or title is refused before touching the database', async () => {
  for (const body of [{ title: 'Shawarma master needed' }, { contact: '+96170000000' }, {}]) {
    const r = await submit(body);
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.code, 'ERR_BAD_INPUT');
  }
  assert.equal(h.mock.__writes('informal_listing_submissions', 'insert').length, 0);
});

test('an obviously prohibited category is refused, never stored', async () => {
  const r = await submit({ contact: 'whatsapp +96170000000', title: 'Escort needed urgently', country: 'Lebanon' });
  assert.equal(r.status, 403);
  const j = await r.json();
  assert.equal(j.code, 'ERR_FORBIDDEN');
  assert.equal(h.mock.__writes('informal_listing_submissions', 'insert').length, 0);
});

test('a normal submission is accepted and stored as pending', async () => {
  const r = await submit({ contact: 'whatsapp +96170000000', title: 'Shawarma master needed today', country: 'Lebanon', category: 'food service', description: 'Urgent, downtown Beirut restaurant.' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  const writes = h.mock.__writes('informal_listing_submissions', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.submitted_by_contact, 'whatsapp +96170000000');
  assert.equal(writes[0].payload.title, 'Shawarma master needed today');
  // review_status is left to the DB default ('pending') — never set by the client path
  assert.ok(!('review_status' in writes[0].payload));
});

test('a DB error on submit still returns a clean 500, not a leaked stack trace', async () => {
  h.mock.__setOp('informal_listing_submissions', 'insert', { data: null, error: { message: 'connection refused' } });
  const r = await submit({ contact: 'c', title: 't' });
  assert.equal(r.status, 500);
  const j = await r.json();
  assert.equal(j.code, 'ERR_SERVER');
  assert.ok(!/connection refused/.test(JSON.stringify(j)));
});

// Last of the public-submit tests deliberately: express-rate-limit's counter for this
// route is process-wide (an in-memory fallback keyed by IP, shared across every test
// in this file, not reset by beforeEach), so this exhausts whatever budget remains
// rather than assuming a fresh window.
test('the public submit endpoint is rate limited per address', async () => {
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) {
    const r = await submit({ contact: 'c' + i, title: 't' + i });
    limited = r.status === 429;
  }
  assert.ok(limited, 'repeated submissions from one address should eventually be capped');
});

test('admin routes require a signed-in admin, not just a signed-in user', async () => {
  assert.equal((await fetch(h.base + '/api/admin/informal-listings')).status, 401);
  const seekerToken = auth(actor(h, { id: 901, role: 'seeker' }));
  const r = await fetch(h.base + '/api/admin/informal-listings', { headers: seekerToken });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'ERR_FORBIDDEN');
});

test('GET /api/admin/informal-listings defaults to pending and lists rows', async () => {
  const rows = [{ id: 's1', title: 'Shawarma master needed', review_status: 'pending' }];
  h.mock.__set('informal_listing_submissions', { data: rows, error: null });
  const r = await fetch(h.base + '/api/admin/informal-listings', { headers: admin() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.deepEqual(j.submissions, rows);
});

test('approving a pending submission creates a job row with source_type informal_unverified', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000001', title: 'Shawarma master needed', country: 'Lebanon', category: 'food service', description: 'Urgent', review_status: 'pending' };
  h.mock.__set('informal_listing_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/informal-listings/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 200);
  const jobWrites = h.mock.__writes('jobs', 'insert');
  assert.equal(jobWrites.length, 1);
  assert.equal(jobWrites[0].payload.source_type, 'informal_unverified');
  assert.equal(jobWrites[0].payload.external_source, 'informal_submission');
  assert.equal(jobWrites[0].payload.title, sub.title);
  // Lebanon maps to the zone-local track (lib/jobsIngest.js's trackFor), not demand-led
  assert.equal(jobWrites[0].payload.track, 'zone-local');
  const subWrites = h.mock.__writes('informal_listing_submissions', 'update');
  assert.equal(subWrites.length, 1);
  assert.equal(subWrites[0].payload.review_status, 'approved');
});

test('rejecting a submission requires a reason and never touches jobs', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000002', title: 'x', country: null, review_status: 'pending' };
  h.mock.__set('informal_listing_submissions', { data: sub, error: null });
  const noReason = await fetch(h.base + `/api/admin/informal-listings/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected' }),
  });
  assert.equal(noReason.status, 400);
  assert.equal((await noReason.json()).code, 'ERR_BAD_INPUT');

  const r = await fetch(h.base + `/api/admin/informal-listings/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected', reason: 'prohibited_category' }),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('jobs', 'insert').length, 0);
  const subWrites = h.mock.__writes('informal_listing_submissions', 'update');
  assert.equal(subWrites[0].payload.review_status, 'rejected');
  assert.equal(subWrites[0].payload.rejection_reason, 'prohibited_category');
});

test('a submission that no longer exists resolves to a 404, not a 500', async () => {
  h.mock.__set('informal_listing_submissions', { data: null, error: null });
  const r = await fetch(h.base + '/api/admin/informal-listings/a1b2c3d4-0000-4000-8000-000000000099/review', {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 404);
  assert.equal((await r.json()).code, 'ERR_NOT_FOUND');
});

test('a submission already reviewed cannot be reviewed again', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000003', title: 'x', review_status: 'approved' };
  h.mock.__set('informal_listing_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/informal-listings/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 400);
  assert.equal(h.mock.__writes('jobs', 'insert').length, 0);
});
