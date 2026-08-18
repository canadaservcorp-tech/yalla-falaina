-- Richer provider profiles: prices, public contact details and portfolio photos.
alter table public.providers add column if not exists price_note     text;   -- free text, e.g. "80 $/h — estimation gratuite"
alter table public.providers add column if not exists contact_email  text;   -- optional, defaults to the account email in the API
alter table public.providers add column if not exists contact_phone  text;

-- Portfolio photos: permanent (unlike ephemeral chat photos), moderated on upload, max 6.
create table if not exists public.portfolio_photos (
  id           bigserial primary key,
  provider_id  bigint not null references public.users(id) on delete cascade,
  storage_path text not null,
  url          text not null,
  caption      text,
  created_at   timestamptz not null default now()
);
create index if not exists portfolio_provider_idx on public.portfolio_photos(provider_id);
