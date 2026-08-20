const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installMockPaypal } = require('./helpers/mockPaypal');

const paypal = installMockPaypal();                  // before the app loads
const { getApp, actor, auth } = require('./helpers/appHarness');
const h = getApp();
after(() => h.stop());
beforeEach(() => { h.mock.__reset(); paypal.__reset(); });

const post = (path, token, body) =>
  fetch(h.base + path, { method: 'POST', headers: auth(token), body: JSON.stringify(body || {}) });
const get = (path, token) => fetch(h.base + path, { headers: auth(token) });

const inHours = n => new Date(Date.now() + n * 3600 * 1000).toISOString();

// a booking request reads providers, then the provider's users row, then conversations
const bookable = (mock, seekerId, { conversation = true } = {}) => {
  mock.__queue('users',
    { data: { id: seekerId, role: 'seeker', banned: false, email_verified: true }, error: null },
    { data: { id: 5, banned: false }, error: null });
  mock.__set('providers', { data: { user_id: 5, claimed: true }, error: null });
  mock.__set('conversations', { data: conversation ? { id: 77 } : null, error: null });
};

// an action on an existing booking: the auth check reads users, then bookings is loaded
const existing = (mock, userId, role, booking) => {
  mock.__queue('users', { data: { id: userId, role, banned: false, email_verified: true }, error: null });
  mock.__set('bookings', { data: booking, error: null });
};

test('the policy endpoint states the deposit for a quote, in FR and EN', async () => {
  const j = await (await fetch(h.base + '/api/bookings/policy?amount=200')).json();
  assert.equal(j.deposit, '30.00');
  assert.equal(j.freeCancelHours, 24);
  assert.match(j.fr.lines[0], /30\.00 \$/);
  assert.match(j.en.lines[0], /\$30\.00/);
});

test('booking without a token -> 401', async () => {
  assert.equal((await fetch(h.base + '/api/bookings', { method: 'POST' })).status, 401);
});

test('a provider cannot create a booking -> 403', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  assert.equal((await post('/api/bookings', token, { providerId: 9 })).status, 403);
});

test('the policy must be accepted -> 400', async () => {
  const token = actor(h, { id: 20 });
  const r = await post('/api/bookings', token, { providerId: 5, scheduledAt: inHours(48), amount: 200 });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /policy/);
});

test('a slot in the next two hours is refused -> 400', async () => {
  const token = actor(h, { id: 21 });
  const r = await post('/api/bookings', token,
    { providerId: 5, scheduledAt: inHours(1), amount: 200, acceptPolicy: true });
  assert.equal(r.status, 400);
});

test('booking a provider never messaged is refused -> 403', async () => {
  const token = actor(h, { id: 22 });
  bookable(h.mock, 22, { conversation: false });
  const r = await post('/api/bookings', token,
    { providerId: 5, scheduledAt: inHours(48), amount: 200, acceptPolicy: true });
  assert.equal(r.status, 403);
});

test('a request stores the server-computed deposit, not the client amount', async () => {
  const token = actor(h, { id: 23 });
  bookable(h.mock, 23);
  const r = await post('/api/bookings', token, {
    providerId: 5, scheduledAt: inHours(48), amount: 200, note: 'Fuite sous l’évier',
    acceptPolicy: true, depositCents: 1,                    // ignored
  });
  assert.equal(r.status, 200);
  const row = h.mock.__writes('bookings', 'insert').pop().payload;
  assert.equal(row.quoted_cents, 20000);
  assert.equal(row.deposit_cents, 3000);
  assert.equal(row.status, 'requested');
  assert.equal(row.policy_version.length > 0, true);
  // a slot two days out is inside the honour window, so the hold can be taken now
  assert.equal(new Date(row.authorize_from).getTime() <= Date.now() + 1000, true);
  assert.equal(h.mock.__writes('notifications', 'insert').length, 1);
});

test('a far-out slot defers the hold to 72h before the appointment', async () => {
  const token = actor(h, { id: 24 });
  bookable(h.mock, 24);
  const when = inHours(24 * 10);
  await post('/api/bookings', token, { providerId: 5, scheduledAt: when, amount: 1000, acceptPolicy: true });
  const row = h.mock.__writes('bookings', 'insert').pop().payload;
  assert.equal(new Date(row.authorize_from).getTime(),
    new Date(when).getTime() - 72 * 3600 * 1000);
});

