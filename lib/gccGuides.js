'use strict';

// Real, indexable reference pages for the four Gulf countries this platform's
// own job feed already tracks as a distinct track (lib/jobsIngest.js's
// TRACK_BY_COUNTRY: 'gcc' = United Arab Emirates, Saudi Arabia, Qatar,
// Kuwait) -- not a guess at "popular corridors," the same four countries
// every Gulf job listing ingested here is already tagged against (see also
// the Jooble Gulf rail added for exactly these markets).
//
// Same sourcing-integrity discipline as lib/expressEntryPage.js (Section
// 6.1): every fact below is a stable, structural fact about how that
// country's own employer-sponsorship system works, checked against that
// government's own portal (u.ae, Qiwa/hrsd.gov.sa, Hukoomi, e.gov.kw /
// manpower.gov.kw) or, for Qatar's well-documented 2020 kafala reforms,
// against the ILO's own reporting -- with a direct link on every page so a
// reader can check the current, authoritative version themselves. This
// deliberately stops at "how the system works" rather than a fee table or a
// numbered step-by-step: fees, quotas and portal steps change on each
// government's own schedule, and a number copied here would have no way to
// signal it had gone stale. A no-JS static page -- a crawler (and a seeker on
// a slow connection) sees the full content immediately.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COUNTRIES = [
  {
    slug: 'work-in-uae',
    name: { en: 'the United Arab Emirates', fr: 'les Émirats arabes unis', ar: 'الإمارات العربية المتحدة', tr: 'Birleşik Arap Emirlikleri' },
    shortName: { en: 'the UAE', fr: 'les É.A.U.', ar: 'الإمارات', tr: 'BAE' },
    // The correctly-inflected prepositional phrase for the H1 ("Working ___" /
    // "Travailler ___" / "العمل ___") -- French preposition+article agreement
    // (au/aux/en) isn't derivable from `name` by a generic rule, so each
    // country spells its own phrase out rather than the page guessing.
    title: { en: 'in the United Arab Emirates', fr: 'aux Émirats arabes unis', ar: 'في الإمارات العربية المتحدة', tr: 'Birleşik Arap Emirlikleri’nde' },
    official: { url: 'https://u.ae/en/information-and-services/jobs/Sector-of-employment/employment-in-the-private-sector/work-permits', label: { en: 'U.AE — the official Government portal', fr: 'U.AE — le portail officiel du gouvernement', ar: 'U.AE — البوابة الرسمية للحكومة', tr: 'U.AE — resmî devlet portalı' } },
    facts: {
      en: [
        'A standard work permit is employer-sponsored: the employer applies for it, not the worker, and it is normally valid for two years, renewable under whatever terms the visa-issuing authority sets at the time.',
        'A separate "Green Visa" exists for certain skilled professionals on self-sponsorship rather than through an employer — a different route from the standard employer-sponsored permit.',
        'Domestic workers are sponsored under their own, separate visa category, distinct from the standard private-sector work permit.',
        'The residence visa that lets you actually live in the UAE while working is a separate, linked step from the work permit itself — both go through the same employer-led process.',
      ],
      fr: [
        "Un permis de travail standard est parrainé par l'employeur : c'est l'employeur, pas le travailleur, qui en fait la demande. Il est normalement valide deux ans, renouvelable selon les conditions fixées à ce moment par l'autorité qui délivre le visa.",
        "Un « Green Visa » distinct existe pour certains professionnels qualifiés en auto-parrainage plutôt que par un employeur — une filière différente du permis standard parrainé par l'employeur.",
        "Les travailleurs domestiques sont parrainés sous une catégorie de visa qui leur est propre, distincte du permis de travail standard du secteur privé.",
        "Le visa de résidence qui permet de vivre aux É.A.U. tout en travaillant est une étape distincte, liée au permis de travail — les deux passent par le même processus mené par l'employeur.",
      ],
      ar: [
        'تصريح العمل القياسي يكون بكفالة صاحب العمل: صاحب العمل، وليس العامل، هو من يقدّم الطلب، وعادة ما يكون صالحًا لمدة سنتين قابلتين للتجديد وفق الشروط التي تحددها الجهة المصدرة للتأشيرة حينها.',
        'توجد "التأشيرة الذهبية الخضراء" لبعض المهنيين المهرة بنظام الكفالة الذاتية بدلًا من كفالة صاحب عمل — وهي مسار مختلف عن تصريح العمل القياسي المكفول من صاحب العمل.',
        'يُكفل العمال المنزليون ضمن فئة تأشيرة خاصة بهم، منفصلة عن تصريح العمل القياسي في القطاع الخاص.',
        'تأشيرة الإقامة التي تتيح العيش فعليًا في الإمارات أثناء العمل خطوة منفصلة ومرتبطة بتصريح العمل — وكلاهما يمر عبر نفس الإجراء الذي يقوده صاحب العمل.',
      ],
      tr: [
        'Standart çalışma izni işveren sponsorluğuna dayanır: başvuruyu çalışan değil işveren yapar ve izin normalde iki yıl geçerlidir, vize veren makamın o dönemde belirlediği koşullarla yenilenebilir.',
        'Belirli nitelikli meslek sahipleri için, işveren üzerinden değil kendi sponsorluğunda alınan ayrı bir “Green Visa” bulunur — standart işveren sponsorluklu izinden farklı bir yoldur.',
        'Ev işçileri, özel sektörün standart çalışma izninden ayrı, kendilerine özgü bir vize kategorisinde sponsor edilir.',
        'Çalışırken BAE’de fiilen yaşamanızı sağlayan oturma vizesi, çalışma izninin kendisinden ayrı ama ona bağlı bir adımdır — her ikisi de aynı işveren yürütümlü süreçten geçer.',
      ],
    },
  },
  {
    slug: 'work-in-saudi-arabia',
    name: { en: 'Saudi Arabia', fr: "l'Arabie saoudite", ar: 'المملكة العربية السعودية', tr: 'Suudi Arabistan' },
    shortName: { en: 'Saudi Arabia', fr: "l'Arabie saoudite", ar: 'السعودية', tr: 'Suudi Arabistan' },
    title: { en: 'in Saudi Arabia', fr: 'en Arabie saoudite', ar: 'في السعودية', tr: 'Suudi Arabistan’da' },
    official: { url: 'https://qiwa.sa/en/business-owners/hire-employees/how-issue-or-renew-work-permits', label: { en: 'Qiwa — the Ministry of Human Resources and Social Development platform', fr: 'Qiwa — la plateforme du ministère des Ressources humaines et du Développement social', ar: 'قوى — منصة وزارة الموارد البشرية والتنمية الاجتماعية', tr: 'Qiwa — İnsan Kaynakları ve Sosyal Kalkınma Bakanlığı platformu' } },
    facts: {
      en: [
        'Work visas are issued through Qiwa, the Ministry of Human Resources and Social Development\'s own platform — again, it is the employer who applies, not the worker.',
        'Whether an employer can sponsor new foreign workers, and on what terms, is tied to that employer\'s Saudization (nationalization) compliance record — the same requirement applies to every employer, not something a candidate can influence directly.',
        'Qiwa distinguishes permanent, temporary, and Hajj/Umrah-season temporary work visas as separate categories with their own rules.',
        'A residence permit (iqama) is the linked document that lets you actually stay and work in the country once the visa itself has been issued.',
      ],
      fr: [
        "Les visas de travail sont délivrés via Qiwa, la propre plateforme du ministère des Ressources humaines et du Développement social — là encore, c'est l'employeur, et non le travailleur, qui fait la demande.",
        "La capacité d'un employeur à parrainer de nouveaux travailleurs étrangers, et les conditions de ce parrainage, dépendent de son taux de conformité à la saoudisation (nationalisation) — une exigence qui s'applique à chaque employeur, sans que le candidat puisse l'influencer directement.",
        "Qiwa distingue les visas de travail permanents, temporaires et temporaires pour la saison du Hajj/Omra comme des catégories séparées avec leurs propres règles.",
        "Le permis de séjour (iqama) est le document lié qui permet de réellement rester et travailler dans le pays une fois le visa émis.",
      ],
      ar: [
        'تُصدر تأشيرات العمل عبر منصة قوى التابعة لوزارة الموارد البشرية والتنمية الاجتماعية — وهنا أيضًا، صاحب العمل هو من يقدّم الطلب، وليس العامل.',
        'قدرة صاحب العمل على استقدام عمالة وافدة جديدة، وشروط ذلك، مرتبطة بسجل التزامه ببرنامج السعودة — وهو شرط ينطبق على كل صاحب عمل على حد سواء، ولا يستطيع المتقدّم التأثير فيه مباشرة.',
        'تميّز منصة قوى بين تأشيرات العمل الدائمة والمؤقتة والمؤقتة الخاصة بموسم الحج والعمرة كفئات منفصلة لكل منها ضوابطها.',
        'رخصة الإقامة هي الوثيقة المرتبطة التي تتيح فعليًا البقاء والعمل في المملكة بعد إصدار التأشيرة نفسها.',
      ],
      tr: [
        'Çalışma vizeleri, İnsan Kaynakları ve Sosyal Kalkınma Bakanlığı’nın kendi platformu olan Qiwa üzerinden verilir — burada da başvuruyu çalışan değil işveren yapar.',
        'Bir işverenin yeni yabancı işçiye sponsor olup olamayacağı ve hangi koşullarda olacağı, o işverenin Suudileştirme (yerelleştirme) uyum karnesine bağlıdır — bu her işveren için geçerli bir koşuldur ve adayın doğrudan etkileyebileceği bir şey değildir.',
        'Qiwa; kalıcı, geçici ve Hac/Umre sezonuna özel geçici çalışma vizelerini kendi kuralları olan ayrı kategoriler olarak ayırır.',
        'Oturma izni (ikame), vize verildikten sonra ülkede fiilen kalmanızı ve çalışmanızı sağlayan bağlı belgedir.',
      ],
    },
  },
  {
    slug: 'work-in-qatar',
    name: { en: 'Qatar', fr: 'le Qatar', ar: 'قطر', tr: 'Katar' },
    shortName: { en: 'Qatar', fr: 'le Qatar', ar: 'قطر', tr: 'Katar' },
    title: { en: 'in Qatar', fr: 'au Qatar', ar: 'في قطر', tr: 'Katar’da' },
    official: [
      { url: 'https://hukoomi.gov.qa/en/articles/visas', label: { en: 'Hukoomi — Qatar\'s official e-government portal', fr: "Hukoomi — le portail officiel du gouvernement électronique du Qatar", ar: 'حكومي — البوابة الحكومية الإلكترونية الرسمية لدولة قطر', tr: 'Hukoomi — Katar’ın resmî e-devlet portalı' } },
      // The ILO's own write-up of the 2020 reforms — the source for the NOC /
      // minimum-wage claims in the facts above, so the page links what it cites.
      { url: 'https://www.ilo.org/resource/article/dismantling-kafala-system-and-introducing-minimum-wage-mark-new-era-qatar', label: { en: 'ILO — Qatar\'s 2020 labour reforms', fr: "OIT — les réformes du travail du Qatar en 2020", ar: 'منظمة العمل الدولية — إصلاحات العمل في قطر لعام 2020', tr: 'ILO — Katar’ın 2020 çalışma reformları' } },
    ],
    facts: {
      en: [
        'Work visas in Qatar are still employer-sponsored, applied for by the employer through the Ministry\'s e-services or the Hayya platform.',
        'Since labour reforms confirmed by the International Labour Organization in 2020, most migrant workers no longer need their current employer\'s permission (a "No-Objection Certificate") to change jobs before their contract ends, and exit permits to leave the country were removed for the large majority of workers — a significant, well-documented change from the older kafala system.',
        'A non-discriminatory minimum wage, set independent of nationality or job type, applies across the private sector following the same 2020 reforms.',
        'These are structural, sector-wide rules; the exact paperwork and processing steps for a specific job offer are confirmed by the sponsoring employer and Qatar\'s own e-services portal.',
      ],
      fr: [
        "Les visas de travail au Qatar restent parrainés par l'employeur, qui en fait la demande via les services électroniques du ministère ou la plateforme Hayya.",
        "Depuis les réformes du travail confirmées par l'Organisation internationale du Travail en 2020, la plupart des travailleurs migrants n'ont plus besoin de l'autorisation de leur employeur actuel (un « certificat de non-objection ») pour changer d'emploi avant la fin de leur contrat, et les autorisations de sortie du pays ont été supprimées pour la grande majorité des travailleurs — un changement important et bien documenté par rapport à l'ancien système de kafala.",
        "Un salaire minimum non discriminatoire, fixé indépendamment de la nationalité ou du type d'emploi, s'applique dans tout le secteur privé depuis ces mêmes réformes de 2020.",
        "Ce sont des règles structurelles, valables pour l'ensemble du secteur; les démarches et étapes exactes pour une offre d'emploi précise sont confirmées par l'employeur parrain et le portail officiel des services électroniques du Qatar.",
      ],
      ar: [
        'لا تزال تأشيرات العمل في قطر تُمنح بكفالة صاحب العمل، الذي يتقدّم بالطلب عبر الخدمات الإلكترونية للوزارة أو منصة هيا.',
        'منذ إصلاحات العمل التي أكدتها منظمة العمل الدولية عام 2020، لم تعد الغالبية العظمى من العمال الوافدين بحاجة إلى إذن صاحب العمل الحالي ("شهادة عدم ممانعة") لتغيير الوظيفة قبل انتهاء العقد، كما أُلغي شرط تصريح الخروج من البلاد لمعظم العمال — وهو تغيير جوهري وموثّق جيدًا مقارنة بنظام الكفالة السابق.',
        'يُطبَّق حد أدنى غير تمييزي للأجور، يُحدَّد بمعزل عن الجنسية أو نوع الوظيفة، في جميع أنحاء القطاع الخاص عقب هذه الإصلاحات نفسها لعام 2020.',
        'هذه قواعد هيكلية تشمل القطاع ككل؛ أما الإجراءات والخطوات الدقيقة لعرض عمل معيّن فيؤكدها صاحب العمل الكافل وبوابة الخدمات الإلكترونية الرسمية لدولة قطر.',
      ],
      tr: [
        'Katar’da çalışma vizeleri hâlâ işveren sponsorluğuna dayanır; başvuru, işveren tarafından Bakanlığın e-hizmetleri veya Hayya platformu üzerinden yapılır.',
        'Uluslararası Çalışma Örgütü’nün 2020’de teyit ettiği çalışma reformlarından bu yana, göçmen işçilerin çoğu sözleşmeleri bitmeden iş değiştirmek için mevcut işverenlerinin iznine (“İtirazsızlık Belgesi”) ihtiyaç duymuyor ve işçilerin büyük çoğunluğu için ülkeden çıkış izni şartı kaldırıldı — eski kefalet sistemine göre önemli ve iyi belgelenmiş bir değişiklik.',
        'Aynı 2020 reformlarının ardından, uyruktan ve iş türünden bağımsız olarak belirlenen ayrımcı olmayan bir asgari ücret özel sektörün tamamında geçerlidir.',
        'Bunlar sektörün tamamını kapsayan yapısal kurallardır; belirli bir iş teklifine ait evrak ve işlem adımları sponsor işveren ve Katar’ın kendi e-hizmet portalı tarafından teyit edilir.',
      ],
    },
  },
  {
    slug: 'work-in-kuwait',
    name: { en: 'Kuwait', fr: 'le Koweït', ar: 'الكويت', tr: 'Kuveyt' },
    shortName: { en: 'Kuwait', fr: 'le Koweït', ar: 'الكويت', tr: 'Kuveyt' },
    title: { en: 'in Kuwait', fr: 'au Koweït', ar: 'في الكويت', tr: 'Kuveyt’te' },
    official: { url: 'https://e.gov.kw/sites/kgoenglish/Pages/Visitors/InfoSubPages/WorkingInKuwait.aspx', label: { en: 'Kuwait Government Online — the official e-government portal', fr: "Kuwait Government Online — le portail officiel du gouvernement électronique", ar: 'البوابة الإلكترونية الحكومية الكويتية الرسمية', tr: 'Kuwait Government Online — resmî e-devlet portalı' } },
    facts: {
      en: [
        'Employment in the private sector runs on a sponsor-based residence permit, commonly referred to by its governing regulation ("Article 18"), separate from the residence category used for government-sector staff ("Article 17").',
        'The sponsoring employer registers the worker with the Public Authority for Manpower (PAM) — the employer, not the worker, initiates the work-permit process.',
        'A medical fitness test and a civil ID are part of the standard residence process once a work permit has been granted, alongside the permit itself.',
        'Family members joining a sponsored worker are typically issued a separate, dependent residence category rather than a work permit.',
      ],
      fr: [
        "L'emploi dans le secteur privé repose sur un permis de séjour lié à un parrain (kafala), communément désigné par son article de loi (« Article 18 »), distinct de la catégorie de séjour utilisée pour le personnel du secteur public (« Article 17 »).",
        "L'employeur parrain inscrit le travailleur auprès de la Public Authority for Manpower (PAM) — c'est l'employeur, et non le travailleur, qui lance la procédure de permis de travail.",
        "Un examen d'aptitude médicale et une carte d'identité civile font partie de la procédure de séjour standard une fois le permis de travail accordé, en plus du permis lui-même.",
        "Les membres de la famille rejoignant un travailleur parrainé reçoivent généralement une catégorie de séjour distincte, à titre de personne à charge, plutôt qu'un permis de travail.",
      ],
      ar: [
        'يعتمد التوظيف في القطاع الخاص على إقامة مرتبطة بكفيل، يُشار إليها عادة بالمادة القانونية التي تنظمها ("المادة 18")، وهي منفصلة عن فئة الإقامة المستخدمة لموظفي القطاع الحكومي ("المادة 17").',
        'يقوم صاحب العمل الكفيل بتسجيل العامل لدى الهيئة العامة للقوى العاملة (PAM) — وصاحب العمل، وليس العامل، هو من يبدأ إجراءات تصريح العمل.',
        'يُعدّ الفحص الطبي واستخراج البطاقة المدنية جزءًا من إجراءات الإقامة المعتادة بعد منح تصريح العمل، إلى جانب التصريح نفسه.',
        'يُمنح أفراد أسرة العامل المكفول عادة فئة إقامة تابعة منفصلة بصفتهم مُعالين، وليس تصريح عمل.',
      ],
      tr: [
        'Özel sektörde istihdam, düzenlendiği kanun maddesiyle anılan (“Madde 18”) sponsora bağlı bir oturma iznine dayanır; kamu sektörü personeli için kullanılan oturma kategorisinden (“Madde 17”) ayrıdır.',
        'Sponsor işveren, çalışanı Kamu İşgücü Kurumu’na (PAM) kaydeder — çalışma izni sürecini çalışan değil işveren başlatır.',
        'Çalışma izni verildikten sonra, iznin kendisiyle birlikte sağlık muayenesi ve sivil kimlik kartı standart oturma sürecinin parçasıdır.',
        'Sponsor edilen bir çalışana katılan aile üyelerine genellikle çalışma izni değil, bakmakla yükümlü olunan kişi statüsünde ayrı bir oturma kategorisi verilir.',
      ],
    },
  },
];

