-- nama - Phase 2 booking lifecycle.
--
-- Flow (plan.md Phase 2 + intake answers):
--   client request -> HOLD on the price -> specialist has 15 min to accept
--   accept -> in_progress -> completed (fee split to earnings)
--   decline / acceptance expiry -> hold released automatically
--   cancel >6h before start -> full refund
--   cancel <6h -> refund_case opened, money stays in escrow until HQ decides
--                 (client gets up to the tier cap: <6h <=75%, <1h <=50%)
--   no-show (specialist flags after grace) -> refund minus penalty
--   HQ reads chat ONLY through an audited function.
--
-- All money movement reuses public.post_* wrappers (idempotent, audited,
-- append-only ledger). Every state change notifies the other party.

alter type public.booking_status add value if not exists 'expired';

-- Who the visit is for (family-member booking; shown to the specialist as
-- "Booked for: <name>").
alter table public.bookings add column if not exists for_name text;
alter table public.bookings add column if not exists no_show_flagged_at timestamptz;

-- Business values (HQ-editable via platform_settings).
insert into public.platform_settings (key, value) values
  ('refund_full_hours', '6'),
  ('no_show_grace_minutes', '30'),
  ('no_show_penalty_bps', '1000')
on conflict (key) do nothing;

-- One review per completed booking.
create unique index if not exists reviews_booking_uniq
  on public.reviews (booking_id) where booking_id is not null;

create index if not exists bookings_status_expiry_idx
  on public.bookings (status, acceptance_expires_at);

-- ---------------------------------------------------------------------------
-- Internal core: create a booking and hold its price. No auth checks — callers
-- are the trusted entry points below (client request, specialist repeat
-- accept). Not callable by end users.
-- ---------------------------------------------------------------------------
create function public._create_booking_with_hold(
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

-- ---------------------------------------------------------------------------
-- Client requests a booking: hold the price immediately, start the window.
-- ---------------------------------------------------------------------------
create function public.request_booking(
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

-- ---------------------------------------------------------------------------
-- Specialist accept / decline within the window.
-- ---------------------------------------------------------------------------
create function public.accept_booking(p_booking_id uuid)
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
  if now() > v_b.acceptance_expires_at then
    raise exception 'acceptance window has expired';
  end if;

  update public.bookings
  set status = 'accepted', accepted_at = now()
  where id = v_b.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_b.client_id, 'booking_accepted', 'Booking accepted',
          'Your specialist accepted the booking.',
          jsonb_build_object('booking_id', v_b.id));

  perform public.audit('accept', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'accepted'));
end;
$$;

create function public.decline_booking(p_booking_id uuid)
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

-- ---------------------------------------------------------------------------
-- Cron: acceptance window expiry releases the hold (client notified, the app
-- then offers the nearest available specialists so the client re-books).
-- ---------------------------------------------------------------------------
create function public.expire_booking_requests()
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

-- ---------------------------------------------------------------------------
-- Start and complete.
-- ---------------------------------------------------------------------------
create function public.start_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_hq boolean := public.authorize('hq');
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if not (v_b.specialist_id = v_uid or v_hq) then
    raise exception 'not authorized';
  end if;
  if v_b.status <> 'accepted' then
    raise exception 'booking is %, not accepted', v_b.status;
  end if;

  update public.bookings set status = 'in_progress' where id = v_b.id;
  perform public.audit('start', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'in_progress'));
end;
$$;

create function public.complete_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_txn uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if not (v_b.client_id = v_uid or v_b.specialist_id = v_uid
          or public.authorize('hq')) then
    raise exception 'not authorized';
  end if;
  if v_b.status not in ('accepted', 'in_progress') then
    raise exception 'booking is %, cannot complete', v_b.status;
  end if;
  if v_b.completion_txn_id is not null then
    raise exception 'booking already completed';
  end if;

  -- Price leaves escrow: platform fee + specialist earnings (idempotent).
  v_txn := public.post_completion(v_b.specialist_id, v_b.price_tzs, v_b.id);

  update public.bookings
  set status = 'completed',
      completion_txn_id = v_txn,
      completed_at = now()
  where id = v_b.id;

  insert into public.notifications (user_id, kind, title, body, data)
  select u, 'booking_completed', 'Visit completed',
         'Thank you. Payment has been settled.', jsonb_build_object('booking_id', v_b.id, 'txn_id', v_txn)
  from unnest(array[v_b.client_id, v_b.specialist_id]) as u;

  perform public.audit('complete', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'completed', 'txn_id', v_txn));

  return v_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation with the agreed tiers.
