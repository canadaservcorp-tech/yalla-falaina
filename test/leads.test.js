const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
process.env.OUTREACH_POSTAL_ADDRESS = '309-1355 Boul. Le Corbusier, Laval, QC H7N 0G4';
process.env.OPEN_ACCESS_UNTIL = '2099-12-31';
process.env.OPEN_ACCESS_CITIES = 'Laval';
const h = getApp();
const openAccess = require('../lib/open-access');
const leads = require('../lib/leads');
const claimPage = require('../lib/claim-page');
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const unclaimed = (over = {}) => ({
  data: { user_id: 77, display_name: 'Toitures Laval', city: 'Laval', rbq_licence: '1104-8618-06', claimed: false, ...over },
  error: null,
});
const body = (over = {}) => JSON.stringify({
  licence: '1104-8618-06', name: 'Marie Tremblay', contact: '514 555-0123',
  message: 'Toiture à réparer', consent: true, ...over,
});
const post = (b, extra) => fetch(`${h.base}/api/leads`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b, ...extra,
});

// ---------- the window is a date, so it closes by itself ----------

test('the window is open until its date and covers only the listed cities', () => {
  const s = openAccess.status();
  assert.equal(s.active, true);
  assert.equal(s.until, '2099-12-31');
  assert.ok(s.daysLeft > 0);
  assert.equal(openAccess.covers('Laval'), true);
  assert.equal(openAccess.covers('laval '), true);
  assert.equal(openAccess.covers('Trois-Rivières'), false);
});

test('a past date closes the window with no deploy and no flag to remember', () => {
  process.env.OPEN_ACCESS_UNTIL = '2020-01-01';
  assert.equal(openAccess.status().active, false);
  assert.equal(openAccess.covers('Laval'), false);
  process.env.OPEN_ACCESS_UNTIL = '2099-12-31';
});

test('no date at all means no open access', () => {
  delete process.env.OPEN_ACCESS_UNTIL;
  assert.deepEqual(openAccess.status().active, false);
  process.env.OPEN_ACCESS_UNTIL = '2099-12-31';
});

// ---------- lead capture ----------

test('a seeker request on an unclaimed Laval listing is stored', async () => {
  h.mock.__set('providers', unclaimed());
  h.mock.__set('outreach_sendable', { data: null, error: null });   // no address on file: still stored
  const res = await post(body());
  assert.equal(res.status, 200);
  const [write] = h.mock.__writes('listing_leads', 'insert');
  assert.equal(write.payload.provider_user_id, 77);
  assert.equal(write.payload.seeker_name, 'Marie Tremblay');
  assert.equal(write.payload.seeker_contact, '514 555-0123');
  assert.equal(write.payload.rbq_licence, '1104-8618-06');
});

test('the request is refused without the attribution consent the modal shows', async () => {
  h.mock.__set('providers', unclaimed());
  const res = await post(body({ consent: false }));
  assert.equal(res.status, 400);
  assert.equal(h.mock.__writes('listing_leads', 'insert').length, 0);
});

test('a request with no way to call the seeker back is refused', async () => {
  h.mock.__set('providers', unclaimed());
  assert.equal((await post(body({ contact: 'plus tard' }))).status, 400);
  assert.equal((await post(body({ name: 'M' }))).status, 400);
});

test('a claimed listing is reached through chat, not through this path', async () => {
  h.mock.__set('providers', unclaimed({ claimed: true }));
  const res = await post(body());
  assert.equal(res.status, 409);
  assert.equal(h.mock.__writes('listing_leads', 'insert').length, 0);
});

test('a listing outside the open cities cannot be reached for free', async () => {
  h.mock.__set('providers', unclaimed({ city: 'Gatineau' }));
  const res = await post(body());
  assert.equal(res.status, 403);
  assert.equal(h.mock.__writes('listing_leads', 'insert').length, 0);
});

test('once the window has closed the request is refused', async () => {
  process.env.OPEN_ACCESS_UNTIL = '2020-01-01';
  h.mock.__set('providers', unclaimed());
  const res = await post(body());
  process.env.OPEN_ACCESS_UNTIL = '2099-12-31';
  assert.equal(res.status, 403);
});

test('the seeker never receives the provider contact details', async () => {
  h.mock.__set('providers', unclaimed());
  h.mock.__set('outreach_sendable', {
    data: { email: 'info@toitures.ca', phone: '450 669-3002', lang: 'fr', business_name: 'Toitures Laval', unsubscribe_token: 'tok' },
    error: null,
  });
  const res = await post(body());
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes('info@toitures.ca'), 'no provider email in the answer');
  assert.ok(!text.includes('450 669-3002'), 'no provider phone in the answer');
});

test('the modal lookup answers with the licence and name of an unclaimed listing only', async () => {
  h.mock.__set('providers', unclaimed());
  const ok = await (await fetch(`${h.base}/api/leads/listing/77`)).json();
  assert.equal(ok.licence, '1104-8618-06');
  assert.equal(ok.name, 'Toitures Laval');
  assert.equal(ok.active, true);

  h.mock.__set('providers', unclaimed({ claimed: true }));
  assert.equal((await fetch(`${h.base}/api/leads/listing/77`)).status, 404);
});

test('the countdown is public so the page can show a real end date', async () => {
  const j = await (await fetch(`${h.base}/api/open-access`)).json();
  assert.equal(j.active, true);
  assert.equal(j.until, '2099-12-31');
});

// ---------- the notice sent to the provider ----------

