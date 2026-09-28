'use strict';

// Real, crawlable directory pages rendered from data that already exists in
// the DB — study_opportunities (curated + admin-reviewed programs and
// scholarships) and medical_treatment_providers (17 real, sourced hospitals).
// Same pattern and sourcing rule as lib/expressEntryPage.js: every row shown
// is a row the concierge itself would quote, linked to its own source URL —
// nothing displayed here isn't already verified data the product relies on.
// This gives Google indexable, content-rich pages for the exact searches the
// verticals target ("study in Turkey", "hospital abroad") — and they grow on
// their own as new verified rows land.
const supabase = require('../db');
const articles = require('./articles');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// en/fr/ar only — same discipline as the GCC guides: our own chrome copy can
// be written in every language, but keep the set at the three languages these
// pages' readers actually search in (and that carry article cross-links).
const LANGS = ['en', 'fr', 'ar'];

async function loadStudyOpportunities(limit = 200) {
  try {
    const { data, error } = await supabase.from('study_opportunities')
      .select('kind,title,institution,country,city,degree_level,field_of_study,tuition_note,funding_coverage_pct,eligibility_note,deadline,source_url')
      .eq('status', 'active')
      .order('country').order('title')
      .limit(limit);
    if (error) { console.error('directories: loadStudyOpportunities', error.message); return []; }
    return data || [];
  } catch (e) { console.error('directories: loadStudyOpportunities', e.message); return []; }
}

async function loadCommunityGroups(limit = 200) {
  try {
    const { data, error } = await supabase.from('community_groups')
      .select('country,city,platform,name,url,language')
      .eq('status', 'active')
      .order('country').order('name')
      .limit(limit);
    if (error) { console.error('directories: loadCommunityGroups', error.message); return []; }
    return data || [];
  } catch (e) { console.error('directories: loadCommunityGroups', e.message); return []; }
}

async function loadAccommodation(limit = 200) {
  try {
    const { data, error } = await supabase.from('accommodation_listings')
      .select('type,country,city,budget_note,description,contact,expires_at')
      .eq('status', 'active')
      .order('country').order('city')
      .limit(limit);
    if (error) { console.error('directories: loadAccommodation', error.message); return []; }
    return data || [];
  } catch (e) { console.error('directories: loadAccommodation', e.message); return []; }
}

async function loadMedicalProviders(limit = 100) {
  try {
    const { data, error } = await supabase.from('medical_treatment_providers')
      .select('hospital_name,country,city,specialties,price_range_note,contact_email,contact_phone,source_url')
      .eq('status', 'active')
      .order('country').order('hospital_name')
      .limit(limit);
    if (error) { console.error('directories: loadMedicalProviders', error.message); return []; }
    return data || [];
  } catch (e) { console.error('directories: loadMedicalProviders', e.message); return []; }
}

const LOCALE = { en: 'en-CA', fr: 'fr-CA', ar: 'ar' };
const formatDate = (iso, lang) => {
  try { return new Intl.DateTimeFormat(LOCALE[lang] || 'en-CA', { dateStyle: 'medium' }).format(new Date(iso)); }
  catch (e) { return iso; }
};

const DEGREE_LABEL = {
  en: { undergraduate: 'Undergraduate', graduate: 'Graduate', phd: 'PhD', language_program: 'Language program', vocational: 'Vocational', program: 'Program', scholarship: 'Scholarship' },
  fr: { undergraduate: 'Licence', graduate: 'Master', phd: 'Doctorat', language_program: 'Programme de langue', vocational: 'Formation professionnelle', program: 'Programme', scholarship: 'Bourse' },
  ar: { undergraduate: 'بكالوريوس', graduate: 'ماجستير', phd: 'دكتوراه', language_program: 'برنامج لغة', vocational: 'تدريب مهني', program: 'برنامج', scholarship: 'منحة' },
};

