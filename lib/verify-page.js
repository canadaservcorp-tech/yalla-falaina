// TrouvePro — free RBQ licence verifier: /verification.
//
// Server-rendered and public on purpose. A client about to hire a contractor wants one
// answer ("is this licence real and active?"), and a contractor searching their own name
// on Google lands on a page that shows their TrouvePro listing waiting to be claimed.
// Only what the RBQ register publishes about the licence is shown — never the holder's
// email, phone or address, which the register also carries.
const seo = require('./seo');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RBQ_OFFICIAL = 'https://www.rbq.gouv.qc.ca/services-en-ligne/registre-des-detenteurs-de-licence/';

const T = {
  fr: {
    h1: 'Vérifier une licence RBQ',
    lede: 'Entrez un numéro de licence RBQ ou le nom d’une entreprise. Gratuit, sans compte, données du registre public de la Régie du bâtiment du Québec.',
    ph: 'ex. 1104-8618-06 ou Émard Couvre-Planchers',
    submit: 'Vérifier',
    active: 'Licence active',
    inactive: 'Licence non active',
    statusLabel: 'Statut au registre',
    licence: 'Licence RBQ',
    type: 'Type de licence',
    city: 'Municipalité',
    region: 'Région',
    restricted: 'Licence assortie d’une restriction — informez-vous avant de signer.',
    categories: 'Catégories autorisées',
    none: 'Aucune licence trouvée pour cette recherche. Vérifiez le numéro, ou consultez le registre officiel.',
    official: 'Registre officiel de la RBQ',
    matches: 'Entreprises trouvées',
    onTrouvepro: 'Cette entreprise a une fiche sur TrouvePro',
    seeListing: 'Voir la fiche',
    claimYours: 'C’est votre entreprise ? Réclamez votre fiche gratuitement.',
    disclaimer: 'Données tirées du registre public des licences de la RBQ (licence ouverte du Québec), copiées ici et rafraîchies régulièrement. En cas de doute, le registre officiel de la RBQ prévaut.',
    search: 'Chercher un prestataire près de moi',
    other: 'English',
    faq: 'Questions fréquentes',
    terms: 'Conditions',
    privacy: 'Confidentialité',
  },
  en: {
    h1: 'Check an RBQ licence',
    lede: 'Enter an RBQ licence number or a business name. Free, no account, data from the public register of the Régie du bâtiment du Québec.',
    ph: 'e.g. 1104-8618-06 or Émard Couvre-Planchers',
    submit: 'Check',
    active: 'Licence active',
    inactive: 'Licence not active',
    statusLabel: 'Status in the register',
    licence: 'RBQ licence',
    type: 'Licence type',
    city: 'Municipality',
    region: 'Region',
    restricted: 'This licence carries a restriction — ask about it before signing.',
    categories: 'Authorised categories',
    none: 'No licence found for this search. Check the number, or look it up in the official register.',
    official: 'Official RBQ register',
    matches: 'Businesses found',
    onTrouvepro: 'This business has a listing on TrouvePro',
    seeListing: 'See the listing',
    claimYours: 'Is this your business? Claim your listing for free.',
    disclaimer: 'Data from the RBQ public licence register (Québec open licence), copied here and refreshed regularly. In case of doubt, the official RBQ register prevails.',
    search: 'Find a provider near me',
    other: 'Français',
    faq: 'FAQ',
    terms: 'Terms',
    privacy: 'Privacy',
  },
};

const isActive = status => /^actif|^active/i.test(String(status || ''));

