-- TrouvePro — seeding support (unclaimed RBQ listings that become live on claim).
alter table public.providers add column if not exists claimed boolean not null default true;  -- real signups = claimed
alter table public.providers add column if not exists source  text default 'signup';           -- 'signup' | 'rbq_seed'
alter table public.users     add column if not exists is_seed  boolean not null default false;   -- placeholder accounts

-- helper index for claiming by licence
create index if not exists providers_rbq_idx on public.providers(rbq_licence);
