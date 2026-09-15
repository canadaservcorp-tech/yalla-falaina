// POST /api/voice/transcribe — raw audio bytes in, transcript text out.
//
// Deliberately does NOT talk to the concierge. The client puts the returned
// transcript in the message box for the seeker to read and correct, then sends
// it through /api/concierge like any typed turn. That keeps one path into the
// model (with its guardrails, intake contract, logging and quota) and means a
// misheard word is the seeker's to fix before it is recorded against their
// profile — an ASR mistake on "I have a visa" is not a small thing here.
//
// The raw audio itself is never stored — only the transcript is, as a
// document_uploads artifact (kind='voice_note', the storage object is the
// transcript .txt, not the recording). That row is what the policy layer in
// lib/voiceNotes.js counts for the per-tier daily cap and what
// scripts/document-retention.js + deleteAllVoiceNotes clean up; keeping the
// recording would add biometric-grade personal data for no operational use.
const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const supabase = require('../db');
const voiceNotes = require('../lib/voiceNotes');
const access = require('../lib/access');
const { transcribe, configured, baseLanguage, MAX_BYTES } = require('../lib/transcribe');
const router = express.Router();

const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';
const RETENTION_DAYS = 30; // transcript artifact — the sent copy lives in concierge_messages

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

  // lib/voiceNotes.js's hard cap is duration, not bytes — a client can lie
  // about it, but doing so still spends their per-day voice-note count, so
  // the quota is the real bound; the header is the friendly check.
  const durationSec = Number(req.get('x-audio-duration'));
  if (req.get('x-audio-duration') !== undefined && !Number.isFinite(durationSec))
    return res.status(400).json({ error: 'audio duration is required', code: 'ERR_BAD_INPUT' });
  if (Number.isFinite(durationSec) && !voiceNotes.validateVoiceDuration(durationSec))
    return res.status(413).json({ error: voiceNotes.MAX_VOICE_SECONDS_ERROR, code: 'ERR_VOICE_DURATION' });

  try {
    // Load everything needed up front: the seeker's tier for the per-day
    // voice-note cap, and their language as the STT hint (far better than
    // autodetect on a short, code-switched phone recording).
    const [{ data: user }, { data: profile }] = await Promise.all([
      supabase.from('users').select('subscription_status, subscription_tier, bonus_access_until').eq('id', req.user.id).maybeSingle(),
      supabase.from('profiles').select('preferred_language').eq('id', req.user.id).maybeSingle(),
    ]);
    // access.effectiveTier honors a referral-reward bonus grant the same way
    // routes/concierge.js and routes/cv.js do — see lib/access.js.
    const quota = await voiceNotes.checkVoiceNoteQuota(req.user.id, access.effectiveTier(user));
    if (!quota.allowed)
      return res.status(429).json({
        error: `Daily voice-note limit reached (${quota.limit} per day)`, code: 'ERR_VOICE_LIMIT',
        used: quota.used, limit: quota.limit,
      });

    const text = await transcribe(audio, req.get('content-type'), {
      language: baseLanguage(profile && profile.preferred_language),
    });
    if (!text)
      return res.status(422).json({ error: "We couldn't hear anything in that recording", code: 'ERR_VOICE_EMPTY' });

    // Persist the transcript artifact — the row both makes today's count
    // real for the next checkVoiceNoteQuota call and gives the retention /
    // delete-on-cancel paths something concrete to remove. A storage or
    // insert failure is logged, not fatal: the transcript is already
    // produced and denying it here would strand a paid-for request.
    const storagePath = `voice-notes/${req.user.id}/${crypto.randomUUID()}.txt`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(storagePath, Buffer.from(text, 'utf8'), { contentType: 'text/plain' });
    if (upErr) {
      console.error('voice note transcript storage', upErr.message);
    } else {
      const { error: insErr } = await supabase.from('document_uploads').insert({
        profile_id: req.user.id, kind: 'voice_note', storage_path: storagePath,
        retention_expires_at: new Date(Date.now() + RETENTION_DAYS * 864e5).toISOString(),
      });
      if (insErr) console.error('voice note row', insErr.message);
    }

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
