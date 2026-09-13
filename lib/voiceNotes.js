'use strict';
// Voice-note POLICY layer. Recording/upload/transcription itself is NOT
// built yet (no endpoint accepts audio anywhere in this repo) -- this module
// exists so the concrete limits Hicham asked for are decided and testable
// now, ready for whatever upload endpoint gets built next to import and
// enforce, rather than left as something to re-derive later.
//
// document_uploads (schema.sql) already has kind='voice_note' with a
// storage_path and retention_expires_at -- the general short-retention
// window scripts/document-retention.js already enforces for every upload
// kind. This module adds two things beyond that general policy:
//   1. A hard per-clip duration cap (server-side; a client-side cap alone
//      is not a real limit, the same lesson as this file's false-claim
//      scrubbing elsewhere in the app -- a client can always be bypassed).
//   2. An explicit per-tier CAP ON COUNT, separate from lib/usage.js's
//      per-turn unit cost. lib/usage.js already charges a voice turn 3
//      units against the daily fair-use budget, but that alone doesn't
//      bound voice-note COUNT the way Hicham asked ("not open") -- a
//      seeker with unused daily units could otherwise send an unbounded
//      number of voice notes right up to the unit ceiling. This is a
//      second, independent ceiling on top of that one.
const supabase = require('../db');

const MAX_VOICE_SECONDS = 30;

// Phase 1 ships a single paid tier (Basic) -- see lib/usage.js's own
// TIER_UNITS comment for the same reasoning. Listed per-tier so opening up
// pricing later is a config change here, not a code change.
const VOICE_NOTE_DAILY_LIMIT = {
  none: 0,           // no subscription -- voice notes are a subscriber perk, not part of the free preview
  basic: 5,
  starter: 2,
  plus: 15,
  unlimited: 100,    // still counted, not literally unbounded
};

function voiceNoteDailyLimit(tier) {
  return VOICE_NOTE_DAILY_LIMIT[tier] ?? VOICE_NOTE_DAILY_LIMIT.none;
}

// A plain count check, not an atomic counter -- unlike lib/usage.js's
// unit-quota (which increments via a Postgres RPC to avoid a
// read-then-write race under concurrent charges), the actual "used" event
// here is inserting the document_uploads row itself, which the future
// upload endpoint does directly; there is nothing to increment separately,
// so a straightforward count-for-today read is enough for the ceiling check
// itself (same reasoning as lib/usage.js's own read-only unitsUsedToday).
// Throws on a read failure rather than swallowing it to a default count --
// checkVoiceNoteQuota below is what decides how to fail (closed), and it
// can only make that call if a genuine "zero uploads today" is distinguishable
// from "the read itself failed."
async function countVoiceNotesToday(profileId) {
  const startOfDayUtc = new Date(); startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase.from('document_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('kind', 'voice_note')
    .gte('created_at', startOfDayUtc.toISOString());
  if (error) throw new Error(error.message);
  return count || 0;
}

// Returns { allowed, used, limit, tier }. Fails closed for a paid tier and
// open for none -- deliberately the OPPOSITE default from
// lib/usage.js#checkQuota's fail-open-for-paid choice: a broken counter here
// should not let voice-note count run unbounded for a subscriber (count,
// unlike the general unit quota, is the entire point of this check), while
// 'none' already gets 0 either way so there is nothing to fail open to.
async function checkVoiceNoteQuota(profileId, tier) {
  const limit = voiceNoteDailyLimit(tier);
  try {
    const used = await countVoiceNotesToday(profileId);
    return { allowed: used < limit, used, limit, tier };
  } catch (e) {
    console.error('voice quota', e.message);
    return { allowed: false, used: 0, limit, tier };
  }
}

const MAX_VOICE_SECONDS_ERROR = `Voice notes are limited to ${MAX_VOICE_SECONDS} seconds.`;
function validateVoiceDuration(seconds) {
  return typeof seconds === 'number' && seconds > 0 && seconds <= MAX_VOICE_SECONDS;
}

// Hicham's explicit ask: "in case of subscription cancel, will delete
// automatically all voice notes." Voice notes are a subscriber-only perk
// (VOICE_NOTE_DAILY_LIMIT.none === 0 above), so once a subscription
// genuinely ends they stop being something the seeker is paying for access
// to. Deliberately wired to the webhook-confirmed final cancellation
// (subscription_status actually becoming 'canceled' -- see
// routes/subscription.js's webhook handlers) rather than the moment
// POST /cancel is called: that call only sets subscription_cancel_at and
// leaves status 'active' through the remaining paid period
// (cancel_at_period_end), matching how "canceled" is defined everywhere
// else in this codebase (the grace-period banner fix, the account-wide
// 30-day retention policy). This is a genuine interpretation call, not a
// certainty -- flagged for Hicham to confirm rather than guessed silently:
// if he actually means the moment someone clicks Cancel (i.e. immediately,
// even during the grace period they're still paying for), this is the one
// line (the webhook call site) that needs to move earlier, not a redesign.
//
// Mirrors scripts/document-retention.js's own storage-then-row deletion
// order exactly, rather than inventing a second way to delete an upload.
async function deleteAllVoiceNotes(profileId) {
  const BUCKET = process.env.DOCUMENTS_BUCKET || 'documents';
  const { data: rows, error } = await supabase.from('document_uploads')
    .select('id, storage_path')
    .eq('profile_id', profileId)
    .eq('kind', 'voice_note');
  if (error) { console.error('voice note cleanup read', error.message); return 0; }
  let removed = 0;
  for (const r of rows || []) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([r.storage_path]);
    if (sErr) { console.error(`voice note cleanup storage ${r.id}`, sErr.message); continue; }
    const { error: dErr } = await supabase.from('document_uploads').delete().eq('id', r.id);
    if (dErr) console.error(`voice note cleanup row ${r.id}`, dErr.message); else removed++;
  }
  return removed;
}

module.exports = {
  MAX_VOICE_SECONDS, MAX_VOICE_SECONDS_ERROR, validateVoiceDuration,
  VOICE_NOTE_DAILY_LIMIT, voiceNoteDailyLimit, checkVoiceNoteQuota,
  deleteAllVoiceNotes,
};
