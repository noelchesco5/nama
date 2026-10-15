# nama - Technical Documentation

Draft v1 | 11 October 2026 | Prepared for Nama Labs

This document defines how nama is built: architecture, data, money logic, dispatch, delivery and quality gates. Facts about free-tier limits and third-party services were checked on 11 October 2026 and will drift, so re-check before launch. Reference repositories are listed in section 18 with what to borrow and what to distrust.

## 1. Architecture at a glance

One Expo Router codebase builds three outputs: a static web export (marketing site plus iPhone installable web app), and an Android APK. All of them talk to one Supabase project. Money-moving logic lives inside the database as functions, not in client code.

```
Expo app (web export, iOS PWA, Android APK)
        |  HTTPS, JWT
   Cloudflare Pages (static hosting, security headers)
        |
   Supabase: Auth | Postgres + RLS | Storage | Realtime | pg_cron | Edge Functions
        |                                   |
   ledger + RPC functions           OpenRouteService (ETA estimates)

GitHub Actions: CI, nightly backup, keepalive, APK build and release
```

Principles:
- The client never decides anything about money, roles or who may see what. The database does, through RLS (row level security) and security definer functions.
- Every state change on money is an append to the ledger plus an audit row.
- Every free-tier limit has a fallback, so a quota error degrades the experience instead of breaking it.

## 2. Stack decisions

- **App:** Expo with Expo Router, React Native, React Native Web, TypeScript. Check the current stable Expo SDK at project start (reference repos used SDK 55 and SDK 57, so versions move fast).
- **Server state:** TanStack Query. **Forms and validation:** zod shared between app and edge functions.
- **Language:** i18next with expo-localization. English and Swahili files are written by a person who reads both, not machine translated.
- **Bottom sheet and motion:** @gorhom/bottom-sheet with Reanimated, tuned to 180 to 280 ms transitions.
- **3D:** three.js through @react-three/fiber on web only, lazy loaded, with a static fallback on native and for reduced motion.
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime, Edge Functions, managed cron).
- **Maps:** MapLibre (native and web variants). **Spatial index:** h3-js. **Routing:** OpenRouteService (ORS).
- **Hosting and CI:** Cloudflare Pages and GitHub Actions.

Change from the earlier plan: Postgres on Supabase replaces the managed MySQL and the custom Express sessions. Make `supabase/migrations` the single source of truth for the schema and generate TypeScript types from it. Dropping Drizzle avoids two competing schema definitions. If you prefer Drizzle, use it only to query, never to define the schema.

## 3. Free-tier budget and upgrade triggers

Supabase Free, per its pricing page and a third-party check dated 30 September 2026:
- 500 MB database, 1 GB file storage, 5 GB egress, 50,000 monthly active users, 2 projects.
- The project pauses after one week of inactivity. There are no backups. Uploads are capped at 50 MB. Logs are kept one day.

OpenRouteService Free Standard plan:
- Directions 2,000 per day, matrix 500 per day, geocoding 1,000 per day, 40 per minute on most endpoints. A matrix request may hold up to 3,500 origin-destination pairs. There is no service level agreement and no live traffic.
- Attribution is required: openrouteservice.org by HeiGIT and OpenStreetMap contributors.

Mitigations:
- A scheduled GitHub Actions job pings the API every few days so the project never pauses.
- A nightly encrypted `pg_dump` to storage you control, because free has no backups. This is not optional for a ledger.
- Compress payment screenshots on the phone to about 300 KB or less, so 1 GB holds thousands.
- One ORS matrix call ranks a whole candidate list, and results are cached, so 500 matrix calls a day is a ceiling of searches, not users.

Upgrade triggers: first real money (move to a paid Supabase plan for backups and no pausing), database above 400 MB, ORS above 60 percent of any daily quota, or any quota error seen in production.

## 4. Repository layout and conventions

```
nama/
  apps/app/                 Expo app
    app/(marketing)  app/(auth)  app/(client)  app/(specialist)  app/hq
    components/brand  marketing  maps  navigation  ui
    constants  i18n  lib
  supabase/
    migrations/  functions/  seed.sql  tests/ (pgTAP)
  packages/shared/          zod schemas, money helpers, ranking logic
  .github/workflows/        ci  deploy-web  backup  keepalive  release-android
  docs/
```

