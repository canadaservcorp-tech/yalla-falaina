-- TrouvePro Phase 2 — subscriptions + chat. Run in Supabase SQL editor.
-- (users already has paypal_subscription_id / subscription_status / subscription_period_end from Phase 1.)

create table if not exists public.conversations (
  id bigserial primary key,
  seeker_id   bigint references public.users(id) on delete cascade,
  provider_id bigint references public.users(id) on delete cascade,
  closed boolean default false,
  created_at timestamptz default now(),
  unique(seeker_id, provider_id)
);
create table if not exists public.messages (
  id bigserial primary key,
  conversation_id bigint references public.conversations(id) on delete cascade,
  sender_id bigint references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
