# Request Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bottom-right chat dock that shows each request's comments as one group chat per request, near-live via polling.

**Architecture:** Chat messages are existing `Comment` rows; a new `ChatRead` table stores each person's read position
per request. `src/lib/chat.ts` holds the queries (participant filter, unread count, chat list, messages, mark read),
`src/app/(app)/chat/actions.ts` wraps them as server actions, and a client `ChatDockView` polls them through a
`usePoll` hook that pauses while the tab is hidden.

**Tech Stack:** Next.js 16 (App Router, server actions, cacheComponents), Prisma 6 + Postgres, React 19, Tailwind 4,
radix-ui, lucide-react, Vitest + Testing Library, embedded-postgres test DB.

**Spec:** `docs/superpowers/specs/2026-10-10-request-chat-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next API (AGENTS.md); this Next has breaking changes.
- Every DB function takes the workspace-scoped client (`ScopedDb` / `PrismaClient` typed) and is named `…With`, like `src/lib/inbox.ts`.
- `$queryRaw` is **not** workspace-scoped (`src/lib/db.ts`): any raw SQL must filter `"workspaceId"` explicitly.
- Participants: the requester, the assignee, every comment author, every user in any comment's `mentions`. Never stored.
- Only requests with at least one comment are chats.
- A user's own messages are never unread; no `ChatRead` row means every message from others is unread.
- `lastReadAt` only ever moves forward.
- Page sizes: chat list 20, messages 30. Preview body trimmed to 120 characters.
- Poll intervals: badge 60 000 ms (dock closed), list 30 000 ms (dock open, no conversation), messages 5 000 ms (conversation open). No polling while `document.hidden`; one immediate run on becoming visible. Never overlapping; only one poll active at a time.
- Badge: hidden at 0, the number up to 9, `9+` above nine. Launcher `aria-label`: `Messages, N unread` (`Messages` at 0).
- Copy: empty list "No chats yet. Comment on a request to start one."; no selection "Pick a chat to start messaging."
- Message bodies render as plain text with `splitMentions` highlighting: no markdown, no HTML.
- Sending goes through `addCommentWith` (validation, mentions and notifications unchanged).

## Review Focus

1. **Cross-workspace leak through raw SQL:** a comment in another workspace by someone with the same request id shape must never count toward the badge. *Test in Task 2.*
2. **Request deleted while its chat is open:** the next poll returns `NOT_FOUND`; the dock shows the message instead of crashing or polling forever. *Test in Task 6.*
3. **Two comments with the same `createdAt`:** the `after` cursor must not drop or duplicate them. Order by `[createdAt, id]`, and the client de-duplicates appended messages by `id`. *Tests in Tasks 3 and 6.*
4. **The user sends, then the poll returns the same message:** it must appear once (de-dup by `id`). *Test in Task 6.*
5. **Very long single-word messages / URLs:** the bubble wraps (`break-words`, `whitespace-pre-wrap`) instead of widening the popup. *Asserted by class in Task 6.*

---

### Task 1: `ChatRead` model, comment index, workspace scoping

**Files:**
- Modify: `prisma/schema.prisma` (new `ChatRead` model as in the spec; back-relations `chatReads ChatRead[]` on `User`, `Request`, `Workspace`; `@@index([requestId, createdAt])` on `Comment`)
- Create: `prisma/migrations/20261010120000_chat_read/migration.sql` (generate with `npx prisma migrate dev --name chat_read --create-only`, then rename the folder to this timestamp)
- Modify: `src/lib/db.ts:16-19` (add `"ChatRead"` to `SCOPED_MODELS`)
- Test: `tests/workspaces.test.ts` (add `chatRead: { lastReadAt: new Date(0) }` to `MODELS` and seed a `ChatRead` row per workspace the same way the suite seeds the other models)

**Interfaces:**
- Produces: Prisma delegate `db.chatRead` with fields `id, userId, requestId, lastReadAt, workspaceId`; unique `userId_requestId`.

- [ ] **Step 1:** Add the `chatRead` entry to `MODELS` in `tests/workspaces.test.ts` and seed its rows.
- [ ] **Step 2:** Run `npx vitest run tests/workspaces.test.ts`. Expected: FAIL (`chatRead` is undefined on the client).
- [ ] **Step 3:** Edit the schema, create the migration, run `npx prisma generate`, and add `"ChatRead"` to `SCOPED_MODELS`. The migration's `workspaceId` column is `TEXT NOT NULL` with no default (the scoped client stamps it), plus a FK to `Workspace`, matching the other tables in `20261009180000_workspaces`.
- [ ] **Step 4:** Run `npx vitest run tests/workspaces.test.ts tests/schema.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(chat): ChatRead model and comment (requestId, createdAt) index`.

### Task 2: participant filter, mark read, unread count

**Files:**
- Create: `src/lib/chat.ts`
- Test: `tests/chat.test.ts` (embedded DB via `createTestDb`, fixtures built like `tests/inbox.test.ts`: users R (requester), D (assignee), C (commenter), M (mentioned), X (unrelated))

**Interfaces:**
- Consumes: `db.chatRead` (Task 1).
- Produces:
  - `participantWhere(userId: string): Prisma.RequestWhereInput`: the `OR` of `requesterId`, `assigneeId`, `comments.some.authorId`, `comments.some.mentions.has`.
  - `isParticipantWith(db, userId: string, requestId: string): Promise<"yes" | "no" | "missing">`
  - `markChatReadWith(db, userId: string, requestId: string, at?: Date): Promise<void>`
  - `chatUnreadCountWith(db, me: { id: string; workspaceId: string }): Promise<number>`

- [ ] **Step 1: Write the failing tests** in `tests/chat.test.ts`:
  - `isParticipantWith` is `"yes"` for R, D, C, M; `"no"` for X; `"missing"` for an unknown id.
  - `chatUnreadCountWith`: with three comments by C and none read, R → 3 and C → 0 (own messages are excluded). After `markChatReadWith(R, req, t2)` where `t2` = the second comment's `createdAt`, R → 1.
  - `markChatReadWith` never moves back: mark at `t3`, then at `t1`, and the row's `lastReadAt` equals `t3`. Two calls create exactly one row.
  - `markChatReadWith` for X creates no row.
  - X's unread count is 0 even with comments on the request.
  - **Workspace isolation:** create a second workspace via `db.raw` with its own request and comment authored by someone else, where R is the requester (raw insert with that workspace's id). R's count in the Clogent workspace is unchanged.
- [ ] **Step 2:** Run `npx vitest run tests/chat.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**
  - `markChatReadWith`: if `isParticipantWith` is not `"yes"`, return. Otherwise `updateMany({ where: { userId, requestId, lastReadAt: { lt: at } }, data: { lastReadAt: at } })`. If the count is 0 and no row exists, `create`, and catch Prisma `P2002` (a concurrent create) as a no-op.
  - `chatUnreadCountWith`: one `$queryRaw`:

```sql
SELECT COUNT(*)::int AS n
FROM "Comment" c
JOIN "Request" r ON r.id = c."requestId"
LEFT JOIN "ChatRead" cr ON cr."requestId" = c."requestId" AND cr."userId" = ${me.id}
WHERE c."workspaceId" = ${me.workspaceId} AND r."workspaceId" = ${me.workspaceId}
  AND c."authorId" <> ${me.id}
  AND (cr."lastReadAt" IS NULL OR c."createdAt" > cr."lastReadAt")
  AND (r."requesterId" = ${me.id} OR r."assigneeId" = ${me.id}
       OR EXISTS (SELECT 1 FROM "Comment" c2 WHERE c2."requestId" = r.id
                  AND (c2."authorId" = ${me.id} OR ${me.id} = ANY(c2.mentions))))
```

- [ ] **Step 4:** Run `npx vitest run tests/chat.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(chat): participant rule, read position and unread count`.

### Task 3: chat list and messages

**Files:**
- Modify: `src/lib/chat.ts`
- Test: `tests/chat.test.ts`

**Interfaces:**
- Consumes: `participantWhere`, `isParticipantWith` (Task 2).
- Produces:
  - `type ChatMessage = { id: string; body: string; createdAt: Date; author: { id: string; name: string } }`
  - `type ChatSummary = { requestId: string; title: string; status: RequestStatus; lastMessage: { body: string; authorId: string; authorName: string; createdAt: Date }; unread: number }`
  - `listChatsWith(db, userId: string, opts?: { limit?: number; offset?: number }): Promise<ChatSummary[]>`
  - `listMessagesWith(db, userId: string, requestId: string, opts?: { after?: Date; before?: Date; limit?: number }): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | CollabFail>`
  - `PREVIEW_LEN = 120`, `CHAT_PAGE = 20`, `MESSAGE_PAGE = 30`

