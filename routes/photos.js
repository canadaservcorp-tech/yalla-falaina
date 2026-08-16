// Phase 3 — chat photos: max 3 per conversation, moderated on upload, ephemeral.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { checkImage, blockUser } = require('../lib/moderation');
const router = express.Router();
const BUCKET = 'chat-photos';

async function participant(convId, userId) {
  const { data } = await supabase.from('conversations').select('seeker_id, provider_id').eq('id', convId).maybeSingle();
  return data && (data.seeker_id === userId || data.provider_id === userId);
}

// GET /api/chat/:id/photos — photos still live in this conversation
router.get('/:id/photos', authenticate, async (req, res) => {
  if (!await participant(req.params.id, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const { data } = await supabase.from('chat_photos').select('*').eq('conversation_id', req.params.id).order('created_at');
  res.json({ success: true, photos: data || [] });
});

// POST /api/chat/:id/photos  { image: base64 }  (client should compress + cap size first)
router.post('/:id/photos', authenticate, async (req, res) => {
  const convId = req.params.id;
  if (!await participant(convId, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const base64 = (req.body.image || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) return res.status(400).json({ error: 'No image' });
  if (base64.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 3 MB)' });

  const { count } = await supabase.from('chat_photos').select('id', { count: 'exact', head: true }).eq('conversation_id', convId);
  if ((count || 0) >= 3) return res.status(400).json({ error: 'Max 3 photos per chat' });

  // MODERATE before storing
  const verdict = await checkImage(base64);
  if (!verdict.safe) {
    await blockUser(req.user.id, 'explicit image in chat');
    await supabase.from('reports').insert({ reporter_id: null, conversation_id: convId, target_user_id: req.user.id, kind: 'sexual', reason: 'auto-detected explicit image', status: 'actioned' });
    return res.status(403).json({ error: 'Prohibited content detected. Your account has been blocked.' });
  }

  const buf = Buffer.from(base64, 'base64');
  const path = `${convId}/${Date.now()}_${req.user.id}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: false });
  if (up.error) return res.status(500).json({ error: up.error.message });
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const { data: row } = await supabase.from('chat_photos')
    .insert({ conversation_id: convId, uploader_id: req.user.id, storage_path: path, url: pub.publicUrl }).select('*').single();
  res.json({ success: true, photo: row });
});

// DELETE /api/chat/:id/photos — ephemeral: wipe ALL photos when the chat closes.
router.delete('/:id/photos', authenticate, async (req, res) => {
  const convId = req.params.id;
  if (!await participant(convId, req.user.id)) return res.status(403).json({ error: 'Not your conversation' });
  const { data: photos } = await supabase.from('chat_photos').select('storage_path').eq('conversation_id', convId);
  if (photos?.length) await supabase.storage.from(BUCKET).remove(photos.map(p => p.storage_path));
  await supabase.from('chat_photos').delete().eq('conversation_id', convId);
  res.json({ success: true, deleted: photos?.length || 0 });
});
module.exports = router;
