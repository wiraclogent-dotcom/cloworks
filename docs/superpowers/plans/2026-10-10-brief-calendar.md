# Brief Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A leads/admins-only `/dashboard/briefs` page showing, per day of a month, whether each social media specialist submitted at least one request.

**Architecture:** A pure, client-safe month model (`src/lib/briefCalendar.ts`) built on the existing grid helpers in `src/lib/calendar.ts`; a scoped-db loader (`src/lib/briefCalendarQueries.ts`); one client component (`src/components/briefs/BriefCalendar.tsx`) for tiles, grid, day dialog and narrow agenda; a server page plus a gated sidebar item. No schema changes.

**Tech Stack:** Next.js 16 app router (cacheComponents, `PageProps`), React 19, Prisma 6 scoped client, Tailwind 4, Vitest + Testing Library, embedded-postgres test DB.

**Spec:** `docs/superpowers/specs/2026-10-10-brief-calendar-design.md`

## Global Constraints

- Days are Jakarta calendar dates (`jakartaDate` from `src/lib/createRequest.ts`); months are `YYYY-MM` with bounds from `monthBounds` (`src/lib/kpi/months.ts`).
- People: `active: true`, `jobRole: "SOCIAL_MEDIA"`, `appRole in ["REQUESTER", "CREATIVE"]`, ordered by `name asc`.
- All request types and all statuses (including CANCELLED) count.
- Access: `can(appRole, "dashboard.team")`; denied viewers get `AccessDenied` with description "The brief calendar is only available to leads and admins." and `backHref="/dashboard" backLabel="Back to My KPI"`.
- Copy: page title "Brief Calendar"; breadcrumb Insights › Brief Calendar; nav label "Brief Calendar"; empty-dot people get "No brief" in the dialog.
- Person colours: `avatarColor(name)` from `src/lib/palette.ts` (no new hexes).
- Read `node_modules/next/dist/docs/` for any Next API you are unsure of (AGENTS.md); mirror `src/app/(app)/dashboard/team/page.tsx`.

## Review Focus

- A request stored at `2026-10-07T17:00:00Z` (Jakarta midnight) must land on 8 Oct, not 7 Oct — Task 1 test.
- A weekend brief counts in `briefs` but not in `weekdaysBriefed`, and an empty weekend is never "missed" — Task 1 test.
- Viewing a future month: no "missed" dots and summary reads "—" rather than "0 / 0" — Tasks 1 and 3 tests.
- A person with zero requests that month still gets a tile and dots (they are the point of the page) — Tasks 2 and 3 tests.
- Garbage `?month=` falls back to the current Jakarta month via `parseMonthParam` — Task 4 relies on the existing tested helper; no new test.

---

### Task 1: Pure month model

**Files:**
- Create: `src/lib/briefCalendar.ts`
- Test: `tests/briefCalendar.test.ts`

**Interfaces:**
- Consumes: `buildMonthGrid(month, today)`, `CalendarDay` from `src/lib/calendar.ts`.
- Produces:
  ```ts
  export type BriefPerson = { id: string; name: string };
  export type BriefItem = { id: string; title: string; requesterId: string; requestDay: string; typeName: string; status: RequestStatus };
  export type DotState = "sent" | "missed" | "none";
  export type BriefDay = CalendarDay & { isWeekend: boolean; isFuture: boolean; perPerson: { personId: string; count: number; state: DotState }[] };
  export type BriefSummary = { personId: string; weekdaysBriefed: number; weekdaysElapsed: number; briefs: number };
  export type BriefMonth = { weeks: BriefDay[][]; summary: BriefSummary[]; itemsByDay: Record<string, BriefItem[]> };
  export function dotState(day: { inMonth: boolean; isWeekend: boolean; isFuture: boolean }, count: number): DotState;
  export function buildBriefMonth(month: string, today: string, people: BriefPerson[], items: BriefItem[]): BriefMonth;
  ```
  `RequestStatus` is a type import from `@prisma/client` (keeps the module client-safe).

