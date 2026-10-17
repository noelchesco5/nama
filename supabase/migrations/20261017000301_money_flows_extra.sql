-- nama - Phase 1 backend completion: reason codes, cancel, appeals, refund
-- policy helper, HQ merchant management, rate limiting, and the private
-- payment-evidence storage bucket.

-- ---------------------------------------------------------------------------
-- Reason codes
-- ---------------------------------------------------------------------------
create table public.reason_codes (
  id text primary key,
  label text not null,
  audience text not null default 'general'
    check (audience in ('topup', 'refund', 'no_show', 'general')),
  is_active boolean not null default true,
  sort int not null default 0
);

insert into public.reason_codes (id, label, audience, sort) values
  ('ref_not_found',       'Payment reference not found',        'topup', 1),
  ('amount_mismatch',     'Amount does not match',              'topup', 2),
  ('duplicate',           'Duplicate of an earlier payment',    'topup', 3),
  ('unclear_screenshot',  'Screenshot unclear or missing',      'topup', 4),
  ('suspected_fraud',     'Suspected fraud',                    'topup', 5),
  ('other',               'Other',                              'general', 99),
  ('client_no_show',      'Client did not show up',             'no_show', 1),
  ('specialist_no_show',  'Specialist did not show up',         'no_show', 2)
on conflict (id) do nothing;

alter table public.reason_codes enable row level security;

create policy "reason codes readable"
  on public.reason_codes for select
  to authenticated using (true);

create policy "reason codes writable by hq"
  on public.reason_codes for all
  to authenticated using (public.authorize('hq')) with check (public.authorize('hq'));

-- One merchant row per (network, number).
create unique index if not exists merchant_numbers_network_number_uniq
  on public.merchant_numbers (network, number);

-- ---------------------------------------------------------------------------
-- New columns on top-up requests
-- ---------------------------------------------------------------------------
alter table public.payment_requests
  add column if not exists reason_code text references public.reason_codes (id),
  add column if not exists appealed_at timestamptz,
  add column if not exists appeal_note text,
  add column if not exists appeal_screenshot_path text,
  add column if not exists cancelled_at timestamptz;

-- ---------------------------------------------------------------------------
-- Refund policy helper. Returns the maximum refundable amount in whole TZS
-- for a booking priced p_price cancelled p_hours_before start.
--   >= 6h  -> full
--   >= 1h  -> partial_refund_max_pct (default 75)
--   < 1h   -> partial_refund_min_pct (default 50)
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('partial_refund_under_1h_pct', '50'),
  ('topup_rate_limit_per_hour', '5')
on conflict (key) do nothing;

create function public.max_refund_allowed(p_price bigint, p_hours_before numeric)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hi int;
  v_lo int;
