// Web push opt-in/opt-out for the installable app (public/sw.js). The actual
// sending happens in lib/webPush.js, called from lib/jobAlerts.js (new-job
// matches) — this route only manages subscriptions.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const webPush = require('../lib/webPush');
const router = express.Router();

// Public — the client needs this to call PushManager.subscribe({ applicationServerKey }),
// and it's a public key by design (VAPID's whole point), so no auth is needed.
router.get('/public-key', (_req, res) => {
  if (!webPush.configured()) return res.status(503).json({ error: 'Push notifications are not configured', code: 'ERR_PUSH_UNAVAILABLE' });
  res.json({ success: true, key: webPush.publicKey() });
});

// Upsert on endpoint: the same browser subscribing twice (e.g. after
// clearing site data and re-granting permission) replaces its own row rather
// than piling up a duplicate that would double-send every notification.
router.post('/subscribe', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (typeof endpoint !== 'string' || !endpoint || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'Invalid subscription', code: 'ERR_BAD_INPUT' });
  }
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ user_id: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) { console.error('push subscribe', error.message); return res.status(500).json({ error: 'Could not save subscription', code: 'ERR_SERVER' }); }
  res.json({ success: true });
});

// A seeker turning notifications off, or the browser reporting its own
// subscription is no longer valid — either way this endpoint (not the user
// id) is what identifies which row to drop, since a signed-out browser can
// still legitimately ask to be forgotten from its last known session.
router.delete('/subscribe', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (!endpoint) return res.status(400).json({ error: 'Invalid subscription', code: 'ERR_BAD_INPUT' });
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', req.user.id);
  if (error) { console.error('push unsubscribe', error.message); return res.status(500).json({ error: 'Could not remove subscription', code: 'ERR_SERVER' }); }
  res.json({ success: true });
});

module.exports = router;
