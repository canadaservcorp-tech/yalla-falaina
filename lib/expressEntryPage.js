'use strict';

// A real, crawlable page — not another view of the SPA shell (server.js
// registers it as its own route, ahead of the catch-all). The content is
// IRCC's own Express Entry draw data, already sitting in news_items
// (lib/newsIngest.js's 'ircc_draw' rows, ingested for the homepage news
// ticker) — this page just gives that same real, already-sourced data a
// second, permanent, indexable home instead of scrolling past once. Zero new
// content to write and it grows on its own as new draws are ingested.
//
// Same sourcing-integrity rule as everywhere else in this codebase (Section
// 6.1): every row here came from IRCC's own feed, links back to IRCC's own
// page, and nothing is invented or paraphrased into a specific claim this
// page can't back up.
const supabase = require('../db');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// title_ar/title_fr are always populated for an 'ircc_draw' row (they're
// templated from structured fields, not translated prose — see
// lib/newsIngest.js's drawHeadlines()), so every language but Hindi gets a
// real native headline. Hindi shows the English original rather than a
// machine translation of a CRS cutoff number — the same "original over
// invented translation" rule lib/newsIngest.js already applies to ircc_news.
const titleField = lang => (lang === 'fr' ? 'title_fr' : lang === 'ar' ? 'title_ar' : 'title_en');

const LOCALE = { en: 'en-CA', fr: 'fr-CA', ar: 'ar', hi: 'hi-IN' };
const formatDate = (iso, lang) => {
  try { return new Intl.DateTimeFormat(LOCALE[lang] || 'en-CA', { dateStyle: 'long' }).format(new Date(iso)); }
  catch (e) { return iso; }
};

const COPY = {
  en: {
    h1: 'Canada Express Entry — recent draws',
    intro: 'Express Entry is Canada’s points-based system for skilled-worker immigration. Below are the most recent rounds of invitations, sourced directly from Immigration, Refugees and Citizenship Canada (IRCC) — each one links to IRCC’s own page so you can check it yourself.',
    empty: 'No draws are loaded yet — check back soon.',
    source: 'Source: IRCC →',
    cta: 'Ask the concierge how this applies to you →',
  },
  fr: {
    h1: "Entrée express Canada — rondes récentes",
    intro: "Entrée express est le système de points du Canada pour l'immigration économique des travailleurs qualifiés. Voici les rondes d'invitations les plus récentes, tirées directement d'Immigration, Réfugiés et Citoyenneté Canada (IRCC) — chacune renvoie à la page officielle d'IRCC pour vérification.",
    empty: 'Aucune ronde n’est encore chargée — revenez bientôt.',
    source: 'Source : IRCC →',
    cta: 'Demandez au concierge ce que cela change pour vous →',
  },
  ar: {
    h1: 'الدخول السريع الكندي — أحدث السحوبات',
    intro: 'الدخول السريع هو نظام النقاط الكندي لهجرة العمالة الماهرة. أدناه أحدث جولات الدعوات، مأخوذة مباشرة من وزارة الهجرة واللاجئين والمواطنة الكندية (IRCC) — وكل جولة ترتبط بصفحة IRCC الرسمية للتحقق بنفسك.',
    empty: 'لا توجد سحوبات محمّلة بعد — تفقد الصفحة قريبًا.',
    source: 'المصدر: IRCC ←',
    cta: 'اسأل المساعد كيف ينطبق هذا عليك ←',
  },
  hi: {
    h1: 'कनाडा एक्सप्रेस एंट्री — हाल के ड्रॉ',
    intro: 'एक्सप्रेस एंट्री कुशल श्रमिकों के लिए कनाडा की पॉइंट-आधारित आव्रजन प्रणाली है। नीचे हाल के आमंत्रण राउंड हैं, सीधे Immigration, Refugees and Citizenship Canada (IRCC) से प्राप्त — हर एक IRCC के अपने पेज से जुड़ा है ताकि आप खुद जांच सकें।',
    empty: 'अभी तक कोई ड्रॉ लोड नहीं हुआ — जल्द ही फिर देखें।',
    source: 'स्रोत: IRCC →',
    cta: 'यह आप पर कैसे लागू होता है, कंसीयर्ज से पूछें →',
  },
};

// Real IRCC draws only — an operator-posted announcement or a filtered
// ircc_news item has no place on a page whose whole point is "these are the
// actual draws," not general immigration news (that stays on the homepage
// ticker, routes/news.js).
async function loadDraws(limit = 60) {
  try {
    const { data, error } = await supabase.from('news_items')
      .select('title_en, title_fr, title_ar, url, published_at')
      .eq('source', 'ircc_draw')
      .order('published_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('expressEntryPage: loadDraws', error.message); return []; }
    return data || [];
  } catch (e) { console.error('expressEntryPage: loadDraws', e.message); return []; }
}

function renderPage({ lang, draws, head }) {
  const l = COPY[lang] ? lang : 'en';
  const c = COPY[l];
  const dir = l === 'ar' ? ' dir="rtl"' : '';
  const field = titleField(l);

  const items = (draws || []).map(d => {
    const text = d[field] || d.title_en;
    return [
      '<li>',
      `<time datetime="${esc(d.published_at)}">${esc(formatDate(d.published_at, l))}</time>`,
      `<p>${esc(text)}</p>`,
      `<a href="${esc(d.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(c.source)}</a>`,
      '</li>',
    ].join('\n');
  }).join('\n');

  const body = items || `<p class="empty">${esc(c.empty)}</p>`;

  return `<!doctype html>
<html lang="${l}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.5;color:#1a1a1a;background:#fff}
h1{font-size:1.4rem}
.intro{color:#444}
ol{list-style:none;padding:0;margin:24px 0}
li{padding:14px 0;border-bottom:1px solid #e5e5e5}
time{display:block;font-size:.85rem;color:#666}
li p{margin:4px 0}
li a{font-size:.9rem}
.empty{color:#666;font-style:italic}
.cta{display:inline-block;margin-top:16px;font-weight:600}
</style>
</head>
<body>
<h1>${esc(c.h1)}</h1>
<p class="intro">${esc(c.intro)}</p>
<ol>
${body}
</ol>
<p><a class="cta" href="/${l === 'en' ? '' : `?lang=${l}`}">${esc(c.cta)}</a></p>
</body>
</html>
`;
}

module.exports = { loadDraws, renderPage, titleField, formatDate };
