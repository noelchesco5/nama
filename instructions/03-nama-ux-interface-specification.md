# nama - UX and Interface Specification

Draft v1 | 11 October 2026 | Prepared for Nama Labs

This document specifies every screen: purpose, layout from top to bottom, component sizes and positions, behaviour, states and copy. Sizes use dp (density-independent pixels, the unit React Native uses). Swahili strings are proposals and must be reviewed by a native reader before release.

## 1. Design language

**Principles.** Drawn from Dieter Rams and Jony Ive without copying anyone's identity: be useful, be understandable, be unobtrusive, be honest, and finish the last detail. In practice: one primary action per screen, nothing decorative that carries no meaning, money states that cannot be misread, and calm over cleverness.

**Colour tokens.**
- Deep care green `#0B6B57`: primary actions, text links, the wordmark on light. White text on it measures about 6.5 to 1 contrast.
- Teal `#168C80`: icons, progress, highlights, map pins and large text. White text on teal measures only about 4.1 to 1, which fails the 4.5 to 1 rule for small text, so never put small white text on teal and never use teal for small text on white. Verify all ratios with a checker before release.
- White `#FFFFFF`, soft white `#F7FAF8` (screen background), mint `#E8F3EF` (cards and selected states), charcoal `#20312D` (text), border `#D3E6DF`.
- Proposed status accents: amber `#B7791F` for pending and time running out, red `#B3261E` for failed and errors, clay `#B5654A` with tint `#F6EBE6` for wellbeing content only. Clay never signals money or urgency.

**Type.** Manrope for display and headings, DM Sans for interface text, system fonts as fallback. Scale: Display 32/40, H1 26/34, H2 20/28, Body 16/24, Caption 13/18. Minimum body size is 16. Tabular numerals for every amount and timer. The app honours the operating system text size up to 200 percent and adds its own larger-text setting.

**Space and shape.** 4 dp base grid: 4, 8, 12, 16, 24, 32, 48. Screen margin 20 dp (16 on narrow phones). Card radius 20, button radius 14, chip radius full. Buttons 52 dp tall, inputs 52 dp, chips 36 dp, every touch target at least 48 dp. Separate surfaces with 1 dp borders instead of heavy shadows.

**Motion.** 180 to 280 ms, ease-out `cubic-bezier(0.2, 0, 0.1, 1)`. Sheets use a short spring with no bounce past the snap point. Nothing loops except the payment countdown ring. When the system asks for reduced motion, replace movement with a 120 ms fade.

**Icons.** One line-icon family, 24 dp grid, 1.75 dp stroke, rounded caps. Use an open-source set such as Lucide as the base, and draw a custom set for care types: physiotherapy (spine curve), nursing (cross and hand), speech (sound arcs), audiology (ear), wellbeing (leaf), home care (house and heart). No emoji anywhere, and no emoji-like faces. Use brand names as text only, not logos, for M-Pesa and Airtel Money unless you have permission.

**Wordmark.** `nama`, lowercase, bold, warm. Set in Manrope ExtraBold with slightly open tracking (about +1 percent) and rounded geometric proportions. Clear space on every side equals the height of the letter n. Minimum height 20 dp. Deep green on light backgrounds, white on green. No emblem beside it. The app icon is a square with a lowercase n in the same treatment.

**Bilingual rules.**
- Every string exists in English and Swahili. Allow 40 percent text growth; never truncate amounts, deadlines or warnings.
- Default to the device language, switch instantly without reload, and remember the choice.
- Show times as digits (14:30). Swahili clock reading counts from sunrise, so spelled-out hours would confuse people who read the other convention.
- Format money as `TZS 25,000`.
- Voice: plain, reassuring, specific. Example headline: Care that meets you at home / Huduma inayokufikia nyumbani.

**Accessibility baseline (WCAG 2.2 AA target).** Colour is never the only signal, so every status has an icon and a word. Every control has a spoken label. Focus order follows reading order. The payment timer announces only at 5:00, 2:00, 1:00 and 0:30, politely, never every second. No flashing. High contrast and reduced motion settings exist in the app.

## 2. Global layout rules

