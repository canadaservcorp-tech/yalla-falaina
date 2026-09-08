// Load the RBQ open-data licence register into public.rbq_licences (the verifier's source).
//   node scripts/import-rbq-register.js [--limit N]
// The download is ~85 MB of JSON and the register is refreshed daily by the RBQ, so this is
// meant to be re-run periodically; rows are upserted on the licence number.
// The register also publishes each holder's email, phone and street address: those columns are
// dropped here on purpose, because the verifier is public.
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('../db');

const SRC = 'https://www.donneesquebec.ca/recherche/dataset/755b45d6-7aee-46df-a216-748a0191c79f'
  + '/resource/5183fdd4-55b1-418c-8a7d-0a70058ed68d/download/rdl01_extractiondonneesouvertes.json';
const CACHE = path.join(os.tmpdir(), 'rbq-register.json');
const BATCH = 500;

const title = s => String(s || '').toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase());

function row(h) {
  const licence = String(h['Numéro de licence'] || '').trim();
  if (!licence) return null;
  const cats = (h['Catégories et sous-catégories'] || [])
    .map(c => [c.Categorie, c['Sous-catégories']].filter(Boolean).join(' '))
    .filter(Boolean);
  return {
    licence,
    holder_name: title(h["Nom de l'intervenant"]) || licence,
    status: h['Statut de la licence'] || null,
    licence_type: h['Type de licence'] || null,
    municipality: title(h['Municipalité']) || null,
    region: h['Région administrative'] || null,
    restricted: /^oui$/i.test(String(h['Restriction'] || '')),
    categories: cats,
  };
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;

  if (!fs.existsSync(CACHE)) {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(`RBQ register download failed: ${res.status}`);
    fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const holders = JSON.parse(fs.readFileSync(CACHE, 'utf8'))['Liste Licence'].map(r => r.Licence);
  const seen = new Set();
  const rows = [];
  for (const h of holders) {
    const r = row(h);
    if (!r || seen.has(r.licence)) continue;      // the extract repeats a licence per category set
    seen.add(r.licence);
    rows.push(r);
    if (limit && rows.length >= limit) break;
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('rbq_licences').upsert(chunk, { onConflict: 'licence' });
    if (error) throw new Error(error.message);
    done += chunk.length;
    if (done % 5000 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`loaded ${done} licences`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