- pnpm workspaces. Conventional commits. Pull requests required, CI green, CODEOWNERS on `supabase/migrations` and any money code.
- `.env.example` is committed; real secrets live only in GitHub and Supabase secret stores.
- Platform-split files (`MapView.native.tsx`, `MapView.web.tsx`) wherever a native-only package is involved.

## 5. Data model

All tables have RLS on and no public access by default. Money is stored as whole TZS in `bigint`, never floats.

- `profiles` (id equals auth user id, role, display_name, locale, phone, must_change_password)
- `specialist_profiles` (user_id, bio, affiliation, registration_ref, address_text, location point, h3_r8, started_at, status pending, approved or suspended, price_tzs, unit_minutes)
- `services` (slug, name_en, name_sw, category) and `specialist_services`
- `availability_slots`, `time_off`
- `saved_places` (user_id, label home, favourite or custom, location, h3_r9, address_text, last_prompted_at)
- `bookings` (client_id, specialist_id, service_id, address snapshot, scheduled_at, duration, status, price_tzs, parent_booking_id for repeats, arrived_at, arrival_point, cancel_reason)
- `repeat_requests`, `reviews`, `documents`
- `messages` (booking-scoped threads)
- `ledger_accounts`, `ledger_txns`, `ledger_entries`
- `payment_requests`, `payment_appeals`, `merchant_settings`
- `withdrawals`, `refund_cases`, `penalties`
- `support_tickets`, `ticket_messages`, `notifications`
- `audit_log` (append-only)
- `heat_cells` (aggregated view for HQ, with a minimum count)

## 6. Authentication and roles

- Supabase Auth with email and password. No Google sign-in.
- Roles come from a `user_roles` table and a Custom Access Token Auth Hook that writes a `user_role` claim into the token. RLS policies call a helper such as `authorize()` that reads the claim. The Supabase guide describes this pattern. Role changes only appear after the user refreshes the session.
- Signup creates a client profile or a pending specialist profile through a database trigger. A client can never set their own role. The HQ role is seeded only by a script run from a trusted machine or a protected workflow.
- The HQ seed reads its initial password from a secret, stores only a hash (Supabase handles hashing) and sets `must_change_password`. The app blocks the HQ console, and privileged functions refuse, until the password is changed.
- HQ lives under `/hq`, outside client and specialist navigation, revealed by five taps on the marketing footer. That reveal is cosmetic. The real protection is server-side role checks.
- Turn on multi-factor authentication for HQ accounts (confirm availability in the current Supabase plan).
- Web tokens sit in browser storage, so ship a strict Content Security Policy through Cloudflare headers. Native uses SecureStore.

## 7. Wallet ledger

Patterns borrowed from the reference repos: append-only entries, balanced transactions, balances derived from entries, idempotency keys, reversals instead of edits, row locks, and a system account for external deposits.

Accounts: one wallet per client, one earnings account per specialist, and system accounts for platform cash clearing, booking holds, platform revenue and penalty income.

Tables: `ledger_txns` (id, kind, idempotency_key unique, created_by, meta) and `ledger_entries` (txn_id, account_id, direction, amount_tzs greater than zero).

Rules enforced in the database:
- A deferred constraint trigger checks that debits equal credits per transaction.
- Triggers reject UPDATE and DELETE on ledger tables, and those privileges are revoked.
- One function, `post_txn(kind, idempotency_key, lines)`, is the only way to write. It locks the affected accounts in a fixed order to avoid deadlocks, rejects a client wallet that would go negative, and returns the existing transaction if the key was used before.
- A cached balance is updated inside that function and checked nightly against the sum of entries. A health query reports total debits minus total credits (must be zero) and any negative wallet.

Standard postings:
- **Top-up approved:** debit platform cash clearing, credit client wallet.
- **Booking hold:** debit client wallet, credit booking hold.
- **Completion:** debit booking hold, credit specialist earnings for price minus fee, credit platform revenue for the fee.
- **Full refund:** debit booking hold, credit client wallet.
- **Partial refund up to 75 percent:** refund the decided share from the hold to the wallet; the remainder goes to the specialist or the platform, per your decision.
- **No-show:** full refund, then debit specialist earnings and credit penalty income.
- **Withdrawal paid:** debit specialist earnings, credit platform cash clearing.