test('a taken slot is reported as unavailable -> 409', async () => {
  const token = actor(h, { id: 25 });
  bookable(h.mock, 25);
  h.mock.__setOp('bookings', 'insert', { data: null, error: { message: 'duplicate key' } });
  const r = await post('/api/bookings', token,
    { providerId: 5, scheduledAt: inHours(48), amount: 200, acceptPolicy: true });
  assert.equal(r.status, 409);
});

test('only the provider answers a request', async () => {
  const token = actor(h, { id: 26 });
  existing(h.mock, 26, 'seeker', { id: 1, provider_id: 5, seeker_id: 26, status: 'requested', scheduled_at: inHours(48), deposit_cents: 3000, authorize_from: inHours(1) });
  assert.equal((await post('/api/bookings/1/accept', token)).status, 403);
});

test('accepting notifies the seeker and does not touch PayPal', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  existing(h.mock, 5, 'provider', { id: 1, provider_id: 5, seeker_id: 26, status: 'requested', scheduled_at: inHours(48), deposit_cents: 3000, authorize_from: inHours(1) });
  const r = await post('/api/bookings/1/accept', token);
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.status, 'accepted');
  assert.equal(paypal.__calls().length, 0);
});

test('the deposit cannot be held before the honour window opens -> 409', async () => {
  const token = actor(h, { id: 27 });
  existing(h.mock, 27, 'seeker', { id: 1, provider_id: 5, seeker_id: 27, status: 'accepted', scheduled_at: inHours(24 * 10), deposit_cents: 3000, authorize_from: inHours(24 * 7) });
  const r = await post('/api/bookings/1/authorize', token);
  assert.equal(r.status, 409);
  assert.equal(paypal.__calls().length, 0);
});

test('authorizing asks PayPal for an AUTHORIZE order of the deposit only', async () => {
  const token = actor(h, { id: 28 });
  existing(h.mock, 28, 'seeker', { id: 1, provider_id: 5, seeker_id: 28, status: 'accepted', scheduled_at: inHours(30), deposit_cents: 3000, authorize_from: inHours(-1) });
  paypal.__reply('POST /v2/checkout/orders', { id: 'ORDER1', links: [{ rel: 'approve', href: 'https://paypal.test/go' }] });
  const j = await (await post('/api/bookings/1/authorize', token)).json();
  assert.equal(j.url, 'https://paypal.test/go');
  const call = paypal.__calls('/v2/checkout/orders').pop();
  assert.equal(call.body.intent, 'AUTHORIZE');
  assert.deepEqual(call.body.purchase_units[0].amount, { currency_code: 'CAD', value: '30.00' });
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.paypal_order_id, 'ORDER1');
});

test('confirming another order id is refused -> 400', async () => {
  const token = actor(h, { id: 29 });
  existing(h.mock, 29, 'seeker', { id: 1, provider_id: 5, seeker_id: 29, status: 'accepted', scheduled_at: inHours(30), deposit_cents: 3000, authorize_from: inHours(-1), paypal_order_id: 'ORDER1' });
  const r = await post('/api/bookings/1/confirm', token, { orderId: 'SOMEONE-ELSES' });
  assert.equal(r.status, 400);
  assert.equal(paypal.__calls('/authorize').length, 0);
});

test('confirming records the authorization and its expiry', async () => {
  const token = actor(h, { id: 30 });
  existing(h.mock, 30, 'seeker', { id: 1, provider_id: 5, seeker_id: 30, status: 'accepted', scheduled_at: inHours(30), deposit_cents: 3000, authorize_from: inHours(-1), paypal_order_id: 'ORDER1' });
  paypal.__reply('/v2/checkout/orders/ORDER1/authorize', {
    purchase_units: [{ payments: { authorizations: [{ id: 'AUTH1', expiration_time: '2026-09-01T00:00:00Z' }] } }],
  });
  const r = await post('/api/bookings/1/confirm', token, { orderId: 'ORDER1' });
  assert.equal(r.status, 200);
  const row = h.mock.__writes('bookings', 'update').pop().payload;
  assert.equal(row.status, 'authorized');
  assert.equal(row.paypal_authorization_id, 'AUTH1');
  assert.equal(row.auth_expires_at, '2026-09-01T00:00:00Z');
});

