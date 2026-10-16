# In-app Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the notifications the app already stores (plus two new triggers) in a top-right bell dropdown and a
`/notifications` page; clicking one opens the request.

**Architecture:** Triggers stay in `src/lib/notify.ts` / `collab.ts` / `transition.ts`. A new `src/lib/inbox.ts`
holds per-user read/mark queries; thin server actions wrap it. A client `NotificationBellView` (Radix dropdown)
and a server page share one `NotificationItem` component.

**Tech Stack:** Next 16.4 (App Router, cacheComponents, async `searchParams`), React 19, Prisma, Radix
`DropdownMenu`, lucide icons, Tailwind, Vitest + Testing Library + `tests/helpers/testDb`.

**Spec:** `docs/superpowers/specs/2026-10-10-notifications-inbox-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- No Prisma schema change.
- Every inbox query filters `userId = signed-in user`; use the workspace-scoped db (`dbFor(user)` / `requireScope()`).
- Notification sending stays best-effort (`bestEffort`); it must never fail the user's action.
- Copy, verbatim:
  - DESIGN_SENT: `{actor} sent the design for “{title}” for review`
  - ATTACHMENT: `{actor} added a design link “{name}” to “{title}”`
  - Dropdown empty: `You're all caught up.` · footer link: `See all notifications` · button: `Mark all as read`
  - Page title: `Notifications` · page empty: `No notifications yet.`
  - Bell aria-label: `Notifications, N unread` (`Notifications` when 0); badge `9+` above nine, hidden at 0.
- Page size: dropdown 20, page `TABLE_PAGE_SIZE` (50).
- Leave the user's unrelated uncommitted files (`TodayOverview.tsx`, `todayOverview.ts`, its test,
  `WelcomeIllustration.tsx`) alone; never `git add -A`.

## Review Focus

1. A long message (5000-char comment titles are capped, but attachment names up to 200 chars) must wrap/truncate,
   not widen the dropdown past the viewport on a phone. → Task 4 test: item has `line-clamp-2`/`break-words`.
2. Marking another user's notification id must be a silent no-op, not an error. → Task 3 test.
3. A failed `markRead` action must revert the optimistic read. → Task 4 test.
4. `?page=999` or `?page=abc` on `/notifications` clamps to a valid page. → Task 6 test.
5. A notification whose request was deleted is cascaded away; one with `requestId = null` renders without a link and
   only marks read. → Task 4 test.

---

### Task 1: notify — new types, messages, `email: false`

**Files:**
- Modify: `src/lib/notify.ts`
- Test: `tests/notify.test.ts`

**Interfaces:**
- Produces: `NotificationType` adds `"DESIGN_SENT" | "ATTACHMENT"`; `NotifyInput` gains `email?: boolean`;
  `buildMessage(type, actorName, title, change?, extra?: { name?: string })` handles the two new types.

- [ ] **Step 1: Write failing tests** in `tests/notify.test.ts`:
  - `buildMessage("DESIGN_SENT", "Dimas", "Banner")` → `Dimas sent the design for “Banner” for review`.
  - `buildMessage("ATTACHMENT", "Dimas", "Banner", undefined, { name: "Final v2" })` →
    `Dimas added a design link “Final v2” to “Banner”`.
  - `notifyWith(db, mailer, { ...input, email: false })` creates one notification row per recipient and
    `sent.length === 0`, `emailedAt === null`.
- [ ] **Step 2:** `npx vitest run tests/notify.test.ts` → the three new tests FAIL.
- [ ] **Step 3: Implement.** Add both types to `NotificationType` and `SUBJECTS` (`"Design sent for review"`,
  `"New design link"`); add the switch cases (name via `cleanLine(…, 80)`); in `notifyWith` skip mail when
  `input.email === false`.
- [ ] **Step 4:** `npx vitest run tests/notify.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(notify): DESIGN_SENT and ATTACHMENT types, in-app-only option`.

### Task 2: triggers — First Look and new design link

**Files:**
- Modify: `src/lib/transition.ts:69-74`, `src/lib/collab.ts` (`addAttachmentWith`)
- Test: `tests/notify.test.ts` (transition), `tests/collab.test.ts` (attachment)

**Interfaces:**
- Consumes: Task 1 types and `buildMessage`.
- Produces: `addAttachmentWith(db, user, requestId, input, notifier: Notifier = notifierFor(db))` (new last param).

