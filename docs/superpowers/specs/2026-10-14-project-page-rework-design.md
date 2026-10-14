# Project page rework: overview + working item list

Date: 2026-10-14 · Branch: `feat/project-page` · Sub-project **C** of the "Rework Project Page" todo
(A+B lifecycle/tokens ✅ → E KPI ✅ → **C** project page → D brands).

## Goal

Make `/projects/[id]` the one place to both **see where a project stands** and **move its work
forward**. Today the page is read-only. Editing lives on a separate full table ("All details")
and a separate Edit page. Leads, Emilia and Irsyad use the page equally for checking and for
updating.

## Non-goals

- No spreadsheet-style grid, multi-select or keyboard cell navigation.
- No new libraries.
- No change to KPI scoring, roster or targets. Change logging must keep working.
- No change to the `/projects` list or the edit modal on that list.
- No bulk "set all due dates" (YAGNI). Bulk is limited to stage/status.

## Page layout (top → bottom)

1. **Header.** Title and subtitle, the project `StatusChip kind="project"`, and a "Back to projects"
   link. The top-right **Edit** and **All details** buttons are removed.
2. **Project details card** (always visible). Shows brand, owner, status, start, due and file link.
   - With `project.manage`, an **Edit** button switches the card in place to a form with the same
     fields, validation and action as today's edit page (`updateProject`, `DatePicker` for dates).
   - Save and Cancel return to the read view without leaving the page.
   - The standalone `/projects/[id]/edit` route and the list's edit modal keep working unchanged.
3. **Progress summary** (always visible).
   - Overall % done and items done out of total.
   - One stacked bar of variant counts per stage (status in tracker mode), with a legend.
   - Computed with the existing `projectProgress` helpers (`finalShare`, `stageCounts`,
     `statusCounts`, `productSummaries`), so numbers match today's.
4. **Needs attention** (always visible; omitted when empty).
   - Lists items that are **overdue**, or **due within 7 days (Jakarta)** and not done.
   - Each shows item name, owner avatars, due date with `DeadlineChip`, and current stage summary.
   - Each links to `#item-<slug>`, which scrolls to the item and opens it.
   - Sorted most overdue first, then soonest due.
5. **Items list.** The working area, described below.
6. **Timeline by item** (collapsed `CollapsibleSection`). Today's `ProjectTimeline` with product
   bars, no links.
7. **Milestones and meetings** (collapsed `CollapsibleSection`). Today's `MilestoneList`.

Both collapsed sections remember their open state per section in localStorage. This reuses the
existing `CollapsibleSection`.

On a phone the page is a single column, the details card fields wrap two per row, and there is no
horizontal page scroll at 375px.

## Items list

**Item.** Rows sharing a `title` form an item, in sheet `position` order. This is the existing
`productSummaries` notion. Each item is a collapsible row, `id="item-<slug>"`. The slug is the title
slugified, with `-2`, `-3` and so on added on collisions. It is deterministic.

**Collapsed row:**
- Chevron, item name and variant count ("Laundry Pods Regular 4 · 3 variants").
- **Stage bar.** One small segment per live variant, coloured by stage/status tone, with sr-only
  text such as "2 Technical artwork, 1 Approval".
- **Owner avatars.** Up to 3, then "+n".
- **Item due date.** The latest live due date, with `DeadlineChip`. Shows "TBC" when any row is TBC
  and no row has a date.
- **"Set all to…"** select (`project.manage` only). It moves every non-cancelled variant to the
  chosen stage, or the chosen status in tracker mode.

**Expanded row:**
- One line per variant, using the existing inline editors from `[id]/tasks/*`: variant name
  (`DetailEdit`), owner, stage (`StageSelect`) or status (`StatusSelect`), start and due
  (`DateEdit`), file (`FileLinkEdit`), and move up/down and delete (`RowActions`).
- Cancelled-stage variants stay struck through, as today.
- "+ Add variant" at the bottom of the item. It reuses `AddDetailForm` with the item title prefilled.
- "+ Add item" at the end of the list (`AddDetailForm` with an empty title).

**Saving.** Each editor saves on its own through the existing server actions, so the
`recordTaskChange` logging for stage, status and due changes is unchanged.