test('a hold we cannot record is released rather than left hanging', async () => {
  const token = actor(h, { id: 31 });
  existing(h.mock, 31, 'seeker', { id: 1, provider_id: 5, seeker_id: 31, status: 'accepted', scheduled_at: inHours(30), deposit_cents: 3000, authorize_from: inHours(-1), paypal_order_id: 'ORDER1' });
  paypal.__reply('/v2/checkout/orders/ORDER1/authorize', {
    purchase_units: [{ payments: { authorizations: [{ id: 'AUTH1' }] } }],
  });
  h.mock.__setOp('bookings', 'update', { data: null, error: { message: 'nope' } });
  const r = await post('/api/bookings/1/confirm', token, { orderId: 'ORDER1' });
  assert.equal(r.status, 500);
  assert.equal(paypal.__calls('/AUTH1/void').length, 1);
});

test('a seeker cancelling 24h+ ahead is charged nothing', async () => {
  const token = actor(h, { id: 32 });
  existing(h.mock, 32, 'seeker', { id: 1, provider_id: 5, seeker_id: 32, status: 'authorized', scheduled_at: inHours(30), deposit_cents: 3000, authorize_from: inHours(-1), paypal_authorization_id: 'AUTH1' });
  const j = await (await post('/api/bookings/1/cancel', token)).json();
  assert.equal(j.charged, false);
  assert.equal(paypal.__calls('/AUTH1/void').length, 1);
  assert.equal(paypal.__calls('/capture').length, 0);
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.status, 'cancelled_void');
});

test('a seeker cancelling inside 24h forfeits the deposit', async () => {
  const token = actor(h, { id: 33 });
  existing(h.mock, 33, 'seeker', { id: 1, provider_id: 5, seeker_id: 33, status: 'authorized', scheduled_at: inHours(5), deposit_cents: 3000, authorize_from: inHours(-1), paypal_authorization_id: 'AUTH1' });
  const j = await (await post('/api/bookings/1/cancel', token)).json();
  assert.equal(j.charged, true);
  const cap = paypal.__calls('/AUTH1/capture').pop();
  assert.deepEqual(cap.body.amount, { currency_code: 'CAD', value: '30.00' });
  assert.equal(cap.body.final_capture, true);
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.status, 'cancelled_charged');
});

test('a provider cancelling late still costs the seeker nothing', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  existing(h.mock, 5, 'provider', { id: 1, provider_id: 5, seeker_id: 33, status: 'authorized', scheduled_at: inHours(2), deposit_cents: 3000, authorize_from: inHours(-1), paypal_authorization_id: 'AUTH1' });
  const j = await (await post('/api/bookings/1/cancel', token)).json();
  assert.equal(j.charged, false);
  assert.equal(paypal.__calls('/AUTH1/void').length, 1);
  const row = h.mock.__writes('bookings', 'update').pop().payload;
  assert.equal(row.status, 'cancelled_void');
  assert.equal(row.cancelled_by, 'provider');
});

test('a failed capture leaves the booking open instead of claiming it was charged', async () => {
  const token = actor(h, { id: 34 });
  existing(h.mock, 34, 'seeker', { id: 1, provider_id: 5, seeker_id: 34, status: 'authorized', scheduled_at: inHours(5), deposit_cents: 3000, authorize_from: inHours(-1), paypal_authorization_id: 'AUTH1' });
  paypal.__reply('/AUTH1/capture', new Error('AUTHORIZATION_VOIDED'));
  const r = await post('/api/bookings/1/cancel', token);
  assert.equal(r.status, 502);
  assert.equal(h.mock.__writes('bookings', 'update').length, 0);
});

