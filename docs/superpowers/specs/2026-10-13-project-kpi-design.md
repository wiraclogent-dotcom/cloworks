# Project KPI — quarterly, per person

Date: 2026-10-13 · Branch: `feat/visual-refresh` (spec only) · Sub-project **E** of the
"Rework Project Page" todo (A+B statuses/tokens → **E** KPI → C project page → D brands).

## Goal

Score everyone who does project work (Emilia, Irsyad, Wira, and anyone added later) on the
project **items** a lead assigns them for the year, counted per quarter. **On time is the
headline**: late packaging means products go out of stock, so a late item has a real business
cost.

## Non-goals

- No combined Request + Project score. The two KPIs stay separate. A weighted mix can be added on
  top later without changing either one.
- Item complexity (number of variants) does not change the weight.
- No approval workflow for due-date changes.
- Past history is not rebuilt. Logging starts on the day this ships.
- No automatic targets. A lead picks the list.

## Definitions

| Term | Definition |
|---|---|
| **Item** | A product inside a project: the `ProjectTask` rows that share the same `title` (existing `productSummaries` rollup). |
| **Target** | A lead assigns (person, year, project, item title). The same item may be a target for more than one person. |
| **Due date** | The *current* latest `dueDate` across the item's rows that aren't cancelled. |
| **Quarter** | The quarter of the due date, in Asia/Jakarta time. If every row is TBC or has no date, the item goes in **Unscheduled** and is flagged. The quarter moves when the due date moves. |
| **Done** | Every row that isn't cancelled is at `FINAL_ARTWORK` (stage-mode items) or `DONE` (status-mode items). This uses `isTaskDone` in `projectProgress.ts`. |
| **Finish date** | The time of the event that made the last remaining row done. If a row later leaves done, the item is no longer done and the finish date clears. |
| **Start date** | The earliest `startDate` across the item's rows. If there is none, the time of the first stage/status event that moves off `NOT_STARTED`. |
| **On time** | Finish date is on or before the end of the due date (Jakarta, 23:59:59). Judged against the **current** due date. |
| **Late** | Finished after the due date, **or** not done when the due date has already passed. An overdue item counts as late straight away. |
| **Revision** | A stage event where the new stage comes earlier in the pipeline than the old one (`CANCELLED` doesn't count). For status mode: moving from `DONE` or `IN_REVIEW` back to `IN_PROGRESS` or `NOT_STARTED`. |
| **Slip** | A DUE event that moves a row's due date later. Several rows moved together in one action count as **one slip for the item** (grouped by item + actor within 1 minute). |

## Data model (one migration)

```prisma
enum ProjectTaskEventKind { STAGE STATUS DUE }

/// Change log for project task rows. Feeds finish dates, revisions and slips for the Project KPI.
model ProjectTaskEvent {
  id        String               @id @default(cuid())
  taskId    String
  kind      ProjectTaskEventKind
  fromValue String?   // stage/status enum name, or ISO date for DUE
  toValue   String?
  actorId   String
  at        DateTime             @default(now())

  task  ProjectTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actor User        @relation(fields: [actorId], references: [id])

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([taskId, at])
  @@index([workspaceId])
}

/// A project item a lead assigned to a person for a year. Its quarter comes from the item's due date.
model ProjectKpiTarget {
  id          String   @id @default(cuid())
  userId      String
  year        Int
  projectId   String
  itemTitle   String
  createdById String
  createdAt   DateTime @default(now())

  user      User    @relation("ProjectKpiTargetUser", fields: [userId], references: [id])
  createdBy User    @relation("ProjectKpiTargetCreator", fields: [createdById], references: [id])
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([userId, year, projectId, itemTitle])
  @@index([workspaceId, year])
}
```

**Writing events.** These existing task actions in `src/app/(app)/projects/[id]/tasks/actions.ts`
write an event in the same transaction as the update, but only when the value actually changes:

- `setTaskStage` → STAGE
- `setTaskStatus` → STATUS
- `setTaskDate` → DUE (due field only; start-date changes are not logged)

`createTaskDetail` logs nothing; a new row has no history yet. Any later sub-project that adds a
new way to change stage, status or due date (for example inline editing on the project page in C)
must go through the same helper, `recordTaskChange()` in `src/lib/projectTaskEvents.ts`.

**Renames.** When an action renames an item's `title` (`setTaskDetail` changing the title of every
row in the group), the same transaction also updates any `ProjectKpiTarget.itemTitle` for that
project.

## Scoring (`src/lib/kpi/projectScore.ts`, pure functions)

Input: one person's targets with their rows and events, a quarter, `now`, and team-wide finished
cycle times for the same quarter. Output: score 0–100, the five part scores, counts, and the list of
parts that had no data.

