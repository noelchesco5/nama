# nama - Issues Encountered and Lessons Learned

Running log. Newest first. Each entry: what happened, root cause, what we did,
what to do next time. Secrets are never written here.

---

## I-001 - Local Supabase stack cannot run in this sandbox (container-to-container traffic blocked)

**Phase:** 0
**Symptom:** `supabase start` fails: "Starting database... / Initialising
schema... / Stopping containers... error running container: exit 1". The real
error is the realtime migration container:
`(DBConnection.ConnectionError) [Elixir.Realtime.Repo] connection not available
and request was dropped from queue after 14985ms`. The CLI then prunes the
containers/volumes/network.

**Diagnosis:**
- Host -> container works (`172.18.0.2:5432` open from the host; published
  `54322` open). Internet egress from containers works.
- Container -> container on the default `docker0` bridge works.
- Container -> container on ANY user-defined Docker bridge fails 100%, even
  though ARP resolves and the gateway (`172.19.0.1`) replies.
- Per-bridge `/sys/class/net/<br>/nf_call_iptables = 0` (global is 1), so
  bridged frames should bypass netfilter. `table ip raw PREROUTING` contains
  auto-added per-container drop rules (`ip daddr <ctr-ip> iifname != "<br>"
  drop`) but their counters stay 0.
- Flushing Docker's `ip filter DOCKER` chain did not help (Docker re-adds it on
  container start). `DOCKER-USER` accept for the subnet did not help.

**Conclusion:** something in the sandbox drops east-west traffic on user-defined
bridges at/near the bridge. Not fixable from inside without host privileges we
do not control.

**Workaround chosen:** do not run Supabase locally. Use the **hosted** Supabase
project for migrations, RLS tests and auth. This also matches the deployment
target (free tier, single project).

**Lesson:** validate the platform's networking assumptions before committing to
a local-first workflow. When the hosted service is reachable, prefer it over a
local Docker stack the sandbox cannot support.

---

## I-002 - `pnpm exec supabase db push --db-url` silently ignored the URL

**Phase:** 0
**Symptom:** `pnpm exec supabase db push --db-url "<url>"` printed
`failed to connect to postgres: ... host=/tmp user=codespace database=codespace`
i.e. it tried the local unix socket, ignoring `--db-url`.

**Fix:** invoke the CLI binary directly:
`./node_modules/.bin/supabase db push --db-url "<url>" --include-all --yes`.
That applied all four migrations successfully.

**Lesson:** for the Supabase CLI, call the binary in `node_modules/.bin`
directly rather than through `pnpm exec`; `pnpm exec` appears to swallow the
flags in this setup.

---

## I-003 - Supabase direct database host is IPv6-only

**Phase:** 0
**Symptom:** `db.<ref>.supabase.co:5432` resolves only to an IPv6 address;
connecting gives `Network is unreachable` (this environment has no IPv6 route).

**Fix:** connect through the IPv4 connection pooler. Region was found by
probing `aws-0-<region>.pooler.supabase.com` with the tenant username
`postgres.<ref>` until one resolved the tenant:
`aws-0-ap-south-1.pooler.supabase.com:5432` (session mode).

**Lesson:** always keep a `DATABASE_URL` that goes through the pooler for CI and
scripts; do not rely on the direct host in IPv4-only environments.

---

## I-004 - The provided "PAT" is not a Management API token

**Phase:** 0
**Symptom:** `curl -H "Authorization: Bearer sb_secret_..."` to
`api.supabase.com/v1/projects` returns `401 {"message":"JWT could not be
decoded"}`.

**Cause:** `sb_secret_...` is a new-format Supabase **API key**, not a personal
access token (`sbp_...`). Management API, `supabase link`, and
`supabase projects api-keys` all require an `sbp_` token.

**Impact:** cannot read/write project settings (anon key, auth hook enable,
custom roles) over the Management API.

**Need:** a Management API token (`sbp_...`) if we want fully scripted project
setup. Otherwise those are one-click dashboard actions.

---

## I-005 - The anon (publishable) key is not derivable from SQL

**Phase:** 0
**Symptom:** we have the URL, DB password and service_role JWT, but not the anon
key. It cannot be read from the database: `vault.secrets` is empty and the JWT
secret (`app.settings.jwt_secret`) is not exposed. The anon key is a JWT signed
with the project JWT secret, which we cannot recover from the service_role JWT.

**Impact:** the app and a true end-to-end smoke test need the anon/publishable
key.

**Need:** copy the publishable/anon key from the dashboard into
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (and `SUPABASE_ANON_KEY`).

---

## I-006 - Custom Access Token hook must be enabled in the dashboard

**Phase:** 0
**Symptom:** after a successful sign-in the JWT has `role: authenticated` but no
`user_role` claim, so `public.authorize('hq')` is false and HQ cannot see all
profiles.

**Cause:** on hosted Supabase the hook is a GoTrue configuration, not a database
setting. Enabling it needs the dashboard (or the Management API, see I-004).

