const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');

process.env.OUTREACH_POSTAL_ADDRESS = '309-1355 Test St, Laval, QC H0H 0H0';
process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';

const h = getApp();                                  // installs the db mock the script also requires
const { message } = require('../scripts/send-outreach');
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const TOKEN = 'a'.repeat(32);
const contact = extra => ({ email: 'pro@example.com', business_name: 'Plomberie Test inc.', lang: 'fr', unsubscribe_token: TOKEN, ...extra });
const invite = token => fetch(h.base + '/api/outreach/invite?token=' + token);

test('the campaign link names the business without exposing the list', async () => {
  h.mock.__set('outreach_contacts', { data: { business_name: 'Plomberie Test inc.', city: 'Laval', lang: 'fr', claimed_user_id: null }, error: null });
  const res = await invite(TOKEN);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual([j.business_name, j.city, j.lang, j.claimed], ['Plomberie Test inc.', 'Laval', 'fr', false]);
  assert.ok(!('email' in j) && !('unsubscribe_token' in j), 'the list itself must stay private');
});

test('an invite for a listing already claimed says so instead of inviting again', async () => {
  h.mock.__set('outreach_contacts', { data: { business_name: 'X', city: null, lang: 'en', claimed_user_id: 42 }, error: null });
  const j = await (await invite(TOKEN)).json();
  assert.deepEqual([j.claimed, j.lang], [true, 'en']);
});

test('a guessed or unknown token is a 404, never a lookup oracle', async () => {
  assert.equal((await invite('nope')).status, 404);
  assert.equal((await invite('B'.repeat(32))).status, 404);          // tokens are lowercase hex
  h.mock.__set('outreach_contacts', { data: null, error: null });
  assert.equal((await invite(TOKEN)).status, 404);
});

test('every message carries what CASL requires', () => {
  const { subject, html } = message(contact());
  assert.match(subject, /Plomberie Test inc\. est déjà sur TrouvePro/);
  assert.match(html, /NEQ 2280629637/);                              // who is writing
  assert.ok(html.includes(process.env.OUTREACH_POSTAL_ADDRESS));     // and from where
  assert.match(html, /registre\s+des licences RBQ/);                 // why we hold their address
  assert.ok(html.includes(`/api/outreach/unsubscribe?token=${TOKEN}`), 'one-click opt-out, their own token');
  assert.match(html, /contact@mytrouvepro\.net/);                    // a human reply path
});

test('the button opens the recipient claim flow, tagged to the campaign', () => {
  const { html } = message(contact());
  assert.ok(html.includes(`https://www.mytrouvepro.net/?claim=${TOKEN}&utm_source=rbq_email`));
});

test('the price is stated in the email, not discovered at the paywall', () => {
  assert.match(message(contact()).html, /5,49 \$\/mois les 3 premiers mois, puis 10,66 \$\/mois/);
  assert.match(message(contact({ lang: 'en' })).html, /\$5\.49\/month for the first 3 months, then \$10\.66\/month/);
});

test('an English contact gets the English message', () => {
  const { subject, html } = message(contact({ lang: 'en' }));
  assert.match(subject, /is already on TrouvePro/);
  assert.match(html, /<html lang="en"/);
  assert.ok(!/Bonjour/.test(html));
});

test('a business name cannot inject markup into the email', () => {
  const { html } = message(contact({ business_name: '<script>x</script>' }));
  assert.ok(!html.includes('<script>'), 'the name is escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('the site walks an invited provider into the claim box', () => {
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(ui, /\/api\/outreach\/invite\?token=/);
  // a visitor with no account is put straight into provider registration, and the pending
  // business name survives the round trip through email verification
  assert.match(ui, /setRole\('provider'\); openAuth\('register'\)/);
  assert.match(ui, /sessionStorage\.setItem\('tp_claim'/);
  assert.match(ui, /document\.getElementById\('claim_q'\)\.value=name; claimSearch\(\)/);
  for (const lang of ['fr', 'en']) assert.ok(new RegExp("invite:'[^']+%s").test(ui), lang + ' invite string');
});
