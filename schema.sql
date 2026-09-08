-- Yalla Falaina — Phase 1 Supabase schema
-- Assumes Supabase Auth (auth.users) handles login/identity; these tables
-- hold everything specific to the product. Matches idea-configuration doc
-- Section 10 (signup data model) and Section 4.3's logging requirement.

create extension if not exists "uuid-ossp";

-- One row per seeker, linked to Supabase Auth.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  age_confirmed_18_plus boolean not null default false, -- hard gate, Section 4.3/10
  phone text,
  phone_verified boolean not null default false,
  city text,
  country text,
  preferred_language text, -- 'ar-LB' | 'ar-SY' | 'ar-EG' | 'fr' | 'en'
  preferred_country text,  -- weighting signal only, never a hard filter (4.3)
  sector text,
  role_type text,
  subscription_tier text not null default 'none', -- 'none' | 'starter' | 'basic' | 'plus' | 'unlimited'
  subscription_status text not null default 'inactive', -- 'active' | 'canceled' | 'past_due' | 'inactive'
  subscription_renews_at timestamptz,
  created_at timestamptz not null default now()
);

-- Structured CV/profile data — the output of any of the four intake paths
-- (upload, free text, conversational Q&A, voice — Section 10). Raw uploaded
-- files, if any, are NOT stored here; see document_uploads below.
create table seeker_profiles (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
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
  confirmed_by_user boolean not null default false, -- user confirmed extraction before use (voice/CV safeguard)
  updated_at timestamptz not null default now()
);

-- Any raw file (CV, voice transcript, screenshot) gets a short retention
-- window per Section 6.3/4.3 — this table exists to make that retention
-- policy enforceable (a scheduled job deletes rows + storage objects past
-- retention_expires_at), not to warehouse documents long-term.
create table document_uploads (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null, -- 'cv' | 'voice_note' | 'screenshot' | 'passport_copy'
  storage_path text not null, -- Supabase Storage path; never store the file itself in Postgres
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Licensed-feed jobs, refreshed from Adzuna/Jooble/Careerjet/Talent.com/Job
-- Bank (Section 6.1) — never scraped. This is what lib/matching.js's real
-- successor should query instead of the prototype's jobs.json.
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  external_source text not null, -- 'adzuna' | 'jooble' | 'careerjet' | 'talent_com' | 'job_bank' | 'informal_submission'
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
  created_at timestamptz not null default now()
);
create index jobs_track_idx on jobs(track);
create index jobs_country_idx on jobs(country);
create index jobs_status_idx on jobs(status);

-- Moderated informal/urgent submissions (the "shawarma master, urgent"
-- pattern, Section 4.1) before they become a `jobs` row with
-- source_type = 'informal_unverified'.
create table informal_listing_submissions (
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
-- that log is what protects you." This is a stricter requirement than
-- trouvepro's intent-only concierge_events table — log full turns here.
create table concierge_conversations (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  language_used text
);

create table concierge_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references concierge_conversations(id) on delete cascade,
  role text not null, -- 'user' | 'assistant'
  content text not null,
  matched_job_ids uuid[], -- jobs.id array actually shown to the model this turn (audit trail for "retrieve, don't recall")
  units_charged numeric, -- for the fair-use quota (Section 4.3): text=1, voice=3, photo/document=4
  created_at timestamptz not null default now()
);
create index concierge_messages_conversation_idx on concierge_messages(conversation_id);

-- Daily usage quota tracking (Section 4.3's tiered fair-use design).
create table daily_usage (
  profile_id uuid not null references profiles(id) on delete cascade,
  usage_date date not null default current_date,
  units_used numeric not null default 0,
  primary key (profile_id, usage_date)
);

-- B2B marketplace partners (Section 4.4) — Phase 2, included here so the
-- schema doesn't need a breaking migration when that phase starts.
create table b2b_partners (
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

-- Row Level Security: enable and scope to the owning user everywhere
-- personal data lives. Service-role key (used by the backend only, never
-- shipped to the client) bypasses RLS for legitimate server-side reads.
alter table profiles enable row level security;
alter table seeker_profiles enable row level security;
alter table document_uploads enable row level security;
alter table concierge_conversations enable row level security;
alter table concierge_messages enable row level security;
alter table daily_usage enable row level security;

create policy "profiles: owner read/write" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "seeker_profiles: owner read/write" on seeker_profiles
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "document_uploads: owner read/write" on document_uploads
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "concierge_conversations: owner read" on concierge_conversations
  for select using (auth.uid() = profile_id);

create policy "concierge_messages: owner read" on concierge_messages
  for select using (
    auth.uid() = (select profile_id from concierge_conversations c where c.id = conversation_id)
  );

create policy "daily_usage: owner read" on daily_usage
  for select using (auth.uid() = profile_id);

-- jobs, informal_listing_submissions, and b2b_partners are read via the
-- backend's service-role key and/or public read-only views — no RLS
-- policy needed for end-user direct access to those tables.