- [ ] **Step 1: Write failing tests** with a capturing fake notifier (`const calls: NotifyInput[] = []`):
  - transition ON_PROGRESS → FIRST_LOOK by the assignee: one call, `type: "DESIGN_SENT"`, message as above,
    `userIds` = [requester] (actor excluded).
  - transition REQUESTED → ON_PROGRESS still sends `type: "STATUS"`.
  - `addAttachmentWith` by the assignee on a request with requester R: one call, `type: "ATTACHMENT"`,
    `email: false`, `userIds` = [R], message contains the link name.
  - a notifier that throws does not fail `addAttachmentWith` (`r.ok === true`).
- [ ] **Step 2:** run both files → new tests FAIL.
- [ ] **Step 3: Implement.** In `transition.ts` pick `type = change.to === "FIRST_LOOK" ? "DESIGN_SENT" : "STATUS"`.
  In `addAttachmentWith` select `title, requesterId, assigneeId` on the request, then after create run the
  `bestEffort` block like `addCommentWith` (actor name lookup, dedupe, drop actor, skip when empty).
- [ ] **Step 4:** `npx vitest run tests/notify.test.ts tests/collab.test.ts tests/lifecycle.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(notify): notify on First Look and on new design links`.

### Task 3: inbox queries + server actions

**Files:**
- Create: `src/lib/inbox.ts`, `src/app/(app)/notifications/actions.ts`
- Test: `tests/inbox.test.ts`

**Interfaces:**
- Produces:
  - `type InboxItem = { id: string; type: string; message: string; requestId: string | null; readAt: Date | null; createdAt: Date }`
  - `listNotificationsWith(db, userId, opts?: { limit?: number; offset?: number }): Promise<InboxItem[]>` (default 20/0, newest first, tiebreak `id desc`)
  - `countNotificationsWith(db, userId): Promise<number>`
  - `unreadCountWith(db, userId): Promise<number>`
  - `markReadWith(db, userId, id, now = new Date()): Promise<void>`
  - `markAllReadWith(db, userId, now = new Date()): Promise<void>`
  - actions (`"use server"`): `listNotifications(): Promise<{ ok: true; items: InboxItem[]; unread: number } | CollabFail>`,
    `markNotificationRead(id: string): Promise<{ ok: true } | CollabFail>`,
    `markAllNotificationsRead(): Promise<{ ok: true } | CollabFail>` — same `withUser`/`dbFor`/`unauthResult`
    pattern as `src/app/(app)/requests/[id]/actions.ts`; mark actions call `revalidatePath("/notifications")`.

- [ ] **Step 1: Write failing tests** (`createTestDb`, two users A and B, 25 rows for A at distinct `createdAt`, 1 for B):
  - list returns 20 for A, newest first; `{ offset: 20 }` returns 5; never includes B's row.
  - `countNotificationsWith(A) === 25`; `unreadCountWith(A) === 25`.
  - `markReadWith(A, rowOfA)` → unread 24; calling it again keeps the original `readAt`.
  - `markReadWith(A, rowOfB)` resolves and B's row stays unread.
  - `markAllReadWith(A)` → unread 0 for A, B still 1.
- [ ] **Step 2:** `npx vitest run tests/inbox.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `inbox.ts` (`updateMany` with `{ userId, readAt: null }` guards) and the actions.
- [ ] **Step 4:** `npx vitest run tests/inbox.test.ts tests/actionsUnauth.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(inbox): per-user notification queries and actions`.

### Task 4: `NotificationItem` + bell dropdown

**Files:**
- Create: `src/lib/relativeTime.ts`, `src/components/notifications/NotificationItem.tsx`,
  `src/components/shell/NotificationBellView.tsx` (client), `src/components/shell/NotificationBell.tsx` (server)
- Test: `tests/relativeTime.test.ts`, `tests/notificationBell.test.tsx`

**Interfaces:**
- Consumes: Task 3 `InboxItem` and actions.
- Produces:
  - `relativeTime(date: Date, now: Date): string` → `just now` (<1m), `5m ago`, `2h ago`, `3d ago` (<7d), else `d MMM` (e.g. `3 Oct`).
  - `NotificationItem({ item, now, onSelect }: { item: InboxItem; now: Date; onSelect?: () => void })` — renders
    unread dot + tinted bg when `readAt === null`, message with `line-clamp-2 break-words`, relative time.
  - `NotificationBellView({ unread, actions }: { unread: number; actions?: { list; markRead; markAll } })` —
    actions default to the Task 3 server actions (injectable for tests).
  - `NotificationBell()` — async server component: `requireScope()`, `unreadCountWith`, renders the view.

- [ ] **Step 1: Write failing tests.** `relativeTime` boundaries (59s, 5m, 2h, 3d, 8d). Bell (mock
  `next/navigation` `useRouter` push; Radix jsdom shims as in `tests/profileMenu.test.tsx`):
  - aria-label `Notifications, 3 unread`, badge `3`; unread 12 → badge `9+`; unread 0 → no badge, label `Notifications`.
  - opening calls `list`; empty items → `You're all caught up.`; `Mark all as read` disabled at 0 unread.
  - selecting an unread item with `requestId: "r1"` calls `markRead("id")`, pushes `/requests/r1`, badge decrements.
  - `markRead` resolving `{ ok: false }` restores the unread dot and badge.
  - an item with `requestId: null` calls `markRead` and does not push.
  - `Mark all as read` calls `markAll` and hides the badge.
  - footer link `See all notifications` has `href="/notifications"`.