-- ---------------------------------------------------------------------------
create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
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
    perform public.post_refund(v_b.client_id, v_b.price_tzs,
                               v_b.id::text || ':cancel_release');
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

-- ---------------------------------------------------------------------------
-- HQ decides a refund case: client gets the decided amount from escrow, the
-- remainder goes to the specialist's earnings (no second fee is taken).
-- ---------------------------------------------------------------------------
create function public.resolve_refund_case(
  p_case_id uuid,
  p_decided_amount_tzs bigint,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.refund_cases;
  v_b public.bookings;
  v_remainder bigint;
  v_txn uuid;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select * into v_c from public.refund_cases where id = p_case_id for update;
  if v_c.id is null then raise exception 'case not found'; end if;
  if v_c.status <> 'open' then
    raise exception 'case is %, not open', v_c.status;
  end if;

  select * into v_b from public.bookings where id = v_c.booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;

  if p_decided_amount_tzs is null or p_decided_amount_tzs < 0
     or p_decided_amount_tzs > v_b.price_tzs then
    raise exception 'decided amount must be between 0 and %', v_b.price_tzs;
  end if;

  v_remainder := v_b.price_tzs - p_decided_amount_tzs;

  v_txn := public.post_txn(
    'refund_case_resolved',
    'case:' || v_c.id::text,
    jsonb_build_array(
      jsonb_build_object('kind', 'escrow', 'amount_tzs', -v_b.price_tzs),
      jsonb_build_object('kind', 'client_wallet', 'user_id', v_c.client_id, 'amount_tzs', p_decided_amount_tzs),
      jsonb_build_object('kind', 'specialist_earnings', 'user_id', v_c.specialist_id, 'amount_tzs', v_remainder)
    ),
    jsonb_build_object('case_id', v_c.id, 'booking_id', v_b.id, 'note', p_note)
  );

  update public.refund_cases
  set status = 'resolved',
      decided_amount_tzs = p_decided_amount_tzs,
      resolved_by = auth.uid(),
      resolved_at = now(),
      reason = coalesce(p_note, v_c.reason)
  where id = v_c.id;

  insert into public.notifications (user_id, kind, title, body, data)
  select u, 'refund_case_resolved', 'Refund decided',
         'A care team member reviewed your case. Please check your wallet.',
         jsonb_build_object('case_id', v_c.id, 'booking_id', v_b.id, 'txn_id', v_txn)
  from unnest(array[v_c.client_id, v_c.specialist_id]) as u;

  perform public.audit('resolve_refund_case', 'refund_case', v_c.id::text,
                       jsonb_build_object('status', 'open'),
                       jsonb_build_object('status', 'resolved',
                                          'decided_amount_tzs', p_decided_amount_tzs,
                                          'txn_id', v_txn));

  return v_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispute (participant) opens a case with the full price pending HQ decision.
-- ---------------------------------------------------------------------------
create function public.dispute_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_case_id uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if not (v_b.client_id = v_uid or v_b.specialist_id = v_uid
          or public.authorize('hq')) then
    raise exception 'not authorized';
  end if;
  if v_b.status not in ('accepted', 'in_progress') then
    raise exception 'booking is %, cannot dispute', v_b.status;
  end if;
  if v_b.refund_case_id is not null then
    raise exception 'a case is already open for this booking';
  end if;

  insert into public.refund_cases
    (booking_id, client_id, specialist_id, requested_amount_tzs, reason)
  values (v_b.id, v_b.client_id, v_b.specialist_id, v_b.price_tzs, p_reason)
  returning id into v_case_id;

  update public.bookings
  set status = 'disputed',
      disputed_at = now(),
      refund_case_id = v_case_id
  where id = v_b.id;

  insert into public.notifications (user_id, kind, title, body, data)
  select u, 'booking_disputed', 'A problem was reported',
         'A care team member will look into this case and decide the payment.',
         jsonb_build_object('booking_id', v_b.id, 'case_id', v_case_id)
  from unnest(array[v_b.client_id, v_b.specialist_id]) as u;

  perform public.audit('dispute', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'disputed', 'case_id', v_case_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- No-show: specialist flags after the grace period; the client is refunded the
-- price minus a penalty (penalty funds come out of the held price, never the
-- raw wallet, so nothing can go negative).
-- ---------------------------------------------------------------------------
create function public.mark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_txn uuid;
  v_grace int;
  v_penalty_bps int;
  v_penalty bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if not (v_b.specialist_id = v_uid or public.authorize('hq')) then
    raise exception 'not authorized';
  end if;
  if v_b.status <> 'accepted' then
    raise exception 'booking is %, cannot flag no-show', v_b.status;
  end if;

  select (value #>> '{}')::int into v_grace
  from public.platform_settings where key = 'no_show_grace_minutes';
  v_grace := coalesce(v_grace, 30);

  if v_b.starts_at is null or now() < v_b.starts_at + make_interval(mins => v_grace) then
    raise exception 'the no-show grace period has not passed yet';
  end if;

  select (value #>> '{}')::int into v_penalty_bps
  from public.platform_settings where key = 'no_show_penalty_bps';
  v_penalty_bps := coalesce(v_penalty_bps, 1000);
  v_penalty := (v_b.price_tzs * v_penalty_bps) / 10000;

  v_txn := public.post_txn(
    'no_show',
    'noshow:' || v_b.id::text,
    jsonb_build_array(
      jsonb_build_object('kind', 'escrow', 'amount_tzs', -v_b.price_tzs),
      jsonb_build_object('kind', 'penalty_income', 'amount_tzs', v_penalty),
      jsonb_build_object('kind', 'client_wallet', 'user_id', v_b.client_id, 'amount_tzs', v_b.price_tzs - v_penalty)
    ),
    jsonb_build_object('booking_id', v_b.id, 'penalty_tzs', v_penalty)
  );

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      no_show_flagged_at = now()
  where id = v_b.id;

  insert into public.notifications (user_id, kind, title, body, data)
  select u, 'booking_no_show', 'The visit did not happen',
         case when u = v_b.client_id
              then 'The specialist reported you did not appear. Part of the payment returned to your wallet; a small charge was kept.'
              else 'The no-show was recorded.' end,
         jsonb_build_object('booking_id', v_b.id, 'txn_id', v_txn)
  from unnest(array[v_b.client_id, v_b.specialist_id]) as u;

  perform public.audit('no_show', 'booking', v_b.id::text,
                       jsonb_build_object('status', v_b.status),
                       jsonb_build_object('status', 'cancelled', 'txn_id', v_txn, 'penalty_tzs', v_penalty));
end;
$$;

-- ---------------------------------------------------------------------------
-- Repeat requests: no hold until the specialist accepts the repeat.
-- ---------------------------------------------------------------------------
alter table public.repeat_requests add column if not exists starts_at timestamptz;
create function public.request_repeat(p_prior_booking_id uuid, p_starts_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prior public.bookings;
  v_id uuid;
begin
  select * into v_prior from public.bookings where id = p_prior_booking_id;
  if v_prior.id is null then raise exception 'booking not found'; end if;
  if not (v_prior.client_id = v_uid and v_prior.status = 'completed') then
    raise exception 'only completed visits can be repeated';
  end if;
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes' then
    raise exception 'pick a start time at least 30 minutes ahead';
  end if;

  insert into public.repeat_requests (booking_id, client_id, specialist_id, status, starts_at)
  values (v_prior.id, v_uid, v_prior.specialist_id, 'pending', p_starts_at)
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_prior.specialist_id, 'repeat_requested', 'A client wants to book you again',
          'Same visit as before, at a new time. Accept to confirm.',
          jsonb_build_object('repeat_id', v_id, 'prior_booking_id', v_prior.id, 'starts_at', p_starts_at));

  return v_id;
end;
$$;

create function public.accept_repeat(p_repeat_id uuid)
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

create function public.decline_repeat(p_repeat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.repeat_requests;
begin
  select * into v_r from public.repeat_requests where id = p_repeat_id for update;
  if v_r.id is null then raise exception 'repeat request not found'; end if;
  if v_r.specialist_id <> v_uid then raise exception 'not your request'; end if;
  if v_r.status <> 'pending' then raise exception 'request already handled'; end if;

  update public.repeat_requests set status = 'declined' where id = p_repeat_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_r.client_id, 'repeat_declined', 'Repeat visit declined',
          'The specialist cannot take this repeat booking right now.',
          jsonb_build_object('repeat_id', p_repeat_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews: the client, only once, only after completion.
-- ---------------------------------------------------------------------------
create function public.submit_review(p_booking_id uuid, p_rating int, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings;
  v_id uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_b.client_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.status <> 'completed' then
    raise exception 'you can review after the visit is completed';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating must be 1 to 5';
  end if;

  insert into public.reviews (booking_id, client_id, specialist_id, rating, comment)
  values (v_b.id, v_uid, v_b.specialist_id, p_rating, p_comment)
  returning id into v_id;

  perform public.audit('create', 'review', v_id::text, null,
                       jsonb_build_object('booking_id', v_b.id, 'rating', p_rating));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Withdrawals: specialist requests, HQ pays manually and records.
-- ---------------------------------------------------------------------------
create function public.request_withdrawal(p_amount_tzs bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_balance bigint;
begin
  if not public.authorize('specialist') then
    raise exception 'only specialists can request withdrawals';
  end if;
  if p_amount_tzs is null or p_amount_tzs <= 0 then
    raise exception 'amount must be positive';
  end if;

  select public.get_earnings_balance() into v_balance;
  if p_amount_tzs > v_balance then
    raise exception 'amount exceeds available earnings';
  end if;

  insert into public.withdrawals (specialist_id, amount_tzs)
  values (v_uid, p_amount_tzs)
  returning id into v_id;

  perform public.audit('create', 'withdrawal', v_id::text, null,
                       jsonb_build_object('amount_tzs', p_amount_tzs));

  return v_id;
end;
$$;

create function public.hq_request_withdrawal(p_withdrawal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.withdrawals;
  v_txn uuid;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'pending' then
    raise exception 'withdrawal is %, not pending', v_w.status;
  end if;

  v_txn := public.post_txn(
    'withdrawal_paid',
    'withdrawal:' || v_w.id::text,
    jsonb_build_array(
      jsonb_build_object('kind', 'specialist_earnings', 'user_id', v_w.specialist_id, 'amount_tzs', -v_w.amount_tzs),
      jsonb_build_object('kind', 'external', 'amount_tzs', v_w.amount_tzs)
    ),
    jsonb_build_object('withdrawal_id', v_w.id)
  );

  update public.withdrawals
  set status = 'paid',
      paid_txn_id = v_txn,
      paid_by = auth.uid(),
      paid_at = now()
  where id = v_w.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_w.specialist_id, 'withdrawal_paid', 'Money sent',
          'Your earnings withdrawal has been paid out.',
          jsonb_build_object('withdrawal_id', v_w.id, 'txn_id', v_txn));

  perform public.audit('pay', 'withdrawal', v_w.id::text,
                       jsonb_build_object('status', 'pending'),
                       jsonb_build_object('status', 'paid', 'txn_id', v_txn));

  return v_txn;
end;
$$;

-- HQ can also decline a pending withdrawal request (nothing moved yet).
create function public.hq_reject_withdrawal(p_withdrawal_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.withdrawals;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'pending' then
    raise exception 'withdrawal is %, not pending', v_w.status;
  end if;

  update public.withdrawals
  set status = 'rejected'
  where id = v_w.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_w.specialist_id, 'withdrawal_rejected', 'Withdrawal not paid',
          coalesce(p_note, 'Please contact care for details.'),
          jsonb_build_object('withdrawal_id', v_w.id));

  perform public.audit('reject', 'withdrawal', v_w.id::text,
                       jsonb_build_object('status', 'pending'),
                       jsonb_build_object('status', 'rejected', 'note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat: HQ reads ONLY through this audited function. Direct RLS read is for
-- the booking participants alone.
-- ---------------------------------------------------------------------------
create function public.hq_read_chat(p_booking_id uuid, p_from timestamptz,
                                    p_to timestamptz)
returns table
  (message_id uuid, booking_id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;
  if p_to is null or p_to < p_from then
    raise exception 'pick a valid date range';
  end if;

  return query
    select m.id, m.booking_id, m.sender_id, m.body, m.created_at
    from public.messages m
    where m.booking_id = p_booking_id
      and m.created_at >= p_from
      and m.created_at < p_to + interval '1 day'
    order by m.created_at;

  perform public.audit('read_chat', 'booking', p_booking_id::text, null,
                       jsonb_build_object('from', p_from, 'to', p_to,
                                          'actor', auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat RLS: participants only, bookings that are not closed out.
-- ---------------------------------------------------------------------------
drop policy if exists "messages_booking_participants" on public.messages;
create policy "messages during active bookings"
  on public.messages for all
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.client_id = auth.uid() or b.specialist_id = auth.uid())
        and b.status not in ('cancelled', 'expired', 'declined')
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.client_id = auth.uid() or b.specialist_id = auth.uid())
        and b.status not in ('cancelled', 'expired', 'declined')
    )
    and sender_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.request_booking(uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) from public, anon;
revoke execute on function public._create_booking_with_hold(uuid, uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) from public, anon, authenticated;
revoke execute on function public.accept_booking(uuid) from public, anon;
revoke execute on function public.decline_booking(uuid) from public, anon;
revoke execute on function public.expire_booking_requests() from public, anon, authenticated;
revoke execute on function public.start_booking(uuid) from public, anon;
revoke execute on function public.complete_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.resolve_refund_case(uuid, bigint, text) from public, anon;
revoke execute on function public.dispute_booking(uuid, text) from public, anon;
revoke execute on function public.mark_no_show(uuid) from public, anon;
revoke execute on function public.request_repeat(uuid, timestamptz) from public, anon;
revoke execute on function public.accept_repeat(uuid) from public, anon;
revoke execute on function public.decline_repeat(uuid) from public, anon;
revoke execute on function public.submit_review(uuid, int, text) from public, anon;
revoke execute on function public.request_withdrawal(bigint) from public, anon;
revoke execute on function public.hq_request_withdrawal(uuid) from public, anon;
revoke execute on function public.hq_reject_withdrawal(uuid, text) from public, anon;
revoke execute on function public.hq_read_chat(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function public.request_booking(uuid, uuid, bigint, timestamptz, double precision, double precision, text, text) to authenticated;
grant execute on function public.accept_booking(uuid) to authenticated;
grant execute on function public.decline_booking(uuid) to authenticated;
grant execute on function public.start_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.resolve_refund_case(uuid, bigint, text) to authenticated;
grant execute on function public.dispute_booking(uuid, text) to authenticated;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.request_repeat(uuid, timestamptz) to authenticated;
grant execute on function public.accept_repeat(uuid) to authenticated;
grant execute on function public.decline_repeat(uuid) to authenticated;
grant execute on function public.submit_review(uuid, int, text) to authenticated;
grant execute on function public.request_withdrawal(bigint) to authenticated;
grant execute on function public.hq_request_withdrawal(uuid) to authenticated;
grant execute on function public.hq_reject_withdrawal(uuid, text) to authenticated;
grant execute on function public.hq_read_chat(uuid, timestamptz, timestamptz) to authenticated;

grant execute on function public.expire_booking_requests() to service_role;

-- pg_cron: run every minute.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'nama_expire_booking_requests',
    '* * * * *',
    $job$select public.expire_booking_requests();$job$
  );
exception when others then
  raise notice 'pg_cron schedule failed (%); run expire_booking_requests manually', sqlerrm;
end;
$$;
