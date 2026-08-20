// Import prospect emails into public.outreach_contacts for the future marketing agent.
// Usage: node scripts/import-outreach.js contacts.csv [source]
// CSV header (any order, extra columns ignored): email,business_name,rbq_licence,phone,city,lang,trade
// `trade` is the French trade label used by the invitation copy for prospects with no listing yet.
// Already-known emails are skipped, so the file can be re-imported safely.
require('dotenv').config();
const fs = require('fs');
const supabase = require('../db');

const FIELDS = ['email', 'business_name', 'rbq_licence', 'phone', 'city', 'lang', 'trade'];

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(line => {
    const out = []; let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(v => v.trim());
  });
  const header = rows.shift().map(h => h.toLowerCase());
  return rows.filter(r => r.some(v => v)).map(r => {
    const rec = {};
    header.forEach((h, i) => { if (FIELDS.includes(h) && r[i]) rec[h] = r[i]; });
    return rec;
  });
}

async function main() {
  const [file, source] = process.argv.slice(2);
  if (!file) throw new Error('usage: node scripts/import-outreach.js contacts.csv [source]');
  const records = parseCsv(fs.readFileSync(file, 'utf8'))
    .filter(r => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(r.email || ''))
    .map(r => ({ ...r, email: r.email.toLowerCase(), lang: r.lang === 'en' ? 'en' : 'fr', source: source || 'rbq_register' }));
  if (!records.length) throw new Error('no valid email rows found');

  let added = 0, skipped = 0;
  for (const rec of records) {
    const { error } = await supabase.from('outreach_contacts').insert(rec);
    if (!error) added++;
    else if (String(error.code) === '23505') skipped++;   // unique_violation: already on the list
    else throw error;
  }
  console.log(`outreach: ${added} added, ${skipped} already present, ${records.length} rows read`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
