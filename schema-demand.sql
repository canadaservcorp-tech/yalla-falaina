-- What seekers actually looked for, so a provider can be told "N clients searched your trade
-- near you last week" from real data. No user id, no session, no exact position: the seeker's
-- coordinates are rounded to ~1 km before they are stored.
create table if not exists public.search_demand (
  id            bigserial primary key,
  day           date not null default ((now() at time zone 'utc')::date),
  profession_id integer references public.professions(id) on delete set null,
  term          text,
  lat           numeric(6,2),
  lng           numeric(7,2),
  results       integer not null default 0
);

create index if not exists search_demand_day_idx on public.search_demand (day);
create index if not exists search_demand_prof_idx on public.search_demand (profession_id);

-- Searches near a provider, for the weekly proof-of-leads email.
create or replace function public.demand_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_profession_ids integer[],
  p_days integer
) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.search_demand d
   where d.day >= (now() at time zone 'utc')::date - p_days
     and d.lat is not null and d.lng is not null
     and (p_profession_ids is null or d.profession_id = any(p_profession_ids))
     and earth_distance(ll_to_earth(d.lat::double precision, d.lng::double precision),
                        ll_to_earth(p_lat, p_lng)) <= p_radius_m;
$$;

-- Weekly demand per trade, coarse enough to be safe to show publicly.
create or replace function public.demand_by_trade(p_days integer)
returns table(profession_id integer, searches integer)
language sql stable security definer set search_path = public as $$
  select d.profession_id, count(*)::integer as searches
    from public.search_demand d
   where d.day >= (now() at time zone 'utc')::date - p_days
     and d.profession_id is not null
   group by d.profession_id
   order by searches desc;
$$;

-- The weekly proof-of-leads follow-up is a different message from the invitation, so it needs
-- its own high-water mark: one contact can be invited once and followed up many times.
alter table public.outreach_contacts add column if not exists proof_sent_at timestamptz;
alter table public.outreach_contacts add column if not exists proof_count integer not null default 0;
create or replace view public.outreach_sendable as
  select * from public.outreach_contacts
  where unsubscribed_at is null and bounced_at is null and claimed_user_id is null;
