-- Concierge analytics: intent only. No message text, no visitor identifier, no IP —
-- the point is to see which services and cities people ask for, nothing about who asked.
create table if not exists concierge_events (
  id         bigint generated always as identity primary key,
  action     text not null default 'none',    -- 'search' | 'signup' | 'none'
  service    text,
  city       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_concierge_events_created on concierge_events (created_at desc);
