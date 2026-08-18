// Phase 3 — reporting + admin moderation queue.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { blockUser } = require('../lib/moderation');
const sec = require('../lib/security');
const router = express.Router();
const KINDS = ['sexual', 'abuse', 'harassment', 'scam', 'other'];

router.use(authenticate, sec.requireActiveUser);

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// anyone in a chat can report content (while it's still open — photos are ephemeral)
router.post('/', sec.limits.report, async (req, res) => {
  const { conversationId, targetUserId } = req.body;
  if (req.body.kind !== undefined && !KINDS.includes(req.body.kind))
    return res.status(400).json({ error: 'Invalid report kind' });
  const kind = req.body.kind || 'other';
  const reason = sec.clean(req.body.reason, 1000) || '';
  let convId = null, targetId = null;

  // you may only report a conversation you are in, and only about the other party
  if (conversationId !== undefined && conversationId !== null && conversationId !== '') {
    if (!sec.isId(conversationId)) return res.status(400).json({ error: 'Invalid conversation' });
    const { data: conv } = await supabase.from('conversations')
      .select('id, seeker_id, provider_id').eq('id', Number(conversationId)).maybeSingle();
    if (!conv || (conv.seeker_id !== req.user.id && conv.provider_id !== req.user.id))
      return res.status(403).json({ error: 'Not your conversation' });
    convId = conv.id;
    targetId = conv.seeker_id === req.user.id ? conv.provider_id : conv.seeker_id;
    if (targetUserId !== undefined && targetUserId !== null && Number(targetUserId) !== targetId)
      return res.status(403).json({ error: 'You can only report the other participant' });
  } else if (targetUserId !== undefined && targetUserId !== null && targetUserId !== '') {
    if (!sec.isId(targetUserId)) return res.status(400).json({ error: 'Invalid target' });
    targetId = Number(targetUserId);
  }
  if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot report yourself' });

  const { data, error } = await supabase.from('reports')
    .insert({ reporter_id: req.user.id, conversation_id: convId, target_user_id: targetId, kind, reason })
    .select('*').single();
  if (error) { console.error('report', error); return res.status(500).json({ error: 'Could not file report' }); }
  res.json({ success: true, report: data });
});

// admin: moderation queue
router.get('/admin/queue', adminOnly, async (_req, res) => {
  const { data } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false });
  res.json({ success: true, reports: data || [] });
});

// admin: act on a report -> block (ban + forfeit + email blocklist) or dismiss
router.post('/admin/:id/action', adminOnly, async (req, res) => {
  const action = req.body.action;
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid report id' });
  const { data: rep } = await supabase.from('reports').select('*').eq('id', Number(req.params.id)).maybeSingle();
  if (!rep) return res.status(404).json({ error: 'Report not found' });
  if (action === 'block' && rep.target_user_id) {
    await blockUser(rep.target_user_id, `report #${rep.id}: ${rep.kind}`);
    sec.dropUserFromCache(rep.target_user_id);
    await supabase.from('reports').update({ status: 'actioned' }).eq('id', rep.id);
    return res.json({ success: true, blocked: rep.target_user_id });
  }
  await supabase.from('reports').update({ status: 'dismissed' }).eq('id', rep.id);
  res.json({ success: true, dismissed: true });
});
module.exports = router;