## 8. Manual top-up state machine

States: `pending_review`, `approved`, `rejected`, `expired` (shown to users as failed), `appealed`, `appeal_approved`, `appeal_rejected`, `cancelled`.

- **Create:** an RPC `create_payment_request(rail, amount, payer_phone)` snapshots the current merchant number, generates a short reference code and sets `deadline_at` to now plus 10 minutes on the server clock. The client countdown uses the deadline minus the server offset.
- **Approve:** `hq_approve_payment(id, reason_code)` requires the HQ claim and a changed password, locks the row, accepts only `pending_review`, `appealed` or `expired` with a reason code, posts the ledger transaction with key `topup:<id>`, writes the audit row and a notification. Approving twice credits once.
- **Expire:** managed cron (built on `pg_cron`) runs every minute, sets overdue `pending_review` rows to `expired` and inserts a notification for each. The status guard makes it idempotent.
- **Appeal:** the client attaches a screenshot and message; status becomes `appealed`; HQ reviews and decides.
- **Limits:** minimum and maximum amount in settings; at most a few pending requests per user; rate limit on creation.
- **Evidence:** private bucket `payment-evidence`, path `<user_id>/<request_id>/<random>.jpg`, owner can insert and read, HQ can read, images only, up to 5 MB, location data stripped on the phone.
- **Merchant numbers:** `hq_set_merchant(rail, number, instructions)` writes before and after values to the audit log. Because each request stores its own snapshot, edits affect only new requests.
- **HQ queue:** live through Supabase Realtime, oldest first, with time remaining and an expired badge.

## 9. Booking lifecycle

States: `requested`, `accepted`, `declined`, `in_progress`, `completed`, `cancelled`, `disputed`.

- On request, funds are held in the ledger. If the specialist does not accept within the acceptance window, the booking is cancelled and the hold released.
- **Repeat:** a repeat creates a `repeat_request` with no hold. Only when the specialist accepts does a booking exist and billing occur.
- **Cancellation:** at least 6 hours before start gives a full refund (proposed default). Under 6 hours opens a `refund_case` for HQ with a maximum of 75 percent; funds stay held until HQ decides.
- **No-show:** if there is no arrival check-in by start plus a grace period, the booking is flagged. The client can press that the specialist has not arrived. HQ decides refund and penalty.
- **Arrival check-in:** the specialist taps arrived; the app compares device location with the address and stores the point. Treat it as evidence, not proof, since location can be faked.
- **Completion:** the client confirms, or it auto-completes after 24 hours unless disputed. Completion releases earnings.

## 10. Dispatch: H3 narrowing plus routing estimate

Routing engines already run Dijkstra-family shortest path searches on the road graph, so nama does not need to write its own. The job is to avoid asking the engine about everyone.

Steps for one search:
1. Convert the client's location to an H3 cell at resolution 8. At resolution 7 the average cell is 5.161 square kilometres with a 1.406 km edge; resolution 8 is roughly a seventh of that area (about 0.74 square kilometres, edge around 0.5 km). Confirm exact values with the h3-js average edge length function before tuning.
2. Pull candidates by expanding rings: `gridDisk(cell, k)` for k = 1, 2, 3 and so on. A disk of k rings holds 1 + 3k(k+1) cells (7, 19, 37, 91 and 217 cells for k = 1, 2, 3, 5 and 8). Query approved specialists whose `h3_r8` is in the set and who offer the service. Stop at about 10 eligible candidates or a maximum k set for the city.
3. Filter by availability: a free slot overlapping the requested window, not on time off, under a daily maximum.
4. Cheap score: straight-line distance times a detour factor of about 1.4, divided by an assumed average speed. The speed is an assumption to calibrate with real trips, and the UI labels results as estimates. Keep the top 8.
5. One ORS matrix request with the 8 specialists as sources and the client as destination returns all travel times in a single call. Cache by pair of resolution 9 cells and a 15 minute bucket.
6. Fallback: on error, timeout or quota response, use the step 4 estimate and mark it as estimated.
7. Rank by travel time, earliest free slot and rating, with weights in a settings table. Give new specialists a temporary exposure boost for their first few bookings so the marketplace does not starve them.

