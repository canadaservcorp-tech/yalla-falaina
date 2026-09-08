// TrouvePro — today's phone list: the prospects worth calling, nearest first.
//
// Usage: node scripts/call-list.js [count] [> list.csv]
//
// Cold email converts a few percent; a phone call to a contractor whose listing is already
// online converts far better, so this prints the contacts that have a phone number and have
// not claimed, unsubscribed or bounced — with the listing URL to read out loud.
//
// Anyone printed here is skipped tomorrow only if they claim; calling is not logged, so keep
// the file you generated to know where you stopped.
require('dotenv').config();
const supabase = require('../db');

const SITE = (process.env.PUBLIC_URL || 'https://www.mytrouvepro.net').replace(/\/$/, '');

// Closest first: the pitch is proximity, so a call is strongest where clients already search.
const HOME = ['Laval', 'Montréal', 'Montreal', 'Terrebonne', 'Repentigny', 'Longueuil'];
const rank = city => {
  const i = HOME.findIndex(h => (city || '').toLowerCase().startsWith(h.toLowerCase()));
  return i === -1 ? HOME.length : i;
};

const csv = v => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

async function run(count = 30) {
  const { data, error } = await supabase.from('outreach_sendable')
    .select('business_name, phone, city, trade, rbq_licence, lang, last_sent_at')
    .not('phone', 'is', null);
  if (error) throw error;

  const rows = (data || [])
    .filter(c => String(c.phone || '').replace(/\D/g, '').length >= 10)
    .sort((a, b) => rank(a.city) - rank(b.city)
      || String(a.business_name || '').localeCompare(String(b.business_name || '')))
    .slice(0, count);

  const out = [['entreprise', 'telephone', 'ville', 'metier', 'licence_rbq', 'sa_fiche', 'deja_courriel'].join(',')];
  for (const c of rows) {
    out.push([
      csv(c.business_name), csv(c.phone), csv(c.city), csv(c.trade || ''), csv(c.rbq_licence || ''),
      csv(c.rbq_licence ? `${SITE}/fiche/${encodeURIComponent(c.rbq_licence)}` : `${SITE}/?join=provider`),
      csv(c.last_sent_at ? 'oui' : 'non'),
    ].join(','));
  }
  return out.join('\n');
}

if (require.main === module) {
  const n = Math.min(Math.max(parseInt(process.argv[2], 10) || 30, 1), 200);
  run(n).then(t => { console.log(t); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { run };
