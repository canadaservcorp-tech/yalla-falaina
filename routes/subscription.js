// Phase 2 — provider subscription via Stripe ($15/3mo intro coupon, then $10/mo).
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const router = express.Router();

const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PRICE = process.env.STRIPE_PRICE_ID;
const COUPON = process.env.STRIPE_INTRO_COUPON || '';
const WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// Start a subscription checkout (provider only)
router.post('/checkout', authenticate, async (req, res) => {
  if (!stripe || !PRICE) return res.status(500).json({ error: 'Stripe not configured' });
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  try {
    const { data: u } = await supabase.from('users').select('id, email, stripe_customer_id').eq('id', req.user.id).maybeSingle();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(u.stripe_customer_id ? { customer: u.stripe_customer_id } : { customer_email: u.email }),
      line_items: [{ price: PRICE, quantity: 1 }],
      ...(COUPON ? { discounts: [{ coupon: COUPON }] } : {}),
      success_url: `${PUBLIC_URL}/?sub=success`,
      cancel_url: `${PUBLIC_URL}/?sub=cancel`,
      metadata: { user_id: String(u.id) },
      subscription_data: { metadata: { user_id: String(u.id) } },
    });
    res.json({ success: true, url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status', authenticate, async (req, res) => {
  const { data } = await supabase.from('users').select('subscription_status, subscription_period_end').eq('id', req.user.id).maybeSingle();
  res.json({ success: true, status: data?.subscription_status || 'inactive', periodEnd: data?.subscription_period_end || null });
});

// Stripe webhook — needs RAW body (wired in server.js, see PHASE2-README).
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(500).end();
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK); }
  catch (err) { return res.status(400).send(`Webhook error: ${err.message}`); }
  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      if (s.metadata?.user_id) await supabase.from('users')
        .update({ stripe_customer_id: s.customer, subscription_status: 'active' }).eq('id', s.metadata.user_id);
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const status = event.type.endsWith('deleted') ? 'canceled' : sub.status;
      const end = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      await supabase.from('users').update({ subscription_status: status, subscription_period_end: end }).eq('stripe_customer_id', sub.customer);
    }
    res.json({ received: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
