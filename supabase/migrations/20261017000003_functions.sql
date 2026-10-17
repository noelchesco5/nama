-- nama - Phase 0 functions, hook and triggers.
-- Every function sets an explicit search_path. All SECURITY DEFINER functions
-- are owned by the migration role (postgres) and are revoked from PUBLIC first.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger specialist_profiles_set_updated_at
  before update on public.specialist_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers. The role lives in user_roles; the JWT carries it as a claim.
-- ---------------------------------------------------------------------------
create function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

-- Reads the user_role claim written by the access token hook. Returns false
-- for anonymous callers and for a role that does not match.
create function public.authorize(required public.app_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role'
      = required::text,
    false
  )
  and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
      = 'authenticated',
    false
  );
$$;

create function public.is_hq()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.authorize('hq');
$$;

-- ---------------------------------------------------------------------------
-- Custom Access Token Auth Hook. Writes the user_role claim into every JWT.
-- ---------------------------------------------------------------------------
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_claims jsonb;
begin
  select role into v_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_claims := jsonb_set(
    v_claims,
    '{user_role}',
    to_jsonb(coalesce(v_role::text, 'client')),
    true
  );

  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Signup. A client can only ever become client or a pending specialist here.
-- The HQ role can never be set from signup metadata; only a trusted script.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intended text := coalesce(new.raw_user_meta_data ->> 'intended_role', 'client');
  v_role public.app_role;
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
begin
  v_role := case
    when v_intended = 'specialist' then 'specialist'::public.app_role
    else 'client'::public.app_role
  end;

  if v_locale not in ('en', 'sw') then
    v_locale := 'en';
  end if;

  insert into public.profiles (id, display_name, locale, phone)
  values (new.id, coalesce(v_name, split_part(coalesce(new.email, 'nama'), '@', 1)), v_locale, v_phone);

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  if v_role = 'specialist' then
    insert into public.specialist_profiles (user_id, status) values (new.id, 'pending');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Append-only audit log.
-- ---------------------------------------------------------------------------
create function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_forbid_update
  before update on public.audit_log
  for each row execute function public.forbid_mutation();

create trigger audit_log_forbid_delete
  before delete on public.audit_log
  for each row execute function public.forbid_mutation();

create function public.audit(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, before, after)
  values (auth.uid(), public.current_user_role(), p_action, p_entity, p_entity_id, p_before, p_after);
$$;

-- Clears the forced-password-change flag. Called only after the client has
-- actually changed the password through Supabase Auth.
create function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.audit(text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.mark_password_changed() from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant execute on function public.authorize(public.app_role) to anon, authenticated;
grant execute on function public.is_hq() to anon, authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.audit(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.mark_password_changed() to authenticated;

-- The Auth server invokes the hook as this role.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
