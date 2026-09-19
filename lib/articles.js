'use strict';

// The SEO content pack (yalla-falaina-seo-pack.md): three evergreen articles,
// each in Arabic, French, and English, rendered as plain static pages the way
// lib/gccGuides.js does -- a crawler or a slow phone sees full content with
// zero JS and zero DB dependency.
//
// The pack's own honesty guardrails are preserved verbatim in the copy:
// nothing below promises a visa, a job, or an admission ("guaranteed"
// anything is both untrue and a scam tell), and the anti-scam angle is
// stated as what it actually is -- what the platform does, not a marketing
// claim. Every article ends by pointing at the concierge instead of
// promising an outcome.
//
// One URL per article + ?lang= variant -- the same convention as the GCC
// guide routes (see server.js): the canonical/hreflang wiring in lib/seo.js
// already understands that shape, so no separate /blog/<lang>/ namespace is
// needed.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LANGS = ['ar', 'fr', 'en'];

const ARTICLES = [
  {
    slug: 'scholarships-arab-students',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'منح دراسية للطلاب العرب 2026 — كيف تجد المنحة المناسبة وتقدّم بنجاح',
        description: 'دليل عملي للطلاب العرب للعثور على منح دراسية مجانية للدراسة في الخارج، وكيفية التقديم بطريقة صحيحة — مع إرشاد بلغتك.',
      },
      fr: {
        title: "Bourses d'études à l'étranger 2026 — trouver la bonne et postuler",
        description: "Guide pratique pour trouver des bourses d'études à l'étranger, éviter les erreurs de candidature et être guidé dans votre langue.",
      },
      en: {
        title: 'Scholarships for Arab Students 2026 — Find the Right One & Apply',
        description: 'A practical guide to finding study-abroad scholarships, avoiding application mistakes, and getting guidance in your own language.',
      },
    },
    h1: {
      ar: 'منح دراسية للطلاب العرب: دليلك الكامل لعام 2026',
      fr: "Bourses d'études à l'étranger : votre guide complet 2026",
      en: 'Scholarships for Arab Students: Your Complete 2026 Guide',
    },
    intro: {
      ar: 'المنح الدراسية متاحة لعدد أكبر من الطلاب مما تتوقّع. المشكلة ليست في قلّة المنح، بل في معرفة أين تبحث، وأيّها يناسب ملفّك، وكيف تقدّم طلبًا مقنعًا.',
      fr: "Il existe plus de bourses que vous ne le pensez. La difficulté n'est pas le manque de bourses — c'est de savoir où chercher, laquelle correspond à votre profil, et comment déposer une candidature convaincante.",
      en: "Scholarships exist for far more students than you'd think. The hard part isn't a lack of scholarships — it's knowing where to look, which fits your profile, and how to apply convincingly.",
    },
    sections: [
      {
        h2: { ar: 'كيف تجد المنحة المناسبة لك', fr: 'Comment trouver la bonne bourse', en: 'How to find the right scholarship' },
        bullets: {
          ar: [
            'حدّد المستوى (بكالوريوس، ماجستير، دكتوراه) والدولة التي تريدها.',
            'ابحث عن المنح الحكومية والجامعية معًا — كثير من الجامعات تقدّم منحًا خاصة بها.',
            'انتبه للمواعيد النهائية؛ أغلب المنح تُغلق قبل بداية العام الدراسي بأشهر.',
          ],
          fr: [
            'Définissez le niveau (licence, master, doctorat) et le pays visé.',
            'Cherchez à la fois les bourses gouvernementales et celles des universités.',
            'Surveillez les dates limites — la plupart ferment des mois avant la rentrée.',
          ],
          en: [
            "Decide your level (bachelor's, master's, PhD) and target country.",
            'Look at both government and university scholarships — many universities fund their own.',
            'Watch deadlines — most close months before the school year starts.',
          ],
        },
      },
      {
        h2: { ar: 'أخطاء شائعة تُفقدك المنحة', fr: 'Erreurs fréquentes', en: 'Common mistakes' },
        bullets: {
          ar: [
            'التقديم بخطاب دافع عام غير مخصّص للمنحة.',
            'تجاهل شروط اللغة (IELTS/TOEFL) حتى آخر لحظة.',
            'عدم تجهيز السيرة الذاتية بشكل منظّم.',
          ],
          fr: [
            'Une lettre de motivation générique, non adaptée à la bourse.',
            'Négliger les exigences linguistiques (IELTS/TOEFL).',
            'Un CV mal structuré.',
          ],
          en: [
            'A generic motivation letter not tailored to the scholarship.',
            'Ignoring language requirements (IELTS/TOEFL) until the last minute.',
            'A poorly structured CV.',
          ],
        },
      },
      {
        h2: { ar: 'كيف نساعدك في يلا نسافر', fr: 'Comment Yalla Nsafer vous aide', en: 'How Yalla Nsafer helps' },
        paras: {
          ar: ['نرشدك خطوة بخطوة — بلهجتك — لاختيار المنحة المناسبة، تجهيز سيرتك الذاتية، وفهم إجراءات التقديم. اطرح سؤالك دون خجل، وابدأ من حيث أنت.'],
          fr: ['On vous guide étape par étape — dans votre langue — pour choisir la bourse, préparer votre CV et comprendre les démarches. Posez vos questions sans gêne.'],
          en: ['We guide you step by step — in your language — to choose the scholarship, build your CV, and understand the process. Ask your questions without hesitation.'],
        },
      },
    ],
    note: {
      ar: 'ملاحظة صدق مهمة: لا نضمن قبولك في أي منحة — لا أحد يستطيع ذلك بصدق. ما نقدّمه هو إرشاد صحيح يزيد فرصك ويحميك من الوسطاء المزيّفين.',
      fr: "En toute honnêteté : nous ne garantissons aucune admission — personne ne le peut sérieusement. Nous offrons un accompagnement fiable qui augmente vos chances et vous protège des intermédiaires frauduleux.",
      en: "Honest note: we don't guarantee any admission — no one honestly can. What we offer is reliable guidance that improves your chances and protects you from fake middlemen.",
    },
  },
  {
    slug: 'work-abroad-without-degree',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'كيف تسافر للعمل في الخارج حتى لو ما معك شهادة أو مبلغ كبير',
        description: 'خيارات حقيقية للسفر والعمل في الخارج لأصحاب الخبرات والمهن — الخليج، أوروبا، وأكثر — مع الحماية من النصب.',
      },
      fr: {
        title: "Travailler à l'étranger même sans diplôme ni gros budget",
        description: "Des options réelles pour partir travailler à l'étranger selon votre métier — Golfe, Europe, Canada — avec protection contre les arnaques.",
      },
      en: {
        title: 'Work Abroad Even Without a Degree or Big Budget',
        description: 'Real options to work abroad based on your trade — Gulf, Europe, Canada — with protection against scams.',
      },
    },
    h1: {
      ar: 'السفر للعمل في الخارج: خيارات حقيقية مهما كانت إمكانياتك',
      fr: "Travailler à l'étranger : des options réelles, quels que soient vos moyens",
      en: 'Working Abroad: Real Options, Whatever Your Means',
    },
    intro: {
      ar: 'كثيرون يظنّون أن السفر للعمل يحتاج شهادة جامعية ومبلغًا كبيرًا. الحقيقة أن هناك فرصًا حقيقية لأصحاب المهن والحرف — من دول الخليج والعراق إلى أوروبا وكندا.',
      fr: "Beaucoup pensent qu'il faut un diplôme et beaucoup d'argent. En réalité, il existe de vraies opportunités pour les gens de métier — du Golfe à l'Europe et au Canada.",
      en: 'Many think you need a degree and lots of money. In reality, real opportunities exist for skilled trades — from the Gulf to Europe and Canada.',
    },
    sections: [
      {
        h2: { ar: 'إذا كان معك مهنة أو حرفة', fr: 'Si vous avez un métier', en: 'If you have a trade' },
        paras: {
          ar: ['الطهاة، الحلاقون، الميكانيكيون، عمّال البناء — الطلب على المهارات حقيقي في كثير من الدول. نساعدك في مطابقة خبرتك مع فرص فعلية.'],
          fr: ['Cuisiniers, coiffeurs, mécaniciens, ouvriers du bâtiment — la demande de compétences est réelle. On associe votre expérience à de vraies offres.'],
          en: ['Cooks, barbers, mechanics, construction workers — demand for skills is real. We match your experience to actual openings.'],
        },
      },
      {
        h2: { ar: 'إذا لم يكن معك جواز أو مبلغ الآن', fr: "Si vous n'avez ni passeport ni budget maintenant", en: 'If you have no passport or money right now' },
        paras: {
          ar: ['لا نتركك بلا حلّ — نبحث عن فرص داخل بلدك أولًا، ونرشدك للخطوة التالية.'],
          fr: ['On ne vous laisse jamais sans solution — on cherche d\'abord des opportunités dans votre pays, puis on vous guide vers l\'étape suivante.'],
          en: ['We never leave you without a solution — we look for opportunities in your own country first, then guide your next step.'],
        },
      },
      {
        h2: { ar: 'الأهم: احمِ نفسك', fr: 'Le plus important : protégez-vous', en: 'Most important: protect yourself' },
        paras: {
          ar: ['احذر من أي جهة تطلب مبالغ كبيرة مقدّمًا أو تَعِد بضمانات. نحن نساعدك على التحقّق من العروض قبل أن تدفع أو تسافر.'],
          fr: ['Méfiez-vous de quiconque exige de grosses sommes à l\'avance ou promet des garanties. On vous aide à vérifier les offres avant de payer ou de partir.'],
          en: ['Beware anyone demanding large upfront sums or promising guarantees. We help you verify offers before you pay or travel.'],
        },
      },
    ],
    note: {
      ar: 'لا نَعِد بنتيجة مضمونة — نرشدك بخطوات حقيقية تناسب وضعك الحالي.',
      fr: 'Nous ne promettons aucun résultat garanti — nous vous guidons avec des étapes réelles adaptées à votre situation.',
      en: 'We promise no guaranteed outcome — we guide you with real steps that fit where you are right now.',
    },
  },
  {
    slug: 'spot-fake-job-offer',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'كيف تكتشف عرض سفر أو وظيفة مزيّف قبل أن تدفع',
        description: 'علامات النصب في عروض السفر والعمل بالخارج، وكيف تتحقّق قبل أن تدفع أو تسلّم أوراقك.',
      },
      fr: {
        title: "Comment repérer une fausse offre de voyage ou d'emploi",
        description: "Les signes d'arnaque dans les offres de travail à l'étranger et comment vérifier avant de payer.",
      },
      en: {
        title: 'How to Spot a Fake Travel or Job Offer Before You Pay',
        description: 'Warning signs of travel/work-abroad scams and how to verify an offer before paying or handing over documents.',
      },
    },
    h1: {
      ar: 'كيف تحمي نفسك من عروض السفر والعمل المزيّفة',
      fr: "Comment vous protéger des fausses offres de voyage et d'emploi",
      en: 'How to Protect Yourself From Fake Travel and Job Offers',
    },
    intro: {
      ar: 'النصب في مجال السفر والهجرة واسع الانتشار. هذه العلامات تساعدك على كشف العرض المزيّف قبل أن تخسر مالك أو أوراقك.',
      fr: "L'arnaque dans le voyage et l'immigration est répandue. Ces signes vous aident à repérer une fausse offre avant de perdre votre argent ou vos papiers.",
      en: 'Scams in travel and immigration are widespread. These signs help you spot a fake offer before you lose money or documents.',
    },
    sections: [
      {
        h2: { ar: 'علامات الخطر', fr: "Signaux d'alerte", en: 'Red flags' },
        bullets: {
          ar: [
            'طلب مبلغ كبير مقدّمًا قبل أي إجراء واضح.',
            'وعود بضمان الفيزا أو الوظيفة 100%.',
            'الضغط عليك للدفع بسرعة "قبل أن تفوت الفرصة".',
            'عدم وجود عقد أو معلومات واضحة عن جهة العمل.',
          ],
          fr: [
            "Une grosse somme demandée à l'avance sans démarche claire.",
            'Des promesses de visa ou d\'emploi « garantis à 100 % ».',
            'La pression de payer vite « avant que l\'occasion ne passe ».',
            'Aucun contrat ni information claire sur l\'employeur.',
          ],
          en: [
            'A large sum demanded upfront with no clear process.',
            'Promises of "100% guaranteed" visa or job.',
            'Pressure to pay fast "before the chance is gone."',
            'No contract or clear information about the employer.',
          ],
        },
      },
      {
        h2: { ar: 'كيف تتحقّق', fr: 'Comment vérifier', en: 'How to verify' },
        bullets: {
          ar: [
            'ابحث عن اسم الشركة والجهة رسميًا.',
            'لا تسلّم جواز سفرك أو أوراقك الأصلية لأي وسيط.',
            'استشر جهة موثوقة قبل الدفع.',
          ],
          fr: [
            "Recherchez officiellement le nom de l'entreprise.",
            'Ne remettez jamais votre passeport ni vos documents originaux à un intermédiaire.',
            'Consultez une source fiable avant de payer.',
          ],
          en: [
            "Officially look up the company's name.",
            'Never hand your passport or original documents to a middleman.',
            'Consult a trusted source before paying.',
          ],
        },
      },
    ],
    note: {
      ar: 'في يلا نسافر، الحماية أساس عملنا — نساعدك على التحقّق من العروض قبل أن تتّخذ أي خطوة.',
      fr: 'Chez Yalla Nsafer, la protection est au cœur de notre travail — on vous aide à vérifier les offres avant toute démarche.',
      en: 'At Yalla Nsafer, protection is at the core of what we do — we help you verify offers before you take any step.',
    },
  },
];

