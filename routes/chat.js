// Phase 2 — chat. Seeker <-> provider text messages.
// Gate: a seeker can open a chat only if the provider's subscription is active
// (or during thin-launch when PAYWALL_ENFORCED=false, chat is open to all).
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const router = express.Router();
const PAYWALL = process.env.PAYWALL_ENFORCED === 'true';

async function isParticipant(convId, userId) {
  const { data } = await supabase.from('conversations').select('seeker_id, provider_id').eq('id', convId).maybeSingle();
  return data && (data.seeker_id === userId || data.provider_id === userId) ? data : null;
}

// start (or reuse) a conversation with a provider
router.post('/start', authenticate, async (req, res) => {
  try {
    const providerId = parseInt(req.body.providerId);
    if (!providerId) return res.status(400).json({ error: 'providerId required' });
    const { data: prov } = await supabase.from('users').select('id, role, subscription_status').eq('id', providerId).maybeSingle();
    if (!prov || prov.role !== 'provider') return res.status(404).json({ error: 'Provider not found' });
    if (PAYWALL && prov.subscription_status !== 'active')
      return res.status(403).json({ error: 'This provider is not currently subscribed' });

    const seekerId = req.user.id;
    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('seeker_id', seekerId).eq('provider_id', providerId).maybeSingle();
    if (!conv) {
      const ins = await supabase.from('conversations').insert({ seeker_id: seekerId, provider_id: providerId }).select('*').single();
      conv = ins.data;
    }
    res.json({ success: true, conversation: conv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// my conversations, each with the counterpart's display name
router.get('/', authenticate, async (req, res) => {
  const uid = req.user.id;
  const { data } = await supabase.from('conversations').select('*')
    .or(`seeker_id.eq.${uid},provider_id.eq.${uid}`).order('created_at', { ascending: false });
  const convs = data || [];
  const otherIds = [...new Set(convs.map(c => (c.seeker_id === uid ? c.provider_id : c.seeker_id)))];
  let names = {};
  if (otherIds.length) {
    const { data: users } = await supabase.from('users').select('id, name, role').in('id', otherIds);
    for (const u of users || []) names[u.id] = u;
  }
  res.json({
    success: true,
    conversations: convs.map(c => {
      const otherId = c.seeker_id === uid ? c.provider_id : c.seeker_id;
      return { ...c, other: names[otherId] || { id: otherId } };
    }),
  });
});

// messages in a conversation
router.get('/:id/messages', authenticate, async (req, res) => {
  if (!await isParticipant(req.params.id, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const { data } = await supabase.from('messages').select('*').eq('conversation_id', req.params.id).order('created_at');
  res.json({ success: true, messages: data || [] });
});

// send a message
router.post('/:id/messages', authenticate, async (req, res) => {
  if (!await isParticipant(req.params.id, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const body = (req.body.text || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message' });
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: req.params.id, sender_id: req.user.id, body }).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: data });
});
module.exports = router;
