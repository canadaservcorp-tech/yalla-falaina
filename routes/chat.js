// Phase 2 — chat. Seeker <-> provider text messages.
// Gate: a seeker can open a chat only if the provider's subscription is active
// (or during thin-launch when PAYWALL_ENFORCED=false, chat is open to all).
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();
const PAYWALL = process.env.PAYWALL_ENFORCED === 'true';
const MAX_MESSAGE = 2000;

router.use(authenticate, sec.requireActiveUser);

async function isParticipant(convId, userId) {
  const { data } = await supabase.from('conversations').select('seeker_id, provider_id, closed').eq('id', convId).maybeSingle();
  return data && (data.seeker_id === userId || data.provider_id === userId) ? data : null;
}

// start (or reuse) a conversation with a provider
router.post('/start', sec.limits.write, async (req, res) => {
  try {
    if (!sec.isId(req.body.providerId)) return res.status(400).json({ error: 'providerId required' });
    const providerId = Number(req.body.providerId);
    if (providerId === req.user.id) return res.status(400).json({ error: 'You cannot chat with yourself' });
    const { data: prov } = await supabase.from('users').select('id, role, subscription_status').eq('id', providerId).maybeSingle();
    if (!prov || prov.role !== 'provider') return res.status(404).json({ error: 'Provider not found' });
    if (PAYWALL && prov.subscription_status !== 'active')
      return res.status(403).json({ error: 'This provider is not currently subscribed' });
    // unclaimed RBQ seed listings are visible in search but have no real owner to talk to
    const { data: profile } = await supabase.from('providers').select('claimed').eq('user_id', providerId).maybeSingle();
    if (profile && profile.claimed === false)
      return res.status(403).json({ error: 'This listing has not been claimed by its owner yet' });

    const seekerId = req.user.id;
    let { data: conv } = await supabase.from('conversations')
      .select('*').eq('seeker_id', seekerId).eq('provider_id', providerId).maybeSingle();
    if (!conv) {
      const ins = await supabase.from('conversations').insert({ seeker_id: seekerId, provider_id: providerId }).select('*').single();
      conv = ins.data;
    }
    res.json({ success: true, conversation: conv });
  } catch (e) { console.error('chat start', e); res.status(500).json({ error: 'Could not start conversation' }); }
});

// my conversations, each with the counterpart's display name
router.get('/', async (req, res) => {
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
router.get('/:id/messages', async (req, res) => {
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
  if (!await isParticipant(req.params.id, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const { data } = await supabase.from('messages').select('*').eq('conversation_id', req.params.id).order('created_at');
  res.json({ success: true, messages: data || [] });
});

// send a message
router.post('/:id/messages', sec.limits.write, async (req, res) => {
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
  const conv = await isParticipant(req.params.id, req.user.id);
  if (!conv) return res.status(403).json({ error: 'Not your conversation' });
  if (conv.closed) return res.status(403).json({ error: 'This conversation is closed' });
  const body = (typeof req.body.text === 'string' ? req.body.text : '').trim().slice(0, MAX_MESSAGE);
  if (!body) return res.status(400).json({ error: 'Empty message' });
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: req.params.id, sender_id: req.user.id, body }).select('*').single();
  if (error) { console.error('send message', error); return res.status(500).json({ error: 'Could not send message' }); }
  res.json({ success: true, message: data });
});
module.exports = router;
