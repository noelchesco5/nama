-- Phase 3: withdrawals, refund_cases, penalties, support, RLS, reconciliation/ops_events, basic helpers
alter table public.withdrawals enable row level security;
alter table public.refund_cases enable row level security;
alter table public.penalties enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

create policy withdrawals_self_or_hq on public.withdrawals for select to authenticated using (specialist_id=auth.uid() or public.authorize('hq'));
create policy withdrawals_hq_manage on public.withdrawals for update to authenticated using (public.authorize('hq')) with check (public.authorize('hq'));
create policy refund_cases_self_or_hq on public.refund_cases for select to authenticated using (client_id=auth.uid() or specialist_id=auth.uid() or public.authorize('hq'));
create policy refund_cases_hq_manage on public.refund_cases for update to authenticated using (public.authorize('hq')) with check (public.authorize('hq'));
create policy penalties_self_or_hq on public.penalties for select to authenticated using (specialist_id=auth.uid() or client_id=auth.uid() or public.authorize('hq'));
create policy support_tickets_self_or_hq on public.support_tickets for all to authenticated using (user_id=auth.uid() or public.authorize('hq')) with check (user_id=auth.uid() or public.authorize('hq'));
create policy ticket_messages_self_or_hq on public.ticket_messages for all to authenticated using (exists (select 1 from public.support_tickets t where t.id=ticket_id and (t.user_id=auth.uid() or public.authorize('hq')))) with check (exists (select 1 from public.support_tickets t where t.id=ticket_id and (t.user_id=auth.uid() or public.authorize('hq'))));

revoke all on public.withdrawals,public.refund_cases,public.penalties,public.support_tickets,public.ticket_messages from anon;
grant select,insert,update on public.withdrawals,public.refund_cases,public.penalties,public.support_tickets,public.ticket_messages to authenticated;

create table public.ops_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
alter table public.ops_events enable row level security;
create policy ops_events_hq on public.ops_events for select to authenticated using (public.authorize('hq'));
revoke all on public.ops_events from anon;
grant select on public.ops_events to authenticated;

create function public.reconciliation_total_owed()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(balance_tzs),0) from public.accounts where kind='specialist_earnings';
$$;

revoke execute on function public.reconciliation_total_owed() from public,anon;
grant execute on function public.reconciliation_total_owed() to authenticated;
