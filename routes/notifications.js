// In-app notifications: list, mark read, email opt-out.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const router = express.Router();

router.use(authenticate, sec.requireActiveUser);

const PAGE = 50;

// GET /api/notifications -> newest 50 + the true unread count
router.get('/', async (req, res) => {
  try {
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(PAGE);
    // counted in SQL: the unread ones may sit beyond the first page
    const { count } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id).eq('read', false);
    // the toggle's current state, so the UI can label it without a second call
    const { data: me } = await supabase.from('users')
      .select('notify_email').eq('id', req.user.id).maybeSingle();
    res.json({
      success: true, unread: Number(count) || 0,
      notify_email: !me || me.notify_email !== false,
      notifications: data || [],
    });
  } catch (e) { console.error('notifications list', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/notifications/read { id? } -> mark one, or all of mine
router.post('/read', sec.limits.write, async (req, res) => {
  try {
    let q = supabase.from('notifications').update({ read: true })
      .eq('user_id', req.user.id).eq('read', false);
    if (req.body.id !== undefined) {
      if (!sec.isId(req.body.id)) return res.status(400).json({ error: 'Invalid notification' });
      q = q.eq('id', Number(req.body.id));
    }
    const { error } = await q;
    if (error) { console.error('notifications read', error); return res.status(500).json({ error: 'Server error' }); }
    res.json({ success: true });
  } catch (e) { console.error('notifications read', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/notifications/email-pref { enabled } -> unsubscribe / resubscribe
router.post('/email-pref', sec.limits.write, async (req, res) => {
  try {
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
    const { error } = await supabase.from('users')
      .update({ notify_email: req.body.enabled }).eq('id', req.user.id);
    if (error) { console.error('notifications pref', error); return res.status(500).json({ error: 'Server error' }); }
    res.json({ success: true, notify_email: req.body.enabled });
  } catch (e) { console.error('notifications pref', e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