- [ ] **Step 1: Write the failing tests** in `tests/briefCalendar.test.ts` (people `r`, `f`, `s` in that order; month `2026-10`; today `2026-10-08`, a Thursday). Shared fixture `ITEMS`, defined at the top of the test file: `f` on 1 Oct, Sat 3 Oct, 8 Oct, 8 Oct; `s` on 8 Oct; `r` none:
  - `dotState`: `{inMonth:true,isWeekend:false,isFuture:false}` with 0 → `"missed"`, with 2 → `"sent"`; weekend with 0 → `"none"`, weekend with 1 → `"sent"`; future with 0 → `"none"`; `inMonth:false` with any count → `"none"`.
  - `buildBriefMonth` grid: `weeks[0][0].day === "2026-09-28"`; the cell for `"2026-10-10"` has `isWeekend: true`, `"2026-10-09"` has `isFuture: true`, `"2026-10-08"` has `isFuture: false`; every cell's `perPerson.map(p => p.personId)` equals `["r","f","s"]` (people order kept).
  - counts (with `ITEMS`): the 8 Oct cell's counts `[0,2,1]`, states `["missed","sent","sent"]`; `itemsByDay["2026-10-08"].length === 3`.
  - summary (today `2026-10-08`): weekdays elapsed = 6 (1, 2, 5, 6, 7, 8 Oct) for everyone; `f` → `{weekdaysBriefed: 2, weekdaysElapsed: 6, briefs: 4}` (Sat 3 Oct counts as a brief, not a weekday); `r` with none → `{0, 6, 0}`.
  - past month (`2026-09`, today `2026-10-08`): `weekdaysElapsed === 22`; future month (`2026-11`): `weekdaysElapsed === 0` and no cell has state `"missed"`.
  - items for an unknown requester or outside the month are ignored (not in counts, summary, or `itemsByDay`).

- [ ] **Step 2: Run** `npx vitest run tests/briefCalendar.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `dotState` and `buildBriefMonth` in `src/lib/briefCalendar.ts`. `isWeekend = weekday >= 5`; `isFuture = day > today` (string compare on `YYYY-MM-DD`). `weekdaysElapsed` counts in-month cells with `!isWeekend && !isFuture`; `weekdaysBriefed` counts those of them with count > 0; `briefs` counts every in-month item for that person (weekends included). Count only items whose requester is in `people` and whose `requestDay` starts with `month`.

- [ ] **Step 4: Run** `npx vitest run tests/briefCalendar.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/briefCalendar.ts tests/briefCalendar.test.ts
  git commit -m "feat(briefs): pure month model for the brief calendar"
  ```

### Task 2: Loader

**Files:**
- Create: `src/lib/briefCalendarQueries.ts`
- Test: `tests/briefCalendarQueries.test.ts`

**Interfaces:**
- Consumes: `BriefPerson`, `BriefItem` (Task 1); `monthBounds` (`kpi/months`); `jakartaDate` (`createRequest`).
- Produces:
  ```ts
  export function listBriefPeople(db: Pick<PrismaClient, "user">): Promise<BriefPerson[]>;
  export function loadBriefItems(db: Pick<PrismaClient, "request">, month: string, people: BriefPerson[]): Promise<BriefItem[]>;
  ```

- [ ] **Step 1: Write the failing test** in `tests/briefCalendarQueries.test.ts` using `createTestDb()` like `tests/kpi/queries.test.ts`. Seed users: `rifqy` (REQUESTER, SOCIAL_MEDIA), `fafa` (REQUESTER, SOCIAL_MEDIA), `idzni` (LEAD, SOCIAL_MEDIA), `gone` (REQUESTER, SOCIAL_MEDIA, `active:false`), `des` (CREATIVE, DESIGNER); types `Social Media` and `General Design`. Assert:
  - `listBriefPeople` → `[{name:"fafa"},{name:"rifqy"}]` by name (Idzni, inactive and designer excluded).
  - Requests by fafa at `2026-09-30T17:00:00Z` (→ `requestDay "2026-10-01"`, type General Design, status CANCELLED), at `2026-10-31T16:59:00Z` (→ `"2026-10-31"`), at `2026-10-31T17:00:00Z` (November, excluded), by des in October (excluded): `loadBriefItems(db, "2026-10", people)` returns exactly the two fafa items with those `requestDay`s, `typeName` and `status` filled.

- [ ] **Step 2: Run** `npx vitest run tests/briefCalendarQueries.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** both functions. People `where` per Global Constraints, `select {id, name}`. Items: `requesterId in people ids`, `requestedAt gte start, lt end` from `monthBounds(month)`, `orderBy requestedAt asc`, select `id, title, requesterId, requestedAt, status, type { name }`, map `requestDay = jakartaDate(requestedAt)`. Return `[]` without querying when `people` is empty.

