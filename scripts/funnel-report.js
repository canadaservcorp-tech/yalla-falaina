// TrouvePro — how many invited contractors actually became subscribers.
// Usage: node scripts/funnel-report.js [days]      (default 30)
require('dotenv').config();
const supabase = require('../db');
const { STEPS } = require('../lib/funnel');

async function run(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.from('claim_funnel')
    .select('step, source, user_id, rbq_licence').gte('created_at', since);
  if (error) throw error;
  const rows = data || [];
  const counts = {};
  for (const step of STEPS) {
    const of = rows.filter(r => r.step === step);
    // a contractor who reloads the page is one prospect, not two
    const keys = new Set(of.map(r => r.rbq_licence || 'u' + r.user_id));
    counts[step] = keys.size;
  }
  const bySource = {};
  rows.filter(r => r.step === 'landing').forEach(r => {
    const k = r.source || 'direct';
    bySource[k] = (bySource[k] || 0) + 1;
  });
  return { days, counts, landingsBySource: bySource };
}

if (require.main === module) {
  run(Number(process.argv[2]) || 30)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { run };
