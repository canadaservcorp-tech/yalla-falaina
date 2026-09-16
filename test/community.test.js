// routes/community.js (public submit for both diaspora groups and the
// accommodation board) + routes/admin-community.js (their two moderation
// queues) -- same submit -> pending -> admin-review -> live-row shape as
// test/informal-listings.test.js.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const submitGroup = body => fetch(h.base + '/api/community/groups', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const submitAccommodation = body => fetch(h.base + '/api/community/accommodation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const admin = () => auth(actor(h, { id: 920, role: 'admin' }));

// ---------- groups: public submit ----------

test('a group submission missing contact, name, or url is refused before touching the database', async () => {
  for (const body of [{ name: 'n', url: 'https://x.com' }, { contact: 'c', url: 'https://x.com' }, { contact: 'c', name: 'n' }]) {
    const r = await submitGroup(body);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
  }
  assert.equal(h.mock.__writes('community_group_submissions', 'insert').length, 0);
});

test('an unrecognized platform is dropped to null rather than rejecting the submission', async () => {
  const r = await submitGroup({ contact: 'c', name: 'Montreal Arabs', url: 'https://fb.com/x', platform: 'myspace' });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('community_group_submissions', 'insert')[0].payload.platform, null);
});

test('a prohibited group name is refused, never stored', async () => {
  const r = await submitGroup({ contact: 'c', name: 'Escort meetup group', url: 'https://fb.com/x' });
  assert.equal(r.status, 403);
  assert.equal(h.mock.__writes('community_group_submissions', 'insert').length, 0);
});

test('a normal group submission is accepted and stored as pending', async () => {
  const r = await submitGroup({ contact: 'whatsapp +15145550000', name: 'Laval Lebanese Diaspora', url: 'https://fb.com/laval-leb', platform: 'facebook', country: 'Canada', city: 'Laval', language: 'ar' });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('community_group_submissions', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.name, 'Laval Lebanese Diaspora');
  assert.equal(writes[0].payload.city, 'Laval');
  assert.ok(!('review_status' in writes[0].payload));
});

// ---------- accommodation: public submit ----------

test('an accommodation submission missing contact, type, country, or city is refused', async () => {
  for (const body of [{ type: 'couchsurf', country: 'UAE', city: 'Dubai' }, { contact: 'c', country: 'UAE', city: 'Dubai' }, { contact: 'c', type: 'couchsurf', city: 'Dubai' }, { contact: 'c', type: 'couchsurf', country: 'UAE' }]) {
    const r = await submitAccommodation(body);
    assert.equal(r.status, 400);
  }
  assert.equal(h.mock.__writes('accommodation_submissions', 'insert').length, 0);
});

test('an unrecognized accommodation type is treated as missing', async () => {
  const r = await submitAccommodation({ contact: 'c', type: 'hostel', country: 'UAE', city: 'Dubai' });
  assert.equal(r.status, 400);
});

test('a prohibited accommodation description is refused', async () => {
  const r = await submitAccommodation({ contact: 'c', type: 'roommate', country: 'UAE', city: 'Dubai', description: 'sugar daddy arrangement preferred' });
  assert.equal(r.status, 403);
  assert.equal(h.mock.__writes('accommodation_submissions', 'insert').length, 0);
});

test('a normal accommodation submission is accepted and stored as pending', async () => {
  const r = await submitAccommodation({ contact: 'email a@example.com', type: 'sublet', country: 'Canada', city: 'Montreal', budgetNote: '$900/mo', description: 'Sublet June-Aug near metro.' });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('accommodation_submissions', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.type, 'sublet');
  assert.equal(writes[0].payload.budget_note, '$900/mo');
});

// ---------- admin: groups ----------

test('group admin routes require a signed-in admin, not just a signed-in user', async () => {
  assert.equal((await fetch(h.base + '/api/admin/community/groups')).status, 401);
  const seekerToken = auth(actor(h, { id: 921, role: 'seeker' }));
  assert.equal((await fetch(h.base + '/api/admin/community/groups', { headers: seekerToken })).status, 403);
});

test('approving a pending group submission creates a community_groups row', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000031', name: 'Laval Lebanese Diaspora', url: 'https://fb.com/laval-leb', platform: 'facebook', country: 'Canada', city: 'Laval', language: 'ar', review_status: 'pending' };
  h.mock.__set('community_group_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/community/groups/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('community_groups', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.name, sub.name);
  assert.equal(writes[0].payload.url, sub.url);
  assert.equal(h.mock.__writes('community_group_submissions', 'update')[0].payload.review_status, 'approved');
});

test('rejecting a group submission requires a reason and never touches community_groups', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000032', name: 'x', review_status: 'pending' };
  h.mock.__set('community_group_submissions', { data: sub, error: null });
  const noReason = await fetch(h.base + `/api/admin/community/groups/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected' }),
  });
  assert.equal(noReason.status, 400);
  const r = await fetch(h.base + `/api/admin/community/groups/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected', reason: 'dead link' }),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('community_groups', 'insert').length, 0);
});

test('a group submission already reviewed cannot be reviewed again', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000033', name: 'x', review_status: 'approved' };
  h.mock.__set('community_group_submissions', { data: sub, error: null });
  const r = await fetch(h.base + `/api/admin/community/groups/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 400);
});

// ---------- admin: accommodation ----------

test('accommodation admin routes require a signed-in admin, not just a signed-in user', async () => {
  assert.equal((await fetch(h.base + '/api/admin/community/accommodation')).status, 401);
  const seekerToken = auth(actor(h, { id: 922, role: 'seeker' }));
  assert.equal((await fetch(h.base + '/api/admin/community/accommodation', { headers: seekerToken })).status, 403);
});

test('approving a pending accommodation submission creates an active listing that expires in 30 days, using the submitter contact', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000034', type: 'couchsurf', country: 'UAE', city: 'Dubai', budget_note: 'free', description: 'Spare room for a week', submitted_by_contact: 'whatsapp +971500000000', review_status: 'pending' };
  h.mock.__set('accommodation_submissions', { data: sub, error: null });
  const before = Date.now();
  const r = await fetch(h.base + `/api/admin/community/accommodation/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('accommodation_listings', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.contact, sub.submitted_by_contact);
  assert.equal(writes[0].payload.status, 'active');
  const expiresAt = new Date(writes[0].payload.expires_at).getTime();
  assert.ok(expiresAt > before + 29 * 24 * 60 * 60 * 1000 && expiresAt < before + 31 * 24 * 60 * 60 * 1000);
});

test('rejecting an accommodation submission requires a reason and never touches accommodation_listings', async () => {
  const sub = { id: 'a1b2c3d4-0000-4000-8000-000000000035', description: 'x', review_status: 'pending' };
  h.mock.__set('accommodation_submissions', { data: sub, error: null });
  const noReason = await fetch(h.base + `/api/admin/community/accommodation/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected' }),
  });
  assert.equal(noReason.status, 400);
  const r = await fetch(h.base + `/api/admin/community/accommodation/${sub.id}/review`, {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'rejected', reason: 'looks fake' }),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('accommodation_listings', 'insert').length, 0);
});

test('an accommodation submission that no longer exists resolves to a 404', async () => {
  h.mock.__set('accommodation_submissions', { data: null, error: null });
  const r = await fetch(h.base + '/api/admin/community/accommodation/a1b2c3d4-0000-4000-8000-000000000099/review', {
    method: 'POST', headers: admin(), body: JSON.stringify({ decision: 'approved' }),
  });
  assert.equal(r.status, 404);
});
