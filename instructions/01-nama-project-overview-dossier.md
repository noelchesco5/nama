# nama - Project Overview and Depth Dossier

Draft v1 | 11 October 2026 | Prepared for Nama Labs

## 1. One-page summary

nama is a home-care marketplace for Tanzania. Clients find and book verified therapists, physiotherapists, nurses, home-care aides for wounded people and older adults, speech therapists, audiologists and wellbeing counsellors who come to them. It is not a doctor-first or general-practitioner service, and it does not replace treatment.

There are three roles: client, specialist, and HQ (headquarters, the nama operations team). One codebase delivers a marketing website, an installable iPhone web app (PWA, progressive web app) and an Android app (APK, Android package file).

Money works like this for now. Clients top up a wallet in TZS (Tanzanian shillings) by paying an HQ-controlled M-Pesa or Airtel Money merchant number outside the app, then confirming inside the app. HQ verifies every payment by hand before any credit exists. Nothing the client's phone sends can create money.

The stack is deliberately free: Supabase for database, authentication and storage; Cloudflare for hosting; GitHub Actions for builds; free routing and map tiers. Brand: the wordmark is only `nama`, lowercase, bold and warm. Palette is green, teal and white, with restrained accents. English and Swahili are first-class. No emoji anywhere; professional line icons and graphics only.

## 2. Problem and opportunity (hypotheses to validate)

These are working hypotheses from the founder brief, not measured data. Each should be tested in interviews before launch.

- Home visits for elderly care, post-injury care and therapy are mostly arranged through personal networks, so price, quality and arrival reliability are hard to judge.
- Families arranging care for a parent need trust signals: verified identity, affiliation, years of service, a visible price per unit time.
- Specialists lack a simple way to get steady clients, track earnings and get paid reliably.
- Mobile money is the dominant way to pay, so a wallet funded through M-Pesa and Airtel Money fits how people already move money.

## 3. Scope and boundaries

In scope for version 1:
- Service search, map discovery, specialist cards, booking, repeat requests.
- Wallet top-up with manual HQ verification, refunds, penalties, appeals.
- Client-to-specialist chat for ordered specialists, documents and reports, in-app notifications, support tickets.
- Specialist business workspace: services, schedule, requests, earnings, withdrawals.
- HQ console: payments, merchant numbers, approvals, refunds, tickets, anonymized analytics, audit log.

Out of scope for version 1:
- Doctor or GP consultations, prescriptions, diagnosis, emergency response, video consults.
- Automated mobile money integration, card payments, insurance claims.
- Push notifications when the app is closed, live specialist tracking, and a compare view.

Safety boundary: nama connects people to care and says so in plain words. The app shows a persistent, calm line that emergencies need emergency services, with local numbers verified by HQ before launch.

## 4. Users and what they are trying to get done

**Client.** Three typical people: an adult arranging care for a parent; a person recovering from injury who needs physiotherapy or nursing at home; a person seeking supportive wellbeing sessions. They want to find someone trustworthy fast, know the price, pay without friction and see what happened in past visits.

**Specialist.** Independent practitioners and small practices who must give a physical professional address and professional identity or affiliation. They want visible demand, a clean schedule, clear earnings and dependable payouts. They also sometimes need care themselves, which is why they keep the three client tabs.

**HQ.** The operations team. They verify payments, approve specialists, resolve appeals and tickets, apply refunds and penalties, and watch system health. HQ is a person doing manual work, so the product must make that work fast and auditable.

## 5. Core journeys

- **J1 First top-up:** client picks a rail, enters amount and payer phone, reads the HQ merchant number, pays outside the app, taps Confirm; a 10-minute review starts; HQ approves; wallet is credited and a notification arrives.
- **J2 Order:** search a service, choose from the dropdown, see nearby specialists on the map, open the sliding card, choose a time and address, confirm; funds are held.
- **J3 Repeat:** from history, schedule a repeat; the specialist must accept before anything is billed.
- **J4 Cancel:** cancel more than 6 hours ahead for a full refund (proposed default); under 6 hours HQ may refund up to 75 percent.
- **J5 No-show:** the specialist does not arrive; client gets a full refund and HQ records a penalty.
- **J6 Failed payment and appeal:** the timer expires; client sees failed, retries or appeals with a screenshot; HQ resolves from the evidence.
- **J7 Specialist onboarding:** register, submit address, identity and affiliation; HQ approves; the specialist appears on the map.
- **J8 Withdrawal:** specialist requests a withdrawal; HQ pays manually and records it.

## 6. Money flow and commercial model

Flow of funds: client pays the HQ merchant number outside the app, HQ verifies, wallet is credited, a booking holds the amount, completion releases it to the specialist's earnings minus the platform fee, the specialist requests a withdrawal, and HQ pays out and records it.

