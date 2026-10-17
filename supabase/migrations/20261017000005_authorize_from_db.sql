-- nama - Phase 0 hardening: make authorize() DB-authoritative.
--
-- authorize() previously read the `user_role` claim written by the custom
-- access token hook. That couples every RLS policy to a GoTrue setting that on
-- hosted Supabase can only be toggled in the dashboard. The role must be
-- trustworthy, not client-supplied, and it already lives in public.user_roles.
--
-- This version reads the role from the database through a SECURITY DEFINER
-- function keyed on auth.uid(). The hook remains available as an optimisation
-- so the app can read the role from the JWT without a query, but RLS no longer
-- depends on it.
--
-- The client still never decides its role: user_roles is writable by no
-- authenticated user, only by trusted server paths.

create or replace function public.authorize(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()) = required,
    false
  );
$$;

revoke execute on function public.authorize(public.app_role) from public;
grant execute on function public.authorize(public.app_role) to anon, authenticated;
