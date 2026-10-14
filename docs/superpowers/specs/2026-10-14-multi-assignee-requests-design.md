# Multi-assignee requests

Date: 2026-10-14 · Branch: `feat/project-kpi` (spec only) · Sub-project **B** of the 14.10 todo
(A = move Lists into Settings, B = this). Built on its own branch off `feat/creative-request-tracker`.

## Goal

Some requests are made by more than one person. "Design + motion" is the common case: a designer makes
the artwork, then the video editor animates it. Today a request holds one `assigneeId`, so one of them
gets no credit. Let a request have **any number of assignees**, and give **each of them 1 KPI point**
when it's done.

## Non-goals

- No main assignee or helper ranking. Every assignee is equal.
- No split or weighted points (for example 0.5 each). Each assignee gets a full point.
- No new job role. The video editor stays a `DESIGNER` for KPI purposes.
- The board doesn't duplicate cards. One request is one card.
- The spreadsheet import (including the Dimas Tracker log) and Content Plan approval still set one
  person. Both write through the new table, so they keep working.

## Definitions

| Term | Definition |
|---|---|
| **Assignees** | The set of people linked to a request in `RequestAssignee`. It can be empty (unassigned). |
| **Shared request** | A request with 2 or more assignees. |
| **Assigned to X** | X is one of the request's assignees. Used by every filter, permission check and KPI rule that used `assigneeId === X`. |

## Data model (two migrations, one deploy)

```prisma
/// One person working on a request. A request with several rows is shared; each assignee gets full KPI credit.
model RequestAssignee {
  requestId String
  userId    String
  addedAt   DateTime @default(now())

  request Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
  user    User    @relation("RequestAssignee", fields: [userId], references: [id])

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@id([requestId, userId])
  @@index([userId])
  @@index([workspaceId])
}
```

- `Request.assignees RequestAssignee[]` replaces `assigneeId` and `assignee`. `User.assigned` becomes
  `RequestAssignee[]`.
- Add `"RequestAssignee"` to `SCOPED_MODELS` in `src/lib/db.ts`.
- Two migrations ship together in **one deploy**:
  1. `20261014120000_request_assignees`: create the table, its indexes and foreign keys, then backfill
     `INSERT INTO "RequestAssignee" ("requestId","userId","addedAt","workspaceId") SELECT "id","assigneeId","requestedAt","workspaceId" FROM "Request" WHERE "assigneeId" IS NOT NULL;`
  2. `20261014130000_drop_request_assignee_id`: copy again any assignee that is still missing from the join
     table (the same `INSERT … SELECT` with `ON CONFLICT DO NOTHING`, a no-op when nothing changed in between),
     then drop the `Request_assigneeId_fkey` foreign key, the `Request_assigneeId_idx` index and the
     `assigneeId` column.
- As written they must **not** be split across deploys: the code in this release no longer reads or writes
  `assigneeId`, so running only the first one would leave the column to drift, and code from before this
  release fails once the second one has run. `prisma migrate deploy` applies both in order.
- The migration doesn't backfill `addedAt` beyond `requestedAt`. That's enough for ordering.
- Rolling back to the code from before this release needs the column back:
  `docs/superpowers/specs/2026-10-14-multi-assignee-rollback.sql` (manual use only) re-adds it from the first
  assignee of each request and leaves `RequestAssignee` in place.

## Assignment rules

- Who may add or remove assignees: exactly who may assign today (`canAssign` / `canPickAssignee`).
- Who may be an assignee: the same checks as today's `assignRequestWith` in `src/lib/collab.ts`: an
  active user who isn't a `REQUESTER` and has job role `DESIGNER`. Only the people being added are
  checked. An existing assignee who has since left the team or been deactivated may stay on the request.
