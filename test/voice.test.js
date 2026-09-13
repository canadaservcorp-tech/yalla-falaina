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

const post = (token, body, type = 'audio/webm') => fetch(h.base + '/api/voice/transcribe', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': type },
  body: body || Buffer.from('fake-webm-bytes'),
});

test('transcribe: missing audio -> ERR_BAD_INPUT', async () => {
  process.env.STT_API_KEY = 'test-key';
  const token = actor(h, { id: 901 });
  const r = await fetch(h.base + '/api/voice/transcribe', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'audio/webm' },
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
  const token = actor(h, { id: 904 });
  const r = await post(token, Buffer.from('<html>nope</html>'), 'text/html');
  assert.equal(r.status, 415);
  assert.equal((await r.json()).code, 'ERR_BAD_AUDIO_TYPE');
});

test('transcribe: provider 5xx -> 502 ERR_VOICE_FAILED and no upstream text leaked', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: false, status: 500, text: async () => 'provider internal detail X' }));
  const token = actor(h, { id: 905 });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 502);
  const d = await r.json();
  assert.equal(d.code, 'ERR_VOICE_FAILED');
  assert.ok(!JSON.stringify(d).includes('provider internal detail'), 'upstream error text must not reach the client');
});

test('transcribe: happy path returns the transcript', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: true, text: async () => 'ana baddi shoghoul' }));
  const token = actor(h, { id: 906 });
  const r = await post(token, Buffer.from('bytes'));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).text, 'ana baddi shoghoul');
});

test('transcribe: empty transcript -> 422 ERR_VOICE_EMPTY', async () => {
  process.env.STT_API_KEY = 'test-key';
  stubProvider(async () => ({ ok: true, text: async () => '   ' }));
  const token = actor(h, { id: 907 });
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
  const token = actor(h, { id: 908 });
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
