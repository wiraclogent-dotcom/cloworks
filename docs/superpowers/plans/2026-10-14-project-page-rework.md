# Project Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/projects/[id]` into one page that combines an overview (editable details, progress, needs attention) with a working item list (expand per item, set all, inline editors). The separate "All details" page is retired.

**Architecture:**
- Pure item grouping and selection live in `src/lib/projectItemList.ts`.
- One new bulk server action, `setItemStage`/`setItemStatus`, writes through the existing `recordTaskChange`.
- The page is server-rendered from small focused components. Interactive parts are client components: the item row expand and "Set all", the details edit toggle, and the hash opener.
- The existing per-row editors in `[id]/tasks/*` are reused unchanged, apart from two small props.

**Tech Stack:** Next 16.4 App Router + server actions, React 19.3, Prisma 6, Vitest + embedded-postgres (`tests/helpers/testDb.ts`), Tailwind v4 tokens, app kit (`src/components/ui/*`).

**Spec:** `docs/superpowers/specs/2026-10-14-project-page-rework-design.md`

## Global Constraints

- **No new dependencies.** No migration. KPI scoring, roster and targets are unchanged.
- **Writes:** every stage, status or due write goes through the existing actions or `recordTaskChange` (`src/lib/projectTaskEvents.ts`).
- **Data access and permissions:**
  - Use the scoped db only: `dbFor(user)` / `requireScope()`.
  - Editing UI renders only with `can(appRole, "project.manage")`, and every action re-checks it on the server.
- **Server actions** return `{ ok: false, code, message }` and are wrapped in `withUser(requireUser, …, unauthResult)`. Codes: `"FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED"`.
- **Dates and "Needs attention":**
  - Use Jakarta calendar days: `jakartaIso`, `jakartaDay`, `formatJakartaDay` (`src/lib/projectTasks.ts`); `DeadlineChip` for due chips.
  - "Needs attention" = due date before today (overdue), or within 7 days (`dueDay ≤ today + 7`), and the item is not done.
- **Styling:** token classes and app kit only. No horizontal page scroll at 375px. Dark mode via tokens.
- **Status chips:** pass `StatusChip kind="project"` for the project status.
- **Collapsible sections:** reuse `CollapsibleSection` (`src/components/ui/CollapsibleSection.tsx`) for the Timeline and Milestones sections, with storage keys `project-timeline-open` and `project-milestones-open`.
- **Repo housekeeping:**
  - Leave the `AGENTS.md` block written by `next dev` alone.
  - Add only your own files: never the untracked `*.local.*`, `.archify/` or `.claude/launch.json`.
  - Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Item titles that differ only by case, punctuation or non-Latin characters** (e.g. "Cloghome 200" vs "cloghome-200", "Pods – Lite"). Each gets a distinct, stable `#item-` anchor, and the same title always gets the same slug. Test in Task 1.
2. **"Set all" when some variants have no stage yet (`null`).** Those variants are moved too, and each logs an event with `fromValue: null`. Test in Task 2.
3. **Tracker-mode projects (statuses, no stages).** The progress summary, item stage bar and "Set all" use statuses, and "Needs attention" treats `DONE` as done. Tests in Task 1 and Task 4.
4. **An item whose variants are all cancelled.** It never appears in "Needs attention", and its stage bar shows it as cancelled. Test in Task 1.
5. **A viewer without `project.manage`.** They see the full overview and items but no details Edit, "Set all", add buttons or inline editors. Test in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/projectItemList.ts` (new) | `itemSlug`, `groupItems`, `needsAttention` (pure) |
| `src/app/(app)/projects/[id]/tasks/actions.ts` | add `setItemStage`, `setItemStatus` |
| `src/app/(app)/projects/actions.ts`, `ProjectForm.tsx` | in-place save mode (no redirect) |
| `src/components/projects/ProjectDetailsCard.tsx` (new, client) | read view ↔ edit form toggle |
| `src/components/projects/ProjectProgressSummary.tsx` (new) | % done, items done, stacked stage bar |
| `src/components/projects/NeedsAttention.tsx` (new) | overdue / due-soon items with anchors |
| `src/components/projects/ProjectItemRow.tsx` (new, client) | collapsed row, expand, Set all, variant table |
| `src/components/projects/ProjectItemsList.tsx` (new) | maps items → rows, "+ Add item" |
| `src/components/projects/ItemHashOpener.tsx` (new, client) | opens/scrolls `#item-…` on load/hashchange |
| `src/app/(app)/projects/[id]/page.tsx` | composes the new page |
| `src/app/(app)/projects/[id]/tasks/page.tsx` | becomes a redirect |
| `[id]/tasks/TaskRow.tsx`, `AddDetailForm.tsx` | small props: `hideItem`, `defaultTitle`/`label` |
| `src/components/kpi/project/TargetList.tsx` | item anchor links |