- New server action `setAssignees(requestId, change: { add?: string[]; remove?: string[] })` replaces
  `assignRequest`. It applies **one change against the current rows**, not a whole list: inside one
  transaction it locks the request row, reads who is assigned now, adds only the people in `add` who are
  not there yet and removes only the people in `remove` who are. A page that is out of date therefore never
  removes someone another person added, or brings back someone another person removed. It returns the
  effective `added` / `removed`, and notifications follow those. It fails if the request is `CANCELLED`
  (as today). `add` and `remove` must be lists of ids (at most 20 each, not the same person in both);
  duplicate ids are dropped. Order isn't kept; the UI orders by `addedAt`. The request page sends one add
  or one remove per click.
- Moving to **Done** needs at least one assignee. The `transition.ts` guard becomes "has at least one
  `RequestAssignee`", checked again inside the transaction, as the current concurrent-unassign pin does.
- `mergeUsers.ts`: moving the merged person's `RequestAssignee` rows onto the person they're merged into
  must skip requests where that person is already an assignee (because of the composite primary key).
  Do it as insert-missing, then delete.

## KPI (`src/lib/kpi/metrics.ts`, `queries.ts`)

- `KpiRequest.assigneeId: string | null` becomes `assigneeIds: string[]`.
- `DESIGNER` basis: a request is the user's when `assigneeIds.includes(user.id)`. Each assignee then
  gets the request in full: tasks done +1, its outputs, its on-time result, turnaround and revision
  rounds. `SOCIAL_MEDIA` (requester) basis is unchanged.
- Active workload: open requests where the user is one of the assignees.
- **Team summary "Tasks done"** (`teamSummary`, Team KPI › Requests) becomes the number of **distinct
  request ids** done in the month by anyone on the roster. It no longer sums each person's row. This
  also stops the existing double count where both the requester and the designer are on the roster.
  The per-person rows don't change. A hint under the tile says: "Each request counted once, even when
  several people worked on it."
- `teamSummary` (`src/lib/kpi/presentation.ts`) counts the union of each row's `doneRequestIds`.
  `KpiResult` gains `doneRequestIds: string[]`. The tile now lives in the page-level summary
  (`teamSummaryCells` in `src/lib/kpi/summary.ts`, rendered by `TeamSummary.tsx`) as "Request tasks done",
  with the hint above under it.

## UI

**Board card (`BoardCard.tsx` / `CardFace`).** Still one card per request. When the request is shared:
- Footer, right side: **overlapping avatars** (up to 3, then a "+N" disc) and a short label:
  "Fafa & Dimas" for two people, "3 people" for more.
- A **"Shared" chip** (lucide `Users` icon) in the chip row, after the motion chip.
- A **3px accent bar** on the card's left edge (inset, inside the radius, using the existing accent
  token; it works in light and dark mode).
- The accessible name of the footer avatars lists everyone: "Assignees: Fafa, Dimas".
- A card with one assignee looks exactly as it does today, and so does an unassigned card.
- `data-card-assignee` becomes `"unassigned" | "assigned" | "shared"`.

**Request page (`RequestDetailView.tsx`).** The single `AssigneePicker` becomes a multi-select. Each
current assignee is a chip with a remove ×. "+ Add person" opens the same list of people, without the
ones already added. `assigneeOptions` (`src/lib/team.ts`) keeps every current assignee in the
list even when they're no longer on the team, as it does today for the single assignee, flagged `offTeam`;
the picker never offers such a person to add (once removed they would be refused). Every change saves on
its own (add or remove) through `setAssignees`. People who
can't assign see the list read-only. The page header shows the stacked avatars.

**New request form (`NewRequestForm.tsx`).**
- "Design + motion": two labelled optional slots, **Designer** and **Video editor**. They're just
  hints; both save as ordinary assignees.
- "Static" and "Video": one slot, as today.
- All kinds: a "+ Add person" link adds another slot.
- `createRequest` / `submitRequest` take `assigneeIds: string[]`.

**Request table (`RequestTable.tsx`).** The assignee cell shows names joined with ", ", cut short with
"+N" past 2. Sorting by assignee uses the first assignee by `addedAt`, and unassigned requests still go
last.

