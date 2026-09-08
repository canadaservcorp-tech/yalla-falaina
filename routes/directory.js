// Trade × city landing pages — GET /services/:trade/:city[?lang=en]
// and their own sitemap, /sitemap-services.xml.
const express = require('express');
const sec = require('../lib/security');
const dir = require('../lib/directory');
const page = require('../lib/directory-page');
const seo = require('../lib/seo');
const { isSlug } = require('../lib/slug');
const router = express.Router();

const notFound = () => '<!doctype html><meta charset="utf-8"><title>TrouvePro</title>'
  + '<body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto">'
  + '<h2>Page introuvable / Page not found</h2>'
  + '<p><a href="/" style="color:#0f7c7b">TrouvePro</a></p></body>';

router.get('/:trade/:city', sec.limits.api, async (req, res) => {
  const { trade, city } = req.params;
  if (!isSlug(trade) || !isSlug(city)) return res.status(404).type('html').send(notFound());
  const lang = req.query.lang === 'en' ? 'en' : 'fr';
  try {
    const found = await dir.entry(trade, city);
    if (!found) return res.status(404).type('html').send(notFound());
    const { cities, trades } = await dir.siblings(trade, city);
    const href = key => '/services/' + key + (lang === 'en' ? '?lang=en' : '');
    res.type('html').send(page.render({
      trade: lang === 'en' ? found.tradeEn : found.tradeFr,
      city: found.city,
      providers: found.providers,
      cities: cities.map(c => ({ label: c.label, href: href(c.key) })),
      trades: trades.map(t => ({ label: t.label, href: href(t.key) })),
      lang,
    }));
  } catch (e) {
    console.error('directory', e);
    res.status(500).type('html').send(notFound());
  }
});

async function sitemap() {
  const base = seo.base();
  const urls = (await dir.combos()).map(key => {
    const loc = `${base}/services/${key}`;
    return ['  <url>', `    <loc>${loc}</loc>`,
      `    <xhtml:link rel="alternate" hreflang="fr-CA" href="${loc}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en-CA" href="${loc}?lang=en"/>`,
      '    <changefreq>weekly</changefreq>', '    <priority>0.6</priority>', '  </url>'].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

module.exports = router;
module.exports.sitemap = sitemap;