const COPY = {
  en: {
    kicker: 'Working in the Gulf',
    intro: country => `Most Gulf Cooperation Council (GCC) countries, including ${country}, use an employer-sponsorship system (often called "kafala"): a licensed employer, not the worker, applies for and holds the work permit, and that permit is what lets you live and work in the country. What actually differs from one GCC country to the next — and what has genuinely changed in recent years — is below, sourced from each government's own portal.`,
    factsHeading: 'What actually applies',
    sourceLabel: 'Check the current, official version →',
    seeAlso: 'Also on this platform',
    cta: 'Ask the concierge how this applies to your own situation →',
    note: 'This page describes how the system is structured, not a specific fee schedule or step-by-step timeline — those change on each government\'s own portal, which is why every fact above links straight to it.',
  },
  fr: {
    kicker: 'Travailler dans le Golfe',
    intro: country => `La plupart des pays du Conseil de coopération du Golfe (CCG), dont ${country}, fonctionnent avec un système de parrainage par l'employeur (souvent appelé « kafala ») : c'est un employeur agréé, et non le travailleur, qui demande et détient le permis de travail, et c'est ce permis qui permet de vivre et de travailler dans le pays. Ce qui diffère réellement d'un pays du CCG à l'autre — et ce qui a véritablement changé ces dernières années — figure ci-dessous, tiré du portail officiel de chaque gouvernement.`,
    factsHeading: 'Ce qui s\'applique réellement',
    sourceLabel: "Vérifier la version officielle actuelle →",
    seeAlso: 'Aussi sur cette plateforme',
    cta: 'Demandez au concierge ce que cela change pour votre situation →',
    note: "Cette page décrit la structure du système, et non un barème de frais précis ou un échéancier étape par étape — ces éléments changent sur le portail de chaque gouvernement, d'où le lien direct sur chaque fait ci-dessus.",
  },
  ar: {
    kicker: 'العمل في الخليج',
    intro: country => `تعتمد معظم دول مجلس التعاون الخليجي، ومنها ${country}، نظام كفالة صاحب العمل (يُعرف غالبًا بـ"الكفالة"): إذ يقدّم صاحب عمل مرخّص، وليس العامل، طلب تصريح العمل ويحتفظ به، وهذا التصريح هو ما يتيح العيش والعمل في البلاد. أما ما يختلف فعليًا بين دول الخليج — وما تغيّر بالفعل في السنوات الأخيرة — فمذكور أدناه، مأخوذًا من البوابة الرسمية لكل حكومة.`,
    factsHeading: 'ما ينطبق فعليًا',
    sourceLabel: 'تحقق من النسخة الرسمية الحالية ←',
    seeAlso: 'أيضًا على هذه المنصة',
    cta: 'اسأل المساعد كيف ينطبق هذا على وضعك ←',
    note: 'تصف هذه الصفحة بنية النظام، وليس جدول رسوم محدد أو خطوات زمنية تفصيلية — فهذه التفاصيل تتغيّر على بوابة كل حكومة، ولهذا يرتبط كل بند أعلاه مباشرة بمصدره.',
  },
  tr: {
    kicker: 'Körfez’de çalışmak',
    intro: country => `${country} dahil çoğu Körfez İşbirliği Konseyi (KIK) ülkesi işveren sponsorluğu sistemiyle (çoğu zaman “kefalet” denir) çalışır: çalışma iznini çalışan değil, ruhsatlı bir işveren talep eder ve elinde tutar; ülkede yaşamanızı ve çalışmanızı sağlayan da bu izindir. KIK ülkeleri arasında gerçekte neyin farklı olduğu — ve son yıllarda gerçekten neyin değiştiği — aşağıda, her devletin kendi resmî portalından alınarak veriliyor.`,
    factsHeading: 'Gerçekte ne geçerli',
    sourceLabel: 'Güncel, resmî sürümü kontrol edin →',
    seeAlso: 'Bu platformda ayrıca',
    cta: 'Bunun kendi durumunuz için ne anlama geldiğini concierge’e sorun →',
    note: 'Bu sayfa sistemin nasıl kurgulandığını anlatır; belirli bir harç tarifesi veya adım adım takvim vermez — bunlar her devletin kendi portalında değişir, bu yüzden yukarıdaki her madde doğrudan kaynağına bağlanır.',
  },
};

