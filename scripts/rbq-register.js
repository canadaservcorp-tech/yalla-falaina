// Match our RBQ seed listings against the RBQ open-data register and emit an outreach CSV.
// The register (CC-BY, updated daily) carries the licence holder's email, phone, municipality and
// real licence number, which is where the seed listings' contact data has to come from.
//   node scripts/rbq-register.js prospects.csv [--fix-licences]
// --fix-licences also rewrites providers.rbq_licence / city for unclaimed seeds, because the
// numbers the seed file was generated with do not match the register.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../db');

const SRC = 'https://www.donneesquebec.ca/recherche/dataset/755b45d6-7aee-46df-a216-748a0191c79f'
  + '/resource/5183fdd4-55b1-418c-8a7d-0a70058ed68d/download/rdl01_extractiondonneesouvertes.json';
const CACHE = path.join(require('os').tmpdir(), 'rbq-register.json');

// Legal-form suffixes and punctuation differ between the register and our display names.
const key = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(inc|ltee|ltd|limitee|enr|senc|cie|co)\b/g, '').replace(/[^a-z0-9]/g, '');

const csvCell = v => /[",\n]/.test(String(v || '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v || '');

async function register() {
  if (!fs.existsSync(CACHE)) {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(`RBQ register download failed: ${res.status}`);
    fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const holders = JSON.parse(fs.readFileSync(CACHE, 'utf8'))['Liste Licence'].map(r => r.Licence);
  const byName = new Map();
  for (const h of holders) {
    const k = key(h["Nom de l'intervenant"]);
    byName.set(k, byName.has(k) ? null : h);      // a duplicate name is not a safe match
  }
  return byName;
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node scripts/rbq-register.js prospects.csv [--fix-licences]');
  const fix = process.argv.includes('--fix-licences');

  const byName = await register();
  const { data: seeds, error } = await supabase.from('providers')
    .select('user_id, display_name, rbq_licence, city')
    .eq('source', 'rbq_seed').eq('claimed', false);
  if (error) throw new Error(error.message);

  const rows = [];
  const seen = new Set();
  let matched = 0, ambiguous = 0, fixed = 0;

  for (const s of seeds) {
    const h = byName.get(key(s.display_name));
    if (h === null) { ambiguous++; continue; }
    if (!h) continue;
    matched++;
    const licence = h['Numéro de licence'];
    const city = (h['Municipalité'] || '').replace(/\b\w/g, c => c.toUpperCase());
    const email = (h['Courriel'] || '').trim().toLowerCase();

    if (fix && (s.rbq_licence !== licence || s.city !== city)) {
      const { error: e } = await supabase.from('providers')
        .update({ rbq_licence: licence, city }).eq('user_id', s.user_id);
      if (e) throw new Error(e.message);
      fixed++;
    }
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !seen.has(email)) {
      seen.add(email);
      rows.push([email, s.display_name, licence, (h['Numéro de téléphone'] || '').trim(), city, 'fr']);
    }
  }

  fs.writeFileSync(out, ['email,business_name,rbq_licence,phone,city,lang']
    .concat(rows.map(r => r.map(csvCell).join(','))).join('\n') + '\n');
  console.log(`seeds ${seeds.length}, matched ${matched}, ambiguous ${ambiguous}, `
    + `contacts ${rows.length}${fix ? `, corrected ${fixed}` : ''} -> ${out}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
