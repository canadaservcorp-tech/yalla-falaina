// Yalla Nsafer AI concierge — "Your Assistant to Travel". The tested guardrail
// system prompt and the code-decides-the-candidate-set matching pattern come
// from the handoff prototype (lib/yf/*); this route adds what the prototype
// lacked: auth, full durable logging (Section 6.2 — the log is the platform's
// protection if a bad-advice claim ever surfaces), and the fair-use quota +
// subscription gate from Section 4.3.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const usage = require('../lib/usage');
const access = require('../lib/access');
const { retrieveJobs } = require('../lib/yf/matching');
const { retrieveStudyOpportunities } = require('../lib/yf/studyMatching');
const { retrieveCommunityGroups } = require('../lib/yf/communityMatching');
const { retrieveAccommodationListings } = require('../lib/yf/accommodationMatching');
const { retrieveTrustedPartners } = require('../lib/yf/partnerMatching');
const { retrieveCountryRisks } = require('../lib/yf/riskMatching');
const { retrieveCostOfLiving } = require('../lib/yf/costOfLivingMatching');
const { retrieveMedicalIntake, retrieveMedicalProviders } = require('../lib/yf/medicalMatching');
const flightSearch = require('../lib/flightSearch');
const hotelSearch = require('../lib/hotelSearch');
const { buildSystemPrompt } = require('../lib/yf/systemPrompt');
const { computeCompleteness } = require('../lib/profileCompleteness');
const { applyIntake } = require('../lib/profileWrite');
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TURNS = 20;                    // conversation length sent back to the model
const MAX_CHARS = 1500;                  // per message — seekers paste longer context
const TIMEOUT_MS = 30000;                // never hold a request open on a stalled upstream
// Idea-configuration doc: "free messages before the paywall — meant to build
// interest and push the person to subscribe." A lifetime count
// (users.free_preview_used), not a daily one — this is a conversion funnel,
// not the fair-use quota (lib/usage.js) which still applies underneath it.
// Was a hardcoded 3; Hicham's own call was that 3 cuts the teaser off too
// early to build real interest, and wanting to keep tuning this without a
// code change/redeploy each time is reasonable on its own — so it's an env
// var now, defaulting to a longer 8. Set FREE_PREVIEW_LIMIT in Railway to
// change it without touching code.
// A function, not a top-level const, for the same reason as paywallOn()
// right below: read per request so an env change takes effect without a
// reload, rather than being frozen in at first `require('./concierge')`.
const freePreviewLimit = () => Number(process.env.FREE_PREVIEW_LIMIT) > 0 ? Number(process.env.FREE_PREVIEW_LIMIT) : 8;
// Read per request so the gate can be flipped by env change without a reload.
const paywallOn = () => process.env.PAYWALL_ENFORCED === 'true';

// In intake mode the model ends its reply with a ---PROFILE--- fenced JSON
// block holding whatever intake answers it extracted from the conversation.
// The server strips it before the seeker sees it and persists it through
// lib/profileWrite.js's shared validation — model output never writes directly.
const PROFILE_BLOCK_RE = /---PROFILE---\s*(\{[\s\S]*?\})\s*---END---/;