- [ ] **Step 4: Run** `npx vitest run tests/briefCalendarQueries.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/briefCalendarQueries.ts tests/briefCalendarQueries.test.ts
  git commit -m "feat(briefs): load social media people and their month of requests"
  ```

### Task 3: Calendar component

**Files:**
- Create: `src/components/briefs/BriefCalendar.tsx`, `src/components/briefs/BriefDayDialog.tsx`
- Test: `tests/briefCalendarView.test.tsx`

**Interfaces:**
- Consumes: `BriefMonth`, `BriefPerson`, `BriefItem` (Task 1); `dayLabel` (`calendar.ts`); `avatarColor`, `initials` (`palette.ts`); `StatusBadge` (`components/status`); `useNarrow`; `IconButton`.
- Produces:
  ```tsx
  export function BriefCalendar({ people, model }: { people: BriefPerson[]; model: BriefMonth }): JSX.Element; // "use client"
  export function BriefDayDialog({ day, people, items, onClose }: { day: string; people: BriefPerson[]; items: BriefItem[]; onClose: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`; build `model` with `buildBriefMonth("2026-10","2026-10-08", people, items)` and the Task 1 `ITEMS` fixture (copy it; do not import across test files); mock `useNarrow` to return `false`, and `true` for the agenda test):
  - legend lists each person's name; one summary tile per person with text `"2 / 6 weekdays"` and `"4 briefs"` for `f`, and `"0 / 6 weekdays"`, `"0 briefs"` for `r`.
  - future month model (`2026-11`): tiles show `"—"` instead of `"0 / 0 weekdays"`.
  - the 8 Oct cell is a button named `"Thursday 8 October: r 0, f 2, s 1"`; it contains elements with `data-state="missed"` ×1 and `data-state="sent"` ×2; the badge text `"2"` appears for `f`.
  - a Saturday cell with no briefs has no `data-state="missed"` element; Sat 3 Oct (f briefed) has one `data-state="sent"`.
  - clicking the 8 Oct cell opens a dialog headed `"Thursday 8 October"` with links to `/requests/<id>` for each item, grouped under person names, and `"No brief"` under `r`; the Close button closes it. (jsdom lacks `showModal`: stub `HTMLDialogElement.prototype.showModal/close` in the test, as other dialog tests do — check `tests/` for the existing stub.)
  - narrow: renders a list (no grid) of in-month days; the 8 Oct row reads the same `aria-label` and opens the same dialog.