Placement: an Edge Function `find_specialists` holds the ORS key, calls a Postgres function for candidate pull and returns the ranked list. The function computes a specialist's H3 cells server-side when the address is saved, so a client cannot spoof them.

Geocoding: the free quota is small and public Nominatim has strict rules, so avoid search-as-you-type address lookup. Prefer a map pin drop with occasional reverse geocoding, and have each specialist pin their professional location once.

Saved places: prompt to save Home on the first order. Prompt again after two orders from the same resolution 9 cell within 30 days. Never prompt more than once every 14 days and stop after two dismissals.

## 11. Maps

- **Native:** `@maplibre/maplibre-react-native`. It is not part of the Expo SDK, does not run in Expo Go, and needs its config plugin and a development or prebuild build.
- **Web:** `react-map-gl/maplibre` with `maplibre-gl`. Keep each import inside its own platform file. Importing the native package in shared code breaks web, and the reverse breaks native.
- **Tiles:** the OpenStreetMap Foundation policy forbids heavy use by distributed apps without permission, forbids bulk or offline prefetching, asks apps not to hardcode its tile URL, and requires proper caching and attribution. Develop lightly against it. For launch use a free tier from an OSM-based tile provider, or host your own PMTiles archive on Cloudflare R2 object storage (the Protomaps approach, which I know from background knowledge and have not re-verified, so check current free limits). Keep the tile URL in configuration.
- **Attribution:** always visible, OpenStreetMap contributors, plus the ORS credit where routing results are shown.
- **Privacy on the map:** clients see a specialist's professional address. Specialists see a client's exact address only after accepting the booking. HQ sees aggregated cells, and exact positions only for active bookings, with every view written to the audit log.

## 12. Realtime, chat and notifications

- Chat uses Supabase Realtime scoped by RLS. A thread exists only between a client and a specialist who share a non-cancelled booking.
- Notifications are rows created by database triggers (payment decisions, expiry, booking changes, ticket replies). The app subscribes to its own rows and shows an unread badge.
- No operating system push in version 1. Push for the iPhone web app has extra requirements, so leave it to a later phase.
- Support: a ticket is a row plus messages. An HQ reply inserts a message and a notification in one transaction.

## 13. Storage and privacy

- Buckets: `payment-evidence` and `care-documents` are private with random object keys and short-lived signed URLs (about 60 seconds). Storage policies mirror table ownership.
- Anonymized analytics: aggregate by H3 resolution 8 and week, suppress any cell with fewer than 5 records, show no individual rows and no fine demographic combinations.
- Do not log health content. Log HQ views of sensitive items.
- Provide consent screens, data export and account deletion. Confirm obligations under Tanzania's personal data protection law with a lawyer before launch.

## 14. Web, iPhone and Android delivery

- **Web:** `expo export --platform web` produces static files deployed to Cloudflare Pages from GitHub Actions. Add a single page app fallback and a `_headers` file with CSP, HSTS, frame and referrer policies.
- **iPhone:** detect iOS Safari and show Apple's user-driven steps: Share, Add to Home Screen, Open as Web App, Add. Installation cannot be automatic. Ship a web manifest and touch icons.
- **Android build in GitHub Actions** (a pattern used by several public Expo repositories): checkout, Node, Java 17, Android SDK, install, `npx expo prebuild --platform android`, decode the keystore from a secret, `./gradlew assembleRelease`, upload the artifact. Pushing a tag like `v1.0.0` creates a GitHub Release holding `nama.apk`.
- **Download link:** `https://github.com/<owner>/<repo>/releases/latest/download/nama.apk` stays stable across versions. The marketing site shows the Android button only if a release exists, using a `release.json` generated at deploy time.
- **Signing:** create one release keystore, back it up offline in two places and never lose it. Some reference repos sign with the debug key, which is fine for tests but not for real distribution, because updates require the same key.
- **Build quota:** EAS cloud builds have a monthly free quota that at least one developer exhausted. Building on GitHub runners avoids it. Check the current free minutes for private repositories, since Android builds are slow.
- **three.js:** web only, lazy loaded, paused off-screen, and off when reduced motion is on.