const COPY = {
  ar: {
    kicker: 'يلا نسافر — دليل عملي',
    seeAlso: 'اقرأ أيضًا على هذه المنصة',
    cta: 'ابدأ الآن واسأل المساعد عن وضعك بالتحديد ←',
    home: 'الصفحة الرئيسية',
  },
  fr: {
    kicker: 'Yalla Nsafer — guide pratique',
    seeAlso: 'À lire aussi sur cette plateforme',
    cta: 'Commencez et demandez au concierge ce qui s\'applique à votre cas →',
    home: "Page d'accueil",
  },
  en: {
    kicker: 'Yalla Nsafer — practical guide',
    seeAlso: 'Also on this platform',
    cta: 'Start now and ask the concierge how this applies to your situation →',
    home: 'Home page',
  },
};

const articleUrl = (slug, lang) => `/blog/${slug}${lang === 'en' ? '' : `?lang=${lang}`}`;

function renderPage({ article, lang, head, baseUrl }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const dir = l === 'ar' ? ' dir="rtl"' : '';
  const pick = o => o[l] || o.en;

  const body = article.sections.map(s => {
    const paras = s.paras ? s.paras[l].map(p => `<p>${esc(p)}</p>`).join('\n') : '';
    const bullets = s.bullets ? `<ul>\n${s.bullets[l].map(b => `<li>${esc(b)}</li>`).join('\n')}\n</ul>` : '';
    return `<h2>${esc(s.h2[l])}</h2>\n${paras}${bullets}`;
  }).join('\n');

  const others = ARTICLES.filter(x => x.slug !== article.slug).map(x =>
    `<li><a href="${articleUrl(x.slug, l)}">${esc(x.h1[l])}</a></li>`).join('\n');

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.h1[l],
    description: article.meta[l].description,
    inLanguage: l,
    datePublished: article.publishedAt,
    isPartOf: { '@type': 'WebSite', name: 'Yalla Nsafer', url: baseUrl + '/' },
  });

  return `<!doctype html>
<html lang="${l}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<script type="application/ld+json">${ld}</script>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#1a1a1a;background:#fff}
.kicker{color:#666;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}
h1{font-size:1.4rem;margin-top:0}
h2{font-size:1.05rem;margin-top:28px}
ul{padding-${l === 'ar' ? 'right' : 'left'}:20px}
li{margin:8px 0}
.note{border-${l === 'ar' ? 'right' : 'left'}:3px solid #0d5fa6;background:#f4f8fb;padding:10px 14px;margin-top:28px;font-size:.9rem;color:#333}
.cta{display:inline-block;margin-top:16px;font-weight:600}
.seealso ul{list-style:none;padding:0}
.seealso li{margin:6px 0}
nav{font-size:.85rem;margin-bottom:18px}
</style>
</head>
<body>
<nav><a href="/${l === 'en' ? '' : `?lang=${l}`}">← ${esc(c.home)}</a></nav>
<p class="kicker">${esc(c.kicker)}</p>
<h1>${esc(article.h1[l])}</h1>
<p>${esc(article.intro[l])}</p>
${body}
<p class="note">${esc(article.note[l])}</p>
<div class="seealso">
<h2>${esc(c.seeAlso)}</h2>
<ul>
${others}
</ul>
</div>
<p><a class="cta" href="/${l === 'en' ? '' : `?lang=${l}`}">${esc(c.cta)}</a></p>
</body>
</html>
`;
}

module.exports = { ARTICLES, LANGS, articleUrl, renderPage };
