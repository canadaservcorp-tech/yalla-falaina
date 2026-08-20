// Portfolio photos — a provider's own work samples: permanent, moderated on upload, max 6.
const express = require('express');
const supabase = require('../db');
const { authenticate, optionalAuth } = require('../lib/auth-mw');
const { checkImage, strikeImage } = require('../lib/moderation');
const sec = require('../lib/security');
const router = express.Router();
const BUCKET = 'portfolio-photos';
const MAX_PHOTOS = 6;

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// GET /api/providers/:id/portfolio — public
router.get('/:id/portfolio', optionalAuth, async (req, res) => {
  if (!sec.isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const { data } = await supabase.from('portfolio_photos')
    .select('id, url, caption, created_at').eq('provider_id', req.params.id).order('created_at');
  res.json({ success: true, photos: data || [] });
});

// POST /api/providers/me/portfolio  { image: base64, caption? }
router.post('/me/portfolio', authenticate, sec.requireActiveUser, sec.limits.upload, async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  const base64 = (typeof req.body.image === 'string' ? req.body.image : '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) return res.status(400).json({ error: 'No image' });
  if (base64.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 3 MB)' });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return res.status(400).json({ error: 'Invalid image data' });

  const { count } = await supabase.from('portfolio_photos')
    .select('id', { count: 'exact', head: true }).eq('provider_id', req.user.id);
  if ((count || 0) >= MAX_PHOTOS) return res.status(400).json({ error: `Max ${MAX_PHOTOS} portfolio photos` });

  // MODERATE before storing — same fail-closed rule as chat photos
  const verdict = await checkImage(base64);
  if (verdict.unavailable && !verdict.safe)
    return res.status(503).json({ error: 'Photo upload is temporarily unavailable' });
  if (!verdict.safe) {
    // photo is never stored; a moderator decides on the account
    await strikeImage(req.user.id, 'portfolio', verdict);
    return res.status(403).json({
      code: 'photo_blocked',
      error: 'This photo was blocked as explicit content and sent for review. Repeated violations can close your account.',
    });
  }

  const buf = Buffer.from(base64, 'base64');
  const mime = sniffImage(buf);
  if (!mime) return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are accepted' });
  const path = `${req.user.id}/${Date.now()}.${mime.split('/')[1]}`;
  const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) { console.error('portfolio upload', up.error); return res.status(500).json({ error: 'Upload failed' }); }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const { data: row, error } = await supabase.from('portfolio_photos')
    .insert({ provider_id: req.user.id, storage_path: path, url: pub.publicUrl, caption: sec.clean(req.body.caption, 120) || null })
    .select('id, url, caption, created_at').single();
  if (error) { console.error('portfolio insert', error); return res.status(500).json({ error: 'Upload failed' }); }
  res.json({ success: true, photo: row });
});

// DELETE /api/providers/me/portfolio/:photoId
router.delete('/me/portfolio/:photoId', authenticate, sec.requireActiveUser, async (req, res) => {
  if (!sec.isId(req.params.photoId)) return res.status(400).json({ error: 'Invalid id' });
  const { data: photo } = await supabase.from('portfolio_photos')
    .select('id, storage_path').eq('id', req.params.photoId).eq('provider_id', req.user.id).maybeSingle();
  if (!photo) return res.status(404).json({ error: 'Not found' });
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  await supabase.from('portfolio_photos').delete().eq('id', photo.id);
  res.json({ success: true });
});
module.exports = router;
