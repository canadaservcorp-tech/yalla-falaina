-- Subscription-aware search: only providers with an active subscription are "online" —
-- they alone rank first, expose an approximate distance and can be contacted.
-- Everyone else (lapsed subscribers, unclaimed RBQ seeds) still appears, but offline:
-- no distance, no contact. The distance is withheld in SQL so it never reaches the client.
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
  subscribed boolean, contactable boolean, distance_m double precision
)
language sql stable as $$
  with matched as (
    select distinct p.user_id, p.display_name, p.bio, p.city, p.neighbourhood,
           p.languages, p.availability, p.available_now, p.is_licensed, p.featured,
           p.rating, p.review_count, p.claimed,
           (p.claimed and u.subscription_status = 'active') as subscribed,
           earth_distance(ll_to_earth(p.lat, p.lng), ll_to_earth(p_lat, p_lng)) as distance_m
    from public.providers p
    join public.users u on u.id = p.user_id
    left join public.provider_services ps on ps.provider_id = p.user_id
    left join public.professions pr on pr.id = ps.profession_id
    where p.lat is not null and p.lng is not null
      and u.banned = false
      and earth_distance(ll_to_earth(p.lat, p.lng), ll_to_earth(p_lat, p_lng)) <= p_radius_m
      and (p_profession_id is null or ps.profession_id = p_profession_id)
      and (p_category is null or pr.category_id = p_category)
      and (p_q is null or p.display_name ilike '%'||p_q||'%'
           or pr.name_fr ilike '%'||p_q||'%' or pr.name_en ilike '%'||p_q||'%')
  )
  select user_id, display_name, bio, city, neighbourhood, languages, availability,
         (available_now and (subscribed or p_paywall = false)) as available_now,
         is_licensed, featured, rating, review_count, claimed, subscribed,
         (subscribed or p_paywall = false) as contactable,
         case when subscribed or p_paywall = false then distance_m else null end as distance_m
  from matched
  order by (subscribed or p_paywall = false) desc, featured desc, claimed desc,
           distance_m asc nulls last, display_name asc
  limit 100;
$$;
