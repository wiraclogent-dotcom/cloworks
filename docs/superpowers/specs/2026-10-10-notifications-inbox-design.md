# In-app notifications (bell + dropdown)

## Goal

People involved in a request see, inside the app, when something happens on it — a comment, a mention, an
assignment, the designer sending the design — and one click takes them to that request's page. Simple: no
real-time push, no settings, no separate inbox page.

## What already exists

`src/lib/notify.ts` already writes a `Notification` row per recipient (and emails it when a mailer is configured)
for COMMENT, MENTION, ASSIGNED, STATUS and DEADLINE. The actor is always excluded; inactive users are skipped.
The `Notification` model (`userId`, `requestId?`, `type` (string), `message`, `readAt?`, `emailedAt?`, `createdAt`,
workspace-scoped, cascade on request delete, `@@index([userId, readAt])`) needs **no schema change**. Nothing reads
these rows yet.

## Triggers

Unchanged: COMMENT, MENTION, ASSIGNED, STATUS, DEADLINE.

New:

1. **DESIGN_SENT** — `transitionRequestWith` moving a request **to FIRST_LOOK** sends type `DESIGN_SENT` with
   message `{actor} sent the design for “{title}” for review` instead of the generic STATUS message. Recipients are
   the same as STATUS (requester + assignee, minus actor). Every other transition keeps STATUS. Emailed as usual.
2. **ATTACHMENT** — `addAttachmentWith`, after the row is created, sends type `ATTACHMENT` with message
   `{actor} added a design link “{name}” to “{title}”` to requester + assignee, minus actor. Wrapped in `bestEffort`
   like the other triggers, with an injectable `notifier` parameter. **Not emailed** (stored in-app only), so a
   burst of links does not flood inboxes.

To support (2), `NotifyInput` gains an optional `email?: boolean` (default `true`); `notifyWith` skips the mail
send when it is `false`. `NotificationType` and `SUBJECTS` gain the two new types; `buildMessage` gains the two new
cases (the attachment name goes through `cleanLine(…, 80)`).

## Server: `src/lib/inbox.ts`

All functions take the workspace-scoped db and the signed-in user id, and only ever touch rows where
`userId = me`.

- `listNotificationsWith(db, userId, limit = 20)` → newest first:
  `{ id, type, message, requestId, readAt, createdAt }[]`.
- `unreadCountWith(db, userId)` → number of rows with `readAt = null`.
- `markReadWith(db, userId, id)` → `updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } })`;
  someone else's id silently matches 0 rows.
- `markAllReadWith(db, userId)` → same, without the id.

Server actions in `src/app/(app)/notifications/actions.ts` wrap these with the existing `withUser` / `dbFor`
pattern (unauthenticated → result object, not a throw).

## UI

- `src/components/shell/NotificationBell.tsx` (server wrapper, reads `unreadCount`) +
  `NotificationBellView.tsx` (client), rendered in the top bar to the left of the profile menu through a new
  `notifications` slot on `AppFrame`, inside its own `Suspense` (fallback: a static bell, no badge).
- Bell button: `aria-label="Notifications, N unread"`; red badge with the count, `9+` above nine, hidden at zero.
- Radix `DropdownMenu` (same pattern as `ProfileMenuView`), `align="end"`, ~w-80. Opening it calls
  `listNotifications`. Header: "Notifications" + "Mark all as read" (disabled when nothing is unread).
  Items: unread dot + tinted background when unread, message, relative time ("5m ago", "2h ago", "3d ago", then a
  date). Loading: skeleton rows. Empty: "You're all caught up."
- Selecting an item: optimistic mark read, call `markRead`, `router.push(/requests/{requestId})`. An item without a
  `requestId` just marks read.
- Count refresh: on page load (server render) and after opening/marking (local state). No polling.
- The disabled "Notifications" placeholder in the sidebar Tools group is removed.

## Errors

Notification sending stays best-effort: a failure never fails the comment, move or link. Inbox actions that fail
leave the UI state unchanged (revert the optimistic read) and show nothing alarming; the next open retries.

## Testing

- `collab.test.ts`: adding a link notifies requester + assignee (not the actor) with type ATTACHMENT and
  `email: false`.
- transition tests: → FIRST_LOOK sends DESIGN_SENT with the new message; other moves still send STATUS.
- `notify` tests: `email: false` stores the row and does not call the mailer; the two new `buildMessage` cases.
- `inbox.test.ts`: list order/limit, unread count, mark one / mark all, cannot read or mark another user's rows.
- `notificationBell.test.tsx`: badge (0 hidden, 3, 9+), empty state, select marks read and navigates,
  mark all clears the badge.
- Manual check in the browser preview.

## Out of scope

Real-time updates/polling, per-user notification settings, a full inbox page, notifications for projects.
