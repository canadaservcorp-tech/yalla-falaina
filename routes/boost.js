// Paid top placement ("Boost") — providers only, on top of an active subscription.
// One-time day-based plans are PayPal orders; the auto-renewing plan is a PayPal subscription,
// so the card stays with PayPal (we never store card data). Boost only reorders paid providers.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const { configured, pp } = require('../lib/paypal');
const sec = require('../lib/security');
const router = express.Router();

const TAX_RATE = 0.14975;                 // GST 5% + QST 9.975%, charged on top
const TOP_SLOTS = 5;                      // boost is offered once more than 5 subscribers compete
const AUTO_PLAN = process.env.PAYPAL_BOOST_PLAN_ID || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

const PLANS = {
  d3:     { days: 3,  amount: 9.99,  recurring: false },
  d7:     { days: 7,  amount: 19.99, recurring: false },
  d30:    { days: 30, amount: 59.99, recurring: false },
  auto30: { days: 30, amount: 49.99, recurring: true },
};
const money = n => n.toFixed(2);
const tax = n => Math.round(n * TAX_RATE * 100) / 100;
const priced = (id) => {
  const p = PLANS[id];
  return { id, days: p.days, recurring: p.recurring, amount: money(p.amount),
    tax: money(tax(p.amount)), total: money(p.amount + tax(p.amount)), currency: 'CAD' };
};

router.use(authenticate, sec.requireActiveUser);

async function state(userId) {
  const { data: p } = await supabase.from('providers')
    .select('boost_until, boost_plan, boost_subscription_id').eq('user_id', userId).maybeSingle();
  const until = p && p.boost_until ? new Date(p.boost_until) : null;
  return {
    active: !!(until && until.getTime() > Date.now()),
    until: until ? until.toISOString() : null,
    plan: p ? p.boost_plan : null,
    auto: !!(p && p.boost_subscription_id),
  };
}

// Plans + whether boosting is worth offering here yet
router.get('/plans', async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  const { data: u } = await supabase.from('users').select('subscription_status').eq('id', req.user.id).maybeSingle();
  const subscribed = u && u.subscription_status === 'active';
  let competitors = 0;
  const { data: c, error } = await supabase.rpc('boost_competitors', { p_user_id: req.user.id });
  if (error) console.error('boost_competitors', error); else competitors = c || 0;
  res.json({
    success: true, subscribed, competitors, topSlots: TOP_SLOTS,
    eligible: subscribed && competitors > TOP_SLOTS,
    plans: Object.keys(PLANS).filter(k => !PLANS[k].recurring || AUTO_PLAN).map(priced),
    boost: await state(req.user.id),
  });
});

router.get('/status', async (req, res) => res.json({ success: true, boost: await state(req.user.id) }));

// Start a boost purchase — returns the PayPal approval URL
router.post('/checkout', sec.limits.write, async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Providers only' });
  const planId = typeof req.body.plan === 'string' ? req.body.plan : '';
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });
  if (plan.recurring && !AUTO_PLAN) return res.status(400).json({ error: 'Auto-renewing boost is not available' });

  const { data: u } = await supabase.from('users')
    .select('id, email, subscription_status').eq('id', req.user.id).maybeSingle();
  if (!u || u.subscription_status !== 'active')
    return res.status(403).json({ error: 'An active subscription is required before boosting' });
  if (!configured()) return res.status(500).json({ error: 'PayPal not configured' });

  const p = priced(planId);
  try {
    if (plan.recurring) {
      const sub = await pp('POST', '/v1/billing/subscriptions', {
        plan_id: AUTO_PLAN,
        custom_id: `boost:${u.id}`,
        subscriber: { email_address: u.email },
        application_context: {
          brand_name: 'TrouvePro', user_action: 'SUBSCRIBE_NOW',
          return_url: `${PUBLIC_URL}/?boost=success`, cancel_url: `${PUBLIC_URL}/?boost=cancel`,
        },
      });
      await supabase.from('boost_orders').insert({ provider_id: u.id, plan: planId, days: plan.days,
        amount: p.amount, tax: p.tax, paypal_subscription_id: sub.id, status: 'created' });
      const approve = (sub.links || []).find(l => l.rel === 'approve');
      if (!approve) return res.status(500).json({ error: 'PayPal returned no approval link' });
      return res.json({ success: true, url: approve.href, plan: p });
    }
    const order = await pp('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: `boost:${u.id}:${planId}`,
        description: `TrouvePro top placement — ${plan.days} days`,
        amount: {
          currency_code: 'CAD', value: p.total,
          breakdown: { item_total: { currency_code: 'CAD', value: p.amount },
            tax_total: { currency_code: 'CAD', value: p.tax } },
        },
      }],
      application_context: {
        brand_name: 'TrouvePro', user_action: 'PAY_NOW',
        return_url: `${PUBLIC_URL}/?boost=success`, cancel_url: `${PUBLIC_URL}/?boost=cancel`,
      },
    });
    await supabase.from('boost_orders').insert({ provider_id: u.id, plan: planId, days: plan.days,
      amount: p.amount, tax: p.tax, paypal_order_id: order.id, status: 'created' });
    const approve = (order.links || []).find(l => l.rel === 'approve' || l.rel === 'payer-action');
    if (!approve) return res.status(500).json({ error: 'PayPal returned no approval link' });
    res.json({ success: true, url: approve.href, plan: p });
  } catch (e) { console.error('boost checkout', e); res.status(500).json({ error: 'Could not start checkout' }); }
});

