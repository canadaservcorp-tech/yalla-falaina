-- Where a signup came from (utm_source of the first visit), e.g. 'instagram'.
-- First touch only: it is written once, at registration, and never updated.
alter table users add column if not exists signup_source text;

create index if not exists idx_users_signup_source on users (signup_source);
