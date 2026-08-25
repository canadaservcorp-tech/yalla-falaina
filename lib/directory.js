// Index behind the trade × city pages and their sitemap.
//
// The whole catalogue is ~400 listings, so the cheapest correct thing is to read it once every
// ten minutes and answer every page, sibling list and sitemap entry from memory, instead of
// three joins per crawler hit.
const supabase = require('../db');
const { slug } = require('./slug');

const TTL_MS = 10 * 60 * 1000;
// Below this, a page has nothing a reader (or Google) wants: it stays out of the sitemap
// and answers 404, so we never publish a page listing one lonely business.
const MIN_PROVIDERS = 3;

let cache = { at: 0, index: null };

async function build() {
  const [profs, services, providers] = await Promise.all([
    supabase.from('professions').select('id, name_fr, name_en'),
    supabase.from('provider_services').select('provider_id, profession_id'),
    supabase.from('providers').select('user_id, display_name, city, rbq_licence, claimed'),
  ]);
  for (const r of [profs, services, providers]) if (r.error) throw r.error;

  const trade = new Map((profs.data || []).map(p => [p.id, p]));
  const byId = new Map((providers.data || []).map(p => [p.user_id, p]));
  const index = new Map();

  for (const s of services.data || []) {
    const p = byId.get(s.provider_id);
    const prof = trade.get(s.profession_id);
    if (!p || !prof || !p.city) continue;
    const key = `${slug(prof.name_fr)}/${slug(p.city)}`;
    if (!index.has(key)) {
      index.set(key, {
        tradeFr: prof.name_fr, tradeEn: prof.name_en || prof.name_fr,
        tradeAlias: slug(prof.name_en || ''), city: p.city, providers: [],
      });
    }
    index.get(key).providers.push(p);
  }
  for (const entry of index.values()) {
    entry.providers.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'fr'));
  }
  return index;
}

async function index() {
  if (cache.index && Date.now() - cache.at < TTL_MS) return cache.index;
  const built = await build();
  cache = { at: Date.now(), index: built };
  return built;
}

// An English trade slug ("electrician/laval") answers with the French canonical entry.
async function entry(tradeSlug, citySlug) {
  const idx = await index();
  const direct = idx.get(`${tradeSlug}/${citySlug}`);
  if (direct) return direct.providers.length >= MIN_PROVIDERS ? direct : null;
  for (const [key, e] of idx) {
    if (e.tradeAlias && e.tradeAlias === tradeSlug && key.endsWith(`/${citySlug}`)) {
      return e.providers.length >= MIN_PROVIDERS ? e : null;
    }
  }
  return null;
}

// Same trade elsewhere, and other trades in the same city — internal links are what makes
// a set of pages crawlable at all.
async function siblings(tradeSlug, citySlug) {
  const idx = await index();
  const cities = [], trades = [];
  for (const [key, e] of idx) {
    if (e.providers.length < MIN_PROVIDERS) continue;
    const [tSlug, cSlug] = key.split('/');
    if (tSlug === tradeSlug && cSlug !== citySlug) cities.push({ label: e.city, key });
    if (cSlug === citySlug && tSlug !== tradeSlug) trades.push({ label: e.tradeFr, key });
  }
  const cut = list => list.sort((a, b) => a.label.localeCompare(b.label, 'fr')).slice(0, 12);
  return { cities: cut(cities), trades: cut(trades) };
}

async function combos() {
  const idx = await index();
  return [...idx.entries()]
    .filter(([, e]) => e.providers.length >= MIN_PROVIDERS)
    .map(([key]) => key);
}

module.exports = { entry, siblings, combos, MIN_PROVIDERS, __reset: () => { cache = { at: 0, index: null }; } };
