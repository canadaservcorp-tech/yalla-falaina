'use strict';

// A real, crawlable FAQ page (/faq) — static, zero client JS, same pattern
// and discipline as lib/directories.js and lib/gccGuides.js. Every answer is
// product truth the app already enforces elsewhere (the paywall, the promo
// window, the verification rule); nothing here overstates what the platform
// does. The page also emits FAQPage JSON-LD — the structured format answer
// engines (ChatGPT/Perplexity/Google AI) read to quote a site in answers.
const articles = require('./articles');

const LANGS = ['en', 'fr', 'ar'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FAQ = [
  {
    q: { en: 'What is Yalla Nsafer?', fr: 'Qu\u2019est-ce que Yalla Nsafer ?', ar: 'ما هي منصّة يلا نسافر؟' },
    a: {
      en: 'A five-language AI concierge (Arabic, French, English, Hindi, Turkish) that helps people in the Middle East and India find real, verified opportunities abroad — jobs, study programs and scholarships, and medical treatment providers — and understand each step of getting there.',
      fr: 'Un concierge IA en cinq langues (arabe, français, anglais, hindi, turc) qui aide les personnes du Moyen-Orient et d\'Inde à trouver de vraies opportunités vérifiées à l\'étranger — emplois, programmes d\'études et bourses, centres de soins — et à comprendre chaque étape.',
      ar: 'مساعد ذكي بخمس لغات (العربية والفرنسية والإنجليزية والهندية والتركية) يساعد الباحثين عن فرص في الشرق الأوسط والهند على إيجاد فرص حقيقية وموثقة في الخارج — عمل ودراسة ومنح وعلاج — وفهم كل خطوة على الطريق.',
    },
  },
  {
    q: { en: 'Are the jobs, scholarships and hospitals real?', fr: 'Les emplois, bourses et hôpitaux sont-ils réels ?', ar: 'هل الوظائف والمنح والمستشفيات حقيقية؟' },
    a: {
      en: 'Yes — the platform only shows listings it can verify, and each one links to its official source (the employer, university, government portal, or hospital) so you can check it yourself. If something cannot be verified, it does not appear.',
      fr: 'Oui — la plateforme n\'affiche que des annonces vérifiables, chacune liée à sa source officielle (employeur, université, portail gouvernemental ou hôpital) pour que vous puissiez vérifier vous-même. Ce qui ne peut être vérifié n\'apparaît pas.',
      ar: 'نعم — لا تعرض المنصّة إلا ما يمكن التحقّق منه، وكل إعلان مرتبط بمصدره الرسمي (صاحب العمل أو الجامعة أو البوابة الحكومية أو المستشفى) لتتحقّق بنفسك. ما لا يمكن التحقّق منه لا يظهر.',
    },
  },
  {
    q: { en: 'How much does it cost?', fr: 'Combien ça coûte ?', ar: 'كم تبلغ التكلفة؟' },
    a: {
      en: 'You can try the concierge free first. Full access is $25 per month, cancel anytime in one tap. New accounts created before December 31, 2026 get three months of full access free as a launch offer.',
      fr: 'Vous pouvez d\'abord essayer le concierge gratuitement. L\'accès complet coûte 25 $ par mois, résiliable à tout moment. Les nouveaux comptes créés avant le 31 décembre 2026 bénéficient de trois mois d\'accès complet gratuits.',
      ar: 'يمكنك تجربة المساعد مجانًا أولًا. الوصول الكامل بسعر 25 دولارًا شهريًا، ويمكنك الإلغاء في أي وقت. الحسابات الجديدة المنشأة قبل 31 ديسمبر 2026 تحصل على ثلاثة أشهر مجانية كعرض إطلاق.',
    },
  },
  {
    q: { en: 'Which languages does it speak?', fr: 'Quelles langues parle-t-il ?', ar: 'بأي لغات يتحدث؟' },
    a: {
      en: 'Arabic (including Lebanese, Syrian, Egyptian and Gulf dialects), French, English, Hindi and Turkish. You can also send voice notes — the concierge transcribes them and replies in writing in your language.',
      fr: 'Arabe (y compris les dialectes libanais, syrien, égyptien et du Golfe), français, anglais, hindi et turc. Vous pouvez aussi envoyer des notes vocales — le concierge les transcrit et répond par écrit dans votre langue.',
      ar: 'العربية (بما فيها اللهجات اللبنانية والسورية والمصرية والخليجية) والفرنسية والإنجليزية والهندية والتركية. ويمكنك إرسال رسائل صوتية — يكتبها المساعد نصًا ويرد عليك كتابةً بلغتك.',
    },
  },
  {
    q: { en: 'Can it review my documents and write letters for me?', fr: 'Peut-il lire mes documents et rédiger des lettres ?', ar: 'هل يستطيع مراجعة مستنداتي وكتابة خطابات نيابةً عني؟' },
    a: {
      en: 'Yes. You can attach a document (CV, offer letter, certificate) and the concierge reads it and advises you. It can also generate a downloadable PDF CV, a motivation letter for a job, and a letter of interest for a university — drafted only from your real profile details.',
      fr: 'Oui. Vous pouvez joindre un document (CV, offre, diplôme) et le concierge le lit et vous conseille. Il peut aussi générer un CV PDF téléchargeable, une lettre de motivation pour un emploi et une lettre d\'intérêt pour une université — rédigés uniquement à partir de vos informations réelles.',
      ar: 'نعم. يمكنك إرفاق مستند (سيرة ذاتية، عرض عمل، شهادة) فيقرأه المساعد وينصحك. ويمكنه أيضًا إنشاء سيرة ذاتية PDF قابلة للتنزيل، وخطاب تحفيز للعمل، وخطاب اهتمام للجامعة — تُصاغ فقط من معلوماتك الحقيقية.',
    },
  },
  {
    q: { en: 'Is Yalla Nsafer an immigration agency or law firm?', fr: 'Yalla Nsafer est-elle une agence d\'immigration ou un cabinet d\'avocats ?', ar: 'هل يلا نسافر وكالة هجرة أو مكتب محاماة؟' },
    a: {
      en: 'No. It is a guidance platform: it finds real listings, explains the steps, and links you to official sources. It does not submit applications, sell visas, or give legal advice — official decisions are always made by the government, university, or employer itself.',
      fr: 'Non. C\'est une plateforme d\'orientation : elle trouve de vraies annonces, explique les étapes et renvoie vers les sources officielles. Elle ne dépose pas de dossiers, ne vend pas de visas et ne donne pas de conseils juridiques — les décisions officielles reviennent toujours au gouvernement, à l\'université ou à l\'employeur.',
      ar: 'لا. هي منصّة إرشاد: تجد إعلانات حقيقية، وتشرح الخطوات، وتحيلك إلى المصادر الرسمية. لا تقدّم طلبات نيابةً عنك ولا تبيع تأشيرات ولا تقدّم استشارات قانونية — القرارات الرسمية تصدر دائمًا من الحكومة أو الجامعة أو صاحب العمل نفسه.',
    },
  },
  {
    q: { en: 'Does it give medical advice?', fr: 'Donne-t-elle des conseils médicaux ?', ar: 'هل تقدّم استشارات طبية؟' },
    a: {
      en: 'No — for treatment abroad it plays a purely logistical role: it lists real hospitals and international-patient centres, published costs when they exist, and real contact channels. Medical decisions are made with your own doctor and the hospital.',
      fr: 'Non — pour le traitement à l\'étranger, son rôle est purement logistique : elle répertorie de vrais hôpitaux et centres pour patients internationaux, les coûts publiés lorsqu\'ils existent, et de vrais canaux de contact. Les décisions médicales se prennent avec votre médecin et l\'hôpital.',
      ar: 'لا — في العلاج بالخارج دورها لوجستي بحت: تعرض مستشفيات ومراكز مرضى دوليين حقيقية، وتكاليف منشورة إن وُجدت، وقنوات تواصل حقيقية. القرارات الطبية تُتخذ مع طبيبك والمستشفى.',
    },
  },
  {
    q: { en: 'What happens to my data if I cancel?', fr: 'Que deviennent mes données si je résilie ?', ar: 'ماذا يحدث لبياناتي إذا ألغيت الاشتراك؟' },
    a: {
      en: 'Cancelling takes one tap and stops billing immediately. Your profile and conversation history are kept for 30 days in case you return, then permanently deleted — you get a warning email before deletion.',
      fr: 'La résiliation se fait en un geste et arrête immédiatement la facturation. Votre profil et l\'historique de conversation sont conservés 30 jours au cas où vous reviendriez, puis supprimés définitivement — vous recevez un e-mail d\'avertissement avant suppression.',
      ar: 'الإلغاء يتم بضغطة واحدة ويوقف الفوترة فورًا. نحتفظ بملفك وسجلّ المحادثات 30 يومًا في حال عدت، ثم تُحذف نهائيًا — ويصلك بريد تحذيري قبل الحذف.',
    },
  },
];

const COPY = {
  en: { h1: 'Frequently asked questions', intro: 'Straight answers about what Yalla Nsafer is, what it costs, and how your data is handled.' },
  fr: { h1: 'Questions fréquentes', intro: 'Des réponses directes sur ce qu\'est Yalla Nsafer, son prix et le traitement de vos données.' },
  ar: { h1: 'الأسئلة الشائعة', intro: 'إجابات مباشرة عن ماهية يلا نسافر وتكلفتها وكيفية التعامل مع بياناتك.' },
};

function faqJsonLd(l) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.q[l] || f.q.en,
      acceptedAnswer: { '@type': 'Answer', text: f.a[l] || f.a.en },
    })),
  });
}

