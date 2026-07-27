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

🚧 Week 1 of 8 — backend schema and core API scaffolded.

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

## Roadmap

- [x] Week 1 — Backend foundation: schema, migrations, health check
- [x] Week 2 — Auth: register/login, JWT, role middleware
- [x] Week 3 — Core API: profiles, call requests, matching logic
- [ ] Week 4 — React Native scaffolding, wired to this API
- [ ] Week 5 — Extra-side UI: profile + invite list
- [ ] Week 6 — Coordinator UI + Firebase push notifications
- [ ] Week 7 — Live accept/decline dashboard, edge cases
- [ ] Week 8 — Polish, seed data, deploy, demo GIF

## License

MIT