const COPY = {
  en: {
    studyH1: 'Verified study programs and scholarships',
    communityH1: 'Compatriot communities and housing abroad',
    communityIntro: 'Two community boards: diaspora groups (Facebook, WhatsApp, Telegram) that help newcomers settle, and seeker-posted accommodation offers — couch-surfing, roommates, sublets. These are community posts, not verified listings: confirm everything with the poster before paying or signing anything.',
    groupsH: 'Community groups', accomH: 'Accommodation posts',
    platform: 'Platform', budget: 'Budget', postedBy: 'Contact the poster',
    submitNote: 'Know a group or have a room to offer? Ask the concierge to submit it — every post is reviewed by a human before it appears here.',
    couchsurf: 'Couch-surfing', roommate: 'Roommate', sublet: 'Sublet',
    studyH1Country: 'Programs and scholarships in {country}',
    studyIntro: 'Every program and scholarship below is a real, verified listing — each links to its official source so you can check it yourself. Nothing here is invented: if we cannot verify it, it does not appear.',
    medicalH1: 'Medical treatment providers abroad',
    medicalH1Country: 'Hospitals and treatment centres in {country}',
    medicalIntro: 'Real hospitals and centres listed for treatment abroad — we are not a medical service; our role is purely logistical: where a treatment your doctor named is available, a published cost when one exists, and a real centre to contact.',
    medicalDisclaimer: 'Nothing on this page is medical advice, a diagnosis, or a recommendation of one hospital over another. Decide your treatment with your own doctor, and confirm eligibility, waiting times, and the final cost directly with the hospital before you travel or pay anything.',
    browseCountries: 'Browse by country',
    empty: 'No listings yet — check back soon.',
    deadline: 'Deadline', tuition: 'Tuition/funding', eligible: 'Who qualifies', covers: 'covers',
    specialties: 'Specialties', price: 'Published cost', contact: 'Contact', source: 'Official source →',
    cta: 'Ask the concierge how this applies to your situation →',
    relatedArticles: 'Related guides',
  },
  fr: {
    studyH1: 'Programmes et bourses vérifiés',
    communityH1: 'Communautés de compatriotes et logement à l\'étranger',
    communityIntro: 'Deux tableaux communautaires : des groupes de la diaspora (Facebook, WhatsApp, Telegram) qui aident les nouveaux arrivants, et des offres de logement postées par des membres — canapé, colocation, sous-location. Ce sont des publications communautaires, pas des annonces vérifiées : confirmez tout avec l\'auteur avant de payer ou de signer quoi que ce soit.',
    groupsH: 'Groupes communautaires', accomH: 'Offres de logement',
    platform: 'Plateforme', budget: 'Budget', postedBy: 'Contacter l\'auteur',
    submitNote: 'Vous connaissez un groupe ou proposez une chambre ? Demandez au concierge de le soumettre — chaque publication est revue par un humain avant d\'apparaître ici.',
    couchsurf: 'Canapé', roommate: 'Colocation', sublet: 'Sous-location',
    studyH1Country: 'Programmes et bourses en {country}',
    studyIntro: 'Chaque programme et bourse ci-dessous est une annonce réelle et vérifiée — chacun renvoie à sa source officielle pour que vous puissiez vérifier vous-même. Rien ici n\'est inventé : ce que nous ne pouvons pas vérifier n\'apparaît pas.',
    medicalH1: 'Centres de soins à l\'étranger',
    medicalH1Country: 'Hôpitaux et centres de soins en {country}',
    medicalIntro: 'Des hôpitaux et centres réels répertoriés pour le traitement à l\'étranger — nous ne sommes pas un service médical ; notre rôle est purement logistique : où le traitement nommé par votre médecin est disponible, un coût publié s\'il existe, et un vrai centre à contacter.',
    medicalDisclaimer: 'Rien sur cette page ne constitue un avis médical, un diagnostic ou une recommandation d\'un hôpital plutôt qu\'un autre. Décidez de votre traitement avec votre propre médecin, et confirmez l\'admissibilité, les délais d\'attente et le coût final directement auprès de l\'hôpital avant de voyager ou de payer quoi que ce soit.',
    browseCountries: 'Parcourir par pays',
    empty: 'Aucune annonce pour l\'instant — revenez bientôt.',
    deadline: 'Date limite', tuition: 'Frais/financement', eligible: 'Qui est admissible', covers: 'couvre',
    specialties: 'Spécialités', price: 'Coût publié', contact: 'Contact', source: 'Source officielle →',
    cta: 'Demandez au concierge ce qui s\'applique à votre cas →',
    relatedArticles: 'Guides associés',
  },
  ar: {
    studyH1: 'برامج دراسية ومنح موثّقة',
    communityH1: 'مجتمعات الجاليات والسكن في الخارج',
    communityIntro: 'لوحتان مجتمعيتان: مجموعات للجاليات (فيسبوك وواتساب وتيليجرام) تساعد الوافدين الجدد على الاستقرار، وعروض سكن ينشرها الأعضاء — استضافة مؤقتة وشركاء سكن وعقود فرعية. هذه منشورات مجتمعية وليست إعلانات موثّقة: تأكّد من كل شيء مع الناشر قبل الدفع أو توقيع أي شيء.',
    groupsH: 'مجموعات المجتمع', accomH: 'عروض السكن',
    platform: 'المنصة', budget: 'الميزانية', postedBy: 'تواصل مع الناشر',
    submitNote: 'تعرف مجموعة أو لديك غرفة تعرضها؟ اطلب من المساعد إرسالها — كل منشور يراجعه شخص حقيقي قبل ظهوره هنا.',
    couchsurf: 'استضافة مؤقتة', roommate: 'شريك سكن', sublet: 'عقد فرعي',
    studyH1Country: 'برامج ومنح دراسية في {country}',
    studyIntro: 'كل برنامج ومنحة أدناه إعلان حقيقي ومتحقَّق منه — وكل واحد يرتبط بمصدره الرسمي لتتحقّق بنفسك. لا شيء هنا مختلَق: ما لا نستطيع التحقّق منه لا يظهر.',
    medicalH1: 'مراكز علاج في الخارج',
    medicalH1Country: 'مستشفيات ومراكز علاج في {country}',
    medicalIntro: 'مستشفيات ومراكز حقيقية مدرجة للعلاج في الخارج — لسنا جهة طبية؛ دورنا لوجستي فقط: أين يتوفّر العلاج الذي حدّده طبيبك، وتكلفة منشورة إن وُجدت، ومركز حقيقي للتواصل.',
    medicalDisclaimer: 'لا شيء في هذه الصفحة يُعدّ استشارة طبية أو تشخيصًا أو توصية بمستشفى دون آخر. قرّر علاجك مع طبيبك الخاص، وتأكّد من الأهلية ومدد الانتظار والتكلفة النهائية مباشرة من المستشفى قبل السفر أو دفع أي مبلغ.',
    browseCountries: 'تصفّح حسب البلد',
    empty: 'لا توجد إعلانات بعد — تفقّد الصفحة قريبًا.',
    deadline: 'الموعد النهائي', tuition: 'الرسوم/التمويل', eligible: 'من يحق له', covers: 'تغطي',
    specialties: 'التخصصات', price: 'التكلفة المنشورة', contact: 'التواصل', source: 'المصدر الرسمي ←',
    cta: 'اسأل المساعد كيف ينطبق هذا على وضعك ←',
    relatedArticles: 'أدلة مرتبطة',
  },
};