**Status:** the hook function itself is correct - calling
`public.custom_access_token_hook(...)` directly returns
`{"role":"authenticated","user_role":"hq", ...}`.

**Action required:** Authentication > Hooks > Custom Access Token ->
`pg-functions://postgres/public/custom_access_token_hook`.

**Note:** per-user isolation already works without the hook because those
policies use `id = auth.uid()`, which comes from the JWT `sub`.

---

## I-007 - Signup trigger always creates a `client` role first

**Phase:** 0
**Symptom:** seeding HQ by inserting `user_roles (user_id, 'hq')` failed with
`duplicate key value violates unique constraint "user_roles_pkey"`.

**Cause:** the `on_auth_user_created` trigger fires for every new
`auth.users` row and inserts a `client` role (and a profile, and a
`specialist_profiles` row when `intended_role = 'specialist'`). A later explicit
insert collides.

**Fix in code:** the trusted seed path must **update** the existing row, not
insert: `update public.user_roles set role = 'hq' where user_id = $1`. Same for
setting `must_change_password` on the already-created profile.

**Lesson:** treat the trigger output as the base row and mutate it. The trigger
intentionally never accepts `hq`.

---

## I-008 - RLS extension schema and grants on hosted vs local

**Phase:** 0
**Note:** hosted already had `pgcrypto` and `uuid-ossp` in the `extensions`
schema; `postgis` and `pgtap` are available. Migrations use
`create extension if not exists ... with schema extensions`, which is safe.
`pgTAP` is available on hosted, but the Phase 0 checks were written as plain
SQL assertions (PL/pgSQL `raise exception`) so they run anywhere without the
test harness.

---

## Verification log (Phase 0)

- `packages/shared`: 14 tests pass, `tsc --noEmit` clean, `oxlint` clean.
- Hosted migrations: all four applied (`supabase_migrations` has 4 rows).
- SQL security tests (`supabase/tests/phase0_rls.sql`): PASS - trigger creates
  client profile + role; specialist gets `specialist_profiles`; client A cannot
  read client B; HQ sees all; authenticated cannot write `user_roles`;
  `audit_log` update/delete rejected; `authorize('hq')` true only with the hq
  claim.
- HQ seeded: `nama@nama.com`, role `hq`, `must_change_password = true`.
- `scripts/smoke-auth.mjs`: users sign in; each non-HQ user sees only its own
  profile through PostgREST. HQ check pending the hook (I-006).

---

## I-009 - `disableHierarchicalLookup` broke `@expo/metro-runtime` resolution

**Phase:** 0 (app scaffold)
**Symptom:** `expo export --platform web` failed: `Unable to resolve module
@expo/metro-runtime from ... @expo/router-server ...` during static rendering.

