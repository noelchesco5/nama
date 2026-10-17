-- nama - Phase 0 extensions
-- All Supabase Free tier. Keep extensions in the shared `extensions` schema.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

comment on extension pgcrypto is 'password hashing for local seed / test helpers';
comment on extension postgis is 'geography for specialist and booking locations (used from Phase 2)';
