'use strict';

// Couch-surfing / roommate / sublet board retrieval -- same city/country
// directory-style lookup as lib/yf/communityMatching.js (there are few
// enough live posts per city for a plain filter to be the honest match, not
// an invented relevance score), plus the same freshness discipline as an
// approved informal job listing (lib/yf/matching.js/routes/admin-informal-
// listings.js): an expired posting is exactly as unusable as a stale job
// lead, so `expires_at` is checked the same way.

const supabase = require('../../db');

function toPromptListing(row) {
  return {
    id: row.id,
    type: row.type, // 'couchsurf' | 'roommate' | 'sublet'
    country: row.country,
    city: row.city,
    budgetNote: row.budget_note || '',
    description: row.description || '',
    contact: row.contact,
  };
}

async function retrieveAccommodationListings({ country, city, limit = 5 } = {}) {
  if (!country) return [];
  const now = new Date().toISOString();
  let q = supabase.from('accommodation_listings')
    .select('id, type, country, city, budget_note, description, contact, expires_at')
    .eq('status', 'active')
    .ilike('country', country)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(200);
  const { data, error } = await q;
  if (error) { console.error('accommodation listings load', error.message); return []; }
  const rows = (data || []).map(toPromptListing);
  if (!city) return rows.slice(0, limit);

  const cityMatch = rows.filter(r => r.city.toLowerCase() === city.toLowerCase());
  const rest = rows.filter(r => r.city.toLowerCase() !== city.toLowerCase());
  return [...cityMatch, ...rest].slice(0, limit);
}

module.exports = { retrieveAccommodationListings, toPromptListing };
