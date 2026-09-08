// TrouvePro — one crawlable page per trade × city: /services/<metier>/<ville>.
//
// Someone in Laval types "électricien Laval" into Google, not "marketplace de proximité".
// The SPA is a single URL with a map, so it can never rank for those words; this renders the
// providers we really have for that trade and city, with the same privacy rules as search
// (business name, city, licence — never an address, a phone number or coordinates).
const seo = require('./seo');
const { slug } = require('./slug');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const T = {
  fr: {
    count: n => `${n} prestataire${n > 1 ? 's' : ''}`,
    lede: (trade, city) => `Les prestataires en ${trade} que nous connaissons à ${city}. TrouvePro les classe par proximité réelle : lancez la recherche pour voir qui est le plus proche de vous.`,
    cta: 'Voir qui est le plus près de moi',
    unclaimed: 'Fiche non réclamée',
    licence: 'Licence RBQ',
    claim: 'C’est votre entreprise ? Réclamez votre fiche gratuitement.',
    verify: 'Vérifier une licence RBQ',
    otherCities: 'Autres villes',
    otherTrades: 'Autres métiers à',
    disclaimer: 'Les fiches non réclamées proviennent du registre public des licences de la RBQ. TrouvePro met en relation et ne vérifie pas les qualifications : la vérification finale revient au client.',
    other: 'English',
    faq: 'Questions fréquentes',
    terms: 'Conditions',
    privacy: 'Confidentialité',
  },
  en: {
    count: n => `${n} provider${n > 1 ? 's' : ''}`,
    lede: (trade, city) => `The ${trade} providers we know in ${city}. TrouvePro ranks them by real proximity: run the search to see who is closest to you.`,
    cta: 'See who is closest to me',
    unclaimed: 'Unclaimed listing',
    licence: 'RBQ licence',
    claim: 'Is this your business? Claim your listing for free.',
    verify: 'Check an RBQ licence',
    otherCities: 'Other cities',
    otherTrades: 'Other trades in',
    disclaimer: 'Unclaimed listings come from the public RBQ licence register. TrouvePro connects and does not verify qualifications: the final check is the client’s.',
    other: 'Français',
    faq: 'FAQ',
    terms: 'Terms',
    privacy: 'Privacy',
  },
};

const path = (tradeSlug, citySlug) => `/services/${tradeSlug}/${citySlug}`;

