-- Phase 2: booking status gains 'expired' (acceptance window passed).
-- Must run in its own transaction: the new value cannot be used by any
-- statement in the same transaction that adds it (Postgres restriction).
alter type public.booking_status add value if not exists 'expired';