| Part | Weight | Formula | No data when |
|---|---|---|---|
| On time | 50% | on-time items ÷ (done items with a known finish date + overdue open items) × 100 | the denominator is 0 |
| Completion | 20% | mean item progress × 100, where item progress = mean of row progress, and a row's progress = stage index ÷ 5 (`NOT_STARTED`=0 … `FINAL_ARTWORK`=5; status mode: `NOT_STARTED` 0, `IN_PROGRESS` .5, `IN_REVIEW` .8, `DONE` 1, `ON_HOLD` .5) | no targets in the quarter |
| Speed | 10% | `min(100, 100 × teamMedian ÷ personMedian)`, using start→finish days | person has no tracked finish, or the team has fewer than 3 tracked finishes in the quarter |
| Revisions | 10% | `max(0, 100 − 25 × revisions ÷ items)` | no targets |
| Slips | 10% | `max(0, 100 − 25 × slips ÷ items)` | no targets |

- When a part has no data, its weight is shared among the other parts in proportion to their
  weights. The result lists the skipped parts, and the UI shows "Based on N of 5 measures".
- **Year score:** the quarter scores averaged, weighted by the number of items in each quarter.
  Unscheduled items are left out of the year score but shown.
- **Items finished before tracking** (done, with no event showing when) count in Completion,
  Revisions and Slips (as 0). They are left out of On time and Speed, and labelled
  "finished before tracking".
- **Fully cancelled items** (every row cancelled) are left out of the score and labelled "cancelled".
- **Removed items** (no rows left for the title) are left out and labelled "item removed". A lead can
  clear them.
- Rows count, not the project status. A project marked `DONE` whose rows are not all final is not done.

## Pages

The Project KPI sits inside the existing KPI area. No new sidebar entry.

- **My KPI** (`/dashboard`) and **Team KPI** (`/dashboard/team`) get a **Requests | Projects**
  `SegmentedControl`, kept in `?view=projects`. The default is Projects when the person has project
  targets this year and no request work. People with both, such as Irsyad (senior designer: daily
  design work + projects), switch between the two.
- **Team KPI › Projects:** a year picker, then one row per person with targets that year. Columns:
  Q1–Q4 scores, year score, items done / total, on time %. Clicking a row opens the person page.
- **Person page** `/dashboard/projects/[userId]?year=&q=` (My KPI › Projects shows this for the
  current user):
  - Score header (Bricolage display number with `CountUp`) and five part tiles (`KpiTile`), plus the
    "Based on N of 5" note.
  - Tabs: Q1, Q2, Q3, Q4, Unscheduled. The current quarter is selected by default.
  - Target rows: project › item, stage `ProgressBar`, due date + `DeadlineChip`, a badge (on time /
    late / in progress / finished before tracking / cancelled / removed), slip count, revision count.
    Each row links to `/projects/[id]` (it deep-links to the item once sub-project C exists).
  - "Other work" (collapsed): items where the person owns rows but which are not targets. Not scored.
- **Manage targets** (needs `dashboard.team`): a button on the person page opens a `Modal`. Pick a
  project, then tick its items. Items already assigned to someone else are labelled. Each target row
  has a remove ×. Server actions live in `src/app/(app)/dashboard/projects/actions.ts`.

## Permissions (existing actions, no new roles)

| Action | Who | Allows |
|---|---|---|
| `dashboard.self` | everyone | own Projects KPI |
| `dashboard.teamView` | everyone | Team › Projects table |
| `dashboard.team` | LEAD, ADMIN | open anyone's person page, manage targets |

Target actions check `dashboard.team` on the server. They also check that the project belongs to
the workspace (scoped client) and that the item title exists in that project.

## Testing

- **Unit (`projectScore.test.ts`), the core:** each part formula; weight sharing; the
  overdue-but-open rule; the current-due-date on-time rule after a slip; Unscheduled bucket; year
  roll-up; finished-before-tracking; cancelled and removed items; revision detection for stage and
  status modes; slip grouping.
- **Actions:** the stage, status and due actions write exactly one event when the value changes and
  none when it doesn't; a rename carries targets over; a target action fails without
  `dashboard.team`.
- **Browser check:** Team › Projects table, person page tabs, Manage targets modal, light and dark.

## Rollout

1. One Prisma migration (enum + 2 tables + relations on `User`, `Project`, `ProjectTask`,
   `Workspace`).
2. The event log starts from the deploy. Existing finished items show as "finished before tracking".
3. On production, Wira sets Emilia's 2026 targets through Manage targets (no seed script). The
   targets are Laundry Pods Regular 4, Regular 30, Regular 50, Lite 24, Underwear Detergent 100ml,
   Cloghome 200 Kerucut, Cloghome 200 Persegi, Cloghome 400, Absorbent Paper, Washing Machine Cleaner.

## Open follow-ups (not in this spec)

- Weights editable in settings (fixed constants in `projectScore.ts` for now).
- Deep-link from a target row to the item on the redesigned project page (sub-project C).