const PAGE_STYLE = `body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#1a1a1a;background:#fff}
h1{font-size:1.4rem}
.intro{color:#444}
ul.list{list-style:none;padding:0}
li{padding:14px 0;border-bottom:1px solid #e5e5e5}
.meta{color:#555;font-size:.88rem;margin:2px 0}
.badge{display:inline-block;background:#eef4fa;color:#0d5fa6;border-radius:4px;padding:1px 8px;font-size:.8rem;margin-inline-end:6px}
.src{font-size:.88rem}
.related{margin-top:28px}
.related ul{list-style:none;padding:0}
.related li{padding:4px 0;border:0}
.cta{display:inline-block;margin-top:16px;font-weight:600}
.empty{color:#666;font-style:italic}
.note{color:#666;font-size:.85rem;margin-top:20px}
nav{font-size:.85rem;margin-bottom:18px}
.countrynav{margin:10px 0 18px;font-size:.88rem}
.countrynav a{margin-inline-end:10px;white-space:nowrap}`;

function relatedArticles(articleSlugs, l) {
  return articleSlugs.map(slug => {
    const a = articles.ARTICLES.find(x => x.slug === slug);
    if (!a) return '';
    const lang = a.h1[l] ? l : 'en';
    return `<li><a href="${articles.articleUrl(slug, lang)}">${esc(a.h1[lang])}</a></li>`;
  }).join('\n');
}