// Capture a one-time boost after the provider comes back from PayPal
router.post('/capture', sec.limits.write, async (req, res) => {
  const orderId = typeof req.body.orderId === 'string' ? req.body.orderId : '';
  if (!/^[A-Za-z0-9-]{5,40}$/.test(orderId)) return res.status(400).json({ error: 'Invalid order' });
  const { data: order } = await supabase.from('boost_orders')
    .select('*').eq('paypal_order_id', orderId).eq('provider_id', req.user.id).maybeSingle();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.json({ success: true, boost: await state(req.user.id) });
  try {
    const cap = await pp('POST', `/v2/checkout/orders/${orderId}/capture`, {});
    if (cap.status !== 'COMPLETED') {
      await supabase.from('boost_orders').update({ status: 'failed' }).eq('id', order.id);
      return res.status(402).json({ error: 'Payment not completed' });
    }
    await extendBoost(req.user.id, order.days, order.plan);
    const s = await state(req.user.id);
    await supabase.from('boost_orders')
      .update({ status: 'paid', starts_at: new Date().toISOString(), ends_at: s.until }).eq('id', order.id);
    res.json({ success: true, boost: s });
  } catch (e) { console.error('boost capture', e); res.status(500).json({ error: 'Could not confirm payment' }); }
});

// Stop the auto-renewing boost (the paid days already bought are kept)
router.post('/cancel-auto', sec.limits.write, async (req, res) => {
  const { data: p } = await supabase.from('providers')
    .select('boost_subscription_id').eq('user_id', req.user.id).maybeSingle();
  if (!p || !p.boost_subscription_id) return res.status(400).json({ error: 'No auto-renewing boost' });
  try {
    await pp('POST', `/v1/billing/subscriptions/${p.boost_subscription_id}/cancel`, { reason: 'provider request' });
  } catch (e) { console.error('boost cancel', e.message); }
  await supabase.from('providers').update({ boost_subscription_id: null }).eq('user_id', req.user.id);
  res.json({ success: true, boost: await state(req.user.id) });
});

// Adds days to the boost, stacking on any time already paid for.
async function extendBoost(userId, days, plan, subscriptionId) {
  const { data: p } = await supabase.from('providers').select('boost_until').eq('user_id', userId).maybeSingle();
  const now = Date.now();
  const from = p && p.boost_until && new Date(p.boost_until).getTime() > now ? new Date(p.boost_until).getTime() : now;
  const patch = { boost_until: new Date(from + days * 86400000).toISOString(), boost_plan: plan };
  if (subscriptionId) patch.boost_subscription_id = subscriptionId;
  const { error } = await supabase.from('providers').update(patch).eq('user_id', userId);
  if (error) throw error;
}

module.exports = router;
module.exports.extendBoost = extendBoost;
module.exports.BOOST_PLANS = PLANS;
