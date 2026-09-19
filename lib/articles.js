'use strict';

// The SEO content packs (yalla-falaina-seo-pack.md + yalla-falaina-seo-all-
// verticals.md): evergreen articles, each in Arabic, French, and English,
// rendered as plain static pages the way lib/gccGuides.js does -- a crawler
// or a slow phone sees full content with zero JS and zero DB dependency.
//
// The packs' own honesty guardrails are preserved verbatim in the copy:
// nothing below promises a visa, a job, an admission, or a cure, and the
// medical article is logistics-only -- it mirrors the system prompt's
// "you are not a doctor" scope exactly. Every article ends by pointing at
// the concierge instead of promising an outcome.
//
// One URL per article + ?lang= variant -- the same convention as the GCC
// guide routes (see server.js): the canonical/hreflang wiring in lib/seo.js
// already understands that shape, so no separate /blog/<lang>/ namespace is
// needed. ARTICLES is ordered by the pack's publishing order.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LANGS = ['ar', 'fr', 'en'];

const ARTICLES = [
  {
    slug: 'verify-immigration-consultant',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'كيف تتأكد أن مكتب أو مستشار الهجرة موثوق قبل ما تدفع',
        description: 'خطوات عملية للتحقّق من مستشار أو مكتب هجرة قبل الدفع، وعلامات النصب الشائعة — دليل يحميك.',
      },
      fr: {
        title: "Comment vérifier un consultant en immigration avant de payer",
        description: "Étapes concrètes pour vérifier un consultant/bureau d'immigration et repérer les arnaques avant de payer.",
      },
      en: {
        title: 'How to Verify an Immigration Consultant Before You Pay',
        description: 'Concrete steps to vet an immigration consultant/office and spot scams before paying.',
      },
    },
    h1: {
      ar: 'كيف تتحقّق من مستشار الهجرة قبل أن تدفع أي مبلغ',
      fr: 'Comment vérifier un consultant en immigration avant de payer',
      en: 'How to Verify an Immigration Consultant Before You Pay',
    },
    intro: {
      ar: 'النصب في مجال الهجرة منتشر، ويستهدف غالبًا الناس الأكثر حاجة. قبل أن تدفع أو تسلّم أوراقك لأي مكتب، تحقّق من هذه النقاط.',
      fr: "L'arnaque à l'immigration est répandue et vise souvent les plus vulnérables. Avant de payer ou de remettre vos papiers, vérifiez ces points.",
      en: 'Immigration scams are widespread and often target the most vulnerable. Before you pay or hand over documents, check these points.',
    },
    sections: [
      {
        h2: { ar: 'علامات المكتب الموثوق', fr: "Signes d'un bureau fiable", en: 'Signs of a trustworthy office' },
        bullets: {
          ar: [
            'لديه ترخيص رسمي يمكن التحقّق منه (رقم ترخيص، تسجيل قانوني).',
            'يشرح لك العملية بوضوح دون وعود بضمانات.',
            'لا يطلب منك تسليم جواز سفرك الأصلي.',
          ],
          fr: [
            'Une licence officielle vérifiable (numéro, enregistrement légal).',
            'Il explique clairement le processus, sans promesse de garantie.',
            'Il ne vous demande jamais votre passeport original.',
          ],
          en: [
            'A verifiable official licence (number, legal registration).',
            'Explains the process clearly, without promising guarantees.',
            'Never asks for your original passport.',
          ],
        },
      },
      {
        h2: { ar: 'علامات الخطر', fr: "Signaux d'alerte", en: 'Red flags' },
        bullets: {
          ar: [
            'وعد بـ"فيزا مضمونة 100%".',
            'طلب مبلغ كبير مقدّمًا قبل أي إجراء واضح.',
            'الضغط عليك للدفع بسرعة.',
            'لا يوجد عقد مكتوب.',
          ],
          fr: [
            '« Visa garanti à 100 % ».',
            "Grosse somme exigée à l'avance.",
            'Pression de payer vite.',
            'Aucun contrat écrit.',
          ],
          en: [
            '"100% guaranteed visa."',
            'Large upfront fee before any clear step.',
            'Pressure to pay fast.',
            'No written contract.',
          ],
        },
      },
      {
        h2: { ar: 'كيف يساعدك يلا نسافر', fr: 'Comment Yalla Nsafer aide', en: 'How Yalla Nsafer helps' },
        paras: {
          ar: ['نحيلك فقط إلى مستشارين ومكاتب هجرة موثّقة الترخيص — لا نعرض أبدًا جهة غير مُتحقَّق منها. نرشدك، نساعدك على التحقّق، ونبقى معك في كل خطوة. لا نضمن نتيجة — لكن نحميك من الوسطاء المزيّفين.'],
          fr: ['Nous ne référons que des consultants et bureaux à la licence vérifiée — jamais une entité non vérifiée. On vous guide, on vous aide à vérifier, on reste avec vous. Aucune garantie de résultat — mais une protection contre les faux intermédiaires.'],
          en: ['We only refer licence-verified consultants and offices — never an unverified one. We guide you, help you verify, and stay with you. No guaranteed outcome — but real protection from fake middlemen.'],
        },
      },
    ],
    note: {
      ar: 'لا نضمن نتيجة — لكن نحميك من الوسطاء المزيّفين.',
      fr: 'Aucune garantie de résultat — mais une protection contre les faux intermédiaires.',
      en: 'No guaranteed outcome — but real protection from fake middlemen.',
    },
  },
  {
    slug: 'scholarships-arab-students',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'منح دراسية للطلاب العرب 2026 — كيف تجد المنحة المناسبة وتقدّم بنجاح',
        description: 'دليل عملي للعثور على منح دراسية للدراسة في الخارج أو داخل بلدك، وكيفية التقديم — مع إرشاد بلغتك.',
      },
      fr: {
        title: "Bourses d'études pour étudiants arabes 2026 — trouver et postuler",
        description: "Guide pratique pour trouver des bourses à l'étranger ou dans votre pays, et postuler — guidé dans votre langue.",
      },
      en: {
        title: 'Scholarships for Arab Students 2026 — Find & Apply',
        description: 'Practical guide to finding scholarships abroad or at home, and applying — guided in your language.',
      },
    },
    h1: {
      ar: 'منح دراسية للطلاب العرب: دليلك الكامل 2026',
      fr: "Bourses d'études pour étudiants arabes : guide complet 2026",
      en: 'Scholarships for Arab Students: Complete 2026 Guide',
    },
    intro: {
      ar: 'المنح متاحة لأكثر مما تتوقّع. الصعوبة في معرفة أين تبحث، وأيّها يناسبك، وكيف تقدّم طلبًا مقنعًا — سواء للدراسة في الخارج أو في بلدك نفسه.',
      fr: "Il existe plus de bourses que vous ne pensez. Le défi : savoir où chercher, laquelle vous convient, et comment postuler — à l'étranger comme dans votre propre pays.",
      en: "More scholarships exist than you'd think. The challenge: where to look, which fits, and how to apply — abroad or in your own country.",
    },
    sections: [
      {
        h2: { ar: 'كيف تجد المنحة المناسبة', fr: 'Trouver la bonne bourse', en: 'Find the right one' },
        bullets: {
          ar: [
            'حدّد المستوى (بكالوريوس/ماجستير/دكتوراه) والدولة.',
            'ابحث في المنح الحكومية والجامعية معًا.',
            'انتبه للمواعيد النهائية — أغلبها يُغلق قبل بداية العام بأشهر.',
          ],
          fr: [
            'Définissez le niveau et le pays.',
            'Cherchez bourses gouvernementales et universitaires.',
            'Surveillez les dates limites.',
          ],
          en: [
            'Decide level and country.',
            'Look at government and university scholarships.',
            'Watch deadlines.',
          ],
        },
      },
      {
        h2: { ar: 'أخطاء شائعة', fr: 'Erreurs fréquentes', en: 'Common mistakes' },
        bullets: {
          ar: [
            'خطاب دافع عام غير مخصّص.',
            'تجاهل شرط اللغة (IELTS/TOEFL).',
            'سيرة ذاتية غير منظّمة.',
          ],
          fr: [
            'Lettre de motivation générique.',
            "Négliger l'exigence linguistique.",
            'CV mal structuré.',
          ],
          en: [
            'Generic motivation letter.',
            'Ignoring language requirements.',
            'Poorly structured CV.',
          ],
        },
      },
      {
        h2: { ar: 'كيف يساعدك يلا نسافر', fr: 'Comment Yalla Nsafer aide', en: 'How Yalla Nsafer helps' },
        paras: {
          ar: ['نرشدك بلغتك لاختيار المنحة، تجهيز سيرتك، وفهم الإجراءات — حتى لو كانت الجامعة في بلدك. ابدأ من حيث أنت.'],
          fr: ['On vous guide dans votre langue — même pour une université dans votre pays.'],
          en: ['We guide you in your language — even for a university in your own country.'],
        },
      },
    ],
    note: {
      ar: 'لا نضمن قبولًا — نقدّم إرشادًا يزيد فرصك ويحميك من الوسطاء المزيّفين.',
      fr: 'Aucune admission garantie — un accompagnement qui augmente vos chances et vous protège des faux intermédiaires.',
      en: 'No guaranteed admission — guidance that improves your chances and protects you from fake middlemen.',
    },
  },
  {
    slug: 'work-abroad-without-degree',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'السفر للعمل في الخارج حتى بدون شهادة جامعية أو مبلغ كبير',
        description: 'فرص حقيقية للعمل في الخارج لأصحاب المهن — الخليج، أوروبا، كندا — مع الحماية من النصب.',
      },
      fr: {
        title: "Travailler à l'étranger même sans diplôme ni gros budget",
        description: 'Options réelles selon votre métier — Golfe, Europe, Canada — avec protection contre les arnaques.',
      },
      en: {
        title: 'Work Abroad Even Without a Degree or Big Budget',
        description: 'Real options based on your trade — Gulf, Europe, Canada — with scam protection.',
      },
    },
    h1: {
      ar: 'السفر للعمل في الخارج: خيارات حقيقية مهما كانت إمكانياتك',
      fr: "Travailler à l'étranger : des options réelles, quels que soient vos moyens",
      en: 'Working Abroad: Real Options, Whatever Your Means',
    },
    intro: {
      ar: 'لا يحتاج السفر للعمل دائمًا شهادة جامعية أو مبلغًا كبيرًا. الطلب على المهارات حقيقي.',
      fr: "Pas besoin d'un diplôme ni de beaucoup d'argent. La demande de compétences est réelle.",
      en: "You don't always need a degree or lots of money. Demand for skills is real.",
    },
    sections: [
      {
        h2: { ar: 'إذا كان معك مهنة', fr: 'Si vous avez un métier', en: 'If you have a trade' },
        paras: {
          ar: ['طبّاخ، حلاق، ميكانيكي، عامل بناء — نطابق خبرتك مع فرص فعلية (الخليج، أوروبا، كندا).'],
          fr: ['Cuisinier, coiffeur, mécanicien, ouvrier — on associe votre expérience à de vraies offres.'],
          en: ['Cook, barber, mechanic, builder — we match your experience to real openings.'],
        },
      },
      {
        h2: { ar: 'إذا لم يكن معك جواز أو مبلغ الآن', fr: 'Sans passeport ni budget maintenant', en: 'No passport or money yet' },
        paras: {
          ar: ['لا نتركك بلا حل — نبحث عن فرص داخل بلدك أولًا ونرشدك للخطوة التالية.'],
          fr: ["On cherche d'abord dans votre pays, puis on vous guide."],
          en: ['We look in your own country first, then guide your next step.'],
        },
      },
      {
        h2: { ar: 'احمِ نفسك', fr: 'Protégez-vous', en: 'Protect yourself' },
        paras: {
          ar: ['احذر من طلب مبالغ كبيرة مقدّمًا أو وعود بضمانات. نساعدك على التحقّق من أي عرض قبل أن تدفع أو تسافر — وأي عرض غير موثّق نضع عليه تنبيهًا واضحًا.'],
          fr: ["Méfiance devant toute somme d'avance ou garantie. On vous aide à vérifier — et toute offre non vérifiée est signalée comme telle."],
          en: ['Beware upfront sums or guarantees. We help you verify any offer — and any unverified lead is clearly flagged.'],
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
  {
    slug: 'medical-treatment-abroad',
    publishedAt: '2026-09-19',
    meta: {
      ar: {
        title: 'العلاج في الخارج: كيف تجد المكان المناسب وتتجنّب النصب',
        description: 'إرشاد لوجستي للعثور على مستشفى أو مركز للعلاج الذي حدّده طبيبك في الخارج، مع الحماية من عروض النصب — لسنا جهة طبية ولا نقدّم تشخيصًا.',
      },
      fr: {
        title: "Se faire soigner à l'étranger : trouver le bon endroit en sécurité",
        description: 'Accompagnement logistique pour trouver un hôpital/centre pour le traitement indiqué par votre médecin, avec protection anti-arnaque — nous ne sommes pas un service médical, aucun diagnostic.',
      },
      en: {
        title: 'Medical Treatment Abroad: Find It Safely',
        description: 'Logistical help to find a hospital/centre for the treatment your doctor named abroad, with scam protection — we are not a medical service and give no diagnosis.',
      },
    },
    h1: {
      ar: 'العلاج في الخارج: كيف تجد المكان المناسب بأمان',
      fr: "Se faire soigner à l'étranger : trouver le bon endroit, en sécurité",
      en: 'Medical Treatment Abroad: How to Find It Safely',
    },
    intro: {
      ar: 'إذا كان طبيبك قد حدّد لك علاجًا أو إجراءً معيّنًا، فالخطوة التالية هي إيجاد مكان موثوق يقدّمه — وتجنّب عروض النصب المنتشرة في هذا المجال.',
      fr: "Si votre médecin a déjà nommé un traitement ou une intervention, l'étape suivante est de trouver un endroit fiable qui le propose — en évitant les arnaques.",
      en: 'If your doctor has already named a treatment or procedure, the next step is finding a trustworthy place that offers it — while avoiding the scams common in this field.',
    },
    sections: [
      {
        h2: { ar: 'ملاحظة مهمة', fr: 'Note importante', en: 'Important note' },
        paras: {
          ar: ['نحن لسنا جهة طبية ولا نقدّم تشخيصًا ولا نصيحة علاجية. دورنا لوجستي فقط: مساعدتك في إيجاد أين يتوفّر العلاج الذي حدّده طبيبك، وتكلفة تقريبية منشورة إن وُجدت، ومركز حقيقي للتواصل.'],
          fr: ["Nous ne sommes pas un service médical : aucun diagnostic, aucun avis de traitement. Notre rôle est purement logistique : trouver où le traitement nommé par votre médecin est disponible, un coût approximatif publié s'il existe, et un vrai centre à contacter."],
          en: ['We are not a medical service — no diagnosis, no treatment advice. Our role is purely logistical: helping you find where the treatment your doctor named is available, a published approximate cost if one exists, and a real centre to contact.'],
        },
      },
      {
        h2: { ar: 'كيف تحمي نفسك', fr: 'Protégez-vous', en: 'Protect yourself' },
        bullets: {
          ar: [
            'لا تدفع مبالغ كبيرة مقدّمًا قبل التأكّد من المركز.',
            'تحقّق من المستشفى/العيادة بشكل مستقل.',
            'احذر من وعود بـ"شفاء مضمون".',
          ],
          fr: [
            "Ne payez pas de grosses sommes avant d'avoir vérifié le centre.",
            "Vérifiez l'hôpital/la clinique de façon indépendante.",
            'Méfiez-vous d\'une « guérison garantie ».',
          ],
          en: [
            "Don't pay large sums before verifying the centre.",
            'Independently verify the hospital/clinic.',
            'Beware of any "guaranteed cure."',
          ],
        },
      },
      {
        h2: { ar: 'كيف يساعدك يلا نسافر', fr: 'Comment Yalla Nsafer aide', en: 'How Yalla Nsafer helps' },
        paras: {
          ar: ['نرشدك للوجستيات بلغتك، ونعرض فقط مراكز مدرجة لدينا — وإن لم يوجد مركز مطابق، نقول ذلك بصراحة بدل اختلاق معلومة.'],
          fr: ["On vous guide pour la logistique, dans votre langue, et on ne présente que des centres répertoriés — et s'il n'y en a pas, on le dit franchement."],
          en: ["We guide you on logistics, in your language, and only show listed centres — and if there's no match, we say so plainly rather than invent one."],
        },
      },
    ],
    note: {
      ar: 'لسنا جهة طبية — دورنا لوجستي فقط.',
      fr: 'Nous ne sommes pas un service médical — notre rôle est purement logistique.',
      en: 'We are not a medical service — our role is purely logistical.',
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
