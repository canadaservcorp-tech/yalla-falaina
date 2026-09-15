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
// GCC work-sponsorship guide titles/descriptions (lib/gccGuides.js renders the
// actual page bodies from the same country list) - kept here, not generated
// from that list, because head()/PAGES want hand-tuned search-facing copy
// distinct from the on-page H1/intro wording.
const GCC_META = {
  'work-in-uae': {
    en: { title: 'Working in the UAE — Sponsorship & Work Permit Basics | Yalla Nsafer', description: 'How UAE employer-sponsored work permits actually work: who applies, permit types, and links straight to the official U.AE government portal.' },
    fr: { title: 'Travailler aux É.A.U. — parrainage et permis de travail | Yalla Nsafer', description: "Comment fonctionne le parrainage employeur aux É.A.U. : qui fait la demande, les types de permis, avec des liens directs vers le portail officiel U.AE." },
    ar: { title: 'العمل في الإمارات — أساسيات الكفالة وتصريح العمل | يلا نسافر', description: 'كيف تعمل كفالة صاحب العمل في الإمارات فعليًا: من يقدّم الطلب، وأنواع التصاريح، مع روابط مباشرة إلى بوابة U.AE الحكومية الرسمية.' },
  },
  'work-in-saudi-arabia': {
    en: { title: 'Working in Saudi Arabia — Sponsorship & Work Visa Basics | Yalla Nsafer', description: 'How Saudi employer-sponsored work visas work through Qiwa, Saudization compliance, and links straight to the official Ministry of Human Resources portal.' },
    fr: { title: 'Travailler en Arabie saoudite — parrainage et visa de travail | Yalla Nsafer', description: "Comment fonctionne le parrainage employeur en Arabie saoudite via Qiwa, la conformité à la saoudisation, avec des liens directs vers le portail officiel du ministère." },
    ar: { title: 'العمل في السعودية — أساسيات الكفالة وتأشيرة العمل | يلا نسافر', description: 'كيف تعمل كفالة صاحب العمل في السعودية عبر منصة قوى والتزام السعودة، مع روابط مباشرة إلى بوابة وزارة الموارد البشرية الرسمية.' },
  },
  'work-in-qatar': {
    en: { title: 'Working in Qatar — Sponsorship & Kafala Reform Basics | Yalla Nsafer', description: 'How employer sponsorship in Qatar works today, including the 2020 kafala reforms confirmed by the ILO, with links to the official Hukoomi portal.' },
    fr: { title: 'Travailler au Qatar — parrainage et réformes de la kafala | Yalla Nsafer', description: "Comment fonctionne le parrainage employeur au Qatar aujourd'hui, incluant les réformes de la kafala de 2020 confirmées par l'OIT, avec liens vers le portail officiel Hukoomi." },
    ar: { title: 'العمل في قطر — أساسيات الكفالة وإصلاحاتها | يلا نسافر', description: 'كيف تعمل كفالة صاحب العمل في قطر اليوم، بما في ذلك إصلاحات الكفالة لعام 2020 التي أكدتها منظمة العمل الدولية، مع روابط إلى بوابة حكومي الرسمية.' },
  },
  'work-in-kuwait': {
    en: { title: 'Working in Kuwait — Sponsorship & Residency Basics | Yalla Nsafer', description: 'How Kuwait\'s sponsor-based ("Article 18") work residency actually works, and links straight to the official Kuwait Government Online portal.' },
    fr: { title: 'Travailler au Koweït — parrainage et résidence | Yalla Nsafer', description: "Comment fonctionne la résidence de travail par parrainage au Koweït (« Article 18 »), avec des liens directs vers le portail officiel du gouvernement." },
    ar: { title: 'العمل في الكويت — أساسيات الكفالة والإقامة | يلا نسافر', description: 'كيف تعمل الإقامة المرتبطة بالكفيل في الكويت ("المادة 18") فعليًا، مع روابط مباشرة إلى البوابة الحكومية الكويتية الرسمية.' },
  },
};

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
  '/work-in-uae': GCC_META['work-in-uae'],
  '/work-in-saudi-arabia': GCC_META['work-in-saudi-arabia'],
  '/work-in-qatar': GCC_META['work-in-qatar'],
  '/work-in-kuwait': GCC_META['work-in-kuwait'],
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
    // Alternate links only for languages this route actually serves — a page
    // with no 'hi' copy (e.g. the GCC guides) must not advertise a hi variant
    // its own body doesn't have.
    ...LANGS.filter(x => page[x]).map(x => `<link rel="alternate" hreflang="${x}" href="${esc(PUBLIC_URL + routePath + (x === 'en' ? '' : `?lang=${x}`))}">`),
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
      ...LANGS.filter(x => PAGES[p][x]).map(x => `    <xhtml:link rel="alternate" hreflang="${x}" href="${loc}${x === 'en' ? '' : `?lang=${x}`}"/>`),
      '    <changefreq>weekly</changefreq>',
      '    <priority>1.0</priority>', '  </url>'].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

module.exports = { PAGES, INDEXABLE, LANGS, head, robots, sitemap, base };