- **Safe areas.** Respect top and bottom insets on every screen. Content ends 16 dp above the bottom navigation.
- **Top bar.** 56 dp. Title left aligned in H2. At most two trailing actions: notification bell with a dot badge, and avatar. Detail screens show a back chevron at left.
- **Bottom navigation.** 64 dp plus inset. Client has three equal tabs, specialist four. Icon 24 dp over a 12 dp label, labels always visible. The active tab shows a mint pill 56 by 32 behind the icon, deep green icon and label. Inactive icons are charcoal at 70 percent.
- **Bottom sheets.** Snap points at 25, 55 and 92 percent of height. Handle 36 by 4 dp, centred, 8 dp from the top. Scrim 40 percent charcoal. The back gesture and a downward drag both close. A sheet opens in 240 ms.
- **Buttons.** One primary button per screen, full width, pinned above the keyboard. A secondary action is a text button below it.
- **Forms.** Labels sit above fields, never placeholder-only. Validate on blur. Errors show an icon plus text under the field.
- **States.** Loading uses mint skeleton blocks. Empty states carry one sentence and one action. Errors say what happened in plain words and offer Retry. Offline shows an amber banner under the top bar: You are offline. Showing saved information.
- **Money confirmation.** Any action that moves money shows a review step with amount, rail or account, and a clear confirm button. No money action completes in one tap.
- **Web breakpoints.** Phone under 600 dp, tablet 600 to 1024, desktop over 1024. On desktop the client and specialist apps show a map on the left and the active panel in a 420 dp column on the right. The marketing site is full width. HQ is desktop first.

## 3. Navigation maps

- **Client:** tabs Home, Order, Chat. From Home: Wallet, History, Documents and reports, Notifications, Support, Saved places, Settings.
- **Specialist:** tabs Home, Order, Chat, Business. Business has a top row of chips: Overview, Requests, Services, Schedule, Clients, Earnings.
- **HQ sidebar:** Overview, Payments, Appeals, Merchant numbers, Specialists, Bookings and cases, Tickets, Analytics, Audit log.

## 4. Marketing website

One long page with anchored sections. Section order: Hero, How it works, Services, Trust and safety, For specialists, Install, FAQ, Footer.

**Header.** Sticky, 64 dp, white at 92 percent opacity with a bottom border that appears after 8 dp of scroll. Left: wordmark, 28 dp. Right: language switch (EN | SW as a two-segment control, 36 dp high) and a Get the app button (44 dp, deep green). On phones the switch stays and the button shrinks to an icon with a label.

**Hero.** Desktop uses a 12-column grid with 24 dp gutters, section height about 720.
- Left, columns 1 to 6, vertically centred: eyebrow caption in deep green (Trusted home care), H1 in Display 56/60 (Care that meets you at home), body at 18/28 in two lines, then two buttons: Find a specialist (primary) scrolls to Install; Join as a specialist (outline).
- Right, columns 7 to 12: the three.js care-orbit object, a slow contour sphere ringed by fine topographic lines, in a 480 dp square on a mint field. Idle rotation about 0.05 rad per second. Pointer parallax up to 6 degrees. Paused through IntersectionObserver when off screen. Shown as a static original image under reduced motion or when WebGL is unavailable.
- Phone: stacked in the order copy, buttons, then the object at 280 dp high.

**How it works.** Three steps in a row on desktop, stacked on phones: Search a service, Choose a specialist on the map, Care at home. Each has a line icon in a 56 dp mint circle, an H2 title and two lines of body. A thin topographic path connects them and draws in as it scrolls into view (skipped under reduced motion).

**Services.** Six cards in a 3 by 2 grid on desktop, 2 by 3 on tablet, one column on phone: physiotherapy and therapy, nurses and wound care, older adult home care, speech therapy, audiology, supportive wellbeing. Card 160 dp high with icon top left, name in H2, one line of body. Hover changes the border to teal and lifts 2 dp. A footer line states that nama does not replace medical treatment.

**Trust and safety.** Two columns. Left: a short statement. Right: four checked lines with icons: identity and affiliation reviewed, price shown before you book, every payment checked by nama staff, we connect you to care and do not replace treatment.

**For specialists.** Split section with a short pitch (visibility, schedule, clear earnings) and a Join as a specialist button.

