-- nama - Phase 1 money-core test.
--
-- Runs inside one transaction and rolls back, so it leaves no data behind.
-- Exercises post_txn: balancing, idempotency, non-negative wallets, escrow
-- flow, platform fee, append-only ledger, and the deferred balance trigger.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/phase1_money.sql
-- Prints TESTS_PASSED on success; any assertion raises and aborts.

begin;

do $$
declare
  ca uuid := '55555555-5555-5555-5555-555555555555';  -- client
  sp uuid := '66666666-6666-6666-6666-666666666666';  -- specialist
  v_txn uuid;
  v_txn2 uuid;
  v bigint;
  v_n int;
  v_sum bigint;
  v_ids uuid[];
  v_ext uuid;
begin
  -- Fresh users (signup trigger creates profiles + client/specialist roles).
  delete from auth.users where id in (ca, sp);
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (ca,'authenticated','authenticated','money.client@test.local','x','2026-10-17','2026-10-17','{"full_name":"Money Client","intended_role":"client","locale":"en"}'),
         (sp,'authenticated','authenticated','money.spec@test.local','x','2026-10-17','2026-10-17','{"full_name":"Money Spec","intended_role":"specialist","locale":"en"}');

  -- ---------------------------------------------------------------------
  -- 1. Top-up: external funds a client wallet. External goes negative.
  -- ---------------------------------------------------------------------
  v_txn := public.post_txn(
    'topup_approved', 'p1-topup-1',
    jsonb_build_array(
      jsonb_build_object('kind','client_wallet','user_id',ca,'amount_tzs',50000),
      jsonb_build_object('kind','external','amount_tzs',-50000)
    )
  );
  if v_txn is null then raise exception 'topup returned no txn'; end if;

  select balance_tzs into v from public.accounts where kind='client_wallet' and user_id=ca;
  if v <> 50000 then raise exception 'client wallet expected 50000 got %', v; end if;

  select balance_tzs into v from public.accounts where kind='external' and user_id is null;
  if v <> -50000 then raise exception 'external expected -50000 got %', v; end if;

  -- ---------------------------------------------------------------------
  -- 2. Idempotency: same key returns same txn, no double credit.
  -- ---------------------------------------------------------------------
  v_txn2 := public.post_txn(
    'topup_approved', 'p1-topup-1',
    jsonb_build_array(
      jsonb_build_object('kind','client_wallet','user_id',ca,'amount_tzs',50000),
      jsonb_build_object('kind','external','amount_tzs',-50000)
    )
  );
  if v_txn2 <> v_txn then raise exception 'idempotency returned a different txn'; end if;

  select balance_tzs into v from public.accounts where kind='client_wallet' and user_id=ca;
  if v <> 50000 then raise exception 'idempotency double-credited (wallet=%)', v; end if;

  select count(*) into v_n from public.ledger_txns where idempotency_key='p1-topup-1';
  if v_n <> 1 then raise exception 'idempotency created % txns', v_n; end if;

  -- ---------------------------------------------------------------------
  -- 3. Unbalanced lines are rejected.
  -- ---------------------------------------------------------------------
  begin
    perform public.post_txn(
      'bad', 'p1-unbalanced',
      jsonb_build_array(
        jsonb_build_object('kind','client_wallet','user_id',ca,'amount_tzs',50000),
        jsonb_build_object('kind','external','amount_tzs',-40000)
      )
    );
    raise exception 'unbalanced txn was accepted';
  exception when others then
    if sqlerrm like '%unbalanced txn was accepted%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 4. Wallet may never go negative.
  -- ---------------------------------------------------------------------
  begin
    perform public.post_txn(
      'withdrawal', 'p1-overdraft',
      jsonb_build_array(
        jsonb_build_object('kind','client_wallet','user_id',ca,'amount_tzs',-60000),
        jsonb_build_object('kind','external','amount_tzs',60000)
      )
    );
    raise exception 'overdraft was accepted';
  exception when others then
    if sqlerrm like '%overdraft was accepted%' then raise; end if;
  end;

  select balance_tzs into v from public.accounts where kind='client_wallet' and user_id=ca;
  if v <> 50000 then raise exception 'overdraft changed wallet to %', v; end if;

  -- ---------------------------------------------------------------------
  -- 5. Booking hold: wallet -> escrow.
  -- ---------------------------------------------------------------------
  perform public.post_txn(
    'booking_hold', 'p1-hold-1',
    jsonb_build_array(
      jsonb_build_object('kind','client_wallet','user_id',ca,'amount_tzs',-50000),
      jsonb_build_object('kind','escrow','amount_tzs',50000)
    )
  );
  select balance_tzs into v from public.accounts where kind='client_wallet' and user_id=ca;
  if v <> 0 then raise exception 'wallet after hold expected 0 got %', v; end if;
  select balance_tzs into v from public.accounts where kind='escrow' and user_id is null;
  if v <> 50000 then raise exception 'escrow expected 50000 got %', v; end if;

  -- ---------------------------------------------------------------------
  -- 6. Completion: escrow -> platform fee (7%) + specialist earnings.
  -- ---------------------------------------------------------------------
  perform public.post_txn(
    'booking_completed', 'p1-done-1',
    jsonb_build_array(
      jsonb_build_object('kind','escrow','amount_tzs',-50000),
      jsonb_build_object('kind','platform_revenue','amount_tzs',3500),
      jsonb_build_object('kind','specialist_earnings','user_id',sp,'amount_tzs',46500)
    )
  );
  select balance_tzs into v from public.accounts where kind='escrow' and user_id is null;
  if v <> 0 then raise exception 'escrow after completion expected 0 got %', v; end if;
  select balance_tzs into v from public.accounts where kind='platform_revenue' and user_id is null;
  if v <> 3500 then raise exception 'platform revenue expected 3500 got %', v; end if;
  select balance_tzs into v from public.accounts where kind='specialist_earnings' and user_id=sp;
  if v <> 46500 then raise exception 'specialist earnings expected 46500 got %', v; end if;

  -- ---------------------------------------------------------------------
  -- 7. The whole ledger nets to zero.
  -- ---------------------------------------------------------------------
  select coalesce(sum(balance_tzs),0) into v_sum from public.accounts;
  if v_sum <> 0 then raise exception 'ledger does not net to zero (sum=%)', v_sum; end if;

  select count(*) into v_n
  from (
    select t.id
    from public.ledger_txns t
    join public.ledger_entries e on e.txn_id = t.id
    group by t.id
    having sum(e.amount_tzs) <> 0
  ) bad;
  if v_n <> 0 then raise exception '% unbalanced txns stored', v_n; end if;

  -- ---------------------------------------------------------------------
  -- 8. Ledger is append-only.
  -- ---------------------------------------------------------------------
  begin
    update public.ledger_txns set kind = 'tampered' where id = v_txn;
    raise exception 'ledger_txns update was allowed';
  exception when others then
    if sqlerrm like '%ledger_txns update was allowed%' then raise; end if;
  end;

  begin
    delete from public.ledger_entries where txn_id = v_txn;
    raise exception 'ledger_entries delete was allowed';
  exception when others then
    if sqlerrm like '%ledger_entries delete was allowed%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 9. The deferred balance trigger is a real backstop: a hand-written
  --    unbalanced txn is caught when constraints are forced immediate.
  -- ---------------------------------------------------------------------
  begin
    insert into public.ledger_txns (kind, idempotency_key)
    values ('sneaky', 'p1-sneaky') returning id into v_txn;
    select id into v_ext from public.accounts where kind='external' and user_id is null;
    insert into public.ledger_entries (txn_id, account_id, amount_tzs)
    values (v_txn, v_ext, 12345);
    set constraints public.ledger_txns_must_balance immediate;
    raise exception 'balance trigger did not fire';
  exception when others then
    if sqlerrm like '%balance trigger did not fire%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 10. Every posting wrote an audit row.
  -- ---------------------------------------------------------------------
  select count(*) into v_n from public.audit_log where entity='ledger_txn';
  if v_n <> 3 then raise exception 'expected 3 ledger audit rows got %', v_n; end if;

  raise notice 'TESTS_PASSED';
end;
$$;

rollback;
