// GET /api/jobs/count — the landing page's live feed counter. Public like
// /api/news: a visitor sees it before signing up.
const { test } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

const h = getApp();

test('GET /api/jobs/count returns the real feed count', async () => {
  h.mock.__set('jobs', { data: new Array(42).fill({ id: 1 }), error: null });
  const r = await fetch(h.base + '/api/jobs/count');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.equal(j.count, 42);
});

test('the landing page carries the counter element the count feeds', async () => {
  const body = await fetch(h.base + '/').then(r => r.text());
  assert.match(body, /id="jobCountNum"/);
  assert.match(body, /api\/jobs\/count/);
});
