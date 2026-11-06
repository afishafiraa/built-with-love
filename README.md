# Digital Wedding Invitation

A customizable wedding invitation built with React and Vite. Vercel Functions provide the API and admin sessions; Supabase PostgreSQL and Storage hold invitation data and media. Guests use unique links, while organizers manage content in Studio and guest responses in Dashboard.

## Features

- **Guest invitation:** envelope cover, animated garden scene, Indonesian and English content, music, couple profiles, schedule and map, story, RSVP, wishes, digital gift details, and a QR code for attending guests. There is no gallery or in-app payment flow.
- **Event-day card:** appears on the event date in the `Asia/Jakarta` time zone. It shows the schedule, venue, QR code, and optional parking and contact details. Studio can preview this card before the event.
- **Studio (`/studio`):** edit bilingual copy, times, venue, photos, ornaments, music, and event details; preview a draft before publishing. Drafts are stored in the admin browser. Publication history, field comparison, and version restore require the latest database migration.
- **Dashboard (`/dashboard`):** manage guests, RSVPs, personal links and QR codes, a manual WhatsApp queue, wishes, attendance summaries, and CSV exports. The app does not send WhatsApp messages automatically.
- **Check-in (`/checkin`):** scan a QR code with the camera, upload a QR image, or open a guest code for confirmation. Check-in requires an admin session.

Cross-device RSVP status, the event-day card, and Studio publication history are implemented in this repository. **Apply the latest database migration before deploying code that uses these features.** The VPS email monitor is also implemented, but must be configured and scheduled separately.

## Run locally

Requirements: Node.js 22+, npm, a Supabase project with the application schema, and the Vercel CLI for full-stack development (`npx vercel dev`).

```bash
cp .env.example .env
npm install
npm run dev:full
```

Fill in the server credentials in `.env` before running the full stack. Use `npm run dev` only for a visual demo with `VITE_DEMO_MODE=true`; demo changes are not saved to Supabase. Open `/?preview=1` to view the Studio draft in the same browser. For local visual overrides, copy `src/config/invitation.local.example.ts` to `src/config/invitation.local.ts`; Git ignores the copied file.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL; server only |
| `SUPABASE_SECRET_KEY` | Supabase secret key; server only |
| `ADMIN_PASSWORD_HASH` | Password hash for Studio, Dashboard, and check-in |
| `SESSION_SECRET` | Admin session secret; at least 32 random characters |
| `CRON_SECRET` | Vercel Cron secret in production; at least 32 random characters |
| `KEEPALIVE_SECRET` | Optional separate token for a VPS monitor |
| `VITE_DEMO_MODE` | Set to `true` only for a local visual demo; disable in production |

Run `npm run security:generate` for example secrets or `npm run security:set-password` to hash a chosen admin password. Never place a plaintext password or server secret in source code, a URL, or a `VITE_` variable. Changes to Vercel environment variables require a new deployment.

## Database and deployment

Apply the migrations in `supabase/migrations/` in order:

1. [`202609160001_initial_schema.sql`](supabase/migrations/202609160001_initial_schema.sql): tables, base RPCs, RLS, and image storage.
2. [`202609160002_audio_storage.sql`](supabase/migrations/202609160002_audio_storage.sql): audio storage.
3. [`202611060001_rsvp_and_config_history.sql`](supabase/migrations/202611060001_rsvp_and_config_history.sql): RSVP bootstrap data and Studio publication history. **Apply this before deploying a version that uses these features.**

Before a release using the third migration, save a copy of the published Studio configuration, apply the migration, run `npm run preflight`, and deploy the frontend and API from the same commit. Then test a valid guest link, RSVP across two devices, the event-day preview, Studio history, wishes, QR check-in, and WhatsApp message content against the published schedule. Rolling back a Vercel deployment does not roll back Supabase migrations or data.

## Supabase availability

[`vercel.json`](vercel.json) schedules `GET /api/keep-alive` daily at `03:17 UTC` (`10:17 WIB`). The endpoint validates the bearer `CRON_SECRET` before reading the published Supabase configuration. This creates database activity but does not guarantee that a Free project will remain active.

An optional VPS monitor is provided in [`scripts/monitor-availability.mjs`](scripts/monitor-availability.mjs). Copy [`.env.monitor.example`](.env.monitor.example) to `.env.monitor` **on the VPS only**. Set the site URL, the same `KEEPALIVE_SECRET` used in Vercel, email addresses, and SMTP credentials; never commit real values. Run `npm run monitor:test-email` and `npm run monitor:check`, then schedule `monitor:check` with VPS cron. The monitor emails on failure, recovery, and periodic reminders while a failure continues. This repository does not install the VPS cron job or configure SMTP for you.

## Routes and security

| Route | Purpose |
| --- | --- |
| `/?to=slug-token8digit` | Guest invitation; the server verifies the slug and token together |
| `/?preview=1` | Studio draft preview in the same browser |
| `/studio` | Invitation editing and publishing |
| `/dashboard` | Guest and response management |
| `/checkin` | QR scanning and attendance confirmation |

The browser uses same-origin `/api/auth`, `/api/public`, and `/api/admin` endpoints. The Supabase secret key stays on the server. Admin operations use session cookies, CSRF protection, and origin checks. Invitation links and QR codes contain guest-specific access data, so share them only with the intended guests or event staff.

## Checks

```bash
npm run check:database
npm run preflight
```

`check:database` requires `.env` and a test guest record. `preflight` runs linting, server type checking, API contract checks, monitor policy tests, a build, and a credential leak check. Application code is in `src/`, Vercel Functions are in `api/`, server-side database access is in `server/`, and migrations are in `supabase/migrations/`.
