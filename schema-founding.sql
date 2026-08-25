-- Founding providers: the first 50 accounts whose subscription actually activated.
-- The number is assigned once, at activation, and never reused, so the counter shown to
-- prospects ("N of 50 taken") is a fact about paid accounts rather than a marketing figure.
alter table public.users add column if not exists founding_number integer;
create unique index if not exists users_founding_number_idx
  on public.users (founding_number) where founding_number is not null;