- [ ] **Step 2: Run** `npx vitest run tests/briefCalendarView.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** `BriefCalendar`: legend → summary `<ul>` styled like Team KPI's scorecard (`grid gap-px rounded-xl border bg-border sm:grid-cols-3`; tile text `${weekdaysBriefed} / ${weekdaysElapsed} weekdays` or `—` when elapsed is 0, and `${briefs} brief(s)`) → Mon–Sun header row → 7-column grid of cell buttons. Dot per person: `sent` = filled circle in `avatarColor(name).text` with count badge when > 1; `missed` = outlined hollow circle (border only, `text-foreground-muted`); `none` = nothing. Weekend cells `bg-muted/40`, future cells `opacity-60`, out-of-month cells faded and not buttons, today ring like `DayCell`. `aria-label` = `` `${dayLabel(day)}: ${people.map(p => `${p.name} ${count}`).join(", ")}` ``. Selected day in `useState<string|null>`; render `BriefDayDialog` with `model.itemsByDay[day] ?? []`. Narrow: `<ol>` of in-month days with the same button and label. `BriefDayDialog`: copy `calendar/DayDialog.tsx`'s native-`<dialog>` shell (showModal on mount, Esc/backdrop close, focus return); body = per person a heading + list of `<Link href={`/requests/${id}`}>{title}</Link>`, type name, `<StatusBadge status>`; "No brief" when none.

- [ ] **Step 4: Run** `npx vitest run tests/briefCalendarView.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/briefs tests/briefCalendarView.test.tsx
  git commit -m "feat(briefs): brief calendar grid, day dialog and narrow agenda"
  ```

### Task 4: Page, sidebar item, help article

**Files:**
- Create: `src/app/(app)/dashboard/briefs/page.tsx`, `content/help/brief-calendar.md`
- Modify: `src/components/AppShell.tsx` (add `BriefCalendarItem` beside `TeamKpiItem`, render it after Team KPI in the Insights group), `src/components/PageSkeletons.tsx` (add `BriefCalendarSkeleton`), `tests/shellNavGating.test.tsx`
- Test: `tests/briefCalendarPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3; `requireScope`, `can`, `parseMonthParam`, `MonthPicker`, `jakartaMonth`, `jakartaDate`, `monthLabel`, `PageHeader`, `EmptyState`, `AccessDenied`.
- Produces: `export async function BriefCalendarItem()` in `AppShell.tsx`; `export function BriefCalendarSkeleton()`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/shellNavGating.test.tsx`: extend `renderGated` to also await `BriefCalendarItem()`; REQUESTER/CREATIVE see no `"Brief Calendar"` link; LEAD and ADMIN see it with `href "/dashboard/briefs"`.
  - `tests/briefCalendarPage.test.tsx` (mock `@/lib/session` `requireScope` and `@/lib/briefCalendarQueries` like other page tests): a REQUESTER gets the text "The brief calendar is only available to leads and admins." and no grid; a LEAD with `?month=2026-10` gets heading "Brief Calendar", description "October 2026", and the legend names; with no people, the empty state "No social media team members" is shown.

- [ ] **Step 2: Run** `npx vitest run tests/shellNavGating.test.tsx tests/briefCalendarPage.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.** Page mirrors `dashboard/team/page.tsx`: `metadata = { title: "Brief Calendar" }`; inner async `BriefContent` does `requireScope()` → access check → `parseMonthParam` → `listBriefPeople` → `loadBriefItems` → `buildBriefMonth(month, jakartaDate(new Date()), people, items)`; header with `MonthPicker month current={jakartaMonth(new Date())} action="/dashboard/briefs"`; `EmptyState` (icon `CalendarDays`, title "No social media team members", description "Active social media requesters will appear here.") when `people` is empty; else `<BriefCalendar people model />`. Default export wraps it in `<Suspense fallback={<BriefCalendarSkeleton />}>`. Nav item: `can(appRole, "dashboard.team") ? <NavItem href="/dashboard/briefs" label="Brief Calendar" icon={<CalendarDays aria-hidden="true" />} /> : null`, wrapped in `<Suspense fallback={null}>`. Help article front matter: `title: Brief Calendar`, `section: KPI`, `order: 3`, `requiresPermission: dashboard.team`; body explains the dots, weekends, future days, and that any submitted request counts.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` — Expected: all pass (help-content tests pick up the new article).

- [ ] **Step 5: Verify in the browser.** Start the dev server via `preview_start`, sign in as an admin, open `/dashboard/briefs?month=2026-10`: 8 Oct shows Syahda's dots; weekends grey; days after today dimmed; clicking 8 Oct lists her requests linking to `/requests/<id>`; at mobile width the agenda list shows. Screenshot for the user.

- [ ] **Step 6: Commit**
  ```bash
  git add "src/app/(app)/dashboard/briefs" src/components/AppShell.tsx src/components/PageSkeletons.tsx content/help/brief-calendar.md tests/shellNavGating.test.tsx tests/briefCalendarPage.test.tsx
  git commit -m "feat(briefs): Brief Calendar page under Insights for leads and admins"
  ```
