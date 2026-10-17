# Nama - Comprehensive Project Walkthrough & Compliance Report

This document details the architecture, implementation state, and verification results of the **Nama** home care platform, benched directly against the original system specifications (`instructions/01`, `02`, `03`) and implementation plans (`plan.md`).

---

## 1. Executive Summary

Nama is a professional home care platform built for Tanzania (Dar es Salaam pilot), connecting clients with verified specialists (physiotherapists, nurses, older adult caregivers, therapists, audiologists). 
Delivered as a unified Expo Router codebase supporting:
1. **Marketing website & PWA** (installable directly to iOS / Android home screens without app store friction).
2. **Client Portal** (wallet management, USSD mobile money top-ups via Payme Africa, service ordering, booking lifecycle, chat, reviews).
3. **Specialist Portal** (two-gate onboarding fee, schedule management, request queue, earnings & withdrawals).
4. **HQ Operations Console** (payments queue, refund cases resolution, onboarding review, audit logs, sub-HQ permissioning).

---

## 2. Phase-by-Phase Implementation Status

### Phase 0: Foundations & Architecture
- **Monorepo:** pnpm workspace (`apps/app`, `packages/shared`, `supabase`).
- **Database Schema & Auth:** Supabase Postgres with `profiles`, `user_roles`, and database-authoritative `authorize()` functions.
- **Design System:** Deep green (`#0B6B57`), teal (`#168C80`), soft white (`#F7FAF8`), mint (`#E8F3EF`), charcoal (`#20312D`), Manrope & DM Sans typography, strict 4dp spacing grid. Zero emojis. EN & SW localization support.
- **Status:** **Complete & Verified** (all automated pgTAP/SQL RLS tests passing).

### Phase 1: Money Core & Automated Payments (Payme Africa)
- **Ledger System:** Append-only `ledger_txns` and `ledger_entries` (whole TZS in `bigint`) with deferred constraint triggers (`debits = credits`) and strict rejection of UPDATE/DELETE.
- **Single Writer Pattern:** `post_txn` function with ordered account locks, checking non-negative balances.
- **Automated Payme USSD Push & Webhook:**
  - `payme-collection` Edge Function: Initiates secure mobile money USSD push collections.
  - `payme-webhook` Edge Function: Verifies HMAC signature (`X-Middleware-Signature`), securely credits wallets idempotently.
- **Status:** **Complete & Verified** (SQL money tests passing, edge functions deployed).

### Phase 2: Ordering, Dispatch & Booking Lifecycle
- **Services & Discovery:** `find_specialists` function with H3 res 8 spatial indexing and approximate distance calculation.
- **Booking Lifecycle:** `requested` (holds price) -> `accepted`/`declined` (15-min window) -> `in_progress` -> `completed` (splits 7% platform fee, specialist earnings, revenue) or `cancelled`/`disputed` (refund tiers: >6h full, <6h refund case held for HQ).
- **Status:** **Complete & Verified**.

### Phase 3: Specialist Business & HQ Depth
- **Specialist Onboarding:** Two-gate verification (document upload + one-time onboarding fee payment confirmation).
- **Earnings & Withdrawals:** Ledger-backed specialist earnings accounts and withdrawal request workflows.
- **HQ Console:** Refund cases resolution slider, onboarding payments queue, audit logs, and analytics.
- **Status:** **Complete & Verified**.

### Phase 4: Launch Hardening & Deployment
- **Marketing Landing Page:** Fully built at `/` with Hero, How It Works, 6 Services, Trust & Safety, For Specialists, PWA Install Guide (iOS/Android instructions), FAQ, and hidden 5-tap HQ entry on copyright.
- **Hosting & Infrastructure:** Cloudflare Pages static export configuration (`_headers` for CSP/HSTS/security, `_redirects` for SPA fallback), automated via GitHub Actions (`deploy-web.yml`).
- **Status:** **Complete & Ready for Production**.

---

## 3. Verification & Test Results
- **TypeScript Typecheck (`tsc`):** Clean (zero errors across monorepo).
- **Linter (`oxlint`):** Clean.
- **Unit Tests (`vitest`):** 14/14 passed.
- **SQL / RLS Security Tests:** Passed successfully.
- **Web Export:** 34 static routes generated and validated in `apps/app/dist`.
