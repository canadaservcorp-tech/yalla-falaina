// Records what seekers searched for, coarsely, and answers "how many searches happened near
// this provider" — the only honest way to tell a contractor that clients are looking for them.
const supabase = require('../db');

// ~1 km. Enough to say "near Laval", not enough to point at a home.
const round = n => Math.round(n * 100) / 100;

// Fire-and-forget: a failed write must never make a search fail.
function record({ professionId = null, professionIds = null, term = null, lat, lng, results = 0 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const id = professionId || (Array.isArray(professionIds) && professionIds.length === 1 ? professionIds[0] : null);
  supabase.from('search_demand').insert({
    profession_id: id,
    term: term ? String(term).toLowerCase().slice(0, 60) : null,
    lat: round(lat), lng: round(lng), results,
  }).then(r => { if (r.error) console.error('demand', r.error.message); },
    e => console.error('demand', e.message));
}

async function near({ lat, lng, radiusKm = 15, professionIds = null, days = 7 }) {
  const { data, error } = await supabase.rpc('demand_near', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusKm * 1000,
    p_profession_ids: professionIds && professionIds.length ? professionIds : null,
    p_days: days,
  });
  if (error) throw error;
  return Number(data) || 0;
}

async function byTrade(days = 7) {
  const { data, error } = await supabase.rpc('demand_by_trade', { p_days: days });
  if (error) throw error;
  return data || [];
}

module.exports = { record, near, byTrade };
