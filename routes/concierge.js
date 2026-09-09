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
const { retrieveJobs } = require('../lib/yf/matching');
const { buildSystemPrompt } = require('../lib/yf/systemPrompt');
const { computeCompleteness } = require('../lib/profileCompleteness');
const { applyIntake } = require('../lib/profileWrite');
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TURNS = 20;                    // conversation length sent back to the model
const MAX_CHARS = 1500;                  // per message — seekers paste longer context
const TIMEOUT_MS = 30000;                // never hold a request open on a stalled upstream
// Idea-configuration doc: "first 3 messages free, before the paywall — meant
// to build interest and push the person to subscribe." A lifetime count
// (users.free_preview_used), not a daily one — this is a conversion funnel,
// not the fair-use quota (lib/usage.js) which still applies underneath it.
const FREE_PREVIEW_LIMIT = 3;
// Read per request so the gate can be flipped by env change without a reload.
const paywallOn = () => process.env.PAYWALL_ENFORCED === 'true';

// In intake mode the model ends its reply with a ---PROFILE--- fenced JSON
// block holding whatever intake answers it extracted from the conversation.
// The server strips it before the seeker sees it and persists it through
// lib/profileWrite.js's shared validation — model output never writes directly.
const PROFILE_BLOCK_RE = /---PROFILE---\s*(\{[\s\S]*?\})\s*---END---/;

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
  add('Sector', profile?.sector);
  add('Role type', profile?.role_type);
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
const previewInstructions = (remaining) => [
  'FREE PREVIEW MODE — this seeker has not subscribed yet. The idea-configuration',
  'doc gives every seeker their first 3 concierge replies free, to build genuine',
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
  `Free preview replies left after this one: ${remaining}.`,
].join('\n');

const intakeInstructions = (missing) => [
  'INTAKE MODE — the seeker\'s profile is incomplete (Section 10 required fields).',
  'Do NOT mention, list, or recommend any jobs or opportunities in this conversation.',
  'Your only task: conversationally collect the missing fields, in the seeker\'s language, a few questions at a time:',
  `  Missing: ${missing.join(', ')}`,
  'Field meanings: work_history = array of {employer, title, start_date, end_date, description};',
  'languages = array of {language, level}; preferred_language must be one of ar-LB, ar-SY, ar-EG, ar, fr, en;',
  'sector or role_type = what kind of work they seek; has_passport/has_visa/',
  'has_legal_residency_current_country/has_family_or_host_abroad = booleans (a "no" answer is still an answer);',
  'preferred_country = where they hope to work.',
  'After each turn where you learned something new, end your reply with exactly:',
  '---PROFILE---',
  '{"<field>": <value>, ...}   // only the fields learned so far, strict JSON',
  '---END---',
  'When every field above is collected, summarize what you heard and ask the seeker to confirm;',
  'only when they explicitly confirm, include "confirmed_by_user": true in the final ---PROFILE--- block.',
].join('\n');

async function ask(system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
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
      .select('preferred_language, preferred_country, sector, role_type')
      .eq('id', req.user.id).maybeSingle();
    const { isComplete, missing } = computeCompleteness({ profile: profileRow, seekerProfile });

    // Subscription gate (Section 4.3): the $25 Basic tier is the paid lane;
    // the quota still applies to everyone so a trial can't burn the model.
    // Intake mode itself is not paywalled — completing the profile is the
    // useful next step whether or not a subscription is active yet.
    const { data: user } = await supabase.from('users')
      .select('id, subscription_status, subscription_tier, free_preview_used')
      .eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(403).json({ error: 'Account not found', code: 'ERR_NOT_FOUND' });
    const active = user.subscription_status === 'active';
    // The first FREE_PREVIEW_LIMIT matching turns run — teased, not blocked —
    // before the hard paywall kicks in; intake-mode turns (isComplete false)
    // are already unpaywalled above this and never touch the counter.
    const previewUsed = Number(user.free_preview_used || 0);
    const inPreview = isComplete && paywallOn() && !active && previewUsed < FREE_PREVIEW_LIMIT;
    if (isComplete && paywallOn() && !active && !inPreview)
      return res.status(402).json({ error: 'A subscription is required to use the concierge', upgrade: true, code: 'ERR_PAYWALL' });

    // Intake turns never touch the daily quota (Section 4.3: the onboarding
    // conversation can run 10-15 exchanges before a subscriber gets value — it
    // must not count against the cap). The 429 check and usage.charge only run
    // on the matching path below.
    const tier = active ? (user.subscription_tier || 'basic') : 'none';
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
    const jobs = isComplete ? await retrieveJobs({
      query: message,
      preferredCountry: sec.clean(req.body.preferredCountry, 60) || profileRow?.preferred_country || '',
      limit: 5,
    }) : [];
    // Free preview: what the model sees and what the client gets back are
    // BOTH the redacted shape — data minimization, not a prompt instruction
    // the model could be talked out of. matched_job_ids in the audit log
    // below still uses the real `jobs`, ids only, never anything redacted.
    const outJobs = inPreview ? jobs.map(teaserJob) : jobs;
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
        ...(inPreview ? { preview: true, previewRemaining: FREE_PREVIEW_LIMIT - previewUsed - 1 } : {}),
      });
    }

    const context = profileContext({ profile: profileRow, seekerProfile });
    const system = buildSystemPrompt({ jobs: outJobs, dialectHint: sec.clean(req.body.dialectHint, 40) })
      + (context ? '\n\n' + context : '')
      + (isComplete ? '' : '\n\n' + intakeInstructions(missing))
      + (inPreview ? '\n\n' + previewInstructions(FREE_PREVIEW_LIMIT - previewUsed - 1) : '');
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
        reply = reply.replace(PROFILE_BLOCK_RE, '').trim() || reply;
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
      }
    }

    if (conversationId) logTurn(conversationId, message, reply, jobs.map(j => j.id), isComplete ? usage.COST.text : 0);
    if (isComplete) await usage.charge(user.id, usage.COST.text);
    markPreviewUsed();
    res.json({
      success: true, reply, jobs: outJobs, conversationId, llmConfigured: true, intake: !nowComplete, isComplete: nowComplete, missing: nowMissing,
      ...(inPreview ? { preview: true, previewRemaining: FREE_PREVIEW_LIMIT - previewUsed - 1 } : {}),
    });
  } catch (e) {
    console.error('concierge', e.name, e.message);
    res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });
  }
});

module.exports = router;
