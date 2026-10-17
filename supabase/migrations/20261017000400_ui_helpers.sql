-- nama - Phase 1 UI helpers (read-only, caller-scoped)
--
-- Accounts/ledger are default-deny. These helpers return only the current
-- user's balances and keep money reads safely behind SECURITY DEFINER.

create function public.get_wallet_balance()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select balance_tzs
     from public.accounts
     where kind = 'client_wallet' and user_id = auth.uid()),
    0
  );
$$;

create function public.get_earnings_balance()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select balance_tzs
     from public.accounts
     where kind = 'specialist_earnings' and user_id = auth.uid()),
    0
  );
$$;

revoke execute on function public.get_wallet_balance() from public, anon;
revoke execute on function public.get_earnings_balance() from public, anon;
grant execute on function public.get_wallet_balance() to authenticated;
grant execute on function public.get_earnings_balance() to authenticated;