// A live-model retest found that tightening intakeInstructions' wording
// alone (below) did not hold: the model still claimed it had checked the
// job feed, and still called the profile complete while the platform's own
// state said isComplete:false. Prompt wording is a request, not an
// enforcement mechanism — a non-compliant reply from a probabilistic model
// can still ship. These patterns (and scrubFalseClaims below, applied to
// every intake-mode reply regardless of what the model's own text says)
// are the actual enforcement layer: the seeker never sees either kind of
// claim while the profile is genuinely still incomplete, whether or not the
// model followed the contract. Also exported (with PROFILE_BLOCK_RE below)
// so scripts/verify-intake-live.js checks the SAME patterns this route
// enforces with, instead of a hand-duplicated copy that could drift.
// Negative lookbehinds exclude the honest, forward-looking phrasing the
// contract itself asks for ("once your profile is complete, I can look at
// the job feed") — only a present-tense claim about the CURRENT state is a
// violation; a conditional about a future state is exactly correct and must
// survive the scrub.
const FALSE_JOB_FEED_CLAIM_PATTERNS = [
  { re: /\bi(?:'ve| have)? (?:checked|looked at|searched|reviewed) (?:the )?(?:job|feed|listing)/i, label: 'claimed to have checked/looked at/searched the job feed or a listing' },
  { re: /\b(?:no|there are no) (?:jobs|openings|positions|listings) (?:available|found|yet)/i, label: 'claimed a specific job-feed outcome (that none are available)' },
  { re: /\bi(?:'ve| have)? found (?:some|several|a few )?(?:jobs|openings|positions|matches)/i, label: 'claimed to have found jobs' },
];
const FALSE_COMPLETION_CLAIM_PATTERNS = [
  { re: /(?<!\b(?:once|when|after|before)\s+your\s+)\bprofile is (?:now |fully )?complete\b/i, label: 'claimed the profile is complete' },
  { re: /\byou'?re all set\b/i, label: 'claimed the seeker is all set' },
  { re: /(?<!\b(?:once|when|after|before)\s+)\byour profile is (?:done|ready)\b/i, label: 'claimed the profile is done/ready' },
];
// routes/cv.js's CV export exists now (PDF/Word) -- the model can correctly
// tell a seeker it's available, but it has no way to actually attach, send,
// or generate the file inside this chat; only a real GET to that endpoint
// does. Same enforcement principle as the two pattern sets above: stripped
// unconditionally (see the unconditional scrubFalseCvClaims call below, not
// gated by isComplete the way scrubFalseClaims is -- a CV claim is just as
// false on a matching-mode turn as an intake one).
const FALSE_CV_CLAIM_PATTERNS = [
  { re: /\bi(?:'ve| have)? (?:created|generated|prepared|built|attached|sent) your (?:cv|resum[ée])/i, label: 'claimed to have created/attached/sent a CV file it cannot actually produce inside chat' },
  { re: /\byour (?:cv|resum[ée]) is (?:ready|attached|done)\b(?!\s+to\s+download)/i, label: 'claimed a CV file is ready/attached without pointing to the real download' },
];

// Splits after ., !, or ? followed by whitespace or end of string, keeping
// the punctuation and trailing whitespace attached to each piece so
// re-joining (kept.join('') below) always reproduces the original text
// exactly when nothing is stripped.
//
// A live-test finding ("scrub text mutilation"): the previous pattern was
// `/[^.!?]+[.!?]*(?:\s+|$)/g`, which REQUIRES at least one non-terminal
// character before any terminal punctuation can match. A run of terminal
// punctuation with nothing non-terminal immediately before it in the same
// match attempt — a numbered-list marker at the very start of the reply
// ("1. First point"), a decimal number ("3.5 kg"), or an ellipsis opening a
// sentence ("...actually, yes") — can't be captured by any match at all, so
// `String.match` silently DROPS those characters entirely: "3.5 kg is
// enough." reassembled as just "5 kg is enough." with "3." gone, with no
// error, no log line, nothing to catch it except close reading. This only
// showed up in the visible reply on a turn where the scrub actually
// stripped a different sentence (kept.join(...) is only used at all when
// something was stripped — see scrubFalseClaims below), which is why it
// read as the scrub "mutilating" otherwise-correct text.
//
// Fixed by allowing the non-terminal run to be EMPTY before terminal
// punctuation (`[^.!?]*` instead of `+`), with a second alternative for a
// trailing remainder that never reaches terminal punctuation at all (plain
// `+` there, since `*` would match an empty string forever and the regex
// engine would never advance). Every character in the input is now
// accounted for by exactly one alternative or the other — verified in
// test/concierge.test.js against numbered lists, decimals, and leading
// ellipses, not just re-checked against this file's own reasoning.
function splitSentences(text) {
  return text.match(/[^.!?]*[.!?]+\s*|[^.!?]+$/g) || [text];
}

// Server-side enforcement, not just prompt wording: strips any sentence that
// claims feed access (job retrieval never runs during intake, whatever this
// reply says) or, while the profile is still genuinely incomplete, claims
// completion — so a non-compliant reply can't lie to the seeker even when it
// ignores intakeInstructions entirely. `nowComplete` gates the completion
// patterns only (the same words are correct once it's actually true); the
// job-feed patterns are stripped unconditionally, since job retrieval never
// ran this turn regardless of what nowComplete becomes. Falls back to a
// plain continuation line in the (expected to be rare) case where the whole
// reply was nothing but a false claim, same "never send an empty reply"
// principle as the block-extraction fallbacks below.
function scrubFalseClaims(reply, nowComplete) {
  let stripped = false;
  const kept = splitSentences(reply).filter(sentence => {
    const hit = FALSE_JOB_FEED_CLAIM_PATTERNS.some(p => p.re.test(sentence))
      || (!nowComplete && FALSE_COMPLETION_CLAIM_PATTERNS.some(p => p.re.test(sentence)));
    if (hit) { stripped = true; console.error('concierge intake false-claim sentence stripped', JSON.stringify(sentence.trim())); }
    return !hit;
  });
  if (!stripped) return reply;
  return kept.join('').trim() || "Let's continue with the next question.";
}

// Unconditional counterpart to scrubFalseClaims above, run on EVERY reply
// (matching-mode turns included, not just intake) -- a false CV-readiness
// claim is exactly as false once the profile is complete as during intake,
// since the model still has no way to attach or send a file either way.
function scrubFalseCvClaims(reply) {
  let stripped = false;
  const kept = splitSentences(reply).filter(sentence => {
    const hit = FALSE_CV_CLAIM_PATTERNS.some(p => p.re.test(sentence));
    if (hit) { stripped = true; console.error('concierge false CV-claim sentence stripped', JSON.stringify(sentence.trim())); }
    return !hit;
  });
  if (!stripped) return reply;
  return kept.join('').trim() || "Let's continue.";
}

// Feeds what the platform already knows about this seeker into every turn —
// complete or still in intake — so the concierge doesn't ask a returning
// seeker to repeat themselves and can tailor matching/advice to their actual
// situation (Section 4.3). Appended in routes/concierge.js rather than
// touching lib/yf/systemPrompt.js itself, same pattern as intakeInstructions
// below. Only fields with an actual answer are listed — computeCompleteness's
// "answered, not truthy" rule means an explicit false/[] is real information
// (e.g. "no passport" changes what's worth discussing), so it's included too.
function profileContext({ profile, seekerProfile }) {
  const lines = [];
  const add = (label, v) => { if (v !== undefined && v !== null) lines.push(`${label}: ${Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v}`); };
  add('Preferred language', profile?.preferred_language);
  add('Preferred destination country', profile?.preferred_country);
  add('Preferred destination city', profile?.preferred_city);
  add('Sector', profile?.sector);
  add('Role type', profile?.role_type);
  add('Seeking to study abroad', profile?.seeking_study);
  add('Target degree level', profile?.target_degree_level);
  add('Target field of study', profile?.target_field_of_study);
  if (seekerProfile) {
    if (seekerProfile.work_history?.length) add('Work history', seekerProfile.work_history);
    if (seekerProfile.education?.length) add('Education', seekerProfile.education);
    if (seekerProfile.certifications?.length) add('Certifications', seekerProfile.certifications);
    if (seekerProfile.languages?.length) add('Languages spoken', seekerProfile.languages);
    add('Has passport', seekerProfile.has_passport);
    add('Has visa', seekerProfile.has_visa);
    add('Has legal residency in current country', seekerProfile.has_legal_residency_current_country);
    add('Has family or host abroad', seekerProfile.has_family_or_host_abroad);
  }
  if (!lines.length) return '';
  return ['SEEKER PROFILE (already collected — do not ask the seeker to repeat any of this; ' +
    'a "no"/false answer is a real, already-given answer, not a gap):', ...lines].join('\n');
}

// Free-preview mode: the seeker sees that real matches exist — enough to
// feel it's worth paying for — but never the specifics that would let them
// act without subscribing (the application link, and the exact requirements
// text, which is often specific enough to find/apply to the posting
// directly). This is enforced by NOT PUTTING the real fields in either the
// model's JOB_CONTEXT or the client response, not by a prompt instruction
// the model could be talked out of — same "tease, don't hand over the
// payoff" mechanic as a dating app blurring a photo until you match.
// employer was already never shown to the model or the client (see
// formatJobsForPrompt/public/index.html) — nothing new to strip there.
function teaserJob(j) {
  return {
    id: j.id, title: j.title, country: j.country, city: j.city, category: j.category,
    track: j.track, salaryNote: j.salaryNote || null, sourceType: j.sourceType,
    requirements: '[subscribe to see the full requirements]',
    sourceLabel: '[subscribe to see the source and how to apply]',
    url: '', honestyFlags: [], teaser: true,
  };
}

// A live-test finding ("seed jobs presented as real"): lib/jobsIngest.js's
// fetchSeed() imports the handoff prototype's 12-listing mock feed so the
// concierge is testable end-to-end before a licensed provider is approved
// (JOB_API_PROVIDER=seed) — but until this fix, every one of those fixture
// rows that wasn't already the deliberately-informal one got
// source_type: 'licensed_api', the SAME label real Adzuna/Jooble rows get.
// formatJobsForPrompt's guardrail (lib/yf/systemPrompt.js) only adds a
// lower-confidence disclosure for 'informal_unverified' — everything else
// reads to the model, and therefore to the seeker, as a real, currently-open,
// licensed opportunity. Fixture data has a made-up employer, contact path,
// and requirements text; presenting it as real to someone actually trying to
// travel for work is exactly the "fabricate an opening" harm Section 6.1/6.2
// and this file's own JOB_CONTEXT rule exist to prevent — and it doesn't stop
// being a live risk just because it's demo data instead of the model
// inventing it outright.
// Fixed at the same layer as teaserJob above and for the same reason: data
// minimization the model can't talk its way around, not a prompt request it
// could ignore (see scrubFalseClaims' own comment on why prompt wording
// alone doesn't hold). Applied unconditionally, subscribed or not — a paying
// seeker has exactly as much right to not be told fake data is real as a
// free-preview one.
function demoJob(j) {
  return {
    id: j.id, title: j.title, country: j.country, city: j.city, category: j.category,
    track: j.track, salaryNote: null, sourceType: j.sourceType,
    employer: '[internal placeholder data — not a real employer]',
    requirements: '[internal placeholder data — this is not a real, currently open opportunity; the live job feed is not configured yet]',
    sourceLabel: '[internal test data — no licensed feed configured yet]',
    url: '', honestyFlags: [], demo: true,
  };
}
const previewInstructions = (remaining) => [
  'FREE PREVIEW MODE — this seeker has not subscribed yet. The idea-configuration',
  `doc gives every seeker their first ${freePreviewLimit()} concierge replies free, to build genuine`,
  'excitement before asking them to subscribe.',
  'JOB_CONTEXT above has been redacted on purpose: the application link and the',
  'exact requirements text are hidden until they subscribe.',
  'You MAY tell them real matches exist, by title/country/city/category and a',
  'general pay range, to build excitement — the same way a dating app shows you',
  'a name and a photo before you match. Be warm and specific about WHAT exists.',
  'You must NOT invent, guess, or paraphrase-around the hidden requirements or a',
  'contact/application path — say plainly that subscribing unlocks the full',
  'listing and exactly how to apply. Never imply the details are unavailable or',
  'the listing is somehow incomplete — only that unlocking it needs a subscription.',
  'The same "tease, don\'t hand over the payoff" rule applies to their CV: you may',
  'tell them, once you know enough about their background, that a polished CV is',
  'ready to be generated as a PDF or Word document — but the file itself, like the',
  'application link above, only unlocks once they subscribe.',
  `Free preview replies left after this one: ${remaining}.`,
].join('\n');

// Request-specific (depends on this seeker's actual subscription state), so
// this is appended here rather than folded into lib/yf/systemPrompt.js's
// general, request-independent prompt -- same reasoning as
// previewInstructions/intakeInstructions above and profileContext's own
// comment on the same pattern. Only ever appended when `active` is true.
const cvAvailableInstructions = [
  'CV EXPORT: this seeker has an active subscription. Once you and they have',
  'covered enough of their background (work history, education, or',
  'certifications), you may tell them their CV is ready to download as a PDF',
  'or Word document from the "Download my CV" button in the app. You still',
  'cannot attach, send, or generate the file yourself inside this chat --',
  'always point them to that button, never claim you already created,',
  'attached, or sent a CV file here.',
].join('\n');

// Rewritten after live testing found two contract failures: the model
// sometimes never emitted a ---PROFILE--- block at all (even on explicit
// confirmation, so intake could never complete), and it named job
// roles/sectors during intake despite the no-jobs rule. Two changes address
// each, plus a third (the block-first ordering) hardens against a failure
// mode neither report described but that the old contract was exposed to:
//
// 1. The block is now REQUIRED on every single intake reply, unconditionally
//    — not "after a turn where you learned something new," which asked the
//    model to make a judgment call about its own reply, and a live run
//    apparently judged wrong on the one turn (the confirmation) that
//    mattered most. There's no such judgment call left to get wrong.
// 2. It must always restate every field known so far (from SEEKER PROFILE
//    context above plus this conversation), not just fields "learned" this
//    turn — belt-and-suspenders against the model under- or over-scoping
//    what counts as new, and harmless to repeat since applyIntake's upsert
//    only touches columns actually present in the payload either way.
// 3. The block now goes FIRST, with the conversational reply after it —
//    the opposite of before. PROFILE_BLOCK_RE matches anywhere in the text,
//    so this doesn't change extraction, but it changes what a truncated
//    reply loses: at max_tokens (bumped below, but never unbounded), a cut
//    reply now loses trailing prose, not trailing profile data. Under the
//    old order, a verbose summary-then-confirm turn running past the token
//    budget could truncate the JSON block itself — malformed JSON (or a
//    missing ---END---) fails PROFILE_BLOCK_RE silently, which looks
//    identical from the outside to the model never emitting a block at all.
//
// A THIRD round of live-model verification (against the real API, via
// scripts/verify-intake-live.js) found two more failures, addressed below:
//
// 4. The seeker stated their sector/role twice and it never made it into the
//    block, so sector_or_role_type stayed missing forever and intake could
//    never complete. The old wording's only mention of sector/role was the
//    no-examples rule ("do not name specific sectors/roles as examples") —
//    plausible reading: the model over-applied that ban to recording the
//    seeker's OWN stated answer, not just to suggesting one. The new
//    paragraph below draws that line explicitly: the ban is about what the
//    model offers, never about withholding what the seeker already said.
// 5. The model asserted things it has no way to know during intake — that it
//    had checked the job feed, and that the profile was complete while the
//    platform's own state still showed missing fields. Nothing in the old
//    contract forbade either claim outright (the no-jobs rule bans
//    mentioning job CONTENT, not claims about having looked), so both are
//    now named explicitly, and completeness is pinned to the platform's own
//    Missing list rather than the model's own tally.
const intakeInstructions = (missing) => [
  'INTAKE MODE — the seeker\'s profile is incomplete (Section 10 required fields).',
  'Your only task: conversationally collect the missing fields below, in the seeker\'s language, a few questions at a time:',
  `  Missing: ${missing.join(', ')}`,
  'Field meanings: work_history = array of {employer, title, start_date, end_date, description};',
  'languages = array of {language, level}; preferred_language must be one of ar-LB, ar-SY, ar-EG, ar-AE, ar, fr, hi, en, tr;',
  'sector or role_type = what kind of work they seek; has_passport/has_visa/',
  'has_legal_residency_current_country/has_family_or_host_abroad = booleans (a "no" answer is still an answer);',
  'preferred_country = where they hope to work.',
  '',
  'NO JOBS DURING INTAKE, with no exceptions: do not mention, list, hint at, or recommend any job, employer,',
  'opportunity, or feed content, and do not name specific sectors/roles as examples or options either — e.g. never',
  '"are you looking for something like construction or hospitality?". Ask sector/role_type as a fully open question',
  '("what kind of work are you hoping to find?") and let the seeker\'s own words be the entire answer — an example',
  'you supply is a suggestion, not an open question, and this is intake, not matching.',
  'This rule is about what YOU suggest, never about what the seeker tells you: once the seeker states their own',
  'sector or role in their own words, recording that exact value in the block below is REQUIRED, not an exception',
  'to the no-examples rule. Leaving a field the seeker already answered out of the block, out of caution about',
  'naming a sector, is itself a contract violation.',
  'You have no access to the job feed or any listing during intake, and none is ever checked or retrieved before',
  'the profile is complete. Never claim to have checked, looked at, searched, or reviewed jobs or the feed, and',
  'never state or imply whether openings do or do not exist — you have no way to actually know that right now.',
  '',
  'REQUIRED ON EVERY REPLY, no exceptions, even if this turn taught you nothing new: start your reply with a',
  '---PROFILE--- block, then continue with your conversational reply to the seeker below it, like this:',
  '---PROFILE---',
  '{"<field>": <value>, ...}',
  '---END---',
  'Your conversational reply to the seeker goes here, after the block.',
  'The JSON must be strict (no comments, no trailing commas) and must restate EVERY field you know so far — from',
  'whatever the platform already told you this seeker answered, plus anything said in this conversation — not only',
  'what changed this turn.',
  'Omit a field entirely if you don\'t have a value for it yet; never guess or invent one.',
  'The Missing list above is the platform\'s own authoritative record of what is still absent, recomputed fresh',
  'every turn from what was actually persisted — not your own memory of the conversation. If you believe a field is',
  'already answered but it still appears there, ask about it again rather than assuming it was recorded; never tell',
  'the seeker their profile is complete, done, or ready yourself — that determination is the platform\'s alone, made',
  'only after you and the seeker both confirm together.',
  'When every field above is collected, summarize what you heard and ask the seeker to confirm. Do not include',
  '"confirmed_by_user" at all until they explicitly confirm — omit it, rather than sending false, so a later reply',
  'can never accidentally undo a real confirmation. Only once they explicitly confirm, add "confirmed_by_user": true',
  'to that reply\'s block.',
].join('\n');

// max_tokens raised from 1024: a verbose intake summary-then-confirm turn
// (restating every collected field, per intakeInstructions above, plus a
// friendly summary and confirmation ask) can plausibly need more than 1024
// tokens, and a cut-off reply fails PROFILE_BLOCK_RE the same way a missing
// block does — indistinguishable from the outside. Doesn't force longer
// replies, just removes headroom as a suspect. Shared by both modes since a
// matching-mode reply discussing several jobs can run long too.
const MAX_REPLY_TOKENS = 2048;

async function ask(system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_REPLY_TOKENS, system, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: r.status, body: r.ok ? await r.json() : (await r.text()).slice(0, 300) };
}

// Why the concierge is failing is invisible from the outside: a bad key, an unavailable
// model and a blocked egress all surface as 502. Admins can read the upstream verdict.
router.get('/diag', authenticate, sec.requireActiveUser, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });
  if (!process.env.ANTHROPIC_API_KEY)
    return res.json({ configured: false, model: MODEL });
  try {
    const { status, body } = await ask('ping', [{ role: 'user', content: 'ping' }]);
    res.json({ configured: true, model: MODEL, upstream: status, detail: status === 200 ? 'ok' : body });
  } catch (e) {
    res.json({ configured: true, model: MODEL, upstream: null, detail: `${e.name}: ${e.message}` });
  }
});

// Hicham's explicit ask: "if he closed during the subscription, all chat
// will be saved and continued without missing any shared info with agent."
// Every turn was ALREADY durably logged (logTurn below) -- what was missing
// is a way for the client to get it back. public/index.html's `history`/
// `conversationId` were plain in-memory JS variables, reset to empty on
// every page load/reload, so a seeker closing and reopening the app saw an
// empty chat even though nothing was actually lost server-side; the very
// next message would also open a brand-new conversation row instead of
// continuing the old one, silently fragmenting one seeker's history across
// many disconnected rows. This returns the seeker's most recent
// conversation and its full message history so the client can rehydrate
// both `history` (replayed into the model's own context on the next turn)
// and `conversationId` (so new messages append to the SAME conversation
// instead of starting another one) before the seeker sends anything.
// Deliberately not gated on an active subscription -- losing a free-preview
// conversation on reload would be exactly as frustrating, and it's the
// seeker's own data either way.
router.get('/history', authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const { data: conv } = await supabase.from('concierge_conversations')
      .select('id')
      .eq('profile_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) return res.json({ success: true, conversationId: null, messages: [] });
    // Generous but bounded -- mirrors MAX_TURNS' own reasoning (the model
    // only ever sees the last MAX_TURNS exchanges anyway); a seeker with a
    // genuinely huge history still gets a fast, working page rather than an
    // ever-growing payload.
    const { data: msgs } = await supabase.from('concierge_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(MAX_TURNS * 2 + 10);
    res.json({
      success: true, conversationId: conv.id,
      messages: (msgs || []).map(m => ({ role: m.role, content: m.content })),
    });
  } catch (e) {
    console.error('concierge history', e);
    res.status(500).json({ error: 'Could not load conversation history', code: 'ERR_SERVER' });
  }
});

// One durable log row per turn pair, matched jobs recorded so "what the bot was
// allowed to say" is auditable. Logging must never fail a seeker's reply, so
// every insert is best-effort and unawaited.
function logTurn(conversationId, userText, reply, matchedIds, units) {
  const ins = (row) => supabase.from('concierge_messages').insert(row)
    .then(({ error }) => { if (error) console.error('concierge log', error.message); },
      e => console.error('concierge log', e.message));
  ins({ conversation_id: conversationId, role: 'user', content: userText, units_charged: units });
  ins({ conversation_id: conversationId, role: 'assistant', content: reply, matched_job_ids: matchedIds });
}

router.post('/', sec.limits.concierge, authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const message = sec.clean(req.body.message, MAX_CHARS);
    const history = (Array.isArray(req.body.history) ? req.body.history : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!message) return res.status(400).json({ error: 'message is required', code: 'ERR_BAD_INPUT' });

    // Profile completeness gate (Section 10) — checked before the paywall.
    // An incomplete profile does NOT block the conversation: the seeker enters
    // intake mode, where the concierge asks for the missing Section 10 fields
    // turn by turn and persists extracted answers via lib/profileWrite.js — but
    // never retrieves or returns jobs until the gate passes.
    // No unique constraint on seeker_profiles.profile_id (schema.sql) yet, so
    // this reads the most recent row by hand rather than assuming exactly one.
    const { data: seekerProfile } = await supabase.from('seeker_profiles')
      .select('id, work_history, education, certifications, languages, has_passport, has_visa, has_legal_residency_current_country, has_family_or_host_abroad, is_complete, confirmed_by_user')
      .eq('profile_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: profileRow } = await supabase.from('profiles')
      .select('preferred_language, preferred_country, preferred_city, sector, role_type, seeking_study, target_degree_level, target_field_of_study')
      .eq('id', req.user.id).maybeSingle();
    const { isComplete, missing } = computeCompleteness({ profile: profileRow, seekerProfile });

    // Subscription gate (Section 4.3): the $25 Basic tier is the paid lane;
    // the quota still applies to everyone so a trial can't burn the model.
    // Intake mode itself is not paywalled — completing the profile is the
    // useful next step whether or not a subscription is active yet.
    const { data: user } = await supabase.from('users')
      .select('id, subscription_status, subscription_tier, bonus_access_until, free_preview_used')
      .eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(403).json({ error: 'Account not found', code: 'ERR_NOT_FOUND' });
    // access.hasAccess also honors a referral-reward bonus grant
    // (users.bonus_access_until) — see lib/access.js's own comment for why
    // that isn't just folded into subscription_status/subscription_tier.
    const active = access.hasAccess(user);
    // The first FREE_PREVIEW_LIMIT matching turns run — teased, not blocked —
    // before the hard paywall kicks in; intake-mode turns (isComplete false)
    // are already unpaywalled above this and never touch the counter.
    const previewUsed = Number(user.free_preview_used || 0);
    const inPreview = isComplete && paywallOn() && !active && previewUsed < freePreviewLimit();
    if (isComplete && paywallOn() && !active && !inPreview)
      return res.status(402).json({ error: 'A subscription is required to use the concierge', upgrade: true, code: 'ERR_PAYWALL' });

    // Intake turns never touch the daily quota (Section 4.3: the onboarding
    // conversation can run 10-15 exchanges before a subscriber gets value — it
    // must not count against the cap). The 429 check and usage.charge only run
    // on the matching path below.
    const tier = access.effectiveTier(user);
    if (isComplete) {
      const quota = await usage.checkQuota(user.id, tier, usage.COST.text);
      if (!quota.allowed)
        return res.status(429).json({ error: 'Daily limit reached — come back tomorrow or upgrade', quota, code: 'ERR_QUOTA' });
    }

    // Intake mode retrieves nothing — no jobs are fetched, shown to the model,
    // or returned to the client until the profile gate passes. A client that
    // doesn't send preferredCountry (most won't, every turn) falls back to
    // what the seeker already told the platform during intake, rather than
    // matching as if that answer didn't exist.
    const preferredCountry = sec.clean(req.body.preferredCountry, 60) || profileRow?.preferred_country || '';
    const preferredCity = profileRow?.preferred_city || '';
    const jobs = isComplete ? await retrieveJobs({
      query: message,
      preferredCountry,
      limit: 5,
    }) : [];
    // Same "no retrieval before the profile gate passes" discipline as jobs
    // above, extended to every other retrieved-context source added for the
    // international-students, travel/community, and trusted-partner verticals
    // (Section 4/5 of the build brief) -- none of these are gated behind
    // profile.seeking_study specifically (a pure job-seeker profile still
    // benefits from community/accommodation/partner/risk context once
    // complete), only behind the same completeness gate jobs already use.
    // Fetched in parallel -- seven independent reads, no ordering dependency.
    // medicalIntake is the seeker's own latest request (or null), not a
    // search -- see lib/yf/medicalMatching.js's own comment.
    const [studyOpportunities, communityGroups, accommodationListings, trustedPartners, countryRisks, costOfLiving, medicalIntake] = isComplete
      ? await Promise.all([
          retrieveStudyOpportunities({
            query: message, preferredCountry,
            degreeLevel: profileRow?.target_degree_level, fieldOfStudy: profileRow?.target_field_of_study, limit: 5,
          }),
          retrieveCommunityGroups({ country: preferredCountry, city: preferredCity, limit: 5 }),
          retrieveAccommodationListings({ country: preferredCountry, city: preferredCity, limit: 5 }),
          retrieveTrustedPartners({ country: preferredCountry, limit: 3 }),
          retrieveCountryRisks({ country: preferredCountry, limit: 5 }),
          retrieveCostOfLiving({ country: preferredCountry, city: preferredCity, limit: 5 }),
          retrieveMedicalIntake({ profileId: req.user.id }),
        ])
      : [[], [], [], [], [], [], null];
    // Depends on medicalIntake above (its required_treatment/extracted
    // report text IS the search query), so it can't join the parallel batch
    // -- kept to one extra, cheap await rather than forcing a fake
    // dependency into Promise.all. Never weighted by preferredCountry (see
    // retrieveMedicalProviders' own comment on why).
    const medicalProviders = medicalIntake
      ? await retrieveMedicalProviders({ query: [medicalIntake.requiredTreatment, medicalIntake.extractedReportText].filter(Boolean).join(' '), limit: 8 })
      : [];
    // Seed/demo fixture rows (see demoJob above) are redacted before either
    // the model or the client sees them, regardless of preview/subscription
    // status — applied first so a demo job during free preview still gets
    // its (harmless, already-fake) fields further redacted by teaserJob
    // rather than the two redactions fighting over field shape.
    const safeJobs = jobs.map(j => j.sourceType === 'seed_demo' ? demoJob(j) : j);
    // Free preview: what the model sees and what the client gets back are
    // BOTH the redacted shape — data minimization, not a prompt instruction
    // the model could be talked out of. matched_job_ids in the audit log
    // below still uses the real `jobs`, ids only, never anything redacted.
    const outJobs = inPreview ? safeJobs.map(teaserJob) : safeJobs;
    // Best-effort, never fails the seeker's turn: the counter existing at all
    // is what makes preview mode self-limiting, but a write hiccup shouldn't
    // block someone who's genuinely on their last free reply.
    //
    // schema.sql's increment_free_preview() does the increment atomically in
    // Postgres, not `previewUsed + 1` computed from the read taken at the top
    // of this handler — two concurrent turns on a seeker's last free reply
    // used to be able to both persist that same stale incremented value,
    // silently losing a count (same TOCTOU class as lib/usage.js's charge()
    // and the seeker_profiles fix; see those for the full story).
    const markPreviewUsed = () => {
      if (!inPreview) return;
      supabase.rpc('increment_free_preview', { p_user_id: user.id })
        .then(({ error }) => { if (error) console.error('preview counter', error.message); },
          e => console.error('preview counter', e.message));
    };

    // First turn of a session opens a conversation row the client then echoes
    // back; an echoed id is only honored if the conversation is the caller's —
    // otherwise anyone could write log rows into someone else's record.
    let conversationId = null;
    const hinted = String(req.body.conversationId || '');
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(hinted)) {
      const { data: conv } = await supabase.from('concierge_conversations')
        .select('id').eq('id', hinted).eq('profile_id', user.id).maybeSingle();
      conversationId = conv?.id || null;
    }
    if (!conversationId) {
      // conversation/profile/usage rows FK to profiles.id — make sure it exists
      // (a profile insert failure at signup must not block the concierge).
      const { error: pErr } = await supabase.from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
      if (pErr) console.error('profile ensure', pErr.message);
      const { data: conv, error } = await supabase.from('concierge_conversations')
        .insert({ profile_id: user.id, language_used: sec.clean(req.body.dialectHint, 40) || null })
        .select('id').single();
      if (error || !conv) console.error('conversation create', error?.message || 'no row returned');
      else conversationId = conv.id;
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      // Demo mode: complete profiles still exercise the retrieval layer on a
      // keyless deploy; incomplete ones get the intake prompt instead.
      const reply = isComplete
        ? "[Demo mode — no ANTHROPIC_API_KEY] Matching engine results:\n" +
          (outJobs.length
            ? outJobs.map(j => `• ${j.title} — ${j.city}, ${j.country} (${j.teaser ? 'subscribe to unlock' : j.sourceType === 'informal_unverified' ? 'unverified listing' : 'licensed feed'})`).join('\n')
            : 'No jobs matched.')
        : `[Demo mode — no ANTHROPIC_API_KEY] Profile intake — still missing: ${missing.join(', ')}`;
      if (conversationId) logTurn(conversationId, message, reply, jobs.map(j => j.id), isComplete ? usage.COST.text : 0);
      if (isComplete) await usage.charge(user.id, usage.COST.text);
      markPreviewUsed();
      return res.json({
        success: true, reply, jobs: outJobs, conversationId, llmConfigured: false, intake: !isComplete, isComplete, missing,
        jobsRetrieved: isComplete,
        ...(inPreview ? { preview: true, previewRemaining: freePreviewLimit() - previewUsed - 1 } : {}),
      });
    }

    const context = profileContext({ profile: profileRow, seekerProfile });
    const system = buildSystemPrompt({
      jobs: outJobs, dialectHint: sec.clean(req.body.dialectHint, 40),
      studyOpportunities, communityGroups, accommodationListings, trustedPartners, countryRisks, costOfLiving,
      medicalIntake, medicalProviders,
      travel: { flightsConfigured: flightSearch.configured(), hotelsConfigured: hotelSearch.configured() },
    })
      + (context ? '\n\n' + context : '')
      + (isComplete ? '' : '\n\n' + intakeInstructions(missing))
      + (inPreview ? '\n\n' + previewInstructions(freePreviewLimit() - previewUsed - 1) : '')
      + (active ? '\n\n' + cvAvailableInstructions : '');
    const { status, body } = await ask(system, [...history, { role: 'user', content: message }]);
    if (status !== 200) {
      console.error('concierge upstream', status, body);
      return res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });
    }
    let reply = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!reply) return res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });

    // Intake extraction: the model may end its reply with a ---PROFILE---
    // JSON block. Strip it from the visible reply and persist it through the
    // shared intake write path — a malformed block is ignored (the chat
    // continues), it never fails the seeker's turn.
    let nowComplete = isComplete, nowMissing = missing;
    if (!isComplete) {
      const m = reply.match(PROFILE_BLOCK_RE);
      if (m) {
        // Bug found in a follow-up audit: `reply.replace(...).trim() || reply`
        // looks like a safe "don't blank the reply" fallback, but `reply` on
        // the right of `||` is evaluated BEFORE this assignment lands, so it
        // still holds the ORIGINAL, unstripped string — block included. If
        // the model's entire turn was nothing but the block (plausible now
        // that the contract puts the block first and no longer requires
        // trailing prose), the stripped result is '', the fallback kicks in,
        // and the raw "---PROFILE---{...}---END---" JSON — the seeker's own
        // just-given passport/visa/work-history answers — gets shipped
        // straight into their chat instead of a clean reply. Same failure
        // family as the truncated-block leak fixed above (else-if below):
        // a successful match must never leave the raw fencing visible either.
        const stripped = reply.replace(PROFILE_BLOCK_RE, '').trim();
        reply = stripped || 'Got it, thanks for sharing that!';
        try {
          const extracted = JSON.parse(m[1]);
          // Lenient validation: a malformed field in the block is dropped and
          // logged, not allowed to sink the good answers beside it — and the
          // rejection is never silent.
          const r = await applyIntake(user.id, extracted, { lenient: true });
          for (const { field, reason } of r.rejected)
            console.error('concierge intake extraction rejected', field, reason);
          nowComplete = r.isComplete;
          nowMissing = r.missing;
        } catch (e) {
          console.error('concierge intake persist', e.message);
        }
      } else if (reply.includes('---PROFILE---')) {
        // Launch-readiness review: PROFILE_BLOCK_RE correctly refuses to match
        // (and therefore extract/persist) an unclosed block — e.g. the reply
        // hit MAX_REPLY_TOKENS mid-object, with no ---END--- ever arriving.
        // Nothing is written, so this can't half-persist a partial answer;
        // the field simply stays missing and the next turn re-requests it
        // per intakeInstructions above. But with nothing here, the seeker
        // would see the raw dangling "---PROFILE---{...partial json" fencing
        // in their chat, since only a successful match strips it. Since the
        // contract now puts the block FIRST, a cut this early can leave
        // nothing before the marker at all, so a fallback line covers that.
        console.error('concierge intake truncated block', reply.length, 'chars');
        reply = reply.slice(0, reply.indexOf('---PROFILE---')).trim()
          || "One moment, let's continue — could you say that again?";
      }
      // Server-side enforcement layer (see scrubFalseClaims above): applied
      // after every branch above, unconditionally, regardless of whether the
      // model followed intakeInstructions — prompt wording alone was retested
      // live and did not hold.
      reply = scrubFalseClaims(reply, nowComplete);
    }
    // Unlike scrubFalseClaims above, this runs on every turn -- see
    // scrubFalseCvClaims' own comment for why a matching-mode turn is just
    // as capable of falsely claiming a CV file exists as an intake one.
    reply = scrubFalseCvClaims(reply);

    if (conversationId) logTurn(conversationId, message, reply, jobs.map(j => j.id), isComplete ? usage.COST.text : 0);
    if (isComplete) await usage.charge(user.id, usage.COST.text);
    markPreviewUsed();
    res.json({
      success: true, reply, jobs: outJobs, conversationId, llmConfigured: true, intake: !nowComplete, isComplete: nowComplete, missing: nowMissing,
      // A live-test finding ("feed-claim on completion turn"): `jobs` above
      // was computed from the ORIGINAL `isComplete` (line ~356, before this
      // turn's intake extraction could flip it), so on the exact turn a
      // profile transitions incomplete -> complete, retrieval never ran and
      // `outJobs` is genuinely `[]` — even though the response's own
      // `isComplete` field now reads true. The client had no way to tell
      // "retrieval ran and truly found nothing" apart from "retrieval never
      // ran this turn" and rendered the same "no jobs matched" copy either
      // way, falsely claiming a feed outcome on a turn that never checked
      // the feed at all. `jobsRetrieved` is that original, pre-extraction
      // `isComplete` — true only when `outJobs` reflects an actual search.
      jobsRetrieved: isComplete,
      ...(inPreview ? { preview: true, previewRemaining: freePreviewLimit() - previewUsed - 1 } : {}),
    });
  } catch (e) {
    console.error('concierge', e.name, e.message);
    res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });
  }
});

