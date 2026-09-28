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

## Status
✅ Phase 1 complete — all core functionality built and working end-to-end (auth, matching,
push notifications, live status dashboard, edge case handling, seed data).
✅ Phase 2 complete — UI/UX polish pass across the whole app, tackled part-by-part.
🔄 Phase 3 in progress — Parts 1–2 complete (multi-production support; meeting points, wrap time + Google Maps).

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
- 
**Part 4 – Editing + responses ✅**
- Edit shoot day date/time and call request details; browse shoot days in the app
- See exactly who accepted, declined, cancelled or hasn't responded
- Push notifications to booked extras when a shoot day changes
- 
**Part 5 – Bulk shoot days ✅**
- Schedule several days for a production in one batch, each with its own date, time and location
- 
**Part 6 – Calendars + Home redesign ✅**
- Calendar on Home for both sides (extras: their bookings; admins: every shoot day)
- Hamburger menu on every screen; blocks double-booking a production on the same date
- 
**Part 7 – Account deletion requests ✅**
- Extras or admins can request deletion; admins approve or deny
- Approval soft-deletes the account (blocks login and matching, keeps history)
- 
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

## Getting started

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your local PostgreSQL connection
   string, JWT secret and `GOOGLE_GEOCODING_API_KEY` (a Google Cloud key with the
   Geocoding API and Places API (New) enabled):
   ```
   cp .env.example .env
   ```
3. Create the database tables:
   ```
   npx prisma migrate dev --name init
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
5. Check it's running:
   ```
   curl http://localhost:4000/health
   ```

## API overview
All admin routes are scoped to the coordinator's own production.

| Method | Route                  | Who   | Description                              |
|--------|-------------------------|-------|-------------------------------------------|
| POST   | `/auth/register`       | Any   | Create an account (ADMIN or EXTRA)        |
| POST   | `/auth/login`          | Any   | Log in, get a JWT                         |
| GET    | `/profiles/me`         | Extra | View your own profile                     |
| PATCH  | `/profiles/me`         | Extra | Update your own profile, including face/full-body photo     |
| PATCH  | `/profiles/me/productions` | Extra | Set which productions you're on (must keep one; blocked if booked on an upcoming shoot) |
| GET    | `/profiles`            | Admin | List extras on your production (filter by skill, gender, availability, age) |
| GET    | `/profiles/:id`        | Admin | View an extra's full profile (your production only) |
| DELETE | `/profiles/:id/production` | Admin | Remove an extra from your production; their upcoming invites for it become expired |
| GET    | `/productions`         | Any   | List all productions                      |
| POST   | `/shoot-days`          | Admin | Create a shoot day                        |
| POST   | `/shoot-days/bulk`     | Admin | Create several shoot days at once for one production (blocks duplicate dates within the same production) |
| GET    | `/shoot-days`          | Admin | List your production's shoot days         |
| GET    | `/shoot-days/:id`      | Admin | View a shoot day plus its call requests   |
| PATCH  | `/shoot-days/:id`      | Admin | Edit a shoot day's call time, est. wrap time and/or meeting point (notifies accepted extras of what changed; blocks same-day double-booking) |
| POST   | `/call-requests`       | Admin | Create a call, auto-matches eligible extras |
| PATCH  | `/call-requests/:id`   | Admin | Edit a call request's description/quantity needed |
| GET    | `/call-requests/:id`   | Admin | See invite status + accept/decline/cancel tally |
| GET    | `/invites/me`          | Extra | View your invites                         |
| PATCH  | `/invites/:id`         | Extra | Accept, decline, or cancel (after accepting) an invite |
| GET    | `/invites/tally/me`    | Extra | View your own lifetime worked/declined/cancelled tally |
| GET    | `/invites/tally/:extraProfileId` | Admin | View an extra's tally + 3-strikes flag for your production |
| POST   | `/deletion-requests/me`          | Extra | Request your own account be deleted        |
| DELETE | `/deletion-requests/me`          | Extra | Cancel your own pending deletion request    |
| POST   | `/deletion-requests/:id`         | Admin | Initiate a deletion request for an extra    |
| GET    | `/deletion-requests`             | Admin | List all pending deletion requests          |
| PATCH  | `/deletion-requests/:id/approve` | Admin | Approve a request (soft-deletes the account)|
| PATCH  | `/deletion-requests/:id/deny`    | Admin | Deny a deletion request                     |
| GET    | `/locations`                  | Admin | Your production's saved meeting points |
| POST   | `/locations`                  | Admin | Save a meeting point for next time |
| POST   | `/call-requests/:id/copy`     | Admin | Copy a call request to other upcoming shoot days |
| GET    | `/geocode/reverse`            | Admin | Turn a map pin into an address (server-side Google key) |
| GET    | `/places/autocomplete`        | Admin | Place suggestions as you type (server-side Google key) |
| GET    | `/places/details/:placeId`    | Admin | Exact location + address for a chosen place |

## Data model

- `productions` — e.g. "Wednesday season 3"; everything an admin sees is scoped to one
- `users` — accounts, either ADMIN (coordinator, belongs to one production) or EXTRA;
  tracks an optional pending deletion request (self- or admin-initiated) and a
  soft-delete flag once one is approved
- `extra_profiles` — age, gender, height, skills, languages, phone/contact email,
  availability, photos; linked to one or more productions
- `locations` — a production's saved meeting points (name, address, optional map pin)
- `shoot_days` — a production's shoot day: call date/time, optional estimated wrap time,
  and meeting point (name, address, optional map pin)
- `call_requests` — a need for a shoot day, with matching criteria (age
  range, gender, skills) and quantity needed
- `call_invites` — the link between a call request and a matched extra,
  tracking pending/accepted/declined/cancelled/expired status

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
- [ ] Part 3 — Date of birth (replaces age)
- [ ] Part 4 — New profile fields (smartphone, encrypted bank details)
- [ ] Part 5 — Fresh seed data (25 extras with photos)
- [ ] Part 6 — Name search
- [ ] Part 7 — Excel export
- [ ] Part 8 — Email setup + forgot password
- [ ] Part 9 — Email invites + email notifications for extras without a smartphone
- [ ] Part 10 — Code reorganisation (hooks/navigation, API layer, shared theme + components)
- [ ] Part 11 — Screenshots of all screens and workflows

## License

MIT

## Stretch goals

- **Admin-created profiles for extras without smartphones** — some extras (e.g. older
  participants without a smartphone) can't self-register or use the app. A coordinator
  could create a profile on their behalf (name, phone, age, skills) so they're still
  included in matching.
- **SMS fallback** — for profiles without app access, send an SMS (via Twilio) instead
  of a push notification when matched, with a simple YES/NO reply to accept/decline.
