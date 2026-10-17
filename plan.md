# nama - Implementation Plan

Synthesized from `instructions/01-nama-project-overview-dossier.md`,
`instructions/02-nama-technical-documentation.md`,
`instructions/03-nama-ux-interface-specification.md`.
Status: ready to execute. Keys required: see `docs/keys-and-decisions.md`.

## Principles (non-negotiable)

1. The client never decides money, roles, or visibility. Enforced by RLS + `security definer` functions in Postgres.
2. Every money state change = append to `ledger_entries` + an `audit_log` row. No edits, no deletes.
3. Every free-tier limit has a fallback so a quota error degrades, not breaks.
4. `supabase/migrations` is the single source of truth for the schema; TS types are generated from it.
5. No emoji anywhere. EN + SW strings for every visible string.

## Repository layout

```
nama/
  apps/app/                 Expo app (web export, iOS PWA, Android APK)
    app/(marketing) (auth) (client) (specialist) hq
    components/  constants/  i18n/  lib/
  supabase/
    migrations/  functions/  seed.sql  tests/ (pgTAP)
  packages/shared/          zod schemas, money helpers, ranking logic
  .github/workflows/        ci, deploy-web, backup, keepalive, release-android
  docs/                     keys-and-decisions.md, later design/API notes
  convo.txt                 assistant running notes
  plan.md                   this file
```

- pnpm workspaces, conventional commits, PRs required, CI green, CODEOWNERS on `supabase/migrations` and money code.
- `.env.example` committed; real secrets only in GitHub/Supabase secret stores.
- Platform-split files (`X.native.tsx` / `X.web.tsx`) for every native-only package.

---

## Phase 0 - Foundations

**Build**
- Scaffold pnpm monorepo + Expo (current stable SDK) + Expo Router + TypeScript, TanStack Query, zod.
- Supabase project: `profiles`, `user_roles`, Custom Access Token hook writing `user_role` claim, `authorize()` helper.
- Auth: email/password only. Signup trigger creates client profile or pending specialist profile; clients can never set their own role. HQ seeded only by trusted script, password from secret, `must_change_password` enforced, MFA on.
- RLS enabled + default deny on every table; automated tests proving each role sees only its own data.
- Design tokens from UX spec: `#0B6B57` deep green, `#168C80` teal, `#F7FAF8` soft white, `#E8F3EF` mint, `#20312D` charcoal, `#D3E6DF` border; Manrope + DM Sans; 4dp spacing grid; 180–280ms motion.
- i18next EN/SW scaffold, device-language default, instant switch.
- `ci.yml`: install, typecheck, lint, unit tests, local Supabase + migrations + pgTAP, web export build.

**Exit criteria:** three roles can sign in and each sees only its own data, proven by automated tests.

## Phase 1 - Money core

**Build**
- Ledger tables `ledger_txns` / `ledger_entries` (whole TZS in `bigint`), deferred constraint trigger (debits = credits), triggers rejecting UPDATE/DELETE + revoked privileges.
- Single writer `post_txn(kind, idempotency_key, lines)`: ordered account locks, rejects negative client wallet, returns existing txn on reused key. Cached balance updated inside, checked nightly.
- Standard postings: top-up approved, booking hold, completion (price -> specialist earnings minus fee + platform revenue), full refund, partial refund ≤75%, no-show (refund + penalty), withdrawal paid.
- Top-up state machine: `pending_review, approved, rejected, expired, appealed, appeal_approved, appeal_rejected, cancelled`.
  - `create_payment_request(rail, amount, payer_phone)`: merchant snapshot, short reference code, `deadline_at = now + 10 min` on server clock.
  - `hq_approve_payment(id, reason_code)`: HQ claim + changed password, row lock, status guard, ledger key `topup:<id>`, audit row, notification. Approve twice = credit once.
  - pg_cron every minute: overdue -> `expired` + notifications (idempotent via status guard).
  - Appeal with screenshot; limits + rate limits on creation.
  - `payment-evidence` private bucket, path `<user_id>/<request_id>/<random>.jpg`, images only ≤5 MB, EXIF stripped on phone, signed URLs ~60s.
  - `hq_set_merchant(rail, number, instructions)` writes before/after to audit log.
- Notifications = rows from DB triggers; app subscribes to own rows.
- UI: client C2 Wallet, C2a–C2d Add money flow, C1 home pending strip; HQ H2 Payments queue (Realtime, oldest first, keyboard j/k/Enter/a/r), H3 Appeals, H4 Merchant numbers.

**Tests (mandatory)**
- Every txn balances; wallet never negative, including under concurrent holds.
- Approve twice credits once; expired request cannot be approved without reason code.
- Client cannot read another user's payments/evidence; non-HQ calling HQ function is refused.
- Merchant edits audited; audit rows immutable.

**Exit criteria:** test top-up goes request → approve → credit with audit row; overdue request expires on schedule.

## Phase 2 - Ordering

**Build**
- Tables: `services`, `specialist_services`, `specialist_profiles` (h3_r8 set server-side on save), `availability_slots`, `time_off`, `saved_places`, `bookings`, `repeat_requests`, `reviews`, `messages`, `documents`.
- Dispatch (`find_specialists` Edge Function, ORS key stays server-side):
  1. client location -> H3 res 8; 2. `gridDisk(k)` expansion (~10 candidates or city max k); 3. availability filter; 4. cheap score = distance × 1.4 detour ÷ assumed speed, top 8; 5. one ORS matrix call, cached by res9-cell pair + 15-min bucket; 6. fallback to step-4 estimate marked "estimate"; 7. rank by travel time + earliest slot + rating, weights in settings, new-specialist boost.
