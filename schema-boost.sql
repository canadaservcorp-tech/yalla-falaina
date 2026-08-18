-- Paid top-placement ("Boost") for subscribed providers.
alter table public.providers add column if not exists boost_until           timestamptz;
alter table public.providers add column if not exists boost_plan            text;
alter table public.providers add column if not exists boost_subscription_id text;

create table if not exists public.boost_orders (
  id                     bigserial primary key,
  provider_id            bigint not null references public.users(id) on delete cascade,
  plan                   text not null,          -- d3 | d7 | d30 | auto30
  days                   integer not null,
  amount                 numeric(10,2) not null, -- before taxes, CAD
  tax                    numeric(10,2) not null default 0,
  currency               text not null default 'CAD',
  paypal_order_id        text,
  paypal_subscription_id text,
  status                 text not null default 'created', -- created | paid | failed
  starts_at              timestamptz,
  ends_at                timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists boost_orders_provider_idx on public.boost_orders(provider_id);
create unique index if not exists boost_orders_paypal_order_idx
  on public.boost_orders(paypal_order_id) where paypal_order_id is not null;

-- How many *active subscribers* compete with this provider (same trade, within 25 km).
-- Boost is only offered once that crowd is bigger than the 5 slots at the top.
create or replace function public.boost_competitors(p_user_id bigint)
returns integer
language sql stable as $$
  select count(distinct p.user_id)::int
  from public.providers p
  join public.users u on u.id = p.user_id
  join public.provider_services ps on ps.provider_id = p.user_id
  where u.subscription_status = 'active'
    and u.banned = false
    and p.claimed
    and p.user_id <> p_user_id
    and ps.profession_id in (select profession_id from public.provider_services where provider_id = p_user_id)
    and p.lat is not null and p.lng is not null
    and exists (
      select 1 from public.providers me
      where me.user_id = p_user_id and me.lat is not null and me.lng is not null
        and earth_distance(ll_to_earth(p.lat, p.lng), ll_to_earth(me.lat, me.lng)) <= 25000
    );
$$;
