-- v6 adds p_profession_ids: the set of professions a keyword resolves to (lib/activities.js),
-- so "gardener", "jardinier", "paysagiste" and "élagage" all reach the same nearby providers
-- whatever language the listing is in. Everything else behaves exactly as v5.
drop function if exists public.search_providers(
  double precision, double precision, double precision, bigint, text, text, boolean,
  boolean, text[]);
create or replace function public.search_providers(
  p_lat double precision, p_lng double precision, p_radius_m double precision,
  p_profession_id bigint default null, p_category text default null,
  p_q text default null, p_paywall boolean default false,
  p_available_now boolean default false, p_languages text[] default null,
  p_profession_ids bigint[] default null
)
returns table (
  user_id bigint, display_name text, bio text, city text, neighbourhood text,
  languages text[], availability text, available_now boolean, price_note text, is_licensed boolean,
  featured boolean, rating numeric, review_count int, claimed boolean,
  subscribed boolean, boosted boolean, contactable boolean, distance_m double precision
)
language sql stable as $$
  with matched as (
    select distinct p.user_id, p.display_name, p.bio, p.city, p.neighbourhood,
           p.languages, p.availability, p.available_now, p.price_note, p.is_licensed, p.featured,
           p.rating, p.review_count, p.claimed,
           (p.claimed and u.subscription_status = 'active') as subscribed,
           (p.boost_until is not null and p.boost_until > now()) as boost_paid,
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
      and (
        (p_q is null and p_profession_ids is null)
        or (p_profession_ids is not null and ps.profession_id = any(p_profession_ids))
        or (p_q is not null and (p.display_name ilike '%'||p_q||'%'
             or pr.name_fr ilike '%'||p_q||'%' or pr.name_en ilike '%'||p_q||'%'))
      )
      and (p_languages is null or array_length(p_languages, 1) is null
           or p.languages && p_languages)
  )
  select user_id, display_name, bio, city, neighbourhood, languages, availability,
         (available_now and (subscribed or p_paywall = false)) as available_now,
         case when subscribed or p_paywall = false then price_note else null end as price_note,
         is_licensed, featured, rating, review_count, claimed, subscribed,
         (boost_paid and subscribed) as boosted,
         (subscribed or p_paywall = false) as contactable,
         case when subscribed or p_paywall = false then distance_m else null end as distance_m
  from matched
  where p_available_now = false
     or (available_now and (subscribed or p_paywall = false))
  order by (subscribed or p_paywall = false) desc,
           (boost_paid and subscribed) desc,
           featured desc, claimed desc,
           distance_m asc nulls last, display_name asc
  limit 100;
$$;