## 15. CI/CD and quality gates

Workflows:
- `ci.yml`: install, typecheck, lint, unit tests for money helpers and ranking, start a local Supabase, run migrations and pgTAP tests, build the web export.
- `deploy-web.yml`: Cloudflare Pages deploy, with previews per pull request.
- `backup.yml`: nightly `pg_dump`, encrypted, stored privately, 14 days retained, with a monthly restore drill.
- `keepalive.yml`: scheduled ping to prevent pausing. Scheduled workflows can be disabled in repositories with long inactivity, so verify current behavior.
- `release-android.yml`: tag-triggered APK build and release, plus a manual run for smoke tests.

Mandatory tests for money and access:
- Every ledger transaction balances; a wallet cannot go negative, including under concurrent holds.
- Approving a payment twice credits once; an expired request cannot be approved without a reason code.
- A client cannot read another user's payments, tickets, documents or evidence.
- A specialist or client calling an HQ function is refused.
- Merchant number edits are audited; rows in the audit log cannot be changed.

## 16. Security checklist

- RLS enabled and tested on every table, default deny.
- The Supabase service role key never reaches a client; only edge functions and workflows use it.
- Security definer functions set a fixed search path, check the role claim inside and grant minimum execute rights.
- Validate all inputs with zod; enforce amount limits and rate limits on payment creation.
- CSP, HTTPS only, secure headers, pinned workflow actions, Dependabot, secret scanning with push protection.
- HQ seed password from a secret, forced change, multi-factor authentication, named accounts as soon as possible. The password in the original brief was written in plain text, so replace it.
- Encrypted backups and a tested restore.
- Independent security review before real money.

## 17. Observability

- Free Supabase keeps logs for one day, so export what matters. Use a free-tier error tracker for the app (confirm current limits).
- An `ops_events` table records key events. The HQ telemetry screen shows queue age, expiry rate, payment state counts, ORS quota used today, error rate and the daily reconciliation figure.

## 18. Reference repositories and sources

These are community projects of varying maturity. Read them, check licenses, and write your own tests. Do not copy blindly.

- **ByteEntropyDotCom/ledger-core** - rules enforced in Postgres with integrity triggers, immutability, and a health view proving the books balance. Written for PostgreSQL 18; check the version Supabase runs.
- **slaurmagan/pg_ledger** - append-only entries, idempotency keys, reversals as corrections, frozen accounts, point-in-time balances. A Rails library, so borrow the ideas.
- **godstimedev/lance-wallet** - row locking on the sender's wallet and a system wallet for external deposits.
- **Faithful001/ledger-engine** - balances derived from entries and no update or delete path.
- **maplibre/maplibre-react-native** and the GreenAsh article on MapLibre for native and web in Expo - the platform-split pattern.
- **srjn45/kept** (pull request 32) - replacing EAS with an on-runner Gradle build, tag-triggered releases and a stable latest-download URL.
- **FairCoinOfficial/FAIRWallet**, **BobbyNooby/honestea**, **javierbrk/libreargo** - Expo apps that build APKs in GitHub Actions; note the debug-key caveat.
- Supabase documentation on custom claims and role-based access control, and its pricing page.
- OpenRouteService plans, API restrictions and terms of service pages.
- OpenStreetMap Foundation tile usage policy.
- From background knowledge and not reviewed in this session: Formance Ledger, Blnk and TigerBeetle as larger ledger systems. TigerBeetle is a separate database and is probably overkill here.

## 19. Known limits and decision log

- ETAs are estimates built on static road data. There is no live traffic.
- The ORS plans page states that commercial use is not allowed on its Collaborative plan, and I could not confirm the commercial position of the Standard plan. Email enquiry@openrouteservice.org before launch. If the answer is no, the fallback is straight-line estimates now and a self-hosted routing engine on a small VPS later.
- Supabase Free is for building and demonstration, not for holding real money.
- Decisions: Postgres over MySQL; money logic in database functions; manual payment verification for now; in-app notifications only; one SQL source of truth for the schema.
