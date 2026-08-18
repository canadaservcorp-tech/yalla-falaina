-- Marketing outreach list for RBQ licence holders (and other prospected providers).
-- Kept separate from public.users so prospects are never accounts and never appear in search;
-- the seeded RBQ rows carry no real email (the public register does not publish them), so
-- addresses are imported here as they are collected.
create table if not exists public.outreach_contacts (
  id                bigserial primary key,
  email             text not null unique,
  business_name     text,
  rbq_licence       text,
  phone             text,
  city              text,
  lang              text not null default 'fr',
  source            text not null default 'rbq_register',
  -- CASL: business contact information published by the business itself; kept auditable.
  consent_basis     text not null default 'published_business_contact',
  unsubscribe_token text not null default encode(gen_random_bytes(16), 'hex'),
  unsubscribed_at   timestamptz,
  bounced_at        timestamptz,
  last_sent_at      timestamptz,
  send_count        integer not null default 0,
  claimed_user_id   bigint references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create unique index if not exists outreach_token_idx on public.outreach_contacts(unsubscribe_token);
create index if not exists outreach_rbq_idx on public.outreach_contacts(rbq_licence);
-- a send job only ever selects from this view
create or replace view public.outreach_sendable as
  select * from public.outreach_contacts
  where unsubscribed_at is null and bounced_at is null and claimed_user_id is null;
