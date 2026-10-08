# Extras App — API

Film productions often fill background roles ("20 men, 25-45, for a fight
scene") by manually phoning through a list of 100+ extras one by one. This
project replaces that with a system where extras have a profile, coordinators
create a call with criteria, matching extras are found automatically and
notified, and they can accept or decline right from the app.

Built after being laid off as a software engineer — a portfolio project
based on firsthand experience working as a film extra.

## Tech stack

- **Backend:** Node.js, Express, Prisma
- **Database:** PostgreSQL
- **Mobile app:** React Native (separate repo/folder — see roadmap below)
- **Push notifications:** Firebase Cloud Messaging
- **Photo storage:** Firebase Storage — uploaded directly from the mobile app, secured
  per-user via a Firebase custom auth token issued by the backend at login
- **Maps:** Google Maps Platform — Maps SDK (in-app map), Places API (search) and
  Geocoding API (pin → address), the last two called server-side so the key stays private
- **Excel export:** exceljs (server-side), shared from the app with react-native-blob-util + react-native-share
- **Email:** Nodemailer through Brevo's SMTP relay (password reset codes, security emails, and invites + updates for extras without a smartphone)
- **Web pages:** simple server-rendered pages (sign-up, accept/decline from email, update details), styled to match the app; photo uploads with multer + sharp

## Status
✅ Phase 1 complete — all core functionality built and working end-to-end (auth, matching,
push notifications, live status dashboard, edge case handling, seed data).

✅ Phase 2 complete — UI/UX polish pass across the whole app, tackled part-by-part.

🔄 Phase 3 in progress — Parts 1–11 complete (multi-production support; meeting points, wrap time + Google Maps;
date of birth; smartphone + encrypted bank details; realistic seed data with generated photos; name search;
production join requests with coordinator approval; notification badges; attendance + payroll export to Excel;
email + forgot/change password; email invites + sign-up links for extras without a smartphone).

## Screenshots

| Login | Home (Extra) | Home (Admin) |
|---|---|---|
| ![Login Screen](screenshots/Login%20Screen.png) | ![Home Screen - Extra](screenshots/Home%20Screen%20-%20extra.png) | ![Home Screen - Admin](screenshots/Home%20Screen%20-%20admin.png) |

| My Invites | Create Call Request (matched) | Create Call Request (no matches) |
|---|---|---|
| ![My Invites](screenshots/My%20Invites.png) | ![Matches and tally](screenshots/Create%20call%20request%20-%20matches%20and%20tally%20screen.png) | ![No matches](screenshots/Create%20call%20request%20-%20no%20matches.png) |

| Push Notification |
|---|
| ![Push notification](screenshots/call%20request%20notification%20-%20extra.png) |

**Phase 2 details** — UI/UX polish + new features, tackled part-by-part.

**Part 1 – Extra profile + photos ✅**
- Profile editing with mandatory face/full-body photos, secured via Firebase Storage
- Chip-based skills/languages, contact info fields, card layout

**Part 2 – Browse extras (admin) ✅**
- Filter extras by skill, gender, availability and age range; full profile detail view

**Part 3 – Cancel vs decline + activity tally ✅**
- Declining (never accepted) tracked separately from cancelling (backed out)
- Worked/declined/cancelled tally for both sides, plus a 3-strikes cancellation flag for admins

**Part 4 – Editing + responses ✅**
- Edit shoot day date/time and call request details; browse shoot days in the app
- See exactly who accepted, declined, cancelled or hasn't responded
- Push notifications to booked extras when a shoot day changes

**Part 5 – Bulk shoot days ✅**
- Schedule several days for a production in one batch, each with its own date, time and location

**Part 6 – Calendars + Home redesign ✅**
- Calendar on Home for both sides (extras: their bookings; admins: every shoot day)
- Hamburger menu on every screen; blocks double-booking a production on the same date

**Part 7 – Account deletion requests ✅**
- Extras or admins can request deletion; admins approve or deny
- Approval soft-deletes the account (blocks login and matching, keeps history)

**Part 8 – Visual theme ✅**
- Custom login artwork, and a dark "dusk" gradient theme with glass-style cards and gold accents

**Phase 3 details** — the final project phase, tackled part-by-part.

**Part 1 – Productions ✅**
- Multiple productions ("Wednesday season 3", "Bloodaxe season 2"); each coordinator
  sees only their own production's shoot days, call requests and extras
- Extras can be on one or both productions, and can add/remove them from their profile
- Coordinators can remove an extra from their production; affected invites expire
  without counting against the extra
- Also: themed confirmation dialogs, screen-specific hamburger menu actions,
  safe-area fix across all screens

**Part 2 – Meeting point + wrap time ✅**
- Saved meeting points per production, or "Other" with a Google Maps picker:
  search (Places autocomplete) or drop a pin, address filled in automatically
- Optional estimated wrap time (overnight wraps roll to the next day)
- Extras see the meeting point, call/wrap times and "Get directions" to the exact pin
- Google keys split: restricted Android key for the map, server-side key for
  geocoding and place search
- Also: pagination, redesigned Create Call Request, copy a call request to other days

**Part 3 – Date of birth ✅**
- Extras enter a date of birth (spinner picker) instead of an age, so their age is always current
- Age is worked out on the fly for display, the admin age filter and call request matching
  (age ranges are converted to date-of-birth ranges in the database query)

**Part 4 – Smartphone + bank details ✅**
- Extras record whether they have a smartphone (used later to choose push vs email invites)
- IBAN/BIC are checked (IBAN checksum, BIC format), then encrypted with AES-256-GCM before
  saving; the key lives only in the server's environment
- Extras only ever see a masked IBAN (`IE•• •••• •••• 5678`); coordinators tap
  "Show bank details" to reveal them via a separate, logged, admin-only endpoint

**Part 5 – Fresh seed data ✅**
- 25 extras with generated cartoon face and full-body photos (DiceBear + sharp), uploaded
  to Firebase Storage with the Admin SDK; encrypted fake bank details; 5 without a smartphone
- Past and upcoming shoot days with invites in every state, including a 3-strikes extra
- Also: grouped pickers for skills, languages and availability ("Everyday" can't be combined
  with specific days), dropdown filters and pagination on the extras list, taller photo
  boxes, gender chips, Archery added as a skill

**Part 6 – Name search ✅**
- Coordinators search extras by name (case-insensitive, matches anywhere in the name)
- Works together with the skill, gender, availability and age filters
- The search waits until typing stops (debounced) before calling the API, and jumps back to page 1
- The extras list is always sorted A–Z by name, with a stable tiebreaker so pages don't shuffle

**Part 7 – Production join requests ✅**
- Extras can no longer add themselves to a production: ticking a new one sends a request
  to that production's coordinator, who approves or denies it from a Production Requests screen
- Until approved, the extra isn't listed, matched or invited for that production;
  leaving a production stays instant
- After a denial (or being removed by a coordinator) an extra can ask again after 30 days
- The hidden many-to-many link was replaced with an explicit `extra_productions` table
  (PENDING / APPROVED / DENIED + who reviewed it and when); a hand-edited migration
  copied all existing links across as APPROVED before dropping the old table
- Push notification to the extra when their request is approved or denied

**Part 8 – Notification badges ✅**
- Red count badges, Instagram-style: shown when something new arrives, cleared once the screen is opened
- Extras: new invites (for upcoming shoot days) on the My Invites button
- Coordinators: new production requests and deletion requests, as a total on the hamburger
  icon and a count next to each item in the menu
- Each user stores when they last opened each screen; the badge counts anything newer
- Counts refresh on Home, when the app returns to the foreground, and when a push arrives while it's open
- Also: call request skills now match extras with *any* of the selected skills (was *all*),
  with a clearer hint on the Create Call Request screen
 
**Part 9 – Attendance + payroll export ✅**
- Attendance screen for each shoot day once it has started: coordinators mark no-shows
  and record each extra's finish time (starts as the estimated wrap; change individuals
  or set one time for everyone; overnight shoots handled)
