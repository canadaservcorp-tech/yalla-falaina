'use strict';

// Country risk notes (Hicham's explicit ask: "highlight the risk of every
// country, in case exist"). Curated, not model-reasoned -- see
// country_risk_notes' own schema.sql comment for why this must stay a
// retrieved fact, never something the model estimates from training data.

const supabase = require('../../db');

function toPromptRisk(row) {
  return {
    id: row.id,
    category: row.category,
    riskLevel: row.risk_level || '',
    summary: row.summary,
    sourceUrl: row.source_url || '',
    updatedAt: row.updated_at,
  };
}

async function retrieveCountryRisks({ country, limit = 5 } = {}) {
  if (!country) return [];
  const { data, error } = await supabase.from('country_risk_notes')
    .select('id, country, category, risk_level, summary, source_url, updated_at')
    .eq('status', 'active')
    .ilike('country', country)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('country risk notes load', error.message); return []; }
  return (data || []).map(toPromptRisk);
}

module.exports = { retrieveCountryRisks, toPromptRisk };