**Filters (`params.ts`, `requests.ts`, `FilterBar.tsx`).** `?assignee=X` and "My requests" match
`assignees: { some: { userId: X } }`. The URL format doesn't change.

**Workload timeline (`workload.ts`, `RequestTimeline.tsx`).** A shared request puts a bar in **each
assignee's lane**. The lane really is that person's workload, and this is not the board. Shared bars
carry a small `Users` icon and say "shared with …" in their tooltip or accessible name. The lane
`count` includes them.

## Notifications and chat

- `ASSIGNED` goes to each **newly added** person. A new type `UNASSIGNED` (`Notification.type` is a
  string, so this needs no migration; add it to `buildMessage` in `notify.ts` and to the
  notification link and email mapping)
  ("<actor> removed you from <title>") goes to each removed person. The actor never notifies
  themselves.
- Status changes (`transition.ts`), deadline changes (`reschedule.ts`) and comments (`collab.ts`)
  notify the requester plus **every assignee**, without duplicates and without the actor.
- Chat (`chat.ts`): "requests whose chat a user belongs to" matches any assignee. This includes the raw
  SQL at line 74, which becomes an `EXISTS` on `RequestAssignee`.
- Content Plan (`content/panelView.ts`, `content/posts.ts`): "the request's assignee may add finals"
  becomes "any assignee may".

## Error handling

- `setAssignees` adding an unknown, inactive, requester or non-designer id: the whole call fails with the
  same messages as today. Nothing is applied. Only people actually being added are checked.
- Two people editing assignees at the same time: last write wins for each person. Each call is one add or
  remove applied to the current rows under the request row lock; the insert skips existing rows and the
  delete is by primary key, so neither one can corrupt the set or undo the other's change to someone else.
- If the last assignee is removed from a request that's `DONE`, the request stays done. This matches
  today, where unassigning a done request is blocked only by the UI, not the data. The KPI just drops
  that request.

## Testing

- **Migration:** a test database with existing requests gets one `RequestAssignee` row per non-null
  `assigneeId`, and the column is gone.
- **KPI (`tests/kpi`):** a shared, done request gives +1 to each assignee's `tasksDone`, and both get
  the on-time result. `teamSummary` counts it once. The requester and designer case also counts once.
- **`setAssignees`:** adds and removes; rejects an invalid person without changing anything; skips
  duplicate ids; rejects input that is not id lists or names more than 20 ids; notifications go only to
  the people actually added or removed. A stale page adding someone keeps the person another page added
  (and does not notify them); removing someone already removed is a no-op with no notice.
- **Transition:** Done is blocked with no assignees and allowed with one or more.
- **`mergeUsers`:** merging A into B where both are on the same request leaves one row for B.
- **UI:** the shared card shows the avatars, chip and accent bar, and gets
  `data-card-assignee="shared"`. A card with one assignee doesn't change. The request page picker adds
  and removes people. The new-request "Design + motion" form shows the Designer and Video editor slots.
- **Filters and timeline:** `?assignee=X` finds a shared request for either person, and the timeline
  shows it in both lanes.

## Rollout

The migrations and code ship together in one deploy (Vercel + Neon). Code from before this release reads
`Request.assigneeId`, so it fails from the moment the second migration drops the column until the new code
is live. Keep that window short:

1. Build first, without deploying: `vercel build --prod`.
2. Take a Neon branch (or snapshot) of production, so the data can be restored.
3. Run `prisma migrate deploy` against production (both migrations, in order).
4. Ship the build at once: `vercel deploy --prebuilt --prod`.

If the release must be rolled back to the old code, restore from the Neon branch, or run
`docs/superpowers/specs/2026-10-14-multi-assignee-rollback.sql` by hand before deploying the old build
(it re-creates `assigneeId` from each request's first assignee; shared requests keep only that person).

Existing single-assignee requests look and score exactly as before. Only the Team summary "Request tasks
done" can drop, because it now counts each request once. Mention that in the release note.
