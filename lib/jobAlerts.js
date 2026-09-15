// New-job push notifications — the hook lib/jobsIngest.js's refresh() calls
// on every scheduled ingest. An upsert can't tell "this row is brand new"
// from "this row already existed and just got refreshed" on its own, so
// findNewRows() below has to ask BEFORE the upsert runs, not after.
//
// Matching is deliberately simple for Phase 1: a profile's own sector/
// role_type/preferred_country (free text the seeker typed at signup, Section
// 10 intake) as substrings against the job's category/title/country — same
// "no promises, no ranking, no invented precision" spirit as the concierge's
// own matching engine. This hook exists to wire the notification pipe
// end-to-end; refining the matching logic itself is separate work.
const supabase = require('../db');
const webPush = require('./webPush');

const MAX_PER_USER_PER_RUN = 3; // a big ingest run must not read as spam

// rows: the array lib/jobsIngest.js's refresh() is ABOUT TO upsert (already
// filtered to title+country present). Must run before that upsert loop — it
// reads the CURRENT state of `jobs` to tell "already existed" from "brand new".
async function findNewRows(rows) {
  if (!rows || !rows.length) return [];
  const ids = [...new Set(rows.map(r => r.external_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('jobs').select('external_source, external_id').in('external_id', ids);
  if (error) { console.error('jobAlerts: findNewRows lookup', error.message); return []; }
  const known = new Set((data || []).map(r => r.external_source + '|' + r.external_id));
  return rows.filter(r => r.external_id && !known.has(r.external_source + '|' + r.external_id));
}

const norm = s => String(s || '').toLowerCase().trim();

// An unset profile field is a wildcard on that dimension, not a non-match —
// a seeker who never filled in "sector" still wants to hear about a country
// match. A profile with NOTHING set matches every job, by design: better to
// occasionally over-notify a seeker who gave no preference at all than to
// silently notify no one just because intake is incomplete.
function matches(profile, job) {
  if (!profile) return false;
  const country = norm(profile.preferred_country);
  if (country && norm(job.country) !== country) return false;
  const sector = norm(profile.sector);
  const role = norm(profile.role_type);
  const haystack = norm(job.category) + ' ' + norm(job.title);
  if (sector && !haystack.includes(sector)) return false;
  if (role && !haystack.includes(role)) return false;
  return true;
}

// newRows: findNewRows()'s output, from the SAME ingest run. Sends at most
// MAX_PER_USER_PER_RUN job-match notifications per subscribed user (across
// however many browsers/devices they've opted in on), and never throws —
// one bad subscription or one broken profile lookup must not abort the
// ingest job that's calling this.
async function notifyNewJobs(newRows) {
  if (!webPush.configured() || !newRows || !newRows.length) return 0;
  try {
    const { data: subs, error: subErr } = await supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth');
    if (subErr) { console.error('jobAlerts: subscriptions lookup', subErr.message); return 0; }
    if (!subs || !subs.length) return 0;

    const userIds = [...new Set(subs.map(s => s.user_id))];
    const { data: profiles, error: pErr } = await supabase.from('profiles')
      .select('id, sector, role_type, preferred_country').in('id', userIds);
    if (pErr) { console.error('jobAlerts: profiles lookup', pErr.message); return 0; }
    const profileById = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const byUser = new Map();
    for (const s of subs) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }

    let sent = 0;
    for (const [userId, userSubs] of byUser) {
      const profile = profileById[userId];
      const matched = newRows.filter(j => matches(profile, j)).slice(0, MAX_PER_USER_PER_RUN);
      if (!matched.length) continue;
      for (const job of matched) {
        const payload = {
          title: 'Yalla Nsafer — new match',
          body: [job.title, job.country].filter(Boolean).join(' — '),
          url: '/',
        };
        for (const sub of userSubs) {
          const result = await webPush.sendNotification(sub, payload);
          if (result.sent) sent++;
        }
      }
    }
    return sent;
  } catch (e) { console.error('jobAlerts: notifyNewJobs', e.message); return 0; }
}

module.exports = { findNewRows, matches, notifyNewJobs, MAX_PER_USER_PER_RUN };