- Booking lifecycle: `requested, accepted, declined, in_progress, completed, cancelled, disputed`. Hold on request; acceptance window expiry releases hold. Repeat creates `repeat_request` with no hold until accept. >6h cancel = full refund; <6h = `refund_case` (max 75%) held until HQ decides. No-show grace period -> flag; arrival check-in stores point as evidence. Completion by client or auto after 24h unless disputed.
- MapLibre platform-split; tiles from configured provider (never hardcoded OSM), attribution + ORS credit always visible. Privacy: clients see professional address; specialists see exact client address only after accept; HQ exact positions only for active bookings, every view audited.
- Realtime chat (RLS-scoped, exists only across a non-cancelled booking), no attachments in v1.
- Saved-places prompt rules (first order; then res9-repeat rule; ≥14 days apart; stop after 2 dismissals).
- UI: C3 Order map, C4 specialist card/detail, C5 booking sheet (3 steps), C6 booking detail, C7/C8 chat, C9 History, C10 Documents, C14 Saved places; specialist S3 Requests, S4 Services, S5 Schedule.

**Exit criteria:** client completes a booking end to end with a seeded specialist.

## Phase 3 - Specialist business + HQ depth

**Build**
- Earnings accounts, withdrawals (manual HQ pay + record), `refund_cases`, `penalties`, `support_tickets` + `ticket_messages`.
- UI: S2 Overview, S6 Clients, S7 Earnings/withdrawals; H1 Overview KPIs, H5 Specialists approve/suspend, H6 Bookings & cases (refund slider ≤75%, penalty, notes, chat excerpts only after case opened + logged), H7 Tickets with canned replies, H8 Analytics H3 heat map (cells <5 hidden, caption "aggregates only") + gated live map, H9 Audit log + CSV export.
- Daily reconciliation figure: Σ wallet balances + specialist earnings owed = real money in merchant accounts. Show on HQ overview; red on any difference.
- `ops_events` telemetry: queue age, expiry rate, ORS quota, error rate, last backup.

**Exit criteria:** HQ resolves a cancellation, a no-show, and a ticket without database access.

## Phase 4 - Launch hardening

**Build**
- Marketing site per UX §4: sticky header, hero + three.js care-orbit (lazy, paused off-screen, static fallback for reduced motion/no WebGL), How it works, Services ×6, Trust, For specialists, Install (#install with platform detection: iOS steps / Android download only if release exists / desktop QR), FAQ, Footer with hidden 5-tap HQ entry (cosmetic; server role check is real protection).
- PWA: manifest, touch icons, iOS Share→Add to Home Screen instructions, honest note that iPhone asks user to confirm.
- APK in GitHub Actions: checkout → Node → Java 17 → SDK → `expo prebuild` → decode keystore secret → `gradlew assembleRelease` → tag `v1.0.0` triggers Release with `nama.apk`; stable `releases/latest/download/nama.apk`; `release.json` at deploy time so the site never shows a dead link.
- Cloudflare Pages from `deploy-web.yml` with PR previews; `_headers`: CSP, HSTS, frame, referrer; SPA fallback.
- `backup.yml` nightly encrypted pg_dump (14-day retention, monthly restore drill); `keepalive.yml` ping (Supabase Free pauses after 1 week idle); upgrade triggers: first real money, DB >400 MB, ORS >60% quota, any prod quota error.
- Security checklist: RLS default deny everywhere, service_role never in client, fixed `search_path` on definer functions, zod validation + rate limits, pinned actions, Dependabot, secret scanning, HQ MFA + named accounts, encrypted backups with tested restore, independent review before real money.
- Legal: stored-value + health-data advice before real money; emergency numbers verified by HQ; safety line always visible.

**Exit criteria:** daily reconciliation shows zero difference for two weeks.

---

## Answers received (details in docs/keys-and-decisions.md)

| # | Question | Answer |
|---|----------|--------|
| 1 | Platform fee: % or fixed? | 7% per transaction, HQ-changeable |
| 2 | Refund defaults (>6h full / <6h ≤75%) | Confirmed; <1h ≤50% |
| 3 | Timer pause outside HQ hours? | No pause; payments auto-verified (keep manual switch) |
| 4 | Acceptance window + hold expiry | 15 min; hold released on expiry; reroute asks first |
| 5 | Exact vs approximate address | Approximate pre-booking, exact on confirmation |
| 6 | Named HQ accounts from day one? | Yes; seeded HQ creates sub-HQ with per-feature checkboxes (all) |
| 7 | Wellbeing check-in in v1? | Yes |
| 8 | Seed sample specialists or empty map? | Empty until real approvals |
| 9 | Book for a family member? | Yes |
| 10 | Specialist onboarding docs | NIDA + licence number + licence photo for all |
| 11 | Chat scope | RLS-scoped; HQ reads only on a report, audited |
| 12 | Onboarding fee | One time |
| 13 | SMS/OTP | Textify Africa |
