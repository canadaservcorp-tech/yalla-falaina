-- TrouvePro — Phase 1 schema (proximity engine). Run in Supabase SQL editor.
-- Distance uses the earthdistance extension (nearest-first + radius filter).
create extension if not exists cube;
create extension if not exists earthdistance;

-- USERS (auth handled by our Express server: bcrypt + JWT)
create table if not exists public.users (
  id bigserial primary key,
  email text unique not null,
  password_hash text not null,
  name text,
  phone text,
  role text not null default 'seeker',          -- 'seeker' | 'provider' | 'admin'
  email_verified boolean not null default false,
  verify_token text,
  paypal_subscription_id text,
  subscription_status text default 'inactive',   -- active|canceled|past_due|inactive
  subscription_period_end timestamptz,
  banned boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists public.banned_emails (   -- blocklist (can't re-subscribe)
  email text primary key, reason text, created_at timestamptz default now()
);

-- CATALOG (categories + professions, from trouvepro-professions.json)
create table if not exists public.categories (
  id text primary key, name_fr text not null, name_en text not null
);
create table if not exists public.professions (
  id bigserial primary key,
  category_id text references public.categories(id),
  name_fr text not null, name_en text not null,
  licence text default '',        -- '' | 'rbq' | 'order' | 'other'
  licence_note text
);

-- PROVIDERS (profile + location + subscription-driven visibility)
create table if not exists public.providers (
  user_id bigint primary key references public.users(id) on delete cascade,
  display_name text,
  bio text,
  lat double precision,
  lng double precision,
  city text,
  neighbourhood text,
  languages text[] default '{}',       -- e.g. {fr,en,ar}
  availability text default 'available',-- available | busy | away
  available_now boolean default false,
  hours_note text,                     -- "evenings & weekends", "from home"
  rbq_licence text,
  is_licensed boolean default false,   -- true only if a licence number was supplied
  avatar_url text,
  rating numeric default 0,
  review_count int default 0,
  featured boolean default false,      -- paid top-5 promotion
  created_at timestamptz default now()
);
-- up to 4 services per provider (enforced in app)
create table if not exists public.provider_services (
  provider_id bigint references public.users(id) on delete cascade,
  profession_id bigint references public.professions(id),
  primary key (provider_id, profession_id)
);

-- FAVORITES (seeker bookmarks)
create table if not exists public.favorites (
  seeker_id bigint references public.users(id) on delete cascade,
  provider_id bigint references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (seeker_id, provider_id)
);

-- index to speed up proximity queries
create index if not exists providers_geo_idx
  on public.providers using gist (ll_to_earth(lat, lng));

-- RLS on (defense-in-depth; server uses service_role which bypasses it)
alter table public.users             enable row level security;
alter table public.banned_emails     enable row level security;
alter table public.categories        enable row level security;
alter table public.professions       enable row level security;
alter table public.providers         enable row level security;
alter table public.provider_services enable row level security;
alter table public.favorites         enable row level security;