- Payroll export to Excel, built server-side with exceljs: everyone who worked (no-shows
  left out), with name, phone, email, account holder name, IBAN, BIC, date, call time,
  finish time and hours; missing bank details / finish times highlighted in red
- The app downloads the file with the coordinator's token and opens Android's share menu
  (email, WhatsApp, Drive); the file is kept in the app's private cache and cleared on the next export
- Bank-details warning before every export, and every export is logged on the server
- New account holder name, required alongside IBAN/BIC (banks now check the payee name
  under EU Verification of Payee); pre-filled with the extra's own name
- No-shows are a new invite status: shown to the extra, counted in both tallies, and
  counted towards the 3-strikes flag alongside cancellations

**Part 10 – Email + forgot/change password ✅**
- Email sending with Nodemailer through Brevo's SMTP relay, using a shared branded layout
  (with a plain-text version too)
- Forgot password: a 6-digit code is emailed (generated with `crypto.randomInt`, stored only
  as a bcrypt hash). It works once, expires after 15 minutes, is cancelled after 5 wrong
  guesses, and only one code can be sent per minute
- The reply is the same whether or not the email has an account, so the form can't be used
  to find out who's signed up
- Change password from the hamburger menu (needs the current password)
- After any password change: a "your password was changed" email, and every other phone is
  logged out. Each user stores `passwordChangedAt`, and login tokens issued before it are
  rejected; the app catches this and goes back to login with a message. The phone that made
  the change gets a fresh token and stays logged in
