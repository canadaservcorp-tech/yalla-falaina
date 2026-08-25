// Free RBQ licence verifier — GET /verification[?q=&lang=]
//
// Two jobs in one page: it answers a client's question without an account (the only
// reason to visit is trust), and it puts a contractor one click from their own
// unclaimed TrouvePro listing.
const express = require('express');
const supabase = require('../db');
const sec = require('../lib/security');
const page = require('../lib/verify-page');
const router = express.Router();

const DIGITS = /^[0-9]{10}$/;
const LICENCE = /^[0-9]{4}-[0-9]{4}-[0-9]{2}$/;
const FIELDS = 'licence, holder_name, status, licence_type, municipality, region, restricted, categories';

// "1104861806", "1104 8618 06" and "1104-8618-06" are the same licence.
function asLicence(q) {
  const bare = q.replace(/[\s-]/g, '');
  if (DIGITS.test(bare)) return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8)}`;
  return LICENCE.test(q) ? q : null;
}

// A licence in the register may also be one of our seeded listings: that is the
// contractor's way in, and a client's way to the provider's page.
async function listingFor(licence) {
  const { data, error } = await supabase.from('providers')
    .select('rbq_licence, claimed').eq('rbq_licence', licence).order('claimed').limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function byLicence(licence) {
  const { data, error } = await supabase.from('rbq_licences').select(FIELDS)
    .eq('licence', licence).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const listing = await listingFor(data.licence).catch(() => null);
  return { ...data, listing };
}

async function byName(name) {
  const { data, error } = await supabase.from('rbq_licences').select(FIELDS)
    .ilike('holder_name', `%${name}%`).order('holder_name').limit(10);
  if (error) throw error;
  return data || [];
}

router.get('/', sec.limits.api, async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'fr';
  const q = String(req.query.q == null ? '' : req.query.q).trim().slice(0, 80);
  try {
    if (!q) return res.type('html').send(page.render({ lang }));
    const licence = asLicence(q);
    const hit = licence ? await byLicence(licence) : null;
    if (hit) return res.type('html').send(page.render({ lang, q, result: { hit } }));
    // a licence-shaped query that is not in the register is a miss, not a name
    const matches = licence || q.length < 3 ? [] : await byName(q);
    res.type('html').send(page.render({ lang, q, result: { matches } }));
  } catch (e) {
    console.error('verify', e);
    res.status(500).type('html').send(page.render({ lang, q, result: { matches: [] } }));
  }
});

module.exports = router;
