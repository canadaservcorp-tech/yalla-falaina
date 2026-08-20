// Favorites — seeker bookmarks. A bookmark must never become a way to keep watching
// an offline provider: city and contactability are withheld exactly like search distance.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();

const seekerOnly = (req, res, next) => req.user.role === 'seeker'
  ? next()
  : res.status(403).json({ error: 'Only seekers can save favorites' });

// POST /api/favorites  { providerId }
router.post('/', authenticate, sec.requireActiveUser, seekerOnly, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.body.providerId)) return res.status(400).json({ error: 'Invalid provider' });
    const providerId = Number(req.body.providerId);
    const { data: prov } = await supabase.from('providers')
      .select('user_id, claimed').eq('user_id', providerId).maybeSingle();
    if (!prov || prov.claimed === false) return res.status(404).json({ error: 'Provider not found' });

    const { error } = await supabase.from('favorites')
      .upsert({ seeker_id: req.user.id, provider_id: providerId });
    if (error) { console.error('favorite add', error); return res.status(500).json({ error: 'Server error' }); }
    res.json({ success: true });
  } catch (e) { console.error('favorite add', e); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/favorites/:providerId
router.delete('/:providerId', authenticate, sec.requireActiveUser, seekerOnly, sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.params.providerId)) return res.status(400).json({ error: 'Invalid provider' });
    const { error } = await supabase.from('favorites').delete()
      .eq('seeker_id', req.user.id).eq('provider_id', Number(req.params.providerId));
    if (error) { console.error('favorite remove', error); return res.status(500).json({ error: 'Server error' }); }
    res.json({ success: true });
  } catch (e) { console.error('favorite remove', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/favorites — my bookmarks, privacy-filtered
router.get('/', authenticate, sec.requireActiveUser, seekerOnly, async (req, res) => {
  try {
    // read the flag per request: Railway can change it without a code deploy
    const paywall = process.env.PAYWALL_ENFORCED === 'true';
    const { data: favs } = await supabase.from('favorites')
      .select('provider_id').eq('seeker_id', req.user.id);
    const ids = [...new Set((Array.isArray(favs) ? favs : []).map(f => f.provider_id))];
    if (!ids.length) return res.json({ success: true, favorites: [] });

    const { data: provs } = await supabase.from('providers')
      .select('user_id, display_name, city, availability, is_licensed, rating, review_count, claimed')
      .in('user_id', ids);
    const { data: users } = await supabase.from('users').select('id, subscription_status').in('id', ids);
    const subOf = new Map((Array.isArray(users) ? users : []).map(u => [u.id, u.subscription_status]));

    const favorites = (Array.isArray(provs) ? provs : []).map(p => {
      const online = p.availability === 'available' || p.availability === 'busy';
      const contactable = !!p.claimed && online && (!paywall || subOf.get(p.user_id) === 'active');
      const out = {
        id: p.user_id, name: p.display_name, is_licensed: p.is_licensed,
        rating: p.rating, review_count: p.review_count, contactable,
      };
      // offline, unsubscribed or unclaimed: name and badge only — no city, no contact
      if (contactable) out.city = p.city; else out.unavailable = true;
      return out;
    });
    res.json({ success: true, favorites });
  } catch (e) { console.error('favorite list', e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
