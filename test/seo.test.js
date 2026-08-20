const { test, after } = require('node:test');
const assert = require('node:assert');
const { getApp } = require('./helpers/appHarness');
const seo = require('../lib/seo');

const h = getApp();
after(() => h.stop());

const html = (p = '/') => fetch(h.base + p).then(r => r.text());

test('each indexable page gets its own title and description', async () => {
  const seen = new Set();
  for (const p of seo.INDEXABLE) {
    const body = await html(p);
    const title = (body.match(/<title>([^<]+)<\/title>/) || [])[1];
    const desc = (body.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    assert.ok(title && desc, p);
    assert.ok(!seen.has(title), `duplicate title on ${p}`);
    seen.add(title);
    assert.equal(body.match(/<title>/g).length, 1, `one title on ${p}`);
  }
});

test('unknown paths fall back to the home metadata', async () => {
  const body = await html('/nope');
  assert.match(body, /<title>TrouvePro — Services/);
});

test('the French home page carries the local keywords', async () => {
  const body = await html('/');
  for (const k of ['Laval', 'Montréal', 'près de chez vous']) assert.ok(body.includes(k), k);
});

test('?lang=en serves the English metadata and html lang', async () => {
  const body = await html('/faq?lang=en');
  assert.match(body, /<title>Frequently asked questions/);
  assert.match(body, /<html lang="en">/);
});

test('canonical points at the language actually served', async () => {
  assert.match(await html('/terms'), /<link rel="canonical" href="[^"]+\/terms">/);
  assert.match(await html('/terms?lang=en'), /<link rel="canonical" href="[^"]+\/terms\?lang=en">/);
});

test('both languages are declared as alternates on every page', async () => {
  for (const p of seo.INDEXABLE) {
    const body = await html(p);
    assert.match(body, /hreflang="fr-CA"/, p);
    assert.match(body, /hreflang="en-CA"/, p);
    assert.match(body, /hreflang="x-default"/, p);
  }
});

test('social cards describe the page, not just the site', async () => {
  const body = await html('/privacy');
  assert.match(body, /<meta property="og:title" content="Politique de confidentialité[^"]*">/);
  assert.match(body, /<meta property="og:url" content="[^"]+\/privacy">/);
  assert.match(body, /<meta property="og:locale" content="fr_CA">/);
  assert.match(body, /<meta name="twitter:card"/);
});

const structured = async (p = '/') => {
  const body = await html(p);
  return JSON.parse((body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
};

test('structured data names the operator and the area served', async () => {
  const ld = await structured();
  const org = ld.find(x => x['@type'] === 'Organization');
  assert.match(org.legalName, /Performance Cristal/);
  const cities = org.areaServed.filter(a => a['@type'] === 'City').map(a => a.name);
  for (const c of ['Laval', 'Montréal']) assert.ok(cities.includes(c), c);
  assert.ok(org.areaServed.some(a => a['@type'] === 'AdministrativeArea' && a.name === 'Québec'));
  assert.ok(ld.some(x => x['@type'] === 'WebSite'));
});

// A service-area business, per the operator: coverage instead of a location.
test('structured data publishes a coverage radius, never an address', async () => {
  const ld = await structured();
  const org = ld.find(x => x['@type'] === 'Organization');
  assert.ok(!('address' in org), 'no PostalAddress');
  assert.ok(!JSON.stringify(ld).includes('streetAddress'));
  const circle = org.areaServed.find(a => a['@type'] === 'GeoCircle');
  assert.ok(circle, 'a GeoCircle must describe the service area');
  assert.ok(Number(circle.geoRadius) >= 20000);
  assert.equal(circle.geoMidpoint['@type'], 'GeoCoordinates');
});

test('the Search Console token is only emitted when configured', async () => {
  assert.ok(!(await html('/')).includes('google-site-verification'));
  process.env.GOOGLE_SITE_VERIFICATION = 'tok123';
  try {
    assert.match(await html('/'), /<meta name="google-site-verification" content="tok123">/);
  } finally {
    delete process.env.GOOGLE_SITE_VERIFICATION;
  }
});

test('robots.txt keeps the API and admin out of the index and links the sitemap', async () => {
  const res = await fetch(h.base + '/robots.txt');
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const body = await res.text();
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Disallow: \/admin\.html/);
  assert.match(body, /Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
});

test('sitemap.xml lists every indexable page in both languages', async () => {
  const res = await fetch(h.base + '/sitemap.xml');
  assert.match(res.headers.get('content-type'), /xml/);
  const body = await res.text();
  for (const p of seo.INDEXABLE) assert.ok(body.includes(`<loc>${seo.base()}${p}</loc>`), p);
  assert.equal((body.match(/hreflang="en-CA"/g) || []).length, seo.INDEXABLE.length);
});

test('/index.html redirects to the canonical home URL', async () => {
  const res = await fetch(h.base + '/index.html', { redirect: 'manual' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/');
});

test('a dollar sign in the copy survives injection verbatim', async () => {
  const original = seo.PAGES['/'].fr.title;
  seo.PAGES['/'].fr.title = 'Dès 80 $/h — $& $` TrouvePro';
  try {
    // & is html-escaped; the point is that no $-sequence is swallowed as a replacement pattern
    assert.match(await html('/'), /<title>Dès 80 \$\/h — \$&amp; \$` TrouvePro<\/title>/);
  } finally {
    seo.PAGES['/'].fr.title = original;
  }
});

test('PUBLIC_URL is read per request, not frozen at module load', () => {
  const before = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = 'https://example.test/';
  try {
    assert.match(seo.head('/', 'fr'), /href="https:\/\/example\.test\/"/);
  } finally {
    if (before === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = before;
  }
});
