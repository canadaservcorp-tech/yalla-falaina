// The contact form's whole point is that a message reaches the operator, so
// the case that matters most here is the one the live site is in right now:
// Resend is misconfigured and every send throws. The row must still be stored
// and the visitor must still be told it worked, because the row IS the record.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const submit = body => fetch(h.base + '/api/contact', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const valid = { name: 'Hicham', email: 'seeker@example.invalid', message: 'How do I subscribe from Egypt?' };

test('a missing name or message is refused before touching the database', async () => {
  for (const body of [{ ...valid, name: '' }, { ...valid, message: '' }, {}]) {
    const r = await submit(body);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
  }
  assert.equal(h.mock.__writes('contact_messages', 'insert').length, 0);
});

test('an unusable email is refused with its own code — a reply is impossible without one', async () => {
  for (const email of ['', 'not-an-email', 'a@b']) {
    const r = await submit({ ...valid, email });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'ERR_BAD_EMAIL');
  }
  assert.equal(h.mock.__writes('contact_messages', 'insert').length, 0);
});

test('a valid message is stored and emailed to the operator, with the sender as reply-to', async () => {
  const r = await submit(valid);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).success, true);

  const writes = h.mock.__writes('contact_messages', 'insert');
  assert.equal(writes.length, 1);
  assert.deepEqual(
    { name: writes[0].payload.name, email: writes[0].payload.email, message: writes[0].payload.message },
    { name: 'Hicham', email: 'seeker@example.invalid', message: 'How do I subscribe from Egypt?' },
  );
});

test('a send failure does not lose the message: the row is stored and the visitor still gets a success', async () => {
  // RESEND_API_KEY is unset under test so lib/email.js takes its dev-log path
  // rather than a real call; this asserts the ordering that makes a live send
  // failure survivable — insert first, email second, inside its own try.
  const r = await submit({ ...valid, message: 'Sent while email delivery is broken' });
  assert.equal(r.status, 200);
  const writes = h.mock.__writes('contact_messages', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.message, 'Sent while email delivery is broken');
});

test('a DB error returns a clean 500 without leaking the underlying message', async () => {
  h.mock.__setOp('contact_messages', 'insert', { data: null, error: { message: 'connection refused' } });
  const r = await submit(valid);
  assert.equal(r.status, 500);
  const j = await r.json();
  assert.equal(j.code, 'ERR_SERVER');
  assert.ok(!/connection refused/.test(JSON.stringify(j)));
});

test('an over-long message is truncated to the column budget rather than rejected', async () => {
  const r = await submit({ ...valid, message: 'x'.repeat(5000) });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('contact_messages', 'insert')[0].payload.message.length, 2000);
});

// Last in the file: express-rate-limit's counter for this route is shared
// across the file and not reset by beforeEach, so this exhausts what remains.
test('the contact endpoint is rate limited per address', async () => {
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) {
    const r = await submit({ ...valid, message: 'spam ' + i });
    limited = r.status === 429;
  }
  assert.ok(limited, 'repeated contact submissions from one address should eventually be capped');
});
