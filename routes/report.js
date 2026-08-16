// Phase 3 — reporting + admin moderation queue.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { blockUser } = require('../lib/moderation');
const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// anyone in a chat can report content (while it's still open — photos are ephemeral)
router.post('/', authenticate, async (req, res) => {
  const { conversationId, targetUserId, kind, reason } = req.body;
  const { data, error } = await supabase.from('reports')
    .insert({ reporter_id: req.user.id, conversation_id: conversationId || null, target_user_id: targetUserId || null, kind: kind || 'other', reason: reason || '' })
    .select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, report: data });
});

// admin: moderation queue
router.get('/admin/queue', authenticate, adminOnly, async (_req, res) => {
  const { data } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false });
  res.json({ success: true, reports: data || [] });
});

// admin: act on a report -> block (ban + forfeit + email blocklist) or dismiss
router.post('/admin/:id/action', authenticate, adminOnly, async (req, res) => {
  const action = req.body.action;
  const { data: rep } = await supabase.from('reports').select('*').eq('id', req.params.id).maybeSingle();
  if (!rep) return res.status(404).json({ error: 'Report not found' });
  if (action === 'block' && rep.target_user_id) {
    await blockUser(rep.target_user_id, `report #${rep.id}: ${rep.kind}`);
    await supabase.from('reports').update({ status: 'actioned' }).eq('id', rep.id);
    return res.json({ success: true, blocked: rep.target_user_id });
  }
  await supabase.from('reports').update({ status: 'dismissed' }).eq('id', rep.id);
  res.json({ success: true, dismissed: true });
});
module.exports = router;