---

### Task 1: Item grouping and selection (pure)

**Files:**
- Create: `src/lib/projectItemList.ts`
- Test: `tests/projectItemList.test.ts`

**Interfaces:**
- Consumes:
  - `taskMode`, `isTaskDone`, `PROJECT_STAGES` (`src/lib/projectProgress.ts`)
  - `jakartaIso` (`src/lib/projectTasks.ts`)
- Produces:
  ```ts
  export function itemSlug(title: string, taken: Set<string>): string; // lowercases, NFKD → strips diacritics, non [a-z0-9] → "-", trims "-"; "" → "item"; appends -2, -3… if taken; adds result to taken
  export type ItemRowInput = { id: string; title: string; subTitle: string | null; position: number; ownerId: string | null; ownerName: string | null;
    stage: ProjectStage | null; status: ProjectStatus | null; startDate: Date | null; dueDate: Date | null; dueTbc: boolean };
  export type ProjectItem = {
    title: string; slug: string; rows: ItemRowInput[];          // rows in position order
    liveRows: ItemRowInput[];                                    // stage !== "CANCELLED"
    allCancelled: boolean; done: boolean;                        // done = liveRows.length > 0 && every live row isTaskDone
    dueDate: Date | null; dueTbc: boolean;                       // latest live dueDate; dueTbc when no live date and any live row dueTbc
    owners: string[];                                            // distinct ownerName of live rows, in row order
    counts: { key: ProjectStage | ProjectStatus | "none"; n: number }[]; // live rows per stage (stage mode) or status (status mode), in PROJECT_STAGES / TASK_STATUS_ORDER order, zeros dropped, "none" last
  };
  export function groupItems(rows: ItemRowInput[], mode?: TaskMode): ProjectItem[]; // items in order of first appearance by position; slugs assigned in that order
  export function needsAttention(items: ProjectItem[], now: Date): { item: ProjectItem; overdue: boolean }[];
  ```

- [ ] **Step 1: Write the failing tests** (`describe("projectItemList")`):
  - `itemSlug`:
    - "Laundry Pods Regular 4" → `"laundry-pods-regular-4"`
    - "Pods – Lite!" → `"pods-lite"`
    - "Crème Brûlée" → `"creme-brulee"`
    - "日本" → `"item"`
    - Two titles that both slug to `"cloghome-200"` → `"cloghome-200"`, then `"cloghome-200-2"`.
    - Calling `groupItems` twice on the same rows gives the same slugs.
  - `groupItems`:
    - Rows at positions 3 "B", 1 "A", 2 "B" → items `["A", "B"]`.
    - B's rows are in position order.
  - Item due date:
    - Live rows due 2026-11-10 and 2026-12-05 → 2026-12-05.
    - A cancelled row due 2027-01-01 is ignored.
    - All live rows null with one `dueTbc` → `dueDate: null, dueTbc: true`.
  - Counts (stage mode): [FINAL, APPROVAL, APPROVAL, CANCELLED, null] → `[{APPROVAL, 2}, {FINAL_ARTWORK, 1}, {none, 1}]`.
  - Counts (status mode): [DONE, IN_PROGRESS] → `IN_PROGRESS` before `DONE`, per `TASK_STATUS_ORDER`.
  - All rows CANCELLED → `allCancelled: true`, `done: false`, `liveRows: []`. *(Review Focus 4)*
  - `needsAttention` with `now = 2026-10-14T05:00:00Z`:
    - Item due 2026-10-13 and not done → included, `overdue: true`.
    - Due 2026-10-21 → included, `overdue: false`.
    - Due 2026-10-22 → excluded.
    - Due 2026-10-01 but done → excluded.
    - `allCancelled` → excluded.
    - TBC / no date → excluded.
    - Sort: overdue first (oldest due first), then soonest due.
  - Tracker mode: item with all live rows `DONE` and due yesterday → excluded. *(Review Focus 3)*
