# Creative Request Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app replacing the team's master spreadsheet: teams submit creative requests, the creative team tracks them on board/table views, projects are tracked on a timeline, and each person's monthly task KPI is computed from request data.

**Architecture:** Next.js App Router monolith. Prisma over Postgres. KPI numbers are pure functions over request fields and `StatusEvent` rows (no stored counters), so they are unit-testable with fixtures. Server actions enforce role permissions through one `can()` helper.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Prisma + Postgres, Auth.js (Google + Microsoft), dnd-kit, Recharts, Resend, zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-creative-request-tracker-design.md`

## Global Constraints

- Under 30 users, one company; login via Google or Microsoft only. Allowed if the email's domain equals `ALLOWED_EMAIL_DOMAIN` (default `clogent.co.id`) or the email is in the `AllowedEmail` table (admin-managed; needed because most creative staff use Gmail).
- Phase 1 covers only the Creative and Social Media teams plus their requesters; other employees are added later through the admin user page.
- App roles: `REQUESTER`, `CREATIVE`, `LEAD`, `ADMIN`. Job roles: `DESIGNER`, `SOCIAL_MEDIA`, `OTHER`.
- Request statuses: `REQUESTED`, `ON_PROGRESS`, `FIRST_LOOK`, `DONE`, `CANCELLED`. Project statuses: `NOT_STARTED`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `ON_HOLD`.
- Every request status change writes a `StatusEvent`.
- KPI counts tasks (one request = one task), not outputs. A task counts when `includeKpi` is true, status is not `CANCELLED`, and it reached `DONE`. Month = month of `requestedAt`. `kpiBasis` comes from the role on that month's `KpiTarget` row (fallback: the user's current `jobRole`): `DESIGNER` → assignee, `SOCIAL_MEDIA` → requester.
- Users have `active: Boolean`. Inactive users cannot sign in and are hidden from assignee pickers, but their requests and past-month KPI remain.
- Secondary KPI: on-time rate (done on/before deadline), avg turnaround (`requestedAt` → `DONE`, Mon-Fri working days), revision rounds (`FIRST_LOOK` → `ON_PROGRESS`), total `outputCount`, active workload.
- KPI is internal visibility: no dispute workflow, no weighting.
- Email-only notifications in V1.
- Brand: Deep Blue `#09426D`, Aqua `#11AA9F`, Space Grey `#CCCCCC`, White `#FFFFFF`; font Inter. Colors exist only as CSS variables / Tailwind theme tokens, never hard-coded in components. Small text on Aqua must use a darker tint to meet WCAG AA.
- Out of V1: approval gating, pin-comments, calendar view, Slack/WhatsApp, recurring requests, integrations, AI.

## Review Focus

1. Request with no deadline: on-time rate skips it (not late, no crash).
2. Request marked `DONE` with `includeKpi = false` or `CANCELLED`: excluded from tasks-done.
3. Request delivered, reopened, delivered again: counted once, latest `DONE` used.
4. Sheet name variants (`Irshyad`, `irsyad`, `Rifky`/`Rifqy`, `Rio` = Robertino): import maps by alias, case-insensitive, and reports unmapped names instead of silently dropping rows.
6. Resigned user (`Daus`): his past DONE requests still count in the months they belong to; he cannot sign in; he is absent from assignee pickers.
7. Person who changed role mid-year (`Rio`: Social Media target in 2026-09, none in 2026-10): September uses the target row's role, October falls back to the current job role.
5. Wrong-domain or differently-cased sign-in (`Wira@CLOGENT.co.id`): wrong domain rejected, casing accepted.

---

## File Structure