function renderPage({ lang, head }) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const c = COPY[l];
  const dir = l === 'ar' ? ' dir="rtl"' : '';
  const base = require('./seo').base();
  const qa = FAQ.map(f => `<div class="qa"><h2>${esc(f.q[l] || f.q.en)}</h2><p>${esc(f.a[l] || f.a.en)}</p></div>`).join('\n');
  const articleLinks = articles.ARTICLES.map(a =>
    `<li><a href="${articles.articleUrl(a.slug, a.h1[l] ? l : 'en')}">${esc(a.h1[l] || a.h1.en)}</a></li>`).join('\n');
  return `<!doctype html>
<html lang="${l}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<script type="application/ld+json">${faqJsonLd(l)}</script>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#1a1a1a;background:#fff}
h1{font-size:1.4rem}
.intro{color:#444}
.qa{margin-top:22px}
.qa h2{font-size:1.02rem;margin:0 0 4px}
.qa p{margin:0;color:#333}
.seealso{margin-top:28px}
.seealso ul{list-style:none;padding:0;display:flex;gap:14px;flex-wrap:wrap}
.cta{display:inline-block;margin-top:16px;font-weight:600}
nav{font-size:.85rem;margin-bottom:18px}
</style>
</head>
<body>
<nav><a href="/${l === 'en' ? '' : `?lang=${l}`}">← Yalla Nsafer</a></nav>
<h1>${esc(c.h1)}</h1>
<p class="intro">${esc(c.intro)}</p>
${qa}
<div class="seealso"><h2>${esc({ en: 'Related guides', fr: 'Guides associés', ar: 'أدلة مرتبطة' }[l])}</h2><ul>${articleLinks}</ul></div>
<p><a class="cta" href="${base}/${l === 'en' ? '' : `?lang=${l}`}">${esc({ en: 'Ask the concierge yourself →', fr: 'Posez votre question au concierge →', ar: 'اسأل المساعد بنفسك ←' }[l])}</a></p>
</body>
</html>
`;
}

module.exports = { LANGS, FAQ, renderPage };
