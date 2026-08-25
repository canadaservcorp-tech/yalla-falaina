-- Founding Month: during the open-access window a seeker can reach an unclaimed RBQ listing
-- without the owner subscribing. The request is captured here rather than handing the seeker the
-- contractor's phone number — the contractor claims his (free) listing to read and answer it.
create table if not exists public.listing_leads (
  id                bigserial primary key,
  provider_user_id  bigint references public.users(id) on delete cascade,
  rbq_licence       text,
  seeker_name       text not null,
  seeker_contact    text not null,          -- how the provider can call back: phone or email
  seeker_city       text,
  message           text,
  trade             text,
  notified_at       timestamptz,            -- when the provider was told, null = not yet
  read_at           timestamptz,            -- when the provider (now claimed) opened it
  created_at        timestamptz not null default now()
);
create index if not exists listing_leads_provider_idx on public.listing_leads (provider_user_id, created_at desc);
create index if not exists listing_leads_licence_idx on public.listing_leads (rbq_licence);

-- Views of a public listing page, so "X people looked at your listing" is a counted fact.
-- No visitor identity: one row per view, nothing that ties two views to the same person.
create table if not exists public.listing_views (
  id                bigserial primary key,
  provider_user_id  bigint references public.users(id) on delete cascade,
  rbq_licence       text,
  created_at        timestamptz not null default now()
);
create index if not exists listing_views_provider_idx on public.listing_views (provider_user_id, created_at desc);
