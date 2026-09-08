// Per-route <head> metadata for the single-page app. The whole app is one HTML
// file, so the server swaps the block between the seo markers before sending it.
// Read per request: on Railway the value differs between environments and a
// frozen module-load copy has bitten us before.
const base = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

// Yalla Falaina is a single indexable surface for Phase 1 — the concierge.
const PAGES = {
  '/': {
    en: {
      title: 'Yalla Falaina — Your Assistant to Travel',
      description: 'A trilingual concierge that helps Middle East job seekers find real, verified opportunities abroad and understand each step of getting there. Arabic, French and English.',
    },
    fr: {
      title: 'Yalla Falaina — Votre assistant de voyage',
      description: "Un concierge trilingue qui aide les chercheurs d'emploi du Moyen-Orient à trouver de vraies opportunités vérifiées à l'étranger. Arabe, français et anglais.",
    },
    ar: {
      title: 'يلا فلاينة — مساعدك للسفر',
      description: 'مساعد ذكي ثلاثي اللغات يساعد الباحثين عن عمل في الشرق الأوسط على إيجاد فرص حقيقية وموثقة في الخارج. عربي وفرنسي وإنجليزي.',
    },
  },
};

const INDEXABLE = Object.keys(PAGES);
const LANGS = ['en', 'fr', 'ar'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function jsonLd() {
  const PUBLIC_URL = base();
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Yalla Falaina',
    url: PUBLIC_URL + '/',
    inLanguage: ['en', 'fr', 'ar'],
  });
}

function head(routePath, lang) {
  const PUBLIC_URL = base();
  const page = PAGES[routePath] || PAGES['/'];
  const l = LANGS.includes(lang) ? lang : 'en';
  const { title, description } = page[l];
  const canonical = PUBLIC_URL + routePath + (l === 'en' ? '' : `?lang=${l}`);
  const verify = process.env.GOOGLE_SITE_VERIFICATION;
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    ...LANGS.map(x => `<link rel="alternate" hreflang="${x}" href="${esc(PUBLIC_URL + routePath + (x === 'en' ? '' : `?lang=${x}`))}">`),
    `<link rel="alternate" hreflang="x-default" href="${esc(PUBLIC_URL + routePath)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Yalla Falaina">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<script type="application/ld+json">${jsonLd()}</script>`,
  ];
  if (verify) lines.splice(2, 0, `<meta name="google-site-verification" content="${esc(verify)}">`);
  return lines.join('\n');
}

// Everything under /api is data and the signed-in views are per-user: neither belongs in an index.
function robots() {
  const PUBLIC_URL = base();
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', '',
    `Sitemap: ${PUBLIC_URL}/sitemap.xml`, ''].join('\n');
}

function sitemap() {
  const PUBLIC_URL = base();
  const urls = INDEXABLE.map(p => {
    const loc = PUBLIC_URL + p;
    return ['  <url>', `    <loc>${loc}</loc>`,
      ...LANGS.map(x => `    <xhtml:link rel="alternate" hreflang="${x}" href="${loc}${x === 'en' ? '' : `?lang=${x}`}"/>`),
      '    <changefreq>weekly</changefreq>',
      '    <priority>1.0</priority>', '  </url>'].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

module.exports = { PAGES, INDEXABLE, LANGS, head, robots, sitemap, base };