- [ ] **Step 2:** Run `npx vitest run tests/projectItemList.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. The Jakarta day comparison uses `jakartaIso(date)` strings against `jakartaIso(now)` and `jakartaIso(now + 7 days)`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(projects): item grouping, slugs and needs-attention selection`.

---

### Task 2: Bulk "Set all" server actions

**Files:**
- Modify: `src/app/(app)/projects/[id]/tasks/actions.ts` (append after `setTaskStatus`)
- Test: `tests/projectItemActions.test.ts` (mock setup copied from `tests/projectTaskActions.test.ts` L5-8)

**Interfaces:**
- Consumes: `recordTaskChange` (`src/lib/projectTaskEvents.ts`), `PROJECT_STAGES`, `TASK_STATUS_ORDER`.
- Produces:
  ```ts
  export type ItemBulkResult = { ok: true; changed: number } | { ok: false; code: TaskStageCode; message: string };
  export async function setItemStage(projectId: string, itemTitle: string, stage: ProjectStage): Promise<ItemBulkResult>;
  export async function setItemStatus(projectId: string, itemTitle: string, status: ProjectStatus): Promise<ItemBulkResult>;
  ```
  - Both revalidate `/projects/${projectId}`.
  - Rules: as in the spec section "New server action". Skip `CANCELLED`-stage rows unless the target is `CANCELLED`. Skip rows already at the target. Everything runs in one `db.$transaction`, with one `recordTaskChange` per changed row.

- [ ] **Step 1: Write the failing tests:**
  - CREATIVE without the right is impossible (CREATIVE has `project.manage`), so use REQUESTER → `FORBIDDEN`, nothing changed.
  - Unknown title → `NOT_FOUND`.
  - A project created in another workspace via `db.raw` → `NOT_FOUND`.
  - `setItemStage(…, "BOGUS")` → `VALIDATION`.
  - `setItemStatus(…, "CANCELLED")` → `VALIDATION`.
  - Stage set-all on rows [MANUSCRIPT, APPROVAL, CANCELLED, null] to APPROVAL:
    - Returns `{ ok: true, changed: 2 }`.
    - The CANCELLED row is unchanged.
    - Exactly 2 `ProjectTaskEvent` rows: MANUSCRIPT→APPROVAL and null→APPROVAL. *(Review Focus 2)*
  - Set-all to CANCELLED → every row is CANCELLED, including the previously cancelled one, which is unchanged so no event is written for it.
  - Status set-all on rows [IN_PROGRESS, DONE] to DONE → `changed: 1`, one STATUS event.
  - Rows of another item with the same project are untouched.
- [ ] **Step 2:** Run `npx vitest run tests/projectItemActions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command plus `tests/projectTaskEvents.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(projects): set a whole item's stage or status`.

---

### Task 3: Project details card with in-place edit