begin
  if p_price is null or p_price <= 0 then
    return 0;
  end if;

  select (value #>> '{}')::int into v_hi
  from public.platform_settings where key = 'partial_refund_max_pct';
  v_hi := coalesce(v_hi, 75);

  select (value #>> '{}')::int into v_lo
  from public.platform_settings where key = 'partial_refund_under_1h_pct';
  v_lo := coalesce(v_lo, 50);

  if p_hours_before is null or p_hours_before >= 6 then
    return p_price;
  elsif p_hours_before >= 1 then
    return (p_price * v_hi) / 100;
  else
    return (p_price * v_lo) / 100;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate-limited request_topup (replaces the Phase 1 first cut).
-- ---------------------------------------------------------------------------
create or replace function public.request_topup(
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
  v_limit int;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_amount_tzs is null or p_amount_tzs <= 0 then
    raise exception 'amount must be positive';
  end if;

  select (value #>> '{}')::int into v_limit
  from public.platform_settings where key = 'topup_rate_limit_per_hour';
  v_limit := coalesce(v_limit, 5);

  select count(*) into v_recent
  from public.payment_requests
  where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= v_limit then
    raise exception 'too many top-up requests; try again later';
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

-- ---------------------------------------------------------------------------
-- reject_topup now takes a structured reason code.
-- ---------------------------------------------------------------------------
drop function if exists public.reject_topup(uuid, text);

create function public.reject_topup(
  p_request_id uuid,
  p_reason_code text,
  p_note text default null
)
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

  if not exists (select 1 from public.reason_codes where id = p_reason_code and is_active) then
    raise exception 'unknown reason code %', p_reason_code;
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.status <> 'pending' then
    raise exception 'request is %, not pending', v_req.status;
  end if;

  update public.payment_requests
  set status = 'rejected',
      reason_code = p_reason_code,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_note
  where id = v_req.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_req.user_id, 'topup_rejected', 'Top-up could not be verified',
          coalesce(p_note, (select label from public.reason_codes where id = p_reason_code)),
          jsonb_build_object('request_id', v_req.id, 'reason_code', p_reason_code));

  perform public.audit('reject', 'payment_request', v_req.id::text, null,
                       jsonb_build_object('reason_code', p_reason_code, 'note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Client actions: cancel a pending request, appeal a rejected/expired one.
-- ---------------------------------------------------------------------------
create function public.cancel_topup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.user_id <> auth.uid() then raise exception 'not authorized'; end if;
  if v_req.status <> 'pending' then
    raise exception 'only pending requests can be cancelled';
  end if;

  update public.payment_requests
  set status = 'cancelled', cancelled_at = now()
  where id = v_req.id;
end;
$$;

create function public.appeal_topup(
  p_request_id uuid,
  p_note text,
  p_screenshot_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.user_id <> auth.uid() then raise exception 'not authorized'; end if;
  if v_req.status not in ('rejected', 'expired') then
    raise exception 'only rejected or expired requests can be appealed';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'an appeal needs a note';
  end if;

  update public.payment_requests
  set status = 'appealed',
      appealed_at = now(),
      appeal_note = p_note,
      appeal_screenshot_path = p_screenshot_path
  where id = v_req.id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_req.user_id, 'topup_appeal_received', 'Appeal received',
          'We will review your appeal and get back to you.',
          jsonb_build_object('request_id', v_req.id));
end;
$$;

-- HQ resolves an appeal: approve (post the top-up once) or decline.
create function public.resolve_appeal(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.payment_requests;
  v_txn uuid;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.status <> 'appealed' then
    raise exception 'request is %, not appealed', v_req.status;
  end if;

  if p_approve then
    v_txn := public.post_topup(v_req.user_id, v_req.amount_tzs, v_req.id);
    update public.payment_requests
    set status = 'appeal_approved',
        posted_txn_id = v_txn,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    where id = v_req.id;

    insert into public.notifications (user_id, kind, title, body, data)
    values (v_req.user_id, 'topup_approved', 'Appeal approved - wallet topped up',
            'Your appeal was accepted and your wallet has been credited.',
            jsonb_build_object('request_id', v_req.id, 'txn_id', v_txn));
  else
    update public.payment_requests
    set status = 'appeal_rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    where id = v_req.id;

    insert into public.notifications (user_id, kind, title, body, data)
    values (v_req.user_id, 'topup_appeal_rejected', 'Appeal declined',
            coalesce(p_note, 'Your appeal was reviewed and declined.'),
            jsonb_build_object('request_id', v_req.id));
  end if;

  perform public.audit('resolve_appeal', 'payment_request', v_req.id::text, null,
                       jsonb_build_object('approve', p_approve, 'note', p_note, 'txn_id', v_txn));
end;
$$;

-- ---------------------------------------------------------------------------
-- HQ merchant management with before/after audit.
-- ---------------------------------------------------------------------------
create function public.hq_set_merchant(
  p_network public.payment_network,
  p_number text,
  p_display_name text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_id uuid;
  v_after jsonb;
begin
  if not public.authorize('hq') then
    raise exception 'not authorized';
  end if;

  select to_jsonb(m) into v_before
  from public.merchant_numbers m
  where m.network = p_network and m.number = p_number;

  insert into public.merchant_numbers (network, number, display_name, is_active)
  values (p_network, p_number, p_display_name, p_is_active)
  on conflict (network, number)
  do update set display_name = excluded.display_name, is_active = excluded.is_active
  returning id into v_id;

  select to_jsonb(m) into v_after
  from public.merchant_numbers m
  where m.id = v_id;

  perform public.audit(
    case when v_before is null then 'create' else 'update' end,
    'merchant_number', v_id::text, v_before, v_after
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private evidence bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "payment evidence owner read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-evidence'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "payment evidence owner write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'payment-evidence'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "payment evidence hq read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-evidence' and public.authorize('hq'));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.reason_codes from anon;
grant select on public.reason_codes to authenticated;

revoke execute on function public.max_refund_allowed(bigint, numeric) from public, anon;
grant execute on function public.max_refund_allowed(bigint, numeric) to authenticated;

revoke execute on function public.reject_topup(uuid, text, text) from public, anon;
grant execute on function public.reject_topup(uuid, text, text) to authenticated;

revoke execute on function public.cancel_topup(uuid) from public, anon;
revoke execute on function public.appeal_topup(uuid, text, text) from public, anon;
grant execute on function public.cancel_topup(uuid) to authenticated;
grant execute on function public.appeal_topup(uuid, text, text) to authenticated;

revoke execute on function public.resolve_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_appeal(uuid, boolean, text) to authenticated;

revoke execute on function public.hq_set_merchant(public.payment_network, text, text, boolean) from public, anon;
grant execute on function public.hq_set_merchant(public.payment_network, text, text, boolean) to authenticated;
