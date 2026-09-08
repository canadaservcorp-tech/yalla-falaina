-- Shared counters for the rate limiters. express-rate-limit's default store lives in the
-- process memory, so on Railway (several instances behind one URL) every instance keeps its
-- own count and the real ceiling is limit x instances. This moves the counters into Postgres.

create table if not exists public.rate_hits (
  key       text primary key,
  hits      integer     not null default 0,
  reset_at  timestamptz not null
);

create index if not exists rate_hits_reset_idx on public.rate_hits(reset_at);

-- One atomic statement per request: start a fresh window when the old one has elapsed,
-- otherwise add to the running count. Returns the state the limiter has to decide on.
create or replace function public.rate_hit(p_key text, p_window_ms integer, p_step integer default 1)
returns table(hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rate_hits as r (key, hits, reset_at)
  values (p_key, greatest(p_step, 0), now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set hits     = case when r.reset_at <= now() then greatest(p_step, 0) else r.hits + p_step end,
        reset_at = case when r.reset_at <= now()
                        then now() + make_interval(secs => p_window_ms / 1000.0)
                        else r.reset_at end
  returning r.hits, r.reset_at into hits, reset_at;
  return next;
end;
$$;

-- Housekeeping: elapsed windows are dead weight. Safe to call from anywhere, any time.
create or replace function public.rate_hits_gc()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (delete from public.rate_hits where reset_at < now() - interval '1 hour' returning 1)
  select count(*)::int from gone;
$$;