Proposed defaults awaiting your confirmation:
- More than 6 hours before service: full refund.
- Under 6 hours: up to 75 percent refund at HQ discretion, remainder to the specialist as compensation.
- Specialist no-show: full refund to the client plus a recorded penalty.
- Platform fee: not yet defined (see open questions).

Because HQ holds client money before it is spent, reconcile daily: the sum of all wallet balances plus specialist earnings owed must match the money actually sitting in the merchant accounts. The system should show this number every day.

## 7. HQ operating model

The 10-minute review rule is a staffing promise. Someone must watch the queue whenever clients can top up. Recommended: publish HQ review hours in the app and show them on the payment screen before the client pays. Outside those hours, either pause the timer until HQ opens or tell the client plainly that review will happen at opening. Without this, every late-night top-up will show failed through no fault of the client, which erodes trust in the first week.

Use unique reference codes per payment request so HQ can match a payment to a request quickly, and compare the transaction ID against the mobile money confirmation message, not only the screenshot.

## 8. Risk register

- **Payment fraud and edited screenshots.** Mitigate with reference codes, transaction ID matching against the real confirmation message, and HQ-only approval. Never credit on a client claim.
- **Stored value regulation.** Holding customer funds as credits may fall under Tanzanian payment system rules for e-money or prepaid value. Get legal advice before taking real money at scale. This document is not legal advice.
- **Health data protection.** Tanzania has a personal data protection law and a regulator; confirm obligations for health information, consent, retention and breach handling.
- **Professional licensing.** Verify what registration each specialist type must hold with its professional council, and make HQ approval depend on it.
- **Free-tier limits.** Supabase free pauses after a week of inactivity and has no backups; the routing service has daily quotas and unclear commercial terms; the public OpenStreetMap tile server forbids heavy app use. Each has a mitigation in the technical document.
- **Single HQ login.** One shared administrator account is weak for audit. Move to named HQ accounts early.
- **Safety of specialists and clients in homes.** Add identity verification, in-app arrival check-in and a report button.
- **Manual process does not scale.** Track minutes of HQ time per top-up and set the trigger to automate.
- **iPhone web app limits.** Installation is user-driven and some native capabilities are limited; state this honestly in the install flow.

## 9. Roadmap and exit criteria

**Phase 0 - Foundations.** Repository, CI, Supabase project, schema, authentication, roles, row level security. Exit: three roles can sign in and each sees only its own data, proven by automated tests.

**Phase 1 - Money core.** Ledger, manual top-up flow, HQ payment queue, merchant number editor, expiry job, appeals, notifications. Exit: a test top-up goes request, approve, credit, with an audit row, and an overdue request expires on schedule.

**Phase 2 - Ordering.** Service catalogue, specialist profiles, map, H3 candidate search, routing estimate, booking lifecycle, repeat requests, chat. Exit: a client can complete a booking end to end with a seeded specialist.

**Phase 3 - Specialist business and HQ depth.** Earnings, withdrawals, refunds, penalties, tickets, anonymized heat map. Exit: HQ can resolve a cancellation, a no-show and a ticket without database access.

**Phase 4 - Launch hardening.** Marketing site, install flows, APK release, backups, security review, legal review, pilot with a small named group. Exit: daily reconciliation shows zero difference for two weeks.

## 10. Success measures

- Share of sign-ups who complete a first top-up.
- Median and 90th percentile HQ approval time, and share of requests that expire.
- Booking acceptance rate and median time to acceptance.
- On-time arrival rate and no-show rate.
- Repeat booking rate within 30 days.
- First-response time on support tickets.
- Daily reconciliation difference, which must be zero.

## 11. Glossary

- **API:** application programming interface.
- **APK:** Android package, the installable Android app file.
- **ETA:** estimated time of arrival.
- **H3:** Uber's hexagonal hierarchical spatial index.
- **HQ:** headquarters, the nama operations team.
- **ORS:** OpenRouteService, a routing service built on OpenStreetMap data.
- **OSM:** OpenStreetMap.
- **PWA:** progressive web app, a website installed to the home screen.
- **RLS:** row level security, database rules that limit which rows a user can read or change.
- **TZS:** Tanzanian shillings.

## 12. Open questions for you

1. What is the platform fee, and is it a percentage of each booking or a fixed amount?
2. Do you accept the proposed refund defaults in section 6, especially the full refund beyond 6 hours?
3. What are the HQ review hours, and who covers the queue?
4. Which city launches first (Dar es Salaam is assumed), and how many specialists are lined up?
5. Which M-Pesa and Airtel Money account types will hold the merchant numbers, and are they registered to nama or to a person?
6. Who gives legal advice on stored value and on health data before real money moves?
7. What proof of registration will you require from each specialist type?
8. Should clients be able to book for a family member, such as a parent?
9. Is the 10-minute timer fixed, or may it pause outside HQ hours?
10. How are withdrawals paid, how often, and with what minimum?
11. Do you want named HQ accounts from day one instead of one shared login?
12. Will the specialist's address be shown to clients before booking, or only an approximate area?
