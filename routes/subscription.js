// Seeker subscription via PayPal — Phase 1 ships a single $25/month "Basic"
// tier (Section 4.3; the plan itself is created by scripts/paypal-setup.js).
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { configured, pp } = require('../lib/paypal');
const sec = require('../lib/security');
const ev = require('../lib/subscription-events');
const router = express.Router();

const PLAN = process.env.PAYPAL_PLAN_ID || '';
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const TIER = 'basic';                    // the only live tier in Phase 1

// Start a subscription — returns the PayPal approval URL.
router.post('/checkout', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  if (!configured() || !PLAN) return res.status(500).json({ error: 'PayPal not configured', code: 'ERR_PAYMENT_UNAVAILABLE' });
  try {
    const { data: u } = await supabase.from('users').select('id, email').eq('id', req.user.id).maybeSingle();
    const sub = await pp('POST', '/v1/billing/subscriptions', {
      plan_id: PLAN,
      custom_id: String(u.id),
      subscriber: { email_address: u.email },
      application_context: {
        brand_name: 'Yalla Falaina',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${PUBLIC_URL}/?sub=success`,
        cancel_url: `${PUBLIC_URL}/?sub=cancel`,
      },
    });
    await supabase.from('users').update({ paypal_subscription_id: sub.id }).eq('id', u.id);
    const approve = (sub.links || []).find(l => l.rel === 'approve');
    if (!approve) return res.status(500).json({ error: 'PayPal returned no approval link', code: 'ERR_PAYMENT_UNAVAILABLE' });
    res.json({ success: true, url: approve.href });
  } catch (e) { console.error('paypal checkout', e); res.status(500).json({ error: 'Could not start checkout', code: 'ERR_PAYMENT_UNAVAILABLE' }); }
});

router.get('/status', authenticate, sec.requireActiveUser, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('subscription_status, subscription_tier, subscription_period_end')
    .eq('id', req.user.id).maybeSingle();
  res.json({
    success: true,
    status: data?.subscription_status || 'inactive',
    tier: data?.subscription_tier || 'none',
    periodEnd: data?.subscription_period_end || null,
  });
});

// PayPal webhook — raw body is kept (see server.js) so the signature is checked
// against the exact payload.
router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!configured() || !WEBHOOK_ID) return res.status(500).end();
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).send('Bad payload'); }
  try {
    const check = await pp('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: req.headers['paypal-cert-url'],
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: WEBHOOK_ID,
      webhook_event: event,
    });
    if (check.verification_status !== 'SUCCESS') return res.status(400).send('Invalid signature');
  } catch (e) { console.error('paypal webhook verify', e); return res.status(400).send('Verification failed'); }

  try {
    const type = event.event_type;
    const r = event.resource || {};
    const subId = ev.subscriptionId(type, r);
    const isRenewal = type === ev.RENEWAL;
    if (isRenewal && !subId) return res.json({ received: true });   // a one-time order, not a subscription

    // A renewal payment says nothing about the next billing date, so it is read back
    // from the agreement (a failure here must not lose the payment itself).
    let resource = r;
    if (isRenewal) {
      try { resource = await pp('GET', `/v1/billing/subscriptions/${encodeURIComponent(subId)}`); }
      catch (e) { console.error('paypal renewal lookup', e.message); }
    }
    const custom = String(resource.custom_id || r.custom_id || r.custom || '');
    const q = supabase.from('users').select('id, subscription_period_end');
    const { data: user } = sec.isId(custom)
      ? await q.eq('id', Number(custom)).maybeSingle()
      : subId ? await q.eq('paypal_subscription_id', subId).maybeSingle() : { data: null };
    if (user) {
      const patch = ev.accountPatch(type, resource, new Date(), user.subscription_period_end);
      if (patch) {
        if (subId && !isRenewal) patch.paypal_subscription_id = subId;
        if (patch.subscription_status === 'active') patch.subscription_tier = TIER;
        if (patch.subscription_status === 'canceled') patch.subscription_tier = 'none';
        sec.dropUserFromCache(String(user.id));
        await supabase.from('users').update(patch).eq('id', user.id);
      }
    }
    res.json({ received: true });
  } catch (e) { console.error('paypal webhook', e); res.status(500).json({ error: 'Internal error', code: 'ERR_SERVER' }); }
});
module.exports = router;
