# Cloworks

Internal web app for the Clogent creative team. Requesters (for example social media specialists) submit design,
video and social-content requests; a lead assigns them; designers move them through a fixed workflow; and the
dashboard measures each person's completed tasks against a monthly target.

Features: request intake, list and board views (drag and drop), request detail with
comments, @mentions and link attachments, email notifications, projects with a timeline, a KPI dashboard
(self and team), an admin area (people, access, brands, divisions, request types), and a CSV importer for the legacy
Google Sheets.

**New request.** The form asks for title, brief link, notes, brand, division and an optional deadline, plus the radio
"Does this task need motion?" (No by default, or "Yes, needs motion"). There is no request-type field: new requests
silently use the type "General Design" (it must exist and be active, otherwise the form says so). A request that needs
motion is still ONE card, marked with a "Needs motion" badge (icon and text) on the board, in the table and on the
detail page, which also shows "Needs motion: Yes/No". Leads and admins can correct the mark later with the "Needs
motion" checkbox on the detail page. The Requests filter bar has a "Motion" select (Any, Needs motion, No motion; URL
`?motion=yes|no`) to find them. Imported historical rows are not marked. Counting the motion effort in KPIs is not built yet.

**Board and table.** On the board, grab a card anywhere and drop it on a column (press and hold on touch screens).
Keyboard and screen-reader users use the small drag handle on each card (Space or Enter to lift, Left/Right arrows to
change column, Space or Enter to drop, Escape to cancel). There is no "Move to…" menu on board cards; the request
detail page keeps one. Each column scrolls on its own and loads 25 cards at first: use "Show 25 more" (or "Open all in
table") for the rest, and the Done column lists the newest requests first. The table shows 50 rows per page.

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
| `EMAIL_FROM` | Sender, e.g. `Cloworks <noreply@yourdomain>`. Needed together with `RESEND_API_KEY`. | No |
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

The owner's master sheet is imported from its **Excel export**, which keeps the real link targets behind the
"Brief Link" / "Design Folder" / "Link Upload" chips and the real dates (no day/month guessing).

1. In Google Sheets choose **File > Download > Microsoft Excel (.xlsx)**. The workbook must contain the tabs
   `Request List All Clogent`, `SocMed Tracker` and `Dimas Tracker` (matched by name; other tabs are ignored).
2. Make sure the database knows the request type "Motion Support" and the roster. Both come from the idempotent seed,
   so for an existing database just re-run it (it never overwrites admin edits):
   ```bash
   npm run db:seed
   ```
3. Dry-run first (reads only, writes nothing):
   ```bash
   npm run import:sheet -- path/to/master.xlsx
   ```
   Check the report per source: rows read / importable / skipped (with reasons), warnings, links found, unmapped names
   (with counts), months distribution, and the first 3 parsed rows with `raw -> ISO` dates.
4. When the report looks right, run the same command with `--apply`:
   ```bash
   npm run import:sheet -- path/to/master.xlsx --apply
   ```

What to know:

- **Links are preserved.** Chip targets become the request's brief link, design folder and (SocMed) published link.
  The visible chip label is kept in the notes (`Brief: ...`, `Folder: ...`). Only http(s) targets are kept.
- **Dimas Tracker** is a log of video-edit files. Each row becomes its **own** task of type "Motion Support" assigned to
  Dimas Pandu (status Done, division Social Media), never merged into another request, even when other designers or
  social-media staff worked on the same content. The requester is read from the first word of the file name (split on
  spaces, `_`, `-` or `.`): it must equal a roster short name, full name or alias exactly (FAFA, SYAHDA, RIO ...);
  anything else (MOTION, RESIZE, ...) falls back to Wira and the task notes say so. The log has no brand, so the brand is inferred as the
  requester's most common brand in the other tabs (ties, none, or an unrecorded requester: Clogent) and noted on the task. The side table in
  columns H..N of that tab is ignored.
- **Workbook mode aborts** (dry-run too, nothing written) when the database lacks the brands Clogent / Bubble Wash,
  the division Social Media, the users Dimas Pandu / Wira, or the request types General Design / Social Media /
  Motion Support; the message lists what is missing (fix with `npm run db:seed`).
- **Requester nicknames are kept in notes.** A requester that is not in the roster (for example Yoel, Iyok, Ibnu) is not
  guessed: the request is imported under Wira and the notes say `Requester (as typed): <name>`. They are also listed
  in the report under "unmapped names".
- **Re-importing a newer export syncs changes.** Rows already imported are updated from the sheet: status only moves
  forward (never back, never out of Cancelled), the designer is filled only when nobody is assigned in the app, and
  links, deadline, output count, Include KPI and the SocMed flags/platform/published link take the sheet's value when
  it has one. Notes, title, requester, brand and division are never changed. The dry-run lists every update first.
  For production, run `bash scripts/sync-sheet-prod.local.sh "<workbook>.xlsx"` (dry-run, then asks before writing).
- **Re-running is safe.** Already imported rows are detected by an import key and not inserted again; Dimas rows with the same file
  name and date get a counter. Caveat: correcting a requester name in the sheet after import and re-running creates a
  duplicate of that row. Run `npm run db:seed` first so names and aliases (for example Irshyad to Irsyad) resolve.
- **Legacy CSV mode** still exists (`npm run import:sheet -- requests.csv [socmed.csv] [--apply]`, requests file first),
  but a CSV only carries the label text of chips, so link targets are lost and there is no Dimas Tracker. Prefer the .xlsx.

## Design system

- **Tokens** live in `src/app/globals.css`: light under `:root` (the default, independent of the OS) and dark under
  `:root[data-theme="dark"]`. Use the Tailwind theme classes (`bg-card`, `bg-surface-muted`, `text-foreground-secondary`,
  `border-border`, `bg-primary`, `bg-sidebar`, ...) or `var(--token)`; never hex values in components.
- **Status, tag and avatar colours** come from `src/lib/palette.ts` and are mirrored by hand as `--status-<tone>-*` and
  `--avatar-<n>-*` in `globals.css`; `tests/palette.test.ts` fails if they drift, `tests/theme.test.ts` checks every
  text/background pair for WCAG contrast in both themes.
- **Theme switch**: Light / Dark / System in the sidebar footer, stored in `localStorage` key `ct-theme` (default light).
  A blocking inline script in `src/app/layout.tsx` (`THEME_INIT_SCRIPT`, `src/lib/theme.ts`) sets `<html data-theme>`
  to `light` or `dark` before first paint; the collapsed sidebar (`ct-sidebar`) is restored the same way.
- **Shell**: `src/components/AppShell.tsx` (server: permission checks) + `src/components/shell/*` (client: active
  route, collapse, mobile drawer).
- **UI kit**: `src/components/ui/` (Button, Chip, StatusChip, Avatar, PageHeader, fields, RadioCards, ProgressBar,
  KpiTile, EmptyState, Alert, table helpers, ...). Read `src/components/ui/README.md` before building a page.

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