test('the notice invites the owner to claim, and never quotes the seeker contact', () => {
  const m = leads.notice({
    business: 'Toitures Laval', city: 'Laval', trade: 'couvreur', count: 3, lang: 'fr',
    licence: '1104-8618-06', daysLeft: 12, until: '2026-09-30', token: 'tok',
  });
  assert.match(m.subject, /Un client de Laval vous cherche/);
  assert.match(m.html, /3e demande ce mois-ci/);
  assert.match(m.html, /Réclamer votre fiche est gratuit/);
  assert.ok(m.html.includes('/fiche/1104-8618-06?utm_source=lead_notice'));
  assert.match(m.html, /2026-09-30/);
});

test('the notice carries the sender, the reason and one-click unsubscribe', () => {
  const m = leads.notice({ business: 'X', city: 'Laval', count: 1, lang: 'en', licence: '1-2-3', daysLeft: 3, until: '2026-09-30', token: 'tk' });
  assert.match(m.html, /Performance Cristal Technologies Avancées S\.A\./);
  assert.match(m.html, /Boul\. Le Corbusier/);
  assert.match(m.html, /published in the RBQ licence register/);
  assert.ok(m.html.includes('/api/outreach/unsubscribe?token=tk'));
});

test('a listing told less than six hours ago is not told again', async () => {
  h.mock.__set('providers', unclaimed());
  h.mock.__queue('listing_leads',
    { data: { notified_at: new Date().toISOString() }, error: null },   // recent notice
    { data: { id: 1 }, error: null },                                   // the insert
  );
  const res = await post(body());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).notified, false);
  const [write] = h.mock.__writes('listing_leads', 'insert');
  assert.equal(write.payload.notified_at, null, 'the lead is kept, the buzz is not');
});

// ---------- what the provider sees ----------

test('a listing page view is counted, without anything identifying the visitor', async () => {
  h.mock.__set('providers', unclaimed());
  h.mock.__set('provider_services', { data: [], error: null });
  const res = await fetch(`${h.base}/fiche/1104-8618-06`);
  assert.equal(res.status, 200);
  await new Promise(r => setTimeout(r, 20));
  const [view] = h.mock.__writes('listing_views', 'insert');
  assert.deepEqual(Object.keys(view.payload).sort(), ['provider_user_id', 'rbq_licence']);
  assert.equal(view.payload.provider_user_id, 77);
});

test('the claim page shows the real end date and the requests really waiting', () => {
  const listing = { display_name: 'Toitures Laval', city: 'Laval', rbq_licence: '1104-8618-06', claimed: false, trades: [] };
  const html = claimPage.render(listing, { window: { active: true, until: '2026-09-30', daysLeft: 3 }, waiting: 2 });
  assert.match(html, /jusqu’au 2026-09-30 \(3 jours restants\)/);
  assert.match(html, /2 demandes de clients attendent/);
});

test('an unknown waiting count prints no count at all', () => {
  const listing = { display_name: 'X', city: 'Laval', rbq_licence: '1-2-3', claimed: false, trades: [] };
  const html = claimPage.render(listing, { window: { active: true, until: '2026-09-30', daysLeft: 3 }, waiting: null });
  assert.match(html, /2026-09-30/);
  assert.ok(!/demandes de clients attendent/.test(html));
});

test('a provider reads the requests left on his own listing', async () => {
  const token = actor(h, { id: 77, role: 'provider' });
  h.mock.__set('listing_leads', {
    data: [{ id: 1, seeker_name: 'Marie', seeker_contact: '514 555-0123', seeker_city: 'Laval', message: 'Toiture', trade: null, created_at: '2026-08-16T12:00:00Z' }],
    error: null,
  });
  const res = await fetch(`${h.base}/api/leads/mine`, { headers: auth(token) });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.leads.length, 1);
  assert.equal(j.leads[0].seeker_contact, '514 555-0123');
});

test('a seeker cannot read another business requests', async () => {
  const token = actor(h, { id: 5, role: 'seeker' });
  const res = await fetch(`${h.base}/api/leads/mine`, { headers: auth(token) });
  assert.equal(res.status, 403);
});

test('the requests of a listing are not readable without an account', async () => {
  assert.equal((await fetch(`${h.base}/api/leads/mine`)).status, 401);
});

// ---------- the expiry reminder ----------

test('the reminder states the counted views and links to the free claim', () => {
  const reminder = require('../scripts/notify-open-access-expiry');
  const m = reminder.message({
    business: 'Toitures Laval', city: 'Laval', views: 14, leadCount: 2,
    licence: '1104-8618-06', lang: 'fr', until: '2026-09-30', daysLeft: 3, token: 'tok',
  });
  assert.match(m.subject, /l'accès gratuit se termine dans 3 jours/);
  assert.match(m.html, /14 personnes ont consulté votre fiche/);
  assert.match(m.html, /2 demandes de clients sont arrivées/);
  assert.match(m.html, /Réclamer est gratuit/);
  assert.match(m.html, /5,49 \$\/mois les 3 premiers\s+mois, puis 10,66 \$\/mois/);
  assert.ok(m.html.includes('/api/outreach/unsubscribe?token=tok'));
  assert.ok(m.text.length < 320, 'the text version fits one SMS');
});

test('sms is a no-op until a provider is configured, and normalises Quebec numbers', async () => {
  const sms = require('../lib/sms');
  assert.equal(sms.e164('450 669-3002'), '+14506693002');
  assert.equal(sms.e164('(514) 555-0123'), '+15145550123');
  assert.equal(sms.e164('12'), null);
  assert.deepEqual(await sms.send('450 669-3002', 'hi'), { skipped: 'no provider configured' });
});
