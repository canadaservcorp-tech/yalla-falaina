const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const router = express.Router();

// Provider updates their own profile (location, bio, languages, availability, up to 4 services)
router.put('/me', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
    const { display_name, bio, lat, lng, city, neighbourhood, languages,
            availability, available_now, hours_note, rbq_licence, avatar_url, services } = req.body;

    const patch = { display_name, bio, lat, lng, city, neighbourhood, languages,
                    availability, available_now, hours_note, avatar_url };
    if (rbq_licence !== undefined) { patch.rbq_licence = rbq_licence; patch.is_licensed = !!rbq_licence; }
    Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
    const { error } = await supabase.from('providers').update(patch).eq('user_id', req.user.id);
    if (error) throw error;

    // up to 4 services
    if (Array.isArray(services)) {
      if (services.length > 4) return res.status(400).json({ error: 'Max 4 services' });
      await supabase.from('provider_services').delete().eq('provider_id', req.user.id);
      if (services.length) await supabase.from('provider_services')
        .insert(services.map(pid => ({ provider_id: req.user.id, profession_id: pid })));
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  const { data: p } = await supabase.from('providers').select('*').eq('user_id', req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { data: svc } = await supabase.from('provider_services')
    .select('profession_id, professions(name_fr,name_en,licence,licence_note)').eq('provider_id', req.params.id);
  res.json({ success: true, provider: { ...p, services: svc || [] } });
});
module.exports = router;