- `prisma/schema.prisma`: all models.
- `src/lib/kpi/` : `workingDays.ts`, `metrics.ts` (pure, no DB), `queries.ts` (DB loading).
- `src/lib/permissions.ts`, `src/lib/workflow.ts`, `src/lib/auth.ts`, `src/lib/notify.ts`, `src/lib/requests.ts`.
- `src/lib/import/` : `aliases.ts`, `parseRequests.ts` (CSV rows → request inputs).
- `src/app/requests/`, `src/app/projects/`, `src/app/dashboard/`, `src/app/admin/`.
- `scripts/import-sheet.ts`: CLI wrapper for the import.
- `tests/` mirrors `src/lib`; `e2e/` for Playwright.

---

### Task 1: Scaffold, schema, test tooling

**Files:**
- Create: Next.js app via `create-next-app` (TypeScript, Tailwind, App Router, `src/`), `prisma/schema.prisma`, `vitest.config.ts`, `.env.example`, `tests/schema.test.ts`, `src/lib/db.ts`

**Interfaces:**
- Produces: enums `AppRole`, `JobRole`, `RequestStatus`, `ProjectStatus`; models `User{id,email?,name,fullName,title?,department?,appRole,jobRole,aliases:String[],active:Boolean @default(true)}`, `AllowedEmail{email @unique,note?}`, `Brand{id,name}`, `Division{id,name}`, `RequestType{id,name,fieldSchema:Json,active}`, `Request{id,title,briefUrl?,notes?,brandId,divisionId,typeId,requesterId,assigneeId?,requestedAt,deadline?,status,outputCount:Int @default(1),includeKpi:Boolean @default(true),designFolderUrl?,fields:Json}`, `StatusEvent{id,requestId,from?,to,actorId,at}`, `Comment`, `Attachment`, `KpiTarget{id,userId,month:String,role:JobRole,targetTasks:Int,note?}` (unique on `userId+month`), `Notification`, `Project{id,title,subTitle?,brandId?,ownerId,status,startDate?,dueDate?,fileUrl?}`; `prisma` singleton from `src/lib/db.ts`.

- [ ] **Step 1: Scaffold the app and install Prisma, Vitest, shadcn/ui, zod.**
- [ ] **Step 2: Write failing test** `tests/schema.test.ts`: `RequestStatus` has exactly the 5 values, `ProjectStatus` the 5, `AppRole` the 4, `JobRole` the 3.
- [ ] **Step 3: Run `npx vitest run tests/schema.test.ts`; expect FAIL.**
- [ ] **Step 4: Write `schema.prisma`; run `npx prisma generate`; run test; expect PASS.** Run `npx prisma migrate dev --name init`.
- [ ] **Step 5: Add the theme in `src/app/globals.css` and `tailwind.config.ts`:** tokens `--brand-deep-blue`, `--brand-aqua`, `--brand-grey`, `--brand-white` with the hex values from Global Constraints, shadcn semantic tokens (`--primary` = Aqua, `--foreground` = Deep Blue, `--border` = Space Grey) and a dark-mode variant; load Inter with `next/font/google`.
- [ ] **Step 6: Write a test** `tests/theme.test.ts` asserting the four brand hex values in `globals.css` and that white-on-primary-button and Deep-Blue-on-white contrast ratios are at least 4.5:1 (use a small `contrastRatio(hexA, hexB)` helper in `src/lib/contrast.ts`); fix the button token if white on Aqua fails.
- [ ] **Step 7: Commit** `feat: scaffold app, schema and brand theme`.

### Task 2: KPI calculations (pure functions)

**Files:**
- Create: `src/lib/kpi/workingDays.ts`, `src/lib/kpi/metrics.ts`
- Test: `tests/kpi/workingDays.test.ts`, `tests/kpi/metrics.test.ts`

