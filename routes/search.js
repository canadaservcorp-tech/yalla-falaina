const express = require('express');
const supabase = require('../db');
const { approx } = require('../lib/distance');
const router = express.Router();

// Toggle: when false, show all providers (thin-launch); when true, only subscribed appear.
const PAYWALL = process.env.PAYWALL_ENFORCED === 'true';

// GET /api/search?lat=&lng=&radius_km=&profession_id=&category=&q=&lang=
// Returns providers sorted NEAREST-FIRST, with approximate (privacy-safe) distance.
router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });
    const radiusM = (parseFloat(req.query.radius_km) || 10) * 1000;
    const lang = req.query.lang === 'en' ? 'en' : 'fr';
    const professionId = req.query.profession_id ? parseInt(req.query.profession_id) : null;
    const category = req.query.category || null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    // Raw SQL via RPC for the distance sort + radius filter (earthdistance).
    const { data, error } = await supabase.rpc('search_providers', {
      p_lat: lat, p_lng: lng, p_radius_m: radiusM,
      p_profession_id: professionId, p_category: category, p_q: q,
      p_paywall: PAYWALL,
    });
    if (error) throw error;

    const providers = (data || []).map(r => ({
      id: r.user_id, name: r.display_name, bio: r.bio, city: r.city,
      neighbourhood: r.neighbourhood, languages: r.languages, availability: r.availability,
      available_now: r.available_now, is_licensed: r.is_licensed, featured: r.featured,
      rating: r.rating, review_count: r.review_count,
      claimed: r.claimed !== false,                 // unclaimed RBQ seeds show but can't be contacted
      contactable: r.contactable !== undefined ? r.contactable : true,
      distance_label: approx(r.distance_m, lang),   // approximate only — never exact address
    }));
    res.json({ success: true, count: providers.length, paywall: PAYWALL, providers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