- [ ] **Step 2:** `npx vitest run tests/relativeTime.test.ts tests/notificationBell.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Radix `DropdownMenu` `modal={false}`, `align="end"`, content `w-80 max-w-[calc(100vw-2rem)]`,
  list area `max-h-96 overflow-y-auto`; trigger is a `size-9` round button with lucide `Bell`, styled like the profile
  trigger; items are `DropdownMenu.Item` with `onSelect`. Badge uses the destructive token. Loading shows 3 skeleton rows.
- [ ] **Step 4:** run the two test files → PASS.
- [ ] **Step 5:** Commit `feat(notifications): bell dropdown in the top bar`.

### Task 5: wire into the shell, remove the sidebar item

**Files:**
- Modify: `src/components/AppShell.tsx`
- Test: `tests/shellNavGating.test.tsx` (or a new `tests/notificationShell.test.tsx` following its mocks)

**Interfaces:**
- Consumes: Task 4 `NotificationBell`.

- [ ] **Step 1: Write failing tests:** the rendered shell's Main nav has no `Notifications` item; the profile slot
  contains a button whose name starts with `Notifications` before the account menu button.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `profile={<div className="flex items-center gap-2"><Suspense fallback={<Skeleton rounded="full" className="size-9" />}><NotificationBell /></Suspense><Suspense …><ProfileMenu /></Suspense></div>}`;
  delete the `DisabledNavItem label="Notifications"` line and the unused `Bell` import.
- [ ] **Step 4:** `npx vitest run tests/shellNavGating.test.tsx tests/appFrame.test.tsx tests/shellHydration.test.tsx` → PASS.
- [ ] **Step 5:** Commit `feat(shell): notification bell beside the profile menu; drop the sidebar placeholder`.

### Task 6: `/notifications` page

**Files:**
- Create: `src/app/(app)/notifications/page.tsx`, `src/app/(app)/notifications/NotificationsContent.tsx`,
  `src/app/(app)/notifications/MarkAllButton.tsx` (client), `src/app/(app)/notifications/NotificationLink.tsx` (client)
- Test: `tests/notificationsPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 queries/actions, Task 4 `NotificationItem`, `parsePage`/`pageWindow`/`rangeText`/`TABLE_PAGE_SIZE`
  from `src/lib/paging.ts`, `Pagination` from `src/components/Pagination.tsx`, `PageHeader`.
- Produces: `NotificationsContent({ searchParams }: { searchParams: PageProps<"/notifications">["searchParams"] })`.

- [ ] **Step 1: Write failing tests** (mock `@/lib/session` like `tests/settings-page.test.tsx`, real `createTestDb`
  or mocked queries): 60 rows → page 1 shows 50 and `Showing 1–50 of 60`; `?page=999` shows `Showing 51–60 of 60`;
  `?page=abc` shows page 1; zero rows → `No notifications yet.`; an item links/navigates to `/requests/{id}`.
- [ ] **Step 2:** `npx vitest run tests/notificationsPage.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Page mirrors `settings/page.tsx`: `metadata = { title: "Notifications" }`, `PageHeader`
  title `Notifications`, content in `Suspense` with a skeleton. Content: `requireScope()`, count → `pageWindow` →
  `listNotificationsWith({ limit: TABLE_PAGE_SIZE, offset: w.skip })`; `MarkAllButton` in header actions (disabled
  when unread 0, `router.refresh()` after); each row a `NotificationLink` wrapping `NotificationItem` that marks read
  then pushes the request. `hrefFor = (p) => p === 1 ? "/notifications" : `/notifications?page=${p}``.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(notifications): full notifications page`.

### Task 7: whole-suite check and browser verification

- [ ] **Step 1:** `npx vitest run` → all pass; `npx tsc --noEmit` and `npm run lint` → clean.
- [ ] **Step 2:** In the browser preview, as a designer, add a link and move a request to First Look; sign in as the
  requester: badge shows 2, dropdown lists both messages, click opens the request and the badge drops, "See all
  notifications" opens the page; check at 375px width and in dark mode. Screenshot.
- [ ] **Step 3:** Fix anything found (with a test), commit.
