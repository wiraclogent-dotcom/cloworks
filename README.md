# Creative Request Tracker

Internal web app for the Clogent creative team. Requesters (for example social media specialists) submit design,
video and social-content requests; a lead assigns them; designers move them through a fixed workflow; and the
dashboard measures each person's completed tasks against a monthly target.

Features: request intake with per-type custom fields, list and board views (drag and drop), request detail with
comments, @mentions and link attachments, email notifications, projects with a timeline, a KPI dashboard
(self and team), an admin area (people, access, brands, divisions, request types), and a CSV importer for the legacy
Google Sheets.

## Stack

Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4, Auth.js v5 (JWT sessions; Google and
Microsoft Entra ID), Prisma 6 with PostgreSQL, Zod, Recharts, dnd-kit, Vitest with an embedded Postgres for tests.

## Prerequisites

- Node.js 22+ (developed on 24.21.0)
- npm
- No Docker or system Postgres needed for local work: `npm run db:dev` starts an embedded Postgres.

## Local setup

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then edit; see the table below
npm run db:dev                   # terminal 1: embedded Postgres on :54329, data in .pgdata/ (leave running)
npx prisma migrate deploy        # terminal 2: apply migrations
npm run db:seed                  # roster, brands, divisions, request types (idempotent)
npm run dev                      # http://localhost:3000
```

Set a real `AUTH_SECRET` first (`openssl rand -base64 32`). Google and Entra sign-in need real OAuth credentials;
to look around without them, see [Manual QA without OAuth](#manual-qa-without-oauth).

`npm run db:migrate` (`prisma migrate dev`) is for creating new migrations while developing the schema.

## Environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. `npm run db:dev` prints a ready-made one. | Yes |
| `AUTH_SECRET` | Signs and encrypts session cookies. Generate with `openssl rand -base64 32`. | Yes |
| `AUTH_URL` | Public base URL of the app (`http://localhost:3000` locally). | Yes in production; locally also used by `dev:session` |
| `ALLOWED_EMAIL_DOMAIN` | Company email domain that may sign in automatically. Defaults to `clogent.co.id`. | No |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client for sign-in. | Yes, to use Google sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Microsoft Entra app registration. | Yes, to use Microsoft sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0`. | Yes, to use Microsoft sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Your tenant id. Entra sign-in is denied unless the token's `tid` equals it. | Yes, to use Microsoft sign-in |
| `RESEND_API_KEY` | Resend API key for notification emails. Empty means no email is sent (notification rows are still stored). | No |
| `EMAIL_FROM` | Sender, e.g. `Creative Tracker <noreply@yourdomain>`. Needed together with `RESEND_API_KEY`. | No |
| `APP_BASE_URL` | Base URL used for links in emails. | No (recommended when email is on) |

Never commit `.env`; `.gitignore` already excludes it.

## First login and access

- After seeding, only **Wira** (Creative Director, `wira.budi@clogent.co.id`, role ADMIN) can sign in. Every other
  seeded person has no login email yet.
- As admin, open **Admin > Users**. Add each person's login email on their row, and add Gmail (or any non-company)
  addresses under **Allowed emails**; those can sign in through Google.
- Emails on the company domain (`ALLOWED_EMAIL_DOMAIN`) sign in automatically. A first sign-in is linked to an
  existing person only by exact email match; an unknown company-domain email creates a new REQUESTER.
- Microsoft Entra sign-in is for company-domain emails only (the allow-list applies to Google) and requires
  `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`.
- Sessions last 24 hours. Deactivating a person, clearing or changing their login email, or removing their access
  takes effect on their next request.

## Roles and permissions

| Action | Requester | Creative | Lead | Admin |
| --- | :-: | :-: | :-: | :-: |
| Create requests, view own dashboard | yes | yes | yes | yes |
| Change request status (transition) | | yes | yes | yes |
| Manage projects | | yes | yes | yes |
| Assign requests | | | yes | yes |
| Team dashboard and set KPI targets | | | yes | yes |
| Admin area (people, access, lists) | | | | yes |

Roles are the app role (REQUESTER, CREATIVE, LEAD, ADMIN, enforced in `src/lib/permissions.ts`). The separate
**job role** (DESIGNER, SOCIAL_MEDIA, OTHER) only decides how KPIs are counted. Requesters cannot be assigned work.

Workflow: Requested, On progress, First look, Done (and Cancelled from any open state). First look can go back to On
progress (a revision round), and Done can be reopened to On progress. Moving to Done needs an assignee and records
the output count and a design folder link.

## KPI definitions

- **Tasks done** is the headline number, shown against that person's **monthly target** (`progress = done / target`).
  Targets are set per person, per month and per role basis by a lead or admin on the team dashboard.
- Months are **Asia/Jakarta** calendar months (UTC+7), taken from the request's *requested* date.
- **Role basis:** DESIGNER counts requests assigned to the person; SOCIAL_MEDIA counts requests the person
  requested; OTHER counts nothing. If a target exists, its role decides the basis.
- A request counts when it is in that month, has `includeKpi` on, is not cancelled, and its current status is Done.
  Reopening a Done request removes it until it is Done again.
- Secondary metrics: total outputs, revision rounds (First look back to On progress), active workload (open assigned
  requests of any month, designers only), on-time rate (completed on or before the deadline date) and average
  turnaround in working days (Mon-Fri).
- **Imported data caveat:** the sheets contain no completion dates, so imported Done events are placed at the
  deadline. On-time rate and turnaround for imported months are not meaningful; tasks done is unaffected.

## Importing the Google Sheets

1. In Google Sheets export each tab as CSV (File > Download > CSV): the **Request List** tab and the
   **SocMed Tracker** tab.
2. Dry-run first (reads only, writes nothing, prints counts, skips, warnings, unmapped names and months):
   ```bash
   npm run import:sheet -- path/to/requests.csv path/to/socmed.csv
   ```
   The requests file is required and must come first; the socmed file is optional. Header checks reject swapped
   files or missing required columns before anything is written.
3. When the report looks right, run the same command with `--apply`:
   ```bash
   npm run import:sheet -- path/to/requests.csv path/to/socmed.csv --apply
   ```
Re-running is idempotent: already imported rows are detected by an import key and skipped. Caveat: correcting a
requester name in the sheet after import and re-running creates a duplicate of that row. Run `npm run db:seed` first
so names and aliases (for example Irshyad to Irsyad) resolve.

## Running tests

```bash
npm test            # Vitest, whole suite
npx tsc --noEmit    # type check
npm run build       # production build
```

Database tests start a throwaway embedded Postgres per test file and apply the real migrations, so no Docker or
local Postgres is required. `tests/lifecycle.test.ts` exercises the whole flow (submit, assign, work, done,
notifications, KPI, permission denials) through the real code paths with the seeded roster.

## Manual QA without OAuth

For local browser testing only. With the app and database running and `AUTH_URL` pointing at localhost:

```bash
npm run dev:session -- wira.budi@clogent.co.id
```

It prints a session cookie name and value for an existing, active user (the user must have a login email; Wira does
after seeding). In the browser open `http://localhost:3000`, DevTools > Application > Cookies, add that cookie with
Path `/`, and reload. The cookie lasts 24 hours.

