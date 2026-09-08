// Yalla Falaina AI concierge — "Your Assistant to Travel". The tested guardrail
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
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TURNS = 20;                    // conversation length sent back to the model
const MAX_CHARS = 1500;                  // per message — seekers paste longer context
const TIMEOUT_MS = 30000;                // never hold a request open on a stalled upstream
// Read per request so the gate can be flipped by env change without a reload.
const paywallOn = () => process.env.PAYWALL_ENFORCED === 'true';

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

    // Profile completeness gate (Section 10) — checked before the paywall/quota
    // logic below: matching only makes sense once we know enough to match against,
    // and there's no reason to spend someone's daily quota finding that out.
    // No unique constraint on seeker_profiles.profile_id (schema.sql) yet, so this
    // reads the most recent row by hand rather than assuming exactly one exists.
    const { data: seekerProfile } = await supabase.from('seeker_profiles')
      .select('is_complete, confirmed_by_user')
      .eq('profile_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!seekerProfile || !seekerProfile.is_complete) {
      const { data: profileRow } = await supabase.from('profiles')
        .select('preferred_language, preferred_country, sector, role_type')
        .eq('id', req.user.id).maybeSingle();
      const { missing } = computeCompleteness({ profile: profileRow, seekerProfile });
      return res.status(403).json({
        error: 'Complete your profile before the concierge can match you to opportunities',
        code: 'ERR_PROFILE_INCOMPLETE',
        missing,
      });
    }

    // Subscription gate (Section 4.3): the $25 Basic tier is the paid lane;
    // the quota still applies to everyone so a trial can't burn the model.
    const { data: user } = await supabase.from('users')
      .select('id, subscription_status, subscription_tier')
      .eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(403).json({ error: 'Account not found', code: 'ERR_NOT_FOUND' });
    const active = user.subscription_status === 'active';
    if (paywallOn() && !active)
      return res.status(402).json({ error: 'A subscription is required to use the concierge', upgrade: true, code: 'ERR_PAYWALL' });

    const tier = active ? (user.subscription_tier || 'basic') : 'none';
    const quota = await usage.checkQuota(user.id, tier, usage.COST.text);
    if (!quota.allowed)
      return res.status(429).json({ error: 'Daily limit reached — come back tomorrow or upgrade', quota, code: 'ERR_QUOTA' });

    const jobs = await retrieveJobs({
      query: message,
      preferredCountry: sec.clean(req.body.preferredCountry, 60),
      limit: 5,
    });

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
      // Demo mode: the retrieval layer still runs — useful on a keyless deploy.
      const reply = "[Demo mode — no ANTHROPIC_API_KEY] Matching engine results:\n" +
        (jobs.length
          ? jobs.map(j => `• ${j.title} — ${j.city}, ${j.country} (${j.sourceType === 'informal_unverified' ? 'unverified listing' : 'licensed feed'})`).join('\n')
          : 'No jobs matched.');
      if (conversationId) logTurn(conversationId, message, reply, jobs.map(j => j.id), usage.COST.text);
      await usage.charge(user.id, usage.COST.text);
      return res.json({ success: true, reply, jobs, conversationId, llmConfigured: false });
    }

    const system = buildSystemPrompt({ jobs, dialectHint: sec.clean(req.body.dialectHint, 40) });
    const { status, body } = await ask(system, [...history, { role: 'user', content: message }]);
    if (status !== 200) {
      console.error('concierge upstream', status, body);
      return res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });
    }
    const reply = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!reply) return res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });

    if (conversationId) logTurn(conversationId, message, reply, jobs.map(j => j.id), usage.COST.text);
    await usage.charge(user.id, usage.COST.text);
    res.json({ success: true, reply, jobs, conversationId, llmConfigured: true });
  } catch (e) {
    console.error('concierge', e.name, e.message);
    res.status(502).json({ error: 'Concierge unavailable', code: 'ERR_UPSTREAM_UNAVAILABLE' });
  }
});

module.exports = router;
