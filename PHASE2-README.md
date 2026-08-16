# TrouvePro — Phase 2 (Subscriptions + Chat)

Drop these into the existing `trouvepro` repo. They don't modify Phase 1 files;
you only add 3 lines to server.js and run one SQL file.

## Files
- schema-phase2.sql       -> run in Supabase SQL editor (adds conversations + messages)
- routes/subscription.js  -> Stripe subscription checkout + webhook + status
- routes/chat.js          -> seeker<->provider text chat

## 1. Install Stripe
    npm install stripe

## 2. Run the SQL
Supabase SQL editor -> run schema-phase2.sql

## 3. Wire server.js (add these lines)
Near the other app.use route lines add:
    app.use('/api/chat', require('./routes/chat'));
    app.use('/api/subscription', require('./routes/subscription'));

The Stripe WEBHOOK needs the RAW body. Replace `app.use(express.json());` with:
    app.use((req,res,next)=> req.originalUrl==='/api/subscription/webhook' ? next() : express.json()(req,res,next));

## 4. Env vars (add to Railway / .env)
    STRIPE_SECRET_KEY=          # Stripe dashboard -> Developers -> API keys (sk_...)
    STRIPE_PRICE_ID=            # a $10.00 CAD/month recurring price (price_...)
    STRIPE_INTRO_COUPON=        # 50% off, duration=3 months  => $15 for 3 months (coupon id)
    STRIPE_WEBHOOK_SECRET=      # Developers -> Webhooks -> endpoint /api/subscription/webhook (whsec_...)

## Stripe setup (once, in the Stripe dashboard)
1. Product "Provider Subscription", recurring price $10.00 CAD/month -> STRIPE_PRICE_ID
2. Coupon: 50% off, duration "repeating" 3 months (= $15 for 3 months) -> STRIPE_INTRO_COUPON
3. Webhook endpoint https://YOURDOMAIN/api/subscription/webhook, events:
   checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

## Behaviour
- Provider hits /api/subscription/checkout -> Stripe hosted page -> pays.
- Webhook keeps users.subscription_status in sync (active/canceled).
- Chat: seeker POSTs /api/chat/start {providerId}. With PAYWALL_ENFORCED=true a
  provider must be 'active' to be chatted. With PAYWALL_ENFORCED=false chat is open (launch phase).
