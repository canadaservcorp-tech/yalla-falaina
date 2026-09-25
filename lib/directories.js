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
    studyIntro: 'Every program and scholarship below is a real, verified listing — each links to its official source so you can check it yourself. Nothing here is invented: if we cannot verify it, it does not appear.',
    medicalH1: 'Medical treatment providers abroad',
    medicalH1Country: 'Hospitals and treatment centres in {country}',
    medicalIntro: 'Real hospitals and centres listed for treatment abroad — we are not a medical service; our role is purely logistical: where a treatment your doctor named is available, a published cost when one exists, and a real centre to contact.',
    browseCountries: 'Browse by country',
    empty: 'No listings yet — check back soon.',
    deadline: 'Deadline', tuition: 'Tuition/funding', eligible: 'Who qualifies', covers: 'covers',
    specialties: 'Specialties', price: 'Published cost', contact: 'Contact', source: 'Official source →',
    cta: 'Ask the concierge how this applies to your situation →',
    relatedArticles: 'Related guides',
  },
  fr: {
    studyH1: 'Programmes et bourses vérifiés',
    studyIntro: 'Chaque programme et bourse ci-dessous est une annonce réelle et vérifiée — chacun renvoie à sa source officielle pour que vous puissiez vérifier vous-même. Rien ici n\'est inventé : ce que nous ne pouvons pas vérifier n\'apparaît pas.',
    medicalH1: 'Centres de soins à l\'étranger',
    medicalH1Country: 'Hôpitaux et centres de soins en {country}',
    medicalIntro: 'Des hôpitaux et centres réels répertoriés pour le traitement à l\'étranger — nous ne sommes pas un service médical ; notre rôle est purement logistique : où le traitement nommé par votre médecin est disponible, un coût publié s\'il existe, et un vrai centre à contacter.',
    browseCountries: 'Parcourir par pays',
    empty: 'Aucune annonce pour l\'instant — revenez bientôt.',
    deadline: 'Date limite', tuition: 'Frais/financement', eligible: 'Qui est admissible', covers: 'couvre',
    specialties: 'Spécialités', price: 'Coût publié', contact: 'Contact', source: 'Source officielle →',
    cta: 'Demandez au concierge ce qui s\'applique à votre cas →',
    relatedArticles: 'Guides associés',
  },
  ar: {
    studyH1: 'برامج دراسية ومنح موثّقة',
    studyIntro: 'كل برنامج ومنحة أدناه إعلان حقيقي ومتحقَّق منه — وكل واحد يرتبط بمصدره الرسمي لتتحقّق بنفسك. لا شيء هنا مختلَق: ما لا نستطيع التحقّق منه لا يظهر.',
    medicalH1: 'مراكز علاج في الخارج',
    medicalH1Country: 'مستشفيات ومراكز علاج في {country}',
    medicalIntro: 'مستشفيات ومراكز حقيقية مدرجة للعلاج في الخارج — لسنا جهة طبية؛ دورنا لوجستي فقط: أين يتوفّر العلاج الذي حدّده طبيبك، وتكلفة منشورة إن وُجدت، ومركز حقيقي للتواصل.',
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

function page({ lang, head, h1, intro, list, relatedSlugs }) {
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
<style>${PAGE_STYLE}</style>
</head>
<body>
<nav><a href="/${l === 'en' ? '' : `?lang=${l}`}">← Yalla Nsafer</a></nav>
<h1>${esc(h1)}</h1>
<p class="intro">${esc(intro)}</p>
${list}
${related}
<p><a class="cta" href="/${l === 'en' ? '' : `?lang=${l}`}">${esc(c.cta)}</a></p>
</body>
</html>
`;
}

function renderStudyPage({ lang, rows, head }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
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
  const list = items ? `<ul class="list">\n${items}\n</ul>` : `<p class="empty">${esc(c.empty)}</p>`;
  return page({ lang: l, head, h1: c.studyH1, intro: c.studyIntro, list, relatedSlugs: ['scholarships-arab-students', 'work-abroad-without-degree', 'verify-immigration-consultant'] });
}

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
  return page({ lang: l, head, h1, intro: c.medicalIntro, list, relatedSlugs: ['medical-treatment-abroad', 'verify-immigration-consultant'] });
}

module.exports = { LANGS, MEDICAL_COUNTRIES, loadStudyOpportunities, loadMedicalProviders, renderStudyPage, renderMedicalPage };