**Interfaces:**
- Produces:
  - `workingDaysBetween(start: Date, end: Date): number` (Mon-Fri fractional days; weekends add 0).
  - `type KpiRequest = { id: string; requesterId: string; assigneeId: string | null; requestedAt: Date; deadline: Date | null; status: RequestStatus; includeKpi: boolean; outputCount: number; events: { from: RequestStatus | null; to: RequestStatus; at: Date }[] }`
  - `type KpiResult = { tasksDone: number; target: number | null; progress: number | null; onTimeRate: number | null; avgTurnaroundDays: number | null; revisionRounds: number; totalOutputs: number; activeWorkload: number }`
  - `computeKpi(requests: KpiRequest[], user: { id: string; jobRole: JobRole }, month: string, target: { role: JobRole; targetTasks: number } | null): KpiResult` (`month` is `'YYYY-MM'`; basis role = `target.role` if a target exists, else `user.jobRole`; `progress = tasksDone / target.targetTasks`, `null` when no target).

- [ ] **Step 1: Write failing tests** for `workingDaysBetween`: Fri 09:00 → Mon 09:00 = 1; same day 09:00 → 15:00 = 0.25.
- [ ] **Step 2: Write failing tests** for `computeKpi`: designer with 3 DONE requests assigned in `2026-10` and target 50 gives `tasksDone=3`, `progress=0.06`; social media user counts requests where they are the requester, not the assignee; `outputCount` 1+4+2 gives `totalOutputs=7`; `FIRST_LOOK → ON_PROGRESS` once gives `revisionRounds=1`; request dated 30 Sep belongs to `2026-09` even if done on 1 Oct.
- [ ] **Step 3: Add tests for Review Focus 1-3 and 7:** a user whose target row says `SOCIAL_MEDIA` for 2026-09 is counted as requester that month, and as assignee in 2026-10 when there is no target and their current `jobRole` is `DESIGNER`; no-deadline excluded from `onTimeRate` (null if none have deadlines); `includeKpi=false` and `CANCELLED` excluded from `tasksDone`; DONE → ON_PROGRESS → DONE counts once and uses the latest DONE for turnaround; unassigned requests do not count for designers.
- [ ] **Step 4: Run `npx vitest run tests/kpi`; expect FAIL.**
- [ ] **Step 5: Implement both modules** as pure functions with no DB access; `onTimeRate` and `avgTurnaroundDays` return `null` when the denominator is 0.
- [ ] **Step 6: Run; expect PASS. Commit** `feat: KPI calculations`.