**Files:**
- Modify:
  - `src/app/(app)/projects/actions.ts` (add `submitProjectInPlace`)
  - `src/lib/projects.ts` (`ProjectFormState` gets an ok variant if it lacks one)
  - `src/app/(app)/projects/ProjectForm.tsx` (optional `onSaved`, `mode`)
- Create: `src/components/projects/ProjectDetailsCard.tsx`
- Test: `tests/projectDetailsCard.test.tsx`; extend `tests/projectsUi.test.tsx` if needed

**Interfaces:**
- Produces:
  - `submitProjectInPlace(id: string, prev: ProjectFormState, fd: FormData): Promise<ProjectFormState>`
    - Same validation path as `submitProject` (`submitProjectWith`).
    - On success it revalidates `/projects` and `/projects/${id}` and returns `{ ok: true, nonce }` (no redirect).
  - `ProjectForm` gets new props:
    - `stay?: boolean`. When true it binds `submitProjectInPlace`.
    - `onSaved?: () => void`. Called when the state turns ok.
    - `onCancel?: () => void`. Renders a Cancel button.
    - Existing callers are unchanged.
  - `<ProjectDetailsCard project={{ id, title, subTitle, brandName, brandId, ownerId, ownerName, status, startIso, dueIso, fileUrl }} brands={Opt[]} owners={Opt[]} canManage={boolean} />`.
    - Read view: a definition list (Brand, Owner, Status with `StatusChip kind="project"`, Start, Due, File via `FileLocationLink`) and an "Edit" button (only when `canManage`).
    - Edit view: `ProjectForm stay` with the initial values mapped the same way as `EditProjectContent`.
    - On save it switches back to the read view and calls `router.refresh()`.

- [ ] **Step 1: Write the failing tests:**
  - Read view shows brand, owner, a "Canceled" chip for status CANCELLED, "22 Sep 2026" for start, and the file link.
  - With `canManage={false}` there is no "Edit" button.
  - Clicking "Edit" shows the form with the Title value prefilled and a Cancel button.
  - Cancel returns to the read view.
  - `submitProjectInPlace` with valid FormData returns `ok: true` and does not call `redirect`. Mock `next/navigation` and assert `redirect` was not called.
  - Invalid data returns field errors, as `submitProject` does.
- [ ] **Step 2:** Run `npx vitest run tests/projectDetailsCard.test.tsx tests/projectsUi.test.tsx`. Expected: new tests FAIL, old ones PASS.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(projects): edit project details in place`.

---

### Task 4: Progress summary and Needs attention

**Files:**
- Create: `src/components/projects/ProjectProgressSummary.tsx`, `src/components/projects/NeedsAttention.tsx`
- Test: `tests/projectOverview.test.tsx`

**Interfaces:**
- Consumes: `ProjectItem`, `needsAttention` (Task 1); `finalShare`, `stageCounts`, `statusCounts`, `taskMode` (`projectProgress`).
- Produces:
  - `<ProjectProgressSummary rows={ItemRowInput[]} items={ProjectItem[]} />`:
    - Shows "{percent}% done" from `finalShare`, and "{doneItems} of {items} items done" (`items.filter(i => i.done)` over items that aren't all cancelled).
    - One stacked bar: segments in stage or status order, widths proportional to live counts, each `data-tone` from the stage/status tone, and an sr-only list "{label}: {n}".
    - A legend of the chips present.
  - `<NeedsAttention items={ProjectItem[]} now={Date} />`:
    - Renders nothing when empty.
    - Otherwise a Card titled "Needs attention ({n})", with rows: item title as a link to `#item-{slug}`, `AvatarStack` of owners, `DeadlineChip` for the due date, and a compact stage summary from `counts`.