// ItemList structured data naming every row + its official source URL — the
// format answer engines (and Google list rich-results) read to quote a
// directory's actual contents instead of just its description.
function itemListJsonLd(rows, nameFn, urlFn) {
  const items = (rows || []).slice(0, 50).map((r, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: nameFn(r),
    ...(urlFn(r) ? { url: urlFn(r) } : {}),
  }));
  return items.length ? JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items,
  }) : null;
}

function page({ lang, head, h1, intro, list, relatedSlugs, note, jsonLd }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const dir = l === 'ar' ? ' dir="rtl"' : '';
  const related = relatedSlugs && relatedSlugs.length
    ? `<div class="related"><h2>${esc(c.relatedArticles)}</h2><ul>\n${relatedArticles(relatedSlugs, l)}\n</ul></div>`
    : '';
  return `<!doctype html>
<html lang="${l}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<style>${PAGE_STYLE}</style>
</head>
<body>
<nav><a href="/${l === 'en' ? '' : `?lang=${l}`}">← Yalla Nsafer</a></nav>
<h1>${esc(h1)}</h1>
<p class="intro">${esc(intro)}</p>
${list}
${note ? `<p class="note">${esc(note)}</p>` : ''}
${related}
<p><a class="cta" href="/${l === 'en' ? '' : `?lang=${l}`}">${esc(c.cta)}</a></p>
</body>
</html>
`;
}

function renderStudyPage({ lang, rows, head, countrySlug }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const cc = countrySlug ? STUDY_COUNTRIES[countrySlug] : null;
  const labels = DEGREE_LABEL[l];
  const items = (rows || []).map(r => {
    const badges = [labels[r.kind] || r.kind, labels[r.degree_level]].filter(Boolean)
      .map(b => `<span class="badge">${esc(b)}</span>`).join('');
    const where = [r.institution, r.city, r.country].filter(Boolean).join(' — ');
    const tuition = r.tuition_note ? `<p class="meta">${esc(c.tuition)}: ${esc(r.tuition_note)}${r.funding_coverage_pct != null ? ` (${r.funding_coverage_pct}% ${esc(c.covers)})` : ''}</p>` : '';
    const eligible = r.eligibility_note ? `<p class="meta">${esc(c.eligible)}: ${esc(r.eligibility_note)}</p>` : '';
    const deadline = r.deadline ? `<p class="meta">${esc(c.deadline)}: ${esc(formatDate(r.deadline, l))}</p>` : '';
    const src = r.source_url ? `<a class="src" href="${esc(r.source_url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(c.source)}</a>` : '';
    return `<li>${badges}<b>${esc(r.title)}</b><p class="meta">${esc(where)}</p>${tuition}${eligible}${deadline}${src}</li>`;
  }).join('\n');
  const langQ = l === 'en' ? '' : `?lang=${l}`;
  const nav = `<p class="countrynav"><b>${esc(c.browseCountries)}:</b> ` + Object.keys(STUDY_COUNTRIES)
    .map(slug => `<a href="/study-opportunities/${slug}${langQ}">${esc(STUDY_COUNTRIES[slug][l] || STUDY_COUNTRIES[slug].en)}</a>`)
    .join('') + `</p>`;
  const list = (items ? `<ul class="list">\n${items}\n</ul>` : `<p class="empty">${esc(c.empty)}</p>`) + nav;
  const h1 = cc ? c.studyH1Country.replace('{country}', cc[l] || cc.en) : c.studyH1;
  const jsonLd = itemListJsonLd(rows, r => r.title, r => r.source_url);
  return page({ lang: l, head, h1, intro: c.studyIntro, list, jsonLd, relatedSlugs: ['scholarships-arab-students', 'work-abroad-without-degree', 'verify-immigration-consultant'] });
}

