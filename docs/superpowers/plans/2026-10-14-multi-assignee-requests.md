# Multi-assignee requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A request can have any number of assignees. Each one gets 1 KPI point. One card per request, with a distinct "shared" look.

**Architecture:** A new `RequestAssignee` join table replaces `Request.assigneeId`. Task 1 adds the table and backfills it while
the old column still exists. Tasks 2–9 move every reader and writer onto the table. Task 10 drops the column. This keeps
typecheck and tests green after every task. Both migrations ship in the same deploy.

**Tech Stack:** Next.js 16.4 (App Router, cacheComponents, server actions), React 19.3, Prisma 6.19 on Postgres (Neon),
Vitest with embedded Postgres (`tests/helpers/testDb.ts`), Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-14-multi-assignee-requests-design.md`

## Global Constraints

- Work on a new branch `feat/multi-assignee` cut from `feat/creative-request-tracker`, in a git worktree.
  `feat/project-kpi` has uncommitted work, so leave it alone. Cherry-pick the spec commit `0e27d29` and this plan onto the branch first.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md).
- Never write `RequestAssignee` rows by nested create (`assignees: { create: … }`). Nested writes skip the workspace scoping
  (`src/lib/db.ts`). Always use `tx.requestAssignee.createMany({ data, skipDuplicates: true })` on the scoped client.
- Assignee order everywhere: `addedAt` asc, then `userId` asc. Export it once as `ASSIGNEE_ORDER` (Task 1).
- Who may be an assignee: active, `appRole !== "REQUESTER"`, `jobRole === "DESIGNER"`. Same messages as today's `assignRequestWith`.
- Who may change assignees: `can(appRole, "request.assign")` **or** the request's requester (today's rule).
- Calendar logic stays Asia/Jakarta.
- Copy (verbatim): label for two people `"Fafa & Dimas"`; for 3 or more, `"3 people"`; chip `"Shared"`; the Team KPI hint
  `"Each request counted once, even when several people worked on it."`; the UNASSIGNED message `` `${a} removed you from “${t}”` ``.
- Run before every commit: `npm run typecheck && npm test -- <touched test files>`.

## Review Focus

1. **Keeping someone who's no longer eligible.** A request whose current assignee is inactive or has left the creative team.
   Adding a second person must succeed and keep the first. Only people being *added* are validated (Task 2 test).
2. **Removing the last assignee from an open request, then dragging it to Done.** This must be blocked with
   "Assign someone before marking this request Done." on the board and `NEEDS_ASSIGNEE` on the server (Tasks 4 and 7 tests).
3. **The same person picked in both the Designer and Video editor slots.** One row is stored and one `ASSIGNED` notification is sent (Task 3 test).
4. **A card with 4 or more assignees.** It shows 3 avatars + "+1" and the label "4 people", and the footer doesn't wrap or overflow at the board's minimum card width (Task 7 test).
5. **Timeline filtered by `?assignee=X` on a shared request.** It shows only X's lane, with the bar marked shared (Task 6 test).

---

### Task 1: Join table, backfill, shared helpers

**Files:**
- Modify: `prisma/schema.prisma` (add `RequestAssignee`; `Request.assignees RequestAssignee[]`; `User.assignments RequestAssignee[] @relation("RequestAssigneeUser")`. Keep `assigneeId` for now.)
- Create: `prisma/migrations/20261014120000_request_assignees/migration.sql`
- Modify: `src/lib/db.ts` (add `"RequestAssignee"` to `SCOPED_MODELS`)
- Create: `src/lib/assignees.ts`
- Test: `tests/requestAssigneesMigration.test.ts`, `tests/assignees.test.ts`

**Interfaces:**
- Produces: `model RequestAssignee { requestId, userId, addedAt, workspaceId; @@id([requestId, userId]); @@index([userId]); @@index([workspaceId]) }`, with `onDelete: Cascade` on the request.
- Produces (`src/lib/assignees.ts`, client-safe, no Prisma import at runtime):
  - `export const ASSIGNEE_ORDER = [{ addedAt: "asc" }, { userId: "asc" }] as const`
  - `export type AssigneeRef = { id: string; name: string }`
  - `export function assigneeLabel(names: string[]): string` returns `""` for none, the name for one, `"A & B"` for two, `"N people"` for 3 or more
  - `export function addedAndRemoved(current: string[], next: string[]): { added: string[]; removed: string[] }` (dedupes `next`)

- [ ] **Step 1: Write the failing tests.** `tests/assignees.test.ts`: `assigneeLabel([])` is `""`; `(["Fafa"])` is `"Fafa"`;
  `(["Fafa","Dimas"])` is `"Fafa & Dimas"`; `(["a","b","c"])` is `"3 people"`. `addedAndRemoved(["a","b"], ["b","c","c"])` gives `{ added: ["c"], removed: ["a"] }`.
  `tests/requestAssigneesMigration.test.ts`: `createTestDb({ upTo: "20261013180000_kpi_roster" })`. Create two requests with `raw`,
  one with `assigneeId` and one without. Call `db.migrate()`. Then `raw.requestAssignee.findMany()` equals exactly one row
  `{ requestId, userId: assigneeId, addedAt: request.requestedAt, workspaceId: CLOGENT_WORKSPACE_ID }`. Also check that a scoped
  `db.prisma.requestAssignee.count()` only sees Clogent rows.
- [ ] **Step 2: Run** `npm test -- tests/assignees.test.ts tests/requestAssigneesMigration.test.ts`. Expected: FAIL (module and table missing).
- [ ] **Step 3: Implement.** Schema, migration (CREATE TABLE plus the FKs to Request with cascade, User and Workspace, the indexes, then
  `INSERT INTO "RequestAssignee" ("requestId","userId","addedAt","workspaceId") SELECT "id","assigneeId","requestedAt","workspaceId" FROM "Request" WHERE "assigneeId" IS NOT NULL;`),
  then `SCOPED_MODELS` and `src/lib/assignees.ts`. Run `npx prisma generate`.
- [ ] **Step 4: Run** the same tests plus `tests/db.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): RequestAssignee table with backfill`.

### Task 2: Changing assignees (core + action + notification)

**Files:**
- Modify: `src/lib/collab.ts` (replace `assignRequestWith` with `setAssigneesWith`)
- Modify: `src/lib/notify.ts` (add `"UNASSIGNED"` to `NotificationType`, `SUBJECTS` = "Removed from a request", `buildMessage`)
- Modify: `src/app/(app)/requests/[id]/actions.ts` (`assignRequest` becomes `setAssignees`)
- Test: `tests/collab.test.ts`, `tests/notify.test.ts`, `tests/actionsUnauth.test.ts`

**Interfaces:**
- Consumes: `addedAndRemoved` (Task 1).
- Produces: `setAssigneesWith(db: PrismaClient, user: Actor, requestId: string, userIds: string[], notifier?: Notifier): Promise<{ ok: true; added: string[]; removed: string[] } | CollabFail>`
- Produces: server action `setAssignees(requestId: string, userIds: string[]): Promise<{ ok: true } | CollabFail>`

- [ ] **Step 1: Write failing tests** in `tests/collab.test.ts`, replacing the `assignRequestWith` block:
  - Adding `[dimas, irsyad]` to an empty request stores 2 rows. The notifier gets one `ASSIGNED` call with `userIds` `[dimas, irsyad]`.
  - Going from `[dimas, irsyad]` to `[irsyad]` gives `removed: [dimas]`. The notifier gets `UNASSIGNED` for `[dimas]` and no `ASSIGNED` call.
  - `[irsyad, irsyad]` stores one row.
  - Adding an inactive person fails with "That person is no longer active.", and the existing rows are unchanged.
  - **Review Focus 1:** the request already has `gone` (inactive) as an assignee. `[gone, irsyad]` returns ok and stores both.
  - On a cancelled request: "A cancelled request cannot be reassigned."
  - A requester who isn't the request's requester gets FORBIDDEN. The request's own requester succeeds.
  - The actor never gets their own notification (a designer adding themselves gets no `ASSIGNED` for themselves).
  - `tests/notify.test.ts`: `buildMessage("UNASSIGNED","Lia","Banner")` returns `Lia removed you from “Banner”`.
- [ ] **Step 2: Run** `npm test -- tests/collab.test.ts tests/notify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `setAssigneesWith`.** Do the permission and cancelled checks, then validate **only `added`**. In a `$transaction`: re-check
  `status !== "CANCELLED"` (fail as today if it has changed), `requestAssignee.deleteMany({ where: { requestId, userId: { in: removed } } })`,
  then `createMany({ skipDuplicates: true })` for the added people. Until Task 10, also keep `Request.assigneeId` = the first assignee by `ASSIGNEE_ORDER` (or null) so unconverted readers stay correct.
  Notify after commit with `bestEffort`. `UNASSIGNED` isn't in `EMAILED_TYPES`, so it stays in-app only.
