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

// Blog/guide articles (lib/articles.js) — same PAGES shape as the GCC
// guides: hand-tuned meta per language, served under /blog/<slug>?lang=.
// These exist in ar/fr/en only (the pack's three languages); a page with no
// 'hi' copy must not advertise one.
const ARTICLE_META = {
  'verify-immigration-consultant': {
    ar: { title: 'كيف تتأكد أن مكتب أو مستشار الهجرة موثوق قبل ما تدفع | يلا نسافر', description: 'خطوات عملية للتحقّق من مستشار أو مكتب هجرة قبل الدفع، وعلامات النصب الشائعة — دليل يحميك.' },
    fr: { title: 'Comment vérifier un consultant en immigration avant de payer | Yalla Nsafer', description: "Étapes concrètes pour vérifier un consultant/bureau d'immigration et repérer les arnaques avant de payer." },
    en: { title: 'How to Verify an Immigration Consultant Before You Pay | Yalla Nsafer', description: 'Concrete steps to vet an immigration consultant/office and spot scams before paying.' },
    hi: { title: 'भुगतान से पहले इमिग्रेशन कंसल्टेंट सत्यापित करें | Yalla Nsafer', description: 'भुगतान से पहले इमिग्रेशन कंसल्टेंट/ऑफिस की जाँच करने के ठोस कदम और घोटाले के लक्षण।' },
    tr: { title: 'Ödeme Yapmadan Önce Bir Göç Danışmanını Doğrulayın | Yalla Nsafer', description: 'Ödemeden önce bir göç danışmanını/ofisini doğrulamak için somut adımlar ve dolandırıcılık işaretleri.' },
  },
  'scholarships-arab-students': {
    ar: { title: 'منح دراسية للطلاب العرب 2026 — كيف تجد المنحة المناسبة وتقدّم بنجاح | يلا نسافر', description: 'دليل عملي للعثور على منح دراسية للدراسة في الخارج أو داخل بلدك، وكيفية التقديم — مع إرشاد بلغتك.' },
    fr: { title: "Bourses d'études pour étudiants arabes 2026 — trouver et postuler | Yalla Nsafer", description: "Guide pratique pour trouver des bourses à l'étranger ou dans votre pays, et postuler — guidé dans votre langue." },
    en: { title: 'Scholarships for Arab Students 2026 — Find & Apply | Yalla Nsafer', description: 'Practical guide to finding scholarships abroad or at home, and applying — guided in your language.' },
    hi: { title: 'अरब छात्रों के लिए छात्रवृत्तियाँ 2026 — खोजें और आवेदन करें | Yalla Nsafer', description: 'विदेश या अपने देश में छात्रवृत्ति खोजने और आवेदन करने की व्यावहारिक गाइड — अपनी भाषा में मार्गदर्शन।' },
    tr: { title: 'Arap Öğrenciler İçin Burslar 2026 — Bulun ve Başvurun | Yalla Nsafer', description: 'Yurt dışında veya kendi ülkenizde burs bulma ve başvuru rehberi — kendi dilinizde yönlendirme.' },
  },
  'work-abroad-without-degree': {
    ar: { title: 'السفر للعمل في الخارج حتى بدون شهادة جامعية أو مبلغ كبير | يلا نسافر', description: 'فرص حقيقية للعمل في الخارج لأصحاب المهن — الخليج، أوروبا، كندا — مع الحماية من النصب.' },
    fr: { title: "Travailler à l'étranger même sans diplôme ni gros budget | Yalla Nsafer", description: 'Options réelles selon votre métier — Golfe, Europe, Canada — avec protection contre les arnaques.' },
    en: { title: 'Work Abroad Even Without a Degree or Big Budget | Yalla Nsafer', description: 'Real options based on your trade — Gulf, Europe, Canada — with scam protection.' },
  },
  'spot-fake-job-offer': {
    ar: { title: 'كيف تكتشف عرض سفر أو وظيفة مزيّف قبل أن تدفع | يلا نسافر', description: 'علامات النصب في عروض السفر والعمل بالخارج، وكيف تتحقّق قبل أن تدفع أو تسلّم أوراقك.' },
    fr: { title: "Comment repérer une fausse offre de voyage ou d'emploi | Yalla Nsafer", description: "Les signes d'arnaque dans les offres de travail à l'étranger et comment vérifier avant de payer." },
    en: { title: 'How to Spot a Fake Travel or Job Offer Before You Pay | Yalla Nsafer', description: 'Warning signs of travel/work-abroad scams and how to verify an offer before paying or handing over documents.' },
  },
  'medical-treatment-abroad': {
    ar: { title: 'العلاج في الخارج: كيف تجد المكان المناسب وتتجنّب النصب | يلا نسافر', description: 'إرشاد لوجستي للعثور على مستشفى أو مركز للعلاج الذي حدّده طبيبك في الخارج، مع الحماية من عروض النصب — لسنا جهة طبية ولا نقدّم تشخيصًا.' },
    fr: { title: "Se faire soigner à l'étranger : trouver le bon endroit en sécurité | Yalla Nsafer", description: 'Accompagnement logistique pour trouver un hôpital/centre pour le traitement indiqué par votre médecin, avec protection anti-arnaque — nous ne sommes pas un service médical, aucun diagnostic.' },
    en: { title: 'Medical Treatment Abroad: Find It Safely | Yalla Nsafer', description: 'Logistical help to find a hospital/centre for the treatment your doctor named abroad, with scam protection — we are not a medical service and give no diagnosis.' },
  },
};