function row(label, value) {
  return value ? `<div class="row"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
}

function licenceCard(t, hit, lang) {
  const ok = isActive(hit.status);
  const listing = hit.listing || null;
  const link = listing
    ? (listing.claimed
      ? `<p><a class="ghostlink" href="/fiche/${encodeURIComponent(listing.rbq_licence)}${lang === 'en' ? '?lang=en' : ''}">${esc(t.seeListing)}</a></p>`
      : `<p class="claim">${esc(t.claimYours)}<br><a class="btn" href="/fiche/${encodeURIComponent(listing.rbq_licence)}${lang === 'en' ? '?lang=en' : ''}">${esc(t.seeListing)}</a></p>`)
    : '';
  return `<div class="card result">
    <span class="badge ${ok ? 'ok' : 'no'}">${esc(ok ? t.active : t.inactive)}</span>
    <h2>${esc(hit.holder_name)}</h2>
    ${row(t.licence, hit.licence)}
    ${row(t.statusLabel, hit.status)}
    ${row(t.type, hit.licence_type)}
    ${row(t.city, hit.municipality)}
    ${row(t.region, hit.region)}
    ${row(t.categories, (hit.categories || []).join(', '))}
    ${hit.restricted ? `<p class="warn">${esc(t.restricted)}</p>` : ''}
    ${link}
  </div>`;
}

function matchList(t, hits, lang) {
  const items = hits.map(h => `<li><a href="/verification?q=${encodeURIComponent(h.licence)}${lang === 'en' ? '&lang=en' : ''}">`
    + `${esc(h.holder_name)}</a> <span class="fine">${esc(h.licence)}${h.municipality ? ' — ' + esc(h.municipality) : ''}</span></li>`).join('');
  return `<div class="card"><h2>${esc(t.matches)}</h2><ul class="hits">${items}</ul></div>`;
}

// result: { hit } for one licence, { matches } for a name search, {} for nothing found,
// or null when no search was submitted at all.
function render({ lang = 'fr', q = '', result = null } = {}) {
  const l = lang === 'en' ? 'en' : 'fr';
  const t = T[l];
  let body = '';
  if (result && result.hit) body = licenceCard(t, result.hit, l);
  else if (result && result.matches && result.matches.length) body = matchList(t, result.matches, l);
  else if (result) body = `<div class="card"><p>${esc(t.none)}</p>
    <p><a class="ghostlink" href="${RBQ_OFFICIAL}" rel="nofollow noopener" target="_blank">${esc(t.official)}</a></p></div>`;

  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${seo.head('/verification', l)}
${result ? '<meta name="robots" content="noindex,follow">' : ''}
<link rel="icon" href="/icons/icon-192.png">
<style>
:root{--teal:#0f7c7b;--ink:#12211f;--muted:#5b6b69;--line:#e2e8e7}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f6f8f8}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:#fff;border-bottom:1px solid var(--line)}
header a{color:var(--teal);text-decoration:none;font-weight:600}
main{max-width:640px;margin:0 auto;padding:22px 18px 40px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:16px}
h1{font-size:26px;margin:0 0 8px;line-height:1.2}
h2{font-size:20px;margin:12px 0 8px}
p{line-height:1.55}
.lede{color:var(--muted)}
form{display:flex;gap:10px;flex-wrap:wrap}
input{flex:1 1 240px;padding:13px 14px;border:1px solid var(--line);border-radius:12px;font-size:16px}
button{background:var(--teal);color:#fff;border:0;padding:13px 20px;border-radius:12px;font-weight:700;font-size:16px}
.badge{display:inline-block;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600}
.badge.ok{background:#e6f7f0;color:#0b6b45}
.badge.no{background:#fdeaea;color:#8a1c1c}
.row{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:15px}
.k{color:var(--muted);min-width:150px}
.v{font-weight:600}
.warn{background:#fdeaea;color:#8a1c1c;border-radius:12px;padding:12px 14px;font-weight:600}
.claim{background:#fff5e6;border-radius:12px;padding:12px 14px}
.btn{display:inline-block;background:var(--teal);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;margin-top:8px}
.ghostlink{color:var(--teal)}
.hits{padding-left:18px}
.hits li{margin:7px 0}
.fine{font-size:13px;color:var(--muted)}
footer{max-width:640px;margin:0 auto;padding:0 18px 40px;font-size:13px;color:var(--muted)}
footer a{color:var(--muted);margin-right:12px}
@media(max-width:420px){.k{min-width:112px}button{flex:1 1 100%}}
</style>
</head>
<body>
<header><a href="/">TrouvePro</a><a href="/verification${l === 'en' ? '' : '?lang=en'}">${esc(t.other)}</a></header>
<main>
  <div class="card">
    <h1>${esc(t.h1)}</h1>
    <p class="lede">${esc(t.lede)}</p>
    <form method="get" action="/verification">
      ${l === 'en' ? '<input type="hidden" name="lang" value="en">' : ''}
      <input name="q" value="${esc(q)}" placeholder="${esc(t.ph)}" maxlength="80" aria-label="${esc(t.h1)}">
      <button type="submit">${esc(t.submit)}</button>
    </form>
  </div>
  ${body}
  <p class="fine">${esc(t.disclaimer)}</p>
  <p><a class="ghostlink" href="/${l === 'en' ? '?lang=en' : ''}">${esc(t.search)}</a></p>
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

module.exports = { render, isActive, RBQ_OFFICIAL };
