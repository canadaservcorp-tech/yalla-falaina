// Admin view of the referral conversion ledger (schema.sql's
// referral_conversions) — who referred whom, and when they converted. This is
// a read-only ledger: see lib/referral.js's top comment for why no reward is
// auto-credited here. Crediting a referrer (a discount, extra days, whatever
// mechanic gets chosen) is a manual step the account owner takes after
// reading this list, not something this route does.
// Same admin gate as routes/admin-news.js and routes/admin-informal-listings.js.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();

const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only', code: 'ERR_FORBIDDEN' });

router.get('/', authenticate, sec.requireActiveUser, adminOnly, async (_req, res) => {
  const { data: rows, error } = await supabase.from('referral_conversions')
    .select('id, referrer_id, referred_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('admin-referrals list', error.message);
    return res.status(500).json({ error: 'Could not load referral conversions', code: 'ERR_SERVER' });
  }
  const list = rows || [];
  // A second lookup rather than an embedded join (this codebase doesn't use
  // supabase-js's embedded-resource select syntax anywhere else — see
  // routes/admin-news.js and friends — so the mock DB used in tests never had
  // to support it either).
  const ids = [...new Set(list.flatMap(r => [r.referrer_id, r.referred_id]))];
  let emailById = {};
  if (ids.length) {
    const { data: users, error: uErr } = await supabase.from('users').select('id, email').in('id', ids);
    if (uErr) console.error('admin-referrals user lookup', uErr.message);
    emailById = Object.fromEntries((users || []).map(u => [u.id, u.email]));
  }
  const items = list.map(r => ({
    id: r.id,
    referrerId: r.referrer_id,
    referrerEmail: emailById[r.referrer_id] || null,
    referredId: r.referred_id,
    referredEmail: emailById[r.referred_id] || null,
    createdAt: r.created_at,
  }));
  res.json({ success: true, items });
});

module.exports = router;
