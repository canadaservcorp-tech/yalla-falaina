// The ticker's whole value is that a visitor can trust it: official sources,
// every headline linked, nothing invented. These tests hold that line —
// parsing shapes, the language fallback, and the admin gate on posting.
const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

const h = getApp();            // sets env + mocks db before anything can require it
const newsIngest = require('../lib/newsIngest');
after(() => h.stop());

const EE_SAMPLE = {
  rounds: [
    { drawNumber: '442', drawDate: '2026-09-14', drawDateFull: 'September 14, 2026',
      drawName: 'Provincial Nominee Program', drawSize: '576', drawCRS: '734' },
    { drawNumber: '441', drawDate: '2026-09-02', drawDateFull: 'September 2, 2026',
      drawName: 'Canadian Experience Class', drawSize: '3,000', drawCRS: '521' },
  ],
};
const ATOM = `<?xml version="1.0"?><feed>
  <entry><title>Canada welcomes new permanent residents under Express Entry</title>
    <id>https://www.canada.ca/en/immigration/news/2026/09/a.html</id><published>2026-09-10T10:00:00-04:00</published></entry>
  <entry><title>Government extends the federal fuel excise tax relief</title>
    <id>https://www.canada.ca/en/immigration/news/2026/09/b.html</id><published>2026-09-08T10:00:00-04:00</published></entry>
  <entry><title>New work permit stream for caregivers</title>
    <id>https://www.canada.ca/en/immigration/news/2026/09/c.html</id><published>2026-09-05T10:00:00-04:00</published></entry>
</feed>`;

function stubFeeds({ rounds = EE_SAMPLE, atom = ATOM, roundsFails = false } = {}) {
  const orig = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('ee_rounds')) {
      if (roundsFails) return new Response('nope', { status: 503 });
      return new Response(JSON.stringify(rounds), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('io.canada.ca')) return new Response(atom, { status: 200 });
    return orig(url, opts);
  };
  return () => { global.fetch = orig; };
}

test('an Express Entry draw becomes one dated, linked item per language', async () => {
  const restore = stubFeeds();
  try {
    const items = await newsIngest.collect();
    const draw = items.find(i => i.external_id === 'ee-442');
    assert.ok(draw, 'the newest draw is missing');
    assert.match(draw.title_en, /Express Entry draw #442/);
    assert.match(draw.title_en, /576 invitations/);
    assert.match(draw.title_en, /CRS cutoff 734/);
    assert.match(draw.title_fr, /Entr\u00e9e express n\u00b0 442/);
    assert.match(draw.title_ar, /442/);
    assert.match(draw.title_hi, /ड्रॉ #442/);
    assert.match(draw.title_hi, /Provincial Nominee Program/, 'the official program name stays in English');
    assert.match(draw.title_tr, /çekilişi #442/);
    assert.match(draw.title_tr, /davetiye/);
    assert.match(draw.url, /^https:\/\/www\.canada\.ca\/.*invitations\.html\?q=442$/);
    assert.equal(draw.published_at, '2026-09-14T00:00:00.000Z');
  } finally { restore(); }
});

test('the department feed is filtered to immigration topics only', async () => {
  const restore = stubFeeds();
  try {
    const news = (await newsIngest.collect()).filter(i => i.source === 'ircc_news');
    const titles = news.map(i => i.title_en);
    assert.ok(titles.some(t => /permanent residents/.test(t)));
    assert.ok(titles.some(t => /work permit/.test(t)));
    assert.ok(!titles.some(t => /fuel excise/.test(t)), 'an unrelated federal item leaked into the ticker');
    for (const i of news) assert.match(i.url, /^https:\/\//);
  } finally { restore(); }
});

test('one failing source never takes the other down with it', async () => {
  const restore = stubFeeds({ roundsFails: true });
  const errs = mock.method(console, 'error', () => {});
  try {
    const items = await newsIngest.collect();
    assert.ok(items.length > 0, 'the news feed was dropped along with the draws');
    assert.ok(items.every(i => i.source === 'ircc_news'));
    assert.ok(errs.mock.calls.length >= 1, 'the failure was swallowed silently');
  } finally { restore(); errs.mock.restore(); }
});

test('the public feed localizes, and falls back to English when a source has no translation', async () => {
  h.mock.__set('news_items', { data: [
    { id: 'a', source: 'ircc_draw', country: 'Canada', category: 'express_entry',
      title_en: 'draw EN', title_fr: 'tirage FR', title_ar: 'سحب AR',
      url: 'https://example.gov/1', published_at: '2026-09-14T00:00:00Z' },
    { id: 'b', source: 'ircc_news', country: 'Canada', category: 'announcement',
      title_en: 'headline EN', title_fr: null, title_ar: null,
      url: 'https://example.gov/2', published_at: '2026-09-10T00:00:00Z' },
  ], error: null });

  const ar = await fetch(h.base + '/api/news?lang=ar').then(r => r.json());
  assert.equal(ar.items[0].title, 'سحب AR');
  assert.equal(ar.items[1].title, 'headline EN', 'an untranslated item should still show, in English');
  assert.ok(ar.items.every(i => i.official === true));

  const fr = await fetch(h.base + '/api/news?lang=fr').then(r => r.json());
  assert.equal(fr.items[0].title, 'tirage FR');
});

test('the ticker works signed out — it is what a visitor sees first', async () => {
  h.mock.__set('news_items', { data: [], error: null });
  const r = await fetch(h.base + '/api/news');
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).items, []);
});

test('only an admin can post an announcement, and only with an https source', async () => {
  const seeker = actor(h, { id: 7, role: 'seeker' });
  const asSeeker = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(seeker),
    body: JSON.stringify({ title_en: 'x', url: 'https://example.gov/a' }),
  });
  assert.equal(asSeeker.status, 403);

  const admin = actor(h, { id: 8, role: 'admin' });
  const noLink = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(admin),
    body: JSON.stringify({ title_en: 'Australia opens a new skilled stream', url: '' }),
  });
  assert.equal(noLink.status, 400, 'an unverifiable headline must be refused');

  const insecure = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(admin),
    body: JSON.stringify({ title_en: 'x', url: 'http://example.gov/a' }),
  });
  assert.equal(insecure.status, 400);

  h.mock.__set('news_items', { data: [{ id: 'n1' }], error: null });
  const ok = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(admin),
    body: JSON.stringify({ title_en: 'Australia opens a new skilled stream', url: 'https://immi.homeaffairs.gov.au/x', country: 'Australia' }),
  });
  assert.equal(ok.status, 200);
});

test('an operator post can carry a scholarship or offer category; anything else falls back to announcement', async () => {
  const admin = actor(h, { id: 9, role: 'admin' });
  h.mock.__set('news_items', { data: [{ id: 'n1' }], error: null });
  const r = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(admin),
    body: JSON.stringify({ title_en: 'University of Toronto graduate scholarship window opens', url: 'https://www.utoronto.ca/scholarships', category: 'scholarship' }),
  });
  assert.equal(r.status, 200);
  // This file doesn't reset the mock between tests — take the newest write.
  const writes = h.mock.__writes('news_items', 'insert');
  assert.equal(writes[writes.length - 1].payload.category, 'scholarship');

  const bogus = await fetch(h.base + '/api/admin/news', {
    method: 'POST', headers: auth(admin),
    body: JSON.stringify({ title_en: 'x', url: 'https://example.gov/a', category: 'nonsense' }),
  });
  assert.equal(bogus.status, 200);
  const writes2 = h.mock.__writes('news_items', 'insert');
  assert.equal(writes2[writes2.length - 1].payload.category, 'announcement');
});
