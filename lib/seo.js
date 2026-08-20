// Per-route <head> metadata for the SPA. The whole app is one HTML file, so the
// server swaps the block between the seo markers before sending it; crawlers get a
// distinct title, description, canonical and hreflang pair for every indexable path.
// read per request: on Railway the value differs between environments and a frozen
// module-load copy has bitten us before
const base = () => (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');

const ORG = {
  name: 'TrouvePro',
  legalName: 'Performance Cristal Technologies Avancées S.A.',
  email: 'contact@mytrouvepro.net',
  instagram: 'https://www.instagram.com/mytrouvepro',
  region: 'QC',
  country: 'CA',
};

// Service-area business: the public markup carries coverage, never a street address.
// The office address exists only in the private Google Business Profile record.
const SERVICE_AREA = ['Laval', 'Montréal', 'Longueuil', 'Terrebonne', 'Repentigny', 'Boisbriand', 'Saint-Eustache'];
const SERVICE_CENTRE = { lat: 45.5589, lng: -73.7492, radiusMetres: 45000 };   // Laval, ~45 km

// A designed 1200x630 card per language: what Instagram, Facebook and iMessage show.
// The icon is square, so it was being letterboxed or cropped in link previews.
const SHARE_IMAGE = {
  fr: { path: '/og/share-fr.png', alt: 'TrouvePro — services près de chez vous à Laval et Montréal' },
  en: { path: '/og/share-en.png', alt: 'TrouvePro — local services near you in Laval and Montreal' },
  width: 1200,
  height: 630,
};

// Keep to what the app actually does: a search page, and three content pages.
const PAGES = {
  '/': {
    fr: {
      title: 'TrouvePro — Services près de chez vous à Laval et Montréal',
      description: "Trouvez un plombier, un électricien, une infirmière ou un homme à tout faire près de chez vous à Laval, Montréal et sur la Rive-Nord. Recherche gratuite par proximité, prestataires licenciés RBQ, contact par messagerie.",
    },
    en: {
      title: 'TrouvePro — Local services near you in Laval and Montreal',
      description: 'Find a plumber, electrician, nurse or handyman near you in Laval, Montreal and the North Shore. Free proximity search, RBQ-licensed providers, in-app messaging.',
    },
  },
  '/faq': {
    fr: {
      title: 'Foire aux questions — TrouvePro',
      description: "Dépôts et annulations, réclamation d'une fiche RBQ, abonnement, placement en tête de liste, confidentialité et signalements : 20 réponses sur le fonctionnement de TrouvePro.",
    },
    en: {
      title: 'Frequently asked questions — TrouvePro',
      description: 'Deposits and cancellations, claiming an RBQ listing, subscription, top-of-list placement, privacy and reporting: 20 answers about how TrouvePro works.',
    },
  },
  '/terms': {
    fr: {
      title: "Conditions d'utilisation — TrouvePro",
      description: "Conditions d'utilisation de TrouvePro : abonnement des prestataires, placement payant, dépôts de réservation, taxes TPS/TVQ et droit applicable au Québec.",
    },
    en: {
      title: 'Terms of Use — TrouvePro',
      description: 'TrouvePro Terms of Use: provider subscription, paid placement, booking deposits, GST/QST and the law applicable in Québec.',
    },
  },
  '/privacy': {
    fr: {
      title: 'Politique de confidentialité — TrouvePro',
      description: "Comment TrouvePro traite vos renseignements personnels selon la Loi 25 : position approximative seulement, adresse jamais affichée, conservation, sous-traitants et vos droits.",
    },
    en: {
      title: 'Privacy Policy — TrouvePro',
      description: 'How TrouvePro handles your personal information under Law 25: approximate location only, address never displayed, retention, processors and your rights.',
    },
  },
};

const INDEXABLE = Object.keys(PAGES);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A marketplace, not a storefront: Organization + WebSite describing the area served.
// No PostalAddress, no opening hours — the app's whole privacy model is that exact
// addresses are never displayed, and that applies to our own address too.
function jsonLd() {
  const PUBLIC_URL = base();
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: ORG.name,
      legalName: ORG.legalName,
      url: PUBLIC_URL + '/',
      logo: PUBLIC_URL + '/icons/icon-512.png',
      email: ORG.email,
      sameAs: [ORG.instagram],
      areaServed: [
        ...SERVICE_AREA.map(name => ({ '@type': 'City', name, addressRegion: ORG.region, addressCountry: ORG.country })),
        { '@type': 'AdministrativeArea', name: 'Québec' },
        {
          '@type': 'GeoCircle',
          geoMidpoint: { '@type': 'GeoCoordinates', latitude: SERVICE_CENTRE.lat, longitude: SERVICE_CENTRE.lng },
          geoRadius: String(SERVICE_CENTRE.radiusMetres),
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: ORG.name,
      url: PUBLIC_URL + '/',
      inLanguage: ['fr-CA', 'en-CA'],
    },
  ]);
}

function head(routePath, lang) {
  const PUBLIC_URL = base();
  const page = PAGES[routePath] || PAGES['/'];
  const l = lang === 'en' ? 'en' : 'fr';
  const { title, description } = page[l];
  // Campaign parameters (utm_*) never reach the canonical: one indexable URL per page.
  const canonical = PUBLIC_URL + routePath + (l === 'en' ? '?lang=en' : '');
  const share = SHARE_IMAGE[l];
  const image = PUBLIC_URL + share.path;
  const verify = process.env.GOOGLE_SITE_VERIFICATION;
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<link rel="alternate" hreflang="fr-CA" href="${esc(PUBLIC_URL + routePath)}">`,
    `<link rel="alternate" hreflang="en-CA" href="${esc(PUBLIC_URL + routePath + '?lang=en')}">`,
    `<link rel="alternate" hreflang="x-default" href="${esc(PUBLIC_URL + routePath)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="TrouvePro">`,
    `<meta property="og:locale" content="${l === 'en' ? 'en_CA' : 'fr_CA'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}">`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}">`,
    `<meta property="og:image:alt" content="${esc(share.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<script type="application/ld+json">${jsonLd()}</script>`,
  ];
  if (verify) lines.splice(2, 0, `<meta name="google-site-verification" content="${esc(verify)}">`);
  return lines.join('\n');
}

// Everything under /api is data, and the signed-in views are per-user: neither belongs in an index.
function robots() {
  const PUBLIC_URL = base();
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin.html', '', `Sitemap: ${PUBLIC_URL}/sitemap.xml`, ''].join('\n');
}

function sitemap() {
  const PUBLIC_URL = base();
  const urls = INDEXABLE.map(p => {
    const loc = PUBLIC_URL + p;
    return ['  <url>', `    <loc>${loc}</loc>`,
      `    <xhtml:link rel="alternate" hreflang="fr-CA" href="${loc}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en-CA" href="${loc}?lang=en"/>`,
      `    <changefreq>${p === '/' ? 'daily' : 'monthly'}</changefreq>`,
      `    <priority>${p === '/' ? '1.0' : '0.5'}</priority>`, '  </url>'].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

module.exports = { PAGES, INDEXABLE, SERVICE_AREA, SHARE_IMAGE, head, robots, sitemap, base };
