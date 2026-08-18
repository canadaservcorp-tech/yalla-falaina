-- TrouvePro — record acceptance of the Terms of Use / Privacy Policy at signup.
alter table public.users add column if not exists terms_accepted_at timestamptz;
alter table public.users add column if not exists terms_version     text;
