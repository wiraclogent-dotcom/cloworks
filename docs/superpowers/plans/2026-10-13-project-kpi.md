# Project KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quarterly, per-person Project KPI. A lead picks project items as yearly targets, and each person is scored 0–100 per quarter (50% on time, 20% completion, 10% speed, 10% revisions, 10% slips).

**Architecture:**
- **Data:** a new `ProjectTaskEvent` log is written by the existing task actions through a single helper. A new `ProjectKpiTarget` table holds the lead-picked items.
- **Logic:** two pure modules. `projectItems.ts` turns rows + events into per-item facts. `projectScore.ts` turns facts into scores. Database loaders feed them.
- **UI:** a Projects view inside the existing KPI pages, plus a person page with a Manage-targets modal.

**Tech Stack:** Next 16.4 (App Router, server actions), React 19.3, Prisma 6 / Postgres, Vitest + embedded-postgres (`tests/helpers/testDb.ts`), Tailwind v4 tokens, app kit in `src/components/ui/`.

**Spec:** `docs/superpowers/specs/2026-10-13-project-kpi-design.md`

## Global Constraints

- Weights are exact constants: `onTime 0.5, completion 0.2, speed 0.1, revisions 0.1, slips 0.1`.
- **Dates and quarters:** dates use Asia/Jakarta. A day ends at `23:59:59.999+07:00`. Reuse `jakartaDay` / `jakartaIso` from `src/lib/projectTasks.ts`.
- **On time** is judged against the item's **current** due date. An item that is overdue and still open counts as late right away.
- **Rows count, not the project status.** Cancelled rows (`stage === "CANCELLED"`) are left out of an item.
- **Workspaces:** every new model carries `workspaceId` and is added to `SCOPED_MODELS` in `src/lib/db.ts`. Code uses `dbFor(user)` / `requireScope()`, never the raw `prisma`.
- **Permissions:** no new roles or actions.
  - `dashboard.self`: own page.
  - `dashboard.teamView`: team table.
  - `dashboard.team`: other people's pages and managing targets.
- **Server actions** return `{ ok: false, code, message }` instead of throwing, and are wrapped in `withUser(requireUser, …, unauthResult)`.
- **No new runtime dependencies.** UI uses the app kit (`Card`, `KpiTile`, `CountUp`, `ProgressBar`, `DeadlineChip`, `Modal`, `SegmentedControl`, `EmptyState`, `tableClass`) and token classes only.
- Leave the `AGENTS.md` block written by `next dev` untouched.

## Review Focus

