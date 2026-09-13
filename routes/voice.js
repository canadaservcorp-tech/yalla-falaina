// POST /api/voice/transcribe — raw audio bytes in, transcript text out.
//
// Deliberately does NOT talk to the concierge. The client puts the returned
// transcript in the message box for the seeker to read and correct, then sends
// it through /api/concierge like any typed turn. That keeps one path into the
// model (with its guardrails, intake contract, logging and quota) and means a
// misheard word is the seeker's to fix before it is recorded against their
// profile — an ASR mistake on "I have a visa" is not a small thing here.
//
// Nothing is stored: the audio exists only for the duration of the request.
// Voice is a transport for the message, and the transcript is already logged
// as the turn text by routes/concierge.js, so keeping the recording would add
// biometric-grade personal data with no operational use (Section 6 data
// minimization, and the retention policy would otherwise have to cover it).
const express = require('express');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const supabase = require('../db');
const { transcribe, configured, baseLanguage, MAX_BYTES } = require('../lib/transcribe');
const router = express.Router();

// Transcription costs money per request like a model turn does, so it gets the
// concierge's own burst+hourly limiters rather than the looser upload one.
router.post('/transcribe', sec.limits.concierge, authenticate, sec.requireActiveUser, async (req, res) => {
  if (!configured())
    return res.status(503).json({ error: 'Voice notes are not available right now', code: 'ERR_VOICE_UNAVAILABLE' });
  const audio = Buffer.isBuffer(req.body) ? req.body : null;
  if (!audio || !audio.length)
    return res.status(400).json({ error: 'audio is required', code: 'ERR_BAD_INPUT' });
  if (audio.length > MAX_BYTES)
    return res.status(413).json({ error: 'That recording is too long', code: 'ERR_TOO_LARGE' });

  try {
    // The seeker's stated preferred language is a far better hint than
    // autodetect on a short, noisy, code-switched phone recording.
    const { data: profile } = await supabase.from('profiles')
      .select('preferred_language').eq('id', req.user.id).maybeSingle();
    const language = baseLanguage(profile && profile.preferred_language);
    const text = await transcribe(audio, req.get('content-type'), { language });
    if (!text)
      return res.status(422).json({ error: "We couldn't hear anything in that recording", code: 'ERR_VOICE_EMPTY' });
    res.json({ success: true, text });
  } catch (e) {
    const code = e.code || 'ERR_SERVER';
    const status = code === 'ERR_BAD_AUDIO_TYPE' ? 415
      : code === 'ERR_TOO_LARGE' ? 413
      : code === 'ERR_BAD_INPUT' ? 400
      : code === 'ERR_VOICE_UNAVAILABLE' ? 503
      : 502;
    if (status >= 500) console.error('voice transcribe', e.message);
    res.status(status).json({
      error: status === 415 ? 'That audio format is not supported' : 'Could not transcribe that recording',
      code,
    });
  }
});

module.exports = router;
