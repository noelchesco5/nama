-- nama - Phase 1 backend-completion test: reason codes, rate limit, cancel,
-- appeals, refund policy helper, HQ merchant management, storage bucket,
-- and the privilege surface. Runs in one transaction and rolls back.

begin;

do $$
declare
  ca uuid := '55555555-5555-5555-5555-555555555555';
  hq uuid := '77777777-7777-7777-7777-777777777777';
  v_mn uuid;
  r1 uuid;
  r2 uuid;
  r3 uuid;
  r5 uuid;
  v_status public.payment_status;
  v_bal bigint;
  v_before jsonb;
  v_after jsonb;
  v_n int;
begin
  delete from public.payment_requests where user_id in (ca, hq);
  delete from public.notifications where user_id in (ca, hq);
  delete from public.merchant_numbers where number in ('0755000000','0755999999');
  delete from auth.users where id in (ca, hq);

  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (ca,'authenticated','authenticated','be.client@test.local','x','2026-10-17','2026-10-17',
          '{"full_name":"BE Client","intended_role":"client","locale":"en"}');
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  values (hq,'authenticated','authenticated','be.hq@test.local','x','2026-10-17','2026-10-17');
  update public.user_roles set role = 'hq' where user_id = hq;

  insert into public.merchant_numbers (network, number, display_name)
  values ('mpesa', '0755000000', 'Nama M-Pesa') returning id into v_mn;

  select count(*) into v_n from public.reason_codes where audience in ('topup','general');
  if v_n < 5 then raise exception 'reason codes missing'; end if;

  -- ---------------------------------------------------------------------
  -- Refund policy helper
  -- ---------------------------------------------------------------------
  if public.max_refund_allowed(10000, 7) <> 10000 then raise exception 'refund >=6h wrong'; end if;
  if public.max_refund_allowed(10000, 3) <> 7500 then raise exception 'refund 1-6h wrong'; end if;
  if public.max_refund_allowed(10000, 0.5) <> 5000 then raise exception 'refund <1h wrong'; end if;

  -- ---------------------------------------------------------------------
  -- Rate limit (client)
  -- ---------------------------------------------------------------------
  update public.platform_settings set value = '2' where key = 'topup_rate_limit_per_hour';
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);

  select public.request_topup(1000, 'mpesa', v_mn, 'R1') into r1;
  select public.request_topup(2000, 'mpesa', v_mn, 'R2') into r2;
  begin
    select public.request_topup(3000, 'mpesa', v_mn, 'R3') into r3;
    raise exception 'rate limit not enforced';
  exception when others then
    if sqlerrm like '%rate limit not enforced%' then raise; end if;
  end;
  update public.platform_settings set value = '5' where key = 'topup_rate_limit_per_hour';

  -- ---------------------------------------------------------------------
  -- Cancel (client)
  -- ---------------------------------------------------------------------
  perform public.cancel_topup(r1);
  select status into v_status from public.payment_requests where id = r1;
  if v_status <> 'cancelled' then raise exception 'cancel failed got %', v_status; end if;

  -- ---------------------------------------------------------------------
  -- Reject with reason code (HQ); invalid code refused
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  begin
    perform public.reject_topup(r2, 'not_a_real_code', 'x');
    raise exception 'invalid reason code accepted';
  exception when others then
    if sqlerrm like '%invalid reason code accepted%' then raise; end if;
  end;
  perform public.reject_topup(r2, 'ref_not_found', 'no such txn');
  select status into v_status from public.payment_requests where id = r2;
  if v_status <> 'rejected' then raise exception 'reject failed got %', v_status; end if;

  -- ---------------------------------------------------------------------
  -- resolve_appeal guard: only appealed requests
  -- ---------------------------------------------------------------------
  begin
    perform public.resolve_appeal(r1, true, 'x');
    raise exception 'resolved non-appealed request';
  exception when others then
    if sqlerrm like '%resolved non-appealed request%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- Appeal a rejected request; HQ approves -> wallet credited once
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  perform public.appeal_topup(r2, 'I paid, please recheck', 'ca/req/evidence.jpg');
  select status into v_status from public.payment_requests where id = r2;
  if v_status <> 'appealed' then raise exception 'appeal failed got %', v_status; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.resolve_appeal(r2, true, 'verified manually');
  select status into v_status from public.payment_requests where id = r2;
  if v_status <> 'appeal_approved' then raise exception 'appeal approve status %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 2000 then raise exception 'appeal credited wrong amount %', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- Appeal declined: no credit
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_topup(5000, 'mpesa', v_mn, 'R5') into r5;
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.reject_topup(r5, 'amount_mismatch', 'too low');
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  perform public.appeal_topup(r5, 'please look again', null);
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.resolve_appeal(r5, false, 'statement reviewed');
  select status into v_status from public.payment_requests where id = r5;
  if v_status <> 'appeal_rejected' then raise exception 'appeal decline status %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 2000 then raise exception 'declined appeal changed wallet %', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- HQ merchant management with before/after audit
  -- ---------------------------------------------------------------------
  perform public.hq_set_merchant('tigopesa', '0755999999', 'Nama Tigo', true);
  perform public.hq_set_merchant('tigopesa', '0755999999', 'Nama Tigo Updated', false);

  select before, after into v_before, v_after
  from public.audit_log
  where entity = 'merchant_number'
  order by created_at desc, id desc
  limit 1;
  if v_before is null then raise exception 'merchant update not audited with before'; end if;
  if (v_after->>'display_name') <> 'Nama Tigo Updated' then raise exception 'merchant after wrong'; end if;
  if (v_after->>'is_active')::boolean <> false then raise exception 'merchant active wrong'; end if;

  -- ---------------------------------------------------------------------
  -- Storage bucket exists
  -- ---------------------------------------------------------------------
  select count(*) into v_n from storage.buckets where id = 'payment-evidence';
  if v_n <> 1 then raise exception 'payment-evidence bucket missing'; end if;

  -- ---------------------------------------------------------------------
  -- Privilege surface
  -- ---------------------------------------------------------------------
  if not has_function_privilege('authenticated', 'public.cancel_topup(uuid)', 'execute') then
    raise exception 'authenticated cannot cancel_topup'; end if;
  if not has_function_privilege('authenticated', 'public.appeal_topup(uuid,text,text)', 'execute') then
    raise exception 'authenticated cannot appeal_topup'; end if;
  if not has_function_privilege('authenticated', 'public.resolve_appeal(uuid,boolean,text)', 'execute') then
    raise exception 'authenticated cannot resolve_appeal'; end if;
  if not has_function_privilege('authenticated', 'public.hq_set_merchant(public.payment_network,text,text,boolean)', 'execute') then
    raise exception 'authenticated cannot hq_set_merchant'; end if;
  if not has_function_privilege('authenticated', 'public.max_refund_allowed(bigint,numeric)', 'execute') then
    raise exception 'authenticated cannot max_refund_allowed'; end if;
  if has_function_privilege('authenticated', 'public.post_topup(uuid,bigint,uuid)', 'execute') then
    raise exception 'authenticated can post_topup'; end if;

  raise notice 'TESTS_PASSED';
end;
$$;

rollback;
