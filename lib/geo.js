// Picks the language a first-time visitor sees, from where they are.
//
// A seeker in Cairo should land on an Arabic page without touching the
// language switcher, and Accept-Language alone cannot do that: the phones in
// this market are overwhelmingly shipped/kept in English, so the browser says
// `en` while the person reads Arabic. Country is the better signal here, so
// country decides and Accept-Language is only the fallback when the country is
// unknown (VPN, carrier range missing from the database, localhost).
//
// The visitor always wins over this guess: an explicit ?lang= and the stored
// `yf_lang` choice both take precedence (server.js, public/index.html).
const geoip = require('geoip-country');

// Country -> first-page language. Absent countries fall through to English.
const COUNTRY_LANG = {
  // Arabic-reading markets
  IQ: 'ar', EG: 'ar', LB: 'ar', SY: 'ar', JO: 'ar', PS: 'ar',
  YE: 'ar', SD: 'ar', LY: 'ar', MR: 'ar',
  // Maghreb: French is the working language of the immigration file there
  TN: 'fr', MA: 'fr', DZ: 'fr',
  // GCC: mixed-nationality workforces, English is the shared language
  SA: 'en', AE: 'en', KW: 'en', QA: 'en', BH: 'en', OM: 'en',
  // India: Hindi UI — a target market, not just a fallback
  IN: 'hi',
  // Turkey: a target market in its own right (work, study, and — per the
  // medical-treatment vertical — a real medical-travel destination)
  TR: 'tr',
};

// What the Basic price ($25 USD) looks like in the visitor's own currency —
// a display label only; PayPal/Stripe still charge USD. Approximate fixed
// rates on purpose: a price that wobbles with FX every day is worse than an
// honest approximate one.
const COUNTRY_PRICE = {
  AE: 'AED 92', SA: 'SAR 94', KW: 'KWD 7.7', QA: 'QAR 91', BH: 'BHD 9.4',
  OM: 'OMR 9.6', IN: '₹2,100',
  EG: 'EGP 1,220', JO: 'JOD 17.8', LB: 'USD 25',
  MA: 'MAD 250', DZ: 'DZD 3,300', TN: 'TND 78',
  CA: 'CAD 34', FR: '€23', DE: '€23', GB: '£20',
};

function priceLabel(req) {
  return COUNTRY_PRICE[country(req)] || 'USD 25';
}

// Edge/CDN country headers, in case the host ever fronts us with one. Railway
// does not send one today, hence the IP database below as the real mechanism.
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'x-geo-country'];

function headerCountry(req) {
  for (const h of COUNTRY_HEADERS) {
    const v = req.headers[h];
    if (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim())) return v.trim().toUpperCase();
  }
  return null;
}

// `app.set('trust proxy', 1)` already resolves req.ip through Railway's
// x-forwarded-for; IPv4-mapped IPv6 has to be unwrapped for the lookup.
function clientIp(req) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  return ip || null;
}

function country(req) {
  const fromHeader = headerCountry(req);
  if (fromHeader) return fromHeader;
  const ip = clientIp(req);
  if (!ip) return null;
  try {
    const row = geoip.lookup(ip);
    return (row && row.country) || null;
  } catch (e) {
    return null;
  }
}

// Highest-weighted ar/fr/en entry in Accept-Language, ignoring the rest.
function headerLang(req, langs) {
  const raw = req.headers['accept-language'];
  if (typeof raw !== 'string') return null;
  const ranked = raw.split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
      return { tag: tag.trim().toLowerCase().split('-')[0], q: q ? parseFloat(q.slice(2)) : 1 };
    })
    .filter(x => langs.includes(x.tag) && !Number.isNaN(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.length ? ranked[0].tag : null;
}

// Returns a supported language or null when nothing is known about the visitor.
function pickLang(req, langs) {
  const c = country(req);
  const byCountry = c ? COUNTRY_LANG[c] : null;
  if (byCountry && langs.includes(byCountry)) return byCountry;
  if (c) return langs.includes('en') ? 'en' : null;   // known country, no rule: English
  return headerLang(req, langs);
}

module.exports = { COUNTRY_LANG, COUNTRY_PRICE, country, pickLang, headerLang, clientIp, priceLabel };
