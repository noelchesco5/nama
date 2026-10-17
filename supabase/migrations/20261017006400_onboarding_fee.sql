-- nama - Phase 3: specialist console two-gate onboarding fee.
--
-- Gate 1: HQ approves the specialist profile (status -> approved; admin).
-- Gate 2: HQ publishes an onboarding fee (platform_settings), the specialist
-- files a payment request for EXACTLY that fee against an HQ merchant number,
-- pays it externally (mobile money to the displayed number), and HQ confirms
-- in the HQ console. Only then does the console unlock.
--
-- The money moves outside the app (client pays the merchant account), so no
-- ledger posting happens here; we record the payment_request for the audit
-- trail and the queue. The reference is tagged so HQ can filter it.

insert into public.platform_settings (key, value)
values ('onboarding_fee_tzs', '20000')
on conflict (key) do nothing;

-- Specialist files the onboarding-fee payment.
create function public.request_onboarding_fee(p_merchant_number_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_fee bigint;
  v_id uuid;
begin
  if not public.authorize('specialist') then
    raise exception 'only specialists can request onboarding';
  end if;

  select (value #>> '{}')::bigint into v_fee
  from public.platform_settings where key = 'onboarding_fee_tzs';
  v_fee := coalesce(v_fee, 20000);

  -- One request at a time, and never after the console is unlocked.
  select sp.console_unlocked into v_id from public.specialist_profiles sp
  where sp.user_id = v_uid and sp.console_unlocked;
  if v_id is not null then
    raise exception 'console already unlocked';
  end if;

  select id into v_id from public.payment_requests
  where user_id = v_uid and reference = 'onboarding:' || v_uid::text and status = 'pending';
  if v_id is not null then
    raise exception 'an onboarding payment is already awaiting review';
  end if;

  insert into public.payment_requests
    (user_id, amount_tzs, network, merchant_number_id, reference, expires_at)
  values
    (v_uid, v_fee, (select network from public.merchant_numbers where id = p_merchant_number_id),
     p_merchant_number_id, 'onboarding:' || v_uid::text, now() + interval '3 days')
  returning id into v_id;

  perform public.audit('create', 'payment_request', v_id::text, null,
                       jsonb_build_object('kind', 'onboarding_fee', 'amount_tzs', v_fee));

  return v_id;
end;
$$;

-- HQ confirms the onboarding payment: unlocks the console. No wallet credit.
create function public.approve_onboarding(p_request_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.payment_requests;
begin
  if public.authorize('hq') = false then
    raise exception 'not authorized';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.reference is null or left(v_req.reference, 11) <> 'onboarding:' then
    raise exception 'request is not an onboarding payment';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request is %, not pending', v_req.status;
  end if;

  update public.payment_requests
  set status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = coalesce(p_note, 'onboarding fee confirmed')
  where id = v_req.id;

  update public.specialist_profiles
  set onboarding_fee_paid = true,
      console_unlocked = true
  where user_id = v_req.user_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (v_req.user_id, 'console_unlocked', 'Your console is ready',
          'The onboarding payment is confirmed. Your business tools are now open.',
          jsonb_build_object('request_id', v_req.id));

  perform public.audit('approve', 'payment_request', v_req.id::text,
                       jsonb_build_object('status', 'pending'),
                       jsonb_build_object('status', 'approved',
                                          'kind', 'onboarding_fee',
                                          'unlocked_user', v_req.user_id));
end;
$$;

revoke execute on function public.request_onboarding_fee(uuid) from public, anon;
revoke execute on function public.approve_onboarding(uuid, text) from public, anon;
grant execute on function public.request_onboarding_fee(uuid) to authenticated;
grant execute on function public.approve_onboarding(uuid, text) to authenticated;
