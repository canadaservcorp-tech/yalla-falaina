const express = require('express');
const supabase = require('../db');
const { approx } = require('../lib/distance');
const activities = require('../lib/activities');
const demand = require('../lib/demand');
const router = express.Router();

// The catalogue changes only when we seed it, so keyword expansion reads it once per 10 minutes.
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalog = { at: 0, rows: [] };
async function professions() {
  if (Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.rows;
  const { data, error } = await supabase.from('professions').select('id,name_fr,name_en');
  if (error || !(data || []).length) return catalog.rows;   // keep serving with whatever we had
  catalog = { at: Date.now(), rows: data };
  return catalog.rows;
}

// Toggle: when false, every provider is treated as online (thin-launch); when true, only
// providers with an active subscription get distance, availability and a contact button.
const PAYWALL = process.env.PAYWALL_ENFORCED === 'true';

// GET /api/search?lat=&lng=&radius_km=&profession_id=&category=&q=&lang=&available_now=&languages=
// Returns providers sorted NEAREST-FIRST, with approximate (privacy-safe) distance.
router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ error: 'lat/lng out of range' });
    const radiusKm = Math.min(Math.max(parseFloat(req.query.radius_km) || 10, 1), 200);
    const radiusM = radiusKm * 1000;
    const lang = req.query.lang === 'en' ? 'en' : 'fr';
    const professionId = /^\d{1,9}$/.test(String(req.query.profession_id || '')) ? parseInt(req.query.profession_id) : null;
    const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 60) : null;
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 80) : null;
    const availableNow = req.query.available_now === 'true' || req.query.available_now === '1';
    const languages = typeof req.query.languages === 'string'
      ? req.query.languages.split(',').map(l => l.trim().slice(0, 20)).filter(Boolean).slice(0, 6)
      : [];

    // A typed keyword reaches every related trade in both languages ("gardener" -> jardinage,
    // aménagement paysager, entretien de pelouse, émondage); the raw text stays as a fallback
    // so a provider's own business name still matches.
    let professionIds = null;
    if (q && !professionId) {
      const ids = activities.resolve(q, await professions());
      if (ids.length) professionIds = ids.slice(0, 40);
    }

    // Raw SQL via RPC for the distance sort + radius filter (earthdistance).
    const { data, error } = await supabase.rpc('search_providers', {
      p_lat: lat, p_lng: lng, p_radius_m: radiusM,
      p_profession_id: professionId, p_category: category, p_q: q,
      p_profession_ids: professionIds,
      p_paywall: PAYWALL,
      p_available_now: availableNow,
      p_languages: languages.length ? languages : null,
    });
    if (error) throw error;

    const providers = (data || []).map(r => ({
      id: r.user_id, name: r.display_name, bio: r.bio, city: r.city,
      neighbourhood: r.neighbourhood, languages: r.languages, availability: r.availability,
      available_now: r.available_now, price_note: r.price_note, is_licensed: r.is_licensed, featured: r.featured,
      rating: r.rating, review_count: r.review_count,
      claimed: r.claimed !== false,                 // unclaimed RBQ seeds show but can't be contacted
      subscribed: r.subscribed === true,
      boosted: r.boosted === true,                  // paid top placement — ordering only
      founding: r.founding === true,                // one of the first 50 paying providers
      contactable: r.contactable !== undefined ? r.contactable : true,
      // offline providers get no distance at all — the SQL returns null for them
      distance_label: r.distance_m == null ? null : approx(r.distance_m, lang),
    }));
    res.json({ success: true, count: providers.length, paywall: PAYWALL, providers });
    demand.record({ professionId, professionIds, term: q, lat, lng, results: providers.length });
  } catch (e) { console.error('search', e); res.status(500).json({ error: 'Search failed' }); }
});
module.exports = router;
