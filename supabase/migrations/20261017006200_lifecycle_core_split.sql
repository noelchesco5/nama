-- nama - Phase 2 lifecycle fix 2: split booking creation core.
--
-- accept_repeat (specialist caller) must be able to create a booking for the
-- client; request_booking's client-only guard would refuse it. The money-safe
-- core (insert + hold + notification) moves to _create_booking_with_hold;
-- both entry points call it after their own authorization checks.
-- 00600000 already contains these definitions for fresh installs.

create or replace function public._create_booking_with_hold(
  p_client_id uuid,
  p_specialist_id uuid,
  p_service_id uuid,
  p_price_tzs bigint,
  p_starts_at timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address_text text default null,
  p_for_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_window int;
  v_sp_status public.specialist_status;
  v_listed_price bigint;
begin
  if p_price_tzs is null or p_price_tzs <= 0 then
    raise exception 'price must be positive';
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes' then
    raise exception 'pick a start time at least 30 minutes ahead';
  end if;

  -- The specialist must be a real, approved specialist.
  select sp.status into v_sp_status
  from public.specialist_profiles sp
  where sp.user_id = p_specialist_id;
  if v_sp_status is null or v_sp_status <> 'approved' then
    raise exception 'specialist is not available';
  end if;

  -- Price integrity: if the specialist listed a price for this service, the
  -- booked price must match it. Clients cannot type in their own number.
  select s.price_tzs into v_listed_price
  from public.specialist_services s
  where s.specialist_id = p_specialist_id and s.service_id = p_service_id;
  if v_listed_price is not null and v_listed_price <> p_price_tzs then
    raise exception 'price does not match the listed price';
  end if;

  select (value #>> '{}')::int into v_window
  from public.platform_settings where key = 'acceptance_window_minutes';
  v_window := coalesce(v_window, 15);

  insert into public.bookings
    (client_id, specialist_id, service_id, price_tzs, status,
     lat, lng, address_text, for_name, starts_at, acceptance_expires_at)
  values
    (p_client_id, p_specialist_id, p_service_id, p_price_tzs, 'requested',
     p_lat, p_lng, p_address_text, p_for_name, p_starts_at,
     now() + make_interval(mins => v_window))
  returning id into v_id;

  -- Holds the price (escrow) or raises if the wallet is short; the insert
  -- above rolls back with it.
  perform public.post_hold(p_client_id, p_price_tzs, v_id);

  update public.bookings set hold_txn_id =
    (select id from public.ledger_txns
     where idempotency_key = 'hold:' || v_id::text)
  where id = v_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (p_specialist_id, 'booking_requested', 'New booking request',
          'A client needs your care. You have ' || v_window || ' minutes to respond.',
          jsonb_build_object('booking_id', v_id, 'amount_tzs', p_price_tzs, 'for_name', p_for_name));

  perform public.audit('create', 'booking', v_id::text, null,
                       jsonb_build_object('client_id', p_client_id,
                                          'specialist_id', p_specialist_id,
                                          'service_id', p_service_id,
                                          'price_tzs', p_price_tzs,
                                          'starts_at', p_starts_at));

  return v_id;
end;
$$;

create or replace function public.request_booking(
  p_specialist_id uuid,
  p_service_id uuid,
  p_price_tzs bigint,
  p_starts_at timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address_text text default null,
  p_for_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.authorize('client') then
    raise exception 'only clients can request bookings';
  end if;

  return public._create_booking_with_hold(
    v_uid, p_specialist_id, p_service_id, p_price_tzs, p_starts_at,
    p_lat, p_lng, p_address_text, p_for_name
  );
end;
$$;

create or replace function public.accept_repeat(p_repeat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.repeat_requests;
  v_prior public.bookings;
  v_booking_id uuid;
begin
  select * into v_r from public.repeat_requests where id = p_repeat_id for update;
  if v_r.id is null then raise exception 'repeat request not found'; end if;
  if v_r.specialist_id <> v_uid then raise exception 'not your request'; end if;
  if v_r.status <> 'pending' then raise exception 'request already handled'; end if;

  select * into v_prior from public.bookings where id = v_r.booking_id;

  -- Creates the booking WITH hold; money leaves only after this accept.
  v_booking_id := public._create_booking_with_hold(
    v_r.client_id, v_uid, v_prior.service_id, v_prior.price_tzs, v_r.starts_at,
    v_prior.lat, v_prior.lng, v_prior.address_text, v_prior.for_name
  );

  update public.bookings
  set status = 'accepted', accepted_at = now()
  where id = v_booking_id;

  update public.repeat_requests
  set status = 'accepted'
  where id = p_repeat_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_r.client_id, 'booking_accepted', 'Repeat visit confirmed',
          'Your specialist accepted the repeat visit.',
          jsonb_build_object('booking_id', v_booking_id));

  return v_booking_id;
end;
$$;

revoke execute on function public._create_booking_with_hold(uuid, uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) from public, anon, authenticated;
revoke execute on function public.request_booking(uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) from public, anon;
grant execute on function public.request_booking(uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) to authenticated;
revoke execute on function public.accept_repeat(uuid) from public, anon;
grant execute on function public.accept_repeat(uuid) to authenticated;