- Password rules based on NIST guidance: 10–64 characters, at least one letter and one number,
  common passwords blocked, and no name or email in it. Checked whenever a password is set
  (sign-up, reset, change), never at login. The app shows a live checklist as you type
- Also: redesigned login screen with a "Forgot password?" link and success/error messages

**Part 11 – Email invites + sign-up links ✅**
- Extras without a smartphone get everything by email instead of push: call invites, "you're booked",
  shoot day changes and production updates. One helper decides push or email for each extra
- Accept, decline or cancel straight from the email. Links open a confirm page first (some email apps
  open links by themselves to scan them), use the same rules as the app, and carry a one-off random code
  stored only as a SHA-256 hash
- Coordinators send sign-up invite links from the app (single use, 7 days). Signing up gives an approved
  membership of that production straight away; if the email already has an account, the production is just added
- Web sign-up page: with a smartphone, choose a password and use the app; without one, fill in your
  details (skills, languages, availability, optional photos and bank details) on the page
- "Update my details" by emailed link (single use, 1 hour), with a "your details were changed" email
  afterwards and a clear warning if bank details changed
- Web pages styled like the app (dusk gradient, glass cards, gold buttons, dropdown multi-selects)
- Also: "Email" tags on the responses lists, pull-to-refresh on Invite Extras and the responses lists

## Getting started