- [ ] **Step 4: Run** the tests plus `tests/actionsUnauth.test.ts` (rename the action there). Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): setAssignees adds and removes several people`.

### Task 3: Every path that creates a request

**Files:**
- Modify: `src/lib/createRequest.ts` (`assigneeId` becomes `assigneeIds: string[]`; error key `assigneeIds`; `insertRequestTx` writes rows via `tx.requestAssignee.createMany`)
- Modify: `src/lib/submitRequest.ts` (reads `formData.getAll("assigneeIds")`, drops blanks, dedupes; notifies each person who isn't the actor)
- Modify: `src/app/(app)/content/actions.ts`, `src/components/content/ApproveForm.tsx` (still one select, sends `assigneeIds: id ? [id] : []`)
- Modify: `src/lib/import/applyImport.ts`, `src/lib/import/syncExisting.ts` (`ImportRecord.assigneeId` stays single; write and read through the table)
- Test: `tests/createRequest.test.ts`, `tests/submitRequest.test.ts`, `tests/contentApprove.test.ts`, `tests/import/applyImport.test.ts`, `tests/import/dimasDb.test.ts`

**Interfaces:**
- Produces: `CreateRequestInput.assigneeIds?: string[]`, `ValidRequest.assigneeIds: string[]`.

- [ ] **Step 1: Write failing tests.** `createRequestWith` with `assigneeIds: [designer, editor]` creates 2 rows. An id that isn't on the creative team gives
  `errs.assigneeIds === "Pick someone from the creative team"`. **Review Focus 3:** `submitRequest` FormData with `assigneeIds` = `[a, a]`
  gives one row and one `ASSIGNED` notify for `[a]`. Approving a Content Plan post with an assignee gives 1 row. Applying an import record with
  `assigneeId` gives 1 row, and re-syncing with no assignee on the request adds the row ("designer: nobody -> …" change kept).
- [ ] **Step 2: Run** those test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Until Task 10, also set `assigneeId` to the first id.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): new requests, approvals and imports write assignees`.

