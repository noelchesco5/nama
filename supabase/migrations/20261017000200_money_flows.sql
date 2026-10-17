-- nama - Phase 1 money flows: top-up state machine, notifications, and the
-- standard ledger postings.
--
-- Top-up lifecycle: pending -> approved | rejected | expired.
--   * A client files a request with the amount, network, merchant number and
--     the M-Pesa/Tigo/etc reference they used.
--   * HQ (or auto-verify) approves it, which posts the ledger entry once
--     (idempotent on the request id) and notifies the client.
--   * Unreviewed requests expire via pg_cron (best effort; see note).
--
-- Standard postings wrap post_txn so the money math lives in one place and
-- callers cannot get the lines or fee split wrong.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.payment_network as enum (
  'mpesa', 'tigopesa', 'airtel', 'halopesa', 'mixx'
);

create type public.payment_status as enum (
  'pending', 'approved', 'rejected', 'expired'
);

insert into public.platform_settings (key, value) values
  ('topup_auto_verify', 'false'),
  ('topup_window_minutes', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Merchant (pay-to) numbers, managed by HQ.
-- ---------------------------------------------------------------------------
create table public.merchant_numbers (
  id uuid primary key default gen_random_uuid(),
  network public.payment_network not null,
  number text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger merchant_numbers_set_updated_at
  before update on public.merchant_numbers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Top-up requests.
-- ---------------------------------------------------------------------------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_tzs bigint not null check (amount_tzs > 0),
  network public.payment_network not null,
  merchant_number_id uuid references public.merchant_numbers (id),
  reference text,
  screenshot_path text,
  status public.payment_status not null default 'pending',
  posted_txn_id uuid references public.ledger_txns (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index payment_requests_status_idx on public.payment_requests (status, expires_at);

create trigger payment_requests_set_updated_at
  before update on public.payment_requests
  for each row execute function public.set_updated_at();

-- One approved posting per request, even under concurrency / retries.
create unique index payment_requests_posted_uniq
  on public.payment_requests (posted_txn_id)
  where posted_txn_id is not null;

-- ---------------------------------------------------------------------------
-- Notifications (in-app only).
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Standard postings (all SECURITY DEFINER; callers are trusted server paths).
-- ---------------------------------------------------------------------------
create function public.post_topup(p_user_id uuid, p_amount bigint, p_request_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.post_txn(
    'topup_approved',
    'topup:' || p_request_id::text,
    jsonb_build_array(
      jsonb_build_object('kind','client_wallet','user_id',p_user_id,'amount_tzs',p_amount),
      jsonb_build_object('kind','external','amount_tzs',-p_amount)
    ),
    jsonb_build_object('request_id', p_request_id)
  );
$$;

create function public.post_hold(p_client_id uuid, p_amount bigint, p_booking_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.post_txn(
    'booking_hold',
    'hold:' || p_booking_id::text,
    jsonb_build_array(
      jsonb_build_object('kind','client_wallet','user_id',p_client_id,'amount_tzs',-p_amount),
      jsonb_build_object('kind','escrow','amount_tzs',p_amount)
    ),
    jsonb_build_object('booking_id', p_booking_id)
  );
$$;

create function public.post_completion(
  p_specialist_id uuid,
  p_amount bigint,
  p_booking_id uuid,
  p_fee_bps int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee_bps int;
  v_fee bigint;
begin
  if p_fee_bps is null then
    select (value #>> '{}')::int into v_fee_bps
    from public.platform_settings where key = 'fee_bps';
  else
    v_fee_bps := p_fee_bps;
  end if;
  v_fee_bps := coalesce(v_fee_bps, 700);

  -- Integer TZS: floor the fee, give the remainder to the specialist.
  v_fee := (p_amount * v_fee_bps) / 10000;

  return public.post_txn(
    'booking_completed',
    'complete:' || p_booking_id::text,
    jsonb_build_array(
      jsonb_build_object('kind','escrow','amount_tzs',-p_amount),
      jsonb_build_object('kind','platform_revenue','amount_tzs',v_fee),
      jsonb_build_object('kind','specialist_earnings','user_id',p_specialist_id,'amount_tzs',p_amount - v_fee)
    ),
    jsonb_build_object('booking_id', p_booking_id, 'fee_bps', v_fee_bps)
  );
end;
$$;

create function public.post_refund(p_client_id uuid, p_amount bigint, p_refund_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.post_txn(
    'refund',
    'refund:' || p_refund_id::text,
    jsonb_build_array(
      jsonb_build_object('kind','escrow','amount_tzs',-p_amount),
      jsonb_build_object('kind','client_wallet','user_id',p_client_id,'amount_tzs',p_amount)
    ),
    jsonb_build_object('refund_id', p_refund_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Top-up functions
-- ---------------------------------------------------------------------------

-- File a top-up request. If auto-verify is on, post immediately.
create function public.request_topup(
  p_amount_tzs bigint,
  p_network public.payment_network,
  p_merchant_number_id uuid,
  p_reference text default null,
  p_screenshot_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_window int;
  v_auto boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_amount_tzs is null or p_amount_tzs <= 0 then
    raise exception 'amount must be positive';
  end if;

  select (value #>> '{}')::int into v_window
  from public.platform_settings where key = 'topup_window_minutes';
  v_window := coalesce(v_window, 30);

  select (value #>> '{}')::boolean into v_auto
  from public.platform_settings where key = 'topup_auto_verify';
  v_auto := coalesce(v_auto, false);

  insert into public.payment_requests
    (user_id, amount_tzs, network, merchant_number_id, reference, screenshot_path, expires_at)
  values
    (v_uid, p_amount_tzs, p_network, p_merchant_number_id, p_reference, p_screenshot_path,
     now() + make_interval(mins => v_window))
  returning id into v_id;

  if v_auto then
    perform public._apply_topup_approval(v_id, 'auto-verified', null);
  else
    insert into public.notifications (user_id, kind, title, body, data)
    values (v_uid, 'topup_pending', 'Top-up received',
            'We are checking your payment. You will be credited shortly.',
            jsonb_build_object('request_id', v_id, 'amount_tzs', p_amount_tzs));
  end if;

  return v_id;
end;
$$;

-- Internal: post a pending request once and flip it to approved. No auth check
-- (callers are the HQ wrapper or the auto-verify path). Not client-callable.
create function public._apply_topup_approval(
  p_request_id uuid,
  p_note text,
  p_reviewer uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
  v_txn uuid;
begin
  select * into v_req
  from public.payment_requests
  where id = p_request_id
  for update;

  if v_req.id is null then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request is %, not pending', v_req.status;
  end if;

  v_txn := public.post_topup(v_req.user_id, v_req.amount_tzs, v_req.id);

  update public.payment_requests
  set status = 'approved',
      posted_txn_id = v_txn,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = p_note
  where id = v_req.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_req.user_id, 'topup_approved', 'Wallet topped up',
          'Your wallet has been credited.',
          jsonb_build_object('request_id', v_req.id, 'amount_tzs', v_req.amount_tzs, 'txn_id', v_txn));

  perform public.audit('approve', 'payment_request', v_req.id::text, null,
                       jsonb_build_object('amount_tzs', v_req.amount_tzs, 'txn_id', v_txn));

  return v_txn;
end;
$$;

-- Approve a pending request (HQ only): post the ledger entry once, notify.
create function public.approve_topup(p_request_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  return public._apply_topup_approval(p_request_id, p_note, auth.uid());
end;
$$;

create function public.reject_topup(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select * into v_req
  from public.payment_requests
  where id = p_request_id
  for update;

  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.status <> 'pending' then
    raise exception 'request is %, not pending', v_req.status;
  end if;

  update public.payment_requests
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_reason
  where id = v_req.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_req.user_id, 'topup_rejected', 'Top-up could not be verified',
          coalesce(p_reason, 'Please check the details and try again.'),
          jsonb_build_object('request_id', v_req.id));

  perform public.audit('reject', 'payment_request', v_req.id::text, null,
                       jsonb_build_object('reason', p_reason));
end;
$$;

-- Cron: expire stale pending requests. No ledger effect.
create function public.expire_topups()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_req public.payment_requests;
begin
  for v_req in
    select * from public.payment_requests
    where status = 'pending' and expires_at < now()
    for update skip locked
  loop
    update public.payment_requests
    set status = 'expired', reviewed_at = now(), review_note = 'auto-expired'
    where id = v_req.id;

    insert into public.notifications (user_id, kind, title, body, data)
    values (v_req.user_id, 'topup_expired', 'Top-up request expired',
            'Your top-up request expired before it was verified. Submit again?',
            jsonb_build_object('request_id', v_req.id));

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.merchant_numbers enable row level security;
alter table public.payment_requests enable row level security;
alter table public.notifications enable row level security;

create policy "merchant numbers readable"
  on public.merchant_numbers for select
  to authenticated using (true);

create policy "merchant numbers writable by hq"
  on public.merchant_numbers for all
  to authenticated using (public.authorize('hq')) with check (public.authorize('hq'));

create policy "payment requests readable by owner or hq"
  on public.payment_requests for select
  to authenticated
  using (user_id = auth.uid() or public.authorize('hq'));

create policy "payment requests update by hq"
  on public.payment_requests for update
  to authenticated using (public.authorize('hq')) with check (public.authorize('hq'));

create policy "notifications readable by owner"
  on public.notifications for select
  to authenticated using (user_id = auth.uid());

create policy "notifications mark read by owner"
  on public.notifications for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.merchant_numbers from anon;
revoke all on public.payment_requests from anon;
revoke all on public.notifications from anon;

grant select on public.merchant_numbers to authenticated;
grant select, update on public.payment_requests to authenticated;
grant select, update on public.notifications to authenticated;

-- Client-callable via RPC.
revoke execute on function public.request_topup(bigint, public.payment_network, uuid, text, text) from public, anon;
grant execute on function public.request_topup(bigint, public.payment_network, uuid, text, text) to authenticated;

-- HQ-callable (guarded internally by authorize('hq')).
revoke execute on function public.approve_topup(uuid, text) from public, anon;
revoke execute on function public.reject_topup(uuid, text) from public, anon;
grant execute on function public.approve_topup(uuid, text) to authenticated;
grant execute on function public.reject_topup(uuid, text) to authenticated;

-- Server-only postings and cron.
revoke execute on function public._apply_topup_approval(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.post_topup(uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.post_hold(uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.post_completion(uuid, bigint, uuid, int) from public, anon, authenticated;
revoke execute on function public.post_refund(uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.expire_topups() from public, anon, authenticated;
grant execute on function public.post_topup(uuid, bigint, uuid) to service_role;
grant execute on function public.post_hold(uuid, bigint, uuid) to service_role;
grant execute on function public.post_completion(uuid, bigint, uuid, int) to service_role;
grant execute on function public.post_refund(uuid, bigint, uuid) to service_role;
grant execute on function public.expire_topups() to service_role;

-- ---------------------------------------------------------------------------
-- Schedule expiry. pg_cron may need enabling in the dashboard; fall back to a
-- notice so the migration still applies.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'nama_expire_topups',
    '*/5 * * * *',
    $job$select public.expire_topups();$job$
  );
exception when others then
  raise notice 'pg_cron not scheduled (%); run expire_topups manually or enable pg_cron', sqlerrm;
end;
$$;
