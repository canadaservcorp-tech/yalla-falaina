// Seeker subscription — Phase 1 ships a single $25/month "Basic" tier
// (Section 4.3) over TWO payment rails, PayPal and Stripe, kept side by side
// rather than one replacing the other. Reason: PayPal alone doesn't reach
// the whole target market — Iraq and Lebanon aren't in PayPal's supported-
// country list at all, while neither is under a comprehensive sanctions
// regime and neither is on Stripe's own restricted-country list, so Stripe
// is what actually lets a Qi Card (Iraq) or a cash-funded Fresh/OMT/ViaCard
// (Lebanon) holder subscribe. See CLAUDE_PROMPT.md's payments section for
// the record of this decision superseding the earlier "PayPal only" call.
//
// The two providers share every account-state column (subscription_status,
// subscription_tier, subscription_period_end, subscription_cancel_at,
// data_retention_deadline, retention_warned_at) and are told apart only by
// `payment_provider` plus which provider-specific subscription id column is
// set — so scripts/subscription-lapse.js, scripts/document-retention.js, and
// the paywall gate all keep working unmodified, provider-agnostic by design.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const paypal = require('../lib/paypal');
const stripe = require('../lib/stripe');
const sec = require('../lib/security');
const ev = require('../lib/subscription-events');
const stripeEv = require('../lib/stripe-events');
const router = express.Router();

const PLAN = process.env.PAYPAL_PLAN_ID || '';
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const STRIPE_PRICE = process.env.STRIPE_PRICE_ID || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const TIER = 'basic';                    // the only live tier in Phase 1

// ---------- PayPal ----------