const H1_VERB = { en: 'Working', fr: 'Travailler', ar: 'العمل', tr: 'çalışmak' };
// Turkish puts the verb after the locative phrase ("Katar'da çalışmak", never
// "Çalışmak Katar'da"), so the two halves of the H1 swap for tr rather than
// every language sharing one verb-first order.
const H1_VERB_LAST = new Set(['tr']);
const h1Lead = (l, titlePhrase) => H1_VERB_LAST.has(l)
  ? `${titlePhrase} ${H1_VERB[l]}`
  : `${H1_VERB[l]} ${titlePhrase}`;
const H1_SUFFIX = {
  en: 'sponsorship and work-permit basics',
  fr: 'les bases du parrainage et du permis de travail',
  ar: 'أساسيات الكفالة وتصريح العمل',
  tr: 'sponsorluk ve çalışma izninin temelleri',
};

function renderPage({ country, lang, head }) {
  const l = COPY[lang] ? lang : 'en';
  const c = COPY[l];
  const dir = l === 'ar' ? ' dir="rtl"' : '';
  const name = country.name[l] || country.name.en;
  const titlePhrase = country.title[l] || country.title.en;
  const facts = country.facts[l] || country.facts.en;
  const officialLinks = [].concat(country.official).map(o =>
    `<a class="source" href="${esc(o.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(o.label[l] || o.label.en)}</a>`).join(' · ');

  const factItems = facts.map(f => `<li>${esc(f)}</li>`).join('\n');
  const others = COUNTRIES.filter(x => x.slug !== country.slug).map(x =>
    `<li><a href="/${x.slug}${l === 'en' ? '' : `?lang=${l}`}">${esc(x.shortName[l] || x.shortName.en)}</a></li>`
  ).join('\n');

  // Cross-link the guide articles (lib/articles.js) so the two page sets
  // form one crawlable topical cluster instead of isolated pages.
  const articleLinks = require('./articles').ARTICLES.map(a =>
    `<li><a href="${require('./articles').articleUrl(a.slug, a.h1[l] ? l : 'en')}">${esc(a.h1[l] || a.h1.en)}</a></li>`
  ).join('\n');

  return `<!doctype html>
<html lang="${l}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#1a1a1a;background:#fff}
.kicker{color:#666;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}
h1{font-size:1.4rem;margin-top:0}
.intro{color:#333}
h2{font-size:1.05rem;margin-top:28px}
ul{padding-${l === 'ar' ? 'right' : 'left'}:20px}
li{margin:10px 0}
.source{display:inline-block;margin-top:8px;font-size:.9rem}
.note{color:#666;font-size:.85rem;margin-top:24px}
.cta{display:inline-block;margin-top:16px;font-weight:600}
.seealso ul{list-style:none;padding:0;display:flex;gap:14px;flex-wrap:wrap}
</style>
</head>
<body>
<p class="kicker">${esc(c.kicker)}</p>
<h1>${esc(h1Lead(l, titlePhrase))} — ${esc(H1_SUFFIX[l])}</h1>
<p class="intro">${esc(c.intro(name))}</p>
<h2>${esc(c.factsHeading)}</h2>
<ul>
${factItems}
</ul>
<p>${officialLinks}: ${esc(c.sourceLabel)}</p>
<p class="note">${esc(c.note)}</p>
<div class="seealso">
<h2>${esc(c.seeAlso)}</h2>
<ul>
${others}
${articleLinks}
</ul>
</div>
<p><a class="cta" href="/${l === 'en' ? '' : `?lang=${l}`}">${esc(c.cta)}</a></p>
</body>
</html>
`;
}

module.exports = { COUNTRIES, renderPage };