1. Install dependencies:
```
   npm install
```
2. Copy `.env.example` to `.env` and fill in your local PostgreSQL connection
   string, JWT secret and `GOOGLE_GEOCODING_API_KEY` (a Google Cloud key with the
   Geocoding API and Places API (New) enabled), `BANK_DETAILS_ENCRYPTION_KEY`
   (64 hex characters — see the command in `.env.example`) and
   `FIREBASE_STORAGE_BUCKET`. Put your Firebase service account key in the
   backend folder as `firebase-service-account.json` (it's git-ignored):
```
   cp .env.example .env
```
3. For email, add your Brevo SMTP details to `.env`: `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS` (a Brevo SMTP key), `EMAIL_FROM_ADDRESS` (a sender
   you've verified in Brevo) and `EMAIL_FROM_NAME`. Brevo SMTP keys stop working
   after 90 days without use. Check it works by sending a test email (leave the
   address out to send it to `EMAIL_FROM_ADDRESS`):
```
   node scripts/sendTestEmail.js you@example.com
```
Also set `APP_BASE_URL` (e.g. `http://localhost:4000`). It's used to build the links in emails
(accept/decline, sign-up, update details). Locally those links only open on the computer running the backend.

4. Create the database tables:
```
   npx prisma migrate dev --name init
```
5. Start the dev server:
```
   npm run dev
```
6. Check it's running:
```
   curl http://localhost:4000/health
```

## Seed data

`npx prisma db seed` wipes the database and fills it with realistic test data:

- **2 productions:** Wednesday season 3 and Bloodaxe season 2, each with a saved studio meeting point
- **2 coordinators:** `wednesday@example.com` and `bloodaxe@example.com`
- **25 extras:** `extra1@example.com` to `extra25@example.com`
  - Cartoon face and full-body photos, generated in code (DiceBear "Avataaars" faces + a drawn body) and uploaded to Firebase Storage
  - A mix of ages (20–71), skills, languages, availability and productions
  - 5 without a smartphone (extra8, 16, 20, 21, 25)
  - Fake Irish bank details for 17 of them, encrypted the same way as the app
- **10 shoot days:** past and upcoming, at saved studios and pinned "Other" locations (Glendalough, Brittas Bay)
- **10 call requests** with invites in every state: accepted, declined, cancelled, pending and expired
- **3 strikes:** extra11 (Darragh Nolan) has 3 recent cancellations on Bloodaxe
- **Production requests:** extra1 and extra2 are waiting to join Bloodaxe; extra3 was denied for Wednesday 10 days ago
- **Attendance + payroll:** one no-show per production on a past shoot day, plus varied finish
  times (one extra released early, one kept late); extra1's bank account is a joint account
  ("Jordan & Sam Lee") to show a different account holder name

All passwords are `password123`. This deliberately doesn't meet the password rules (they
only apply when a password is set, not at login), so it's quick to type while testing.
The `@example.com` addresses can't receive email, so to test forgot password, change a
test account's email to one you can read first.

The seed needs `firebase-service-account.json` in the backend folder and `FIREBASE_STORAGE_BUCKET` in `.env`. It deletes all photos under `profile-photos/` in Firebase Storage before uploading new ones.

To preview the cartoon photos without touching the database, run `node prisma/previewPhotos.js`. The pictures are saved to `prisma/seed-preview/`.

## API overview
All admin routes are scoped to the coordinator's own production.

| Method | Route                  | Who   | Description                              |
|--------|-------------------------|-------|-------------------------------------------|
| POST   | `/auth/register`       | Any   | Create an account (ADMIN or EXTRA); the password must meet the password rules        |
| POST   | `/auth/login`          | Any   | Log in, get a JWT                         |
| POST   | `/auth/forgot-password` | Any  | Email a 6-digit reset code (same reply whether or not the account exists) |
| POST   | `/auth/reset-password`  | Any  | Set a new password with the emailed code; logs out every device |
| POST   | `/auth/change-password` | Any (logged in) | Change your password (needs the current one); logs out other devices and returns a fresh token |
| GET    | `/profiles/me`         | Extra | View your own profile                     |
| PATCH  | `/profiles/me`         | Extra | Update your own profile (date of birth, photos, skills, bank details + account holder name, etc.) |
| PATCH  | `/profiles/me/productions` | Extra | Set the productions you want: new ones become join requests, unticked ones are left/cancelled (must keep one approved; blocked if booked on an upcoming shoot) |
| GET    | `/profiles`            | Admin | List extras on your production, sorted A–Z (search by `name`; filter by skill, gender, availability, age) |
| GET    | `/profiles/:id`        | Admin | View an extra's full profile (your production only) |
| GET    | `/profiles/:id/bank-details` | Admin | Reveal an extra's full IBAN/BIC + account holder name (decrypted on request, access logged) |
| DELETE | `/profiles/:id/production` | Admin | Remove an extra from your production; their upcoming invites for it become expired |
| GET    | `/productions`         | Any   | List all productions                      |
| POST   | `/shoot-days`          | Admin | Create a shoot day                        |
| POST   | `/shoot-days/bulk`     | Admin | Create several shoot days at once for one production (blocks duplicate dates within the same production) |
| GET    | `/shoot-days`          | Admin | List your production's shoot days         |
| GET    | `/shoot-days/:id`      | Admin | View a shoot day plus its call requests   |
| PATCH  | `/shoot-days/:id`      | Admin | Edit a shoot day's call time, est. wrap time and/or meeting point (notifies accepted extras of what changed; blocks same-day double-booking) |
| GET    | `/shoot-days/:id/attendance`  | Admin | Who accepted a started shoot day, with no-show status and finish times |
| PATCH  | `/shoot-days/:id/attendance/:inviteId` | Admin | Mark/unmark a no-show and/or set one extra's finish time |
| PATCH  | `/shoot-days/:id/finish-time` | Admin | Set the same finish time for everyone who turned up |
| GET    | `/shoot-days/:id/payroll`     | Admin | Download the payroll Excel file (who worked, bank details, hours; export logged) |
| POST   | `/call-requests`       | Admin | Create a call, auto-matches eligible extras (age, gender, any of the selected skills) |
| PATCH  | `/call-requests/:id`   | Admin | Edit a call request's description/quantity needed |
| GET    | `/call-requests/:id`   | Admin | See invite status + accept/decline/cancel tally |
| POST   | `/call-requests/:id/copy`     | Admin | Copy a call request to other upcoming shoot days |
| GET    | `/invites/me`          | Extra | View your invites                         |
| PATCH  | `/invites/:id`         | Extra | Accept, decline, or cancel (after accepting) an invite |
| GET    | `/invites/tally/me`    | Extra | View your own lifetime worked/declined/cancelled/no-show tally |
| GET    | `/invites/tally/:extraProfileId` | Admin | View an extra's tally + 3-strikes flag (cancellations + no-shows) for your production |
| POST   | `/deletion-requests/me`          | Extra | Request your own account be deleted        |
| DELETE | `/deletion-requests/me`          | Extra | Cancel your own pending deletion request    |
| POST   | `/deletion-requests/:id`         | Admin | Initiate a deletion request for an extra    |
| GET    | `/deletion-requests`             | Admin | List all pending deletion requests          |
| PATCH  | `/deletion-requests/:id/approve` | Admin | Approve a request (soft-deletes the account)|
| PATCH  | `/deletion-requests/:id/deny`    | Admin | Deny a deletion request                     |
| GET    | `/production-requests`             | Admin | List extras asking to join your production |
| PATCH  | `/production-requests/:id/approve` | Admin | Approve a join request (extra can now be matched and invited) |
| PATCH  | `/production-requests/:id/deny`    | Admin | Deny a join request (extra can ask again after 30 days) |
| GET    | `/badges`                     | Any   | Counts of new items since each screen was last opened (extras: invites; admins: deletion + production requests) |
| PATCH  | `/badges/seen/:type`          | Any   | Mark a screen as opened, resetting its badge (`invites`, `deletionRequests`, `productionRequests`) |
| GET    | `/locations`                  | Admin | Your production's saved meeting points |
| POST   | `/locations`                  | Admin | Save a meeting point for next time |
| GET    | `/geocode/reverse`            | Admin | Turn a map pin into an address (server-side Google key) |
| GET    | `/places/autocomplete`        | Admin | Place suggestions as you type (server-side Google key) |
| GET    | `/places/details/:placeId`    | Admin | Exact location + address for a chosen place |
| POST   | `/signup-invites`             | Admin | Email a sign-up link for your production (or add the production straight away if the email already has an account) |
| GET    | `/signup-invites`             | Admin | Sign-up invites you've sent, with status (waiting, signed up, added, expired) |

## Web pages

Opened from links in emails, in any browser. No login: the one-off code in the link is the proof.

| Page | What it's for |
|------|----------------|
| `/email/invite/:code` | Accept, decline or cancel a call (confirm page first) |
| `/signup/:code` | Sign up from a coordinator's invite (smartphone: set a password; no smartphone: fill in details) |
| `/details` | Ask for a link to update your details (extras without a smartphone) |
| `/details/:code` | Update your details (filled in already; photos and bank details optional) |

## Data model

- `productions` — e.g. "Wednesday season 3"; everything an admin sees is scoped to one
- `users` — accounts, either ADMIN (coordinator, belongs to one production) or EXTRA;
  tracks an optional pending deletion request (self- or admin-initiated) and a
  soft-delete flag once one is approved; also records when they last opened each
  notification screen (used for the red badges), a hashed password reset code with its
  expiry and wrong-guess count, and when the password was last changed (older logins are rejected)
- `extra_profiles` — date of birth, gender, height, skills, languages, phone/contact email,
  availability, photos, smartphone yes/no, encrypted IBAN/BIC + account holder name, and a hashed
  one-hour "update my details" link code; linked to productions via `extra_productions`
- `extra_productions` — an extra's membership of a production: PENDING (asked to join),
  APPROVED (can be matched and invited) or DENIED, plus who reviewed it and when
- `locations` — a production's saved meeting points (name, address, optional map pin)
- `shoot_days` — a production's shoot day: call date/time, optional estimated wrap time,
  and meeting point (name, address, optional map pin)
- `call_requests` — a need for a shoot day, with matching criteria (age
  range, gender, skills) and quantity needed
  
See `prisma/schema.prisma` for the full schema.

## Roadmap — Phase 1 (functionality)

- [x] Part 1 — Backend foundation: schema, migrations, health check
- [x] Part 2 — Auth: register/login, JWT, role middleware
- [x] Part 3 — Core API: profiles, call requests, matching logic
- [x] Part 4 — React Native scaffolding, wired to this API
- [x] Part 5 — Extra-side UI: profile + invite list
- [x] Part 6 — Coordinator UI + Firebase push notifications
- [x] Part 7 — Live accept/decline dashboard, edge cases
- [x] Part 8 — Polish, seed data, demo GIF (deployment planned later)

## Roadmap — Phase 2 (UI polish + new features)
- [x] Part 1 — Extra profile edit + mandatory face/full-body photo upload (Firebase
      Storage, secured with per-user rules backed by a Firebase custom auth token)
  - [x] Functionality
  - [x] UI polish
- [x] Part 2 — Admin: view extra profiles
  - [x] Functionality
  - [x] UI polish
- [x] Part 3 — Cancel/decline distinction + lifetime tally view (both sides)
  - [x] Functionality
  - [x] UI polish
- [x] Part 4 — Edit shoot day / call request
  - [x] Functionality
  - [x] UI polish
- [x] Part 5 — Bulk shoot day creation
  - [x] Functionality
  - [x] UI polish
- [x] Part 6 — Calendar views (both sides)
  - [x] Functionality
  - [x] UI polish
- [x] Part 7 — Profile deletion request/approval flow
  - [x] Functionality
  - [x] UI polish
- [x] Part 8 — Login page visual
  - [x] Functionality
  - [x] UI polish

## Roadmap — Phase 3 (final project phase)
- [x] Part 1 — Productions (coordinators scoped to one production; extras on one or both)
  - [x] Functionality
  - [x] UI polish
- [x] Part 2 — Meeting point, estimated wrap time + map
  - [x] Functionality
  - [x] UI polish
- [x] Part 3 — Date of birth (replaces age)
  - [x] Functionality
  - [x] UI polish
- [x] Part 4 — New profile fields (smartphone, encrypted bank details)
  - [x] Functionality
  - [x] UI polish
- [x] Part 5 — Fresh seed data (25 extras with photos)
  - [x] Functionality
  - [x] UI polish
- [x] Part 6 — Name search (case-insensitive, debounced, list always sorted A–Z)
  - [x] Functionality
  - [x] UI polish
- [x] Part 7 — Production join requests (extras request to join a production; coordinator approves or denies)
  - [x] Functionality
  - [x] UI polish
- [x] Part 8 — Notification badges (new invites for extras; new deletion/production requests for coordinators)
  - [x] Functionality
  - [x] UI polish
- [x] Part 9 — Attendance (no-shows + finish times) + payroll export to Excel
  - [x] Functionality
  - [x] UI polish
- [x] Part 10 — Email setup (Brevo) + forgot/change password, password rules, log out other devices
  - [x] Functionality
  - [x] UI polish
- [x] Part 11 — Email invites + notifications for extras without a smartphone, sign-up invite links, update-details pages
  - [x] Functionality
  - [x] UI polish
- [ ] Part 12 — Code reorganisation (hooks/navigation, API layer, shared theme + components)
- [ ] Part 13 — Screenshots of all screens and workflows

## License

MIT

## Stretch goals

- **Coordinator edits for extras without smartphones** — extras without a smartphone can
  sign up and update their details on the web (Part 11); a coordinator could also edit
  them in the app when an extra phones in a change.
- **SMS fallback** — for profiles without app access, send an SMS (via Twilio) instead
  of a push notification when matched, with a simple YES/NO reply to accept/decline.
