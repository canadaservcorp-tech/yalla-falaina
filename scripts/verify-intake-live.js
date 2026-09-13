// Live-model verification for the ---PROFILE--- intake contract.
//
// WHY THIS EXISTS: test/concierge.test.js asserts two things well — the exact
// wording sent to the model (upstream.body.system), and that extraction/
// persistence behaves correctly given a SCRIPTED, canned model reply. Neither
// can ever prove the real model actually follows the contract when talking
// freely — that's exactly the gap live testing found twice already (the
// model skipping the block on the confirmation turn, and naming sectors as
// "examples" despite the rule). This script closes that gap: it runs a real,
// adaptive, multi-turn intake conversation against the live Anthropic API —
// the exact same Express route, same intakeInstructions, same
// PROFILE_BLOCK_RE as production — and checks the properties that must hold
// for the contract to actually work, not just to read correctly.
//
// This is NOT part of `npm test`: it needs a real ANTHROPIC_API_KEY, it
// spends real (small) money on real tokens, and it talks to a
// non-deterministic model, so it is not a repeatable CI gate — it's a
// spot-check to run by hand after a prompt change, before trusting it in
// production. A single run is roughly 10-14 real messages (one per missing
// Section 10 field, plus a final confirmation) — measured empirically
// against a scripted fake model before this was ever pointed at the real API.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/verify-intake-live.js
//    or: npm run verify:intake-live   (reads ANTHROPIC_API_KEY from .env)
require('dotenv').config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required — this script makes real, billed calls to the live model.');
  console.error('Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/verify-intake-live.js');
  process.exit(1);
}

// Reuses the exact same Express app + Supabase mock the unit tests boot
// (test/helpers/appHarness.js) — same routes, same middleware, same
// intakeInstructions/PROFILE_BLOCK_RE as production. The one thing this
// script does differently from every unit test is leave global.fetch's real
// implementation in place for calls to api.anthropic.com, so the model reply
// is genuine, not canned.
const { getApp, actor, auth } = require('../test/helpers/appHarness');
// PROFILE_BLOCK_RE is required lazily, inside main() after getApp() has run
// (below) — NOT here at module top level. appHarness's mock-db swap only
// happens inside getApp(), by injecting a fake module into require.cache
// BEFORE server.js (and therefore routes/concierge.js) is required for the
// first time. Requiring routes/concierge here, before that swap runs, would
// make its own top-level `require('../db')` load the REAL Supabase client
// with no SUPABASE_URL set — a hard crash unrelated to anything this script
// is trying to check.
let PROFILE_BLOCK_RE;

const MAX_ROUNDS = 14;                 // safety cap — a real stuck/looping model must not run forever or spend unbounded tokens
const realFetch = globalThis.fetch;
let lastUpstream = null;               // { requestSystem, rawReplyText, status } for the most recent model call

globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) return realFetch(url, opts);
  const res = await realFetch(url, opts);
  // .clone() so our own read doesn't consume the body routes/concierge.js's
  // own ask() still needs to read via res.json() right after this returns.
  const raw = await res.clone().text();
  let rawReplyText = '';
  try {
    const parsed = JSON.parse(raw);
    rawReplyText = (parsed.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch { /* non-200 or malformed body — rawReplyText stays '', reported via status below */ }
  lastUpstream = { requestSystem: JSON.parse(opts.body).system, rawReplyText, status: res.status };
  return res;
};

// What the scripted seeker says the FIRST time each field is still missing.
// The loop below picks whichever the model hasn't collected yet, in whatever
// order the model actually asks — real models don't ask in a fixed order,
// so this must adapt to `missing` each round rather than following a script.
const REVEAL = {
  preferred_language: 'English is fine for this chat, thank you.',
  preferred_country: 'I would like to work in Canada.',
  sector_or_role_type: 'I am looking for hospitality or customer service work.',
  work_history: 'I worked as a hotel receptionist for three years at a hotel in Beirut.',
  education: 'I finished high school and have no further formal education.',
  certifications: 'I do not have any professional certifications.',
  languages: 'I speak Arabic natively and English fluently.',
  has_passport: 'Yes, I have a valid passport.',
  has_visa: 'No, I do not have a visa yet.',
  has_legal_residency_current_country: 'No, I do not have legal residency where I currently live.',
  has_family_or_host_abroad: 'Yes, I have family already living in Canada.',
};

// Common sector/role words the contract forbids the MODEL from offering as
// examples during intake (the seeker's own words are always fine — this list
// is only ever checked against the model's prose, and only for the rounds
// BEFORE the seeker has revealed their own sector/role, see below).
const SECTOR_WORDS = [
  'construction', 'hospitality', 'driver', 'security guard', 'cook', 'chef', 'cleaner',
  'cleaning', 'nurse', 'nursing', 'warehouse', 'factory', 'agriculture', 'farm', 'farming',
  'retail', 'delivery', 'nanny', 'babysit', 'welding', 'plumb', 'electrician', 'mechanic',
  'receptionist', 'housekeeping', 'caregiver',
];

// Postgres upsert semantics (lib/profileWrite.js): a column not present in a
// given patch is left exactly as it was. The mock DB (test/helpers/mockDb.js)
// has no such memory — __set() is a flat, static return value — so this
// script tracks the running "as Postgres would have it" rows itself and
// re-__set()s them before every round, merging in whatever the previous
// round's real writes contained. Without this, `missing` would never shrink
// across rounds because the mock would forget everything the round before.
let profileRow = { preferred_language: null, preferred_country: null, sector: null, role_type: null };
let seekerRow = {
  work_history: null, education: null, certifications: null, languages: null,
  has_passport: null, has_visa: null, has_legal_residency_current_country: null,
  has_family_or_host_abroad: null, is_complete: false, confirmed_by_user: false,
};

function applyWritesToTrackedRows(h) {
  for (const w of h.mock.__writes('profiles', 'upsert')) Object.assign(profileRow, w.payload);
  for (const w of h.mock.__writes('seeker_profiles', 'upsert')) Object.assign(seekerRow, w.payload);
}

async function main() {
  const h = getApp();
  PROFILE_BLOCK_RE = require('../routes/concierge').PROFILE_BLOCK_RE;
  const token = auth(actor(h, { id: 7001, role: 'seeker' }));
  h.mock.__setOp('concierge_conversations', 'insert', { data: { id: 'live-verify-conv' }, error: null });

  const history = [];
  let conversationId = null;
  let round = 0;
  let message = "Hi, I'm hoping to find work abroad and could use some guidance.";
  let sectorRevealedAtRound = null;
  const violations = [];             // { round, kind, detail } — collected, not thrown, so one bad round doesn't hide the rest of the transcript
  let confirmedAtRound = null;
  let finalIsComplete = false;

  console.log(`Live intake verification — up to ${MAX_ROUNDS} real model turns, real tokens spent.\n`);

  while (round < MAX_ROUNDS) {
    round++;
    // rate limits (lib/security.js: 8/min per IP) exist to protect a real
    // deployment from one visitor's burst, which is not what this script is
    // testing — a fresh synthetic IP per round sidesteps it the same way
    // test/concierge.test.js's own ask() helper does for unrelated tests.
    h.mock.__set('concierge_conversations', { data: { id: 'live-verify-conv' }, error: null });
    h.mock.__set('profiles', { data: { ...profileRow, id: 7001 }, error: null });
    h.mock.__set('seeker_profiles', { data: { ...seekerRow, id: 'live-verify-seeker' }, error: null });
    h.mock.__set('users', { data: { id: 7001, role: 'seeker', banned: false, email_verified: true, subscription_status: 'inactive', subscription_tier: 'none', free_preview_used: 0 }, error: null });

    const res = await fetch(h.base + '/api/concierge', {
      method: 'POST',
      // `token` here is already the full headers object auth() builds
      // (Authorization + Content-Type) — same shape test/concierge.test.js's
      // own caller()/ask() pair uses. X-Forwarded-For gets a fresh synthetic
      // IP per round (mod 250, same trick concierge.test.js's own ask()
      // helper uses) so the 8/min concierge rate limit — irrelevant to what
      // this script verifies — never trips a real multi-round run, and so
      // the octet stays a valid 0-255 no matter how many rounds run.
      headers: { 'X-Forwarded-For': `10.44.${round % 250}.${round % 250}`, ...token },
      body: JSON.stringify({ message, history, conversationId }),
    });
    if (res.status !== 200) {
      violations.push({ round, kind: 'http', detail: `/api/concierge returned ${res.status}` });
      console.log(`Round ${round}: HTTP ${res.status} — stopping.`);
      break;
    }
    const body = await res.json();
    conversationId = body.conversationId || conversationId;
    applyWritesToTrackedRows(h);

    const raw = lastUpstream ? lastUpstream.rawReplyText : '';
    const blockMatch = raw.match(PROFILE_BLOCK_RE);
    console.log(`--- Round ${round} ---`);
    console.log(`Seeker: ${message}`);
    console.log(`Model (visible): ${body.reply}`);
    console.log(`Block present: ${blockMatch ? 'yes' : 'NO'} | missing so far: ${body.missing.join(', ') || '(none)'}`);

    if (!blockMatch) {
      violations.push({ round, kind: 'missing-block', detail: 'no ---PROFILE---...---END--- block in the raw model reply' });
    } else {
      let parsed = null;
      try { parsed = JSON.parse(blockMatch[1]); } catch (e) {
        violations.push({ round, kind: 'malformed-json', detail: e.message });
      }
      if (parsed && 'confirmed_by_user' in parsed) {
        if (parsed.confirmed_by_user === true) {
          if (confirmedAtRound === null) confirmedAtRound = round;
        } else if (parsed.confirmed_by_user === false) {
          // The contract explicitly asks the model to OMIT this rather than
          // ever send false, precisely so a later restatement can't revert a
          // real confirmation — sending false at all is itself a deviation.
          violations.push({ round, kind: 'sent-false-confirmation', detail: 'block included "confirmed_by_user": false instead of omitting the field' });
        }
      }
      // Sector/role-naming check: only meaningful BEFORE the seeker has
      // revealed their own answer — once they have, the model restating it
      // back in a summary is REQUIRED by the contract, not a violation.
      if (sectorRevealedAtRound === null) {
        const prose = raw.replace(PROFILE_BLOCK_RE, '').toLowerCase();
        const hit = SECTOR_WORDS.find(w => prose.includes(w));
        if (hit) violations.push({ round, kind: 'named-sector-example', detail: `model's prose mentioned "${hit}" before the seeker had stated a sector/role` });
      }
    }

    history.push({ role: 'user', content: message }, { role: 'assistant', content: body.reply });
    finalIsComplete = body.isComplete;
    if (body.isComplete) { console.log(`\nIntake completed after ${round} round(s).`); break; }

    // Pick the next thing to reveal: prefer confirmation once it's the ONLY
    // thing left, otherwise whatever the model still lists as missing that
    // this script knows how to answer.
    if (body.missing.length === 1 && body.missing[0] === 'confirmed_by_user') {
      message = 'Yes, that all sounds correct — I confirm it.';
    } else {
      const next = body.missing.find(f => f !== 'confirmed_by_user' && REVEAL[f]);
      if (!next) {
        violations.push({ round, kind: 'unrecognized-missing-field', detail: `missing=${body.missing.join(',')} has no scripted reveal for this run` });
        break;
      }
      if (next === 'sector_or_role_type' && sectorRevealedAtRound === null) sectorRevealedAtRound = round + 1;
      message = REVEAL[next];
    }
  }

  if (!finalIsComplete) violations.push({ round, kind: 'never-completed', detail: `intake did not reach is_complete within ${MAX_ROUNDS} rounds` });
  if (confirmedAtRound === null && finalIsComplete) violations.push({ round, kind: 'no-explicit-confirmation-seen', detail: 'is_complete flipped true but no round\'s block ever carried confirmed_by_user:true' });

  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  console.log(`Rounds run: ${round}/${MAX_ROUNDS}`);
  console.log(`Reached is_complete: ${finalIsComplete ? 'yes' : 'NO'}`);
  console.log(`Explicit confirmation seen at round: ${confirmedAtRound ?? '(never)'}`);
  console.log(`Fields tracked at end: profiles=${JSON.stringify(profileRow)}`);
  console.log(`                       seeker_profiles=${JSON.stringify(seekerRow)}`);
  if (violations.length === 0) {
    console.log('\nNo contract violations found. ✅');
  } else {
    console.log(`\n${violations.length} contract violation(s) found:`);
    for (const v of violations) console.log(`  round ${v.round} [${v.kind}]: ${v.detail}`);
  }

  globalThis.fetch = realFetch;
  await h.stop();
  process.exit(violations.length === 0 ? 0 : 1);
}

main().catch(e => { console.error('verify-intake-live crashed:', e); process.exit(1); });
