-- Cancelled subscriptions keep the days already paid for; this records when they lapse.
-- scripts/subscription-lapse.js flips the account to 'canceled' once the moment passes.
alter table users add column if not exists subscription_cancel_at timestamptz;

create index if not exists users_subscription_cancel_at_idx
  on users (subscription_cancel_at)
  where subscription_cancel_at is not null;