- [ ] **Step 1: Write the failing tests:**
  - `listChatsWith`: with requests A (last comment at t5) and B (last comment at t9), both involving R, the result for R is `[B, A]`. A request with no comments is absent. X gets `[]`. `limit: 1, offset: 1` returns `[A]`.
  - Preview: a 300-character body comes back with `lastMessage.body.length === 120`, plus `authorName`.
  - Per-chat `unread` matches `chatUnreadCountWith` summed across chats.
  - `listMessagesWith` default: with 35 comments, it returns the newest 30 in ascending order and `hasOlder: true`. `before: messages[0].createdAt` returns the remaining 5 with `hasOlder: false`.
  - `after`: returns only newer messages, ascending, with `hasOlder: false`. **Same-timestamp case:** two comments with an identical `createdAt` are both returned by the default call, in `id` order.
  - X gets `{ ok: false, code: "FORBIDDEN" }`; an unknown id gets `NOT_FOUND`.
- [ ] **Step 2:** Run `npx vitest run tests/chat.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `listChatsWith`: (1) `comment.groupBy({ by: ["requestId"], where: { request: participantWhere(userId) }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take, skip })`. (2) `request.findMany` (id, title, status) for those ids. (3) The last comment per id: `comment.findMany({ where: { OR: groups.map(g => ({ requestId, createdAt: g._max.createdAt })) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include author name })`, keeping the first per request. (4) `chatRead.findMany` for those ids. (5) Unread: `comment.groupBy({ by: ["requestId"], where: { authorId: { not: userId }, OR: ids.map(id => ({ requestId: id, createdAt: { gt: readAt(id) ?? new Date(0) } })) }, _count: { _all: true } })`. Five queries, all bounded by the page size. Preserve the order from (1).
  - `listMessagesWith`: gate on `isParticipantWith`. Use `after` → `createdAt > after`, ascending, `take: 100`. Otherwise use `createdAt < before` (if given), `orderBy [{createdAt:"desc"},{id:"desc"}]`, `take: limit + 1`, `hasOlder = rows.length > limit`, then reverse. In `after` mode, `hasOlder` is `false` (the client keeps its own value).
- [ ] **Step 4:** Run `npx vitest run tests/chat.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(chat): chat list and paged messages`.

### Task 4: server actions, plus marking read from the request page

**Files:**
- Create: `src/app/(app)/chat/actions.ts` (the `run` helper copied from `src/app/(app)/notifications/actions.ts`)
- Modify: `src/app/(app)/requests/[id]/RequestDetailContent.tsx` (mark read after render)
- Test: `tests/actionsUnauth.test.ts` (add the new actions to its unauthenticated table, following the file's pattern)

**Interfaces:**
- Consumes: everything from Tasks 2 and 3, plus `addCommentWith` from `src/lib/collab.ts`.
- Produces (all `"use server"`, each returning `… | CollabFail`):
  - `chatUnreadCount(): Promise<{ ok: true; unread: number }>`
  - `listChats(offset?: number): Promise<{ ok: true; chats: ChatSummary[] }>`
  - `listMessages(requestId: string, opts?: { after?: Date; before?: Date }): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean }>`
  - `markChatRead(requestId: string): Promise<{ ok: true }>`
  - `sendChatMessage(requestId: string, body: string): Promise<{ ok: true; message: ChatMessage }>`

- [ ] **Step 1:** Add the five actions to `tests/actionsUnauth.test.ts`, each expecting `{ ok: false, code: "UNAUTHENTICATED" }`.
- [ ] **Step 2:** Run `npx vitest run tests/actionsUnauth.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the actions.** Validate inputs the way `markNotificationRead` does: a non-string or empty `requestId` returns `INVALID`, and `after`/`before` must be valid `Date`s or are ignored. `sendChatMessage` calls `addCommentWith(db, user, requestId, body)`. On success it reads the comment back as a `ChatMessage` and calls `markChatReadWith(db, user.id, requestId, message.createdAt)`. None of the read actions call `revalidatePath`; the send revalidates `/requests/${requestId}`, like the existing `addComment` action does.
- [ ] **Step 4: Mark read from the request page.** In `DetailContent`, after `req` loads, schedule `markChatReadWith(db, user.id, id)` with Next's `after()` from `next/server`. Read `node_modules/next/dist/docs/01-app/**/after*` first to confirm it is allowed in Server Components here. Wrap it in `.catch(() => {})` so a failure never breaks the page.
- [ ] **Step 5:** Run `npx vitest run tests/actionsUnauth.test.ts tests/chat.test.ts && npm run typecheck`. Expected: PASS, with no type errors.
- [ ] **Step 6:** Commit: `feat(chat): chat server actions; reading a request marks its chat read`.

