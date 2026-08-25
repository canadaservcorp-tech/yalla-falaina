-- Provider acquisition funnel: landing page -> claim -> checkout -> subscribed.
-- Written server-side only (lib/funnel.js), one row per step, so conversion can be
-- measured without analytics consent and without trusting the browser.
create table if not exists public.claim_funnel (
  id          bigserial primary key,
  step        text not null check (step in ('landing', 'claimed', 'checkout', 'subscribed')),
  rbq_licence text,
  user_id     bigint references public.users(id) on delete set null,
  -- utm_source of the visit that produced the step, e.g. 'rbq_email'
  source      text,
  created_at  timestamptz not null default now()
);
create index if not exists claim_funnel_step_idx on public.claim_funnel (step, created_at desc);
create index if not exists claim_funnel_licence_idx on public.claim_funnel (rbq_licence) where rbq_licence is not null;
