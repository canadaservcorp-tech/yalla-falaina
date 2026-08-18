const express = require('express');
const supabase = require('../db');
const { authenticate, optionalAuth } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();

const AVAILABILITY = ['available', 'busy', 'away'];
// exposed to anyone; exact coordinates and licence stay private (search returns approximate distance only)
const PUBLIC_FIELDS = ['user_id', 'display_name', 'bio', 'city', 'neighbourhood', 'languages',
  'availability', 'available_now', 'hours_note', 'is_licensed', 'featured', 'rating', 'review_count',
  'avatar_url', 'claimed'];

// Provider updates their own profile (location, bio, languages, availability, up to 4 services)
router.put('/me', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
    const b = req.body || {};
    const patch = {};
    if (b.display_name !== undefined) {
      const v = sec.clean(b.display_name, 80);
      if (!v) return res.status(400).json({ error: 'Name is required' });
      patch.display_name = v;
    }
    if (b.bio !== undefined) patch.bio = sec.clean(b.bio, 1000) || '';
    if (b.city !== undefined) patch.city = sec.clean(b.city, 80) || '';
    if (b.neighbourhood !== undefined) patch.neighbourhood = sec.clean(b.neighbourhood, 80) || '';
    if (b.hours_note !== undefined) patch.hours_note = sec.clean(b.hours_note, 200) || '';
    if (b.avatar_url !== undefined) {
      const url = sec.clean(b.avatar_url, 500) || '';
      if (url && !/^https:\/\//.test(url)) return res.status(400).json({ error: 'avatar_url must be https' });
      patch.avatar_url = url;
    }
    if (b.lat !== undefined || b.lng !== undefined) {
      const lat = Number(b.lat), lng = Number(b.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return res.status(400).json({ error: 'Invalid coordinates' });
      patch.lat = lat; patch.lng = lng;
    }
    if (b.languages !== undefined) {
      if (!Array.isArray(b.languages) || b.languages.length > 6) return res.status(400).json({ error: 'Invalid languages' });
      patch.languages = b.languages.map(l => sec.clean(l, 20)).filter(Boolean);
    }
    if (b.availability !== undefined) {
      if (!AVAILABILITY.includes(b.availability)) return res.status(400).json({ error: 'Invalid availability' });
      patch.availability = b.availability;
    }
    if (b.available_now !== undefined) patch.available_now = !!b.available_now;
    if (b.rbq_licence !== undefined) {
      const lic = sec.clean(b.rbq_licence, 20) || '';
      if (lic && !/^[0-9-]{4,20}$/.test(lic)) return res.status(400).json({ error: 'Invalid RBQ licence' });
      patch.rbq_licence = lic; patch.is_licensed = !!lic;
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('providers').update(patch).eq('user_id', req.user.id);
      if (error) throw error;
    }

    // up to 4 services
    if (b.services !== undefined) {
      if (!Array.isArray(b.services) || b.services.length > 4) return res.status(400).json({ error: 'Max 4 services' });
      const ids = b.services.map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
      if (ids.length !== b.services.length) return res.status(400).json({ error: 'Invalid service id' });
      await supabase.from('provider_services').delete().eq('provider_id', req.user.id);
      if (ids.length) {
        const ins = await supabase.from('provider_services')
          .insert([...new Set(ids)].map(pid => ({ provider_id: req.user.id, profession_id: pid })));
        if (ins.error) return res.status(400).json({ error: 'Invalid service id' });
      }
    }
    res.json({ success: true });
  } catch (e) { console.error('provider update', e); res.status(500).json({ error: 'Could not save profile' }); }
});

router.get('/:id', optionalAuth, async (req, res) => {
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const id = Number(req.params.id);
  const { data: p } = await supabase.from('providers').select('*').eq('user_id', id).maybeSingle();
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { data: svc } = await supabase.from('provider_services')
    .select('profession_id, professions(name_fr,name_en,licence,licence_note)').eq('provider_id', id);
  const mine = req.user && req.user.id === id;
  const provider = mine ? p : Object.fromEntries(PUBLIC_FIELDS.map(k => [k, p[k]]));
  res.json({ success: true, provider: { ...provider, services: svc || [] } });
});
module.exports = router;
