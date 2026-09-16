'use strict';

// Trusted-partner referral (Hicham's explicit ask: "link the users with
// trusted service providers, like immigration consultant or office, and
// lawyers, after our concierge verification, will seek the best service
// provider and advice, to choose, and support to take decision"). Reads the
// EXISTING b2b_partners table (schema.sql) as-is -- no migration needed.
// Only ever surfaces a partner that is BOTH licence_verified=true and
// status='active': an unverified or suspended partner must never reach a
// seeker as a "trusted" recommendation, whatever their listing_tier is.

const supabase = require('../../db');

function toPromptPartner(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    category: row.category || '',
    countriesServed: row.countries_served || [],
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone || '',
    licenceNumber: row.licence_number || '',
  };
}

// category: 'immigration_consultant' | 'travel_agency' | 'relocation_service' (optional filter)
// country: weights toward a partner whose countries_served includes it, never a hard filter --
// a seeker's destination might not have a dedicated partner yet, and a general one is still worth naming.
async function retrieveTrustedPartners({ country, category, limit = 3 } = {}) {
  let q = supabase.from('b2b_partners')
    .select('id, company_name, contact_email, contact_phone, licence_number, category, countries_served, listing_tier')
    .eq('licence_verified', true)
    .eq('status', 'active')
    .limit(200);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) { console.error('trusted partners load', error.message); return []; }
  const rows = (data || []).map(toPromptPartner);
  if (!country) return rows.slice(0, limit);

  const serving = rows.filter(r => r.countriesServed.some(c => c.toLowerCase() === country.toLowerCase()));
  const general = rows.filter(r => !r.countriesServed.some(c => c.toLowerCase() === country.toLowerCase()));
  return [...serving, ...general].slice(0, limit);
}

module.exports = { retrieveTrustedPartners, toPromptPartner };
