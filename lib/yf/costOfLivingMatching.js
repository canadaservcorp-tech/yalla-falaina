'use strict';

// Cost-of-living notes (Hicham's ask: seekers/students need to know what life
// actually costs in a destination city before committing). Curated, not
// model-reasoned -- see cost_of_living_notes' own schema.sql comment for why
// a specific figure must stay a retrieved fact, never something the model
// estimates or remembers from training data (costs change constantly and a
// stale confident number is worse than an honest gap).

const supabase = require('../../db');

function toPromptCostNote(row) {
  return {
    id: row.id,
    category: row.category,
    city: row.city || '',
    country: row.country,
    monthlyEstimateNote: row.monthly_estimate_note,
    sourceUrl: row.source_url || '',
    updatedAt: row.updated_at,
  };
}

// City-specific notes first (most useful and most likely to be accurate),
// then a country-wide estimate as a fallback -- same "specific first, general
// fallback" pattern as lib/yf/communityMatching.js, never a hard filter down
// to zero just because this exact city has nothing curated yet.
async function retrieveCostOfLiving({ country, city, limit = 5 } = {}) {
  if (!country) return [];
  const { data, error } = await supabase.from('cost_of_living_notes')
    .select('id, country, city, category, monthly_estimate_note, source_url, updated_at')
    .eq('status', 'active')
    .ilike('country', country)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) { console.error('cost of living notes load', error.message); return []; }
  const rows = (data || []).map(toPromptCostNote);
  if (!city) return rows.slice(0, limit);

  const cityMatch = rows.filter(r => r.city && r.city.toLowerCase() === city.toLowerCase());
  const countryWide = rows.filter(r => !r.city);
  const rest = rows.filter(r => r.city && r.city.toLowerCase() !== city.toLowerCase());
  return [...cityMatch, ...countryWide, ...rest].slice(0, limit);
}

module.exports = { retrieveCostOfLiving, toPromptCostNote };
