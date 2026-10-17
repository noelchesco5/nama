# nama - Keys, Secrets and Decisions Needed

Created from the three instruction docs. Provide items marked **REQUIRED** before
the phase noted; everything else can arrive later. Never commit real secrets —
they live in GitHub Actions secrets, Supabase secret store, or local `.env`
(gitignored, `.env.example` committed instead).

## 1. Keys and secrets

| # | Item | Used for | Needed by |
|---|------|----------|-----------|
| 1 | Supabase project URL + **anon key** | App talks to Supabase | Phase 0 |
| 2 | Supabase **service_role key** (REQUIRED) | Edge functions + CI only; must never reach the client bundle | Phase 1 |
| 3 | Supabase database password (REQUIRED) | Migrations, `pg_dump` backups | Phase 0 |
| 4 | Supabase personal access token (REQUIRED) | Supabase CLI + CI migrations | Phase 0 |
| 5 | OpenRouteService API key (REQUIRED) | `find_specialists` Edge Function (ETA matrix) | Phase 2 |
| 6 | Map tile provider key — MapTiler or similar free OSM tier (REQUIRED) OR Cloudflare R2 credentials for self-hosted PMTiles | MapLibre tiles on web + native; OSM public tile server forbids heavy app use | Phase 2 |
| 7 | Cloudflare API token + account ID (REQUIRED) | Pages deploys from GitHub Actions | Phase 4 |
| 8 | Android release keystore + keystore password, key alias, key password (REQUIRED) | Signing `nama.apk`; updates impossible without the same key. Back up offline in two places | Phase 4 |
| 9 | PGP public key for backup encryption (REQUIRED) | Nightly `pg_dump` encryption | Phase 4 |
| 10 | Transactional email API key — Resend / SendGrid / Mailgun (REQUIRED) | Supabase verification + password-reset emails (built-in sender too limited) | Phase 0 sign-ups |
| 11 | Error tracker DSN (Sentry or other free tier) | App + edge error reporting (free Supabase logs kept 1 day) | Optional Ph 0, needed Ph 4 |
| 12 | HQ seed initial password (REQUIRED, as a secret) | Seeding first HQ account; hashed at rest, `must_change_password` forced | Phase 0 |

### Status (Phase 0)

- **anon key: PROVIDED.** Legacy key is in `.env` / `apps/app/.env`
  (`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`). Verified accepted by
  the REST API (RLS correctly denies anon on `profiles`).
- HQ seed password set to `namabyodyssey` (in `.env`, gitignored).
- Direct Postgres host is IPv6-only; use the IPv4 **pooler**
  (`aws-0-ap-south-1.pooler.supabase.com`) for `DATABASE_URL`.
- The provided `sb_secret_...` is a new-format **API key**, not a Management
  PAT (`sbp_...`). With no Management PAT, dashboard toggles must be done in the
  UI.
- The custom access-token hook is **optional**: `authorize()` reads the role
  from `user_roles` (SECURITY DEFINER) so RLS works without it. Enabling it only
  lets the app read its role from the JWT.

### Decisions answered (Phase 0 intake)

| # | Question | Decision |
|---|----------|----------|
| 1 | Platform fee | **7%** per transaction (HQ-changeable) |
| 2 | Refund defaults | >6 h = full; <6 h = up to 75%; <1 h = up to 50% (HQ may alter) |
| 3 | Top-up timer | **No** pause. Payments **auto-verified** (no HQ gate), but keep ledger + audit and a manual/auto switch design |
| 4 | Acceptance window | 15 min; hold released on expiry; reroute asks client first |
| 5 | Address privacy | **Approximate** during scout/map, **exact** on confirmation screen |
| 6 | HQ accounts | Named; seeded HQ can create sub-HQ with per-feature checkboxes (all required, auto-templated groups: finance, support, security) |
| 7 | Wellbeing check-in | Keep in v1 |
| 8 | Sample specialists | None; map empty until real approvals |
| 9 | Family booking | Allowed (ordered for a child/other person); display naming TBD |
| 10 | Withdrawals | Manual HQ pay + record (Phase 3) |
| 11 | Specialist onboarding | **NIDA + licence number + licence photo/doc** for **all** specialist types |
| 12 | Chat | **(a)** RLS-scoped chat; HQ reads only on a report, in a chosen range, every access audited |
| 13 | Onboarding fee | **One time** |
| 14 | SMS / OTP | Yes, OTP via SMS using **Textify Africa** (`TEXTIFY_API_KEY`) |
| — | Later | Automatic payment confirmation via **PayMe/PayMaya** API may be provided (like Textify)

### Config data (not keys, but required)

- M-Pesa and Airtel Money merchant numbers: account type, registered-to name, exact client-facing instructions in EN + SW.
- HQ review hours (payment screen + timer behaviour).
- Launch city (Dar es Salaam assumed) and pilot specialist count.
- Emergency phone numbers for the permanent safety line (verified by HQ before launch).
- Platform fee value once decided (see §2).

## 2. Business decisions still open

| # | Question | Blocks |
|---|----------|--------|
| 1 | Platform fee: percentage per booking or fixed? (REQUIRED before Phase 1 completion postings) | Ledger completion split |
| 2 | Confirm refund defaults: >6 h before start = full refund; <6 h = HQ may refund up to 75%, remainder to specialist? | Ledger + booking cancel copy |
| 3 | Does the 10-minute review timer pause outside HQ hours, or run continuously? | Top-up state machine + UX copy |
| 4 | Specialist acceptance window (e.g. 15 min) and does the hold release when it expires? | Booking lifecycle |
| 5 | Exact professional address shown pre-booking, or approximate area only? | Map privacy rules |
| 6 | Named HQ accounts from day one (recommended) or one shared login? | Phase 0 auth |
| 7 | Keep the wellbeing check-in in v1? (stores sensitive self-reported data) | Client Home screen |
| 8 | Seed sample specialists for the pilot, or leave the map empty until real approvals? | Phase 2 / pilot |
| 9 | May clients book for a family member, and how is that name shown? | Booking form |
| 10 | How are withdrawals paid, how often, minimum amount? | Phase 3 earnings |
| 11 | Proof of registration required per specialist type (professional council)? | Specialist approval flow |

## 3. Legal / external (tracked, not blocking code)

- Lawyer review: stored-value / e-money rules and health-data obligations under Tanzania's data protection law — required before real money moves.
- Email `enquiry@openrouteservice.org` to confirm commercial use on the ORS plan before launch.
- Swahili strings must be reviewed by a native reader before release.
