// Reviews & ratings — a seeker may rate a provider they actually contacted.
// TrouvePro connects; it never certifies, so a rating is the seeker's own experience.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { checkText, flagText } = require('../lib/moderation');
const sec = require('../lib/security');
const router = express.Router();

const MAX_BODY = 1000;

// Reviews are public, so only a short public name is exposed — never the full account name.
const publicName = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts[0] + (parts[1] ? ' ' + parts[1][0].toUpperCase() + '.' : '');
};

async function claimedProvider(providerId) {
  const { data } = await supabase.from('providers')
    .select('user_id, claimed').eq('user_id', providerId).maybeSingle();
  return data && data.claimed !== false ? data : null;
}

// POST /api/reviews  { providerId, rating, body }  — one review per seeker/provider pair
router.post('/', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (req.user.role !== 'seeker') return res.status(403).json({ error: 'Only seekers can review' });
    if (!sec.isId(req.body.providerId)) return res.status(400).json({ error: 'Invalid provider' });
    const providerId = Number(req.body.providerId);
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'Rating must be 1-5' });
    if (providerId === req.user.id) return res.status(400).json({ error: 'Cannot review yourself' });
    const body = sec.clean(req.body.body, MAX_BODY) || '';

    const bad = checkText(body);
    if (!bad.safe) {
      await flagText(req.user.id, bad.term, 'review');
      return res.status(400).json({ error: 'This content is not allowed' });
    }

    if (!await claimedProvider(providerId)) return res.status(404).json({ error: 'Provider not found' });

    // only a real interaction earns a review
    const { data: conv } = await supabase.from('conversations').select('id')
      .eq('seeker_id', req.user.id).eq('provider_id', providerId).maybeSingle();
    if (!conv) return res.status(403).json({ error: 'You can only review a provider you have contacted' });

    const { data: existing } = await supabase.from('reviews').select('id')
      .eq('provider_id', providerId).eq('seeker_id', req.user.id).maybeSingle();
    if (existing) {
      await supabase.from('reviews')
        .update({ rating, body, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('reviews').insert({ provider_id: providerId, seeker_id: req.user.id, rating, body });
    }
    await supabase.rpc('recompute_provider_rating', { p_provider: providerId });
    res.json({ success: true });
  } catch (e) { console.error('review create', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/reviews/:providerId  — public list for claimed providers
router.get('/:providerId', async (req, res) => {
  try {
    if (!sec.isId(req.params.providerId)) return res.status(400).json({ error: 'Invalid provider' });
    const providerId = Number(req.params.providerId);
    if (!await claimedProvider(providerId)) return res.status(404).json({ error: 'Provider not found' });

    const { data } = await supabase.from('reviews')
      .select('id, seeker_id, rating, body, provider_reply, replied_at, created_at')
      .eq('provider_id', providerId).order('created_at', { ascending: false }).limit(50);
    const rows = data || [];

    // one lookup for the reviewers' public names; ids are never returned
    const names = new Map();
    if (rows.length) {
      const { data: users } = await supabase.from('users')
        .select('id, name').in('id', [...new Set(rows.map(r => r.seeker_id))]);
      (Array.isArray(users) ? users : users ? [users] : []).forEach(u => names.set(u.id, publicName(u.name)));
    }
    res.json({
      success: true,
      reviews: rows.map(r => ({
        id: r.id, rating: r.rating, body: r.body,
        author: names.get(r.seeker_id) || '—',
        provider_reply: r.provider_reply, replied_at: r.replied_at, created_at: r.created_at,
      })),
    });
  } catch (e) { console.error('review list', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/reviews/:id/reply  { reply }  — the reviewed provider answers once
router.post('/:id/reply', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  try {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Only providers can reply' });
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid review' });
    const reply = sec.clean(req.body.reply, MAX_BODY);
    if (!reply) return res.status(400).json({ error: 'Empty reply' });

    const bad = checkText(reply);
    if (!bad.safe) {
      await flagText(req.user.id, bad.term, 'review reply');
      return res.status(400).json({ error: 'This content is not allowed' });
    }

    const { data: rev } = await supabase.from('reviews')
      .select('id, provider_id, provider_reply').eq('id', Number(req.params.id)).maybeSingle();
    if (!rev) return res.status(404).json({ error: 'Review not found' });
    if (rev.provider_id !== req.user.id) return res.status(403).json({ error: 'Not your review' });
    if (rev.provider_reply) return res.status(409).json({ error: 'Already replied' });

    await supabase.from('reviews')
      .update({ provider_reply: reply, replied_at: new Date().toISOString() }).eq('id', rev.id);
    res.json({ success: true });
  } catch (e) { console.error('review reply', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/reviews/:id/report  { reason }  — flag a review for moderation
router.post('/:id/report', authenticate, sec.requireActiveUser, sec.limits.report, async (req, res) => {
  try {
    if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid review' });
    const { data: rev } = await supabase.from('reviews')
      .select('id, seeker_id').eq('id', Number(req.params.id)).maybeSingle();
    if (!rev) return res.status(404).json({ error: 'Review not found' });
    await supabase.from('reports').insert({
      reporter_id: req.user.id, target_user_id: rev.seeker_id, kind: 'other',
      reason: `review#${rev.id}: ${sec.clean(req.body.reason, 400) || ''}`, status: 'open',
    });
    res.json({ success: true });
  } catch (e) { console.error('review report', e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
