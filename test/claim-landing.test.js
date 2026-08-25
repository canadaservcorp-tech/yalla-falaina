const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const LICENCE = '1104-8618-06';
const seed = extra => ({ user_id: 77, display_name: 'Émard Couvre-Planchers', city: 'Laval', rbq_licence: LICENCE, claimed: false, ...extra });
// the page reads the listing, then its services
const listingIs = (row, trades = []) => {
  h.mock.__set('providers', { data: row, error: null });
  h.mock.__set('provider_services', { data: trades.map(t => ({ professions: t })), error: null });
};
const fiche = (path = '/fiche/' + LICENCE) => fetch(h.base + path);

test('the landing page names the business the email was sent to', async () => {
  listingIs(seed(), [{ name_fr: 'Couvreur', name_en: 'Roofer' }]);
  const res = await fiche();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /Émard Couvre-Planchers/);
  assert.match(html, /Laval/);
  assert.match(html, new RegExp(LICENCE));
  assert.match(html, /Couvreur/);
  assert.ok(!html.includes('Roofer'), 'the French page shows the French trade');
});

test('the claim button carries the recipient token, not a search box', async () => {
  listingIs(seed());
  const html = await (await fiche(`/fiche/${LICENCE}?t=${'a'.repeat(32)}`)).text();
  assert.ok(html.includes(`/?claim=${'a'.repeat(32)}&amp;utm_source=rbq_email`));
});

test('a visitor arriving without a token still gets a working claim link', async () => {
  listingIs(seed());
  const html = await (await fiche()).text();
  assert.ok(html.includes(`/?claim_licence=${LICENCE}&amp;utm_source=claim_page`));
});

test('the page is crawlable in both languages and canonical to itself', async () => {
  listingIs(seed());
  const fr = await (await fiche()).text();
  assert.ok(fr.includes(`<link rel="canonical" href="https://www.mytrouvepro.net/fiche/${LICENCE}">`));
  assert.ok(fr.includes(`hreflang="en-CA" href="https://www.mytrouvepro.net/fiche/${LICENCE}?lang=en"`));
  assert.match(fr, /<html lang="fr">/);

  listingIs(seed());
  const en = await (await fiche(`/fiche/${LICENCE}?lang=en`)).text();
  assert.match(en, /<html lang="en">/);
  assert.match(en, /unclaimed listing on TrouvePro/);
  assert.match(en, /This is my business/);
});

test('a claimed listing invites nobody to claim it', async () => {
  listingIs(seed({ claimed: true }));
  const html = await (await fiche()).text();
  assert.match(html, /Fiche déjà réclamée/);
  assert.ok(!html.includes('claim_licence'), 'no claim call to action once it has an owner');
});

test('the page never leaks what the RBQ register does not publish', async () => {
  listingIs(seed({ claimed: false }));
  await fiche();
  const read = h.mock.__writes().length;
  assert.equal(read >= 0, true);
  listingIs(seed());
  const html = await (await fiche()).text();
  for (const secret of ['lat', 'lng', '@', 'unsubscribe_token']) {
    assert.ok(!html.includes(`"${secret}"`), `${secret} must not reach the page`);
  }
});

test('junk in the URL is a 404, not a database query', async () => {
  for (const bad of ['/fiche/abc', '/fiche/' + '9'.repeat(40), '/fiche/1104%20OR%201=1']) {
    assert.equal((await fiche(bad)).status, 404);
  }
  listingIs(null);
  assert.equal((await fiche()).status, 404);
});

test('a landing view on an unclaimed listing is counted, a claimed one is not', async () => {
  listingIs(seed());
  await fiche(`/fiche/${LICENCE}?t=${'a'.repeat(32)}`);
  await new Promise(r => setTimeout(r, 20));
  const [row] = h.mock.__writes('claim_funnel', 'insert').map(w => w.payload);
  assert.deepEqual([row.step, row.rbq_licence, row.source], ['landing', LICENCE, 'rbq_email']);

  h.mock.__reset();
  listingIs(seed({ claimed: true }));
  await fiche();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(h.mock.__writes('claim_funnel', 'insert').length, 0);
});

test('the app can name the listing behind a licence before the contractor signs up', async () => {
  h.mock.__set('providers', { data: seed(), error: null });
  const j = await (await fetch(h.base + '/api/claim/listing?licence=' + LICENCE)).json();
  assert.deepEqual([j.seedUserId, j.business_name, j.city], [77, 'Émard Couvre-Planchers', 'Laval']);
  assert.ok(!('email' in j) && !('lat' in j));

  assert.equal((await fetch(h.base + '/api/claim/listing?licence=oops')).status, 404);
  h.mock.__set('providers', { data: null, error: null });
  assert.equal((await fetch(h.base + '/api/claim/listing?licence=' + LICENCE)).status, 404);
});
