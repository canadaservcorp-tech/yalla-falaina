-- Bookings with a PayPal authorization hold on the deposit. Idempotent.
--
-- Money is stored in cents so no rounding drifts between the quote, the deposit
-- and what PayPal is asked to hold. The deposit rule (15%, floor $20, ceiling
-- $150) lives in lib/booking-rules.js — the column only records the outcome.
create table if not exists public.bookings (
  id bigserial primary key,
  provider_id bigint not null references public.users(id) on delete cascade,
  seeker_id   bigint not null references public.users(id) on delete cascade,
  scheduled_at timestamptz not null,
  quoted_cents  int not null check (quoted_cents > 0),
  deposit_cents int not null check (deposit_cents > 0),
  note text,
  status text not null default 'requested' check (status in (
    'requested',          -- seeker asked for the slot
    'declined',           -- provider refused
    'accepted',           -- provider agreed; deposit not held yet
    'authorized',         -- deposit authorized (held, not charged)
    'completed',          -- job done, deposit captured
    'cancelled_void',     -- cancelled in time, or by the provider: nothing charged
    'cancelled_charged',  -- seeker cancelled late or did not show: deposit captured
    'expired'             -- the authorization lapsed before completion
  )),
  cancelled_by text check (cancelled_by in ('seeker', 'provider')),
  -- a PayPal authorization is only honoured ~3 days, so it is taken close to the
  -- slot: before this moment /authorize is refused and the seeker is reminded later
  authorize_from timestamptz not null,
  paypal_order_id text,
  paypal_authorization_id text,
  auth_expires_at timestamptz,
  policy_version text not null,
  policy_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_seeker_idx   on public.bookings(seeker_id, scheduled_at desc);
create index if not exists bookings_provider_idx on public.bookings(provider_id, scheduled_at desc);
-- the reminder/expiry job scans only bookings that can still change
create index if not exists bookings_open_idx on public.bookings(status, authorize_from)
  where status in ('requested', 'accepted', 'authorized');

-- One live booking per provider per slot: a declined or cancelled attempt must not
-- block the slot, so the constraint is partial.
create unique index if not exists bookings_slot_idx
  on public.bookings(provider_id, scheduled_at)
  where status in ('requested', 'accepted', 'authorized');

-- One pending "authorize your deposit" reminder per booking (the job is idempotent).
alter table public.bookings add column if not exists auth_reminded_at timestamptz;

alter table public.bookings enable row level security;
-- the server uses the service-role key (bypasses RLS); no public policies, by design
