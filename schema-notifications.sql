-- Notifications: in-app rows + an email opt-out. Idempotent.
create table if not exists public.notifications (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  type text not null,                    -- new_message | sub_expiring | boost_ending
  title text,
  body text,
  read boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read = false;

alter table public.users add column if not exists notify_email boolean not null default true;
alter table public.users add column if not exists lang text default 'fr';

-- One pending reminder of each kind per user, so the daily expiry job is idempotent
-- (a cast of created_at cannot be indexed: timestamptz -> date is only stable).
create unique index if not exists notifications_pending_reminder_idx
  on public.notifications(user_id, type)
  where read = false and type in ('sub_expiring', 'boost_ending');

alter table public.notifications enable row level security;
-- the server uses the service-role key (bypasses RLS); no public policies, by design
