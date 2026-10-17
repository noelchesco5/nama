-- nama - Phase 2 booking lifecycle test.
--
-- Runs in one transaction and rolls back. Exercises request+hold, accept,
-- decline, acceptance expiry, cancellation tiers (>6h full / <6h case till HQ
-- decides), completion fee split, reviews, no-show penalty, repeats,
-- withdrawals, HQ refund resolution, audited HQ chat reads and the privilege
-- surface.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/phase2_bookings.sql

begin;

do $$
declare
  ca uuid := '11111111-2222-3333-4444-555555555001';  -- client
  ca2 uuid := '11111111-2222-3333-4444-555555555002'; -- other client
  sp uuid := '11111111-2222-3333-4444-555555555003';  -- specialist
  hq uuid := '11111111-2222-3333-4444-555555555004';  -- hq
  svc uuid;
  b1 uuid; bx uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; brp uuid;
  req uuid;
  rc uuid;
  w1 uuid; w2 uuid;
  rep uuid; rep2 uuid;
  v_n int;
  v_bal bigint;
  v_esc bigint;
  v_earn bigint;
  v_pen bigint;
  v_status text;
  v_flag boolean;
begin
  delete from auth.users where id in (ca, ca2, sp, hq);

  -- ---------------- Seed users -------------------------------------------------
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (ca,'authenticated','authenticated','b2.client@test.local','x','2026-10-17','2026-10-17',
          '{"full_name":"Booking Client","intended_role":"client","locale":"en"}'::jsonb);
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  values (ca2,'authenticated','authenticated','b2.client2@test.local','x','2026-10-17','2026-10-17');
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (sp,'authenticated','authenticated','b2.specialist@test.local','x','2026-10-17','2026-10-17',
          '{"full_name":"Booking Nurse","intended_role":"specialist","locale":"en"}'::jsonb);
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  values (hq,'authenticated','authenticated','b2.hq@test.local','x','2026-10-17','2026-10-17');
  update public.user_roles set role = 'hq' where user_id = hq;

  update public.specialist_profiles set status = 'approved' where user_id = sp;

  insert into public.services (category, name_en, name_sw)
  values ('nurse','Nursing care test','Uuguzi (jaribio)')
  returning id into svc;

  insert into public.specialist_services (specialist_id, service_id, price_tzs)
  values (sp, svc, 10000);

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);

  -- Seed the wallet the "approved" way: 10000.
  insert into public.payment_requests (user_id, amount_tzs, network, expires_at)
  values (ca, 10000, 'mpesa', now() + interval '1 hour')
  returning id into req;
  perform public._apply_topup_approval(req, 'test seed', null);
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 10000 then raise exception 'seed topup wallet expected 10000 got %', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- 1. Request: hold posted, specialist notified, wallet drained.         W=10000
  -- ---------------------------------------------------------------------
  select public.request_booking(sp, svc, 10000, now() + interval '2 hours',
                                -6.8, 39.3, 'Kariakoo, Dar es Salaam', 'Mama Josua')
  into b1;

  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 0 then raise exception 'wallet expected 0 after hold, got %', v_bal; end if;
  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 10000 then raise exception 'escrow expected 10000, got %', v_esc; end if;

  select count(*) into v_n from public.notifications where user_id=sp and kind='booking_requested';
  if v_n <> 1 then raise exception 'specialist not notified of request'; end if;

  select hold_txn_id is not null into v_flag from public.bookings where id = b1;
  if not v_flag then raise exception 'hold_txn_id not stored'; end if;

  -- Insufficient wallet: fails, nothing created.
  begin
    select public.request_booking(sp, svc, 50000, now() + interval '2 hours') into bx;
    raise exception 'insufficient-funds booking was allowed';
  exception when others then
    if sqlerrm like '%insufficient-funds booking was allowed%' then raise; end if;
  end;
  select count(*) into v_n from public.bookings where price_tzs = 50000;
  if v_n <> 0 then raise exception 'booking row created despite failed hold'; end if;

  -- A specialist cannot request; booking a random user fails.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  begin
    select public.request_booking(sp, svc, 10000, now() + interval '2 hours') into bx;
    raise exception 'specialist requested a booking';
  exception when others then
    if sqlerrm like '%specialist requested a booking%' then raise; end if;
  end;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);

  -- ---------------------------------------------------------------------
  -- 2. Accept + start + complete: 7% of 10000 = 700 fee, 9300 earnings.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.accept_booking(b1);

  select status into v_status from public.bookings where id = b1;
  if v_status <> 'accepted' then raise exception 'expected accepted, got %', v_status; end if;

  select count(*) into v_n from public.notifications where user_id=ca and kind='booking_accepted';
  if v_n <> 1 then raise exception 'client not notified of acceptance'; end if;

  perform public.start_booking(b1);
  select status into v_status from public.bookings where id = b1;
  if v_status <> 'in_progress' then raise exception 'expected in_progress, got %', v_status; end if;

  perform public.complete_booking(b1);

  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 0 then raise exception 'escrow expected 0 after completion, got %', v_esc; end if;
  select balance_tzs into v_bal from public.accounts where kind='platform_revenue';
  if v_bal <> 700 then raise exception 'platform revenue expected 700, got %', v_bal; end if;
  select balance_tzs into v_earn from public.accounts where kind='specialist_earnings' and user_id=sp;
  if v_earn <> 9300 then raise exception 'earnings expected 9300, got %', v_earn; end if;

  select completion_txn_id is not null into v_flag from public.bookings where id = b1;
  if not v_flag then raise exception 'completion not recorded on booking'; end if;

  begin
    perform public.complete_booking(b1);
    raise exception 'booking completed twice';
  exception when others then
    if sqlerrm like '%booking completed twice%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 3. Reviews: exactly once, after completion.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  perform public.submit_review(b1, 5, 'Very good care');

  begin
    perform public.submit_review(b1, 4, 'again');
    raise exception 'second review was allowed';
  exception when others then
    if sqlerrm like '%second review was allowed%' then raise; end if;
  end;

  -- Review before completion is refused. Needs a second booking + money.   W=0
  insert into public.payment_requests (user_id, amount_tzs, network, expires_at)
  values (ca, 30000, 'mpesa', now() + interval '1 hour') returning id into req;
  perform public._apply_topup_approval(req, 'test', null);                        -- W=30000

  select public.request_booking(sp, svc, 10000, now() + interval '3 hours') into bx; -- W=20000
  begin
    perform public.submit_review(bx, 3, 'early');
    raise exception 'review before completion was allowed';
  exception when others then
    if sqlerrm like '%review before completion was allowed%' then raise; end if;
  end;
  perform public.cancel_booking(bx, 'cleanup test');                              -- full refund W=30000

  -- ---------------------------------------------------------------------
  -- 4. Decline releases the hold.                                         W=30000
  -- ---------------------------------------------------------------------
  insert into public.payment_requests (user_id, amount_tzs, network, expires_at)
  values (ca, 10000, 'mpesa', now() + interval '1 hour') returning id into req;
  perform public._apply_topup_approval(req, 'test', null);                        -- W=40000

  select public.request_booking(sp, svc, 10000, now() + interval '20 hours') into b2; -- W=30000

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.decline_booking(b2);

  select status into v_status from public.bookings where id = b2;
  if v_status <> 'declined' then raise exception 'expected declined, got %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 40000 then raise exception 'wallet after decline expected 40000, got %', v_bal; end if;
  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 0 then raise exception 'escrow after decline expected 0, got %', v_esc; end if;

  -- ---------------------------------------------------------------------
  -- 5. Cancel >6h before start: full refund.                              W=40000
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_booking(sp, svc, 10000, now() + interval '20 hours') into b3;  -- W=30000
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.accept_booking(b3);

  -- A non-participant cannot cancel.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca2)::text, true);
  begin
    perform public.cancel_booking(b3, 'not mine');
    raise exception 'stranger cancelled a booking';
  exception when others then
    if sqlerrm like '%stranger cancelled a booking%' then raise; end if;
  end;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  perform public.cancel_booking(b3, 'change of plans');

  select status into v_status from public.bookings where id = b3;
  if v_status <> 'cancelled' then raise exception 'expected cancelled, got %', v_status; end if;
  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 0 then raise exception 'escrow after >6h cancel expected 0, got %', v_esc; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 40000 then raise exception 'wallet after >6h cancel expected 40000, got %', v_bal; end if;
  select refund_case_id is null into v_flag from public.bookings where id = b3;
  if not v_flag then raise exception '>6h cancel must not open a case'; end if;

  -- ---------------------------------------------------------------------
  -- 6. Cancel <6h: refund_case opened, escrow held until HQ decides.      W=40000
  -- ---------------------------------------------------------------------
  select public.request_booking(sp, svc, 10000, now() + interval '2 hours') into b4;   -- W=30000
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.accept_booking(b4);

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  perform public.cancel_booking(b4, 'urgent change');

  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 10000 then raise exception 'escrow after <6h cancel expected 10000 (held), got %', v_esc; end if;

  select id, requested_amount_tzs into rc, v_bal from public.refund_cases where booking_id = b4;
  if rc is null then raise exception 'no refund case opened'; end if;
  if v_bal <> 7500 then raise exception 'requested refund expected 7500 (75%%), got %', v_bal; end if;

  -- The client cannot resolve the case.
  begin
    perform public.resolve_refund_case(rc, 7500, 'self');
    raise exception 'client resolved refund case';
  exception when others then
    if sqlerrm like '%client resolved refund case%' then raise; end if;
  end;

  -- Out-of-range decisions are refused.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  begin
    perform public.resolve_refund_case(rc, 20000, 'too much');
    raise exception 'over-refund allowed';
  exception when others then
    if sqlerrm like '%over-refund allowed%' then raise; end if;
  end;

  perform public.resolve_refund_case(rc, 7500, 'partial refund confirmed');

  select decided_amount_tzs into v_bal from public.refund_cases where id = rc;
  if v_bal <> 7500 then raise exception 'decided amount not stored (%).', v_bal; end if;
  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 0 then raise exception 'escrow after resolution expected 0, got %', v_esc; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 37500 then raise exception 'wallet after refund case expected 37500, got %', v_bal; end if;
  select balance_tzs into v_earn from public.accounts where kind='specialist_earnings' and user_id=sp;
  if v_earn <> 11800 then raise exception 'earnings after refund case expected 11800, got %', v_earn; end if;

  -- ---------------------------------------------------------------------
  -- 7. No-show (after grace): client refunded price minus penalty.        W=37500
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_booking(sp, svc, 10000, now() + interval '2 hours') into b5;   -- W=27500
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.accept_booking(b5);

  -- Too early: grace not passed (start is in the future).
  begin
    perform public.mark_no_show(b5);
    raise exception 'no-show flagged before grace';
  exception when others then
    if sqlerrm like '%no-show flagged before grace%' then raise; end if;
  end;

  update public.bookings set starts_at = now() - interval '2 hours' where id = b5;
  perform public.mark_no_show(b5);

  select balance_tzs into v_esc from public.accounts where kind='escrow';
  if v_esc <> 0 then raise exception 'escrow after no-show expected 0, got %', v_esc; end if;
  select balance_tzs into v_pen from public.accounts where kind='penalty_income';
  if v_pen <> 1000 then raise exception 'penalty income expected 1000, got %', v_pen; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 36500 then raise exception 'wallet after no-show expected 36500, got %', v_bal; end if;

  -- ---------------------------------------------------------------------
  -- 8. Acceptance expiry releases the hold.                               W=36500
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_booking(sp, svc, 10000, now() + interval '5 hours') into b6;   -- W=26500
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 26500 then raise exception 'wallet after b6 hold expected 26500, got %', v_bal; end if;

  update public.bookings
  set acceptance_expires_at = now() - interval '1 minute'
  where id = b6;

  v_n := public.expire_booking_requests();
  if v_n < 1 then raise exception 'expire_booking_requests expired nothing'; end if;

  select status into v_status from public.bookings where id = b6;
  if v_status <> 'expired' then raise exception 'expected expired, got %', v_status; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 36500 then raise exception 'wallet after expiry expected 36500, got %', v_bal; end if;
  select count(*) into v_n from public.notifications
  where user_id=ca and kind='booking_expired' and data->>'booking_id' = b6::text;
  if v_n <> 1 then raise exception 'client not notified of expiry'; end if;

  -- ---------------------------------------------------------------------
  -- 9. Repeats: no hold until the specialist accepts.                     W=36500
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_repeat(b1, now() + interval '2 hours') into rep;

  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 36500 then raise exception 'repeat must not move money, wallet %', v_bal; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  select public.accept_repeat(rep) into brp;                                      -- hold, W=25500

  select count(*) into v_n from public.bookings
  where client_id = ca and status = 'accepted' and hold_txn_id is not null
    and for_name is not null;
  if v_n < 1 then raise exception 'repeat accept did not create a held booking'; end if;
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 26500 then raise exception 'wallet after repeat accept expected 26500, got %', v_bal; end if;

  -- Declined repeat: no money moves.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  select public.request_repeat(b1, now() + interval '2 hours') into rep2;
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  perform public.decline_repeat(rep2);
  select balance_tzs into v_bal from public.accounts where kind='client_wallet' and user_id=ca;
  if v_bal <> 26500 then raise exception 'declined repeat moved money (%).', v_bal; end if;
  -- release the test hold so later checks stay simple
  perform public.post_refund(ca, 10000, brp);

  -- ---------------------------------------------------------------------
  -- 10. Withdrawals: request, guards, HQ reject / pay.   earn = 9300+2500 = 11800
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  select public.request_withdrawal(2000) into w1;

  begin
    select public.request_withdrawal(20000) into w2;
    raise exception 'over-balance withdrawal allowed';
  exception when others then
    if sqlerrm like '%over-balance withdrawal allowed%' then raise; end if;
  end;

  begin
    perform public.hq_request_withdrawal(w1);
    raise exception 'specialist paid own withdrawal';
  exception when others then
    if sqlerrm like '%specialist paid own withdrawal%' then raise; end if;
  end;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.hq_reject_withdrawal(w1, 'wrong details');
  select status into v_status from public.withdrawals where id = w1;
  if v_status <> 'rejected' then raise exception 'expected rejected, got %', v_status; end if;
  select balance_tzs into v_earn from public.accounts where kind='specialist_earnings' and user_id=sp;
  if v_earn <> 11800 then raise exception 'earnings changed on rejected withdrawal (%).', v_earn; end if;

  -- back to the specialist for the real withdrawal request
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',sp)::text, true);
  select public.request_withdrawal(11800) into w2;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform public.hq_request_withdrawal(w2);

  select status into v_status from public.withdrawals where id = w2;
  if v_status <> 'paid' then raise exception 'expected paid, got %', v_status; end if;
  select balance_tzs into v_earn from public.accounts where kind='specialist_earnings' and user_id=sp;
  if v_earn <> 0 then raise exception 'earnings after pay expected 0, got %', v_earn; end if;

  begin
    perform public.hq_request_withdrawal(w2);
    raise exception 'withdrawal paid twice';
  exception when others then
    if sqlerrm like '%withdrawal paid twice%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 11. HQ chat reads are audited. (b1 is completed; chat stays readable.)
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',ca)::text, true);
  insert into public.messages (booking_id, sender_id, body)
  values (b1, ca, 'Thank you for the care');

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',hq)::text, true);
  perform count(*) from public.hq_read_chat(b1, current_date - 1, current_date + 1);

  select count(*) into v_n from public.audit_log
  where entity = 'booking' and entity_id = b1::text and action = 'read_chat';
  if v_n < 1 then raise exception 'HQ chat read not audited'; end if;

  -- ---------------------------------------------------------------------
  -- 12. Privilege surface.
  -- ---------------------------------------------------------------------
  if not has_function_privilege('authenticated', 'public.request_booking(uuid,uuid,bigint,timestamptz,double precision,double precision,text,text)', 'execute') then
    raise exception 'authenticated cannot request bookings';
  end if;
  -- HQ-only behavior is checked by calling the guards in sections 6 and 10
  -- (matching the Phase 1 convention: granted to authenticated, guarded
  -- internally by authorize('hq')); server-only functions stay ungranted.
  if has_function_privilege('authenticated', 'public.expire_booking_requests()', 'execute') then
    raise exception 'authenticated can execute expire_booking_requests';
  end if;

  -- Ledger is balanced: every txn created here sums to zero.
  select count(*) into v_n
  from (
    select t.id
    from public.ledger_txns t
    join public.ledger_entries e on e.txn_id = t.id
    group by t.id
    having sum(e.amount_tzs) <> 0
  ) unbalanced;
  if v_n <> 0 then raise exception 'unbalanced ledger txns found: %', v_n; end if;

  raise notice 'TESTS_PASSED';
end;
$$;

rollback;
