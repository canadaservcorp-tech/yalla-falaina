-- Replaces the Phase 1 search_providers with claimed/contactable awareness.
-- Unclaimed RBQ seeds still SHOW (so the map isn't empty) but are marked not contactable.
-- the return type changes, so the Phase 1 function must be dropped first
drop function if exists public.search_providers(
  double precision, double precision, double precision, bigint, text, text, boolean);
create or replace function public.search_providers(
  p_lat double precision, p_lng double precision, p_radius_m double precision,
  p_profession_id bigint default null, p_category text default null,
  p_q text default null, p_paywall boolean default false
)
returns table (
  user_id bigint, display_name text, bio text, city text, neighbourhood text,
  languages text[], availability text, available_now boolean, is_licensed boolean,
  featured boolean, rating numeric, review_count int, claimed boolean,
  contactable boolean, distance_m double precision
)
language sql stable as $$
  select distinct p.user_id, p.display_name, p.bio, p.city, p.neighbourhood,
         p.languages, p.availability, p.available_now, p.is_licensed, p.featured,
         p.rating, p.review_count, p.claimed,
         (p.claimed and (u.subscription_status='active' or p_paywall=false)) as contactable,
         earth_distance(ll_to_earth(p.lat, p.lng), ll_to_earth(p_lat, p_lng)) as distance_m
  from public.providers p
  join public.users u on u.id = p.user_id
  left join public.provider_services ps on ps.provider_id = p.user_id
  left join public.professions pr on pr.id = ps.profession_id
  where p.lat is not null and p.lng is not null
    and u.banned = false
    and earth_distance(ll_to_earth(p.lat, p.lng), ll_to_earth(p_lat, p_lng)) <= p_radius_m
    -- unclaimed seeds always show; claimed providers respect the paywall
    and (p.claimed = false or p_paywall = false or u.subscription_status = 'active')
    and (p_profession_id is null or ps.profession_id = p_profession_id)
    and (p_category is null or pr.category_id = p_category)
    and (p_q is null or p.display_name ilike '%'||p_q||'%' or pr.name_fr ilike '%'||p_q||'%' or pr.name_en ilike '%'||p_q||'%')
  order by p.featured desc, p.claimed desc, distance_m asc
  limit 100;
$$;
