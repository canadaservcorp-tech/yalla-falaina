// Founding Month lead capture — a seeker's request against an unclaimed listing.
//
// Open to visitors without an account on purpose: the point of the window is that a seeker can
// reach an unclaimed listing at all. The contractor's phone number is never returned.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const { authenticate } = require('../lib/auth-mw');
const leads = require('../lib/leads');
const window_ = require('../lib/open-access');
const claimPage = require('../lib/claim-page');
const router = express.Router();

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
// Enough to call someone back: a phone number or an email address.
const usableContact = v => /\d[\d\s().-]{8,}/.test(v) || /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(v);

// What the seeker's modal needs about an unclaimed listing it found in search: the licence to
// address the request to, and the name to show. Unclaimed only — a claimed provider is reached
// through chat, and this would otherwise be a way to look up anyone by id.
router.get('/listing/:id', sec.limits.api, async (req, res) => {
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid provider' });
  try {
    const { data: p, error } = await supabase.from('providers')
      .select('user_id, display_name, city, rbq_licence, claimed').eq('user_id', Number(req.params.id)).maybeSingle();
    if (error) throw error;
    if (!p || p.claimed || !p.rbq_licence) return res.status(404).json({ error: 'Listing not found' });
    if (!window_.covers(p.city)) return res.status(403).json({ error: 'Open access is closed' });
    res.json({ success: true, licence: p.rbq_licence, name: p.display_name, city: p.city, ...window_.status() });
  } catch (e) {
    console.error('lead listing', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// The requests waiting on the provider's own listing, readable once he has claimed it.
router.get('/mine', authenticate, sec.requireActiveUser, sec.limits.api, async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  try {
    const { data, error } = await supabase.from('listing_leads')
      .select('id, seeker_name, seeker_contact, seeker_city, message, trade, created_at')
      .eq('provider_user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const views = await leads.viewsSince(req.user.id, 30).catch(() => null);
    await supabase.from('listing_leads').update({ read_at: new Date().toISOString() })
      .eq('provider_user_id', req.user.id).is('read_at', null);
    res.json({ success: true, leads: data || [], views });
  } catch (e) {
    console.error('leads mine', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', sec.limits.claim, async (req, res) => {
  const licence = str(req.body && req.body.licence, 20);
  const name = str(req.body && req.body.name, 60);
  const contact = str(req.body && req.body.contact, 120);
  const city = str(req.body && req.body.city, 60);
  const message = str(req.body && req.body.message, 600);
  const trade = str(req.body && req.body.trade, 60);
  const consent = req.body && req.body.consent === true;

  if (!claimPage.isLicence(licence)) return res.status(400).json({ error: 'Invalid licence' });
  if (name.length < 2) return res.status(400).json({ error: 'Name required' });
  if (!usableContact(contact)) return res.status(400).json({ error: 'A phone number or email is required' });
  // The provider is told a seeker found him here; the seeker has to have seen that said so.
  if (!consent) return res.status(400).json({ error: 'Consent required' });

  try {
    const { data: provider, error } = await supabase.from('providers')
      .select('user_id, display_name, city, claimed').eq('rbq_licence', licence).maybeSingle();
    if (error) throw error;
    if (!provider) return res.status(404).json({ error: 'Listing not found' });
    // A claimed listing has its own chat: this path exists only for the unclaimed ones.
    if (provider.claimed) return res.status(409).json({ error: 'Listing already claimed' });
    if (!window_.covers(provider.city)) return res.status(403).json({ error: 'Open access is closed' });

    const status = window_.status();
    const { notified } = await leads.create({
      provider, licence, name, contact, city: city || provider.city, message, trade, window: status,
    });
    res.json({ success: true, notified, until: status.until, days_left: status.daysLeft });
  } catch (e) {
    console.error('lead', e);
    res.status(500).json({ error: 'Could not send your request' });
  }
});

module.exports = router;
