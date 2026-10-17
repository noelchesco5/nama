-- nama - Phase 2 lifecycle fix.
--
-- post_refund takes a uuid refund id (used for the ledger idempotency key
-- 'refund:<id>'), not a text key. A booking can release its hold at most once
-- (decline / expiry / cancel are mutually exclusive states), so the booking id
-- itself is the right unique key. Redefines the three affected functions; the
-- 00600000 migration contains the same bodies for fresh installs.

create or replace function public.decline_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_b.specialist_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.status <> 'requested' then
    raise exception 'booking is %, not awaiting acceptance', v_b.status;
  end if;

  update public.bookings
  set status = 'declined', cancelled_at = now()
  where id = v_b.id;

  -- Release the hold back to the client wallet.
  perform public.post_refund(v_b.client_id, v_b.price_tzs, v_b.id);

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_b.client_id, 'booking_declined', 'Booking declined',
          'The specialist could not take this booking. Your money is back in your wallet.',
          jsonb_build_object('booking_id', v_b.id));

  perform public.audit('decline', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'declined'));
end;
$$;

create or replace function public.expire_booking_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_b public.bookings;
begin
  for v_b in
    select * from public.bookings
    where status = 'requested' and acceptance_expires_at < now()
    for update skip locked
  loop
    update public.bookings
    set status = 'expired', cancelled_at = now()
    where id = v_b.id;

    perform public.post_refund(v_b.client_id, v_b.price_tzs, v_b.id);

    insert into public.notifications (user_id, kind, title, body, data)
    values (v_b.client_id, 'booking_expired', 'Booking request expired',
            'The specialist did not respond in time. Your money is back in your wallet and other specialists are available nearby.',
            jsonb_build_object('booking_id', v_b.id));

    perform public.audit('expire', 'booking', v_b.id::text,
                         jsonb_build_object('status', v_b.status),
                         jsonb_build_object('status', 'expired'));

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_hq boolean := public.authorize('hq');
  v_full_hours int;
  v_allowed bigint;
  v_case_id uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if not (v_b.client_id = v_uid or v_hq) then
    raise exception 'not authorized to cancel this booking';
  end if;
  if v_b.status not in ('requested', 'accepted') then
    raise exception 'booking is %, cannot cancel', v_b.status;
  end if;

  if v_b.status = 'requested' then
    -- Nobody accepted yet: the hold releases in full regardless of timing.
    update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = v_b.id;
    perform public.post_refund(v_b.client_id, v_b.price_tzs, v_b.id);
  else
    select (value #>> '{}')::int into v_full_hours
    from public.platform_settings where key = 'refund_full_hours';
    v_full_hours := coalesce(v_full_hours, 6);

    if extract(epoch from (v_b.starts_at - now())) / 3600 >= v_full_hours then
      -- More than the full window: money moves back immediately.
      update public.bookings
      set status = 'cancelled', cancelled_at = now()
      where id = v_b.id;
      perform public.post_refund(v_b.client_id, v_b.price_tzs, v_b.id);
    else
      -- Inside the window: escrow stays put until HQ decides the case.
      v_allowed := public.max_refund_allowed(v_b.price_tzs,
                     greatest(extract(epoch from (v_b.starts_at - now())) / 3600, 0)::numeric);

      insert into public.refund_cases
        (booking_id, client_id, specialist_id, requested_amount_tzs, reason)
      values (v_b.id, v_b.client_id, v_b.specialist_id, v_allowed, p_reason)
      returning id into v_case_id;

      update public.bookings
      set status = 'cancelled',
          cancelled_at = now(),
          refund_case_id = v_case_id
      where id = v_b.id;
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, data)
  select u, 'booking_cancelled', 'Booking cancelled',
         case when v_case_id is not null
              then 'Because the visit was cancelled close to its start time, a specialist care team member will review your refund.'
              else 'Your booking is cancelled and your money is back in your wallet.' end,
         jsonb_build_object('booking_id', v_b.id, 'case_id', v_case_id)
  from unnest(array[v_b.client_id, v_b.specialist_id]) as u;

  perform public.audit('cancel', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'cancelled', 'case_id', v_case_id));
end;
$$;

revoke execute on function public.decline_booking(uuid) from public, anon;
revoke execute on function public.expire_booking_requests() from public, anon, authenticated;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.decline_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.expire_booking_requests() to service_role;