module.exports = router;
// Exported alongside the router (Express routers are plain functions, so this
// is a harmless extra property, not a behavior change) purely so
// scripts/verify-intake-live.js can check a real model's raw reply against
// the exact same pattern the server itself extracts with — a hand-duplicated
// copy in the verification script would risk silently drifting from this one.
module.exports.PROFILE_BLOCK_RE = PROFILE_BLOCK_RE;
// Same reasoning: scripts/verify-intake-live.js's false-claim checks now
// import these instead of keeping their own copy, so the harness can never
// silently drift from what the server actually enforces.
module.exports.FALSE_JOB_FEED_CLAIM_PATTERNS = FALSE_JOB_FEED_CLAIM_PATTERNS;
module.exports.FALSE_COMPLETION_CLAIM_PATTERNS = FALSE_COMPLETION_CLAIM_PATTERNS;
// Exported so the sentence-splitting fix ("scrub text mutilation") can be
// unit-tested directly against tricky inputs (numbered lists, decimals,
// leading ellipses) without needing a live/mocked model turn to exercise it.
module.exports.splitSentences = splitSentences;
module.exports.scrubFalseClaims = scrubFalseClaims;
module.exports.demoJob = demoJob;
module.exports.FALSE_CV_CLAIM_PATTERNS = FALSE_CV_CLAIM_PATTERNS;
module.exports.scrubFalseCvClaims = scrubFalseCvClaims;
