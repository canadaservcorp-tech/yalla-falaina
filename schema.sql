-- Yalla Nsafer — Phase 1 schema. Run once in the Supabase SQL editor of the
-- NEW project (never the live trouvepro one — separate deployment, separate DB).
-- Auth is the fork's own Express JWT flow (bcrypt + `users`), so every personal
-- table references public.users, not auth.users.
--
-- Migrating an ALREADY-DEPLOYED project onto the Stripe-support columns below
-- (added after Phase 1's initial PayPal-only launch): `create table if not
-- exists` is a no-op on an existing `users` table, so run this once by hand
-- instead of the whole file:
--   alter table public.users
--     add column if not exists stripe_customer_id text,
--     add column if not exists stripe_subscription_id text,
--     add column if not exists payment_provider text;
--
-- Migrating an ALREADY-DEPLOYED project onto the new unique(profile_id) on
-- seeker_profiles (see that table's own comment for why): `add constraint`
-- fails outright if any duplicate rows already exist, so dedupe first, keeping
-- only the most-recently-updated row per profile — the same row every
-- existing read already picked via `order by updated_at desc limit 1`, so
-- this throws away nothing a live read could still see:
--   delete from public.seeker_profiles a using public.seeker_profiles b
--     where a.profile_id = b.profile_id and a.updated_at < b.updated_at;
--   alter table public.seeker_profiles add constraint seeker_profiles_profile_id_key unique (profile_id);
--
-- Migrating an ALREADY-DEPLOYED project onto the new usage_charge()/
-- increment_free_preview() functions (see their own comments, near
-- daily_usage and rate_hit() below, for why): no dedupe needed here, unlike
-- the constraint above — just run the two `create or replace function`
-- statements once by hand; they don't touch existing table data.

create extension if not exists "uuid-ossp";

-- USERS (auth handled by our Express server: bcrypt + JWT)
create table if not exists public.users (
  id bigserial primary key,
  email text unique not null,
  password_hash text not null,
  name text,
  phone text,
  role text not null default 'seeker',          -- 'seeker' | 'admin'
  email_verified boolean not null default false,
  verify_token text,
  paypal_subscription_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  payment_provider text,                         -- 'paypal' | 'stripe' | null (null = legacy/PayPal row predating Stripe)
  subscription_status text default 'inactive',   -- active|canceled|past_due|inactive
  subscription_tier text not null default 'none',-- 'none' | 'basic' (Phase 1; more per Section 4.3 later)
  subscription_period_end timestamptz,
  subscription_cancel_at timestamptz,            -- paid-until date a cancellation keeps
  data_retention_deadline timestamptz,           -- profile/intake data deleted after this (30 days post-lapse, per policy)
  retention_warned_at timestamptz,               -- set once the pre-deletion warning email has been sent
  terms_accepted_at timestamptz,
  terms_version text,
  signup_source text,
  banned boolean not null default false,
  free_preview_used integer not null default 0,  -- lifetime count of free-preview concierge turns used (limit 3)
  created_at timestamptz default now()
);
create table if not exists public.banned_emails (   -- blocklist (can't re-subscribe)
  email text primary key, reason text, created_at timestamptz default now()
);

-- Shared counters for the rate limiters (limits must hold across Railway instances).
create table if not exists public.rate_hits (
  key       text primary key,
  hits      integer     not null default 0,
  reset_at  timestamptz not null
);
create index if not exists rate_hits_reset_idx on public.rate_hits(reset_at);

create or replace function public.rate_hit(p_key text, p_window_ms integer, p_step integer default 1)
returns table(hits integer, reset_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.rate_hits as r (key, hits, reset_at)
  values (p_key, greatest(p_step, 0), now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set hits     = case when r.reset_at <= now() then greatest(p_step, 0) else r.hits + p_step end,
        reset_at = case when r.reset_at <= now()
                        then now() + make_interval(secs => p_window_ms / 1000.0)
                        else r.reset_at end
  returning r.hits, r.reset_at into hits, reset_at;
  return next;
end;
$$;

create or replace function public.rate_hits_gc()
returns integer language sql security definer set search_path = public
as $$
  with gone as (delete from public.rate_hits where reset_at < now() - interval '1 hour' returning 1)
  select count(*)::int from gone;
$$;

-- One row per user — Section 10 signup/intake fields. id IS users.id (1:1).
create table if not exists public.profiles (
  id bigint primary key references public.users(id) on delete cascade,
  full_name text,
  age_confirmed_18_plus boolean not null default false, -- hard gate, Sections 4.3/10
  phone text,
  phone_verified boolean not null default false,
  city text,
  country text,
  preferred_language text, -- 'ar-LB' | 'ar-SY' | 'ar-EG' | 'ar' | 'fr' | 'en'
  preferred_country text,  -- weighting signal only, never a hard filter (4.3)
  sector text,
  role_type text,
  created_at timestamptz not null default now()
);

-- Structured CV/profile data — the output of any of the four intake paths
-- (upload, free text, conversational Q&A, voice — Section 10). Raw uploaded
-- files are NOT stored here; see document_uploads.
--
-- unique(profile_id): exactly one row per seeker. Without this, lib/profileWrite.js
-- had no way to do a real upsert-by-profile_id — it had to read the most recent
-- row by hand and then decide insert-vs-update itself, which is a TOCTOU race
-- under concurrent writes (the profile PUT endpoint and the concierge's
-- conversational intake both call the same write path, and can genuinely
-- overlap: a seeker with the profile form open while also chatting). Two
-- concurrent calls that both read "no row yet" both insert, leaving two rows
-- for one profile — whichever one loses `order by updated_at desc limit 1`
-- becomes permanently invisible to every downstream read, so answers a seeker
-- already gave silently vanish and completeness can flip unpredictably.
create table if not exists public.seeker_profiles (
  id uuid primary key default uuid_generate_v4(),
  profile_id bigint not null references public.profiles(id) on delete cascade unique,
  intake_method text not null, -- 'upload' | 'free_text' | 'conversational' | 'voice'
  work_history jsonb, -- [{employer, title, start_date, end_date, description}]
  education jsonb,
  certifications jsonb,
  languages jsonb, -- [{language, level}]
  has_passport boolean,
  has_visa boolean,
  has_legal_residency_current_country boolean,
  has_family_or_host_abroad boolean,
  is_complete boolean not null default false, -- required-field gate before matching (Section 10)
  confirmed_by_user boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Any raw file (CV, voice transcript, screenshot) gets a short retention
-- window — scripts/document-retention.js deletes row + storage object past
-- retention_expires_at. Storage path only; the file itself never sits in Postgres.
create table if not exists public.document_uploads (
  id uuid primary key default uuid_generate_v4(),
  profile_id bigint not null references public.profiles(id) on delete cascade,
  kind text not null, -- 'cv' | 'voice_note' | 'screenshot' | 'passport_copy'
  storage_path text not null,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Licensed-feed jobs, refreshed daily by lib/jobsIngest.js (Section 6.1 —
-- never scraped). This is what lib/yf/matching.js queries.
create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  external_source text not null, -- 'adzuna' | 'jooble' | 'careerjet' | 'talent_com' | 'job_bank' | 'seed' | 'informal_submission'
  external_id text,
  track text not null, -- 'western' | 'gcc' | 'zone-local' | 'zone-corridor' | 'demand-led'
  source_type text not null default 'licensed_api', -- 'licensed_api' | 'informal_unverified'
  title text not null,
  employer text,
  country text not null,
  city text,
  category text,
  requirements text,
  salary_note text,
  posted_at timestamptz,
  expires_at timestamptz, -- freshness check, Section 4.3
  status text not null default 'active', -- 'active' | 'expired' | 'reported_broken' | 'removed'
  source_url text,
  raw jsonb, -- full original API payload for audit
  created_at timestamptz not null default now(),
  unique (external_source, external_id)
);
create index if not exists jobs_track_idx on public.jobs(track);
create index if not exists jobs_country_idx on public.jobs(country);
create index if not exists jobs_status_idx on public.jobs(status);

-- Moderated informal/urgent submissions (the "shawarma master, urgent"
-- pattern, Section 4.1) before they become a `jobs` row with
-- source_type = 'informal_unverified'.
create table if not exists public.informal_listing_submissions (
  id uuid primary key default uuid_generate_v4(),
  submitted_by_contact text not null,
  title text not null,
  country text,
  category text,
  description text,
  review_status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  rejection_reason text, -- e.g. 'prohibited_category' per Section 6.6
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Full concierge conversation log — Section 6.2: "keep a durable log of
-- what the bot told each user; if a claim of bad advice ever surfaces,
-- that log is what protects you."
create table if not exists public.concierge_conversations (
  id uuid primary key default uuid_generate_v4(),
  profile_id bigint references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  language_used text
);

create table if not exists public.concierge_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.concierge_conversations(id) on delete cascade,
  role text not null, -- 'user' | 'assistant'
  content text not null,
  matched_job_ids uuid[], -- jobs.id array actually shown to the model this turn (audit trail for "retrieve, don't recall")
  units_charged numeric, -- fair-use quota (Section 4.3): text=1, voice=3, photo/document=4
  created_at timestamptz not null default now()
);
create index if not exists concierge_messages_conversation_idx on public.concierge_messages(conversation_id);

-- Daily usage quota tracking (Section 4.3's tiered fair-use design).
create table if not exists public.daily_usage (
  profile_id bigint not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  units_used numeric not null default 0,
  primary key (profile_id, usage_date)
);

-- Atomic increment for daily_usage — same shape as rate_hit() above, and the
-- same bug class as the seeker_profiles TOCTOU race (see that table's own
-- comment): lib/usage.js used to read units_used, add `units` to it in JS,
-- then write the sum back with a plain upsert. Two concurrent concierge turns
-- for the same seeker on the same day both read the same units_used, both
-- compute the same next value, and the second write clobbers the first —
-- usage goes undercounted and Section 4.3's daily cap can be bypassed.
-- ON CONFLICT DO UPDATE ... = d.units_used + excluded.units_used makes the
-- increment atomic in Postgres no matter how many callers race here.
create or replace function public.usage_charge(p_profile_id bigint, p_units numeric)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_units numeric;
begin
  insert into public.daily_usage as d (profile_id, usage_date, units_used)
  values (p_profile_id, current_date, greatest(p_units, 0))
  on conflict (profile_id, usage_date) do update
    set units_used = d.units_used + greatest(p_units, 0)
  returning d.units_used into v_units;
  return v_units;
end;
$$;

-- Same fix, same reason, for users.free_preview_used (routes/concierge.js):
-- markPreviewUsed() used to write `previewUsed + 1`, a value computed from a
-- read taken at the top of the request handler. Two concurrent turns landing
-- on a seeker's last free reply could both persist that same incremented
-- value, silently losing a count and letting the free-preview funnel run
-- longer than Section 4.3's 3-turn limit.
create or replace function public.increment_free_preview(p_user_id bigint)
returns integer
language sql security definer set search_path = public
as $$
  update public.users set free_preview_used = free_preview_used + 1
  where id = p_user_id
  returning free_preview_used;
$$;

-- B2B marketplace partners (Section 4.4) — Phase 2, included now so the
-- schema doesn't need a breaking migration when that phase starts.
create table if not exists public.b2b_partners (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  contact_name text,
  contact_email text not null,
  contact_phone text,
  licence_number text, -- RCIC number, travel-agency registration, etc.
  licence_verified boolean not null default false,
  licence_verified_at timestamptz,
  category text, -- 'immigration_consultant' | 'travel_agency' | 'relocation_service'
  countries_served text[],
  listing_tier text,
  lawful_attestation_accepted boolean not null default false, -- Section 6.6
  status text not null default 'pending', -- 'pending' | 'active' | 'suspended'
  created_at timestamptz not null default now()
);

-- Row Level Security: enabled on every personal table with NO policies — only
-- the backend's service-role key (never shipped to a client) can read or write
-- them. That is the strongest posture this architecture allows: the Express
-- API is the only door.
alter table public.profiles enable row level security;
alter table public.seeker_profiles enable row level security;
alter table public.document_uploads enable row level security;
alter table public.concierge_conversations enable row level security;
alter table public.concierge_messages enable row level security;
alter table public.daily_usage enable row level security;
