// TrouvePro — claim an unclaimed RBQ seed listing.
// A registered provider claims a seed listing (by its id). We transfer the
// listing's services + licence onto their real account, then delete the placeholder.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const page = require('../lib/claim-page');
const funnel = require('../lib/funnel');
const router = express.Router();

const escapeLike = s => s.replace(/[%_\\]/g, c => '\\' + c);

// The only unauthenticated route here: the landing page sends a contractor to
// /?claim_licence=<licence>, and the app has to name the listing being claimed
// before they have an account. Answers with what the RBQ register publishes.
router.get('/listing', sec.limits.claim, async (req, res) => {
  const licence = String(req.query.licence || '');
  if (!page.isLicence(licence)) return res.status(404).json({ error: 'Unknown listing' });
  const { data, error } = await supabase.from('providers')
    .select('user_id, display_name, city, rbq_licence, claimed')
    .eq('rbq_licence', licence).eq('claimed', false).eq('source', 'rbq_seed').maybeSingle();
  if (error) { console.error('claim listing', error); return res.status(500).json({ error: 'Lookup failed' }); }
  if (!data) return res.status(404).json({ error: 'Unknown listing' });
  res.json({ success: true, seedUserId: data.user_id, business_name: data.display_name || '', city: data.city || '', rbq_licence: data.rbq_licence });
});

router.use(authenticate, sec.requireActiveUser);

// GET /api/claim/search?q=CompanyName  -> find unclaimed RBQ listings to claim
router.get('/search', sec.limits.claim, async (req, res) => {
  try {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ success: true, matches: [] });
    const { data, error } = await supabase.from('providers')
      .select('user_id, display_name, city, rbq_licence')
      .eq('claimed', false).eq('source', 'rbq_seed')
      .ilike('display_name', `%${escapeLike(q)}%`).limit(10);
    if (error) throw error;
    res.json({ success: true, matches: data || [] });
  } catch (e) { console.error('claim search', e); res.status(500).json({ error: 'Search failed' }); }
});

// POST /api/claim  { seedUserId }  -> transfer that seed listing to the logged-in provider
router.post('/', sec.limits.claim, async (req, res) => {
  try {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
    const seedUserId = Number(req.body.seedUserId);
    if (!Number.isSafeInteger(seedUserId) || seedUserId <= 0)
      return res.status(400).json({ error: 'Invalid listing id' });
    if (seedUserId === req.user.id) return res.status(400).json({ error: 'Invalid listing id' });

    const { data: seed, error: seedErr } = await supabase.from('providers')
      .select('*').eq('user_id', seedUserId).eq('claimed', false).eq('source', 'rbq_seed').maybeSingle();
    if (seedErr) throw seedErr;
    if (!seed) return res.status(404).json({ error: 'Listing not found or already claimed' });

    const { data: mine, error: mineErr } = await supabase.from('providers')
      .select('user_id, city').eq('user_id', req.user.id).maybeSingle();
    if (mineErr) throw mineErr;
    if (!mine) return res.status(404).json({ error: 'Provider profile not found' });

    // move services from seed -> real provider (max 4, same cap as the profile route)
    const { data: svcs, error: svcErr } = await supabase.from('provider_services')
      .select('profession_id').eq('provider_id', seedUserId);
    if (svcErr) throw svcErr;
    if (svcs && svcs.length) {
      const del = await supabase.from('provider_services').delete().eq('provider_id', req.user.id);
      if (del.error) throw del.error;
      const ins = await supabase.from('provider_services').insert(
        svcs.slice(0, 4).map(s => ({ provider_id: req.user.id, profession_id: s.profession_id })));
      if (ins.error) throw ins.error;
    }

    // copy the licence onto the real provider and mark it claimed
    const patch = { rbq_licence: seed.rbq_licence, is_licensed: !!seed.rbq_licence, claimed: true, source: 'claimed_rbq' };
    if (!mine.city && seed.city) patch.city = seed.city;
    const upd = await supabase.from('providers').update(patch).eq('user_id', req.user.id);
    if (upd.error) throw upd.error;

    // remove the placeholder (cascades to its provider row + services)
    const delUser = await supabase.from('users').delete().eq('id', seedUserId);
    if (delUser.error) throw delUser.error;

    // converted: stop the marketing list from emailing this licence again
    if (seed.rbq_licence) {
      const stop = await supabase.from('outreach_contacts')
        .update({ claimed_user_id: req.user.id }).eq('rbq_licence', seed.rbq_licence);
      if (stop.error) console.error('outreach claim link', stop.error);
    }

    funnel.track('claimed', { licence: seed.rbq_licence, userId: req.user.id });
    res.json({ success: true, message: 'Listing claimed — set your location & subscribe to go live.' });
  } catch (e) { console.error('claim', e); res.status(500).json({ error: 'Could not claim this listing' }); }
});
module.exports = router;
