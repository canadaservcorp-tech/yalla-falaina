// Speech-to-text for chat voice notes. The concierge model reads text only, so
// a voice note is transcribed here and then travels the ordinary /api/concierge
// path as the turn's message — every guardrail, the ---PROFILE--- intake
// contract, the durable conversation log (Section 6.2) and the fair-use quota
// keep applying unchanged. Nothing about audio bypasses them.
//
// Provider is OpenAI's transcription endpoint, which is also what Groq and
// several others expose verbatim, so STT_BASE_URL can retarget it without a
// code change. Chosen over a cloud SDK because it needs no new dependency:
// Node 22 has fetch, FormData and Blob built in.
//
// Dialect note (Sections 3/4.3): seekers speak Lebanese, Syrian and Egyptian
// Arabic, not MSA. Whisper-class models handle these unevenly, so `language`
// is passed as the base language ('ar') rather than a dialect tag — a dialect
// tag it doesn't recognize degrades output — and the transcript is shown to
// the seeker for correction before it is sent, never sent silently on their
// behalf.
const MAX_BYTES = 5 * 1024 * 1024;  // ~4 minutes of opus; also the express.raw cap in server.js
const TIMEOUT_MS = 60000;           // transcription is slower than a chat turn
const MODEL = process.env.STT_MODEL || 'whisper-1';
const BASE_URL = process.env.STT_BASE_URL || 'https://api.openai.com/v1';

// Read late (not at module load) so tests and /api/health see env changes.
const configured = () => Boolean(process.env.STT_API_KEY);

// Anything the browser's MediaRecorder actually produces, plus the common
// phone-native containers. Checked against the declared Content-Type only as
// a cheap early reject; the provider re-validates the bytes themselves.
const ALLOWED_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/flac'];
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac' };

const baseType = ct => String(ct || '').split(';')[0].trim().toLowerCase();
const isAllowedType = ct => ALLOWED_TYPES.includes(baseType(ct));

// Resolves to the transcript string. Throws Error with .code set to one of the
// route's error codes so the caller doesn't have to interpret provider text.
async function transcribe(buffer, contentType, { language } = {}) {
  if (!configured()) { const e = new Error('transcription is not configured'); e.code = 'ERR_VOICE_UNAVAILABLE'; throw e; }
  if (!buffer || !buffer.length) { const e = new Error('empty audio'); e.code = 'ERR_BAD_INPUT'; throw e; }
  if (buffer.length > MAX_BYTES) { const e = new Error('audio too large'); e.code = 'ERR_TOO_LARGE'; throw e; }
  if (!isAllowedType(contentType)) { const e = new Error('unsupported audio type'); e.code = 'ERR_BAD_AUDIO_TYPE'; throw e; }

  const type = baseType(contentType);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), `note.${EXT[type]}`);
  form.append('model', MODEL);
  // 'text' keeps the response a bare string — no JSON shape to depend on
  // across the providers this endpoint is compatible with.
  form.append('response_format', 'text');
  if (language) form.append('language', language);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` },
      body: form,
      signal: ac.signal,
    });
  } catch (err) {
    const e = new Error(err.name === 'AbortError' ? 'transcription timed out' : 'transcription request failed');
    e.code = 'ERR_VOICE_FAILED';
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    // Provider text can quote the request; log it, never return it.
    console.error('transcribe: provider returned', r.status, (await r.text().catch(() => '')).slice(0, 500));
    const e = new Error('transcription failed');
    e.code = 'ERR_VOICE_FAILED';
    throw e;
  }
  return String(await r.text()).trim();
}

// 'ar-LB' | 'ar-EG' -> 'ar'; see the dialect note above.
const baseLanguage = pref => {
  const code = String(pref || '').trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(code) ? code : undefined;
};

module.exports = { transcribe, configured, isAllowedType, baseLanguage, MAX_BYTES, ALLOWED_TYPES };