**Install (anchor #install).** The page detects the platform and shows one main card, with a small link Not on this device? to switch.
- iPhone, in Safari: four numbered steps with small original graphics: open Share, choose Add to Home Screen, turn on Open as Web App, tap Add. Copy says plainly that iPhone asks you to confirm, nama cannot add it for you. If the page is inside another app's browser, show Open in Safari first.
- Android: if a release exists, a Download for Android button with version and file size, and two lines on allowing installation from this source. If none exists, show Android app coming soon and a Use in browser button. Never show a dead download link.
- Desktop: a QR code to open the site on a phone, plus Use in browser.

**FAQ.** Accordion, six questions: what nama is, whether it replaces a doctor, how payment works, how specialists are verified, what happens if a specialist does not arrive, how your data is protected.

**Footer.** Soft white, wordmark, links (Privacy, Terms, Contact), language switch, small line `nama 2026`. The hidden HQ entry: five taps on that small line within 3 seconds. The counter resets after 3 seconds of no taps. There is no visual feedback until the fifth tap, then a quiet HQ link fades in below the footer for 8 seconds and leads to `/hq`. This is only discretion. Real protection is the server-side role check.

## 5. Authentication screens

**A1 Welcome (first launch).** Soft white. Language switch top right. Wordmark 40 dp centred at 30 percent of screen height, tagline beneath in Body. At the bottom, 24 dp from the inset: Create account (primary) and Sign in (text button).

**A2 Sign in.** Back chevron. H1 Welcome back. Email field, password field with a show toggle at the right end, Forgot password link right aligned 8 dp below it, primary Sign in pinned at the bottom. Failed attempts show one generic message: Email or password is incorrect. After repeated failures show a wait time.

**A3 Create account.** First control is a two-segment choice: I need care and I provide care. Fields: full name, email, phone with +255 preselected, password with a strength bar, language. A required, unticked checkbox with links to Terms and Privacy. Primary Create account. Next screen: Check your email with a Resend button on a 60 second cooldown. Note for build: Supabase's built-in email sender is heavily limited, so set up your own email service before launch.

**A4 Specialist registration.** A five-segment progress bar under the top bar. Steps: (1) account as in A3; (2) profession: category dropdown, years of practice, affiliation, registration number; (3) location: map with a pin to drag and an address field, with a line saying clients will see this professional address; (4) services as chips and price per unit time with a 30 or 60 minute selector; (5) review and submit. Progress is saved as a draft. Final screen: Pending approval, with three lines on what happens next and when to expect a reply.

**A5 Forgot password.** One email field, then a confirmation screen with no hint about whether the address exists.

**A6 HQ sign-in (`/hq`).** No marketing header. A 400 dp card centred on soft white: small wordmark with an HQ label, email, password, Sign in. Next step asks for the multi-factor code. First sign-in forces a Change password screen before anything else loads.

## 6. Client screens

### C1 Home (tab 1)

Scroll view on soft white. Bottom padding is navigation height plus 16 dp. Pull to refresh. Skeletons while loading.

Top to bottom:
1. **Greeting row**, 20 dp margin, 16 dp below the top inset. H1 Good morning, Amina / Habari za asubuhi, Amina (changes with time of day). Notification bell at the right, 48 dp target, dot badge when unread.
2. **Wallet card**, full width, 128 dp high, deep green, radius 20, 16 dp padding. Caption Wallet balance in white at 80 percent. Amount in 32 Manrope tabular, white, for example TZS 45,000. Bottom right: Add money, a white pill 44 dp high with green text. Tapping the card opens the wallet; tapping the pill opens the add money flow. If a payment is pending, a slim amber strip sits under the card: Payment under review, 06:42 left, tap to view.
3. **Next visit card**, mint, 16 dp below. Left: specialist avatar 48. Centre: service in Body bold, date and time below. Right: status chip. Tap opens booking detail. Empty state: No visit planned and a Find a specialist button that switches to the Order tab.
4. **Wellbeing check-in**, clay tint card. Caption in clay, question How are you today? and three labelled chips: Low, Okay, Good (words, no faces). Choosing one saves a private note for the user only and shows one gentle line of text, for example Thank you for telling us. A quiet link, Talk to a wellbeing specialist, opens Order with that service chosen. Shown once a day, dismissible, and can be switched off in Settings. It never scores or diagnoses.
5. **Your care in numbers**: a horizontal row of three tiles, each 140 by 96 dp: visits this month, hours of care, spent this month. Tap opens History with a chart.
6. **Quick links**: list rows, 56 dp each, line icon at left and chevron at right: Documents and reports, Support, Saved places.
7. **Recent**: two latest history rows with a Repeat text button each.
8. **Footer line**, Caption in charcoal at 70 percent: In an emergency, call emergency services. nama does not replace medical treatment.

### C2 Wallet

Top bar with back and the title Wallet. Balance block: amount in Display size, caption Available below it, and if funds are held, a second line On hold for bookings: TZS 30,000. Primary Add money, full width. Below, a two-segment control: Activity and Requests.
- **Activity:** ledger rows grouped by date. Each row is 64 dp: circular mint icon with an arrow in or out, title (Top-up approved, Booking: Physiotherapy), subtitle with time, amount at the right with an explicit plus or minus sign and green or charcoal text. Tap opens a detail sheet with reference and type.
- **Requests:** payment requests with status chips: Pending review (amber, with live countdown), Approved (green), Rejected (red), Failed (amber), Appeal sent (teal outline). Tap opens that request's status screen.

### C2a Add money, step 1 of 3

Full height sheet. Title Add money. Step indicator 1 of 3 at the top right.
- Rail selector: two tiles side by side, 56 dp high, text only (M-Pesa, Airtel Money). Selected tile has a 2 dp green border and mint fill.
- Amount field with a TZS prefix, tabular numerals. Under it, helper text with the minimum and maximum. Three quick chips: +10,000, +20,000, +50,000 (settings values).
- Phone number field with +255 preselected, caption The number you will pay from.
- If HQ review hours are closed, an amber note sits above the button: Payments are checked from 08:00 to 20:00. You can still pay and we will check it when we open. (Hours are settings; see open questions.)
- Primary Continue, disabled until valid.

### C2b Pay, step 2 of 3

- Card with the sentence Pay TZS 20,000 to, then the merchant number in 28 tabular text with a Copy button at the right (toast Copied, light haptic). Under it the HQ instructions in the chosen language as numbered steps.
- Reference line: Add this reference if asked: NM-4F9K, with its own Copy button.
- Caution line with a shield icon: Only pay to this number. nama staff never ask for your PIN.
- Primary I have paid, confirm. Secondary Back.
- Tapping confirm opens a dialog: Confirm only after you have paid. nama checks every payment. Buttons Confirm and Not yet.

### C2c Waiting for review, step 3 of 3

- Centred ring 160 dp with the remaining time inside in 32 tabular text (09:41). The ring empties clockwise. Under 60 seconds the ring and text turn amber and a line appears: Almost out of time.
- Caption under the ring: nama is checking your payment. Under that: amount, rail and reference.
- A three-step vertical tracker: Submitted (done), Under review (current), Credited (next).
- The user may leave. A pending strip stays on Home and a notification is created when the status changes. The timer is driven by the server deadline, so closing the app never changes the outcome.

### C2d Outcomes

- **Approved:** green check that draws in over 240 ms, TZS 20,000 added, the new balance, a Done button.
- **Rejected:** red icon, the reason HQ gave in plain words, buttons Try again and Contact support.
- **Failed (not confirmed in time):** amber icon. Copy: We could not confirm your payment in time. If you already paid, send us your confirmation and we will check it. Primary Appeal with screenshot, secondary Try again.
- **Appeal screen:** message field with a short default, an Attach screenshot button (camera or library), a thumbnail preview with a remove control, a note on image type and size, and Send appeal. The app compresses the image and removes location data. After sending: Appeal sent, with a line on what happens next. The decision arrives as a notification.

### C3 Order (tab 2), map first

The map fills the screen under every overlay.
- **Search bar:** pill, 52 dp high, 16 dp margins, 12 dp below the top inset, white with a border. Search icon at left, placeholder Search a service / Tafuta huduma.
- **Location chip:** 36 dp, 8 dp below the search bar, left aligned: Current location with a chevron. Tapping offers Home, saved places and Pick on map.
- **Dropdown:** opens directly under the bar while typing. Up to six rows of 56 dp: category icon, name, category in caption. Matches English and Swahili names. When the field is empty it shows recent searches. Choosing a row closes the dropdown, turns the bar into a chip with the service name and a close control, and animates the map to fit the client's location and the nearest specialists.
- **Pins:** teal circles 36 dp with the service glyph. The selected pin is larger and deep green. Clusters show a count.
- **Results sheet:** starts at the 25 percent snap above the navigation bar, with a handle, the title 8 specialists nearby and a segment control Map | List. Collapsed, it shows a horizontal snapping carousel of cards, each screen width minus 48 dp. Expanded to 92 percent it shows a vertical list.
- **List view:** sort chips Nearest, Soonest, Rating, Price.
- **Locate button:** 48 dp circle, bottom right, 16 dp above the sheet.
- **Attribution:** tiny text bottom left: OpenStreetMap contributors.
- **Permission denied:** a banner under the chip offers to choose a saved place or drop a pin. The screen never blocks.
- **Empty:** No specialists for this service nearby yet. Buttons: Search a wider area and Notify me.

### C4 Specialist card and detail

**Collapsed card** (in the carousel): avatar 56, name in Body bold, profession in caption, rating with count, estimated arrival (about 12 min, estimate) and price (TZS 15,000 for 60 min).

**Expanded sheet** (swipe up or tap), top to bottom:
1. Avatar 80, name in H1, a Verified by nama badge (shield icon), affiliation line, Years on nama.
2. Three stat chips: rating, visits completed, usual response time.
3. About, three lines with a Read more control.
4. Services and price, one row per service with price per unit time.
5. Next available: horizontal time chips for today and tomorrow.
6. Location: a small static map and the professional address (see open questions about showing exact or approximate).
7. Reviews: two latest, with See all.
8. Sticky bottom bar, 72 dp: price summary at left, primary Request at right.

Any example profile content is tagged Sample profile and cannot be requested.

### C5 Booking sheet (three steps inside one sheet)

- **When:** a seven-day date strip, time chips grouped as Morning, Afternoon and Evening, and a duration stepper in units of the specialist's unit time.
- **Where:** radio cards for Home, saved places and Current location, plus Add new place (map pin). A notes field of up to 300 characters with the hint Share only what the specialist needs.
- **Review:** summary rows, price breakdown, the amount that will be held and the wallet balance. If balance is short: You need TZS 8,000 more and an Add money button that returns here afterwards. A plain cancellation line: Cancel more than 6 hours ahead for a full refund. Under 6 hours, nama reviews and may refund up to 75 percent. Primary Request and hold TZS 30,000.
- **After requesting:** a waiting screen, Waiting for Joseph to accept, with the remaining acceptance time and a free Cancel button.

### C6 Booking detail

Status tracker at the top: Requested, Accepted, Arrived, In progress, Completed. Below it a card with specialist, date and time, address and price. Actions: Chat, Cancel. Cancel opens a sheet that states the exact consequence before confirming (full refund, or under 6 hours: nama will review, up to 75 percent). After the start time plus the grace period a button appears: The specialist has not arrived. After completion a rating sheet opens (five stars and an optional comment) with a Repeat button.

### C7 and C8 Chat (tab 3)

- **List:** rows of 72 dp: avatar, name, last message in one line, time, unread dot. Empty: Chat opens after you order, with a Find a specialist button.
- **Thread:** top bar with avatar, name and service. Own messages are mint, right aligned; the other person's are white with a border, left aligned; times group by day. A pinned caption at the top: Do not share payment details here. Composer is pinned above the keyboard: text field growing to five lines and a send button 48 dp. Message states: sending, sent, failed with a Retry. Overflow menu has Report. No attachments in version 1.

### C9 History

Top: a summary tile with a small chart toggle (visits per month). List grouped by month: service, specialist, date, price, status chip. Detail screen shows the full record and two actions: Repeat and Report a problem. Repeat opens a date and time picker and sends a request with the line Needs Joseph to accept. You are charged only after they accept.

### C10 Documents and reports

Three segments: Reports, Documents, Feedback. Rows of 64 dp: file icon, title, source specialist, date. Tapping opens an in-app viewer using a short-lived signed link. Empty states carry one sentence each.

### C11 Notifications

List, newest first, grouped Today and Earlier. Row 72 dp: type icon (payment, booking, support), title, one line, time, unread dot. Tapping deep links to the item. Mark all read sits in the top bar. Empty state: Nothing new.

### C12 Support

- **List:** tickets with status chips Open, Answered, Closed and a New ticket button.
- **New ticket:** category chips (Payment, Booking, Specialist, Other), a large text field labelled Describe your concern (at least 10 characters, up to 2,000), optional screenshot, and Send.
- **Thread:** messages with HQ labelled nama support, a reply composer, and a notification when HQ replies.

### C13 Settings

Sections: Profile (name, phone, photo; email read-only), Language (English or Kiswahili, applies at once), Accessibility (text size slider from 100 to 200 percent, high contrast, reduce motion defaulting to the system setting), Notifications by type, Wellbeing check-in on or off, Privacy (consent, download my data, delete account), Sign out, and the app version.

### C14 Saved places

List with Home first, then favourites. Add or edit uses a map pin and a label. **Save prompt** (small sheet with a mini map): Save this as Home? Buttons Save as Home, Save as favourite, Not now. Show on the first order, then only by the rules in the technical document, at most once every 14 days, and stop after two dismissals.

## 7. Specialist screens

Tabs 1 to 3 (Home, Order, Chat) are the client screens, so a specialist can use care services too. Tab 4 is Business.

### S1 Business, shared frame

Top bar title Business. Under it a horizontally scrolling chip row (36 dp chips): Overview, Requests, Services, Schedule, Clients, Earnings. A verification banner appears above the chips until approved: Pending approval, Needs more information (with a button), or Approved (hidden).

### S2 Overview

1. Row with today's date in H2 and an Accepting requests switch at the right. Turning it off asks for confirmation and hides the specialist from search.
2. Earnings card, deep green, same format as the client wallet card: Earnings to date, and a caption for this week.
3. Clients per day: a bar chart of the last 14 days, 160 dp high, with a text summary under it (for example Average 3 clients a day) so the chart is not the only source.
4. Next appointments: up to three rows with time, client first name, service, address area.
5. Pending requests tile with a count and a Review button.

### S3 Requests

List of cards. Each shows client first name, service, date and time, address area (the exact address appears only after acceptance), price, and a countdown to the response deadline. Repeat requests carry a label Repeat of 3 October. Buttons at the bottom of each card: Accept (primary) and Decline. Accept opens a one-line confirmation. Decline requires a reason chip (Not available, Too far, Outside my services, Other). Nothing is billed for a repeat until Accept.

### S4 Services

List of the specialist's services, each with price per unit time and an active switch. Tapping edits in a sheet: price, unit minutes, description. Add service opens the catalogue.

### S5 Schedule

- A week grid: seven rows, each showing time ranges as mint bars. Tap a day to edit ranges in a sheet with start and end pickers. Add time off from a button at the top right.
- Day view of today's bookings. For the next booking, when it is within 30 minutes, a primary button I have arrived appears. It asks for location permission, shows the distance to the address, then stores the arrival point. After that the button becomes Start session, then Complete session.

### S6 Clients

List with name, number of visits and last visit. Detail shows history and lets the specialist add a report or document for that client. A caption states that the client can see what is added.

### S7 Earnings and withdrawals

Cards for Available, Pending (held for upcoming sessions) and Total. Transaction list underneath with the same row design as the client wallet. Primary Request withdrawal opens a sheet: amount, payout rail and number, review step, confirm. Withdrawals show chips Requested, Paid, Rejected, and a notification arrives when HQ pays. Payouts are manual in version 1.

## 8. HQ screens (desktop first)

**Frame.** Fixed left sidebar 240 px, white, items 44 px high, selected item mint with a green left bar. Top bar 56 px with search, an environment label and the user menu. Content area max width 1280 px with 24 px padding. Tables use 48 px rows and sticky headers. Every destructive or money action asks for confirmation and writes to the audit log.

### H1 Overview

1. Five KPI tiles in one row: Pending payments (with age of the oldest), Expiring in under 2 minutes (amber), Open tickets, Bookings today, and Wallet reconciliation difference (shows 0 with a green check; any other value turns red and links to the health report).
2. Below, two columns: left a preview of the five oldest pending payments; right an activity feed.
3. A system strip at the bottom: ORS quota used today, error rate, last backup time.

### H2 Payments

- Table columns: time left or age, user, rail, amount, payer phone, reference, status. Oldest first by default. Filters: status chips, rail, date. New and changed rows flash with a soft mint highlight for 1 second.
- Keyboard: j and k move, Enter opens the detail, a approves, r rejects (each still asks for confirmation).
- **Detail drawer**, 480 px from the right: request summary; the client's last five wallet entries; the screenshot if any, zoomable; the merchant number snapshot; and a match checklist (amount matches, phone matches, reference matches). A required field for the mobile money transaction ID must be filled to approve.
- Buttons: Approve (deep green) and Reject (red outline). Reject needs a reason chip. The confirmation modal states the exact amount to be credited and the client's name.
- After an action, a toast appears and the next oldest request opens automatically.
- An expired request shows an Expired badge. Approving it asks for a reason code and is logged as a late approval.

### H3 Appeals

Same pattern as Payments, with the client's message and screenshot side by side and a link to the original request. Decisions: Credit, Reject with reason.

### H4 Merchant numbers

Two cards, M-Pesa and Airtel Money. Each shows the current number, whether it is active, and the last change. Edit opens a modal with the number, instructions in English and Swahili, an active switch, and a live preview exactly as clients see it. Saving requires re-entering the HQ password. Under each card, a change history (who, when, old and new value).

### H5 Specialists

Table with a status filter (Pending, Approved, Suspended). Detail page: identity and registration reference, affiliation, services and price, and a map with the professional address pin. Actions: Approve, Request more information (with a message), Suspend (with a reason).

### H6 Bookings and cases

Tabs: All, Refund cases, No-shows, Disputes. Case detail shows a timeline, booking details, and both parties. Chat excerpts are visible only after a case is opened, and each view is logged. Actions: Full refund, Partial refund (slider capped at 75 percent), Penalty amount field, and Notes. A confirmation modal repeats every amount.

### H7 Tickets

Three columns: list (status, subject, user, age), thread, and details. Reply composer at the bottom with canned replies in English and Swahili, Assign to me, and Close ticket. Sending saves the reply and creates the user's notification.

### H8 Analytics

- A hexagon heat map using H3 resolution 8 cells coloured by count. Cells with fewer than 5 records are hidden.
- Filters: service, week range.
- Charts: client groups by service and by frequency band.
- A caption on the page: Aggregates only. No individual data is shown here.
- A separate Live map for active bookings sits behind a prompt asking for a reason. Each use is written to the audit log.

### H9 Audit log

Append-only table: time, actor, action, entity, before and after. Filters by actor, action and date. Export to CSV.

## 9. Cross-cutting behaviour and copy

**Timer rules.** Deadlines come from the server. The countdown is a display. If the phone clock is wrong, the screen still follows the server offset. If the connection drops the countdown continues and re-syncs on return.

**Proposed Swahili terms** (all to be reviewed by a native reader, especially Pochi and the appeal wording):
- Find a specialist: Tafuta mtaalamu
- Add money: Ongeza pesa
- Wallet: Pochi
- Confirm: Thibitisha
- Try again: Jaribu tena
- Appeal (payment review): Omba ukaguzi upya
- Support: Msaada
- Notifications: Arifa
- Booking: Miadi
- History: Historia
- Settings: Mipangilio
- Language: Lugha
- Cancel: Ghairi
- Verified: Imethibitishwa
- Pending: Inasubiri
- Failed: Imeshindwa

**Error copy pattern.** Say what happened, what is safe, what to do. Example: We could not reach the server. Your money is safe. Check your connection and try again. / Hatukuweza kufikia seva. Pesa zako ziko salama. Angalia mtandao wako kisha ujaribu tena.

**Content and imagery.** Original editorial care images, one per section, never reused across unrelated sections. No stock people presented as real specialists. Any example specialist is visibly labelled Sample profile.

**Haptics.** Light impact on copy, confirm and sheet snap. Turned off by the reduced motion setting.

## 10. Open design questions

1. Should clients see a specialist's exact professional address before booking, or only an approximate area?
2. What are the HQ review hours shown on the payment screen, and should the timer pause outside them?
3. What is the acceptance window for a specialist (for example 15 minutes), and what happens to the hold when it ends?
4. Is Pochi the right Swahili word for wallet for your audience?
5. Do you want the wellbeing check-in at all in version 1, given it records sensitive information?
6. May clients book for a family member, and if so how is their name shown to the specialist?
7. Should the sample specialists exist in the pilot, or should the map stay empty until real specialists are approved?
8. Which email service will send verification and reset emails?