// Start a subscription — returns the PayPal approval URL.
router.post('/checkout', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  if (!paypal.configured() || !PLAN) return res.status(500).json({ error: 'PayPal not configured', code: 'ERR_PAYMENT_UNAVAILABLE' });
  try {
    const { data: u } = await supabase.from('users').select('id, email').eq('id', req.user.id).maybeSingle();
    const sub = await paypal.pp('POST', '/v1/billing/subscriptions', {
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

// ---------- Stripe ----------

// Start a subscription via Stripe Checkout — returns the hosted checkout URL.
// Unlike the PayPal flow above, nothing is written to `users` here: a
// Checkout Session in `subscription` mode doesn't create the actual
// subscription until the customer completes payment, so there is no
// subscription id yet to store. The session's `client_reference_id` (the
// user's own id) is how the webhook below links the eventual subscription
// back to this account once it exists.
router.post('/stripe/checkout', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  if (!stripe.configured() || !STRIPE_PRICE) return res.status(500).json({ error: 'Stripe not configured', code: 'ERR_PAYMENT_UNAVAILABLE' });
  try {
    const { data: u } = await supabase.from('users').select('id, email').eq('id', req.user.id).maybeSingle();
    const session = await stripe.stripeApi('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer_email: u.email,
      client_reference_id: String(u.id),
      line_items: [{ price: STRIPE_PRICE, quantity: 1 }],
      success_url: `${PUBLIC_URL}/?sub=success`,
      cancel_url: `${PUBLIC_URL}/?sub=cancel`,
    });
    if (!session.url) return res.status(500).json({ error: 'Stripe returned no checkout URL', code: 'ERR_PAYMENT_UNAVAILABLE' });
    res.json({ success: true, url: session.url });
  } catch (e) { console.error('stripe checkout', e); res.status(500).json({ error: 'Could not start checkout', code: 'ERR_PAYMENT_UNAVAILABLE' }); }
});

// ---------- shared ----------

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

// Cancel a subscription from within the app (Terms of Use promises "cancel
// anytime"; before this route the only way was each provider's own site).
// Deliberately a thin wrapper regardless of provider: it only calls the
// relevant cancel API and leaves the actual state transition
// (subscription_cancel_at, retention deadline, etc.) to that provider's
// webhook handler below — duplicating that logic here would risk the two
// racing or disagreeing. `payment_provider` picks the branch; a row from
// before Stripe existed has no `payment_provider` set and falls back to
// PayPal, which is the only rail that could have written it.
router.post('/cancel', authenticate, sec.requireActiveUser, sec.limits.write, async (req, res) => {
  const { data: u } = await supabase.from('users')
    .select('id, subscription_status, subscription_cancel_at, payment_provider, paypal_subscription_id, stripe_subscription_id')
    .eq('id', req.user.id).maybeSingle();
  if (!u || u.subscription_status !== 'active') {
    return res.status(400).json({ error: 'No active subscription to cancel', code: 'ERR_NO_ACTIVE_SUBSCRIPTION' });
  }
  if (u.subscription_cancel_at) {
    // Already scheduled (e.g. a retried click) — idempotent success instead
    // of calling the provider's cancel API again.
    return res.json({ success: true, message: 'Your subscription is already scheduled to cancel at the end of the paid period.' });
  }
  const provider = u.payment_provider === 'stripe' ? 'stripe' : 'paypal';
  try {
    if (provider === 'stripe') {
      if (!u.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription to cancel', code: 'ERR_NO_ACTIVE_SUBSCRIPTION' });
      if (!stripe.configured()) return res.status(500).json({ error: 'Stripe not configured', code: 'ERR_PAYMENT_UNAVAILABLE' });
      // cancel_at_period_end, not an immediate cancel — same "keep the paid
      // days" promise as the PayPal branch below.
      await stripe.stripeApi('POST', `/subscriptions/${encodeURIComponent(u.stripe_subscription_id)}`, { cancel_at_period_end: 'true' });
    } else {
      if (!u.paypal_subscription_id) return res.status(400).json({ error: 'No active subscription to cancel', code: 'ERR_NO_ACTIVE_SUBSCRIPTION' });
      if (!paypal.configured()) return res.status(500).json({ error: 'PayPal not configured', code: 'ERR_PAYMENT_UNAVAILABLE' });
      await paypal.pp('POST', `/v1/billing/subscriptions/${encodeURIComponent(u.paypal_subscription_id)}/cancel`, {
        reason: 'Canceled by subscriber from the Yalla Falaina app',
      });
    }
    res.json({ success: true, message: 'Cancellation requested — you keep access until the end of the paid period.' });
  } catch (e) { console.error(`${provider} cancel`, e); res.status(500).json({ error: 'Could not cancel the subscription', code: 'ERR_PAYMENT_UNAVAILABLE' }); }
});

// PayPal webhook — raw body is kept (see server.js) so the signature is checked
// against the exact payload.
router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!paypal.configured() || !WEBHOOK_ID) return res.status(500).end();
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).send('Bad payload'); }
  try {
    const check = await paypal.pp('POST', '/v1/notifications/verify-webhook-signature', {
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
      try { resource = await paypal.pp('GET', `/v1/billing/subscriptions/${encodeURIComponent(subId)}`); }
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

// Stripe webhook — raw body is kept (see server.js) so the HMAC signature in
// the Stripe-Signature header is checked against the exact payload.
router.post('/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!stripe.configured() || !STRIPE_WEBHOOK_SECRET) return res.status(500).end();
  const raw = req.body.toString('utf8');
  if (!stripe.verifyWebhookSignature(raw, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  let event;
  try { event = JSON.parse(raw); }
  catch { return res.status(400).send('Bad payload'); }

  try {
    const obj = event.data && event.data.object ? event.data.object : {};

    if (event.type === 'checkout.session.completed') {
      // Only a subscription-mode session with a subscription actually
      // attached is ours to act on (e.g. never a one-time payment session).
      if (obj.mode !== 'subscription' || !obj.subscription) return res.json({ received: true });
      const userId = sec.isId(obj.client_reference_id) ? Number(obj.client_reference_id) : null;
      if (!userId) return res.json({ received: true });
      // The session is a snapshot from when checkout started; the live
      // subscription object (status/period end) is what actually matters.
      const sub = await stripe.stripeApi('GET', `/subscriptions/${encodeURIComponent(obj.subscription)}`);
      const { data: user } = await supabase.from('users').select('id, subscription_period_end').eq('id', userId).maybeSingle();
      if (!user) return res.json({ received: true });
      const patch = stripeEv.accountPatch(sub, new Date(), user.subscription_period_end);
      if (patch) {
        patch.stripe_customer_id = String(obj.customer || sub.customer || '');
        patch.stripe_subscription_id = sub.id;
        patch.payment_provider = 'stripe';
        if (patch.subscription_status === 'active') patch.subscription_tier = TIER;
        sec.dropUserFromCache(String(user.id));
        await supabase.from('users').update(patch).eq('id', user.id);
      }
      return res.json({ received: true });
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      // The deleted event's object already carries status:'canceled' from
      // Stripe, but forcing it here is a cheap belt-and-suspenders in case
      // that ever isn't true for some edge case Stripe adds later.
      const sub = event.type === 'customer.subscription.deleted' ? { ...obj, status: 'canceled' } : obj;
      const { data: user } = await supabase.from('users')
        .select('id, subscription_period_end')
        .eq('stripe_subscription_id', sub.id).maybeSingle();
      if (!user) return res.json({ received: true });   // not one of ours, or already unlinked
      const patch = stripeEv.accountPatch(sub, new Date(), user.subscription_period_end);
      if (patch) {
        if (patch.subscription_status === 'active') patch.subscription_tier = TIER;
        if (patch.subscription_status === 'canceled') patch.subscription_tier = 'none';
        sec.dropUserFromCache(String(user.id));
        await supabase.from('users').update(patch).eq('id', user.id);
      }
      return res.json({ received: true });
    }

    res.json({ received: true });   // every other event type: nothing to do
  } catch (e) { console.error('stripe webhook', e); res.status(500).json({ error: 'Internal error', code: 'ERR_SERVER' }); }
});

module.exports = router;