### Task 5: `usePoll` hook

**Files:**
- Create: `src/lib/usePoll.ts` (`"use client"`)
- Test: `tests/usePoll.test.tsx` (jsdom, `vi.useFakeTimers()`)

**Interfaces:**
- Produces: `usePoll(fn: () => Promise<unknown>, intervalMs: number, opts?: { enabled?: boolean; immediate?: boolean }): void`. It runs `fn` every `intervalMs` after the previous call settles, never while `document.hidden`, and once immediately on `visibilitychange` to visible. `immediate` (default `false`) also runs it on enable. Changing `fn`, `intervalMs` or `enabled` restarts the timer; unmount clears it. `fn` rejections are swallowed. The latest `fn` is read through a ref, so a new closure every render does not restart the timer.

- [ ] **Step 1: Write the failing tests:**
  - It calls `fn` after the interval, and again one interval after the previous promise resolves. It does not call `fn` again while the previous call is pending, even after 3 intervals.
  - With `document.hidden = true` (via `Object.defineProperty`), advancing time calls nothing. Flipping it to visible and dispatching `visibilitychange` calls `fn` once immediately.
  - `enabled: false` never calls. `immediate: true` calls on mount.
  - A rejected `fn` keeps polling.
  - Unmount stops it.
- [ ] **Step 2:** Run `npx vitest run tests/usePoll.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with `setTimeout` chaining (not `setInterval`).
- [ ] **Step 4:** Run `npx vitest run tests/usePoll.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(chat): usePoll hook that pauses on hidden tabs`.

### Task 6: the chat dock UI

**Files:**
- Create: `src/components/chat/ChatDock.tsx`: a server wrapper, the same shape as `NotificationBell.tsx`. It reads `chatUnreadCountWith(db, user)` and renders `<ChatDockView unread={n} />`.
- Create: `src/components/chat/ChatDockView.tsx` (client): launcher, popup frame, state, polling, `sessionStorage`.
- Create: `src/components/chat/ChatList.tsx` (client, presentational): list items and the empty state.
- Create: `src/components/chat/ChatConversation.tsx` (client): header, messages, load older, composer.
- Modify: `src/components/AppShell.tsx`: render `<Suspense fallback={null}><ChatDock /></Suspense>` after `{children}` inside `AppFrame`.
- Test: `tests/chatDock.test.tsx` (jsdom, mocking `@/app/(app)/chat/actions` and `next/navigation` like `tests/notificationBell.test.tsx`)

**Interfaces:**
- Consumes: the actions from Task 4, `usePoll` from Task 5, the types from Task 3, `splitMentions` from `src/lib/collab.ts`, `relativeTime` from `src/lib/relativeTime.ts`, `StatusChip` from `src/components/ui/StatusChip.tsx`, and `cn`/`focusRing` from `src/components/ui/cn.ts`.
- Produces: `ChatDockView({ unread, actions? }: { unread: number; actions?: ChatActions })`, with
  `type ChatActions = { unreadCount; listChats; listMessages; markRead; send }` bound to the Task 4 actions by default and injectable for tests (same pattern as `BellActions`).

**Behaviour (from the spec, decided here):**
- State: `open`, `selectedId | null`, `chats | null`, `messages`, `hasOlder`, `count`. `open` and `selectedId` persist in `sessionStorage` key `chat-dock` (try/catch on every read and write).
- Polls (exactly one `usePoll` enabled at a time):
  - Closed: `unreadCount` every 60 000 ms.
  - Open with no selection: `listChats` every 30 000 ms, `immediate`. Set `count` to the sum of `unread`.
  - Selected: `listMessages(id, { after: newest.createdAt })` every 5 000 ms. Append messages de-duplicated by `id`. If any arrived, call `markRead(id)`. A `FORBIDDEN`/`NOT_FOUND` result replaces the conversation with the result's `message` and disables the poll.
- Opening a conversation: call `listMessages(id)`, optimistically set that chat's `unread` to 0 and lower `count` by the same amount, then call `markRead(id)`.
- Send: disabled while the body is blank or a send is pending. Call `send(id, body)`. On `ok`, clear the box and append `message` (de-dup). On failure, keep the text and show the result's `message` with role `alert`.
- Composer: Enter sends, Shift+Enter makes a new line; `rows` grows to at most 5.
- Bubbles: own messages are `ml-auto` with the brand tint, others show the author name. All bubbles use `whitespace-pre-wrap break-words`. A day divider separates messages on different local dates.
- Layout: the launcher is `fixed bottom-4 right-4 z-40`. The popup is `fixed bottom-20 right-4 z-50 w-[720px] h-[520px]` at `md` and up, and `inset-0` full screen below `md`, showing the list *or* the conversation (back button) on small screens. Esc closes it.
- "Open request" links to `/requests/{id}`. Focus moves to the composer when a conversation opens. The message list scrolls to the bottom on open, and on new messages only if it was within 80px of the bottom. "Load older" (shown when `hasOlder`) calls `listMessages(id, { before: oldest.createdAt })` and prepends.

- [ ] **Step 1: Write the failing tests:**
  - The launcher shows no badge at 0, `3` at 3, and `9+` at 12. Its `aria-label` is `Messages, 3 unread`.
  - Opening with `listChats` → `[]` shows "No chats yet. Comment on a request to start one."
  - Opening with two chats lists both titles and previews. Clicking one calls `listMessages("r1")` and `markRead("r1")`, renders the bubbles, and drops the badge by that chat's `unread`.
  - Sending "hi" calls `send("r1", "hi")`, appends one bubble, and clears the input. When a later poll returns the same message `id`, there is still one bubble.
  - A send failure keeps "hi" in the textarea and shows the error text in an `alert`.
  - Shift+Enter does not send.
  - A poll returning `{ ok: false, code: "NOT_FOUND", message: "Request not found." }` shows that message.
  - A bubble's element has the classes `whitespace-pre-wrap` and `break-words`.
- [ ] **Step 2:** Run `npx vitest run tests/chatDock.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the four components and the AppShell mount. Use the `frontend-design` skill for the visual pass; match the existing tokens (`bg-background`, `border-border`, `shadow-raised`, `bg-destructive` badge).
- [ ] **Step 4:** Run `npx vitest run tests/chatDock.test.tsx tests/shellHydration.test.tsx tests/notificationShell.test.tsx`. Expected: PASS. (Update the shell tests' mocks if they render `AppShell` and now meet `ChatDock`.)
- [ ] **Step 5:** Commit: `feat(chat): bottom-right chat dock`.

### Task 7: full verification

- [ ] **Step 1:** Run `npm test && npm run typecheck && npm run lint`. Expected: all green.
- [ ] **Step 2:** Start the dev server through the preview tools, sign in with a dev session (`npm run dev:session`), comment on a request, and open the dock. Check the list, the conversation, a send, the badge after a second user comments (seed or a second session), the mobile width (375px) and dark mode. Take screenshots as proof.
- [ ] **Step 3:** In the network panel, confirm the polling cadence: no chat requests while the tab is hidden, 5 s requests while a conversation is open.
- [ ] **Step 4:** Commit any fixes: `fix(chat): …`.
