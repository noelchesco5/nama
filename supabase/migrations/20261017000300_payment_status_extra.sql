-- nama - Phase 1: extra top-up states.
--
-- Enum values are added in their own migration: a value added by
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction, and
-- supabase db push runs each migration in one transaction.

alter type public.payment_status add value if not exists 'appealed';
alter type public.payment_status add value if not exists 'appeal_approved';
alter type public.payment_status add value if not exists 'appeal_rejected';
alter type public.payment_status add value if not exists 'cancelled';