1. **An item with some TBC rows and some dated rows.** The due date is the latest *dated* row, and the quarter comes from it. The item is Unscheduled only when no live row has a date. Test in Task 3.
2. **A due date moved earlier or cleared.** Not a slip. Only a later date counts. Clearing logs a DUE event to `null` but doesn't count as a slip. Test in Task 3.
3. **A stage set to its current value.** Writes no event, so it doesn't create phantom revisions or reset the finish date. Test in Task 2.
4. **An item due on 31 Dec in Jakarta**, which is still 30/31 Dec in UTC. It belongs to Q4 of that year, not Q1 of the next. Test in Task 3.
5. **A target naming a project from another workspace, or an item title not in that project.** Refused with `NOT_FOUND` and nothing written. Test in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261013120000_project_kpi/` | enum + 2 models + back-relations |
| `src/lib/db.ts` | add `ProjectTaskEvent`, `ProjectKpiTarget` to `SCOPED_MODELS` |
| `src/lib/projectTaskEvents.ts` (new) | `recordTaskChange()`; target carry-over on rename |
| `src/app/(app)/projects/[id]/tasks/actions.ts` | call the helper from stage / status / due / title changes |
| `src/lib/kpi/projectItems.ts` (new, pure) | quarters, item facts from rows + events |
| `src/lib/kpi/projectScore.ts` (new, pure) | part scores, weighting, year roll-up |
| `src/lib/kpi/projectQueries.ts` (new) | load facts for one person / the team for a year |
| `src/lib/kpi/projectTargets.ts` (new) | add / remove target logic (permission + validation) |
| `src/app/(app)/dashboard/projects/actions.ts` (new) | server-action wrappers |
| `src/app/(app)/dashboard/projects/[userId]/page.tsx` (new) | person page |
| `src/components/kpi/project/*` (new) | `ProjectScoreHeader`, `TargetList`, `ManageTargetsModal`, `ProjectTeamTable`, `KpiViewToggle` |
| `src/app/(app)/dashboard/page.tsx`, `dashboard/team/page.tsx` | Requests / Projects toggle |

---

### Task 1: Schema, migration, workspace scoping

**Files:**
- Modify: `prisma/schema.prisma` (after `ProjectMilestone`, ~L440; add back-relations on `User`, `Project`, `ProjectTask`, `Workspace`)
- Create: `prisma/migrations/20261013120000_project_kpi/migration.sql`
- Modify: `src/lib/db.ts` (`SCOPED_MODELS`)
- Test: `tests/workspaces.test.ts` (extend the existing per-model isolation cases)

**Interfaces:**
- Produces:
  - Prisma models `ProjectTaskEvent { id, taskId, kind: ProjectTaskEventKind, fromValue: string|null, toValue: string|null, actorId, at }`
  - `ProjectKpiTarget { id, userId, year, projectId, itemTitle, createdById, createdAt }` with unique `[userId, year, projectId, itemTitle]`
  - enum `ProjectTaskEventKind = STAGE | STATUS | DUE`
  - Exact Prisma text is in the spec, "Data model".
  - `User` gets the relations `projectKpiTargets` ("ProjectKpiTargetUser"), `projectKpiTargetsCreated` ("ProjectKpiTargetCreator") and `projectTaskEvents`.

- [ ] **Step 1:** Add to `tests/workspaces.test.ts`, following the same pattern as the existing `projectTask` / `projectMilestone` cases:
  - Create a `ProjectTaskEvent` and a `ProjectKpiTarget` in the *other* workspace through `raw`.
  - Assert that the scoped client's `findMany` returns neither, and that `update` on them through the scoped client matches 0 rows.
- [ ] **Step 2:** Run `npx vitest run tests/workspaces.test.ts`. Expected: FAIL (`raw.projectTaskEvent` is undefined).
- [ ] **Step 3:** Add the models to the schema, then run `npx prisma migrate dev --create-only --name project_kpi`.
  - Rename the folder to `20261013120000_project_kpi`.
  - Check that the SQL makes `workspaceId TEXT NOT NULL`, the same as `20261012120000_content_plan`.
  - Add both names to `SCOPED_MODELS`.
- [ ] **Step 4:** Run `npx prisma generate && npx vitest run tests/workspaces.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(kpi): project task event log + project KPI target tables`.

---

### Task 2: Event logging in task actions

**Files:**
- Create: `src/lib/projectTaskEvents.ts`
- Modify: `src/app/(app)/projects/[id]/tasks/actions.ts` (`setTaskStage` L16, `setTaskDate` L50, `setTaskDetail` L79, `setTaskStatus` L115)
- Test: `tests/projectTaskEvents.test.ts` (same mock setup as `tests/projectTaskActions.test.ts` L5-8)

**Interfaces:**
- Consumes: Task 1 models.
- Produces:
  - `recordTaskChange(tx: Pick<ScopedDb, "projectTask" | "projectTaskEvent">, args: { taskId: string; actorId: string; kind: ProjectTaskEventKind; from: string | null; to: string | null; data: Prisma.ProjectTaskUpdateInput }): Promise<boolean>`
    - Runs the row update.
    - Writes one event only when `from !== to`.
    - Returns whether an event was written.
    - DUE values are `jakartaIso(date)` strings or `null`.
  - `carryTargetsOnRename(tx, projectId: string, oldTitle: string, newTitle: string): Promise<void>`
    - Runs only when no row in the project still has `oldTitle`.
    - Each target with `oldTitle` moves to `newTitle`.
    - If the same user and year already have a target for `newTitle`, the old target is deleted instead (no duplicates).

- [ ] **Step 1: Write failing tests.**
  - `setTaskStage` from `MANUSCRIPT` to `APPROVAL` → one event `{kind:"STAGE", fromValue:"MANUSCRIPT", toValue:"APPROVAL", actorId}`.
  - `setTaskStage` to the same stage → zero events. *(Review Focus 3)*
  - `setTaskStatus` from `IN_PROGRESS` to `DONE` → one `STATUS` event.
  - `setTaskDate(…,"due","2026-11-30")` on a row due `2026-11-15` → one `DUE` event `{fromValue:"2026-11-15", toValue:"2026-11-30"}`.
  - `setTaskDate(…,"start",…)` → zero events.
  - Renaming the only "Regular 4" row to "Regular 4 Pcs" → the target's `itemTitle` becomes "Regular 4 Pcs".
  - With two "Regular 4" rows, renaming one → the target still says "Regular 4".
  - A failed action (`FORBIDDEN`) → zero events.
- [ ] **Step 2:** Run `npx vitest run tests/projectTaskEvents.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the helper.
  - Inside each action, replace the bare `db.projectTask.update` with `db.$transaction(async (tx) => recordTaskChange(tx, …))`. The action already reads the current row; widen its `select` to include `stage`, `status` or `dueDate`.
  - In `setTaskDetail`, when `field === "title"`, call `carryTargetsOnRename` in the same transaction after the update.
  - Response shapes don't change.
- [ ] **Step 4:** Run `npx vitest run tests/projectTaskEvents.test.ts tests/projectTaskActions.test.ts tests/taskEditing.test.tsx`. Expected: PASS. These are the new tests plus the existing ones, which must not break.
- [ ] **Step 5:** Commit with message `feat(kpi): log stage/status/due changes on project tasks`.

---

### Task 3: Item facts (pure)

**Files:**
- Create: `src/lib/kpi/projectItems.ts`
- Test: `tests/kpi/projectItems.test.ts`

**Interfaces:**
- Consumes: `isTaskDone`, `taskMode`, `PROJECT_STAGES` from `src/lib/projectProgress.ts`; `jakartaIso` from `src/lib/projectTasks.ts`.
- Produces:
  ```ts
  export type Quarter = 1 | 2 | 3 | 4;
  export function jakartaQuarter(d: Date): { year: number; quarter: Quarter };
  export function quarterBounds(year: number, q: Quarter): { start: Date; end: Date }; // Jakarta, end exclusive

  export type ItemRow = { id: string; title: string; stage: ProjectStage | null; status: ProjectStatus | null;
    startDate: Date | null; dueDate: Date | null; ownerId: string | null };
  export type ItemEvent = { taskId: string; kind: ProjectTaskEventKind; fromValue: string | null; toValue: string | null; actorId: string; at: Date };

  export type ItemState = "done" | "finishedUntracked" | "open" | "cancelled" | "removed";
  export type ItemFacts = {
    projectId: string; projectTitle: string; itemTitle: string;
    state: ItemState;
    dueDate: Date | null;               // latest dueDate of live rows
    bucket: { year: number; quarter: Quarter } | "unscheduled";
    startAt: Date | null; finishAt: Date | null;
    progress: number;                   // 0..1
    onTime: boolean | null;             // null = not judged yet (open, not overdue) or untracked
    revisions: number; slips: number;
  };
  export function itemFacts(input: { projectId: string; projectTitle: string; itemTitle: string;
    projectRows: ItemRow[]; events: ItemEvent[]; now: Date }): ItemFacts;
  ```
  - `projectRows` holds all rows of the project. `taskMode` is decided from the whole project. The item is the rows whose title equals `itemTitle`.

**Rules the implementation must follow (from the spec):**

| Fact | Rule |
|---|---|
| Live rows | Rows where `stage !== "CANCELLED"`. If there are no rows → `removed`. If every row is cancelled → `cancelled`. |
| `progress` | The mean over live rows. Stage mode: index in `PROJECT_STAGES` ÷ 5, with `null` = 0. Status mode: `NOT_STARTED` 0, `IN_PROGRESS` .5, `IN_REVIEW` .8, `ON_HOLD` .5, `DONE` 1, `null` 0. |
| `finishAt` | When every live row is done: the latest event `at` among the events whose `toValue` made each row done (the last STAGE→`FINAL_ARTWORK` or STATUS→`DONE` per row). If any done row has no such event → `finishedUntracked`. |
| `startAt` | The earliest live `startDate`. Otherwise, the earliest STAGE/STATUS event whose `fromValue` is `null` or `"NOT_STARTED"`. |
| Overdue | `now` is past the end of the Jakarta due day. |
| `onTime` | Done → `finishAt <= end of due day`. Open and overdue → `false`. Otherwise `null`. Untracked → `null`. |
| `revisions` | Count of STAGE events where `index(to) < index(from)`, ignoring any event that involves `CANCELLED`. Plus STATUS events from `DONE`/`IN_REVIEW` to `IN_PROGRESS`/`NOT_STARTED`. |
| `slips` | DUE events where both values are set and `to > from`, grouped by `actorId` + 60-second window into one. |

- [ ] **Step 1: Write failing tests.** Each case is a named `it`, with rows and events built inline.
  - `jakartaQuarter(new Date("2026-12-31T20:00:00Z"))` → `{year:2027, quarter:1}`.
  - `jakartaQuarter(new Date("2026-12-31T16:00:00Z"))` → `{year:2026, quarter:4}`. *(Review Focus 4: 23:00 Jakarta)*
  - An item with rows due `2026-11-10`, `null`, and `2026-12-05` → `dueDate` 2026-12-05, bucket Q4 2026. All rows `null` → `"unscheduled"`. *(Review Focus 1)*
  - Two rows at FINAL with events at 11-20 and 11-28, due 11-30 → `done`, `finishAt` 11-28, `onTime: true`.
  - Same rows, due 11-25 → `onTime: false`.
  - Open item due 2026-10-01, `now` 2026-10-13 → `onTime: false`. Due 2026-10-20 → `onTime: null`.
  - A FINAL row with no event → `finishedUntracked`, `onTime: null`.
  - STAGE events APPROVAL→TECHNICAL_ARTWORK and MANUSCRIPT→APPROVAL → `revisions: 1`. TECHNICAL_ARTWORK→CANCELLED → 0.
  - DUE events: 11-15→11-30 and 11-30→12-10 by the same actor 30 seconds apart on two rows → `slips: 1`. The same pair a day apart → 2. 11-30→11-20 → 0. 11-30→`null` → 0. *(Review Focus 2)*
  - Progress: stage rows [FINAL, APPROVAL, null] → `(1 + .8 + 0) / 3`.
  - All rows CANCELLED → `cancelled`. No rows with the title → `removed`.
- [ ] **Step 2:** Run `npx vitest run tests/kpi/projectItems.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `projectItems.ts` according to the table above.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(kpi): derive project item facts from rows and events`.

---

### Task 4: Scoring (pure)

**Files:**
- Create: `src/lib/kpi/projectScore.ts`
- Test: `tests/kpi/projectScore.test.ts`

**Interfaces:**
- Consumes: `ItemFacts`, `Quarter` (Task 3).
- Produces:
  ```ts
  export const PROJECT_KPI_WEIGHTS = { onTime: 0.5, completion: 0.2, speed: 0.1, revisions: 0.1, slips: 0.1 } as const;
  export type PartKey = keyof typeof PROJECT_KPI_WEIGHTS;
  export type QuarterScore = {
    score: number | null;                       // 0..100 rounded, null when no part has data
    parts: Record<PartKey, number | null>;      // each 0..100 rounded, null = no data
    usedParts: PartKey[];                       // for "Based on N of 5 measures"
    items: number; done: number; onTimeCount: number; lateCount: number;
  };
  export function scoreQuarter(items: ItemFacts[], teamCycleDays: number[]): QuarterScore;
  export function scoreYear(quarters: QuarterScore[]): number | null; // item-count weighted mean of non-null scores
  export function cycleDays(f: ItemFacts): number | null;             // (finishAt - startAt) in days, done + tracked only
  export function median(xs: number[]): number | null;
  ```
- `items` passed in are already filtered to one quarter. Cancelled and removed items are left out *before* `scoreQuarter` is called, by the caller in Task 5. `scoreQuarter` ignores any that arrive anyway.

- [ ] **Step 1: Write failing tests.**
  - On time: 3 done on time + 1 overdue open + 1 open not due → `parts.onTime` = 75.
  - Untracked items are left out of the on-time count.
  - Completion: progress [1, .5, 0] → 50.
  - Speed:
    - Team cycle days [10, 20, 30] and a person median of 10 → 100 (capped).
    - Person median 40 → 50.
    - Team with only 2 values → `null`.
  - Revisions: 2 revisions over 4 items → 87.5 → 88. 8 over 2 → 0.
  - Slips: same formula as revisions.
  - Weight sharing: with speed `null` and onTime `null`, the score equals `(0.2c + 0.1r + 0.1s) / 0.4`, and `usedParts` has 3 entries.
  - No items → `score: null`.
  - `scoreYear` with Q3 {score 80, items 2} and Q4 {score 50, items 8} → 56. With all `null` → `null`.
- [ ] **Step 2:** Run `npx vitest run tests/kpi/projectScore.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Part formulas exactly as in the spec table.
  - Weighted sum ÷ sum of the weights that were used.
  - Round once at the end; parts are rounded individually for display.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(kpi): weighted quarterly project score`.

---

### Task 5: Loaders and target actions

**Files:**
- Create: `src/lib/kpi/projectQueries.ts`, `src/lib/kpi/projectTargets.ts`, `src/app/(app)/dashboard/projects/actions.ts`
- Test: `tests/kpi/projectKpiDb.test.ts` (uses `createTestDb`; mocks the session the same way as `tests/projectTaskActions.test.ts`)

**Interfaces:**
- Consumes: Tasks 1, 3 and 4.
- Produces:
  ```ts
  // projectQueries.ts
  export type PersonProjectKpi = {
    userId: string; year: number;
    quarters: Record<Quarter, { score: QuarterScore; items: ItemFacts[] }>;
    unscheduled: ItemFacts[]; excluded: ItemFacts[];   // cancelled + removed
    otherWork: ItemFacts[];                            // items with rows owned by user, not targets, due this year or unscheduled
    yearScore: number | null;
  };
  export function loadPersonProjectKpi(db: ScopedDb, userId: string, year: number, now: Date): Promise<PersonProjectKpi>;
  export function loadTeamProjectKpi(db: ScopedDb, year: number, now: Date): Promise<(PersonProjectKpi & { name: string })[]>;
  export function targetYears(db: ScopedDb): Promise<number[]>;     // distinct years with targets, plus the current year
  export function itemOptions(db: ScopedDb, projectId: string, year: number):
    Promise<{ itemTitle: string; assignedTo: { userId: string; name: string }[] }[]>;

  // projectTargets.ts  (result: { ok: true } | { ok: false; code: "FORBIDDEN"|"NOT_FOUND"|"VALIDATION"; message: string })
  export function addProjectTargetsWith(db: ScopedDb, actor: SessionUser,
    input: { userId: string; year: number; projectId: string; itemTitles: string[] }): Promise<ProjectTargetResult>;
  export function removeProjectTargetWith(db: ScopedDb, actor: SessionUser, targetId: string): Promise<ProjectTargetResult>;

  // dashboard/projects/actions.ts — "use server" wrappers named addProjectTargets / removeProjectTarget,
  // revalidatePath("/dashboard"), ("/dashboard/team"), (`/dashboard/projects/${userId}`)
  ```
- **Team cycle days:** taken from `cycleDays` over every **target** item in the same quarter across all people, which is one query per year. `loadPersonProjectKpi` computes this team data too, so both views give the same speed score.
- **Year filter:** a person's targets are the rows with `year`. A target's bucket can land outside that year if its due date moved, for example a 2026 target now due in Feb 2027. Show it in Unscheduled with `bucket` visible. Don't drop it.
- Use one query per kind (targets, rows for the target projects, events for those rows). No loop of queries per item.

- [ ] **Step 1: Write failing tests** against a seeded embedded DB: 2 users, 2 projects, rows and events.
  - `loadPersonProjectKpi` puts the Q4 item in `quarters[4].items` and a TBC item in `unscheduled`.
  - A non-target row the user owns appears in `otherWork`.
  - `addProjectTargetsWith` as CREATIVE → `FORBIDDEN`. As LEAD → creates the rows. Adding the same item again → still one row (skip duplicates with `createMany({ skipDuplicates: true })`).
  - Unknown item title → `NOT_FOUND`, nothing written. *(Review Focus 5)*
  - Project from another workspace (created via `raw`) → `NOT_FOUND`. *(Review Focus 5)*
  - Year outside 2020..2100 → `VALIDATION`.
  - `removeProjectTargetWith` as LEAD deletes the row. A target id from another workspace → `NOT_FOUND`.
  - `itemOptions` lists each distinct title once, with `assignedTo` filled in.
- [ ] **Step 2:** Run `npx vitest run tests/kpi/projectKpiDb.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Permission check: `can(actor.appRole, "dashboard.team")`. Validate the target user with `db.user.findFirst({ where: { id, active: true } })`.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(kpi): project KPI loaders and target actions`.

---

### Task 6: Person page and Manage targets

**Files:**
- Create: `src/app/(app)/dashboard/projects/[userId]/page.tsx`
- Create: `src/components/kpi/project/ProjectScoreHeader.tsx`, `TargetList.tsx`, `ManageTargetsModal.tsx` (client)
- Test: `tests/kpi/projectKpiUi.test.tsx` (render-level, same style as `tests/kpiUi.test.tsx`)

**Interfaces:**
- Consumes: `loadPersonProjectKpi`, `itemOptions`, `addProjectTargets`, `removeProjectTarget` (Task 5).
- Produces:
  - Route `/dashboard/projects/[userId]?year=YYYY&q=1|2|3|4|u`. The defaults are the current Jakarta year and quarter.
  - `<ProjectKpiPanel kpi={PersonProjectKpi} quarter={…} canManage={boolean} />`, exported from `TargetList.tsx` for reuse by Task 7.

**Page rules**
- **Access:** a viewer may open `userId === viewer.id` with `dashboard.self`, or anyone with `dashboard.team`. Otherwise show the existing `<AccessDenied>`.
- **Header:** the score uses `CountUp`, with `—` when it's `null`. There are five `KpiTile`s. The labels are On time, Completion, Speed, Revisions and Slips. Each tile shows its part score with `—` when there's no data. Below the tiles is the caption `Based on {n} of 5 measures`, shown only when `n < 5`.
- **Tabs:** `SegmentedControl` with `Q1 Q2 Q3 Q4 Unscheduled`, as links that update `?q`. Below them is a year `<select>` built from `targetYears`.
- **Target row:**
  - `Project › Item`, linking to `/projects/{projectId}`.
  - `ProgressBar` (progress × 100).
  - `DeadlineChip` on the due date.
  - A badge. The text is fixed: `On time` (success tone), `Late` (danger), `In progress` (neutral), `Finished before tracking` (neutral), `Cancelled` and `Item removed` (muted).
  - `{slips} slips · {revisions} revisions`.
  - A remove × when `canManage`.
- **Excluded items** are listed under the tabs in a muted "Not scored" group.
- **Other work:** a `<details>` element titled `Other work ({n})`, collapsed by default and not scored.
- **Empty quarter:** `EmptyState` with `No targets due this quarter.` When `canManage` it also has a `Manage targets` button.
- **ManageTargetsModal:** a project `<select>` (all projects, by title), then a checklist from `itemOptions`. Each item shows `· also {names}` when it's assigned to someone else. Save calls `addProjectTargets`. Show an `Alert` on `{ok:false}`.

- [ ] **Step 1: Write failing render tests.**
  - The header shows `Based on 3 of 5 measures` when two parts are `null`.
  - The badge text for each `ItemState` / `onTime` combination.
  - The remove × is hidden when `canManage` is false.
  - The empty quarter text.
- [ ] **Step 2:** Run `npx vitest run tests/kpi/projectKpiUi.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement using token classes only. Use `PageHeader` with the title `{name} · Project KPI {year}`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(kpi): project KPI person page and target picker`.

---

### Task 7: Requests / Projects toggle and team table, then verification

**Files:**
- Create: `src/components/kpi/project/KpiViewToggle.tsx`, `ProjectTeamTable.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/team/page.tsx`, `src/app/(app)/dashboard/params.ts` (add `parseViewParam(v): "requests" | "projects" | undefined`)
- Test: extend `tests/kpi/projectKpiUi.test.tsx`; `tests/kpiUi.test.tsx` must stay green

**Interfaces:**
- Consumes: `ProjectKpiPanel` (Task 6); `loadPersonProjectKpi`, `loadTeamProjectKpi` (Task 5).
- Produces:
  - `?view=projects` on both pages.
  - **My KPI default:** `projects` when the viewer has targets in the current year and zero requests in the current month. Otherwise `requests`.
  - **Team default:** always `requests` unless the view is set.

**Rules**
- **`ProjectTeamTable`** uses `tableClass`.
  - Columns: `Person | Q1 | Q2 | Q3 | Q4 | Year | Done | On time`.
  - Each cell shows the score or `—`. Done is `{done}/{items}`. On time is `%` or `—`.
  - The person cell links to `/dashboard/projects/{userId}?year=`.
  - Rows are sorted by year score descending, with `null` last.
  - The table appears only for people who have targets.
  - Empty → `EmptyState` with `No project targets for {year} yet.`
- **My KPI › Projects** renders `ProjectKpiPanel` for the viewer, so there's no redirect.

- [ ] **Step 1: Write failing tests.**
  - `parseViewParam("projects")` → `"projects"`. `"x"` → `undefined`.
  - The team table sorts `[{year:null},{year:60},{year:90}]` to 90, 60, —.
  - The empty table text.
- [ ] **Step 2:** Run `npx vitest run tests/kpi/projectKpiUi.test.tsx tests/kpiUi.test.tsx`. Expected: the new tests FAIL and the old ones PASS.
- [ ] **Step 3:** Implement the toggle with `SegmentedControl` links that keep the other params.
- [ ] **Step 4:** Run `npm test && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 5: Browser check** with `preview_start` and the dev server from `.claude/launch.json`, signed in as a LEAD dev user (`npm run dev:session`).
  - Add 2 targets through Manage targets.
  - Move one stage to FINAL on `/projects/[id]/tasks`.
  - Confirm that the person page shows `On time` and the score updates.
  - Confirm that Team › Projects lists the person.
  - Check light and dark mode, and a 375px width.
  - Check that the console has no errors.
  - Take a screenshot as proof.
- [ ] **Step 6:** Commit with message `feat(kpi): Requests | Projects toggle and team project table`.
