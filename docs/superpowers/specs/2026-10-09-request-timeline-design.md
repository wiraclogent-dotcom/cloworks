# Request Timeline view (workload per person) — design

Date: 2026-10-09 · Owner: Wira (Creative Director) · Status: design agreed in chat, awaiting spec review

## Goal

Add a **Timeline** view to Requests that shows who is working on what over the next days: one row per person, one
bar per open request from the day it was requested to its deadline. This is round 2 of "more request views" (round 1
was the Calendar, `2026-10-08-request-calendar-design.md`). View-only this round.

Decisions made in brainstorming:

| Question | Decision |
|---|---|
| Purpose | Workload per person (the Calendar is the deadline overview) |
| Which requests | Open only: Requested, On progress, First look |
| Rows | One per active creative-team member (also when they have no work) + "Unassigned" |
| Window | 2 weeks, one column per day, Monday start, Jakarta days. Default: last week + this week |
| Navigation | ‹ / › move one week, **Today** returns to the default |
| Overlapping bars | Stack into lanes; the row grows (nothing hidden) |
| Overdue | Normal bar to the deadline, then an overdue-tone tail up to today labelled "Overdue" |
| No deadline | Dashed bar ending at today, labelled "No deadline" |
| Phone (< 640px) | Per-person list, no horizontal scrolling |
| Interaction | None beyond links (no drag to reassign or reschedule) |
| Migration | None |

Real data on 2026-10-08: 29 open requests, 6 without a deadline, 12 unassigned, every span 1–8 days. A day-scale
two-week window fits; same-person overlap is common, hence lanes.

## 1. URL and parameters

- `?view=timeline&week=YYYY-MM-DD`. `ViewParams.view` widens to `"board" | "table" | "calendar" | "timeline"`;
  `parseView` accepts `"timeline"`.
- `ViewParams.week: string` is the **Monday** the window starts on. `parseWeek(raw, now)` in `src/lib/workload.ts`:
  a valid `YYYY-MM-DD` between 2000 and 2100 is snapped back to its own Monday; anything else gives the default,
  the Monday of the week **before** today's Jakarta week.
- `hrefWith` carries `week` only for the timeline view (like `month` for the calendar) and drops it on any other view.
  "Today" is the same URL with `week` removed (`hrefWith(p, { week: undefined })`), which resolves to the default.
- All other filters apply. As on the Calendar, a closed status (Done, Cancelled) in the URL is ignored in this view
  (query, filter bar and the "filtered" flag).

## 2. Data

### Bar span rule

For an open request, with Jakarta days:

- `start = requestDay` (Jakarta day of `requestedAt`)
- `planEnd = deadlineDay` (null when there is no deadline)
- `end = max(planEnd ?? today, today)` — i.e. the deadline when it is today or later; today when the request is
  overdue or has no deadline.

A request is drawn when `start <= windowEnd` and `end >= windowStart`.

### Query `listTimelineRequests(db, filter, { from, to, today })` in `src/lib/requests.ts`

- Returns `[]` when the status filter is a closed status.
- Where: status in the open statuses (or the open status filter), `requestedAt < jakartaStart(to, 1)`, and — only
  when `today < from` (a future window) — `deadline >= jakartaStart(from)`. When `today >= from` every open request
  started by `to` ends on or after today, so it intersects. Plus `filterClauses(filter)`.
- Order: `requestedAt asc`, `deadline asc nulls last`, `id asc`.
- Row type `TimelineRow = CalendarRow & { assigneeId: string | null }` (the select adds `assigneeId`, so two people
  with the same name stay separate rows).

### People

The page already loads the active creative-team users (`appRole != REQUESTER`, active) for the Assignee filter; the
timeline reuses that list. Rows, in order:

1. With an Assignee filter: only that person (even when inactive or with no bars; name from the list or the rows).
2. Otherwise every listed team member, sorted by name, **including those with no bars** (free capacity is visible),
   plus any assignee that appears in the rows but is not in the list (e.g. deactivated), sorted in by name.
3. **Unassigned** last, only when it has bars.

## 3. Pure layout — `src/lib/workload.ts` (client-safe, no Prisma)

- `parseWeek(raw, now)`, `defaultWeek(today)`, `shiftWeek(week, delta)` (±7 days per step).
- `buildWindow(week, today)` → 14 `{ day, weekday (0 = Mon), isToday, isDayOff }` (Sunday only), plus `from` and `to`.
- `barSpan(row, today)` → `{ start, planEnd, end, overdue, noDeadline }` per the rule above.
- `layoutRows(rows, people, window, today)` → per person `{ key, name, assigneeId | null, count, lanes: Bar[][] }`
  where each `Bar` has `id`, `startCol`, `endCol` (inclusive, clamped to 0–13), `planEndCol` (the deadline column
  when the request is overdue and its deadline falls inside the window, else null), `clippedStart`, `clippedEnd`,
  `overdue`, `noDeadline`. Lane packing is greedy: bars sorted by start, then end, each placed in the first lane whose
  last bar ends before it starts. `count` is the number of that person's bars in the window.

