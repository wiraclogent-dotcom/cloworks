# Clowork

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

Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4, Auth.js v5 (JWT sessions; email and
password, Google, Microsoft Entra ID), Prisma 6 with PostgreSQL, shadcn/ui, Zod, Recharts, dnd-kit, Vitest with an
embedded Postgres for tests, and the `e2e` runner for browser tests.

## Prerequisites

### Required

- **Node.js 22+** (developed on 24.21.0) with the npm it ships with.
- **Git.**
- **openssl** to generate `AUTH_SECRET` (preinstalled on macOS and Linux).
- No Docker or system Postgres: `npm run db:dev` starts an embedded Postgres, and the tests start their own.

Everything else (Next.js, Prisma, Vitest, the e2e runner, shadcn) is an npm dependency installed by `npm install`.

### Optional tools

| Tool | Needed for |
| --- | --- |
| [GitHub CLI](https://cli.github.com) (`gh`) | Opening and merging pull requests from the terminal. |
| [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`) | Production deploys (see [Deployment notes](#deployment-notes)). |
| VS Code extensions: ESLint, Tailwind CSS IntelliSense, Prisma | Lint errors, class name completion and schema highlighting in the editor. |
| [Claude Code](https://claude.com/claude-code) | Optional AI assistant. See [Working with Claude Code](#working-with-claude-code). |

### Accounts and services

None of these are needed to run the app locally. Production uses them; ask the maintainer for access.

| Service | Used for | Without it |
| --- | --- | --- |
| Vercel | Hosting (functions pinned to `sin1` in `vercel.json`). | Run anywhere Node and Postgres run. |
| Neon Postgres (via the Vercel Marketplace) | Production database. | Any PostgreSQL works. |
| Resend (sending domain verified) | Sign-up codes, invites and notification emails. | No email is sent; in-app notifications still work. |
| Cloudinary | Media uploads in Content Plan. | Uploads are disabled. |
| Google OAuth client | "Continue with Google". | Email and password sign-in only. |
| Microsoft Entra app registration | Microsoft sign-in (not set up in production yet). | Microsoft sign-in stays off. |
| Anthropic API key | AI-driven e2e tests (`npm run test:e2e:agent`) only. | Those tests are skipped. |

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

To sign in with a password locally, give the seeded admin one: `npm run set-password -- wira.budi@clogent.co.id`.

## Repository layout

| Path | What lives there |
| --- | --- |
| `src/app/` | Next.js routes. `(app)/` holds the signed-in pages (requests, projects, dashboard, content, library, chat, admin, settings, help). |
| `src/components/shadcn/` | shadcn/ui components restyled with our tokens. Use these first. |
| `src/components/ui/` | Our kit components for what shadcn lacks. Read its `README.md` before building UI. |
| `src/components/<feature>/` | Feature components (board, briefs, kpi, content, chat, notifications, ...). |
| `src/lib/` | Server logic: auth, permissions, queries, server actions, KPI maths, email. |
| `src/proxy.ts` | Request proxy (Next.js 16's replacement for `middleware.ts`). |
| `prisma/` | `schema.prisma`, migrations and the idempotent seed. |
| `content/help/` | Help center articles (Markdown), shown at `/help`. |
| `tests/` | Vitest unit and database tests; `tests/e2e/` holds the browser tests. |
| `scripts/` | Scripts behind the `npm run` commands (embedded Postgres, imports, seeding, set-password). |
| `AGENTS.md` | Notes for AI coding assistants. `next dev` rewrites its first block; keep it committed. |

## Branches and local-only files

- **`main`** is the only long-lived branch and the GitHub default. Work on a `feat/...` or `fix/...` branch, merge it
  into `main` through a pull request, then delete the branch.
- Run `npm run build` before pushing changes to routes: `cacheComponents` is on (`next.config.ts`), and its prerender
  errors only show up in a production build, not in `next dev` or the tests.
- These stay on each developer's machine and are listed in `.gitignore`:

  | Path | What it is |
  | --- | --- |
  | `.env` | Your secrets. Start from `.env.example`. |
  | `.pgdata/` | Data of the embedded dev database. |
  | `data/` | Business data exports (sheets). Never commit them. |
  | `*.local.*` | Personal helper scripts, for example the maintainer's production deploy and sync scripts. Ask the maintainer if you need one. |
  | `.e2e/` output | Results, logs and videos of e2e runs. |
  | `.claude/`, `docs/superpowers/`, `.archify/` | Working files of AI tools (Claude Code settings, plans and specs, diagrams). |

## Environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. `npm run db:dev` prints a ready-made one. | Yes |
| `AUTH_SECRET` | Signs and encrypts session cookies. Generate with `openssl rand -base64 32`. | Yes |
| `AUTH_URL` | Public base URL of the app (`http://localhost:3000` locally). | Yes in production; locally also used by `dev:session` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client for sign-in. | Yes, to use Google sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Microsoft Entra app registration. | Yes, to use Microsoft sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0`. | Yes, to use Microsoft sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Your tenant id. Entra sign-in is denied unless the token's `tid` equals it. | Yes, to use Microsoft sign-in |
| `RESEND_API_KEY` | Resend API key for emails (sign-up codes, invites, notifications). Empty means no email is sent (notification rows are still stored). | Yes in production (sign-up codes and invites need it) |
| `EMAIL_FROM` | Sender, e.g. `Clowork <noreply@yourdomain>`. Needed together with `RESEND_API_KEY`. | Yes in production |
| `APP_BASE_URL` | Public origin used for links in emails, e.g. `https://clowork.my.id`. In production, emails carry no links without it (request headers are never trusted for this). | Yes in production |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary account for Content Plan media uploads (values are on the Cloudinary dashboard). Empty disables uploads. | No |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails of the people who run Clowork: they see the waitlist in Admin and get an email per sign-up. Empty means nobody. | No |

Only for the e2e tests:

| Variable | Purpose |
| --- | --- |
| `LOCAL_QA_EMAIL`, `LOCAL_QA_PASSWORD` | A local account the e2e tests sign in with (localhost only, never sent to a deployed site). |
| `ANTHROPIC_API_KEY` | Model for the AI-driven steps in `tests/e2e/agent`. |
| `APP_URL` | Target URL; defaults to `http://localhost:3000`. `scripts/e2e-preview.sh` sets it for a Vercel preview. |

Never commit `.env`; `.gitignore` already excludes it.

## Signing in and joining

- After seeding, only **Wira** (Creative Director, `wira.budi@clogent.co.id`, role ADMIN) can sign in. Every other
  seeded person has no login email yet.
- Any active person with a login email can sign in (password, Google or Microsoft), whatever the email domain. A
  first OAuth sign-in is linked to an existing person only by exact email match.
- **Sign-up.** Anyone can create an account at `/signup` (name, email, password, or Google). A password sign-up
  confirms the email with a 6-digit code (`/verify`, 15 minutes, 5 tries, resend after 60 s, at most 5 an hour). An
  account on its own is an *applicant*: it reaches only `/lobby`, `/verify` and the join pages, never workspace data.
  Nobody becomes a member without an invite or an admin's approval.
- **Ways in** (admins manage all of them under Account settings → Users, the **Members** page):
  - **Email invite** (**Invited** tab → Invite someone: email, app role, job role). The email links to
    `/join/invite/<token>`, valid 7 days; the person sets a password or uses Google and is a member at once.
    Resend issues a new link; Revoke kills it.
  - **Invite link** (`/join/<code>`, the **Invite link** card: Copy, **Link is on** switch, **Reset link**). Joining
    through it creates a join request.
  - **Company email.** A verified sign-up whose domain is a workspace's `emailDomain` (`clogent.co.id` for Clogent)
    creates a join request automatically, unless that email already has an open invite (then they use the invite).
  - Without either, the lobby asks them for an invite link.
- **Join requests** (**Requests** tab, with a count). Admins get a bell notification and email per request. Approve
  (choose app and job role) turns the applicant into a member with the same id and password, emails them, and closes
  any open invite for that email; a waiting lobby moves them in by itself. Reject is silent and can be undone.
- Sessions: **Remember me** on the password forms (sign-in, sign-up, invite) keeps the session for 30 days; without
  it, and for Google/Microsoft, the session ends 24 hours after sign-in. Deactivating a person or clearing or changing
  their login email takes effect on their next request.
- Microsoft Entra sign-in requires `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`.

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
  For production the maintainer uses a local helper script (`scripts/sync-sheet-prod.local.sh`, not in the repo)
  that runs the same dry-run, then asks before writing.
- **Re-running is safe.** Already imported rows are detected by an import key and not inserted again; Dimas rows with the same file
  name and date get a counter. Caveat: correcting a requester name in the sheet after import and re-running creates a
  duplicate of that row. Run `npm run db:seed` first so names and aliases (for example Irshyad to Irsyad) resolve.
- **Legacy CSV mode** still exists (`npm run import:sheet -- requests.csv [socmed.csv] [--apply]`, requests file first),
  but a CSV only carries the label text of chips, so link targets are lost and there is no Dimas Tracker. Prefer the .xlsx.

## Design system

- **shadcn first.** Generic elements (buttons, fields, dialogs, menus, popovers, tabs, badges, cards, alerts…) come
  from shadcn/ui in `src/components/shadcn/` (add with `npx shadcn@latest add <name>`, then restyle with our tokens).
  `src/components/ui/` holds only what shadcn lacks (domain components such as `StatusChip`, `KpiTile`,
  `PageHeader`). Rules, component map and migration status: `src/components/ui/README.md`.
- **Tokens** live in `src/app/globals.css`: light under `:root` (the default, independent of the OS) and dark under
  `:root[data-theme="dark"]`. Use the shadcn token names first (`bg-background`, `bg-card`, `bg-muted`,
  `text-muted-foreground`, `border-border`, `border-input`, `bg-primary`, `bg-sidebar`, ...), our extension tokens
  (`text-heading`, `text-link`, `text-danger`, `shadow-card`, `data-tone`…) only where shadcn has no name, or
  `var(--token)`; never hex values in components.
- **Status, tag and avatar colours** come from `src/lib/palette.ts` and are mirrored by hand as `--status-<tone>-*` and
  `--avatar-<n>-*` in `globals.css`; `tests/palette.test.ts` fails if they drift, `tests/theme.test.ts` checks every
  text/background pair for WCAG contrast in both themes.
- **Theme switch**: Light / Dark / System in the sidebar footer, stored in `localStorage` key `ct-theme` (default light).
  A blocking inline script in `src/app/layout.tsx` (`THEME_INIT_SCRIPT`, `src/lib/theme.ts`) sets `<html data-theme>`
  to `light` or `dark` before first paint; the collapsed sidebar (`ct-sidebar`) is restored the same way.
- **Shell**: `src/components/AppShell.tsx` (server: permission checks) + `src/components/shell/*` (client: active
  route, collapse, mobile drawer).
- **Before building a page** read `src/components/ui/README.md`: shadcn component first, kit component second, a new
  documented kit component only when neither exists.

## Running tests

```bash
npm test            # Vitest, whole suite
npx tsc --noEmit    # type check
npm run build       # production build
```

Database tests start a throwaway embedded Postgres per test file and apply the real migrations, so no Docker or
local Postgres is required. `tests/lifecycle.test.ts` exercises the whole flow (submit, assign, work, done,
notifications, KPI, permission denials) through the real code paths with the seeded roster.

Browser tests (with `npm run db:dev` running and `LOCAL_QA_*` set in `.env`; the dev server starts by itself):

```bash
npm run test:e2e          # read-only smoke tests
npm run test:e2e:flows    # flows that write data (local database only)
npm run test:e2e:agent    # AI-driven checks, needs ANTHROPIC_API_KEY
bash scripts/e2e-preview.sh <preview-url>   # smoke tests against a Vercel preview
```

## Working with Claude Code

Claude Code is optional: nothing in the build, the tests or production depends on it, and no plugin has to be
installed. If you use it:

- It reads `AGENTS.md` automatically (Next.js 16 differs from older versions; UI follows the shadcn-first rule).
- Plugins and skills are installed per machine in Claude Code (`/plugin` in a `claude` terminal), not in this repo.
  The original work used general-purpose workflow plugins (for example `superpowers` for brainstorming, plans and
  code review); install them only if you want the same workflow.
- Their working files (plans, specs, reports) go to `docs/superpowers/`, which is ignored by git.

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
  `AUTH_URL`, and the OAuth variables you use).
- Build and start: `npm ci`, `npx prisma migrate deploy`, `npm run build`, `npm start`.
- Seed once (`npm run db:seed`) so Wira can sign in; invite everyone else (Account settings → Users → Invited), or
  share the invite link and approve the requests.
- Register the OAuth redirect URIs for your public URL (`/api/auth/callback/google` and
  `/api/auth/callback/microsoft-entra-id`).
- Resend is optional: without `RESEND_API_KEY` and `EMAIL_FROM` no emails are sent. Notification rows are always stored in the database for a future inbox.
- Do not run `dev:session` against a deployed environment (it refuses non-localhost anyway).

### Deploying the self sign-up release

This release retires the email allow-list (`AllowedEmail`): from now on **any active User can sign in**. Do these in
order:

1. **Before** `prisma migrate deploy`, list active users who could only get in through the allow-list domain rule
   until now, and deactivate (Admin → Members) anyone listed who should stay out:

   ```sql
   SELECT u.id, u.email FROM "User" u
   WHERE u.active AND u.email IS NOT NULL
     AND lower(split_part(u.email,'@',2)) <> 'clogent.co.id'
     AND NOT EXISTS (SELECT 1 FROM "AllowedEmail" a
                     WHERE a."workspaceId" = u."workspaceId" AND lower(a.email) = lower(u.email));
   ```

2. In production set `APP_BASE_URL` (e.g. `https://cloworks.vercel.app`; without it emails carry no links) and
   `RESEND_API_KEY` + `EMAIL_FROM` (without them no sign-up code or invite is ever sent).
3. Run `prisma migrate deploy` and deploy the new build **back-to-back**: the old build still queries `AllowedEmail`,
   which the migration drops.
4. After deploying, press **Reset link** once in Admin → Members (Invite link card). The initial join codes were
   generated in SQL from `md5(random())`, which isn't a secure random source.
5. Allow-list emails without an account were migrated to open invites (Requester / Other) under **Invited**, but no
   email was sent and their links can't be used: press **Resend** on each one you still want (adjust roles by
   inviting the same email again).

## Known limitations

- Request attachments and design folders are **links**, not file uploads. Only Content Plan uploads media
  (Cloudinary).
- Emails are sent only when `RESEND_API_KEY` and `EMAIL_FROM` are configured; without them notifications appear in
  the app only.
- Imported history has synthetic completion dates (see KPI caveat).
