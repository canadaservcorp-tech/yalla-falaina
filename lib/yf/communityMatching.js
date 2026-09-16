'use strict';

// Diaspora & community-group directory retrieval -- deliberately NOT a
// keyword scorer like jobs/study opportunities: a community group is either
// in the seeker's destination city/country or it isn't, and there are few
// enough curated rows per city that a plain country/city filter is the
// honest match, not an invented relevance score. Same retrieve-don't-recall
// discipline: the model only ever names a group that's actually in here
// (lib/yf/systemPrompt.js's COMMUNITY_CONTEXT), never a plausible-sounding
// one it made up.

const supabase = require('../../db');

function toPromptGroup(row) {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    url: row.url,
    country: row.country,
    city: row.city || '',
    language: row.language || '',
  };
}

// City match first (most specific and most useful to a seeker), then any
// country-wide group as a fallback -- never a hard filter to zero results
// just because the seeker's exact city has no curated group yet.
async function retrieveCommunityGroups({ country, city, limit = 5 } = {}) {
  if (!country) return [];
  const { data, error } = await supabase.from('community_groups')
    .select('id, country, city, platform, name, url, language')
    .eq('status', 'active')
    .ilike('country', country)
    .limit(200);
  if (error) { console.error('community groups load', error.message); return []; }
  const rows = (data || []).map(toPromptGroup);
  if (!city) return rows.slice(0, limit);

  const cityMatch = rows.filter(r => r.city && r.city.toLowerCase() === city.toLowerCase());
  const countryWide = rows.filter(r => !r.city);
  const rest = rows.filter(r => r.city && r.city.toLowerCase() !== city.toLowerCase());
  return [...cityMatch, ...countryWide, ...rest].slice(0, limit);
}

module.exports = { retrieveCommunityGroups, toPromptGroup };
