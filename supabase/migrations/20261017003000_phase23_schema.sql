-- Phase 2-3: bookings, repeat, reviews, messages, docs, withdrawals, refund_cases, penalties, support
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id),
  specialist_id uuid not null references auth.users(id),
  service_id uuid not null references public.services(id),
  price_tzs bigint not null check (price_tzs >= 0),
  status public.booking_status not null default 'requested',
  lat double precision,
  lng double precision,
  address_text text,
  starts_at timestamptz,
  ends_at timestamptz,
  hold_txn_id uuid references public.ledger_txns(id),
  completion_txn_id uuid references public.ledger_txns(id),
  refund_case_id uuid,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  disputed_at timestamptz,
  acceptance_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();
create index bookings_client_idx on public.bookings(client_id, created_at desc);
create index bookings_specialist_idx on public.bookings(specialist_id, created_at desc);

create table public.repeat_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  client_id uuid not null references auth.users(id),
  specialist_id uuid not null references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  client_id uuid not null references auth.users(id),
  specialist_id uuid not null references auth.users(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  sender_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  booking_id uuid references public.bookings(id),
  path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references auth.users(id),
  amount_tzs bigint not null check (amount_tzs > 0),
  status text not null default 'pending',
  paid_txn_id uuid references public.ledger_txns(id),
  paid_by uuid references auth.users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.refund_cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  client_id uuid not null references auth.users(id),
  specialist_id uuid not null references auth.users(id),
  requested_amount_tzs bigint not null,
  decided_amount_tzs bigint,
  status text not null default 'open',
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  specialist_id uuid references auth.users(id),
  client_id uuid references auth.users(id),
  amount_tzs bigint not null check (amount_tzs > 0),
  reason text,
  posted_txn_id uuid references public.ledger_txns(id),
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  subject text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger support_tickets_set_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
