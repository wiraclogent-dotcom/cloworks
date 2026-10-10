# Request chat (bottom-right message dock)

## Goal

Every request already has comments. Show them as a chat, Shopee style: a chat button fixed at the bottom right of
every app page opens a popup with a list of chats on the left and the open conversation on the right. **One chat
per request**: everyone involved in that request shares one group conversation. Near-live (polling), and kept
light on the backend; real-time push can come later.

## Decisions

- **Chat messages are `Comment` rows.** A message sent from the dock is a comment on the request, and a comment
  posted on the request page shows up in the chat. There is no second message store.
- **Participants** of a request's chat (derived, never stored): the requester, the assignee, every comment author,
  and every user in any comment's `mentions`. A user's chat list holds only chats they participate in.
- Sending reuses `addCommentWith`, so validation (trimmed, non-empty, at most `MAX_COMMENT`), @mention resolution
  and the existing COMMENT / MENTION notifications are unchanged.
- Near-live via polling, paused while the tab is hidden. No WebSockets, no third-party service.

## Data

New model, workspace-scoped like every other table:

```prisma
model ChatRead {
  id         String   @id @default(cuid())
  userId     String
  requestId  String
  lastReadAt DateTime

  user    User    @relation(fields: [userId], references: [id])
  request Request @relation(fields: [requestId], references: [id], onDelete: Cascade)

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([userId, requestId])
  @@index([workspaceId])
}
```

`Comment` gains `@@index([requestId, createdAt])`, which makes the "newer than" and "latest N" reads index-backed.
No `ChatRead` row means nothing read: every message from other people counts as unread. A user's own messages
are never unread.

## Server: `src/lib/chat.ts`

Each function takes the workspace-scoped db and the signed-in user id. The participant filter is a single
`Request` where-clause, `participantWhere(userId)`:
`OR [requesterId = me, assigneeId = me, comments some { authorId = me }, comments some { mentions has me }]`.
Only requests with at least one comment appear as chats.

- `chatUnreadCountWith(db, me)` → `number`: the count of comments on participant requests where
  `authorId ≠ me` and `createdAt > (my ChatRead.lastReadAt for that request, or epoch)`. Implemented as one raw SQL
  query (a `LEFT JOIN "ChatRead"`) so the 60-second badge poll is a single round trip.
- `listChatsWith(db, me, { limit = 20, offset = 0 })` → newest activity first:
  `{ requestId, title, status, lastMessage: { body, authorName, authorId, createdAt }, unread }[]`.
  Body is trimmed to 120 characters for the preview. Ordered by the latest comment's `createdAt`.
- `listMessagesWith(db, me, requestId, { after?: Date, before?: Date, limit = 30 })` →
  `{ ok: true, messages: { id, body, createdAt, author: { id, name } }[], hasOlder: boolean } | fail`.
  - `after` set: only messages with `createdAt > after`, oldest first (this is the 5-second poll; usually empty).
  - `before` set: the `limit` messages just older than `before` (the "load older" button).
  - Neither: the latest `limit` messages.
  - Not a participant → `FORBIDDEN`. Unknown request → `NOT_FOUND`.
- `markChatReadWith(db, me, requestId, at = now)` → upserts `ChatRead`, and only ever moves `lastReadAt`
  forward. A non-participant gets a silent no-op.

Server actions in `src/app/(app)/chat/actions.ts` wrap these with the existing `withUser` / `dbFor` pattern
(unauthenticated → result object, not a throw). `sendChatMessage(requestId, body)` calls `addCommentWith`, then
marks the chat read up to the new message, and returns the created message so the dock can append it without
waiting for the next poll.

The request detail page also calls `markChatReadWith` for the viewer, best effort, so reading the comments there
clears the chat's unread count.

## Polling (load budget)

A small hook, `usePoll(fn, intervalMs, { enabled })`, owns all timing:

| State | Call | Interval |
|---|---|---|
| Dock closed, tab visible | `chatUnreadCount` | 60 s |
| Dock open, list showing | `listChats` (also refreshes the badge from the summed `unread`) | 30 s |
| A conversation open | `listMessages({ after: newest })` | 5 s |
| `document.hidden` | none | runs once immediately on `visibilitychange` back to visible |

The next call is scheduled only after the previous one settles (never overlapping). A failed poll is ignored, and
the next tick retries. Only one of the three polls runs at a time.

## UI

- `src/components/chat/ChatDock.tsx` (client), rendered once in `AppShell` inside its own `Suspense`
  (fallback `null`), so it appears on every authenticated page.
- **Launcher:** a fixed button at `bottom-4 right-4`, chat icon, and a red unread badge (`9+` above nine, hidden at
  zero). `aria-label="Messages, N unread"`.
- **Popup (desktop ≥ md):** about 720×520, anchored bottom-right above the launcher, with a header ("Messages" and a
  close button). Two panes: the chat list (about 260px) and the conversation.
  - **List item:** the request title (one line), "Name: last message" (one line, muted), relative time, and an
    unread count pill. Selected item highlighted. Empty state: "No chats yet. Comment on a request to start one."
  - **Conversation header:** the request title, a status badge (the existing status component), and an
    "Open request" link to `/requests/{id}`.
  - **Messages:** own messages right-aligned (brand tint), others left-aligned with the author's name. Time under
    each bubble, consecutive messages from the same author grouped, a date divider between days. @mentions
    highlighted with `splitMentions`. Plain text only (no markdown, no HTML). A "Load older" button at the top when
    `hasOlder`. It scrolls to the bottom on open and on new messages, but only if the reader was already near the
    bottom.
  - **Composer:** an auto-growing textarea (up to 5 lines). Enter sends, Shift+Enter makes a new line. Send is
    disabled while empty or sending. The input keeps its text on failure and shows an inline error with a retry.
  - No conversation selected: "Pick a chat to start messaging."
- **Mobile (< md):** the popup is full screen and shows one pane at a time (list → conversation, with a back
  button).
- Opening a conversation marks it read (optimistically zeroes its unread count, then calls `markChatRead`), and
  each poll that brings new messages while it is open marks read again.
- Esc closes the popup. Focus moves to the composer when a conversation opens.
- Open/closed and the selected chat persist in `sessionStorage` (wrapped in try/catch), so moving between pages
  keeps the dock where it was.

## Errors

- Unauthenticated / forbidden / not found actions return `{ ok: false, code, message }`. The dock shows the message
  in place of the conversation for FORBIDDEN / NOT_FOUND (for example, after a request was deleted).
- Send failure: the text stays in the composer, with an inline error and a retry.
- Poll failure: silent and retried on the next tick.

## Out of scope

Instant delivery (WebSockets / Pusher), typing indicators, read receipts per person, images/files in chat,
editing or deleting messages, one-to-one direct messages, muting chats, email for chat messages beyond the
existing comment notifications.

## Testing

- `tests/chat.test.ts` (db-backed, like the existing lib tests):
  - The participant rule: requester, assignee, author and mentioned users see the chat; an unrelated user does
    not, and gets `FORBIDDEN` from `listMessagesWith`.
  - Unread: counts only others' messages after `lastReadAt`; with no `ChatRead` row, everything from others
    counts; own messages are never counted.
  - `markChatReadWith` upserts and never moves backwards.
  - `listMessagesWith` with `after`, with `before` plus `hasOlder`, and the default latest page.
  - `listChatsWith` ordering by latest message, plus the preview truncation.
- `tests/chatDock.test.tsx`: the launcher badge (hidden / N / 9+), the empty list, opening a chat, sending
  (optimistic append and the failure keeping the text), and `usePoll` not running while `document.hidden`.
