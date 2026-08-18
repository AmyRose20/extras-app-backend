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

## Status
✅ Phase 1 complete — all core functionality built and working end-to-end (auth, matching,
push notifications, live status dashboard, edge case handling, seed data).

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

🔜 Phase 2 (not started) — polished UI/UX pass. Phase 1 intentionally prioritized
functionality over visual design; screens are currently plain/unstyled React Native defaults.

## Getting started

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your local PostgreSQL
   connection string:
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

| Method | Route                  | Who   | Description                              |
|--------|-------------------------|-------|-------------------------------------------|
| POST   | `/auth/register`       | Any   | Create an account (ADMIN or EXTRA)        |
| POST   | `/auth/login`          | Any   | Log in, get a JWT                         |
| GET    | `/profiles/me`         | Extra | View your own profile                     |
| PATCH  | `/profiles/me`         | Extra | Update your own profile                   |
| POST   | `/call-requests`       | Admin | Create a call, auto-matches eligible extras |
| GET    | `/call-requests/:id`   | Admin | See invite status + accept/decline tally  |
| GET    | `/invites/me`          | Extra | View your invites                         |
| PATCH  | `/invites/:id`         | Extra | Accept or decline an invite               |

## Data model

- `users` — accounts, either ADMIN (coordinator) or EXTRA
- `extra_profiles` — age, gender, height, skills, availability, photo
- `shoot_days` — a production's shoot day (date, location)
- `call_requests` — a need for a shoot day, with matching criteria (age
  range, gender, skills) and quantity needed
- `call_invites` — the link between a call request and a matched extra,
  tracking accepted/declined/pending status

See `prisma/schema.prisma` for the full schema.

## Roadmap — Phase 1 (functionality)

- [x] Part 1 — Backend foundation: schema, migrations, health check
- [x] Part 2 — Auth: register/login, JWT, role middleware
- [x] Part 3 — Core API: profiles, call requests, matching logic
- [x] Part 4 — React Native scaffolding, wired to this API
- [x] Part 5 — Extra-side UI: profile + invite list
- [x] Part 6 — Coordinator UI + Firebase push notifications
- [x] Part 7 — Live accept/decline dashboard, edge cases
- [x] Part 8 — Polish, seed data, deploy, demo GIF

**Phase 2 (planned):** polished UI/UX — custom styling, animations, proper design system.
Not yet started; Phase 1 focused entirely on getting every feature working correctly first.

## License

MIT

## Stretch goals

- **Admin-created profiles for extras without smartphones** — some extras (e.g. older
  participants without a smartphone) can't self-register or use the app. A coordinator
  could create a profile on their behalf (name, phone, age, skills) so they're still
  included in matching.
- **SMS fallback** — for profiles without app access, send an SMS (via Twilio) instead
  of a push notification when matched, with a simple YES/NO reply to accept/decline.
- **Manual invite status** — allow an admin to manually mark an invite as
  accepted/declined on someone's behalf, for cases where they were contacted by phone
  the traditional way.
