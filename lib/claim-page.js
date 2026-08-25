// TrouvePro — the page a prospected contractor lands on from the campaign email.
//
// The email used to point at the seeker home page, so a contractor had to find
// their own name among 400 listings before they could claim it. This renders
// their listing on its own crawlable URL (/fiche/<licence>) with a single action.
//
// Server-rendered rather than an SPA route: the whole point is that the business
// name, city and licence are in the HTML for Google and for link previews, and
// the reader has no account yet, so there is nothing to load client-side.
const seo = require('./seo');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// RBQ licences are digits and dashes ("1104-8618-06"); anything else is not a licence.
const LICENCE = /^[0-9][0-9-]{3,19}$/;
const isLicence = s => typeof s === 'string' && LICENCE.test(s);

const PRICE = {
  fr: '5,49 $/mois les 3 premiers mois, puis 10,66 $/mois + taxes, annulable en tout temps.',
  en: '$5.49/month for the first 3 months, then $10.66/month + taxes, cancel anytime.',
};

const T = {
  fr: {
    badge: 'Fiche non réclamée',
    lede: 'Cette fiche a été créée à partir du registre public des licences RBQ. Elle est en ligne, les clients la voient — et personne ne la gère.',
    licence: 'Licence RBQ',
    city: 'Ville',
    trades: 'Services',
    why: 'TrouvePro classe les prestataires par proximité réelle : quand un client à quelques rues cherche votre métier, il voit d’abord les pros les plus proches.',
    cta: 'C’est mon entreprise — réclamer ma fiche',
    free: 'Réclamer est gratuit et prend deux minutes.',
    founding: (taken, limit) => `Prestataires fondateurs : ${taken} des ${limit} places sont prises. Un fondateur garde le tarif de lancement et le badge sur sa fiche.`,
    foundingFull: 'Les 50 places de prestataire fondateur sont prises.',
    claimedTitle: 'Fiche déjà réclamée',
    claimedBody: 'Cette entreprise gère déjà sa fiche sur TrouvePro.',
    search: 'Chercher un prestataire près de moi',
    other: 'English',
    faq: 'Questions fréquentes',
    terms: 'Conditions',
    privacy: 'Confidentialité',
  },
  en: {
    badge: 'Unclaimed listing',
    lede: 'This listing was built from the public RBQ licence register. It is live, clients can see it — and nobody is managing it.',
    licence: 'RBQ licence',
    city: 'City',
    trades: 'Services',
    why: 'TrouvePro ranks providers by real proximity: when a client a few streets away searches for your trade, they see the closest pros first.',
    cta: 'This is my business — claim my listing',
    free: 'Claiming is free and takes two minutes.',
    founding: (taken, limit) => `Founding providers: ${taken} of the ${limit} places are taken. A founder keeps the launch price and the badge on their listing.`,
    foundingFull: 'All 50 founding provider places are taken.',
    claimedTitle: 'Listing already claimed',
    claimedBody: 'This business already manages its TrouvePro listing.',
    search: 'Find a provider near me',
    other: 'Français',
    faq: 'FAQ',
    terms: 'Terms',
    privacy: 'Privacy',
  },
};

// Where the claim button goes. The token from the recipient's own email is carried
// through so the funnel can tell an emailed contractor from a Google visitor, and
// so the list stops mailing whoever converted.
function claimUrl(listing, { token, lang } = {}) {
  const q = new URLSearchParams();
  if (token) q.set('claim', token);
  else q.set('claim_licence', listing.rbq_licence);
  q.set('utm_source', token ? 'rbq_email' : 'claim_page');
  if (lang === 'en') q.set('lang', 'en');
  return '/?' + q.toString();
}

