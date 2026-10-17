-- nama - Phase 0 row level security.
-- Default deny on every table. Access is explicit and minimal. The client
-- never decides visibility: policies call public.authorize() which reads the
-- signed user_role claim.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.specialist_profiles enable row level security;
alter table public.audit_log enable row level security;

-- Start from zero and grant back only what each role needs.
revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
revoke all on public.specialist_profiles from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: you see and edit your own; HQ sees and edits everyone.
-- Column-level update grant stops a user touching must_change_password.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.authorize('hq'));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.authorize('hq'))
  with check (id = auth.uid() or public.authorize('hq'));

grant select on public.profiles to authenticated;
grant update (display_name, locale, phone) on public.profiles to authenticated;

grant select on public.profile_view to authenticated;

-- ---------------------------------------------------------------------------
-- user_roles: readable by the owner and HQ, writable by no client at all.
-- Role changes happen through a trusted script or a future HQ function.
-- ---------------------------------------------------------------------------
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.authorize('hq'));

grant select on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- specialist_profiles: the owner and HQ read it. A specialist may edit only
-- the allowed profile columns; status, console_unlocked and
-- onboarding_fee_paid are HQ-controlled.
-- ---------------------------------------------------------------------------
create policy specialist_profiles_select on public.specialist_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.authorize('hq'));

create policy specialist_profiles_update on public.specialist_profiles
  for update to authenticated
  using (user_id = auth.uid() or public.authorize('hq'))
  with check (user_id = auth.uid() or public.authorize('hq'));

grant select on public.specialist_profiles to authenticated;
grant update (bio, affiliation, registration_ref, national_id_ref, licence_document_path, address_text, price_tzs, unit_minutes)
  on public.specialist_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- audit_log: HQ reads it. Nobody updates or deletes it, ever.
-- ---------------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.authorize('hq'));

grant select on public.audit_log to authenticated;

revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke delete on public.profiles from anon, authenticated;
revoke delete on public.specialist_profiles from anon, authenticated;
