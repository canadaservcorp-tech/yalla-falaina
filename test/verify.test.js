const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const seo = require('../lib/seo');

process.env.PUBLIC_URL = 'https://www.mytrouvepro.net';
const h = getApp();
after(() => h.stop());
beforeEach(() => h.mock.__reset());

const holder = extra => ({
  licence: '1104-8618-06',
  holder_name: 'Émard Couvre-Planchers',
  status: 'Active',
  licence_type: 'Entrepreneur',
  municipality: 'Laval',
  region: 'Laval',
  restricted: false,
  categories: ['Specialisee 16'],
  ...extra,
});

const get = path => fetch(h.base + path);

test('the form is served without a search and stays indexable', async () => {
  const res = await get('/verification');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Vérifier une licence RBQ/);
  assert.ok(!html.includes('name="robots"'), 'the tool page itself must be indexable');
  assert.ok(html.includes('<link rel="canonical" href="https://www.mytrouvepro.net/verification">'));
});

test('an active licence is reported as active with what the register publishes', async () => {
  h.mock.__set('rbq_licences', { data: holder(), error: null });
  h.mock.__set('providers', { data: null, error: null });
  const html = await (await get('/verification?q=1104-8618-06')).text();
  assert.match(html, /Licence active/);
  assert.match(html, /Émard Couvre-Planchers/);
  assert.match(html, /1104-8618-06/);
  assert.match(html, /Laval/);
  assert.match(html, /name="robots" content="noindex,follow"/);
});

test('a licence typed without dashes still resolves', async () => {
  h.mock.__set('rbq_licences', { data: holder(), error: null });
  h.mock.__set('providers', { data: null, error: null });
  const html = await (await get('/verification?q=1104861806')).text();
  assert.match(html, /Licence active/);
});

test('a suspended licence is not reported as active, and a restriction is shown', async () => {
  h.mock.__set('rbq_licences', { data: holder({ status: 'Suspendue', restricted: true }), error: null });
  h.mock.__set('providers', { data: null, error: null });
  const html = await (await get('/verification?q=1104-8618-06')).text();
  assert.match(html, /Licence non active/);
  assert.ok(!html.includes('badge ok'));
  assert.match(html, /restriction/);
});

test('a verified licence that is one of our unclaimed listings invites the owner to claim it', async () => {
  h.mock.__set('rbq_licences', { data: holder(), error: null });
  h.mock.__set('providers', { data: { rbq_licence: '1104-8618-06', claimed: false }, error: null });
  const html = await (await get('/verification?q=1104-8618-06')).text();
  assert.match(html, /Réclamez votre fiche/);
  assert.ok(html.includes('href="/fiche/1104-8618-06"'));
});

test('a claimed listing is linked without the claim pitch', async () => {
  h.mock.__set('rbq_licences', { data: holder(), error: null });
  h.mock.__set('providers', { data: { rbq_licence: '1104-8618-06', claimed: true }, error: null });
  const html = await (await get('/verification?q=1104-8618-06')).text();
  assert.ok(!html.includes('Réclamez votre fiche'));
  assert.ok(html.includes('href="/fiche/1104-8618-06"'));
});

test('a name search lists candidates linking to their own licence check', async () => {
  h.mock.__set('rbq_licences', { data: [holder(), holder({ licence: '2222-3333-44', holder_name: 'Émard Fils' })], error: null });
  const html = await (await get('/verification?q=Émard')).text();
  assert.match(html, /Entreprises trouvées/);
  assert.ok(html.includes('/verification?q=2222-3333-44'));
});

test('an unknown licence says so and points at the official register', async () => {
  h.mock.__set('rbq_licences', { data: null, error: null });
  const html = await (await get('/verification?q=9999-9999-99')).text();
  assert.match(html, /Aucune licence trouvée/);
  assert.match(html, /rbq\.gouv\.qc\.ca/);
});

test('the holder contact details never reach the public page', async () => {
  h.mock.__set('rbq_licences', {
    data: holder({ email: 'boss@emard.example', phone: '4506693002', address: '12 rue Test Laval' }),
    error: null,
  });
  h.mock.__set('providers', { data: null, error: null });
  const html = await (await get('/verification?q=1104-8618-06')).text();
  assert.ok(!html.includes('boss@emard.example'));
  assert.ok(!html.includes('4506693002'));
  assert.ok(!html.includes('12 rue Test'));
});

test('the English page is served and canonicalises to itself', async () => {
  const html = await (await get('/verification?lang=en')).text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Check an RBQ licence/);
  assert.ok(html.includes('href="https://www.mytrouvepro.net/verification?lang=en"'));
});

test('a database failure still renders the page instead of a stack trace', async () => {
  h.mock.__set('rbq_licences', { data: null, error: { message: 'down' } });
  const res = await get('/verification?q=1104-8618-06');
  assert.equal(res.status, 500);
  const html = await res.text();
  assert.match(html, /Aucune licence trouvée/);
});

test('the verifier is in the sitemap so Google can send clients to it', () => {
  assert.ok(seo.sitemap().includes('<loc>https://www.mytrouvepro.net/verification</loc>'));
});