**Cause:** `metro.config.js` set `resolver.disableHierarchicalLookup = true`
(Expo's monorepo recommendation). Under pnpm's virtual store, the static-render
server (`@expo/router-server`) cannot resolve its peer `@expo/metro-runtime`
without hierarchical lookup.

**Fix:** removed `disableHierarchicalLookup`. Kept `watchFolders` +
`nodeModulesPaths` for the monorepo. Export then resolved the module.

---

## I-010 - `@nama/shared` used `.js` import specifiers; Metro cannot resolve them

**Phase:** 0 (app scaffold)
**Symptom:** `Unable to resolve module ./constants.js from packages/shared/src/index.ts`.

**Cause:** the shared package used ESM-style `./x.js` specifiers. TS with
`moduleResolution: Bundler` and Vitest resolve `.js` -> `.ts`, but Metro does
not.

**Fix:** switched shared imports to extensionless (`./constants`). Shared
typecheck (tsc) and all 14 tests still pass.

---

## I-011 - Supabase client touches `window` during Expo static render (SSR)

**Phase:** 0 (app scaffold)
**Symptom:** `ReferenceError: window is not defined` at "get storage" while
`expo export --platform web` prerendered routes in Node. GoTrue's constructor
reads session storage immediately.

**Fix:** in `lib/supabase.ts`, detect `typeof window === 'undefined'` (server)
and use a no-op storage adapter with `persistSession`/`autoRefreshToken`/`detectSessionInUrl`
disabled during SSR. Web export then succeeded (12 static routes).

**Lesson:** any module that touches browser APIs at import time will break a
static web export; guard with a server check.

---

## I-012 - `authorize()` decoupled from the custom access-token hook

**Phase:** 0
**Symptom:** without the dashboard hook, the JWT has no `user_role` claim, so
claim-based `authorize('hq')` is always false and HQ cannot see all profiles.

**Change:** migration `20261017000005_authorize_from_db.sql` rewrites
`authorize(required)` to read `public.user_roles` for `auth.uid()` via a
`SECURITY DEFINER` function instead of trusting a JWT claim. RLS is now
DB-authoritative and works with no hook. The hook function is still deployed so
the app can read the role from the JWT later as an optimisation.

**Why it is safe:** `user_roles` is writable by no authenticated user (grants
revoked; policies deny), so the role is server-controlled, not client-supplied.

---

## Verification log update (Phase 0, after app scaffold)

- `apps/app` (Expo 58 + Expo Router + TanStack Query + zod + i18next EN/SW):
  `tsc --noEmit` clean, `oxlint` clean.
- `expo export --platform web`: 12 static routes exported successfully.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: all green across the workspace.
- `.github/workflows/ci.yml` added: checks (install/typecheck/lint/test),
  web export, and local-Supabase RLS test job.
- After the `authorize()` change, `scripts/smoke-auth.mjs` reports `SMOKE_PASSED`
  including "hq sees all profiles", with no hook enabled.

---

## Verification log update (Phase 0 complete, real keys)

- Anon key provided and verified: REST accepts it; RLS correctly denies anon on
  `profiles` (HTTP 401 / Postgres 42501), confirming the key and the default-deny
  policy.
- HQ password set to `namabyodyssey` (rotated via `scripts/seed-hq.mjs`).
- `pnpm run smoke:auth` with the **real** anon key: `SMOKE_PASSED` - client_a,
  client_b, specialist see only their own profile; HQ sees all.
- `apps/app/.env` carries the client-safe env where Expo reads it.
- `expo export --platform web` with real Supabase config: 12 static routes.
- DB clean: only the HQ user remains (test users deleted by the smoke script).

**Phase 0 exit criteria met.** Remaining Phase 0 items are now only the
optional dashboard hook (for JWT role caching) and moving to Phase 1.

---

## Phase 1 - Money core: issues and lessons

### I-013 - A closed double-entry ledger needs a negative-capable account
Requiring every account `balance_tzs >= 0` is impossible once money enters or
leaves the system, because every transaction must sum to zero. A top-up credits
the client wallet and must debit something; without an `external` balancing
account the sum never balances.
- Fix: added `account_kind = 'external'`, the only account allowed to go
  negative, used for money crossing the system boundary (top-ups in via
  `-amount`, withdrawals out via `+amount`). The check constraint is
  `balance_tzs >= 0 or kind = 'external'`.
- Lesson: model the boundary explicitly on day one; never bend the
  balance invariant per-account ad hoc.

### I-014 - `ALTER TYPE ... ADD VALUE` cannot be used in the same migration
Adding `external` to the enum would fail if referenced in the same migration
transaction. Because this was fresh, work-in-progress schema with no data, the
cleanest fix was to correct migration `00100` and re-apply it (dropped the
objects, removed the `supabase_migrations` row, re-pushed) rather than pile on a
patch migration.

### I-015 - Keep `authorize()` checks out of paths the system itself calls
`request_topup` auto-verify originally called `approve_topup`, which asserts
`authorize('hq')` - but the caller is the client, so auto-verify could never
work. Fix: split the state transition into `_apply_topup_approval` (no auth,
not client-callable) and keep `approve_topup` as the HQ-guarded wrapper.

### I-016 - Privilege tests belong in the catalogue, not in role switching
Testing "a client cannot call `post_txn`" is done with
`has_function_privilege('authenticated', ...)` checks instead of switching DB
roles mid-test, which is simpler and asserts the actual grants.

## Verification log update (Phase 1 money core)

- `supabase/migrations/20261017000100_money_core.sql` - accounts, ledger,
  append-only triggers, deferred `debits = credits` constraint, `post_txn`
  (idempotent, ordered locks, rejects negative wallets), audit on every posting.
- `supabase/migrations/20261017000200_money_flows.sql` - merchant numbers,
  top-up requests, notifications, standard postings (`post_topup`, `post_hold`,
  `post_completion` with 7% fee, `post_refund`), `request_topup` / `approve_topup`
  / `reject_topup` / `expire_topups`, RLS, and a pg_cron job every 5 minutes
  (`nama_expire_topups`).
- `supabase/tests/phase1_money.sql` - **TESTS_PASSED**: balancing, idempotency,
  overdraft rejection, escrow hold -> completion fee split, ledger nets to zero,
  append-only, deferred balance backstop, audit rows.
- `supabase/tests/phase1_topup.sql` - **TESTS_PASSED**: pending -> approve ->
  credit once, non-HQ refused, reject (no ledger), cron expiry, auto-verify,
  privilege surface.
- `supabase/tests/phase0_rls.sql` - re-run, still **TESTS_PASSED**.
- Workspace `pnpm typecheck && pnpm lint && pnpm test` green (14 unit tests).
- pg_cron confirmed scheduled on the hosted project (`cron.job` has
  `nama_expire_topups`).

### Phase 1 still open
- Partial-refund (≤75%) and no-show postings (rules for no-show penalty TBD).
- Top-up appeals, cancellation, reason codes, rate limits.
- `payment-evidence` private storage bucket + signed URLs.
- HQ merchant management function with before/after audit.
- Phase 1 UI (client wallet + add-money, HQ payments queue).
