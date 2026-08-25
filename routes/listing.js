// TrouvePro — public claim landing page for a seeded RBQ listing: /fiche/<licence>.
//
// Public by necessity (the contractor we are inviting has no account yet) and
// deliberately narrow: it answers with what the RBQ register already publishes
// about that licence — never an email, a phone number or coordinates.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const page = require('../lib/claim-page');
const funnel = require('../lib/funnel');
const foundingOffer = require('../lib/founding');
const router = express.Router();

const TOKEN = /^[a-f0-9]{32}$/;

async function listing(licence) {
  const { data: p, error } = await supabase.from('providers')
    .select('user_id, display_name, city, rbq_licence, claimed')
    .eq('rbq_licence', licence).order('claimed').limit(1).maybeSingle();
  if (error) throw error;
  if (!p) return null;
  const { data: svcs } = await supabase.from('provider_services')
    .select('professions(name_fr, name_en)').eq('provider_id', p.user_id);
  const trades = (svcs || []).map(s => s.professions).filter(Boolean);
  return { ...p, trades };
}

router.get('/:licence', sec.limits.api, async (req, res) => {
  const licence = req.params.licence;
  if (!page.isLicence(licence)) return res.status(404).type('html').send(notFound());
  try {
    const found = await listing(licence);
    if (!found) return res.status(404).type('html').send(notFound());
    const lang = req.query.lang === 'en' ? 'en' : 'fr';
    const token = TOKEN.test(String(req.query.t || '')) ? String(req.query.t) : null;
    if (!found.claimed) {
      // fire and forget: a slow insert must not delay the page
      funnel.track('landing', { licence, source: token ? 'rbq_email' : (req.query.utm_source || null) });
    }
    const founding = found.claimed ? null : await foundingOffer.status().catch(() => null);
    res.type('html').send(page.render(found, { lang, token, founding }));
  } catch (e) {
    console.error('claim landing', e);
    res.status(500).type('html').send(notFound());
  }
});

const notFound = () => '<!doctype html><meta charset="utf-8"><title>TrouvePro</title>'
  + '<body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto">'
  + '<h2>Fiche introuvable / Listing not found</h2>'
  + '<p><a href="/" style="color:#0f7c7b">TrouvePro</a></p></body>';

module.exports = router;