- [ ] **Step 1: Write the failing tests:**
  - Stage-mode fixture: 4 live rows (2 FINAL, 1 APPROVAL, 1 null) in 2 items, one fully FINAL.
    - Shows "50% done" and "1 of 2 items done".
    - The bar has 3 segments with sr-only text "Final artwork: 2", "Approval: 1", "No stage yet: 1".
  - Tracker fixture: shows statuses with no stage labels. *(Review Focus 3)*
  - `NeedsAttention` with an overdue item and a due-in-3-days item:
    - The heading reads "Needs attention (2)".
    - The links point to `#item-<slug>`.
    - The overdue item comes first.
  - `NeedsAttention` with an empty list renders null.
- [ ] **Step 2:** Run `npx vitest run tests/projectOverview.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Labels come from `PROJECT_STAGE_LABEL` / `TASK_STATUS_LABEL`; the "none" label is "No stage yet" or "No status yet".
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(projects): progress summary and needs-attention card`.

---

### Task 5: Item rows, items list, hash opener

**Files:**
- Create:
  - `src/components/projects/ProjectItemRow.tsx` (client)
  - `src/components/projects/ProjectItemsList.tsx`
  - `src/components/projects/ItemHashOpener.tsx` (client)
- Modify:
  - `src/app/(app)/projects/[id]/tasks/TaskRow.tsx`: add `hideItem?: boolean`, which omits the Item cell.
  - `src/app/(app)/projects/[id]/tasks/AddDetailForm.tsx`: add `defaultTitle?: string` (prefill and keep the title editable), `label?: string` (button text; default stays as today), and `compact?: boolean` if needed for in-item placement.
- Test: `tests/projectItemsList.test.tsx`

**Interfaces:**
- Consumes:
  - `ProjectItem` (Task 1)
  - `setItemStage`, `setItemStatus` (Task 2)
  - `TaskRow` + `TaskRowData`, `AddDetailForm`, `StageSelect`'s stage list
- Produces:
  - `<ProjectItemsList projectId items={ProjectItem[]} rowsData={Map<string, TaskRowData>} mode={TaskMode} owners={Opt[]} canManage={boolean} />`.
    - Renders a `ProjectItemRow` per item, then "+ Add item" (`AddDetailForm` with `label="Add item"`) when `canManage`.
    - Empty → `EmptyState` "No items yet".
  - `<ProjectItemRow projectId item rows={TaskRowData[]} mode owners canManage />`.
    - The element has `id="item-{slug}"` and `data-open`.
    - **Collapsed row:**
      - Chevron button `aria-expanded`, accessible name "{title}, {n} variants".
      - Stage bar segments with sr-only counts.
      - `AvatarStack` (max 3).
      - Due date: `DeadlineChip`, or "TBC".
      - When `canManage`: a "Set all to…" native `<select>` styled with `fieldClass({ size: "sm" })`, aria-label "Set all variants of {title}". Options are stages (`PROJECT_STAGES` with labels) or statuses (`TASK_STATUS_ORDER`). On change it calls the action, shows an inline `Alert` on `ok: false`, then calls `router.refresh()` on success.
    - **Expanded:**
      - The existing table header and `TaskRow` per row with `hideItem`.
      - Move up/down: `isFirst`/`isLast` are computed **within the item**, so a variant can't be moved out of its item.
      - "+ Add variant" (`AddDetailForm` with `defaultTitle={item.title}`, `label="Add variant"`) when `canManage`.
  - `ItemHashOpener`, client, `null` render. On mount and on `hashchange`:
    - If `location.hash` starts with `#item-`, it dispatches a `project-item-open` CustomEvent with the slug.
    - `ProjectItemRow` listens for it, opens itself, then calls `scrollIntoView({ block: "start" })` on itself.
    - The rows have `scroll-mt-4`.

