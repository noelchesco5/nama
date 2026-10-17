-- nama - Phase 2: public-safe specialist discovery.
--
-- Clients must not read specialist_profiles (RLS: owner/HQ only, exact
-- addresses stay private). They discover care through this trusted function,
-- which returns only what a client may see: the specialist's listing for a
-- service, an APPROXIMATE straight-line distance (never the address), and
-- their average rating. Ranking (Phase 2 dispatch) starts here; the ORS
-- travel-time ranking in the edge function replaces the distance term later.

alter table public.specialist_profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision;

create or replace function public.find_specialists(
  p_service_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table
  (specialist_id uuid, display_name text, bio text, price_tzs bigint,
   distance_km numeric, rating_avg numeric, rating_count bigint)
language sql
security definer
set search_path = ''
as $$
  select
    ss.specialist_id,
    pr.display_name,
    sp.bio,
    ss.price_tzs,
    case
      when p_lat is not null and p_lng is not null
           and sp.lat is not null and sp.lng is not null      then round(
        (6371 * acos(least(1, greatest(-1,
          sin(radians(p_lat)) * sin(radians(sp.lat)) +
          cos(radians(p_lat)) * cos(radians(sp.lat)) *
          cos(radians(sp.lng - p_lng))))))::numeric
        , 1)
      else null
    end as distance_km,
    r.rating_avg,
    coalesce(r.rating_count, 0) as rating_count
  from public.specialist_services ss
  join public.specialist_profiles sp on sp.user_id = ss.specialist_id
  join public.profiles pr on pr.id = ss.specialist_id
  left join lateral (
    select avg(rating)::numeric(3,2) as rating_avg,
           count(*)::bigint as rating_count
    from public.reviews rev
    where rev.specialist_id = ss.specialist_id
  ) r on true
  where ss.service_id = p_service_id
    and ss.price_tzs >= 0
    and sp.status = 'approved'
    and pr.display_name is not null
  order by distance_km nulls last, rating_avg desc nulls last
  limit 20;
$$;

revoke execute on function public.find_specialists(uuid, double precision, double precision)
  from public, anon;
grant execute on function public.find_specialists(uuid, double precision, double precision)
  to authenticated;
