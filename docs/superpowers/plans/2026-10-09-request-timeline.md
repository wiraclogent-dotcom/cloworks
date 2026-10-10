# Request Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth Requests view, `?view=timeline&week=YYYY-MM-DD`: one row per team member (+ Unassigned), one bar per open request from its requested day to its deadline, over two Monday-start weeks.

**Architecture:** A pure, client-safe layout module (`src/lib/workload.ts`) turns rows + people + a 14-day window into lanes of bars. A Prisma query (`listTimelineRequests`) fetches the open requests that intersect the window. A client component (`RequestTimeline`) renders a CSS-grid chart on wide screens and a per-person list on phones; the page wires it like the Calendar.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` before touching the page), React 19, Prisma 6 + Postgres, Tailwind tokens only, lucide-react, Vitest + Testing Library (jsdom), embedded-postgres test DB (`tests/helpers/testDb`).

**Spec:** `docs/superpowers/specs/2026-10-09-request-timeline-design.md`

## Global Constraints

- Open statuses only: `REQUESTED`, `ON_PROGRESS`, `FIRST_LOOK`. A closed status (`DONE`, `CANCELLED`) in the URL is ignored on this view.
- Jakarta days (UTC+7, no DST); weeks start Monday; window = 14 days; default window starts the Monday of the week **before** today's week.
- Bar: `start = requestDay`, `end = max(deadlineDay ?? today, today)`; drawn when `start <= to && end >= from`.
- `week` param: valid `YYYY-MM-DD`, year 2000–2100, snapped back to its Monday; otherwise the default.
- No Prisma migration; never run `prisma migrate dev` / `db push` / reset against the dev DB (port 54329).
- Colours via existing tokens / `data-tone` only. Copy: "No deadline", "Overdue", "Unassigned", "N open", "No open requests in these two weeks", "No requests match these filters in these two weeks", "Previous week", "Next week", "Today".
- View-only: no drag.

## Review Focus

1. Bad data, deadline before the request day → one-day bar at `start` (test in Task 1).
2. Two assignees with the same name → two rows, keyed by id (Task 1).
3. A request started before the window and still running after it → one bar clipped on both sides, both chevrons (Tasks 1 and 4).
4. `week=2026-02-30` or other impossible dates → default window, not a crash or a shifted date (Task 1).
5. Phone width on first load → server renders the chart, client switches to the list after hydration with no hydration warning (Task 4, `useNarrow` server snapshot is wide).

---

### Task 1: Pure layout module

**Files:**
- Create: `src/lib/workload.ts`
- Modify: `src/lib/calendar.ts` (export the existing `pad`, `utc`, `fmt`, `weekdayOf`, `DAY_MS`; no behaviour change)
- Test: `tests/workload.test.ts`

**Interfaces:**
- Produces:
  - `TIMELINE_DAYS = 14`
  - `defaultWeek(today: string): string` — Monday of the week before `today`'s week.
  - `parseWeek(raw: string | undefined, now: Date): string`
  - `shiftWeek(week: string, delta: number): string` — ±7 days per step.
  - `type TimelineDay = { day: string; weekday: number; isToday: boolean; isWeekend: boolean }`
  - `buildWindow(week: string, today: string): { days: TimelineDay[]; from: string; to: string }`
  - `type TimelineItem = { id: string; assigneeId: string | null; assigneeName: string | null; requestDay: string; deadlineDay: string | null }`
  - `barSpan(item: Pick<TimelineItem, "requestDay" | "deadlineDay">, today: string): { start: string; planEnd: string | null; end: string; overdue: boolean; noDeadline: boolean }`
  - `type TimelineBar = { id: string; startCol: number; endCol: number; planEndCol: number | null; clippedStart: boolean; clippedEnd: boolean; overdue: boolean; noDeadline: boolean }`
  - `type TimelinePerson = { key: string; assigneeId: string | null; name: string; count: number; lanes: TimelineBar[][] }` (`key` = assignee id, or `"unassigned"`)
  - `layoutRows(items: TimelineItem[], people: { id: string; name: string }[], window: { from: string; to: string }, today: string, opts?: { assigneeId?: string }): TimelinePerson[]`

- [ ] **Step 1: Write the failing tests** (`TODAY = "2026-10-08"`, a Thursday)

```ts
describe("weeks", () => {
  it("defaults to last week's Monday", () => expect(defaultWeek("2026-10-08")).toBe("2026-09-28"));
  it("parseWeek snaps to Monday and rejects junk", () => {
    const now = new Date("2026-10-08T05:00:00Z");
    expect(parseWeek("2026-10-14", now)).toBe("2026-10-12");
    expect(parseWeek("2026-10-12", now)).toBe("2026-10-12");
    for (const bad of [undefined, "", "bogus", "2026-02-30", "1999-12-27", "2101-01-03", "2026-1-5"])
      expect(parseWeek(bad, now)).toBe("2026-09-28");
  });
  it("parseWeek default uses the Jakarta day", () =>
    expect(parseWeek(undefined, new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-05")); // Mon 12 Oct in Jakarta
  it("shiftWeek", () => { expect(shiftWeek("2026-09-28", 1)).toBe("2026-10-05"); expect(shiftWeek("2026-01-05", -1)).toBe("2025-12-29"); });
});
describe("buildWindow", () => {
  it("is 14 Monday-first days with weekends and today", () => {
    const w = buildWindow("2026-09-28", TODAY);
    expect(w).toMatchObject({ from: "2026-09-28", to: "2026-10-11" });
    expect(w.days).toHaveLength(14);
    expect(w.days.filter((d) => d.isWeekend).map((d) => d.day)).toEqual(["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11"]);
    expect(w.days.find((d) => d.isToday)?.day).toBe(TODAY);
  });
});
describe("barSpan", () => {
  it("future deadline", () => expect(barSpan({ requestDay: "2026-10-01", deadlineDay: "2026-10-14" }, TODAY)).toEqual({ start: "2026-10-01", planEnd: "2026-10-14", end: "2026-10-14", overdue: false, noDeadline: false }));
  it("deadline today is not overdue", () => expect(barSpan({ requestDay: "2026-10-01", deadlineDay: TODAY }, TODAY).overdue).toBe(false));
  it("overdue runs to today", () => expect(barSpan({ requestDay: "2026-10-01", deadlineDay: "2026-10-05" }, TODAY)).toMatchObject({ planEnd: "2026-10-05", end: TODAY, overdue: true }));
  it("no deadline runs to today", () => expect(barSpan({ requestDay: "2026-10-01", deadlineDay: null }, TODAY)).toMatchObject({ planEnd: null, end: TODAY, noDeadline: true, overdue: false }));
  it("deadline before request day and request in the future: one day at start", () =>
    expect(barSpan({ requestDay: "2026-10-20", deadlineDay: "2026-10-19" }, TODAY)).toMatchObject({ start: "2026-10-20", end: "2026-10-20" }));
});
describe("layoutRows", () => {
  const W = { from: "2026-09-28", to: "2026-10-11" };
  const it_ = (id: string, assigneeId: string | null, requestDay: string, deadlineDay: string | null, assigneeName = assigneeId ? assigneeId.toUpperCase() : null) =>
    ({ id, assigneeId, assigneeName, requestDay, deadlineDay });
  const people = [{ id: "b", name: "Bea" }, { id: "a", name: "Adi" }, { id: "c", name: "Cami" }];

  it("lists every person by name, empty ones included, Unassigned last only when it has bars", () => {
    const rows = layoutRows([it_("1", "a", "2026-10-01", "2026-10-03")], people, W, TODAY);
    expect(rows.map((r) => r.name)).toEqual(["Adi", "Bea", "Cami"]);
    expect(rows.map((r) => r.count)).toEqual([1, 0, 0]);
    expect(rows[1].lanes).toEqual([]);
    const withU = layoutRows([it_("2", null, "2026-10-01", null)], people, W, TODAY);
    expect(withU.at(-1)).toMatchObject({ key: "unassigned", name: "Unassigned", assigneeId: null, count: 1 });
  });
  it("adds assignees missing from the people list, sorted in by name, and keeps same-named people apart", () => {
    const rows = layoutRows([it_("1", "x", "2026-10-01", "2026-10-02", "Bea")], people, W, TODAY);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "x", "c"]);
  });
  it("with an assignee filter shows only that person", () =>
    expect(layoutRows([], people, W, TODAY, { assigneeId: "c" }).map((r) => r.key)).toEqual(["c"]));
  it("packs overlapping bars into lanes", () => {
    const rows = layoutRows([it_("1", "a", "2026-10-01", "2026-10-05"), it_("2", "a", "2026-10-03", "2026-10-09"), it_("3", "a", "2026-10-06", "2026-10-09")], people, W, TODAY);
    expect(rows[0].lanes.map((l) => l.map((b) => b.id))).toEqual([["1", "3"], ["2"]]);
    expect(rows[0].lanes[0][0]).toMatchObject({ startCol: 3, endCol: 7, clippedStart: false, clippedEnd: false });
  });
  it("clips at both window edges", () => {
    const [bar] = layoutRows([it_("1", "a", "2026-09-20", "2026-10-20")], people, W, TODAY)[0].lanes[0];
    expect(bar).toMatchObject({ startCol: 0, endCol: 13, clippedStart: true, clippedEnd: true });
  });
  it("marks the deadline column of an overdue bar, null when the deadline is before the window", () => {
    const rows = layoutRows([it_("1", "a", "2026-10-01", "2026-10-05"), it_("2", "b", "2026-09-10", "2026-09-20")], people, W, TODAY);
    expect(rows[0].lanes[0][0]).toMatchObject({ overdue: true, planEndCol: 7, endCol: 10 });
    expect(rows[1].lanes[0][0]).toMatchObject({ overdue: true, planEndCol: null, startCol: 0, endCol: 10, clippedStart: true });
  });
  it("skips items whose span misses the window", () =>
    expect(layoutRows([it_("1", "a", "2026-10-20", "2026-10-25")], people, W, TODAY)[0].count).toBe(0));
});
```

- [ ] **Step 2: Run** `npx vitest run tests/workload.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/workload.ts`.** Date maths on strings via the helpers exported from `calendar.ts`; `parseWeek` validates with a round trip (`fmt(utc(raw)) === raw`) so `2026-02-30` is rejected, then snaps with `weekdayOf`. Default uses `jakartaDate(now)`. Lane packing: sort a person's bars by `startCol`, then `endCol`, then id; put each in the first lane whose last bar's `endCol < startCol`. Person order: everyone (list + extra assignees from items) sorted by `name.localeCompare`, then by id; Unassigned last.

- [ ] **Step 4: Run** `npx vitest run tests/workload.test.ts tests/calendar.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(timeline): pure workload layout (window, spans, lanes)`

---

### Task 2: URL params

**Files:**
- Modify: `src/app/(app)/requests/params.ts`
- Test: `tests/requestParams.test.ts` (new `describe("timeline params")`)

**Interfaces:**
- Consumes: `parseWeek` (Task 1).
- Produces: `ViewParams.view` includes `"timeline"`; `ViewParams.week: string` (always set); `hrefWith` accepts `week` in its overrides.

- [ ] **Step 1: Write the failing tests** (`now = new Date("2026-10-08T05:00:00Z")`)

```ts
it("parses view=timeline and week", () => {
  expect(parseParams({ view: "timeline", week: "2026-10-14" }, now)).toMatchObject({ view: "timeline", week: "2026-10-12" });
  expect(parseParams({}, now).week).toBe("2026-09-28");
  expect(parseView("timeline")).toBe("timeline");
});
it("hrefWith emits week only for the timeline view", () => {
  const tl = parseParams({ view: "timeline", week: "2026-10-12" }, now);
  expect(hrefWith(tl, {})).toBe("/requests?view=timeline&week=2026-10-12");
  expect(hrefWith(tl, { week: "2026-10-19" })).toBe("/requests?view=timeline&week=2026-10-19");
  expect(hrefWith(tl, { week: undefined })).toBe("/requests?view=timeline");
  expect(hrefWith(tl, { view: "table" })).not.toContain("week");
  expect(hrefWith(parseParams({ view: "calendar", week: "2026-10-12" }, now), {})).not.toContain("week");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/requestParams.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror the `month` handling: `cur.week` only when `p.view === "timeline"`, deleted when `merged.view !== "timeline"`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): timeline view and week params`

---

### Task 3: Query

**Files:**
- Modify: `src/lib/requests.ts` (add after `listCalendarRequests`)
- Test: `tests/requestsQuery.test.ts` (new `describe("listTimelineRequests")`, same harness as the calendar block)

**Interfaces:**
- Produces: `type TimelineRow = CalendarRow & { assigneeId: string | null }`; `listTimelineRequests(db, filter: RequestFilter, range: { from: string; to: string; today: string }, now?: Date): Promise<TimelineRow[]>` ordered `requestedAt asc, deadline asc nulls last, id asc`.

- [ ] **Step 1: Write the failing tests.** Fixtures (requestedAt as Jakarta midnight `YYYY-MM-DDT00:00:00+07:00`): `run` (req 10-01, dl 10-14, assignee cre2), `overdue-old` (req 09-10, dl 09-20), `nodl` (req 10-02, no dl), `future` (req 10-20, dl 10-25), `done` (req 10-01, dl 10-05, DONE), `last-day` (req 10-11, dl 10-12). `range = { from: "2026-09-28", to: "2026-10-11", today: "2026-10-08" }`.

```ts
it("returns open requests whose bar meets the window, oldest request first", async () => {
  const rows = await listTimelineRequests(db.prisma, {}, range);
  expect(rows.map((r) => r.title)).toEqual(["overdue-old", "run", "nodl", "last-day"]);
  expect(rows[1]).toMatchObject({ assigneeId: cre2, requestDay: "2026-10-01", deadlineDay: "2026-10-14" });
});
it("for a future window needs a deadline on or after its first day", async () => {
  const rows = await listTimelineRequests(db.prisma, {}, { from: "2026-10-12", to: "2026-10-25", today: "2026-10-08" });
  expect(rows.map((r) => r.title)).toEqual(["run", "last-day", "future"]);
});
it("returns nothing for a closed status filter", async () =>
  expect(await listTimelineRequests(db.prisma, { status: "DONE" }, range)).toEqual([]));
it("applies the other filters", async () =>
  expect((await listTimelineRequests(db.prisma, { assigneeId: cre2 }, range)).map((r) => r.title)).toEqual(["run"]));
```

- [ ] **Step 2: Run** `npx vitest run tests/requestsQuery.test.ts -t listTimelineRequests` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §2 with `jakartaStart`, `OPEN_STATUSES`, `filterClauses`, `ROW_SELECT` plus `assigneeId: true`.
- [ ] **Step 4: Run** `npx vitest run tests/requestsQuery.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): listTimelineRequests query`

---

### Task 4: Timeline component and skeleton

**Files:**
- Create: `src/components/useNarrow.ts` (move `subscribeNarrow`/`narrowNow`/`useNarrow` out of `RequestCalendar.tsx`; Calendar imports it)
- Create: `src/components/RequestTimeline.tsx`, `src/components/timeline/TimelineChart.tsx`, `src/components/timeline/TimelineList.tsx`
- Modify: `src/components/RequestSkeletons.tsx` (add `TimelineSkeleton`)
- Test: `tests/requestTimeline.test.tsx`

**Interfaces:**
- Consumes: Task 1 exports, `TimelineRow` (Task 3), `StatusIcon`/`STATUS_LABEL` (`./status`), `Avatar`/`UnassignedAvatar`, `brandTone`, `EmptyState`, `buttonClass`, `cn`/`focusRing`.
- Produces: `RequestTimeline({ rows: TimelineRow[]; people: { id: string; name: string }[]; week: string; today: string; assigneeId?: string; prevHref: string; nextHref: string; todayHref: string; filtered?: boolean; clearHref?: string })` and `TimelineSkeleton()`.

DOM contract the tests rely on: range heading text `"28 Sep – 11 Oct 2026"` (en dash; both years shown when they differ: `"29 Dec 2025 – 11 Jan 2026"`); nav links named "Previous week" / "Next week" / "Today"; each person is `<section aria-labelledby>` with an `h3` "Adi" and a "N open" text, holding a `<ul>` of bar links; each bar is `<a data-bar={id} data-tone=… data-lane={n}>` with `grid-column` `${startCol + 1} / ${endCol + 2}`; the overdue tail is a child `[data-overdue-tail]` (tone `overdue`) with text "Overdue"; no-deadline bars have `data-no-deadline` and text "No deadline"; clipped ends render `[data-clipped="start"|"end"]` chevrons; header day cells `[data-day]` with `aria-current="date"` on today and `data-weekend` on weekends. Bar link SR text: `"<title>, <status>, requested 1 Oct, due 14 Oct"` / `"…, overdue since 5 Oct"` / `"…, no deadline"`. Narrow list: same sections, `<li>` lines with `"1 Oct → 14 Oct"`, empty people show "No open requests".

- [ ] **Step 1: Write the failing tests** (mock `matchMedia` like `requestCalendar.test.tsx`; `TODAY = "2026-10-08"`, `week = "2026-09-28"`; people Adi `a`, Bea `b`):
  - renders the range heading, the three nav links with the given hrefs, 14 `[data-day]` cells, today's `aria-current`, 4 `data-weekend` cells;
  - one section per person incl. Bea with "0 open", and an "Unassigned" section last for an unassigned row; no Unassigned section without one;
  - two overlapping bars for Adi get `data-lane` 0 and 1; the bar link points to `/requests/<id>`;
  - overdue row (deadline 10-05): `[data-overdue-tail]` with "Overdue", SR text contains "overdue since 5 Oct";
  - no-deadline row: `data-no-deadline`, text "No deadline";
  - a row requested 09-20 with deadline 10-20 shows both `[data-clipped="start"]` and `[data-clipped="end"]`;
  - narrow (`mockNarrow(true)`): no `[data-day]` grid, Adi's line shows "1 Oct → 14 Oct", Bea shows "No open requests";
  - no rows, not filtered: "No open requests in these two weeks" + Today link; filtered: "No requests match these filters in these two weeks" + "Clear filters" link to `clearHref`;
  - `TimelineSkeleton` renders `role="status"` "Loading timeline…" and `[data-skeleton-timeline]`;
  - `requestCalendar.test.tsx` still passes after the `useNarrow` move.
- [ ] **Step 2: Run** `npx vitest run tests/requestTimeline.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Chart: outer card `overflow-x-auto`, inner `min-w-[60rem]`; each row `grid grid-cols-[12rem_repeat(14,minmax(3.5rem,1fr))]`; weekend columns as a `bg-surface-muted` underlay; today column underlay uses the same accent classes as the Calendar's today cell (`DayCell.tsx`). Bars reuse the Calendar card shape (`border-l-4 border-l-tone-accent`, `data-tone={brandTone(...)}`, dashed for no deadline). Overdue tail width = `(endCol - planEndCol) / (endCol - startCol + 1)` of the bar (whole bar when `planEndCol` is null). Wide is the server snapshot of `useNarrow`.
- [ ] **Step 4: Run** `npx vitest run tests/requestTimeline.test.tsx tests/requestCalendar.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(timeline): RequestTimeline chart, phone list and skeleton`

---

### Task 5: Page wiring and verification

**Files:**
- Modify: `src/app/(app)/requests/page.tsx`
- Test: none new (covered by Tasks 2–4); browser check below.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/` for `searchParams`/`PageProps` if anything in the page's pattern is unclear.
- [ ] **Step 2: Wire it.** The closed-status override applies to `view === "timeline"` too. `const tlWindow = p.view === "timeline" ? buildWindow(p.week, today) : null`; query `listTimelineRequests(prisma, filter, { from, to, today })` in the `Promise.all`; fourth `SegmentedControl` item `{ value: "timeline", label: "Timeline", icon: <GanttChart aria-hidden="true" /> }` (use whichever Gantt icon name lucide 1.53 exports; check `node_modules/lucide-react`); `VIEW_LABEL.timeline = "Timeline"`; render `<RequestTimeline rows people={assignees} week={p.week} today assigneeId={p.assigneeId} prevHref={hrefWith(p, { week: shiftWeek(p.week, -1) })} nextHref={hrefWith(p, { week: shiftWeek(p.week, 1) })} todayHref={hrefWith(p, { week: undefined })} filtered clearHref />`; `ViewSkeleton` returns `<TimelineSkeleton />` for timeline.
- [ ] **Step 3: Browser check** with the dev server (`preview_start`) against the dev DB: `/requests?view=timeline` shows rows for the team and Unassigned, previous/next/today work, Assignee filter narrows to one row, `status=DONE` in the URL is ignored, 375px width shows the list; `read_console_messages` shows no errors. Screenshot.
- [ ] **Step 4: Full checks** — `npm test`, `npx tsc --noEmit`, `npx eslint src tests`, `npx next build`: all pass.
- [ ] **Step 5: Commit** `feat(requests): Timeline view tab`, then merge `feat/request-timeline` into `feat/creative-request-tracker`.