// Per-country medical-directory pages (/medical-providers/<slug>, same slug
// list as lib/directories.js's MEDICAL_COUNTRIES). The "hospitals in X"
// searches rank per country, so each page gets its own hand-tuned title/
// description rather than a generated variant of the index page's copy —
// same reason the GCC guides keep their own meta above.
const MEDICAL_COUNTRIES_META = {
  'turkey':      { en: 'Turkey',       fr: 'Turquie',           ar: 'تركيا' },
  'south-korea': { en: 'South Korea',  fr: 'Corée du Sud',      ar: 'كوريا الجنوبية' },
  'thailand':    { en: 'Thailand',     fr: 'Thaïlande',         ar: 'تايلاند' },
  'india':       { en: 'India',        fr: 'Inde',              ar: 'الهند' },
  'china':       { en: 'China',        fr: 'Chine',             ar: 'الصين' },
  'russia':      { en: 'Russia',       fr: 'Russie',            ar: 'روسيا' },
  'malaysia':    { en: 'Malaysia',     fr: 'Malaisie',          ar: 'ماليزيا' },
  'jordan':      { en: 'Jordan',       fr: 'Jordanie',          ar: 'الأردن' },
  'japan':       { en: 'Japan',        fr: 'Japon',             ar: 'اليابان' },
  'cuba':        { en: 'Cuba',         fr: 'Cuba',              ar: 'كوبا' },
};
const MEDICAL_COUNTRY_META = Object.fromEntries(
  Object.entries(MEDICAL_COUNTRIES_META).map(([slug, names]) => [`/medical-providers/${slug}`, {
    en: { title: `Hospitals & Treatment Centres in ${names.en} | Yalla Nsafer`, description: `Real, listed hospitals and international-patient centres in ${names.en} — contacts and official source links. We are not a medical service.` },
    fr: { title: `Hôpitaux et centres de soins en ${names.fr} | Yalla Nsafer`, description: `Des hôpitaux et centres pour patients internationaux réels en ${names.fr} — contacts et liens vers les sources officielles. Nous ne sommes pas un service médical.` },
    ar: { title: `مستشفيات ومراكز علاج في ${names.ar} | يلا نسافر`, description: `مستشفيات ومراكز حقيقية للمرضى الدوليين في ${names.ar} — معلومات تواصل وروابط المصادر الرسمية. لسنا جهة طبية.` },
  }]),
);

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
    tr: {
      title: 'Yalla Nsafer — Seyahatiniz İçin Asistanınız',
      description: "Orta Doğu ve Hindistan'dan iş arayanların yurt dışında gerçek, doğrulanmış fırsatlar bulmasına ve her adımı anlamasına yardımcı olan çok dilli bir asistan. Arapça, Fransızca, İngilizce, Hintçe ve Türkçe.",
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
    tr: {
      title: 'Kanada Express Entry Çekilişleri — Son Turlar ve CRS Eşik Puanları',
      description: "IRCC'den doğrudan tüm güncel Express Entry davet turları: çekiliş numarası, tarih, program, verilen davet sayısı ve CRS puan eşiği.",
    },
  },
  '/work-in-uae': GCC_META['work-in-uae'],
  '/work-in-saudi-arabia': GCC_META['work-in-saudi-arabia'],
  '/work-in-qatar': GCC_META['work-in-qatar'],
  '/work-in-kuwait': GCC_META['work-in-kuwait'],
  '/blog': {
    ar: { title: 'الأدلة العملية | يلا نسافر', description: 'أدلة عملية للعمل والدراسة والعلاج في الخارج — والحماية من النصب.' },
    fr: { title: 'Guides pratiques | Yalla Nsafer', description: "Guides pratiques pour le travail, les études et le soin à l'étranger — et la protection contre les arnaques." },
    en: { title: 'Practical Guides | Yalla Nsafer', description: 'Practical guides for work, study, and medical treatment abroad — and staying safe from scams.' },
    hi: { title: 'व्यावहारिक गाइड | Yalla Nsafer', description: 'विदेश में काम, पढ़ाई और इलाज की व्यावहारिक गाइड — और घोटालों से सुरक्षा।' },
    tr: { title: 'Pratik Rehberler | Yalla Nsafer', description: 'Yurt dışında iş, eğitim ve tedavi için pratik rehberler — ve dolandırıcılıktan korunma.' },
  },
  '/study-opportunities': {
    ar: { title: 'برامج دراسية ومنح موثّقة | يلا نسافر', description: 'برامج دراسية ومنح حقيقية ومتحقَّق منها في المنطقة وخارجها — كل واحدة مرتبطة بمصدرها الرسمي.' },
    fr: { title: 'Programmes et bourses vérifiés | Yalla Nsafer', description: "Des programmes d'études et des bourses réels et vérifiés dans la région et au-delà — chacun lié à sa source officielle." },
    en: { title: 'Verified Study Programs & Scholarships | Yalla Nsafer', description: 'Real, verified study programs and scholarships in the region and beyond — each linked to its official source.' },
  },
  '/medical-providers': {
    ar: { title: 'مراكز علاج موثّقة في الخارج | يلا نسافر', description: 'مستشفيات ومراكز حقيقية مدرجة لدينا للعلاج في الخارج — مع روابط المصادر الرسمية. لسنا جهة طبية.' },
    fr: { title: "Centres de soins vérifiés à l'étranger | Yalla Nsafer", description: "Des hôpitaux et centres réels répertoriés pour le traitement à l'étranger — avec liens vers les sources officielles. Nous ne sommes pas un service médical." },
    en: { title: 'Verified Medical Treatment Providers Abroad | Yalla Nsafer', description: 'Real, listed hospitals and centres for treatment abroad — with official source links. We are not a medical service.' },
  },
  ...MEDICAL_COUNTRY_META,
  '/blog/verify-immigration-consultant': ARTICLE_META['verify-immigration-consultant'],
  '/blog/scholarships-arab-students': ARTICLE_META['scholarships-arab-students'],
  '/blog/work-abroad-without-degree': ARTICLE_META['work-abroad-without-degree'],
  '/blog/spot-fake-job-offer': ARTICLE_META['spot-fake-job-offer'],
  '/blog/medical-treatment-abroad': ARTICLE_META['medical-treatment-abroad'],
};

const INDEXABLE = Object.keys(PAGES);
const LANGS = ['en', 'fr', 'ar', 'hi', 'tr'];

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