### Task 4: Lifecycle, chat, content rights, merging

**Files:**
- Modify: `src/lib/transition.ts` (Done guard: `tx.requestAssignee.count({ where: { requestId } }) > 0`, checked inside the tx after the CAS. If the count is 0, throw `NEEDS_ASSIGNEE` and roll back)
- Modify: `src/lib/reschedule.ts`, `src/lib/collab.ts` (comment and attachment recipients: requester plus every assignee, excluding the actor, deduped)
- Modify: `src/lib/chat.ts` (`participantWhere`: `{ assignees: { some: { userId } } }`; raw SQL: `OR EXISTS (SELECT 1 FROM "RequestAssignee" ra WHERE ra."requestId" = r.id AND ra."userId" = ${me.id})`)
- Modify: `src/lib/content/panelView.ts`, `src/lib/content/posts.ts` (any assignee may add finals)
- Modify: `src/lib/mergeUsers.ts` (clash: delete the from-user's rows on requests where the into-user is already assigned, then `updateMany`; REPOINT key `"RequestAssignee.userId"`; `countsFor.assigned` counts the table)
- Test: `tests/lifecycle.test.ts`, `tests/reschedule.test.ts`, `tests/collab.test.ts`, `tests/chat.test.ts`, `tests/contentPosts.test.ts`, `tests/contentPanelView.test.ts`, `tests/mergeUsers.test.ts`

- [ ] **Step 1: Write failing tests.** **Review Focus 2:** a request with zero assignees can't go to DONE (`NEEDS_ASSIGNEE`). With 2 it can.
  A status change notifies the requester and both assignees, not the actor. A deadline move and a comment do the same. The second assignee sees the request in
  `chatUnreadCountWith` and `isParticipantWith` gives "yes". The second assignee may add a FINAL to the linked post. Merging A into B when both
  are assigned to R leaves exactly one row `(R, B)`. The DMMF REPOINT test passes with the new key.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): every assignee gets notices, chat and Done rights`.

### Task 5: KPI

**Files:**
- Modify: `src/lib/kpi/metrics.ts` (`KpiRequest.assigneeIds: string[]`; `KpiResult.doneRequestIds: string[]`)
- Modify: `src/lib/kpi/queries.ts` (select `assignees: { select: { userId: true } }` and map it to `assigneeIds`)
- Modify: `src/lib/kpi/presentation.ts` (`teamSummary` tasksDone = size of the union of `kpi.doneRequestIds`)
- Modify: `src/components/kpi/sections/TeamRequestsSection.tsx` (Tasks done hint, verbatim from Global Constraints)
- Modify: any other `computeKpi` caller (`src/components/kpi/sections/MyRequestsSection.tsx`)
- Test: `tests/kpi/metrics.test.ts`, `tests/kpi/queries.test.ts`, `tests/kpi/helpers.test.ts`, `tests/kpi/kpiSections.test.tsx`

- [ ] **Step 1: Write failing tests.** A done request with `assigneeIds: ["d1","d2"]` gives `tasksDone` 1 for d1 **and** for d2, and both get the same on-time
  result and outputs. Active workload counts it for both. `teamSummary` over the d1 and d2 rows, both with `doneRequestIds: ["r1"]`, gives `tasksDone: 1`.
  When a requester (social media) and a designer both have r1, it's 1. `loadKpiRequests` returns `assigneeIds` in `ASSIGNEE_ORDER`.
- [ ] **Step 2: Run** `npm test -- tests/kpi`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(kpi): each assignee earns the point; team total counts requests once`.

