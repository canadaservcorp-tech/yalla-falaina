-- Reviews & ratings. A review is a seeker's own experience, never TrouvePro's endorsement.
create table if not exists public.reviews (
  id bigserial primary key,
  provider_id bigint not null references public.users(id) on delete cascade,
  seeker_id   bigint not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  provider_reply text,
  replied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_id, seeker_id)
);
create index if not exists reviews_provider_idx on public.reviews(provider_id, created_at desc);

create or replace function public.recompute_provider_rating(p_provider bigint)
returns void language sql as $$
  update public.providers p set
    review_count = (select count(*) from public.reviews r where r.provider_id = p_provider),
    rating = coalesce((select round(avg(r.rating)::numeric, 1)
                       from public.reviews r where r.provider_id = p_provider), 0)
  where p.user_id = p_provider;
$$;

-- The API uses the service-role key (bypasses RLS); no public policies = defense in depth.
alter table public.reviews enable row level security;