test('completion captures the held deposit', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  existing(h.mock, 5, 'provider', { id: 1, provider_id: 5, seeker_id: 35, status: 'authorized', scheduled_at: inHours(-2), deposit_cents: 3000, authorize_from: inHours(-72), paypal_authorization_id: 'AUTH1' });
  const r = await post('/api/bookings/1/complete', token);
  assert.equal(r.status, 200);
  assert.equal(paypal.__calls('/AUTH1/capture').length, 1);
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.status, 'completed');
});

test('a seeker cannot mark a booking complete -> 403', async () => {
  const token = actor(h, { id: 35 });
  existing(h.mock, 35, 'seeker', { id: 1, provider_id: 5, seeker_id: 35, status: 'authorized', scheduled_at: inHours(-2), deposit_cents: 3000, authorize_from: inHours(-72), paypal_authorization_id: 'AUTH1' });
  assert.equal((await post('/api/bookings/1/complete', token)).status, 403);
});

test('no-show before the appointment is refused -> 409', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  existing(h.mock, 5, 'provider', { id: 1, provider_id: 5, seeker_id: 36, status: 'authorized', scheduled_at: inHours(3), deposit_cents: 3000, authorize_from: inHours(-1), paypal_authorization_id: 'AUTH1' });
  assert.equal((await post('/api/bookings/1/no-show', token)).status, 409);
});

test('a seeker no-show reported by the provider captures the deposit', async () => {
  const token = actor(h, { id: 5, role: 'provider' });
  existing(h.mock, 5, 'provider', { id: 1, provider_id: 5, seeker_id: 36, status: 'authorized', scheduled_at: inHours(-3), deposit_cents: 3000, authorize_from: inHours(-72), paypal_authorization_id: 'AUTH1' });
  const j = await (await post('/api/bookings/1/no-show', token)).json();
  assert.equal(j.charged, true);
  assert.equal(paypal.__calls('/AUTH1/capture').length, 1);
  assert.equal(h.mock.__writes('bookings', 'update').pop().payload.cancelled_by, 'seeker');
});

test('a provider no-show reported by the seeker releases the deposit', async () => {
  const token = actor(h, { id: 37 });
  existing(h.mock, 37, 'seeker', { id: 1, provider_id: 5, seeker_id: 37, status: 'authorized', scheduled_at: inHours(-3), deposit_cents: 3000, authorize_from: inHours(-72), paypal_authorization_id: 'AUTH1' });
  const j = await (await post('/api/bookings/1/no-show', token)).json();
  assert.equal(j.charged, false);
  assert.equal(paypal.__calls('/AUTH1/void').length, 1);
  const row = h.mock.__writes('bookings', 'update').pop().payload;
  assert.equal(row.status, 'cancelled_void');
  assert.equal(row.cancelled_by, 'provider');
});

test('a stranger cannot see or act on a booking -> 404', async () => {
  const token = actor(h, { id: 99 });
  existing(h.mock, 99, 'seeker', { id: 1, provider_id: 5, seeker_id: 37, status: 'authorized', scheduled_at: inHours(-3), deposit_cents: 3000, authorize_from: inHours(-72), paypal_authorization_id: 'AUTH1' });
  assert.equal((await post('/api/bookings/1/cancel', token)).status, 404);
});

test('the list shows my bookings with the deposit and whether cancelling is late', async () => {
  const token = actor(h, { id: 38 });
  h.mock.__queue('users', { data: { id: 38, role: 'seeker', banned: false, email_verified: true }, error: null });
  h.mock.__set('bookings', { data: [
    { id: 1, provider_id: 5, seeker_id: 38, status: 'authorized', scheduled_at: inHours(5), quoted_cents: 20000, deposit_cents: 3000, authorize_from: inHours(-1) },
    { id: 2, provider_id: 6, seeker_id: 38, status: 'accepted', scheduled_at: inHours(48), quoted_cents: 50000, deposit_cents: 7500, authorize_from: inHours(-1) },
  ], error: null });
  const j = await (await get('/api/bookings', token)).json();
  assert.equal(j.bookings[0].deposit, '30.00');
  assert.equal(j.bookings[0].lateCancel, true);
  assert.equal(j.bookings[0].role, 'seeker');
  assert.equal(j.bookings[1].lateCancel, false);
  assert.equal(j.bookings[1].canAuthorize, true);
});
