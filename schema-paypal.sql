-- Phase 2 (PayPal) — provider subscriptions moved from Stripe to PayPal.
alter table users add column if not exists paypal_subscription_id text;
create index if not exists users_paypal_subscription_id_idx on users (paypal_subscription_id);
alter table users drop column if exists stripe_customer_id;
