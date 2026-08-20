// An explicit photo is blocked and queued for review; only a moderator bans.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
process.env.GOOGLE_VISION_API_KEY = 'test-vision-key';   // before the app loads moderation.js
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]).toString('base64');

// checkImage is called with a real key in these tests; stub the Vision call itself
function vision(annotation) {
  global.fetch_original = global.fetch_original || global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('vision.googleapis.com'))
      return { json: async () => ({ responses: [{ safeSearchAnnotation: annotation }] }) };
    return global.fetch_original(url, opts);
  };
}
after(() => { if (global.fetch_original) global.fetch = global.fetch_original; });

test('a merely LIKELY photo is delivered — that level flags classical paintings', async () => {
  vision({ adult: 'LIKELY', racy: 'VERY_UNLIKELY' });
  const token = actor(h, { id: 601, role: 'provider' });
  const res = await fetch(h.base + '/api/providers/me/portfolio', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ image: jpeg }),
  });
  assert.equal(res.status, 200);
  assert.equal(h.mock.__writes('reports', 'insert').length, 0);
});

test('a VERY_LIKELY photo is blocked, queued as a strike, and does not ban', async () => {
  vision({ adult: 'VERY_LIKELY', racy: 'LIKELY' });
  const token = actor(h, { id: 602, role: 'provider' });
  const res = await fetch(h.base + '/api/providers/me/portfolio', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ image: jpeg }),
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'photo_blocked');

  const rep = h.mock.__writes('reports', 'insert').pop().payload;
  assert.equal(rep.kind, 'image_strike');
  assert.equal(rep.status, 'open');                              // a human decides
  assert.match(rep.reason, /portfolio .*adult=VERY_LIKELY.*strike 1/);

  // never banned automatically, and the photo itself is not stored
  assert.equal(h.mock.__writes('users', 'update').length, 0);
  assert.equal(h.mock.__writes('banned_emails').length, 0);
  assert.equal(h.mock.__writes('portfolio_photos', 'insert').length, 0);
});

test('a repeat offender is flagged for a ban decision, still not banned', async () => {
  vision({ adult: 'VERY_LIKELY', racy: 'LIKELY' });
  const token = actor(h, { id: 603, role: 'provider' });
  h.mock.__set('reports', { data: [], error: null, count: 2 });   // two strikes already
  const res = await fetch(h.base + '/api/providers/me/portfolio', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ image: jpeg }),
  });
  assert.equal(res.status, 403);
  const rep = h.mock.__writes('reports', 'insert').pop().payload;
  assert.match(rep.reason, /strike 3: review for permanent ban/);
  assert.equal(h.mock.__writes('users', 'update').length, 0);
});

test('a chat photo strike records the conversation it came from', async () => {
  vision({ adult: 'VERY_LIKELY', racy: 'VERY_LIKELY' });
  const token = actor(h, { id: 604 });
  h.mock.__set('conversations', { data: { id: 7, seeker_id: 604, provider_id: 99 }, error: null });
  const res = await fetch(h.base + '/api/chat/7/photos', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ image: jpeg }),
  });
  assert.equal(res.status, 403);
  const rep = h.mock.__writes('reports', 'insert').pop().payload;
  assert.equal(rep.conversation_id, '7');
  assert.equal(rep.kind, 'image_strike');
  assert.equal(h.mock.__writes('chat_photos', 'insert').length, 0);
});

test('escalating a report bans at once and keeps the record for reporting', async () => {
  const token = actor(h, { id: 605, role: 'admin' });
  h.mock.__set('reports', { data: { id: 42, kind: 'image_strike', target_user_id: 900, reason: 'image blocked in chat' }, error: null });
  h.mock.__set('users', { data: { id: 605, role: 'admin', banned: false, email_verified: true, email: 'a@b.invalid' }, error: null });
  const res = await fetch(h.base + '/api/report/admin/42/action', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ action: 'escalate' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.escalated, 900);
  assert.match(body.preserve_until, /^\d{4}-\d{2}-\d{2}$/);       // 21-day preservation

  const upd = h.mock.__writes('reports', 'update').pop().payload;
  assert.equal(upd.status, 'escalated');                          // never dismissed or deleted
  assert.match(upd.reason, /Cybertip\.ca, preserve until/);
  assert.equal(h.mock.__writes('users', 'update').pop().payload.banned, true);
});

test('an unknown moderation action is refused instead of silently dismissing', async () => {
  const token = actor(h, { id: 606, role: 'admin' });
  const res = await fetch(h.base + '/api/report/admin/42/action', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ action: 'oops' }),
  });
  assert.equal(res.status, 400);
  assert.equal(h.mock.__writes('reports', 'update').length, 0);
});
