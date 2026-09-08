// Enforces the short retention window on uploaded documents (Sections 6.3/4.3):
// deletes the storage object and the document_uploads row once
// retention_expires_at has passed. The table existing is not the policy — this
// job is what makes the window real.
//   node scripts/document-retention.js
require('dotenv').config();
const supabase = require('../db');
const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';

async function run() {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase.from('document_uploads')
    .select('id, storage_path')
    .lte('retention_expires_at', now);
  if (error) throw error;

  let removed = 0;
  for (const r of rows || []) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([r.storage_path]);
    if (sErr) { console.error(`retention storage ${r.id}`, sErr.message); continue; }
    const { error: dErr } = await supabase.from('document_uploads').delete().eq('id', r.id);
    if (dErr) console.error(`retention row ${r.id}`, dErr.message); else removed++;
  }
  console.log(`document-retention: ${removed}/${(rows || []).length} expired upload(s) removed`);
  return removed;
}

if (require.main === module) run().catch(e => { console.error('document-retention failed', e); process.exit(1); });
module.exports = { run };
