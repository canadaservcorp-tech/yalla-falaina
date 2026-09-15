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
--
-- Migrating an ALREADY-DEPLOYED project onto two-factor auth and login
-- lockout (routes/auth.js's /totp/* endpoints and record_login_result()
-- below): add the four new users columns, then run the `create or replace
-- function` statement for record_login_result() near rate_hit() below —
-- neither step touches any existing row (every new column defaults to "not
-- set up yet"):
--   alter table public.users
--     add column if not exists totp_secret text,
--     add column if not exists totp_enabled boolean not null default false,
--     add column if not exists failed_login_count integer not null default 0,
--     add column if not exists locked_until timestamptz;
--
-- Migrating onto "Continue with Google" (routes/auth.js's /google/* endpoints):
--   alter table public.users add column if not exists google_sub text unique;
--
-- Migrating an ALREADY-DEPLOYED project onto the abandoned-checkout recovery
-- email (scripts/checkout-reminder.js): two new columns, both null by
-- default (nothing to backfill - a row with no checkout in flight simply
-- never matches the reminder job's query):
--   alter table public.users
--     add column if not exists checkout_started_at timestamptz,
--     add column if not exists checkout_reminder_sent_at timestamptz;
--
-- Migrating an ALREADY-DEPLOYED project onto the unverified-signup nudge
-- email (scripts/verify-reminder.js): one new column, null by default -
-- nothing to backfill, an already-verified account simply never matches the
-- reminder job's query:
--   alter table public.users add column if not exists verify_reminder_sent_at timestamptz;
--

-- Migrating an ALREADY-DEPLOYED project onto web push notifications
-- (lib/webPush.js, routes/push.js, lib/jobAlerts.js's new-job-match hook in
-- lib/jobsIngest.js): just run the push_subscriptions create table statement
-- near b2b_partners below — it references no existing column, so nothing
-- else needs to change.
--
-- Migrating an ALREADY-DEPLOYED project onto referral tracking (lib/referral.js,
-- routes/referral.js, and the conversion-crediting hook in routes/subscription.js's
-- webhook handlers): three new users columns plus the referral_conversions ledger
-- table further down this file — nothing here touches an existing row (every
-- account starts with no code, no referrer, and not-yet-credited):
--   alter table public.users
--     add column if not exists referral_code text unique,
--     add column if not exists referred_by bigint references public.users(id),
--     add column if not exists referral_credited boolean not null default false;
--   -- then run the referral_conversions create table statement near b2b_partners below.
--
-- Migrating an ALREADY-DEPLOYED project onto the referral +1-month bonus
-- reward (lib/access.js, lib/referral.js's grantReferralBonus()): one new
-- column, touching no existing row (null = no bonus, same as today):
--   alter table public.users add column if not exists bonus_access_until timestamptz;

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
  checkout_started_at timestamptz,               -- set when /checkout or /stripe/checkout is called, cleared once a webhook actually activates the subscription (scripts/checkout-reminder.js)
  checkout_reminder_sent_at timestamptz,         -- set once the one-time abandoned-checkout email has gone out for the CURRENT checkout_started_at; cleared whenever a new checkout attempt starts
  terms_accepted_at timestamptz,
  terms_version text,
  signup_source text,
  banned boolean not null default false,
  free_preview_used integer not null default 0,  -- lifetime count of free-preview concierge turns used (limit 3)
  totp_secret text,                              -- base32 TOTP secret (RFC 6238); null until /totp/setup is called
  totp_enabled boolean not null default false,   -- only true once /totp/confirm has proven the secret was scanned correctly
  failed_login_count integer not null default 0, -- consecutive failed logins; reset to 0 on success (record_login_result())
  locked_until timestamptz,                      -- set once failed_login_count crosses the threshold; null when not locked
  google_sub text unique,                        -- Google account id for "Continue with Google"; null for password-only accounts
  verify_reminder_sent_at timestamptz,            -- set once the one-time unverified-signup nudge email has gone out (scripts/verify-reminder.js); cleared implicitly once email_verified flips true, since the job's own query stops matching that row
  referral_code text unique,                     -- this user's own shareable code; minted lazily on first GET /api/referral/mine
  referred_by bigint references public.users(id),-- who referred this account (captured at signup; null if none/unknown code)
  referral_credited boolean not null default false, -- true once referred_by's referrer has been credited once for THIS account — guards against double-crediting across a cancel/resubscribe cycle
  bonus_access_until timestamptz,                -- referral-reward grant (lib/access.js) — paid-tier access through this date regardless of subscription_status; stacks on repeat referrals, independent of real billing
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

-- Account-level login lockout bookkeeping (routes/auth.js /login), keyed on
-- the user row itself rather than the IP — sec.limits.credentials already
-- rate-limits by IP+email, which stops one address from password-spraying a
-- list of accounts, but does nothing to stop a botnet distributing wrong
-- guesses against a SINGLE target account across many different IPs, since
-- each IP gets its own bucket. This closes that gap independent of where the
-- attempts come from. Same atomic-update discipline as usage_charge() and
-- increment_free_preview() above: routes/auth.js used to read
-- failed_login_count, add 1 in JS, and write the sum back, which let two
-- concurrent wrong-password requests both read the same count and clobber
-- each other's increment — undercounting failures and letting an account run
-- past the point it should have locked. A successful login resets the
-- counter and clears any lock; a failure increments it and, once it reaches
-- p_max_attempts, sets locked_until p_lock_ms into the future (an
-- ALREADY-locked account that keeps failing does not push locked_until
-- forward again — see the `case` branch below — so retrying during a lock
-- can't turn a bounded lock into an unbounded one).
create or replace function public.record_login_result(p_user_id bigint, p_success boolean, p_max_attempts integer, p_lock_ms integer)
returns table(failed_login_count integer, locked_until timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if p_success then
    update public.users u set failed_login_count = 0, locked_until = null
    where u.id = p_user_id
    returning u.failed_login_count, u.locked_until into failed_login_count, locked_until;
  else
    update public.users u set
      failed_login_count = u.failed_login_count + 1,
      locked_until = case
        when u.locked_until is not null and u.locked_until > now() then u.locked_until
        when u.failed_login_count + 1 >= p_max_attempts then now() + make_interval(secs => p_lock_ms / 1000.0)
        else u.locked_until
      end
    where u.id = p_user_id
    returning u.failed_login_count, u.locked_until into failed_login_count, locked_until;
  end if;
  return next;
end;
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

-- Public "contact us" submissions. Persisted rather than only emailed: the
-- notification email is a third-party call that can fail, and a visitor's
-- message shouldn't be lost with it. routes/contact.js inserts here first,
-- then emails CONTACT_EMAIL.
-- Migration note (already-deployed projects): run this create statement.
create table if not exists public.contact_messages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Immigration-news ticker items (lib/newsIngest.js + routes/admin-news.js).
-- `url` is not nullable on purpose: the product's rule is that a visitor can
-- always check a claim against its source, and a ticker headline is a claim.
-- Migration note (already-deployed projects): run this create statement.
create table if not exists public.news_items (
  id uuid primary key default uuid_generate_v4(),
  source text not null,        -- 'ircc_draw' | 'ircc_news' | 'operator'
  external_id text not null,   -- draw number / entry url / generated for operator posts
  country text,
  category text,               -- 'express_entry' | 'announcement'
  title_en text not null,
  title_fr text,               -- null when the source published English only
  title_ar text,
  url text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists news_items_published_idx on public.news_items(published_at desc);

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

-- Web push subscriptions (lib/webPush.js, routes/push.js). One row per
-- browser/device a seeker opted into notifications on -- a person can have
-- several (phone + laptop), so this is NOT unique on user_id, only on the
-- endpoint itself (a push service's subscription URL is already unique per
-- browser instance; re-subscribing the same browser upserts in place rather
-- than piling up duplicate rows that would each get their own copy of every
-- notification). lib/webPush.js deletes a row outright once its endpoint
-- comes back 404/410 -- gone, not worth ever retrying again.
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id bigint not null references public.users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Referral conversion ledger — one row per referred account that ever
-- reached a genuine inactive/never-active -> active subscription transition
-- (written by routes/subscription.js's PayPal/Stripe webhook handlers, never
-- by the client). `referred_id` is UNIQUE: a given referred account can only
-- ever convert once, which is what `users.referral_credited` guards against
-- re-inserting on a later cancel/resubscribe cycle. Deliberately just a
-- record of WHO converted, not a reward mechanic — no discount or extended
-- period is auto-applied here; crediting the referrer with anything is a
-- manual decision for the account owner until a reward is chosen.
create table if not exists public.referral_conversions (
  id bigserial primary key,
  referrer_id bigint not null references public.users(id),
  referred_id bigint not null references public.users(id) unique,
  created_at timestamptz not null default now()
);
create index if not exists referral_conversions_referrer_idx on public.referral_conversions(referrer_id);

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
alter table public.referral_conversions enable row level security;

-- The conversion ledger insert AND the referrer's reward land in ONE
-- transaction (called from lib/referral.js's creditConversionIfNew): a
-- separate "insert, then read-modify-write bonus_access_until" pair can
-- split — the ledger commits, the grant dies, and the ledger's UNIQUE
-- referred_id then makes every webhook retry return early so the reward is
-- lost forever. It also fixes the lost-update race: two conversions
-- completing together would otherwise read the same bonus_access_until and
-- overwrite each other's +30d — inside one function the referrer row's
-- update lock serializes them, so each conversion stacks its own p_days.
-- Returns true when this call recorded (and paid) the conversion, false
-- when the ledger already had it (a retry — the first call already paid).
create or replace function public.record_referral_conversion(p_referrer_id bigint, p_referred_id bigint, p_days integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.referral_conversions (referrer_id, referred_id)
  values (p_referrer_id, p_referred_id)
  on conflict (referred_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  update public.users
    set bonus_access_until = greatest(coalesce(bonus_access_until, now()), now()) + make_interval(days => p_days),
        -- A longer deadline deserves a fresh warning: scripts/profile-retention.js
        -- only warns when retention_warned_at is null, so without this reset a
        -- bonus granted after the first warning would delete the profile at the
        -- new, later deadline with no timely notice.
        retention_warned_at = null
    where id = p_referrer_id;
  return true;
end;
$$;
alter table public.push_subscriptions enable row level security;
