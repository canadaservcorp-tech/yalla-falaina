const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();                       // boots the app so require('../db') is the mock
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const { notify } = require('../lib/notify');

test('an in-app row is written in the recipient language', async () => {
  h.mock.__set('users', { data: { email: 'a@b.ca', notify_email: true, lang: 'en' }, error: null });
  assert.equal((await notify(9, 'new_message')).sent, true);
  const row = h.mock.__writes('notifications', 'insert').pop().payload;
  assert.equal(row.user_id, 9);
  assert.equal(row.type, 'new_message');
  assert.equal(row.title, 'New message on TrouvePro');
});

test('French is the default when the user has no language', async () => {
  h.mock.__set('users', { data: { email: 'a@b.ca', notify_email: true, lang: null }, error: null });
  await notify(9, 'sub_expiring');
  assert.match(h.mock.__writes('notifications', 'insert').pop().payload.title, /abonnement/);
});

test('a banned recipient is not notified', async () => {
  h.mock.__set('users', { data: { email: 'a@b.ca', notify_email: true, banned: true }, error: null });
  assert.equal((await notify(9, 'new_message')).sent, false);
  assert.equal(h.mock.__writes('notifications', 'insert').length, 0);
});

test('an unknown type writes nothing', async () => {
  assert.equal((await notify(9, 'nope')).sent, false);
  assert.equal(h.mock.__writes('notifications', 'insert').length, 0);
});

test('a duplicate reminder (unique index) is reported as not sent', async () => {
  h.mock.__set('users', { data: { email: 'a@b.ca', notify_email: true }, error: null });
  h.mock.__setOp('notifications', 'insert', { data: null, error: { message: 'duplicate key' } });
  assert.equal((await notify(9, 'boost_ending')).sent, false);
});
