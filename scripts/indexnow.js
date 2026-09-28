'use strict';
// One-shot IndexNow submission: node scripts/indexnow.js [PUBLIC_URL]
// Submits every indexable page to the Bing index (which ChatGPT/Copilot
// answer from). Run after deploys when pages change.
const { submit } = require('../lib/indexnow');

(async () => {
  const res = await submit({ publicUrl: process.argv[2] || process.env.PUBLIC_URL });
  console.log(`IndexNow: HTTP ${res.status}, submitted ${res.submitted} URLs`);
  if (res.body) console.log(res.body);
  process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
