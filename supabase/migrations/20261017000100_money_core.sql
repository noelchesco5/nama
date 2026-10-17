-- nama - Phase 1 money core (double-entry ledger).
--
-- Invariants (non-negotiable):
--   * Amounts are whole TZS as bigint. Never floats.
--   * Every money change is an append to ledger_txns + ledger_entries.
--     UPDATE/DELETE are rejected by trigger. Revoked privileges back that up.
--   * A transaction's entries always sum to zero (debits = credits), enforced
--     by a DEFERRED constraint trigger so multi-row postings stay consistent.
--   * Client wallets, specialist earnings and escrow never go negative.
--   * Every posting writes an audit_log row.
--
-- post_txn() is the single writer. It is SECURITY DEFINER (owned by the
-- migration role) and revoked from anon/authenticated; only trusted server
-- paths (HQ functions, cron) call it. Clients never post money directly.

-- ---------------------------------------------------------------------------
-- Settings (HQ-editable business values)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('fee_bps', '700'),
  ('partial_refund_max_pct', '75'),
  ('acceptance_window_minutes', '15')
on conflict (key) do nothing;

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ledger accounts
-- ---------------------------------------------------------------------------
create type public.account_kind as enum (
  'client_wallet',
  'specialist_earnings',
  'escrow',
  'platform_revenue',
  'refund_reserve',
  'penalty_income',
  'withdrawal_clearing',
  'external'
);

-- System accounts (escrow, platform_revenue, ...) have user_id null.
-- User accounts (client_wallet, specialist_earnings) have user_id set.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  kind public.account_kind not null,
  user_id uuid references auth.users (id) on delete cascade,
  currency text not null default 'TZS',
  balance_tzs bigint not null default 0,
  created_at timestamptz not null default now(),
  -- Wallets, earnings and escrow never go negative. `external` is the balancing
  -- account for money entering/leaving the system, so it may go negative.
  constraint accounts_balance_not_negative
    check (balance_tzs >= 0 or kind = 'external')
);

