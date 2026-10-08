# Request Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Calendar view on Requests that shows open work by deadline and lets Creative/Lead/Admin drag a card to a new day to reschedule, while the on-time KPI keeps using the original deadline.

**Architecture:** A new `rescheduleRequestWith` core (lib) behind a server action records every move as a `DeadlineEvent` and pins `Request.originalDeadline` on the first move; KPI reads `originalDeadline ?? deadline`. The calendar is a pure grid/bucketing lib plus a client component on `@dnd-kit` (same sensors and a11y pattern as `Board.tsx`), wired in as `?view=calendar&month=YYYY-MM`.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` before touching routing/server actions), React 19.3, Prisma 6 + Postgres, `@dnd-kit/core`, Tailwind tokens, Vitest + Testing Library, embedded Postgres via `tests/helpers/testDb.ts`.

**Spec:** `docs/superpowers/specs/2026-10-08-request-calendar-design.md`

## Global Constraints

- Open statuses only in the calendar: `REQUESTED`, `ON_PROGRESS`, `FIRST_LOOK`.
- Reschedule permission: `can(role, "request.transition")` (Creative, Lead, Admin).
- All day maths in Asia/Jakarta via `jakartaDate()` (`src/lib/createRequest.ts`); a stored deadline for day `D` is `new Date(\`${D}T00:00:00+07:00\`)`.
- Weeks start Monday. Max 3 cards per day cell, then "+N more".
- Colours are tokens only (no raw Tailwind palette colours); brand edge via `brandTone()`, overdue via the `overdue` tone.
- Server actions return failures as data `{ ok: false, code, message }`, never throw expected errors.
- Narrow breakpoint: below 640px (`sm`) shows the agenda list, no dragging.
- Copy: notification subject "Deadline changed"; activity line "Deadline moved from 10 Oct to 14 Oct"; empty month "Nothing due in October".

## Review Focus

1. A card dragged by a user whose session expired mid-drag: expect "Your session has expired. Sign in again." and the card snapping back (Task 2 `UNAUTHENTICATED` test, Task 6 snap-back test).
2. Dropping on a day before the request was made, via keyboard where the disabled cell is skipped: expect no server call (Task 6 test "does not drop on days before the request day").
3. `?month=2026-13`, `?month=abc`, `?month=1999-01`: expect the current Jakarta month, never a crash (Task 4 `parseMonth` tests).
4. A request whose deadline is moved twice: `originalDeadline` stays the first value and KPI on-time is judged against it (Task 1 + Task 2 tests).
5. A request created at 23:30 WIB (UTC previous day): its "request day" for the earliest-drop rule is the Jakarta day, not the UTC day (Task 2 test "uses the Jakarta request day").

---

### Task 1: Schema, migration and KPI on original deadline

**Files:**
- Modify: `prisma/schema.prisma` (Request, User relations, new DeadlineEvent)
- Create: `prisma/migrations/<timestamp>_deadline_events/migration.sql` (via `npx prisma migrate dev --name deadline_events --create-only`, then apply)
- Modify: `src/lib/kpi/metrics.ts` (`KpiRequest`, on-time check ~line 88)
- Modify: `src/lib/kpi/queries.ts` (`loadKpiRequests` select)
- Test: `tests/kpi/metrics.test.ts`, `tests/kpi/queries.test.ts`, `tests/schema.test.ts`

**Interfaces:**
- Produces: `Request.originalDeadline: Date | null`; `prisma.deadlineEvent` with fields `{ id, requestId, from: Date | null, to: Date, actorId, at }`; relation `Request.deadlineEvents`, `User.deadlineEvents`; `KpiRequest.originalDeadline: Date | null`.

- [ ] **Step 1: Write failing tests**
  - `metrics.test.ts` › `"on-time uses originalDeadline when set"`: request with `deadline: d("2026-10-20T00:00:00+07:00")`, `originalDeadline: d("2026-10-10T00:00:00+07:00")`, done `2026-10-15` → `onTimeRate === 0`. Same request with `originalDeadline: null` → `onTimeRate === 1`. Add `originalDeadline: null` to the `req()` base.
  - `queries.test.ts` › `"loadKpiRequests returns originalDeadline"`: create a request with `originalDeadline` set; the loaded row has it.
- [ ] **Step 2: Run** `npx vitest run tests/kpi` — Expected: FAIL (type error / missing field).
- [ ] **Step 3: Schema**: `originalDeadline DateTime?` on Request; `model DeadlineEvent` mirroring `StatusEvent` (`from DateTime?`, `to DateTime`, cascade on request, `@@index([requestId])`); back-relations. Create and apply the migration. Then add `originalDeadline` to `KpiRequest`, select it in `loadKpiRequests`, and change the on-time comparison to `dayOf(r.originalDeadline ?? r.deadline)`.
- [ ] **Step 4: Run** `npx vitest run tests/kpi tests/schema.test.ts && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(kpi): originalDeadline + DeadlineEvent schema; on-time uses original deadline`

### Task 2: Reschedule core, server action and notification type

**Files:**
- Create: `src/lib/reschedule.ts`
- Modify: `src/lib/notify.ts` (`NotificationType`, `SUBJECTS`, `buildMessage`)
- Modify: `src/app/(app)/requests/actions.ts` (export `rescheduleRequest`)
- Test: `tests/reschedule.test.ts` (embedded DB, pattern of `tests/moveRequest.test.ts`), `tests/notify.test.ts`

**Interfaces:**
- Consumes: Task 1 schema.
- Produces:
  - `type RescheduleResult = { ok: true } | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CLOSED" | "INVALID_DATE" | "ERROR"; message: string }`
  - `rescheduleRequestWith(getUser: () => Promise<SessionUser>, db: PrismaClient, requestId: string, day: string, notifier?: Notifier): Promise<RescheduleResult>` — `day` is `YYYY-MM-DD`.
  - `isOpenStatus(s: RequestStatus): boolean` exported from `reschedule.ts` (used by Tasks 5 and 6).
  - `rescheduleRequest(requestId: string, day: string): Promise<RescheduleResult>` server action; on ok calls `revalidatePath("/requests")` and `revalidatePath(\`/requests/${requestId}\`)`.
  - `NotificationType` adds `"DEADLINE"`; `buildMessage("DEADLINE", actor, title, { from, to })` where `from`/`to` are display strings ("10 Oct" or `""` for none).

- [ ] **Step 1: Write failing tests** in `tests/reschedule.test.ts` (fake notifier collecting calls):
  - requester → `{ ok: false, code: "FORBIDDEN" }`; unauthenticated getUser → `code: "UNAUTHENTICATED"`, message `"Your session has expired. Sign in again."`; missing id → `NOT_FOUND`.
  - DONE request → `CLOSED`, message `"This request is already done."`; CANCELLED → `"This request is already cancelled."`.
  - `"2026-02-30"` and `"abc"` → `INVALID_DATE`.
  - "uses the Jakarta request day": `requestedAt = 2026-10-09T16:30:00Z` (10 Oct WIB) — `"2026-10-09"` → `INVALID_DATE`; `"2026-10-10"` → ok.
  - same day as current deadline → `{ ok: true }`, zero `deadlineEvent` rows, notifier not called.
  - first move from 10 Oct to 14 Oct: `deadline` = `2026-10-14T00:00:00+07:00`, `originalDeadline` = 10 Oct, one event `{ from: 10 Oct, to: 14 Oct, actorId }`; second move to 16 Oct keeps `originalDeadline` = 10 Oct.
  - no-deadline request moved to 12 Oct: `originalDeadline` stays `null`, event `from: null`.
  - notifications: assignee and requester (≠ actor) get one `DEADLINE` call; actor is never in `userIds`.
  - `notify.test.ts`: `buildMessage("DEADLINE", "Wira", "Banner", { from: "10 Oct", to: "14 Oct" })` === `Wira moved the deadline of “Banner” from 10 Oct to 14 Oct`; with `from: ""` === `Wira set the deadline of “Banner” to 14 Oct`.
- [ ] **Step 2: Run** `npx vitest run tests/reschedule.test.ts tests/notify.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `rescheduleRequestWith` following the rule order in the spec (§1). Write inside `db.$transaction`: `updateMany({ where: { id, status: { in: OPEN } } })` as compare-and-set (0 rows → re-read and return `CLOSED`), set `originalDeadline` only when it is null and the old deadline is non-null, create the event. Notify via `bestEffort` after commit, as `transitionRequestWith` does. Short date labels: `"14 Oct"` from `jakartaDate` + `MONTHS` (`src/lib/timeline.ts`). Unexpected errors → `console.error` + `ERROR`.
- [ ] **Step 4: Run** the same tests + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): reschedule action with deadline history and DEADLINE notification`

### Task 3: Request detail — activity merge and Change deadline

**Files:**
- Modify: `src/app/(app)/requests/[id]/page.tsx` (include `deadlineEvents` with actor)
- Modify: `src/app/(app)/requests/[id]/RequestDetailView.tsx` (`RequestDetail.deadlineEvents`, Activity list, Manage card)
- Modify: `src/app/(app)/requests/[id]/DetailForms.tsx` (new `DeadlineControl`)
- Test: `tests/requestDetailView.test.tsx`, `tests/detailForms.test.tsx`

**Interfaces:**
- Consumes: `rescheduleRequest` (Task 2).
- Produces: `RequestDetail.deadlineEvents: { id: string; from: Date | null; to: Date; at: Date; actor: { name: string } }[]`; `DeadlineControl({ requestId, current, minDay }: { requestId: string; current: string | null; minDay: string })` (YYYY-MM-DD strings).

- [ ] **Step 1: Write failing tests**
  - Activity shows status and deadline events interleaved by `at`; a deadline event renders "Deadline moved from 10 Oct to 14 Oct" and "Deadline set to 14 Oct" when `from` is null. The empty text becomes "No activity yet." when both lists are empty.
  - Manage shows `DeadlineControl` only when `canMove` and status is open.
  - `DeadlineControl`: label "Deadline", `input[type=date]` with `min={minDay}`, Save calls `rescheduleRequest(id, value)`; on `{ ok: false, message }` shows the message in an `Alert`.
- [ ] **Step 2: Run** `npx vitest run tests/requestDetailView.test.tsx tests/detailForms.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** following the `AssigneePicker` pattern (transition + `router.refresh()` on ok). Activity dot for deadline events uses the `due-soon` tone.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(request-detail): deadline history in Activity and Change deadline in Manage`

### Task 4: Calendar grid lib (pure)

**Files:**
- Create: `src/lib/calendar.ts`
- Create: `src/lib/calendarA11y.ts`
- Test: `tests/calendar.test.ts`, `tests/calendarA11y.test.ts`

**Interfaces:**
- Produces:
  - `parseMonth(raw: string | undefined, now: Date): string` — `YYYY-MM`; invalid, month not 01–12, or year outside 2000–2100 → current Jakarta month.
  - `type CalendarDay = { day: string; inMonth: boolean; isToday: boolean; weekday: number }` (weekday 0 = Monday).
  - `buildMonthGrid(month: string, today: string): { weeks: CalendarDay[][]; from: string; to: string }` — Monday-start weeks covering the month; `from`/`to` are the first and last grid days.
  - `shiftMonth(month: string, delta: number): string`.
  - `type CalendarItem = { id: string; deadlineDay: string | null; requestDay: string }` (generic constraint for bucketing).
  - `bucketByDay<T extends CalendarItem>(items: T[], today: string): Map<string, T[]>` — no-deadline items go on `today`.
  - `splitVisible<T>(items: T[], max = 3): { shown: T[]; more: number }`.
  - `CALENDAR_DND_ID = "request-calendar"`, `CALENDAR_SR_INSTRUCTIONS` (string), `buildCalendarAnnouncements(titleOf: (id) => string | undefined)` returning dnd-kit announcements whose droppable ids are `YYYY-MM-DD`.
  - `dayLabel(day: string): string` → `"Tuesday 14 October"`.

- [ ] **Step 1: Write failing tests**
  - `buildMonthGrid("2026-10", "2026-10-08")`: first day `"2026-09-28"`, 5 weeks, last `"2026-11-01"`, `isToday` only on 10-08. `"2026-02"` (Feb 2026 starts Sunday): first day `"2026-01-26"`, 6 weeks. `"2028-02"` includes `"2028-02-29"` with `inMonth: true`.
  - `parseMonth("2026-13", now)`, `parseMonth("abc", now)` and `parseMonth("1999-01", now)` → the Jakarta month of `now`; `now = 2026-09-30T18:00:00Z` → `"2026-10"`.
  - `shiftMonth("2026-12", 1) === "2027-01"`, `shiftMonth("2026-01", -1) === "2025-12"`.
  - `bucketByDay`: null deadline → today's bucket; insertion order kept.
  - `splitVisible` of 5 → 3 shown, `more: 2`; of 3 → `more: 0`.
  - Announcements: start `Picked up “X”. Use the arrow keys to move between days.`; over `"2026-10-14"` `“X” is over Wednesday 14 October.`; end `“X” moved to Wednesday 14 October.`; end with `over: null` `“X” was dropped outside the calendar. Nothing changed.`
- [ ] **Step 2: Run** `npx vitest run tests/calendar.test.ts tests/calendarA11y.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with UTC-noon arithmetic on `YYYY-MM-DD` strings (no local time zone use); the weekday comes from `Date.UTC`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(calendar): month grid, bucketing and a11y announcement helpers`

### Task 5: Calendar query and view params

**Files:**
- Modify: `src/lib/requests.ts` (add `listCalendarRequests`, reusing the module-private `filterClauses`, `ROW_SELECT`, `toRow`)
- Modify: `src/app/(app)/requests/params.ts` (`view: "calendar"`, `month`, `hrefWith`)
- Test: `tests/requestsQuery.test.ts`, `tests/requestParams.test.ts`

**Interfaces:**
- Consumes: `isOpenStatus` (Task 2), `parseMonth` (Task 4).
- Produces:
  - `type CalendarRow = RequestRow & { requestDay: string; deadlineDay: string | null }`.
  - `listCalendarRequests(db, filter: RequestFilter, range: { from: string; to: string; today: string }, now?: Date): Promise<CalendarRow[]>` — open statuses only (a closed `filter.status` → `[]`), deadline within `[from 00:00 WIB, to+1 00:00 WIB)`, plus open no-deadline rows when `from <= today <= to`; ordered by deadline asc, then `requestedAt` asc.
  - `ViewParams.view: "board" | "table" | "calendar"`; `ViewParams.month: string` (always set, via `parseMonth`). `hrefWith` carries `view=calendar` and `month` only when the view is the calendar; `over` accepts `month`.

- [ ] **Step 1: Write failing tests**
  - Query: open requests on 2026-10-14 and 2026-11-20, a DONE one on 10-14, a no-deadline open one; range `2026-09-28..2026-11-01`, today `2026-10-08` → returns the 10-14 open one and the no-deadline one only. With today outside the range → no-deadline excluded. `filter.status = "DONE"` → `[]`. Assignee filter still applies.
  - Params: `parseParams({ view: "calendar", month: "2026-11" })` → `{ view: "calendar", month: "2026-11" }`; `hrefWith(calendarParams, { month: "2026-12" })` === `/requests?view=calendar&month=2026-12`; board `hrefWith` never contains `month`.
- [ ] **Step 2: Run** `npx vitest run tests/requestsQuery.test.ts tests/requestParams.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** reusing `ROW_SELECT`/`toRow` and `filterClauses`; `requestDay`/`deadlineDay` via `jakartaDate`.
- [ ] **Step 4: Run** the tests + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): calendar query and ?view=calendar&month params`

### Task 6: Calendar component

**Files:**
- Create: `src/components/RequestCalendar.tsx` (client: grid, drag, overflow dialog, agenda)
- Create: `src/components/CalendarCard.tsx`
- Modify: `src/components/RequestSkeletons.tsx` (add `CalendarSkeleton`)
- Test: `tests/requestCalendar.test.tsx`

**Interfaces:**
- Consumes: `CalendarRow` (Task 5), grid/bucket/a11y helpers (Task 4), `rescheduleRequest` (Task 2).
- Produces: `RequestCalendar({ rows, month, today, canMove, prevHref, nextHref, todayHref }: { rows: CalendarRow[]; month: string; today: string; canMove: boolean; prevHref: string; nextHref: string; todayHref: string })`; `CalendarSkeleton()`.

- [ ] **Step 1: Write failing tests** (mock `@/app/(app)/requests/actions` and `next/navigation` as `tests/board.test.tsx` does):
  - Renders heading "October 2026", 7 weekday headers starting "Mon", prev/next/Today links with the given hrefs.
  - Day with 5 cards shows 3 cards and a "+2 more" button that opens a dialog listing all 5.
  - No-deadline card sits in today's cell with the text "No deadline"; overdue card has `data-tone="overdue"`.
  - Keyboard: focus a card, Space, ArrowRight, Space → `rescheduleRequest(id, nextDay)` called once.
  - "does not drop on days before the request day": a card with `requestDay` 10-08 moved left to 10-07 → no call.
  - Server `{ ok: false, message: "This request is already done." }` → card back in its original cell and the message visible in an `Alert`.
  - `canMove={false}` → cards have no drag handle attributes (`aria-roledescription` absent).
  - Empty rows → "Nothing due in October" with a Today link.
  - Narrow: with `matchMedia("(max-width: 639px)")` true, renders a list (`role="list"`) of days that have cards, no drag attributes.
- [ ] **Step 2: Run** `npx vitest run tests/requestCalendar.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Sensors and `DragOverlay` as `Board.tsx` (Mouse distance 6, Touch delay 250/5, Keyboard with a coordinate getter moving one cell left/right/up/down). Day cells are `useDroppable({ id: day, disabled: day < card.requestDay })` (disabled per active card). Optimistic local move, `router.refresh()` on ok. The "+N more" dialog is a native `<dialog>` styled like `ui/Modal` (no routing). The grid's `<table>`-like semantics: `role="grid"` is not needed; use a list of weeks with day `section`s labelled by `dayLabel`.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(calendar): RequestCalendar with drag-to-reschedule, overflow dialog and agenda layout`

### Task 7: Wire into Requests page and verify in the browser

**Files:**
- Modify: `src/app/(app)/requests/page.tsx` (third tab, calendar branch, skeleton)
- Modify: `src/components/FilterBar.tsx` (status options limited to open statuses when `p.view === "calendar"`)
- Test: `tests/filterBar.test.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write failing test**: FilterBar in calendar view lists only Requested / On progress / First look.
- [ ] **Step 2: Run** `npx vitest run tests/filterBar.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**: Calendar tab (`CalendarDays` icon) in the `SegmentedControl`; when `p.view === "calendar"`, call `buildMonthGrid(p.month, today)` and `listCalendarRequests` with its range; prev/next/today hrefs via `hrefWith(p, { month: shiftMonth(...) })`; `ViewSkeleton` returns `CalendarSkeleton` for the calendar view.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npx eslint src tests` — Expected: all PASS.
- [ ] **Step 5: Browser check** (dev server on :3000, signed in as an admin): open `/requests?view=calendar`; drag an open card to another day; confirm the card moves, the request page Activity shows "Deadline moved from … to …", a `DEADLINE` notification row exists for the assignee, My KPI on-time is unchanged; check `?month=abc` loads the current month; resize to 375px and see the agenda list.
- [ ] **Step 6: Commit** `feat(requests): Calendar view tab`