### Task 3: Auth, domain restriction, permissions

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- Test: `tests/auth.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Produces:
  - Sign-in callback also rejects users with `active = false`.
  - `isAllowedEmail(email: string, domain: string, allowList: string[]): boolean` (case-insensitive; true if the exact domain matches or the full email is in `allowList`; `a@evil.com.clogent.co.id`, `x@evil-clogent.co.id` and an unlisted `someone@gmail.com` are rejected; a listed `Fadli@gmail.com` is accepted).
  - `type Action = 'request.create' | 'request.assign' | 'request.transition' | 'dashboard.team' | 'dashboard.self' | 'project.manage' | 'admin.manage'`
  - `can(role: AppRole, action: Action): boolean`: `REQUESTER` only `request.create`; `CREATIVE` adds `request.transition`, `dashboard.self`, `project.manage`; `LEAD` adds `request.assign`, `dashboard.team`; `ADMIN` all.

- [ ] **Step 1: Write failing tests** for the examples above plus `can('REQUESTER','dashboard.team')` false.
- [ ] **Step 2: Run; expect FAIL. Implement helpers; configure Auth.js with Google + Microsoft,** `signIn` callback uses `isAllowedEmail`; first login links to an existing `User` by email or alias, else creates a `REQUESTER`; session carries `appRole`, `jobRole`.
- [ ] **Step 3: Middleware redirects unauthenticated users to sign-in.** Run tests; expect PASS. **Commit** `feat: auth and permissions`.

### Task 4: Workflow transitions and status logging

**Files:**
- Create: `src/lib/workflow.ts`, `src/app/requests/actions.ts` (`transitionRequest`)
- Test: `tests/workflow.test.ts`

**Interfaces:**
- Consumes: `can`, `prisma`.
- Produces:
  - `canTransition(from: RequestStatus, to: RequestStatus): boolean`. Allowed: `REQUESTED→ON_PROGRESS`, `ON_PROGRESS→FIRST_LOOK`, `FIRST_LOOK→DONE`, `FIRST_LOOK→ON_PROGRESS`, `DONE→ON_PROGRESS`, and any non-final status → `CANCELLED`. `CANCELLED` is final.
  - `transitionRequest(requestId: string, to: RequestStatus, opts?: { outputCount?: number; designFolderUrl?: string }): Promise<void>`: checks `can(role,'request.transition')` and `canTransition`; when `to = DONE` requires an assignee and accepts `outputCount`/`designFolderUrl`; updates status and inserts the `StatusEvent` in one transaction.

- [ ] **Step 1: Write failing tests** for `canTransition` (each allowed edge true; `REQUESTED→DONE` false; `CANCELLED→ON_PROGRESS` false) and for `transitionRequest` rejecting `DONE` on an unassigned request.
- [ ] **Step 2: Run; expect FAIL. Implement; run; expect PASS. Commit** `feat: workflow transitions`.

### Task 5: Intake form, brands, divisions, request types

**Files:**
- Create: `src/app/requests/new/page.tsx`, `src/app/requests/actions.ts` (`createRequest`), `prisma/seed.ts`
- Test: `tests/createRequest.test.ts`

**Interfaces:**
- Produces: `createRequest(input: { title: string; briefUrl?: string; notes?: string; brandId: string; divisionId: string; typeId: string; deadline: string | null; fields: Record<string, unknown> }): Promise<{ id: string }>`; zod-validated; sets `requestedAt = now`, `status = REQUESTED`, first `StatusEvent{from:null,to:REQUESTED}`.
- Seed: brands (Clogent, Bubble Wash), divisions (Creative, Digital Ads, Social Media, Ecommerce, Brand), request types (General Design, Social Media with `fieldSchema` for platform TikTok/Instagram, content type Campaign/Daily/Story/Urgent, shooting/editing/upload booleans, published link), and the Phase 1 roster from the spec's "Team roster" table (full name, title, short name, aliases, job role, app role) plus requesters Yosi and Rahmat; **Seeded access is minimal:** the only login-capable user is Wira (`wira.budi@clogent.co.id`, `ADMIN`). Everyone else is seeded as a roster record with no login email, and `AllowedEmail` starts empty. Wira later adds each person's Gmail through the admin page (not seeded, because several are not permanent staff), and can promote more admins.

- [ ] **Step 1: Write failing tests:** valid input creates one request with one `REQUESTED` event; empty title rejected; deadline earlier than `requestedAt` rejected.
- [ ] **Step 2: Run; expect FAIL. Implement; run; expect PASS.**
- [ ] **Step 3: Build the form page** rendering extra fields from `RequestType.fieldSchema`; attachments upload to storage and create `Attachment` rows.
- [ ] **Step 4: Commit** `feat: request intake`.

### Task 6: Board and table views

**Files:**
- Create: `src/app/requests/page.tsx`, `src/components/Board.tsx`, `src/components/RequestTable.tsx`, `src/lib/requests.ts`
- Test: `tests/requestsQuery.test.ts`

**Interfaces:**
- Produces: `listRequests(filter: { status?: RequestStatus; assigneeId?: string; brandId?: string; divisionId?: string; q?: string; mine?: { userId: string } }): Promise<RequestRow[]>`.

- [ ] **Step 1: Write failing tests** for each filter (text search on title/notes; `mine` = requester or assignee).
- [ ] **Step 2: Implement; run; expect PASS.**
- [ ] **Step 3: Board:** a column per status; dropping a card calls `transitionRequest` (dropping on `DONE` opens a small dialog for `outputCount` and `designFolderUrl`); invalid drop reverts with a toast. **Table:** sortable columns including days to deadline; filter bar. "My requests" is a saved filter.
- [ ] **Step 4: Commit** `feat: board and table views`.

### Task 7: Request detail, comments, attachments, assignment

**Files:**
- Create: `src/app/requests/[id]/page.tsx`, `src/app/requests/[id]/actions.ts` (`addComment`, `assignRequest`, `addAttachment`)
- Test: `tests/comments.test.ts`

**Interfaces:**
- Produces: `addComment(requestId: string, body: string): Promise<{ mentionedUserIds: string[] }>`; `assignRequest(requestId: string, assigneeId: string | null): Promise<void>` (requires `request.assign`).

- [ ] **Step 1: Write failing tests:** empty comment rejected; `@irsyad` resolves via alias to the user; a `CREATIVE` calling `assignRequest` is rejected.
- [ ] **Step 2: Implement; run; expect PASS.** Page shows details, status history, comments, files.
- [ ] **Step 3: Commit** `feat: request detail`.

### Task 8: Email notifications

**Files:**
- Create: `src/lib/notify.ts`
- Test: `tests/notify.test.ts`

**Interfaces:**
- Produces: `notify(userIds: string[], message: string, link: string): Promise<void>`: writes `Notification` rows and sends email via Resend; a send failure is logged and never thrown.
- Wire into: `assignRequest`, `addComment` (mentions, requester, assignee), `transitionRequest` (requester).

- [ ] **Step 1: Write failing test** (Resend mocked): assignment notifies the assignee only; send failure does not reject; the actor is not notified of their own action.
- [ ] **Step 2: Implement and wire in; run; expect PASS. Commit** `feat: notifications`.

### Task 9: KPI dashboard and targets

**Files:**
- Create: `src/app/dashboard/page.tsx`, `src/app/dashboard/team/page.tsx`, `src/lib/kpi/queries.ts`, `src/app/dashboard/targets/actions.ts`
- Test: `tests/kpi/queries.test.ts`

**Interfaces:**
- Consumes: `computeKpi`, `KpiRequest`.
- Produces: `loadKpiRequests(month: string): Promise<KpiRequest[]>`; `setTarget(userId: string, month: string, role: JobRole, targetTasks: number, note?: string): Promise<void>` (requires `dashboard.team`).

- [ ] **Step 1: Write failing test** against a test DB: seed requests and events, expect `loadKpiRequests('2026-10')` + `computeKpi` to match hand-calculated numbers (including the sheet's Fadli target of 50).
- [ ] **Step 2: Implement; run; expect PASS.**
- [ ] **Step 3: Pages.** Personal: tasks done vs target progress bar, secondary stat cards (on-time, turnaround, revisions, outputs, workload), month picker, trend chart across months. Team (`dashboard.team` only): one row per person with progress, plus a target editor. Others get 403.
- [ ] **Step 4: Commit** `feat: KPI dashboards`.

### Task 10: Projects module

**Files:**
- Create: `src/app/projects/page.tsx`, `src/app/projects/actions.ts`, `src/components/ProjectTimeline.tsx`
- Test: `tests/projects.test.ts`

**Interfaces:**
- Produces: `createProject(input: { title: string; subTitle?: string; brandId?: string; ownerId: string; status: ProjectStatus; startDate?: string; dueDate?: string; fileUrl?: string }): Promise<{ id: string }>`; `updateProject(id: string, patch: Partial<ProjectInput>): Promise<void>`; both require `project.manage`.

- [ ] **Step 1: Write failing tests:** due date before start date rejected; a `REQUESTER` is rejected; a project with no dates is allowed (as in the sheet).
- [ ] **Step 2: Implement; run; expect PASS.**
- [ ] **Step 3: Page:** table grouped by brand with status badge, plus a week-based timeline bar chart for projects that have both dates. **Commit** `feat: projects module`.

### Task 11: Spreadsheet import

**Files:**
- Create: `src/lib/import/aliases.ts`, `src/lib/import/parseRequests.ts`, `scripts/import-sheet.ts`
- Test: `tests/import/parseRequests.test.ts`

**Interfaces:**
- Produces:
  - `resolveUser(name: string, users: { id: string; name: string; aliases: string[] }[]): string | null` (case/space-insensitive match on name or alias).
  - `parseRequestRows(rows: Record<string, string>[], ctx: { users: ...; brands: ...; divisions: ... }): { requests: CreateRequestRecord[]; unmapped: { row: number; field: string; value: string }[] }`. Maps `Progress` (`Requested→REQUESTED`, `On Progress→ON_PROGRESS`, `First Look→FIRST_LOOK`, `Done→DONE`), dd/mm/yyyy and m/d/yyyy dates, `Include_KPI` (blank or `Yes` → true), `Jumlah Output` (blank → 1).
  - `scripts/import-sheet.ts <requests.csv> [socmed.csv]`: runs the parse, writes rows plus synthetic `StatusEvent`s (`REQUESTED` at request date, `DONE` at deadline when status is Done), prints the `unmapped` report.

- [ ] **Step 1: Write failing tests** using sample rows from the sheet: `Irshyad` resolves to Irsyad; `Rio` resolves to Robertino and `Rifky` to Rifqy via seeded aliases; a name that matches nobody returns `null` and appears in `unmapped`; `Daus` resolves to the inactive user; `Progress=Done` row gets `DONE` plus two events; `4/6/2026` style dates parse by the sheet's format; blank `Jumlah Output` gives 1.
- [ ] **Step 2: Run; expect FAIL. Implement; run; expect PASS.**
- [ ] **Step 3: Dry-run the script** against an exported CSV of "Request List All Clogent" and confirm row count and the unmapped report before real import. **Commit** `feat: spreadsheet import`.

### Task 12: Admin pages

**Files:**
- Create: `src/app/admin/users/page.tsx`, `src/app/admin/lists/page.tsx` (brands, divisions, request types), matching `actions.ts`
- Test: `tests/admin.test.ts`

**Interfaces:**
- Produces: `updateUser(userId: string, patch: { appRole?: AppRole; jobRole?: JobRole; aliases?: string[] }): Promise<void>`; `upsertRequestType(input: { id?: string; name: string; fieldSchema: unknown; active: boolean }): Promise<void>`; brand/division create and rename; all require `admin.manage`.

- [ ] **Step 1: Write failing tests:** non-admin rejected; the last admin cannot be demoted.
- [ ] **Step 2: Implement; run; expect PASS. Commit** `feat: admin`.

### Task 13: End-to-end and deploy check

**Files:**
- Create: `e2e/lifecycle.spec.ts`, `README.md` (env vars, setup, import, deploy)

- [ ] **Step 1: Write the Playwright test (test auth bypass only when `E2E=1`):** requester submits → lead assigns a designer → designer moves it to First Look then Done with `outputCount=2` → designer dashboard shows `tasksDone=1` against the seeded target.
- [ ] **Step 2: Run `npx playwright test`; expect PASS.**
- [ ] **Step 3: Manually verify in a browser:** wrong-domain login blocked, requester cannot open team dashboard, board drag-and-drop persists after reload, imported rows appear with correct brands and designers.
- [ ] **Step 4: Commit** `test: e2e lifecycle`.

---

## Self-Review Notes

- Spec coverage: intake (T5), views (T6), workflow (T4), collaboration + notifications (T7, T8), roles (T3), KPI (T2, T9), projects (T10), import (T11), admin (T12), verification (T2, T9, T13).
- Types are used consistently: `RequestStatus`, `JobRole`, `AppRole`, `KpiRequest`, `can`, `canTransition`, `computeKpi` are defined once and reused by name.
