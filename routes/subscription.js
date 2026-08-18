// Phase 2 — provider subscription via PayPal ($15 for the first 3 months, then $10/month).
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { configured, pp } = require('../lib/paypal');
const sec = require('../lib/security');
const router = express.Router();

const PLAN = process.env.PAYPAL_PLAN_ID || '';
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// Start a subscription (provider only) — returns the PayPal approval URL.
router.post('/checkout', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  if (!configured() || !PLAN) return res.status(500).json({ error: 'PayPal not configured' });
  try {
    const { data: u } = await supabase.from('users').select('id, email').eq('id', req.user.id).maybeSingle();
    const sub = await pp('POST', '/v1/billing/subscriptions', {
      plan_id: PLAN,
      custom_id: String(u.id),
      subscriber: { email_address: u.email },
      application_context: {
        brand_name: 'TrouvePro',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${PUBLIC_URL}/?sub=success`,
        cancel_url: `${PUBLIC_URL}/?sub=cancel`,
      },
    });
    await supabase.from('users').update({ paypal_subscription_id: sub.id }).eq('id', u.id);
    const approve = (sub.links || []).find(l => l.rel === 'approve');
    if (!approve) return res.status(500).json({ error: 'PayPal returned no approval link' });
    res.json({ success: true, url: approve.href });
  } catch (e) { console.error('paypal checkout', e); res.status(500).json({ error: 'Could not start checkout' }); }
});

router.get('/status', authenticate, sec.requireActiveUser, async (req, res) => {
  const { data } = await supabase.from('users').select('subscription_status, subscription_period_end').eq('id', req.user.id).maybeSingle();
  res.json({ success: true, status: data?.subscription_status || 'inactive', periodEnd: data?.subscription_period_end || null });
});

const ACTIVE = new Set(['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.RE-ACTIVATED']);
const DEAD = new Set(['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED']);

// PayPal webhook — raw body is kept (see server.js) so the signature is checked against the exact payload.
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
    const r = event.resource || {};
    const subId = r.id || r.billing_agreement_id;
    const userId = r.custom_id || r.custom;
    const status = ACTIVE.has(event.event_type) ? 'active' : DEAD.has(event.event_type) ? 'canceled' : null;
    if (status) {
      const end = r.billing_info?.next_billing_time || null;
      const patch = { subscription_status: status, subscription_period_end: end, paypal_subscription_id: subId };
      if (userId) sec.dropUserFromCache(userId);
      if (sec.isId(userId)) await supabase.from('users').update(patch).eq('id', Number(userId));
      else if (subId) await supabase.from('users').update(patch).eq('paypal_subscription_id', subId);
    }
    res.json({ received: true });
  } catch (e) { console.error('paypal webhook', e); res.status(500).json({ error: 'Internal error' }); }
});
module.exports = router;
