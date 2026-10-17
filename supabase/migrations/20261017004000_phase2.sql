-- Phase 2: time_off, services seed, RLS, booking lifecycle helpers
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint time_off_nonoverlap check (ends_at > starts_at)
);

create index time_off_specialist_idx on public.time_off (specialist_id, starts_at);

insert into public.services (category, name_en, name_sw, description_en, description_sw) values
  ('nurse','Nursing care','Huduma ya uuguzi','Basic nursing and monitoring','Uuguzi wa msingi na ufuatiliaji'),
  ('caregiver','Caregiver','Mhudumu wa wagonjwa','Daily living support','Msaada wa shughuli za kila siku'),
  ('physiotherapy','Physiotherapy','Tiba ya mwili','Rehabilitation exercises','Mazoezi ya kurejesha afya'),
  ('nutrition','Nutrition','Lishe','Dietary guidance','Ushauri wa lishe'),
  ('laboratory','Laboratory','Maabara','Sample collection','Ukusanyaji wa sampuli'),
  ('chronic_care','Chronic care','Utunzaji wa muda mrefu','Long-term condition care','Utunzaji wa magonjwa sugu')
on conflict do nothing;

-- RLS for phase 2 tables
alter table public.services enable row level security;
alter table public.specialist_services enable row level security;
alter table public.availability_slots enable row level security;
alter table public.time_off enable row level security;
alter table public.saved_places enable row level security;
alter table public.bookings enable row level security;
alter table public.repeat_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;

create policy services_read_all on public.services for select to authenticated using (true);
create policy specialist_services_self on public.specialist_services for all to authenticated using (specialist_id=auth.uid()) with check (specialist_id=auth.uid());
create policy availability_self on public.availability_slots for all to authenticated using (specialist_id=auth.uid()) with check (specialist_id=auth.uid());
create policy time_off_self on public.time_off for all to authenticated using (specialist_id=auth.uid()) with check (specialist_id=auth.uid());
create policy saved_places_self on public.saved_places for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy bookings_self_or_hq on public.bookings for select to authenticated using (client_id=auth.uid() or specialist_id=auth.uid() or public.authorize('hq'));
create policy bookings_self_modify on public.bookings for update to authenticated using (client_id=auth.uid() or specialist_id=auth.uid() or public.authorize('hq')) with check (client_id=auth.uid() or specialist_id=auth.uid() or public.authorize('hq'));
create policy bookings_client_insert on public.bookings for insert to authenticated with check (client_id=auth.uid());
create policy messages_booking_participants on public.messages for all to authenticated using (exists (select 1 from public.bookings b where b.id=booking_id and (b.client_id=auth.uid() or b.specialist_id=auth.uid() or public.authorize('hq')))) with check (exists (select 1 from public.bookings b where b.id=booking_id and (b.client_id=auth.uid() or b.specialist_id=auth.uid() or public.authorize('hq'))));
create policy reviews_self on public.reviews for insert to authenticated with check (client_id=auth.uid());
create policy docs_owner on public.documents for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

revoke all on public.services,public.specialist_services,public.availability_slots,public.time_off,public.saved_places,public.bookings,public.repeat_requests,public.reviews,public.messages,public.documents from anon;
grant select on public.services to authenticated;
grant all on public.specialist_services,public.availability_slots,public.time_off,public.saved_places to authenticated;
grant select,insert,update on public.bookings,public.repeat_requests,public.reviews,public.messages,public.documents to authenticated;