function metaHead(listing, lang) {
  const site = seo.base();
  const l = lang === 'en' ? 'en' : 'fr';
  const path = `/fiche/${encodeURIComponent(listing.rbq_licence)}`;
  const name = listing.display_name || (l === 'en' ? 'RBQ licence holder' : 'Titulaire de licence RBQ');
  const where = listing.city ? ` — ${listing.city}` : '';
  const title = l === 'en'
    ? `${name}${where} — unclaimed listing on TrouvePro`
    : `${name}${where} — fiche non réclamée sur TrouvePro`;
  const description = l === 'en'
    ? `${name} is listed on TrouvePro from the public RBQ register (licence ${listing.rbq_licence}). Claim the listing to be contacted by clients nearby.`
    : `${name} figure sur TrouvePro d’après le registre public de la RBQ (licence ${listing.rbq_licence}). Réclamez la fiche pour être contacté par les clients près de vous.`;
  const share = seo.SHARE_IMAGE[l];
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(site + path)}">`,
    `<link rel="alternate" hreflang="fr-CA" href="${esc(site + path)}">`,
    `<link rel="alternate" hreflang="en-CA" href="${esc(site + path + '?lang=en')}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(site + path)}">`,
    `<meta property="og:image" content="${esc(site + share.path)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n');
}

// The scarcity line is only shown when the real count is known: an unavailable counter
// prints nothing rather than a plausible number.
function foundingLine(t, founding) {
  if (!founding || !Number.isFinite(founding.taken) || !Number.isFinite(founding.limit)) return '';
  const text = founding.remaining > 0 ? t.founding(founding.taken, founding.limit) : t.foundingFull;
  return `<p class="founding">${esc(text)}</p>`;
}

// listing: { display_name, city, rbq_licence, claimed, trades: [{name_fr, name_en}] }
function render(listing, { lang = 'fr', token = null, founding = null } = {}) {
  const l = lang === 'en' ? 'en' : 'fr';
  const t = T[l];
  const name = esc(listing.display_name || (l === 'en' ? 'RBQ licence holder' : 'Titulaire de licence RBQ'));
  const trades = (listing.trades || [])
    .map(p => esc(l === 'en' ? (p.name_en || p.name_fr) : (p.name_fr || p.name_en)))
    .filter(Boolean);
  const otherLang = `/fiche/${encodeURIComponent(listing.rbq_licence)}${l === 'en' ? '' : '?lang=en'}`;
  const row = (label, value) => value
    ? `<div class="row"><span class="k">${esc(label)}</span><span class="v">${value}</span></div>` : '';

  const action = listing.claimed
    ? `<h2>${esc(t.claimedTitle)}</h2><p>${esc(t.claimedBody)}</p>
       <p><a class="btn ghost" href="/${l === 'en' ? '?lang=en' : ''}">${esc(t.search)}</a></p>`
    : `<p class="why">${esc(t.why)}</p>
       ${foundingLine(t, founding)}
       <p><a class="btn" href="${esc(claimUrl(listing, { token, lang: l }))}">${esc(t.cta)}</a></p>
       <p class="fine">${esc(t.free)} ${esc(PRICE[l])}</p>
       <p><a class="ghostlink" href="/${l === 'en' ? '?lang=en' : ''}">${esc(t.search)}</a></p>`;

  return `<!doctype html>
<html lang="${l === 'en' ? 'en' : 'fr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${metaHead(listing, l)}
<link rel="icon" href="/icons/icon-192.png">
<style>
:root{--teal:#0f7c7b;--ink:#12211f;--muted:#5b6b69;--line:#e2e8e7}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f6f8f8}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:#fff;border-bottom:1px solid var(--line)}
header a{color:var(--teal);text-decoration:none;font-weight:600}
main{max-width:640px;margin:0 auto;padding:22px 18px 40px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px}
.badge{display:inline-block;background:#fff5e6;color:#8a5a00;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600}
h1{font-size:26px;margin:14px 0 6px;line-height:1.2}
p{line-height:1.55}
.lede{color:var(--muted)}
.row{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:15px}
.k{color:var(--muted);min-width:120px}
.v{font-weight:600}
.btn{display:inline-block;background:var(--teal);color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700}
.btn.ghost{background:#fff;color:var(--teal);border:1px solid var(--teal)}
.why{background:#f0f7f7;border-radius:12px;padding:12px 14px}
.founding{background:#fff5e6;border-radius:12px;padding:12px 14px;font-weight:600;color:#8a5a00}
.fine{font-size:13px;color:var(--muted)}
.ghostlink{color:var(--teal)}
footer{max-width:640px;margin:0 auto;padding:0 18px 40px;font-size:13px;color:var(--muted)}
footer a{color:var(--muted);margin-right:12px}
@media(max-width:420px){.btn{display:block;text-align:center}.k{min-width:92px}}
</style>
</head>
<body>
<header><a href="/">TrouvePro</a><a href="${esc(otherLang)}">${esc(t.other)}</a></header>
<main>
  <div class="card">
    ${listing.claimed ? '' : `<span class="badge">${esc(t.badge)}</span>`}
    <h1>${name}</h1>
    ${listing.claimed ? '' : `<p class="lede">${esc(t.lede)}</p>`}
    ${row(t.licence, esc(listing.rbq_licence))}
    ${row(t.city, esc(listing.city || ''))}
    ${row(t.trades, trades.join(', '))}
    ${action}
  </div>
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

module.exports = { render, claimUrl, isLicence, PRICE, foundingLine };