function metaHead(trade, city, count, lang) {
  const site = seo.base();
  const l = lang === 'en' ? 'en' : 'fr';
  const p = path(slug(trade), slug(city));
  const title = l === 'en'
    ? `${trade} in ${city} — ${count} providers | TrouvePro`
    : `${trade} à ${city} — ${count} prestataires | TrouvePro`;
  const description = l === 'en'
    ? `${count} ${trade} providers listed in ${city}. Free proximity search, RBQ licences shown, contact through the app.`
    : `${count} prestataires en ${trade} répertoriés à ${city}. Recherche gratuite par proximité, licences RBQ affichées, contact dans l’application.`;
  const share = seo.SHARE_IMAGE[l];
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(site + p)}">`,
    `<link rel="alternate" hreflang="fr-CA" href="${esc(site + p)}">`,
    `<link rel="alternate" hreflang="en-CA" href="${esc(site + p + '?lang=en')}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(site + p)}">`,
    `<meta property="og:image" content="${esc(site + share.path)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n');
}

function providerItem(t, p, lang) {
  const l = lang === 'en' ? 'en' : 'fr';
  const name = esc(p.display_name);
  const head = p.rbq_licence
    ? `<a href="/fiche/${encodeURIComponent(p.rbq_licence)}${l === 'en' ? '?lang=en' : ''}">${name}</a>`
    : name;
  return `<li>
    <div class="name">${head}${p.claimed ? '' : ` <span class="badge">${esc(t.unclaimed)}</span>`}</div>
    <div class="fine">${p.rbq_licence ? esc(t.licence) + ' ' + esc(p.rbq_licence) : ''}${p.city ? ' · ' + esc(p.city) : ''}</div>
  </li>`;
}

const linkList = items => items.map(i =>
  `<a class="chip" href="${esc(i.href)}">${esc(i.label)}</a>`).join(' ');

// page: { trade, city, providers: [{display_name, city, rbq_licence, claimed}],
//         cities: [{label, href}], trades: [{label, href}] }
function render({ trade, city, providers, cities = [], trades = [], lang = 'fr' } = {}) {
  const l = lang === 'en' ? 'en' : 'fr';
  const t = T[l];
  const n = providers.length;
  const anyUnclaimed = providers.some(p => !p.claimed);
  const searchHref = `/${l === 'en' ? '?lang=en' : ''}`;

  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${metaHead(trade, city, n, l)}
<link rel="icon" href="/icons/icon-192.png">
<style>
:root{--teal:#0f7c7b;--ink:#12211f;--muted:#5b6b69;--line:#e2e8e7}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f6f8f8}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:#fff;border-bottom:1px solid var(--line)}
header a{color:var(--teal);text-decoration:none;font-weight:600}
main{max-width:720px;margin:0 auto;padding:22px 18px 40px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:16px}
h1{font-size:26px;margin:0 0 8px;line-height:1.2}
h2{font-size:18px;margin:0 0 10px}
p{line-height:1.55}
.lede{color:var(--muted)}
ul.list{list-style:none;padding:0;margin:0}
ul.list li{padding:12px 0;border-top:1px solid var(--line)}
.name{font-weight:600}
.name a{color:var(--teal);text-decoration:none}
.badge{display:inline-block;background:#fff5e6;color:#8a5a00;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:600}
.fine{font-size:13px;color:var(--muted)}
.btn{display:inline-block;background:var(--teal);color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700}
.claim{background:#fff5e6;border-radius:12px;padding:12px 14px;margin-top:14px}
.chip{display:inline-block;background:#f0f7f7;color:var(--teal);text-decoration:none;border-radius:999px;padding:6px 12px;margin:3px 0;font-size:14px}
.ghostlink{color:var(--teal)}
footer{max-width:720px;margin:0 auto;padding:0 18px 40px;font-size:13px;color:var(--muted)}
footer a{color:var(--muted);margin-right:12px}
@media(max-width:420px){.btn{display:block;text-align:center}}
</style>
</head>
<body>
<header><a href="/">TrouvePro</a><a href="${esc(path(slug(trade), slug(city)) + (l === 'en' ? '' : '?lang=en'))}">${esc(t.other)}</a></header>
<main>
  <div class="card">
    <h1>${esc(l === 'en' ? `${trade} in ${city}` : `${trade} à ${city}`)}</h1>
    <p class="lede">${esc(t.count(n))} · ${esc(t.lede(trade, city))}</p>
    <p><a class="btn" href="${esc(searchHref)}">${esc(t.cta)}</a></p>
  </div>
  <div class="card">
    <h2>${esc(t.count(n))}</h2>
    <ul class="list">${providers.map(p => providerItem(t, p, l)).join('')}</ul>
    ${anyUnclaimed ? `<p class="claim">${esc(t.claim)}</p>` : ''}
  </div>
  ${cities.length ? `<div class="card"><h2>${esc(t.otherCities)}</h2>${linkList(cities)}</div>` : ''}
  ${trades.length ? `<div class="card"><h2>${esc(`${t.otherTrades} ${city}`)}</h2>${linkList(trades)}</div>` : ''}
  <p class="fine">${esc(t.disclaimer)}</p>
  <p><a class="ghostlink" href="/verification${l === 'en' ? '?lang=en' : ''}">${esc(t.verify)}</a></p>
</main>
<footer>
  <a href="/faq${l === 'en' ? '?lang=en' : ''}">${esc(t.faq)}</a>
  <a href="/terms${l === 'en' ? '?lang=en' : ''}">${esc(t.terms)}</a>
  <a href="/privacy${l === 'en' ? '?lang=en' : ''}">${esc(t.privacy)}</a>
</footer>
</body>
</html>
`;
}

module.exports = { render, path };