All date maths on `YYYY-MM-DD` strings via UTC noon, like `src/lib/calendar.ts` (whose `pad/utc/fmt` helpers get
exported for reuse rather than duplicated).

## 4. Screen

### Header

Fourth tab in the view switcher: Board / Table / Calendar / **Timeline** (lucide `GanttChart`-style icon). Breadcrumb
label "Timeline". Above the chart: the range as a heading ("28 Sep – 11 Oct 2026"), ‹ "Previous week",
› "Next week", **Today** — same layout and link styles as the Calendar's month bar.

### Chart (≥ 640px)

- A label column (~12rem) and a 14-column CSS grid. Header cells show weekday + date ("Mon 5"); Sunday columns (the only day off; the team works Monday–Saturday) get
  a muted background; today's column gets the Aqua accent the Calendar uses for today. The whole chart sits in a
  horizontally scrollable card with a min width so day columns never get narrower than ~3.5rem.
- Person row: avatar (or unassigned avatar), name, "N open". Then one line per lane (minimum one line, so empty people
  still get a visible, empty row).
- Bar: a link to `/requests/[id]` placed with `grid-column`. Card styling like the Calendar card: brand-tone left
  edge (`brandTone`), status icon, single-line truncated title, `title` tooltip with the full title and range.
  - **Overdue**: the part up to the deadline in the normal style, the part after it (to today) in the `overdue` tone
    with the label "Overdue". When the deadline is before the window, the whole visible bar is the tail.
  - **No deadline**: dashed border, ends at today, label "No deadline".
  - **Clipped** at a window edge: a ‹ or › chevron at that end.
- Accessibility: each person is a section with a heading (name + count) and a list of their bar links; each link has
  screen-reader text with the dates ("requested 1 Oct, due 14 Oct", "overdue since 5 Oct", "no deadline") and status.
  Colours are tokens only; tone meaning is always repeated in text.

### Phone (< 640px)

The same person sections as a list (`useNarrow` like `RequestCalendar`; the server snapshot is the chart). Each
request is a line: title, status icon, "1 Oct → 14 Oct", plus an Overdue / No deadline label. Empty people are
listed with "No open requests".

### Empty states

- No bars in the window, no filters: `EmptyState` "No open requests in these two weeks" with a Today link.
- No bars with filters: "No requests match these filters in these two weeks" with Clear filters.

(People rows are still meaningful when empty, but a chart of only empty rows says nothing the empty state does not.)

### Loading

`TimelineSkeleton` in `RequestSkeletons.tsx` (header, range bar, label column + 14 columns with a few bar
placeholders), used by `ViewSkeleton` for `view=timeline`. Clock-free, like `CalendarSkeleton`.

## 5. Edge cases

- Request requested in the future relative to the window, or deadline before the request day (bad data): `start`
  wins; a bar with `end < start` is drawn as a single day at `start`.
- Deadline today: not overdue, ends today.
- Window entirely in the past: still shows open requests that span it (all open requests end at or after today, so a
  past window shows those started on or before its end).
- Very many requests for one person: the row grows; no cap this round.

## 6. Testing (test-first)

- `tests/workload.test.ts`: `parseWeek` (valid, snapping to Monday, invalid, out-of-range, default = last week's
  Monday), `shiftWeek`, `buildWindow` (14 days, Sundays off, today), `barSpan` (future deadline, today, overdue, no
  deadline, bad data), `layoutRows` (lanes, clipping both sides, `planEndCol`, people order, empty people, inactive
  assignee, Unassigned only when non-empty, Assignee filter).
- `tests/requestParams.test.ts`: `view=timeline`, `week` parsing, `hrefWith` keeps `week` only on the timeline and
  drops it on other views; Today link has no `week`.
- `tests/requestsQuery.test.ts` (same harness as `listCalendarRequests`): open-only, closed status → `[]`, window
  bounds, future window needs `deadline >= from`, filters applied, `assigneeId` present.
- `tests/requestTimeline.test.tsx`: header/range/nav links, rows incl. empty people and Unassigned, lanes, overdue
  tail and label, no-deadline bar, clipped chevrons, phone list, both empty states, skeleton.
- Browser: `/requests?view=timeline` against the dev DB, previous/next/today, a filter, phone width; no console
  errors. Then `npm test`, `npx tsc --noEmit`, `npx eslint src tests`, `npx next build`.

## Out of scope

Drag to reassign or reschedule, capacity limits or hours, closed requests, zoom levels, notifications, sidebar
search, reporting (later rounds).