Safety: the script refuses to run unless `AUTH_URL` (or `APP_BASE_URL`) is localhost, 127.0.0.1 or `[::1]`,
`NODE_ENV` is not `production`, `AUTH_SECRET` is set (at least 16 characters, not the `.env.example` placeholder), and `DATABASE_URL` points at localhost, 127.0.0.1 or `[::1]`. It never prints
`AUTH_SECRET` or `DATABASE_URL`. Treat the printed value as a password.

## Deployment notes

- Provide a PostgreSQL database and set the environment variables above (at minimum `DATABASE_URL`, `AUTH_SECRET`,
  `AUTH_URL`, the OAuth variables you use, and `ALLOWED_EMAIL_DOMAIN` if it is not `clogent.co.id`).
- Build and start: `npm ci`, `npx prisma migrate deploy`, `npm run build`, `npm start`.
- Seed once (`npm run db:seed`) so Wira can sign in; add everyone else through Admin > Users.
- Register the OAuth redirect URIs for your public URL (`/api/auth/callback/google` and
  `/api/auth/callback/microsoft-entra-id`).
- Resend is optional: without `RESEND_API_KEY` and `EMAIL_FROM` no emails are sent. Notification rows are always stored in the database for a future inbox.
- Do not run `dev:session` against a deployed environment (it refuses non-localhost anyway).

## Known limitations

- Attachments and design folders are **links**, not file uploads.
- Notifications are **email only** in V1: there is no in-app inbox or bell yet. Notification rows are stored so an inbox
  can be added later, and emails are sent only when `RESEND_API_KEY` and `EMAIL_FROM` are configured. No chat integrations.
- There is no automated browser end-to-end suite; the lifecycle is covered by a database-backed integration test and
  UI parts by component tests. Browser flows (sign-in, drag and drop persistence) are checked manually.
- Imported history has synthetic completion dates (see KPI caveat).