## New server action: set a whole item

```ts
setItemStage(projectId: string, itemTitle: string, stage: ProjectStage): Promise<ItemBulkResult>
setItemStatus(projectId: string, itemTitle: string, status: ProjectStatus): Promise<ItemBulkResult>
// ItemBulkResult = { ok: true; changed: number } | { ok: false; code: "FORBIDDEN"|"NOT_FOUND"|"VALIDATION"|"UNAUTHENTICATED"; message: string }
```

- Lives in `src/app/(app)/projects/[id]/tasks/actions.ts`, next to the per-row actions, wrapped in
  `withUser(requireUser, …, unauthResult)` and using `dbFor(user)`.
- Needs `project.manage`. The project must exist in the workspace and the title must exist in that
  project; otherwise `NOT_FOUND`.
- The value is validated: any of `PROJECT_STAGES` for stage, and `TASK_STATUS_ORDER` for
  status. `CANCELLED` project status is never valid here.
- Skips variants whose stage is `CANCELLED`, unless the target stage is itself `CANCELLED`, in which
  case every variant is set. Skips variants already at the target value.
- One transaction. Each changed variant goes through `recordTaskChange`, which writes one event per
  variant. Unchanged variants write nothing.
- Returns `changed`, the number of variants updated, and revalidates `/projects/{id}`.

## Routes and links

- `/projects/[id]/tasks` redirects (`redirect()`) to `/projects/[id]`. Its page component is removed.
  The inline editor components stay in `[id]/tasks/` because they are reused, or move next to the
  new list if that reads better.
- KPI target rows (`src/components/kpi/project/TargetList.tsx`) link to `/projects/{projectId}#item-<slug>`
  using the same slug helper.
- Anchors open the item. A small client effect reads `location.hash` on mount and on `hashchange`,
  opens the matching item and scrolls to it.

## Components (new, focused files)

- `src/lib/projectItemList.ts` (pure; named to avoid confusion with `src/lib/kpi/projectItems.ts`):
  - `itemSlug(title, taken)`
  - `groupItems(rows)` returns items with variants, live rows, due, TBC, owners and stage/status
    counts
  - `needsAttention(items, now)`
- `ProjectDetailsCard` (server read view, plus a client edit toggle reusing `ProjectForm` fields).
- `ProjectProgressSummary` (server).
- `NeedsAttention` (server).
- `ProjectItemsList` (server) plus `ProjectItemRow` (client, for expand state and "Set all"), with the
  variant lines rendered from the existing `TaskRow` pieces.
- `ItemHashOpener` (client effect).

## Permissions

- Viewing is unchanged: anyone who can open the project page today.
- Editing controls (details Edit, "Set all", inline editors, add, move and delete) appear only with
  `project.manage`, and every action re-checks it on the server.

## Testing

- **Unit (`projectItemList`):**
  - Grouping keeps sheet order.
  - Slug collisions.
  - Item due date and TBC.
  - Stage counts exclude cancelled.
  - `needsAttention`: overdue in, due in 7 days in, due in 8 days out, done items out; sort order;
    Jakarta day boundaries.
- **Actions (`setItemStage` / `setItemStatus`)** against the test DB:
  - FORBIDDEN without `project.manage`.
  - NOT_FOUND for an unknown title or another workspace's project.
  - VALIDATION for a bad value, including `CANCELLED` status.
  - Skips cancelled variants.
  - One `ProjectTaskEvent` per changed variant and none for unchanged ones.
  - Status mode.
  - `changed` count.
- **Render:**
  - Details card read and edit toggle (only with `project.manage`).
  - Progress summary numbers.
  - Needs attention rows and links.
  - Item row contents, expand/collapse, and "Set all" visibility.
  - Add variant/item buttons.
  - `/tasks` redirect.
  - TargetList item anchors.
- **Browser check** on the local app (Emilia's Redesign Project):
  - Set all on a Laundry Pods item; expand, edit and add a variant.
  - Edit details in place.
  - Needs attention jump.
  - Phone (375px) and dark mode.

## Rollout

No migration. No data changes. KPI logging is preserved because every write goes through the existing
actions or `recordTaskChange`.
