// Per-route <head> metadata for the single-page app. The whole app is one HTML
// file, so the server swaps the block between the seo markers before sending it.
// Read per request: on Railway the value differs between environments and a
// frozen module-load copy has bitten us before.
const base = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

// Yalla Nsafer was a single indexable surface for Phase 1 — the concierge
// shell at '/'. /express-entry-draws is the second: a real, crawlable page
// (lib/expressEntryPage.js) built from IRCC data already stored in
// news_items, not another view of the SPA shell — see server.js's own route
// for it, registered ahead of the catch-all SPA handler.
const PAGES = {
  '/': {
    en: {
      title: 'Yalla Nsafer — Your Assistant to Travel',
      description: 'A trilingual concierge that helps Middle East job seekers find real, verified opportunities abroad and understand each step of getting there. Arabic, French and English.',
    },
    fr: {
      title: 'Yalla Nsafer — Votre assistant de voyage',
      description: "Un concierge trilingue qui aide les chercheurs d'emploi du Moyen-Orient à trouver de vraies opportunités vérifiées à l'étranger. Arabe, français et anglais.",
    },
    ar: {
      title: 'يلا نسافر — مساعدك للسفر',
      description: 'مساعد ذكي ثلاثي اللغات يساعد الباحثين عن عمل في الشرق الأوسط على إيجاد فرص حقيقية وموثقة في الخارج. عربي وفرنسي وإنجليزي.',
    },
    hi: {
      title: 'यल्ला नसाफ़िर — यात्रा के लिए आपका सहायक',
      description: 'एक बहुभाषी कंसीयर्ज जो मध्य पूर्व और भारत के नौकरी चाहने वालों को विदेश में असली, सत्यापित अवसर खोजने में मदद करता है। अरबी, फ़्रेंच, अंग्रेज़ी और हिन्दी।',
    },
  },
  '/express-entry-draws': {
    en: {
      title: 'Canada Express Entry Draws — Latest Rounds & CRS Cutoffs',
      description: 'Every recent Express Entry round of invitations, straight from IRCC: draw number, date, program, invitations issued, and CRS score cutoff.',
    },
    fr: {
      title: "Rondes d'Entrée express Canada — dernières invitations et scores SCG",
      description: "Toutes les rondes récentes d'Entrée express, directement d'IRCC : numéro de ronde, date, programme, invitations émises et score de coupure SCG.",
    },
    ar: {
      title: 'سحوبات الدخول السريع الكندي — أحدث الجولات والحد الأدنى لنقاط CRS',
      description: 'كل جولات الدخول السريع الأخيرة، مباشرة من IRCC: رقم السحب، التاريخ، البرنامج، عدد الدعوات، والحد الأدنى لنقاط CRS.',
    },
    hi: {
      title: 'कनाडा एक्सप्रेस एंट्री ड्रॉ — नवीनतम राउंड और CRS कटऑफ',
      description: 'हाल के सभी एक्सप्रेस एंट्री राउंड, सीधे IRCC से: ड्रॉ नंबर, तारीख़, प्रोग्राम, जारी किए गए आमंत्रण, और CRS स्कोर कटऑफ।',
    },
  },
};

const INDEXABLE = Object.keys(PAGES);
const LANGS = ['en', 'fr', 'ar', 'hi'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function jsonLd() {
  const PUBLIC_URL = base();
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Yalla Nsafer',
    url: PUBLIC_URL + '/',
    inLanguage: LANGS,
  });
}

// `canonicalLang` exists because the served language and the canonical URL can
// legitimately disagree: a visitor in Cairo gets the Arabic page for the bare
// `/` URL (lib/geo.js), and that URL must still canonicalise to the x-default
// `/`, not to `?lang=ar`, or every country would report a different canonical
// for the same address.
function head(routePath, lang, canonicalLang) {
  const PUBLIC_URL = base();
  const page = PAGES[routePath] || PAGES['/'];
  const l = LANGS.includes(lang) ? lang : 'en';
  const cl = LANGS.includes(canonicalLang) ? canonicalLang : (canonicalLang === undefined ? l : 'en');
  const { title, description } = page[l];
  const canonical = PUBLIC_URL + routePath + (cl === 'en' ? '' : `?lang=${cl}`);
  const verify = process.env.GOOGLE_SITE_VERIFICATION;
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    ...LANGS.map(x => `<link rel="alternate" hreflang="${x}" href="${esc(PUBLIC_URL + routePath + (x === 'en' ? '' : `?lang=${x}`))}">`),
    `<link rel="alternate" hreflang="x-default" href="${esc(PUBLIC_URL + routePath)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Yalla Nsafer">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(PUBLIC_URL + '/og-image.jpg')}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Yalla Nsafer — a plane over the brand name">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(PUBLIC_URL + '/og-image.jpg')}">`,
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
