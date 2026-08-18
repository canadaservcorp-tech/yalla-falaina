-- TrouvePro Phase 3 — chat photos (ephemeral) + moderation + reports.
-- (banned_emails already exists from Phase 1.)

create table if not exists public.chat_photos (
  id bigserial primary key,
  conversation_id bigint references public.conversations(id) on delete cascade,
  uploader_id bigint references public.users(id) on delete cascade,
  storage_path text not null,
  url text,
  created_at timestamptz default now()
);
create index if not exists chat_photos_conv_idx on public.chat_photos(conversation_id);

create table if not exists public.reports (
  id bigserial primary key,
  reporter_id bigint references public.users(id) on delete set null,
  conversation_id bigint,
  target_user_id bigint references public.users(id) on delete set null,
  kind text,                       -- 'sexual' | 'abuse' | 'harassment' | 'scam' | 'other'
  reason text,
  status text default 'open',      -- open | actioned | dismissed
  created_at timestamptz default now()
);

alter table public.chat_photos enable row level security;
alter table public.reports     enable row level security;

-- One-time: create a Storage bucket named 'chat-photos' (Supabase -> Storage -> New bucket, private).
