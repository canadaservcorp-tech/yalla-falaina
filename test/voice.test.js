// routes/voice.js — the endpoint turns recorded audio into transcript text;
// the transcript then goes through /api/concierge like a typed turn, so this
// file covers the transcription half only: validation, provider error paths,
// the size cap, and the baseLanguage mapping. The provider call itself is
// stubbed by overriding global.fetch — the same trick test files use for
// Resend — with STT_BASE_URL left pointing anywhere since fetch never runs.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { getApp, actor, auth } = require('./helpers/appHarness');
const { transcribe, isAllowedType, baseLanguage, MAX_BYTES } = require('../lib/transcribe');

const h = getApp();
const origFetch = global.fetch;
const PROVIDER = '/audio/transcriptions';
// Only the provider call is stubbed; the harness's own requests still need the
// real fetch or every test would stub itself.
const stubProvider = fn => { global.fetch = (url, ...a) => String(url).includes(PROVIDER) ? fn(url, ...a) : origFetch(url, ...a); };
afterEach(() => { global.fetch = origFetch; delete process.env.STT_API_KEY; });

// Voice notes are a subscriber perk (lib/voiceNotes.js: tier 'none' = 0/day),
// so every test that reaches the provider path needs a paid-tier user row.
// Both fields matter: lib/access.js#effectiveTier only honors subscription_tier
// when subscription_status is genuinely 'active' (schema.sql only ever sets
// subscription_tier to a real value alongside subscription_status='active' —
// see routes/subscription.js's webhook patches), so a fixture with the tier
// but not the status would no longer reflect a reachable real-world row.
const SUB = { subscription_status: 'active', subscription_tier: 'basic' };
// The concierge rate limiter is per-IP — give each call its own visitor.
let visitor = 0;
const post = (token, body, type = 'audio/webm', duration = '5') => fetch(h.base + '/api/voice/transcribe', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token, 'Content-Type': type, 'X-Audio-Duration': duration,
    'X-Forwarded-For': '10.8.' + (++visitor % 250) + '.' + (visitor % 250),
  },
  body: body || Buffer.from('fake-webm-bytes'),
});

test('transcribe: missing audio -> ERR_BAD_INPUT', async () => {
  process.env.STT_API_KEY = 'test-key';
  const token = actor(h, { id: 901 });
  const r = await fetch(h.base + '/api/voice/transcribe', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'audio/webm', 'X-Forwarded-For': '10.8.9.9' },
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ERR_BAD_INPUT');
});

test('transcribe: unconfigured provider -> 503 ERR_VOICE_UNAVAILABLE', async () => {
  delete process.env.STT_API_KEY;
  const token = actor(h, { id: 902 });
  const r = await post(token, Buffer.from('x'));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'ERR_VOICE_UNAVAILABLE');
});

test('transcribe: over the size cap -> 413 ERR_TOO_LARGE, provider never called', async () => {
  process.env.STT_API_KEY = 'test-key';
  let called = false;
  stubProvider(async () => { called = true; });
  const token = actor(h, { id: 903 });
  const r = await post(token, Buffer.alloc(MAX_BYTES + 1));
  assert.equal(r.status, 413);
  assert.equal((await r.json()).code, 'ERR_TOO_LARGE');
  assert.equal(called, false);
});

test('transcribe: a non-audio type -> 415 ERR_BAD_AUDIO_TYPE', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => { throw new Error('provider must not be reached'); });
  const token = actor(h, { id: 904, extra: SUB });
  const r = await post(token, Buffer.from('<html>nope</html>'), 'text/html');
  assert.equal(r.status, 415);
  assert.equal((await r.json()).code, 'ERR_BAD_AUDIO_TYPE');
});

test('transcribe: provider 5xx -> 502 ERR_VOICE_FAILED and no upstream text leaked', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: false, status: 500, text: async () => 'provider internal detail X' }));
  const token = actor(h, { id: 905, extra: SUB });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 502);
  const d = await r.json();
  assert.equal(d.code, 'ERR_VOICE_FAILED');
  assert.ok(!JSON.stringify(d).includes('provider internal detail'), 'upstream error text must not reach the client');
});

test('transcribe: happy path returns the transcript', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: true, text: async () => 'ana baddi shoghoul' }));
  const token = actor(h, { id: 906, extra: SUB });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).text, 'ana baddi shoghoul');
});

test('transcribe: empty transcript -> 422 ERR_VOICE_EMPTY', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: true, text: async () => '   ' }));
  const token = actor(h, { id: 907, extra: SUB });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, 'ERR_VOICE_EMPTY');
});

