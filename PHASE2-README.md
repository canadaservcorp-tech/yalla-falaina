# TrouvePro — Phase 2 (Subscriptions + Chat)

Drop these into the existing `trouvepro` repo. They don't modify Phase 1 files;
you only add 3 lines to server.js and run one SQL file.

## Files
- schema-phase2.sql       -> run in Supabase SQL editor (adds conversations + messages)
- routes/subscription.js  -> PayPal subscription checkout + webhook + status
- routes/chat.js          -> seeker<->provider text chat

## 1. Install dependencies
    npm install

## 2. Run the SQL
Supabase SQL editor -> run schema-phase2.sql

## 3. Wire server.js (add these lines)
Near the other app.use route lines add:
    app.use('/api/chat', require('./routes/chat'));
    app.use('/api/subscription', require('./routes/subscription'));

The PayPal WEBHOOK is verified against the RAW body. Replace `app.use(express.json());` with:
    app.use((req,res,next)=> req.originalUrl==='/api/subscription/webhook' ? next() : express.json()(req,res,next));

## 4. Env vars (add to Railway / .env)
    PAYPAL_CLIENT_ID=           # developer.paypal.com -> Apps & Credentials
    PAYPAL_CLIENT_SECRET=
    PAYPAL_PLAN_ID=             # printed by scripts/paypal-setup.js
    PAYPAL_WEBHOOK_ID=          # printed by scripts/paypal-setup.js
    PAYPAL_ENV=live             # live | sandbox

## PayPal setup (once)
    PUBLIC_URL=https://YOURDOMAIN node scripts/paypal-setup.js

It creates the product, the plan ($5/month for 3 cycles then $10/month = $15 for the
first 3 months) and the webhook on /api/subscription/webhook, then prints the two ids.

## Behaviour
- Provider hits /api/subscription/checkout -> PayPal approval page -> pays.
- Webhook keeps users.subscription_status in sync (active/canceled).
- Chat: seeker POSTs /api/chat/start {providerId}. With PAYWALL_ENFORCED=true a
  provider must be 'active' to be chatted. With PAYWALL_ENFORCED=false chat is open (launch phase).
