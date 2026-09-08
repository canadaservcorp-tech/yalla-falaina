'use strict';

// Daily fair-use quota (idea-configuration doc Section 4.3): every concierge
// turn costs units — text=1, voice=3, photo/document=4 — tracked per user per
// UTC day in `daily_usage`. The tier sets the ceiling; the subscription row
// on `users` says which tier is active.

const supabase = require('../db');

// Phase 1 ships a single paid tier ($25 Basic). Higher tiers are listed so
// the paywall doesn't need a code change when pricing opens up.
const TIER_UNITS = {
  none: 5,          // a few free questions so a seeker can try the concierge
  basic: 40,
  starter: 15,
  plus: 120,
  unlimited: 10000, // effectively uncapped, still counted for abuse signals
};

const COST = { text: 1, voice: 3, photo: 4 };

function tierLimit(tier) {
  return TIER_UNITS[tier] ?? TIER_UNITS.none;
}

async function unitsUsedToday(profileId) {
  const { data, error } = await supabase.from('daily_usage')
    .select('units_used')
    .eq('profile_id', profileId)
    .eq('usage_date', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (error) { console.error('usage read', error.message); return 0; }
  return Number(data?.units_used || 0);
}

// Returns { allowed, used, limit, tier }. A DB failure fails closed for a
// paid tier and open for none — a broken counter must not block a paying
// seeker, but it also must not make the concierge free for everyone.
async function checkQuota(profileId, tier, units = COST.text) {
  const limit = tierLimit(tier);
  try {
    const used = await unitsUsedToday(profileId);
    return { allowed: used + units <= limit, used, limit, tier };
  } catch (e) {
    console.error('quota', e.message);
    return { allowed: tier !== 'none', used: 0, limit, tier };
  }
}

async function charge(profileId, units = COST.text) {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('daily_usage')
    .select('units_used')
    .eq('profile_id', profileId)
    .eq('usage_date', day)
    .maybeSingle();
  const next = Number(data?.units_used || 0) + units;
  const { error } = await supabase.from('daily_usage')
    .upsert({ profile_id: profileId, usage_date: day, units_used: next },
      { onConflict: 'profile_id,usage_date' });
  if (error) console.error('usage charge', error.message);
  return next;
}

module.exports = { TIER_UNITS, COST, tierLimit, checkQuota, charge };