test('transcribe: dialect tags reduce to a base language hint', async () => {
  process.env.STT_API_KEY = 'test-key';
  let seenLanguage;
  stubProvider(async (url, opts) => {
    seenLanguage = opts.body.get('language');
    return { ok: true, text: async () => 'ok' };
  });
  const token = actor(h, { id: 908, extra: SUB });
  h.mock.__set('profiles', { data: { preferred_language: 'ar-EG' }, error: null });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 200);
  assert.equal(seenLanguage, 'ar');
});

test('transcribe: requires auth', async () => {
  process.env.STT_API_KEY = 'test-key';
  const r = await fetch(h.base + '/api/voice/transcribe', { method: 'POST', body: Buffer.from('x') });
  assert.ok([401, 403].includes(r.status));
});

test('transcribe: over 30s -> 413 ERR_VOICE_DURATION, provider never called', async () => {
  process.env.STT_API_KEY = 'test-key';
  let called = false;
  stubProvider(async () => { called = true; });
  const token = actor(h, { id: 909, extra: SUB });
  const r = await post(token, Buffer.from('bytes'), 'audio/webm', '31');
  assert.equal(r.status, 413);
  assert.equal((await r.json()).code, 'ERR_VOICE_DURATION');
  assert.equal(called, false);
});

test('transcribe: a non-subscriber gets 429 ERR_VOICE_LIMIT, provider never called', async () => {
  process.env.STT_API_KEY = 'test-key';
  let called = false;
  stubProvider(async () => { called = true; });
  const token = actor(h, { id: 910 });   // no subscription_tier -> 'none' -> 0/day
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'ERR_VOICE_LIMIT');
  assert.equal(called, false);
});

test('transcribe: a live referral bonus grants the subscriber quota with no real subscription at all', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: true, text: async () => 'marhaba' }));
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  // subscription_tier stays 'none' -- access should come entirely from the bonus.
  const token = actor(h, { id: 912, extra: { subscription_tier: 'none', bonus_access_until: future } });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 200);
});

test('transcribe: an expired referral bonus still gets 429 ERR_VOICE_LIMIT like any other non-subscriber', async () => {
  process.env.STT_API_KEY = 'test-key';
  let called = false;
  stubProvider(async () => { called = true; });
  const past = new Date(Date.now() - 5 * 86400000).toISOString();
  const token = actor(h, { id: 913, extra: { subscription_tier: 'none', bonus_access_until: past } });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'ERR_VOICE_LIMIT');
  assert.equal(called, false);
});

test('transcribe: success stores the transcript artifact, never the audio', async () => {
  process.env.STT_API_KEY = 'test-key';
  let uploadArgs;
  const origFrom = h.mock.storage.from;
  h.mock.storage.from = bucket => ({
    ...origFrom.call(h.mock.storage, bucket),
    upload: async (path, body, opts) => { uploadArgs = { bucket, path, body, opts }; return { data: { path }, error: null }; },
  });
  try {
    stubProvider(async () => ({ ok: true, text: async () => 'marhaba' }));
    const token = actor(h, { id: 911, extra: SUB });
    const r = await post(token, Buffer.from('bytes'));
    assert.equal(r.status, 200);
    // the stored object is the transcript text, under a voice-notes/ path
    assert.ok(uploadArgs, 'transcript upload expected');
    assert.match(uploadArgs.path, /^voice-notes\/911\//);
    assert.equal(uploadArgs.body.toString(), 'marhaba');
    assert.equal(uploadArgs.opts.contentType, 'text/plain');
    const rows = h.mock.__writes('document_uploads', 'insert').filter(w => w.payload.profile_id === 911);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload.kind, 'voice_note');
    assert.equal(rows[0].payload.profile_id, 911);
    assert.equal(rows[0].payload.storage_path, uploadArgs.path);
    assert.ok(Date.parse(rows[0].payload.retention_expires_at) > Date.now());
  } finally {
    h.mock.storage.from = origFrom;
  }
});

// ---------- unit-level pieces ----------

test('isAllowedType: accepts the recorded containers, rejects the rest', () => {
  for (const t of ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg', 'audio/m4a'])
    assert.ok(isAllowedType(t), t);
  for (const t of ['text/html', 'video/mp4', 'application/octet-stream', '', null])
    assert.ok(!isAllowedType(t), t);
});

test('baseLanguage: dialect tags map to the base code, junk is dropped', () => {
  assert.equal(baseLanguage('ar-LB'), 'ar');
  assert.equal(baseLanguage('ar-EG'), 'ar');
  assert.equal(baseLanguage('fr'), 'fr');
  assert.equal(baseLanguage(undefined), undefined);
  assert.equal(baseLanguage(''), undefined);
  assert.equal(baseLanguage('notalanguage'), undefined);
});
