-- Phase 2: Ordering core schema

create type public.service_category as enum ('nurse','caregiver','physiotherapy','nutrition','laboratory','chronic_care');
create type public.booking_status as enum ('requested','accepted','declined','in_progress','completed','cancelled','disputed');
create type public.slot_type as enum ('availability','time_off');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category public.service_category not null,
  name_en text not null,
  name_sw text not null,
  description_en text,
  description_sw text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();

create table public.specialist_services (
  specialist_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price_tzs bigint not null check (price_tzs >= 0),
  primary key (specialist_id, service_id)
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references auth.users(id) on delete cascade,
  slot_type public.slot_type not null default 'availability',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_nonoverlap check (ends_at > starts_at)
);

create trigger availability_slots_set_updated_at before update on public.availability_slots for each row execute function public.set_updated_at();

create index availability_specialist_idx on public.availability_slots (specialist_id, starts_at);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  lat double precision not null,
  lng double precision not null,
  is_home boolean not null default false,
  is_work boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger saved_places_set_updated_at before update on public.saved_places for each row execute function public.set_updated_at();
