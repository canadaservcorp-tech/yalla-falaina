'use strict';

// Immigration news ticker feed. Same rule as the job feed (Section 6.1): the
// concierge never invents opportunities, and neither does this — every item
// is either published by an official government source or written by the
// operator, and each one carries the link a visitor can check it against.
//
// Sources:
//   'ircc_draw' — IRCC's own Express Entry rounds open-data file. Fully
//                 structured (round number, date, program, invitations, CRS
//                 cutoff), so the headline is templated per language here
//                 rather than translated: the numbers ARE the news.
//   'ircc_news' — Government of Canada news feed filtered to IRCC. Free-text
//                 headlines in English; the department's feed also carries
//                 unrelated federal announcements, so only immigration-topic
//                 entries are kept.
//   'operator'  — posted from the admin console (routes/admin-news.js). This
//                 is how Australia/EU/Gulf news gets in: neither publishes a
//                 machine-readable feed we can rely on today.
const supabase = require('../db');

const EE_ROUNDS_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';
const EE_ROUND_PAGE = 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/'
  + 'policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds/invitations.html';
const IRCC_NEWS_URL = 'https://api.io.canada.ca/io-server/gc/news/en/v2'
  + '?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=20&format=atom';

const KEEP_ROUNDS = 6;   // a ticker shows a handful; older draws are history, not news
const KEEP_NEWS = 8;
const FETCH_MS = 15000;

// The department feed carries every announcement the minister's office puts
// out, including unrelated federal news (fuel tax, budget items). A ticker
// promising immigration news has to actually deliver that, so an entry is
// kept only when its headline is on-topic.
const TOPICS = /\b(immigrat|express entry|permanent resident|newcomer|refugee|asylum|citizenship|visa|work permit|study permit|foreign worker|settlement|sponsor)/i;

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
  return r.text();
}

const decode = s => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? decode(m[1].replace(/<[^>]+>/g, '').trim()) : '';
};

// Express Entry draw headlines are numbers in a sentence, so all three
// languages come from the same fields — no translation service, and no
// chance of a mistranslated CRS cutoff.
function drawHeadlines(r) {
  const size = Number(String(r.drawSize).replace(/[^0-9]/g, '')) || 0;
  const invitations = size.toLocaleString('en-US');
  return {
    en: `Canada — Express Entry draw #${r.drawNumber} (${r.drawName}): ${invitations} invitations, CRS cutoff ${r.drawCRS} · ${r.drawDateFull}`,
    fr: `Canada — Ronde Entrée express n° ${r.drawNumber} (${r.drawName}) : ${invitations} invitations, score SCG minimal ${r.drawCRS} · ${r.drawDateFull}`,
    ar: `كندا — سحب الدخول السريع رقم ${r.drawNumber} (${r.drawName}): ${invitations} دعوة، الحد الأدنى لنقاط CRS ${r.drawCRS} · ${r.drawDateFull}`,
    // The program name and date stay in English in every locale: they're
    // IRCC's own official terms (category names are defined in English only)
    // and translating them would put unofficial wording on an official fact.
    hi: `कनाडा — एक्सप्रेस एंट्री ड्रॉ #${r.drawNumber} (${r.drawName}): ${invitations} निमंत्रण, CRS कटऑफ ${r.drawCRS} · ${r.drawDateFull}`,
    tr: `Kanada — Express Entry çekilişi #${r.drawNumber} (${r.drawName}): ${invitations} davetiye, CRS taban puanı ${r.drawCRS} · ${r.drawDateFull}`,
  };
}

async function expressEntryRounds() {
  const data = await getJson(EE_ROUNDS_URL);
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  return rounds
    .filter(r => r && r.drawNumber && r.drawDate)
    .slice(0, KEEP_ROUNDS)
    .map(r => {
      const h = drawHeadlines(r);
      return {
        source: 'ircc_draw',
        external_id: 'ee-' + r.drawNumber,
        country: 'Canada',
        category: 'express_entry',
        title_en: h.en,
        title_fr: h.fr,
        title_ar: h.ar,
        title_hi: h.hi,
        title_tr: h.tr,
        url: EE_ROUND_PAGE + '?q=' + encodeURIComponent(r.drawNumber),
        published_at: new Date(r.drawDate + 'T00:00:00Z').toISOString(),
      };
    });
}

async function irccNews() {
  const xml = await getText(IRCC_NEWS_URL);
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const out = [];
  for (const e of entries) {
    const title = tag(e, 'title');
    const url = tag(e, 'id');
    if (!title || !url || !TOPICS.test(title)) continue;
    const when = tag(e, 'published') || tag(e, 'updated');
    const published = when && !Number.isNaN(Date.parse(when)) ? new Date(when).toISOString() : new Date().toISOString();
    out.push({
      source: 'ircc_news',
      external_id: 'news-' + url.slice(-120),
      country: 'Canada',
      category: 'announcement',
      // The feed publishes English only. Showing the original headline with
      // its official link beats showing a machine translation of an
      // immigration rule we cannot verify word for word.
      title_en: title,
      title_fr: null,
      title_ar: null,
      title_hi: null,
      title_tr: null,
      url,
      published_at: published,
    });
    if (out.length >= KEEP_NEWS) break;
  }
  return out;
}

// One source failing must not wipe the other's items: each is collected
// independently and a rejection is logged, exactly like the job feed's
// per-country handling.
async function collect() {
  const items = [];
  for (const [name, fn] of [['express-entry', expressEntryRounds], ['ircc-news', irccNews]]) {
    try {
      items.push(...await fn());
    } catch (e) {
      console.error('news-ingest: ' + name + ' failed —', e.message);
    }
  }
  return items;
}

async function refresh() {
  const items = await collect();
  if (!items.length) {
    console.log('news-ingest: nothing fetched, keeping the current items');
    return 0;
  }
  const { error } = await supabase.from('news_items')
    .upsert(items, { onConflict: 'source,external_id' });
  if (error) {
    console.error('news-ingest: upsert failed —', error.message);
    return 0;
  }
  console.log(`news-ingest: ${items.length} items upserted`);
  return items.length;
}

module.exports = { refresh, collect, drawHeadlines, TOPICS };
