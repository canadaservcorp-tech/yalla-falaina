const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
process.env.OUTREACH_POSTAL_ADDRESS = '309-1355 Boul. Le Corbusier, Laval, QC H7N 0G4';
const h = getApp();                                   // injects the mock db before lib/ loads
const demand = require('../lib/demand');
const proof = require('../scripts/send-demand-proof');
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const settle = () => new Promise(r => setTimeout(r, 20));

test('a search records the demand it saw, with coordinates rounded to about a kilometre', async () => {
  h.mock.__setRpc('search_providers', { data: [{ user_id: 1, display_name: 'A' }], error: null });
  const res = await fetch(`${h.base}/api/search?lat=45.558912&lng=-73.749274&profession_id=7`);
  assert.equal(res.status, 200);
  await settle();
  const [write] = h.mock.__writes('search_demand', 'insert');
  assert.ok(write, 'the search was logged');
  assert.deepEqual(
    { lat: write.payload.lat, lng: write.payload.lng, profession_id: write.payload.profession_id, results: write.payload.results },
    { lat: 45.56, lng: -73.75, profession_id: 7, results: 1 },
  );
});

test('a keyword search logs the term, and an ambiguous keyword logs no trade', async () => {
  h.mock.__setRpc('search_providers', { data: [], error: null });
  await fetch(`${h.base}/api/search?lat=45.5&lng=-73.7&q=Plombier`);
  await settle();
  const [write] = h.mock.__writes('search_demand', 'insert');
  assert.equal(write.payload.term, 'plombier');
  assert.equal(write.payload.results, 0);
});

test('a failed demand write does not fail the search', async () => {
  h.mock.__setRpc('search_providers', { data: [{ user_id: 1, display_name: 'A' }], error: null });
  h.mock.__setOp('search_demand', 'insert', { data: null, error: { message: 'demand table missing' } });
  const res = await fetch(`${h.base}/api/search?lat=45.5&lng=-73.7`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).count, 1);
});

test('demand near a provider is asked of the database in kilometres and days', async () => {
  h.mock.__setRpc('demand_near', { data: 17, error: null });
  const n = await demand.near({ lat: 45.6, lng: -73.7, radiusKm: 15, professionIds: [3, 4], days: 7 });
  assert.equal(n, 17);
  assert.deepEqual(h.mock.__lastRpc('demand_near').args, {
    p_lat: 45.6, p_lng: -73.7, p_radius_m: 15000, p_profession_ids: [3, 4], p_days: 7,
  });
});

test('demand with no trade filter asks for every trade', async () => {
  h.mock.__setRpc('demand_near', { data: 0, error: null });
  await demand.near({ lat: 45.6, lng: -73.7, professionIds: [] });
  assert.equal(h.mock.__lastRpc('demand_near').args.p_profession_ids, null);
});

test('the follow-up email states the real count and links to the listing', () => {
  const m = proof.message({
    business_name: 'Emard Couvre-Planchers', city: 'Laval', lang: 'fr',
    rbq_licence: '1104-8618-06', unsubscribe_token: 'tok123',
  }, 12, 7);
  assert.match(m.subject, /12 clients ont cherché votre métier près de Laval/);
  assert.match(m.html, /12 recherches/);
  assert.ok(m.html.includes('/fiche/1104-8618-06?t=tok123&utm_source=proof_email'));
  assert.match(m.html, /5,49 \$\/mois les 3 premiers mois, puis 10,66 \$\/mois/);
});

test('the follow-up carries the sender, the reason and one-click unsubscribe', () => {
  const m = proof.message({ business_name: 'X', city: 'Laval', lang: 'en', rbq_licence: '1-2-3', unsubscribe_token: 'tk' }, 5, 7);
  assert.match(m.html, /Performance Cristal Technologies Avancées S\.A\./);
  assert.match(m.html, /Boul\. Le Corbusier/);
  assert.match(m.html, /published in the RBQ licence\s+register/);
  assert.ok(m.html.includes('/api/outreach/unsubscribe?token=tk'));
});
