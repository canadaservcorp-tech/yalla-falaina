-- Copy of the RBQ open-data licence register (donneesquebec, CC-BY, refreshed daily) behind the
-- free licence verifier. Only the fields a client is entitled to see are kept: the register also
-- publishes each holder's email, address and phone, and those are deliberately NOT stored here.
create table if not exists public.rbq_licences (
  licence       text primary key,
  holder_name   text not null,
  status        text,
  licence_type  text,
  municipality  text,
  region        text,
  restricted    boolean not null default false,
  categories    text[],
  updated_at    timestamptz not null default now()
);
create index if not exists rbq_licences_name_idx on public.rbq_licences (lower(holder_name));
create index if not exists rbq_licences_city_idx on public.rbq_licences (lower(municipality));
