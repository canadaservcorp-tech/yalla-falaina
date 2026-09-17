// routes/documents.js -- the composer 📎 upload path: any kind of document
// the seeker wants the concierge to read (CV, admission letter, contract).
// Medical reports go through routes/medical-intake.js's own guardrailed
// path; this one is for everything else, subscriber-gated when the paywall
// is enforced (same rule as every other upload path).
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor } = require('./helpers/appHarness');

const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const postDoc = (token, buffer, contentType, name) => fetch(h.base + '/api/documents' + (name ? '?name=' + encodeURIComponent(name) : ''), {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': contentType },
  body: buffer,
});

test('no auth header means no upload -- auth runs before any parse or storage write', async () => {
  const r = await postDoc(null, Buffer.from('cv text'), 'text/plain');
  assert.equal(r.status, 401);
  assert.equal(h.mock.__writes('document_uploads', 'insert').length, 0);
});

test('a plain-text upload stores the row with extracted text and the original filename', async () => {
  const token = actor(h, { id: 601 });
  const r = await postDoc(token, Buffer.from('Work history: carpenter, 8 years'), 'text/plain', 'my-cv.txt');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.success, true);
  assert.equal(d.fileName, 'my-cv.txt');
  const writes = h.mock.__writes('document_uploads', 'insert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.profile_id, 601);
  assert.equal(writes[0].payload.kind, 'document');
  assert.equal(writes[0].payload.file_name, 'my-cv.txt');
  assert.match(writes[0].payload.extracted_text, /carpenter/);
  assert.equal(writes[0].payload.deleted_at, null);
  assert.ok(writes[0].payload.retention_expires_at);
});

test('kind and name are cleaned and defaulted, not trusted', async () => {
  const token = actor(h, { id: 602 });
  const r = await fetch(h.base + '/api/documents?kind=nonsense', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
    body: Buffer.from('letter body'),
  });
  assert.equal(r.status, 200);
  assert.equal(h.mock.__writes('document_uploads', 'insert')[0].payload.kind, 'document');
  assert.equal(h.mock.__writes('document_uploads', 'insert')[0].payload.file_name, null);
});

test('an unsupported type is refused with 415 before parsing', async () => {
  const token = actor(h, { id: 603 });
  const r = await postDoc(token, Buffer.from('x'), 'application/zip');
  assert.equal(r.status, 415);
  assert.equal((await r.json()).code, 'ERR_BAD_DOC_TYPE');
});

test('the paywall gate applies here too when enforced', async () => {
  process.env.PAYWALL_ENFORCED = 'true';
  try {
    const free = actor(h, { id: 604, extra: { subscription_status: 'none', bonus_access_until: null } });
    const r = await postDoc(free, Buffer.from('cv'), 'text/plain');
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'ERR_PAYWALL');

    const paid = actor(h, { id: 605, extra: { subscription_status: 'active' } });
    const r2 = await postDoc(paid, Buffer.from('cv'), 'text/plain');
    assert.equal(r2.status, 200);
  } finally {
    delete process.env.PAYWALL_ENFORCED;
  }
});
