-- nama - Phase 0 core schema
-- The client never decides roles. `user_roles` is the single source of truth
-- for a user's role (client / specialist / hq); `profiles` holds no role column
-- so the two can never drift. The JWT claim and every RLS policy read
-- user_roles through `public.current_user_role()` / `public.authorize()`.

create type public.app_role as enum ('client', 'specialist', 'hq');
create type public.specialist_status as enum ('pending', 'approved', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  locale text not null default 'en' check (locale in ('en', 'sw')),
  phone text,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now()
);

-- Specialist business record. Created as `pending` by the signup trigger.
-- Console access is a two-gate flow: HQ approves the profile, then the
-- specialist pays the HQ-set onboarding fee and HQ confirms it.
create table public.specialist_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status public.specialist_status not null default 'pending',
  bio text,
  affiliation text,
  registration_ref text,
  national_id_ref text,
  licence_document_path text,
  address_text text,
  price_tzs bigint check (price_tzs is null or price_tzs >= 0),
  unit_minutes integer check (unit_minutes is null or unit_minutes in (30, 60)),
  onboarding_fee_paid boolean not null default false,
  console_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only. Never updated, never deleted. Money and privilege changes are
-- recorded here from Phase 1 onwards.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id),
  actor_role public.app_role,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- Convenience read model for the app: profile plus role in one row, still
-- protected by the underlying tables' RLS via security_invoker.
create view public.profile_view
with (security_invoker = true) as
select
  p.id,
  p.display_name,
  p.locale,
  p.phone,
  p.must_change_password,
  p.created_at,
  p.updated_at,
  ur.role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id;
