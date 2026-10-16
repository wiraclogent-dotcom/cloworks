# Brief Calendar — design

Date: 2026-10-10 · Status: approved in brainstorming

## Purpose

Leads and admins need to see, day by day, whether each social media specialist sent at least one brief
(submitted a request). The social media team are requesters, not assignees: 312 of the 553 requests in the
database were submitted by Rifqy, Fafa and Syahda. The page answers "who briefed today / this month, and who
missed a day?" at a glance.

## Decisions

| Topic | Decision |
|---|---|
| "Briefed a day" | The person submitted ≥ 1 request whose `requestedAt`, as a Jakarta calendar date, is that day. No time of day (old requests are date-only). |
| Request types | All types count (Social Media, General Design, Motion Support). |
| Status | All statuses count, including CANCELLED — the brief was still sent. |
| People | Active users with `jobRole = SOCIAL_MEDIA` and `appRole` in (REQUESTER, CREATIVE). Today: Rifqy, Fafa, Syahda. Leads/admins (e.g. Idzni) are excluded automatically. Sorted by name. |
| Access | Same rule as Team KPI: `can(appRole, "dashboard.team")` (LEAD, ADMIN). Others get `AccessDenied`. |
| Work week | Monday to Saturday (updated 2026-10-10: the team works Saturdays). Sunday is the day off: shown greyed, never flagged as missed; dots appear only if something was sent. |
| Future days | Dimmed, no "missed" dots. |
| Holidays | Not modelled; treated as weekdays. |
| Schema | No changes, no migrations. |

## Page

- Route: `src/app/(app)/dashboard/briefs/page.tsx` → `/dashboard/briefs?month=YYYY-MM`.
- Title "Brief Calendar"; breadcrumb Insights › Brief Calendar; header actions: the existing `MonthPicker`
  (`action="/dashboard/briefs"`), defaulting to the current Jakarta month via the existing `parseMonthParam`.
- Sidebar: a `BriefCalendarItem` nav entry under Insights right after Team KPI, shown only when
  `can(appRole, "dashboard.team")`; the page re-checks on the server.
- Loading state: a skeleton in the same style as `TeamKpiSkeleton`, via `Suspense`.

## Data

`src/lib/briefCalendar.ts` — pure, client-safe, unit-tested:

- `type BriefPerson = { id: string; name: string }`
- `type BriefItem = { id: string; title: string; requesterId: string; requestDay: string; typeName: string; status: RequestStatus }`
  where `requestDay` is the Jakarta `YYYY-MM-DD` (reuse `jakartaDate` from `createRequest.ts`).
- `buildBriefMonth(month, today, people, items)` returns:
  - `days`: the Monday-first month grid (reuse `src/lib/calendar.ts` grid helpers), each day with
    `{ day, inMonth, isToday, isWeekend, isFuture, perPerson: { personId, count }[] }`.
  - `summary`: per person `{ personId, weekdaysBriefed, weekdaysElapsed, briefs }`, where `weekdaysElapsed`
    counts in-month Mon–Fri days up to and including today (all weekdays for a past month, 0 for a future month).
  - `itemsByDay`: `Record<day, BriefItem[]>` for the day dialog.

Server query (in the page or a small `loadBriefMonth(db, month)` beside it): the scoped `db` from
`requireScope()`; users per the People rule; requests with `requesterId in people` and `requestedAt` inside
`monthBounds(month)` (Jakarta month bounds from `kpi/months.ts`), selecting id, title, requesterId,
requestedAt, status, type name.

## UI

`src/components/briefs/BriefCalendar.tsx` (client component):

- Legend: each person's colour swatch + name. Fixed order everywhere (people sorted by name).
- Summary tiles, one per person: "7 / 8 weekdays · 21 briefs".
- Grid (≥ narrow breakpoint): each cell shows the date and one dot per person.
  - Filled dot = ≥ 1 brief; count badge when > 1.
  - Outlined, empty dot = weekday in the past or today with no brief (shape, not only colour, signals it).
  - Weekend cells greyed; future cells dimmed; neither shows empty dots.
  - Out-of-month cells faded and blank; today highlighted.
- Cell is a button with `aria-label`, e.g. "Wednesday 8 October: Rifqy 0, Fafa 2, Syahda 1".
- Clicking a day opens a dialog (same dialog primitive as `calendar/DayDialog.tsx`) listing that day's requests
  grouped by person — title (link to `/requests/[id]`), type, status chip — and "No brief" for people with none.
- Narrow screens (`useNarrow`): an agenda list of in-month days (date + per-person counts), same pattern as
  `CalendarAgenda`.
- Empty state if no social media people exist.

## Testing

- `tests/briefCalendar.test.ts`: Jakarta day boundary (a request at 17:00 UTC lands on the next Jakarta day);
  people filter; weekend and future rules; summary counts for past, current and future months; grouping.
- `tests/briefCalendarPage.test.tsx`: grid renders dots and labels for given data; day dialog lists requests;
  access-denied for a REQUESTER.
- Manual check in the browser against local data (e.g. 8 Oct 2026 shows Syahda's briefs).

## Out of scope

Daily targets, public holidays, notifications/reminders for missed days, editing from this page.

## Update 2026-10-10: everyone's briefs, a month summary and a weekly table

Anyone can give a brief now, not only the social media team, so the per-person "X / Y work days" tiles, the
coloured per-person circles and the "missed day" idea are gone.

- **People:** every requester with at least one request in the month (no job-role filter). `listBriefPeople`
  is removed; `loadBriefItems(db, month)` loads all requests in the Jakarta month with the requester's name.
- **Month summary** (replaces the tiles): Briefs this month · Today (— outside the current month) · Per work day
  (briefs up to today ÷ elapsed Mon–Sat days, one decimal; — before the first work day) · Busiest day (earliest
  on a tie). Under it: briefs by request type, most first.
- **Briefs per requester, per week:** one row per requester, most briefs first then by name; one column per
  calendar row, labelled by its in-month days (e.g. "5–11 Oct", Sunday included); weeks not started show "–";
  a Total column. Empty month: "No briefs this month yet."
- **Grid:** each day shows its brief count ("3 briefs"), nothing on a day without briefs; Sunday and future
  styling unchanged. The day dialog groups that day's briefs by who sent them ("No briefs this day." if none).
- The legend is removed.

### Visual refresh (2026-10-10)

- Summary is one card: the month total with a bar per day underneath (busiest day solid, future days flat),
  and Today / Per work day / Busiest day beside it, plus a stacked bar of briefs by type.
- The weekly table is a heat map: each cell is tinted in four steps relative to the busiest cell; each row
  starts with the person's circle.
- The calendar's per-person circles are back (avatar colour, count inside above 1), only for people who briefed
  that day, at most four then "+N", with the day's total in the corner and the hover tooltip as before. A legend
  lists the month's requesters.