// The countries study_opportunities actually covers (from the live table),
// slug → localized display name + the exact DB country string. Same
// contract as MEDICAL_COUNTRIES below: /study-opportunities/<slug> pages,
// a new seeded country joins by adding one line here.
const STUDY_COUNTRIES = {
  turkey:             { en: 'Turkey',                  fr: 'Turquie',            ar: 'تركيا',                 db: 'Turkey' },
  canada:             { en: 'Canada',                  fr: 'Canada',             ar: 'كندا',                  db: 'Canada' },
  malaysia:           { en: 'Malaysia',                fr: 'Malaisie',           ar: 'ماليزيا',               db: 'Malaysia' },
  'northern-cyprus':  { en: 'Northern Cyprus',         fr: 'Chypre du Nord',     ar: 'قبرص الشمالية',         db: 'Northern Cyprus (TRNC)' },
  egypt:              { en: 'Egypt',                   fr: 'Égypte',             ar: 'مصر',                   db: 'Egypt' },
  russia:             { en: 'Russia',                  fr: 'Russie',             ar: 'روسيا',                 db: 'Russia' },
  china:              { en: 'China',                   fr: 'Chine',              ar: 'الصين',                 db: 'China' },
  'south-korea':      { en: 'South Korea',             fr: 'Corée du Sud',       ar: 'كوريا الجنوبية',        db: 'South Korea' },
  japan:              { en: 'Japan',                   fr: 'Japon',              ar: 'اليابان',               db: 'Japan' },
  jordan:             { en: 'Jordan',                  fr: 'Jordanie',           ar: 'الأردن',                db: 'Jordan' },
  'saudi-arabia':     { en: 'Saudi Arabia',            fr: 'Arabie saoudite',    ar: 'السعودية',              db: 'Saudi Arabia' },
  'united-arab-emirates': { en: 'the United Arab Emirates', fr: 'les Émirats arabes unis', ar: 'الإمارات',    db: 'United Arab Emirates' },
  lebanon:            { en: 'Lebanon',                 fr: 'Liban',              ar: 'لبنان',                 db: 'Lebanon' },
  singapore:          { en: 'Singapore',               fr: 'Singapour',          ar: 'سنغافورة',              db: 'Singapore' },
  kuwait:             { en: 'Kuwait',                  fr: 'Koweït',             ar: 'الكويت',                db: 'Kuwait' },
  qatar:              { en: 'Qatar',                   fr: 'Qatar',              ar: 'قطر',                   db: 'Qatar' },
  cyprus:             { en: 'Cyprus',                  fr: 'Chypre',             ar: 'قبرص',                  db: 'Cyprus' },
  'hong-kong':        { en: 'Hong Kong',               fr: 'Hong Kong',          ar: 'هونغ كونغ',             db: 'Hong Kong' },
  india:              { en: 'India',                   fr: 'Inde',               ar: 'الهند',                 db: 'India' },
  kazakhstan:         { en: 'Kazakhstan',              fr: 'Kazakhstan',         ar: 'كازاخستان',             db: 'Kazakhstan' },
};

// The countries medical_treatment_providers actually covers, slug →
// localized display name + the exact DB country string. Used by the
// per-country directory pages (/medical-providers/<slug>) and their nav;
// a new seeded country joins the pages by adding one line here.
const MEDICAL_COUNTRIES = {
  turkey:        { en: 'Turkey',       fr: 'Turquie',           ar: 'تركيا',            db: 'Turkey' },
  'south-korea': { en: 'South Korea',  fr: 'Corée du Sud',      ar: 'كوريا الجنوبية',   db: 'South Korea' },
  thailand:      { en: 'Thailand',     fr: 'Thaïlande',         ar: 'تايلاند',          db: 'Thailand' },
  india:         { en: 'India',        fr: 'Inde',              ar: 'الهند',            db: 'India' },
  china:         { en: 'China',        fr: 'Chine',             ar: 'الصين',            db: 'China' },
  russia:        { en: 'Russia',       fr: 'Russie',            ar: 'روسيا',            db: 'Russia' },
  malaysia:      { en: 'Malaysia',     fr: 'Malaisie',          ar: 'ماليزيا',          db: 'Malaysia' },
  jordan:        { en: 'Jordan',       fr: 'Jordanie',          ar: 'الأردن',           db: 'Jordan' },
  japan:         { en: 'Japan',        fr: 'Japon',             ar: 'اليابان',          db: 'Japan' },
  cuba:          { en: 'Cuba',         fr: 'Cuba',              ar: 'كوبا',             db: 'Cuba' },
};