-- One account per (kind, owner). Owner is the user, or the null system slot.
create unique index accounts_owner_uniq
  on public.accounts (kind, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Balances are cached here but never negative for any account.
create table public.ledger_txns (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  idempotency_key text not null unique,
  actor_id uuid references auth.users (id),
  actor_role public.app_role,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index ledger_txns_created_at_idx on public.ledger_txns (created_at desc);
create index ledger_txns_kind_idx on public.ledger_txns (kind);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null references public.ledger_txns (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  amount_tzs bigint not null
);

create index ledger_entries_txn_idx on public.ledger_entries (txn_id);
create index ledger_entries_account_idx on public.ledger_entries (account_id, id);

-- Append-only. Money is never edited.
create function public.forbid_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger is append-only';
end;
$$;

create trigger ledger_txns_forbid_update
  before update on public.ledger_txns
  for each row execute function public.forbid_ledger_mutation();

create trigger ledger_txns_forbid_delete
  before delete on public.ledger_txns
  for each row execute function public.forbid_ledger_mutation();

create trigger ledger_entries_forbid_update
  before update on public.ledger_entries
  for each row execute function public.forbid_ledger_mutation();

create trigger ledger_entries_forbid_delete
  before delete on public.ledger_entries
  for each row execute function public.forbid_ledger_mutation();

-- DEFERRED: entries of a transaction must sum to zero.
create function public.assert_txn_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sum bigint;
begin
  select coalesce(sum(e.amount_tzs), 0)
  into v_sum
  from public.ledger_entries e
  where e.txn_id = new.id;

  if v_sum <> 0 then
    raise exception 'transaction % does not balance (sum %)', new.id, v_sum;
  end if;

  return null;
end;
$$;

create constraint trigger ledger_txns_must_balance
  after insert on public.ledger_txns
  deferrable initially deferred
  for each row execute function public.assert_txn_balanced();

-- ---------------------------------------------------------------------------
-- get_or_create_account: the canonical account for a (kind, owner) pair.
-- ---------------------------------------------------------------------------
create function public.get_or_create_account(
  p_kind public.account_kind,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.accounts (kind, user_id)
  values (p_kind, p_user_id)
  on conflict do nothing;

  select id into v_id
  from public.accounts
  where kind = p_kind and user_id is not distinct from p_user_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_txn: the single writer for all money movement.
--
--   p_lines: JSON array of { kind, user_id (nullable), amount_tzs (signed) }.
--            At least two lines; they must sum to zero.
--
-- Behaviour:
--   * Reusing p_idempotency_key returns the original txn and changes nothing.
--   * Accounts are locked in ascending id order, so concurrent postings on the
--     same wallets cannot deadlock.
--   * No account may end negative (wallet, earnings, escrow all stay >= 0).
--   * Appends ledger_txns + ledger_entries, updates cached balances, writes
--     audit_log. Never updates or deletes existing ledger rows.
--
-- SECURITY DEFINER, revoked from anon/authenticated: only trusted server paths
-- (HQ functions, cron) post money. Clients never call this directly.
-- ---------------------------------------------------------------------------
create function public.post_txn(
  p_kind text,
  p_idempotency_key text,
  p_lines jsonb,
  p_metadata jsonb default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_txn_id uuid;
  v_actor_role public.app_role;
  v_line jsonb;
  v_kind public.account_kind;
  v_user_id uuid;
  v_amount bigint;
  v_account_id uuid;
  v_ids uuid[] := '{}';
  v_deltas jsonb := '{}'::jsonb;
  v_id uuid;
  v_old bigint;
  v_new bigint;
  v_sum bigint := 0;
begin
  -- Idempotency: a reused key returns the original txn untouched.
  select id into v_existing
  from public.ledger_txns
  where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 2 then
    raise exception 'post_txn requires at least two lines';
  end if;

  -- Resolve accounts and accumulate per-account deltas.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_kind := (v_line->>'kind')::public.account_kind;
    v_user_id := nullif(v_line->>'user_id', '')::uuid;
    v_amount := (v_line->>'amount_tzs')::bigint;

    if v_amount is null then
      raise exception 'ledger line missing amount_tzs';
    end if;

    v_account_id := public.get_or_create_account(v_kind, v_user_id);

    v_ids := array_append(v_ids, v_account_id);
    v_deltas := jsonb_set(
      v_deltas,
      array[v_account_id::text],
      to_jsonb(coalesce((v_deltas->>v_account_id::text)::bigint, 0) + v_amount),
      true
    );
    v_sum := v_sum + v_amount;
  end loop;

  if v_sum <> 0 then
    raise exception 'entries do not balance (sum %)', v_sum;
  end if;

  -- Lock every touched account in deterministic order to avoid deadlocks.
  perform 1
  from public.accounts
  where id = any(v_ids)
  order by id
  for update;

  -- Validate resulting balances are non-negative before writing anything.
  for v_id in select distinct unnest(v_ids)
  loop
    select balance_tzs into v_old from public.accounts where id = v_id;
    v_new := v_old + (v_deltas->>v_id::text)::bigint;
    -- `external` is the balancing account and may go negative.
    if v_new < 0
       and (select kind from public.accounts where id = v_id) <> 'external' then
      raise exception 'insufficient balance on account % (would be %)', v_id, v_new;
    end if;
  end loop;

  -- Record the actor when the caller is a real end user.
  if p_actor_id is not null and p_actor_id = auth.uid() then
    v_actor_role := public.current_user_role();
  end if;

  insert into public.ledger_txns (kind, idempotency_key, actor_id, actor_role, metadata)
  values (p_kind, p_idempotency_key, p_actor_id, v_actor_role, p_metadata)
  returning id into v_txn_id;

  for v_id in select distinct unnest(v_ids)
  loop
    insert into public.ledger_entries (txn_id, account_id, amount_tzs)
    values (v_txn_id, v_id, (v_deltas->>v_id::text)::bigint);
  end loop;

  for v_id in select distinct unnest(v_ids)
  loop
    update public.accounts
    set balance_tzs = balance_tzs + (v_deltas->>v_id::text)::bigint
    where id = v_id;
  end loop;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, after)
  values (
    p_actor_id,
    v_actor_role,
    'create',
    'ledger_txn',
    v_txn_id::text,
    jsonb_build_object(
      'kind', p_kind,
      'idempotency_key', p_idempotency_key,
      'metadata', p_metadata
    )
  );

  return v_txn_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: the ledger is readable by nobody through the API. Money is read via
-- trusted functions that assert the caller's role. post_txn is not callable
-- by end users.
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.ledger_txns enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.platform_settings enable row level security;

-- No policies on accounts / ledger_txns / ledger_entries: default deny for
-- anon and authenticated. Only definer functions and service_role touch them.

-- Settings are readable by any signed-in user (fee display), writable by HQ.
create policy "settings readable by authenticated"
  on public.platform_settings for select
  to authenticated
  using (true);

create policy "settings writable by hq"
  on public.platform_settings for update
  to authenticated
  using (public.authorize('hq'))
  with check (public.authorize('hq'));

create policy "settings insertable by hq"
  on public.platform_settings for insert
  to authenticated
  with check (public.authorize('hq'));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.accounts from anon, authenticated;
revoke all on public.ledger_txns from anon, authenticated;
revoke all on public.ledger_entries from anon, authenticated;

revoke execute on function public.get_or_create_account(public.account_kind, uuid) from public, anon, authenticated;
revoke execute on function public.post_txn(text, text, jsonb, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.post_txn(text, text, jsonb, jsonb, uuid) to service_role;
