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

// Must stay identical to the Google Business Profile listing: a mismatch between the
// profile address and the site's markup is what gets a local listing distrusted.
const ADDRESS = {
  street: '309-1355 Boul. Le Corbusier',
  city: 'Laval',
  postalCode: 'H7N 0G4',
};

// The office is one place; the coverage is the whole Greater Montréal area.
// Provider and seeker addresses are never published — this is TrouvePro's own office.
const SERVICE_AREA = ['Laval', 'Montréal', 'Longueuil', 'Terrebonne', 'Repentigny', 'Boisbriand', 'Saint-Eustache'];
const SERVICE_CENTRE = { lat: 45.5589, lng: -73.7492, radiusMetres: 45000 };   // Laval, ~45 km

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

// A marketplace, not a storefront: Organization + WebSite, the operator's own office and
// the area served. No opening hours — there is no counter to walk into.
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
      address: {
        '@type': 'PostalAddress',
        streetAddress: ADDRESS.street,
        addressLocality: ADDRESS.city,
        addressRegion: ORG.region,
        postalCode: ADDRESS.postalCode,
        addressCountry: ORG.country,
      },
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
  const canonical = PUBLIC_URL + routePath + (l === 'en' ? '?lang=en' : '');
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
    `<meta property="og:image" content="${PUBLIC_URL}/icons/icon-512.png">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${PUBLIC_URL}/icons/icon-512.png">`,
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

module.exports = { PAGES, INDEXABLE, SERVICE_AREA, ADDRESS, head, robots, sitemap, base };
