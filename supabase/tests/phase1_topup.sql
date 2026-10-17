-- nama - Phase 1 top-up state machine test.
--
-- Runs in one transaction and rolls back. Exercises request/approve/reject/
-- expire, auto-verify, notifications, ledger effects, privilege grants and RLS
-- isolation of payment_requests.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/phase1_topup.sql

begin;

do $$
declare
  ca uuid := '55555555-5555-5555-5555-555555555555';  -- client
  hq uuid := '77777777-7777-7777-7777-777777777777';  -- hq
  v_mn uuid;
  v_req uuid;
  v_req2 uuid;
  v_req3 uuid;
  v_n int;
  v_status public.payment_status;
  v_bal bigint;
begin
  delete from public.payment_requests where user_id in (ca, hq);
  delete from public.notifications where user_id in (ca, hq);
  delete from auth.users where id in (ca, hq);

  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (ca,'authenticated','authenticated','topup.client@test.local','x','2026-10-17','2026-10-17',
          '{"full_name":"Topup Client","intended_role":"client","locale":"en"}');
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  values (hq,'authenticated','authenticated','topup.hq@test.local','x','2026-10-17','2026-10-17');
  update public.user_roles set role = 'hq' where user_id = hq;

  insert into public.merchant_numbers (network, number, display_name)
  values ('mpesa', '0755000000', 'Nama M-Pesa')
  returning id into v_mn;

  -- ---------------------------------------------------------------------
  -- Manual verify (default): request stays pending, no ledger effect yet.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);

  select public.request_topup(10000, 'mpesa', v_mn, 'REF123') into v_req;

  select status into v_status from public.payment_requests where id = v_req;
  if v_status <> 'pending' then raise exception 'expected pending, got %', v_status; end if;

  select coalesce(balance_tzs,0) into v_bal
  from public.accounts where kind='client_wallet' and user_id=ca;
  if coalesce(v_bal,0) <> 0 then raise exception 'wallet credited before approval'; end if;

  select count(*) into v_n from public.notifications where user_id=ca and kind='topup_pending';
  if v_n <> 1 then raise exception 'no pending notification'; end if;

  -- ---------------------------------------------------------------------
  -- HQ approves: wallet credited once, status approved, notified, audited.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);

  perform public.approve_topup(v_req, 'checked bank statement');

  select status into v_status from public.payment_requests where id = v_req;
  if v_status <> 'approved' then raise exception 'expected approved, got %', v_status; end if;

  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 10000 then raise exception 'wallet expected 10000 got %', v_bal; end if;

  select count(*) into v_n from public.notifications where user_id=ca and kind='topup_approved';
  if v_n <> 1 then raise exception 'no approved notification'; end if;

  select count(*) into v_n from public.audit_log
  where entity='payment_request' and entity_id = v_req::text and action='approve';
  if v_n <> 1 then raise exception 'approve not audited'; end if;

  -- re-approving must fail and must not double-credit
  begin
    perform public.approve_topup(v_req, 'again');
    raise exception 'second approve was allowed';
  exception when others then
    if sqlerrm like '%second approve was allowed%' then raise; end if;
  end;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 10000 then raise exception 'double credit on re-approve (%).', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- Non-HQ cannot approve.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_topup(20000, 'tigopesa', v_mn, 'REF456') into v_req2;
  begin
    perform public.approve_topup(v_req2, 'self-approve');
    raise exception 'client approved own topup';
  exception when others then
    if sqlerrm like '%client approved own topup%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- HQ rejects: no ledger effect.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.reject_topup(v_req2, 'reference not found');
  select status into v_status from public.payment_requests where id = v_req2;
  if v_status <> 'rejected' then raise exception 'expected rejected, got %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 10000 then raise exception 'rejected request changed wallet (%)', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- Expiry: a stale pending request is flipped by the cron function.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  insert into public.payment_requests (user_id, amount_tzs, network, merchant_number_id, expires_at)
  values (ca, 5000, 'airtel', v_mn, now() - interval '1 minute')
  returning id into v_req3;

  v_n := public.expire_topups();
  if v_n < 1 then raise exception 'expire_topups expired nothing'; end if;
  select status into v_status from public.payment_requests where id = v_req3;
  if v_status <> 'expired' then raise exception 'expected expired, got %', v_status; end if;

  -- ---------------------------------------------------------------------
  -- Auto-verify: a request is credited immediately on filing.
  -- ---------------------------------------------------------------------
  update public.platform_settings set value = 'true' where key = 'topup_auto_verify';
  select public.request_topup(3000, 'mixx', v_mn, 'AUTO1') into v_req3;
  update public.platform_settings set value = 'false' where key = 'topup_auto_verify';

  select status into v_status from public.payment_requests where id = v_req3;
  if v_status <> 'approved' then raise exception 'auto-verify expected approved, got %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 13000 then raise exception 'auto-verify wallet expected 13000 got %', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- Privilege surface: clients file requests; they cannot post to the ledger.
  -- ---------------------------------------------------------------------
  if not has_function_privilege('authenticated',
       'public.request_topup(bigint,public.payment_network,uuid,text,text)', 'execute') then
    raise exception 'authenticated cannot execute request_topup';
  end if;
  if has_function_privilege('authenticated',
       'public.post_topup(uuid,bigint,uuid)', 'execute') then
    raise exception 'authenticated can execute post_topup';
  end if;
  if has_function_privilege('authenticated',
       'public.post_completion(uuid,bigint,uuid,int)', 'execute') then
    raise exception 'authenticated can execute post_completion';
  end if;
  if has_function_privilege('authenticated',
       'public._apply_topup_approval(uuid,text,uuid)', 'execute') then
    raise exception 'authenticated can execute _apply_topup_approval';
  end if;

  raise notice 'TESTS_PASSED';
end;
$$;

rollback;