function renderMedicalPage({ lang, rows, head, countrySlug }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const cc = countrySlug ? MEDICAL_COUNTRIES[countrySlug] : null;
  const items = (rows || []).map(r => {
    const where = [r.city, r.country].filter(Boolean).join(' — ');
    const specs = `<p class="meta">${esc(c.specialties)}: ${esc(r.specialties)}</p>`;
    const price = r.price_range_note ? `<p class="meta">${esc(c.price)}: ${esc(r.price_range_note)}</p>` : '';
    const contact = [r.contact_email, r.contact_phone].filter(Boolean).map(x => esc(x)).join(' · ');
    const contactHtml = contact ? `<p class="meta">${esc(c.contact)}: ${contact}</p>` : '';
    const src = r.source_url ? `<a class="src" href="${esc(r.source_url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(c.source)}</a>` : '';
    return `<li><b>${esc(r.hospital_name)}</b><p class="meta">${esc(where)}</p>${specs}${price}${contactHtml}${src}</li>`;
  }).join('\n');
  // Per-country nav is also the internal-link structure Google uses to
  // discover the country pages (they rank for "hospitals in X" searches).
  const langQ = l === 'en' ? '' : `?lang=${l}`;
  const nav = `<p class="countrynav"><b>${esc(c.browseCountries)}:</b> ` + Object.keys(MEDICAL_COUNTRIES)
    .map(slug => `<a href="/medical-providers/${slug}${langQ}">${esc(MEDICAL_COUNTRIES[slug][l] || MEDICAL_COUNTRIES[slug].en)}</a>`)
    .join('') + `</p>`;
  const list = (items ? `<ul class="list">\n${items}\n</ul>` : `<p class="empty">${esc(c.empty)}</p>`) + nav;
  const h1 = cc ? c.medicalH1Country.replace('{country}', cc[l] || cc.en) : c.medicalH1;
  const jsonLd = itemListJsonLd(rows, r => r.hospital_name, r => r.source_url);
  return page({ lang: l, head, h1, intro: c.medicalIntro, list, jsonLd, note: c.medicalDisclaimer, relatedSlugs: ['medical-treatment-abroad', 'verify-immigration-consultant'] });
}

// Community boards page (/community): real diaspora groups + member-posted
// accommodation. Honesty rule kept explicit — these are community posts
// (admin-reviewed before going live), not verified listings, and the intro
// says so instead of implying we vetted them.
function renderCommunityPage({ lang, groups, listings, head }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const gRows = (groups || []).map(r => {
    const where = [r.city, r.country].filter(Boolean).join(' — ');
    const link = r.url ? `<a class="src" href="${esc(r.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(r.platform || 'link')} →</a>` : '';
    return `<li><b>${esc(r.name)}</b><p class="meta">${esc(where)}</p>${link}</li>`;
  }).join('\n');
  const aRows = (listings || []).map(r => {
    const where = [r.city, r.country].filter(Boolean).join(' — ');
    const kind = r.type ? `<span class="badge">${esc(c[r.type] || r.type)}</span>` : '';
    const budget = r.budget_note ? `<p class="meta">${esc(c.budget)}: ${esc(r.budget_note)}</p>` : '';
    const desc = r.description ? `<p class="meta">${esc(r.description)}</p>` : '';
    const contact = r.contact ? `<p class="meta">${esc(c.postedBy)}: ${esc(r.contact)}</p>` : '';
    return `<li>${kind}<b>${esc(where)}</b>${budget}${desc}${contact}</li>`;
  }).join('\n');
  const empty = t => `<p class="empty">${esc(t)}</p>`;
  const list =
    `<h2>${esc(c.groupsH)}</h2>` + (gRows ? `<ul class="list">\n${gRows}\n</ul>` : empty(c.empty)) +
    `<h2>${esc(c.accomH)}</h2>` + (aRows ? `<ul class="list">\n${aRows}\n</ul>` : empty(c.empty));
  const jsonLd = itemListJsonLd(
    [...(groups || []).map(g => ({ n: g.name, u: g.url })), ...(listings || []).map(a => ({ n: `${a.city}, ${a.country}`, u: null }))],
    r => r.n, r => r.u);
  return page({ lang: l, head, h1: c.communityH1, intro: c.communityIntro, list, jsonLd, note: c.submitNote });
}

module.exports = { LANGS, STUDY_COUNTRIES, MEDICAL_COUNTRIES, loadStudyOpportunities, loadMedicalProviders, loadCommunityGroups, loadAccommodation, renderStudyPage, renderMedicalPage, renderCommunityPage };