- [ ] **Step 1: Write the failing tests:**
  - Collapsed row shows "Laundry Pods Regular 4", "3 variants", the avatars and the due chip.
  - Clicking the chevron sets `aria-expanded="true"` and shows 3 `TaskRow` rows without an Item cell.
  - The first variant's "Move up" is disabled and the last variant's "Move down" is disabled.
  - With `canManage` the "Set all variants of …" select exists; choosing "Approval" calls the mocked `setItemStage(projectId, "Laundry Pods Regular 4", "APPROVAL")`.
  - With `canManage={false}`:
    - no select, no "Add variant" or "Add item" buttons
    - no inline editor buttons (e.g. no "Edit … stage" control) *(Review Focus 5)*
  - Dispatching `project-item-open` with the slug opens that row.
  - Empty list shows "No items yet".
- [ ] **Step 2:** Run `npx vitest run tests/projectItemsList.test.tsx tests/taskEditing.test.tsx`. Expected: new tests FAIL, existing `taskEditing` tests PASS.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat(projects): expandable item rows with set-all and inline editors`.

---

### Task 6: Assemble the page, redirect, anchors, browser check

**Files:**
- Modify:
  - `src/app/(app)/projects/[id]/page.tsx` (replace body)
  - `src/app/(app)/projects/[id]/tasks/page.tsx` (redirect)
  - `src/components/kpi/project/TargetList.tsx` (anchor href)
- Test: `tests/projectPageAssembly.test.tsx`; update `tests/kpi/projectKpiUi.test.tsx` for the anchors

**Interfaces:**
- Consumes everything above.
- Page data:
  - One `db.project.findUnique` with `brand`, `owner`, `tasks` (+ `owner` name, `orderBy position`) and `milestones`.
  - When `canManage`, a parallel load of brands, the owners list (same queries as `EditProjectContent`) and task owners (active DESIGNERs, as in the old tasks page).
- **Page order** (spec "Page layout"):
  1. `PageHeader` (breadcrumb, title, description, actions = `StatusChip kind="project"` plus a "Back to projects" link; the old Edit and All details buttons are gone)
  2. `ProjectDetailsCard`
  3. `ProjectProgressSummary`
  4. `NeedsAttention`
  5. `ProjectItemsList` + `ItemHashOpener`
  6. `CollapsibleSection` "Timeline by item", with the existing `ProjectTimeline` and **no** `href`
  7. `CollapsibleSection` "Meetings and milestones", with `MilestoneList`
- `tasks/page.tsx` becomes `redirect(\`/projects/${id}\`)`.
- `TargetList` links to `` `/projects/${projectId}#item-${itemSlug(itemTitle, new Set())}` ``.
  - Note: in a project with colliding slugs only the first item matches. This is acceptable because target titles are unique per project, and the comment must say so.

- [ ] **Step 1: Write the failing tests:**
  - The tasks page module calls `redirect("/projects/p1")`. Mock `next/navigation`.
  - `TargetList` row href ends with `#item-laundry-pods-regular-4`.
  - Rendering the page's server pieces with a fixture (or a pure `buildProjectPageModel(project, now)` helper if the page grows) gives the section order Details → Progress → Needs attention → Items → Timeline (closed) → Milestones (closed).
- [ ] **Step 2:** Run `npx vitest run tests/projectPageAssembly.test.tsx tests/kpi/projectKpiUi.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement. Delete the old `Stat` cards and per-stage `ProgressBar` list from `page.tsx`.
- [ ] **Step 4:** Run `npm test && npx tsc --noEmit && npm run lint`. Expected: PASS. The only tsc errors are the known ones in untracked `scripts/check-login.local.ts`.
- [ ] **Step 5: Browser check.** The controller does this with the signed-in local app, on Redesign Project:
  - "Set all" on a Laundry Pods item. Then **reset** it to its original stages.
  - Expand an item, edit a variant date, and use the "Add variant" form without saving.
  - Edit details in place and Cancel.
  - Use the "Needs attention" link to jump to the item.
  - Open `/projects/[id]/tasks` and confirm the redirect.
  - Open a KPI target link and confirm the item opens.
  - Check at 375px and in dark mode.
- [ ] **Step 6:** Commit with message `feat(projects): one project page — overview + item list; retire All details`.
