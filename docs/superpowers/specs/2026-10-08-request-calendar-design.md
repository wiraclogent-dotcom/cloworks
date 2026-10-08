# Request Calendar view with drag-to-reschedule — design

Date: 2026-10-08 · Owner: Wira (Creative Director) · Status: approved in chat, awaiting spec review

## Goal

Add a **Calendar** view to Requests so the team can see open work by deadline and move deadlines by dragging.
This is round 1 of "more request views"; the **Timeline** (workload, one row per person) is round 2 and out of
scope here.

Decisions made in brainstorming:

| Question | Decision |
|---|---|
| Purpose | Calendar = deadline overview; Timeline (later) = workload per person |
| Which requests | Open only: Requested, On progress, First look |
| No deadline | Shown on **today**, marked "No deadline" |
| Interaction | Drag a card to another day changes its deadline |
| Who can drag | Creative, Lead, Admin (`request.transition`, same as Board moves) |
| KPI | On-time KPI uses the **original** deadline; moves never change KPI |
| Build approach | Custom grid + existing `@dnd-kit`; no calendar library |

## 1. Data and server

### Schema (one Prisma migration)

- `Request.originalDeadline DateTime?` — set on the **first** reschedule to the deadline before the move; never
  changed afterwards. `null` means the current deadline is the original (all imported history and never-moved
  requests), so no backfill is needed.
- New model `DeadlineEvent { id, requestId, from DateTime?, to DateTime, actorId, at @default(now()) }`, relations
  and `onDelete: Cascade` mirroring `StatusEvent`, `@@index([requestId])`.
- `NotificationType` (TypeScript union in `src/lib/notify.ts`, not a DB enum) gains `"DEADLINE"` with subject
  "Deadline changed". No migration needed for this.

### KPI

`src/lib/kpi/metrics.ts` on-time check uses `originalDeadline ?? deadline`; `src/lib/kpi/queries.ts` selects
`originalDeadline`. Everything else (DeadlineChip, days left, sorting, Board, Table, Calendar placement) keeps using
the **current** `deadline`.

### Server action `rescheduleRequest(requestId, date: "YYYY-MM-DD")`

In `src/app/(app)/requests/actions.ts`, logic in a testable `rescheduleRequestWith(requireUser, db, …, notifier)` in
`src/lib/reschedule.ts`, same pattern as `moveRequestWith`. Returns `{ ok: true } | { ok: false, code, message }`.

Rules, in order:
1. Unauthenticated → `UNAUTHENTICATED`.
2. Role lacks `request.transition` → `FORBIDDEN`.
3. Request missing → `NOT_FOUND`.
4. Status not open → `CLOSED` ("This request is already done/cancelled.").
5. Invalid date, or Jakarta day earlier than the request's `requestedAt` day → `INVALID_DATE`.
6. Same Jakarta day as the current deadline → `{ ok: true }`, no write, no event, no notification.

On success, one transaction: update `deadline` (Jakarta midnight of the chosen day, stored the same way
`createRequest` stores deadlines), set `originalDeadline` if it is `null` **and** a deadline existed, create a
`DeadlineEvent`. After commit, notify the assignee, and the requester if they are not the actor (actor never
notified): "Wira moved *Title* from 10 Oct to 14 Oct" (or "set the deadline of *Title* to 14 Oct" when there was
none). `revalidatePath("/requests")` and the request's detail path.

### Request detail page

The existing timeline merges `statusEvents` and `deadlineEvents`, sorted by time. Deadline entries read
"Deadline moved from 10 Oct to 14 Oct · Wira". The **Manage** card gets a "Change deadline" date field (same action,
same permission, open requests only); this is also the phone path for rescheduling.

## 2. Calendar screen

- Third tab in the Requests view switcher: Board / Table / **Calendar** (`?view=calendar&month=YYYY-MM`).
  `ViewParams.view` widens to `"board" | "table" | "calendar"`; `hrefWith` carries `month` only for the calendar.
- All existing filters apply. The status filter offers only the three open statuses in this view; a closed status in
  the URL is ignored.
- Month grid, Monday–Sunday, Jakarta days. Header: month name as heading, ‹ previous, next ›, **Today**. Leading and
  trailing days from neighbouring months are shown muted (and also populated).
- Day cell: up to 3 cards then "+N more", which opens a dialog (reusing `ui/Modal` styling, not a route) listing all
  cards for that day.
- Card: title, brand-tone left edge (`brandTone`), assignee avatar (or unassigned avatar), `StatusIcon`. Overdue
  (deadline before today, still open) uses the `overdue` tone. No-deadline cards appear on today with a dashed border
  and a "No deadline" label. Click → `/requests/[id]`.
- Today's cell: Aqua accent. Colours are tokens only.

### Dragging

- `@dnd-kit` with pointer, touch and keyboard sensors, like `Board.tsx`. Day cells are droppables keyed by
  `YYYY-MM-DD`. Days earlier than the card's request day are disabled targets.
- Screen-reader announcements in the style of `src/lib/boardA11y.ts` ("Picked up *Title*", "Over Tuesday 14 October",
  "Moved to Tuesday 14 October" / "Move cancelled").
- Optimistic move; on `{ ok: false }` the card returns and the server message shows in an `Alert` (live region).
- Users without `request.transition` see the calendar with non-draggable cards.

### Narrow screens (< 640px)

Agenda list of days that have cards (same month navigation), no dragging. Rescheduling on phones is via the request
page's Manage card.

## 3. Loading, edge cases, testing

### Data loading

`listCalendarRequests(db, filter, { from, to, today })` in `src/lib/calendar.ts`: open requests with `deadline` in the
visible grid range (≈6 weeks), plus open no-deadline requests when the range contains today. Returns
`RequestRow`-shaped rows plus `requestedAt`. `?month` parsing: valid `YYYY-MM` between 2000 and 2100, otherwise the
current Jakarta month. Suspense fallback `CalendarSkeleton` in `RequestSkeletons.tsx`. After a successful drop,
`router.refresh()`.

### Edge cases

- Concurrent moves: last write wins; both recorded as events.
- Request closed meanwhile: `CLOSED` message, card snaps back.
- Same-day drop: no-op.
- Empty month: `EmptyState` "Nothing due in October" with a Today link.
- Time zones: all day maths via the existing Jakarta helpers (`jakartaDate` in `src/lib/createRequest.ts`).

### Tests (TDD)

- Unit: grid builder (month boundaries, Monday start, leap years, 5 vs 6 weeks), day bucketing with 3 + "+N more",
  no-deadline → today, overdue tone, `?month` parsing, every `rescheduleRequestWith` rule above, first move sets
  `originalDeadline` and later moves do not, KPI on-time uses the original deadline.
- Component: keyboard drag + announcements, snap-back on server error, read-only for requesters, narrow agenda layout.
- Browser: drag a card in the running app; check the deadline, detail timeline entry, notification row, and that
  My KPI is unchanged.

## Out of scope

Timeline view (round 2), week view, drag to reassign, recurring requests, editing deadlines of closed requests.