### Task 6: Read model, filters, timeline layout

**Files:**
- Modify: `src/lib/requests.ts` (`RequestRow.assigneeName` becomes `assignees: AssigneeRef[]`; `ROW_SELECT` uses `assignees: { orderBy: ASSIGNEE_ORDER, select: { user: { select: { id, name } } } }`; the filter `assigneeId` becomes `{ assignees: { some: { userId } } }`; the assignee sort key is the first assignee's name, nulls last; `TimelineRow` drops `assigneeId`)
- Modify: `src/lib/workload.ts` (`TimelineItem` gets `assignees: AssigneeRef[]` instead of `assigneeId`/`assigneeName`; `layoutRows` puts the bar in **every** assignee's lane, or "unassigned" when empty; `TimelineBar.shared: boolean`; with `opts.assigneeId` only that lane)
- Unchanged: `src/lib/boardDrop.ts` (`decideDrop` input stays `hasAssignee: boolean`; `Board.tsx` passes `card.assignees.length > 0`)
- Test: `tests/requestsQuery.test.ts`, `tests/workload.test.ts`, `tests/boardColumns.test.ts`

- [ ] **Step 1: Write failing tests.** `?assignee=X` (filter `assigneeId: X`) finds a shared request for either assignee. "My work" (`work=1`) does too.
  The table sort by assignee puts unassigned requests last in both directions. `layoutRows` with one shared item for A and B gives a bar in both lanes, each with `shared: true`, and each lane `count` is 1.
  **Review Focus 5:** with `opts.assigneeId: "A"` only lane A, with `shared: true`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Fix the compile errors in components with a minimal mapping only (`assignees[0]?.name`). The UI work is Tasks 7–8.
- [ ] **Step 4: Run** the tests plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): queries and timeline understand several assignees`.

### Task 7: Board card, calendar card, table, timeline bars

**Files:**
- Modify: `src/components/BoardCard.tsx` (`CardFace`), `src/components/CalendarCard.tsx`, `src/components/RequestTable.tsx`, `src/components/RequestTimeline.tsx`, `src/components/Board.tsx`
- Create: `src/components/ui/SharedChip.tsx` (lucide `Users`, label "Shared", same chip style as `NeedsMotionChip`)
- Test: `tests/boardCard.test.tsx`, `tests/board.test.tsx`, `tests/requestTimeline.test.tsx`, `tests/requestTable` coverage in `tests/requestsQuery.test.ts` or an existing table test

**Interfaces:**
- Consumes: `assigneeLabel`, `AssigneeRef` (Task 1); `RequestRow.assignees`, `TimelineBar.shared` (Task 6); the existing `AvatarStack({ names, max, size, label })`.

- [ ] **Step 1: Write failing tests.** A shared card has `data-card-assignee="shared"`, the text "Fafa & Dimas", an accessible name "Assignees: Fafa, Dimas",
  a "Shared" chip and a `data-shared` root attribute (the hook for the accent bar). A single-assignee card renders exactly as before
  (`data-card-assignee="assigned"`, no chip). **Review Focus 4:** 4 assignees give "4 people" and "+1". The footer label has `truncate` and `min-w-0`.
  **Review Focus 2:** dropping a card with `assignees: []` on Done shows "Assign someone before marking this request Done.".
  The table cell for 3 people reads "Fafa, Dimas +1". A timeline bar with `shared` has an accessible name containing "shared with".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Accent bar: `data-shared` plus `before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-ring`
  (`--accent` is a pale fill and too faint for a 3px bar. `--ring` is the Aqua outline the drag overlay already uses, and it's defined for light and dark). For 2 or more, the footer uses `AvatarStack max={3} size="sm" label="Assignees"`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(board): shared requests show stacked avatars, a Shared chip and an accent edge`.

### Task 8: Request page: multi-person picker

**Files:**
- Modify: `src/app/(app)/requests/[id]/DetailForms.tsx` (`AssigneePicker` becomes `AssigneesPicker`)
- Modify: `src/app/(app)/requests/[id]/RequestDetailContent.tsx`, `RequestDetailView.tsx` (load `assignees` with `user { id, name, active }`; show the header stack; read-only list for viewers)
- Modify: `src/lib/team.ts` (`assigneeOptions(team, current: { id; name; active }[])` keeps each current person who's off the team, with the existing suffix)
- Test: `tests/requestDetailView.test.tsx`, `tests/detailForms.test.tsx`, `tests/team` coverage in an existing test

**Interfaces:**
- Produces: `AssigneesPicker({ requestId, current: AssigneeRef[], options: AssigneeRef[] })`. Each change calls `setAssignees(requestId, nextIds)` (Task 2), with an optimistic update, reverting on error, then `router.refresh()`.

- [ ] **Step 1: Write failing tests.** It renders one chip per current assignee, each with a remove button labelled `Remove Fafa`. "+ Add person" lists only
  options that aren't already chosen. Choosing one calls `setAssignees` with the previous ids plus the new one. On a failed result the list reverts and the error shows
  in `role="alert"`. Viewers who can't assign see the names and no buttons. `assigneeOptions` keeps two off-team current people.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use the existing field and label classes. "+ Add person" is a native `<select>` whose first option is "+ Add person" (keyboard and screen-reader friendly, no new popover).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): pick several assignees on the request page`.

### Task 9: New request form slots

**Files:**
- Modify: `src/app/(app)/requests/new/NewRequestForm.tsx`
- Test: `tests/newRequestForm.test.tsx`, `tests/newRequestFormRedesign.test.tsx`

- [ ] **Step 1: Write failing tests.** For workKind `motion`, two selects labelled "Designer" and "Video editor", both named `assigneeIds`, both optional.
  `static` and `video` show one select labelled "Assignee". "+ Add person" adds another `assigneeIds` select labelled "Another person". The `errs.assigneeIds` message shows under the group.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use `rendered` / `LABELS` keys `assigneeIds` / "Assignees". The slot count is local state, reset when `workKind` changes.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(requests): Design + motion asks for a designer and a video editor`.

### Task 10: Drop `assigneeId`, full verification

**Files:**
- Modify: `prisma/schema.prisma` (remove `assigneeId`, `assignee`, `@@index([assigneeId])`, and `User.assigned`)
- Create: `prisma/migrations/20261014130000_drop_request_assignee_id/migration.sql` (first
  `INSERT … SELECT … WHERE "assigneeId" IS NOT NULL ON CONFLICT DO NOTHING`, then drop the index, FK and column)
- Modify: every remaining compile error, plus `prisma/seed*.ts` and `scripts/*` that reference `assigneeId`. Remove the Task 2/3 "keep `assigneeId` in step" writes.
- Modify: `src/lib/import/parseRequests.ts` only if types require it (the record stays single-person).
- Modify: the spec's "Assignment rules" bullet to say only *added* people are validated (Review Focus 1).

- [ ] **Step 1: Write a failing test.** Extend `tests/requestAssigneesMigration.test.ts`: after `db.migrate()` the `assigneeId` column is gone
  (`information_schema.columns` query gives 0 rows) and the backfilled rows are still there.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then `grep -rn "assigneeId" src prisma scripts tests`. The only hits allowed are the `ImportRecord.assigneeId` field, filter/URL params (`p.assigneeId`, `RequestFilter.assigneeId`) and `TimelinePerson.assigneeId`.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: all PASS.
- [ ] **Step 5: Browser check.** `preview_start` the dev server. Make a "Design + motion" request with two people. The board shows one shared card. Remove one person on the request page and the card goes back to the normal look.
  Check `/dashboard/team`: Tasks done counts the request once. Take a screenshot.
- [ ] **Step 6: Commit** `refactor(requests): drop Request.assigneeId`.
