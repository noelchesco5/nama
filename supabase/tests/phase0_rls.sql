begin;
do $$
declare
  ca uuid := '11111111-1111-1111-1111-111111111111';
  cb uuid := '22222222-2222-2222-2222-222222222222';
  sa uuid := '33333333-3333-3333-3333-333333333333';
  hq uuid := '44444444-4444-4444-4444-444444444444';
  n int;
  r text;
begin
  delete from public.user_roles where user_id in (ca,cb,sa,hq);
  delete from public.profiles where id in (ca,cb,sa,hq);
  delete from public.specialist_profiles where user_id in (sa);
  delete from auth.users where id in (ca,cb,sa,hq);

  -- signup clients via trigger
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (ca,'authenticated','authenticated','a@test.local','x','2026-10-17','2026-10-17','{"full_name":"Alice","intended_role":"client","locale":"en"}'),
         (cb,'authenticated','authenticated','b@test.local','x','2026-10-17','2026-10-17','{"full_name":"Bob","intended_role":"client","locale":"sw"}');
  -- signup specialist via trigger
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at,raw_user_meta_data)
  values (sa,'authenticated','authenticated','s@test.local','x','2026-10-17','2026-10-17','{"full_name":"Spec","intended_role":"specialist","locale":"en"}');

  -- verify trigger created rows
  select count(*) into n from public.user_roles where user_id = ca;
  if n != 1 then raise exception 'trigger did not create role for client_a'; end if;
  select role into r from public.user_roles where user_id = sa;
  if r != 'specialist' then raise exception 'specialist role wrong'; end if;
  select count(*) into n from public.specialist_profiles where user_id = sa;
  if n != 1 then raise exception 'specialist_profiles not created for specialist'; end if;

  -- HQ user: no trigger (trusted script sets role directly)
  insert into auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  values (hq,'authenticated','authenticated','hq@test.local','x','2026-10-17','2026-10-17');
  -- upgrade the auto-created 'client' role to hq (trusted script path)
  update public.user_roles set role = 'hq' where user_id = hq;

  -- as client A, cannot see client B profile
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}', true);
  select count(*) into n from public.profiles where id = cb;
  if n != 0 then raise exception 'client sees others'; end if;

  -- as hq, can see everyone
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444"}', true);
  select count(*) into n from public.profiles where id in (ca,cb,sa,hq);
  if n != 4 then raise exception 'hq cannot see all'; end if;

  -- authenticated client cannot insert into user_roles
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    insert into public.user_roles (user_id, role) values (ca, 'hq');
    raise exception 'client inserted into user_roles (should be blocked by grants)';
  exception when insufficient_privilege then
    null;
  end;

  -- authenticated cannot update user_roles
  begin
    update public.user_roles set role = 'hq' where user_id = cb;
    raise exception 'client updated user_roles (should be blocked by grants)';
  exception when insufficient_privilege then
    null;
  end;

  -- audit_log: HQ can insert via audit() but nobody can update/delete it
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444"}', true);
  perform public.audit('test', 'profiles', ca::text, null, '{"ok":true}'::jsonb);
  select count(*) into n from public.audit_log where action = 'test';
  if n = 0 then raise exception 'audit() did not insert'; end if;

  -- HQ cannot update audit_log
  begin
    update public.audit_log set action = 'tamper' where action = 'test';
    raise exception 'audit_log was updatable';
  exception when insufficient_privilege then
    null;
  end;

  -- HQ cannot delete audit_log
  begin
    delete from public.audit_log where action = 'test';
    raise exception 'audit_log was deletable';
  exception when insufficient_privilege then
    null;
  end;

  -- authorize('hq') true only for a user whose DB role is hq
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444"}', true);
  if public.authorize('hq') is distinct from true then raise exception 'authorize hq failed for hq user'; end if;
  if public.is_hq() is distinct from true then raise exception 'is_hq failed for hq user'; end if;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}', true);
  if public.authorize('hq') is distinct from false then raise exception 'authorize hq succeeded for client user'; end if;
  if public.is_hq() is distinct from false then raise exception 'is_hq succeeded for client user'; end if;

  raise notice 'TESTS_PASSED';
end;
$$;
rollback;
