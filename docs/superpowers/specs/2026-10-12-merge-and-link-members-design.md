# Merge and link members — design

**Date:** 2026-10-12
**Status:** Draft for review

## Goal

Many people on the old roster (imported from the sheet) have no login email. When an admin invites one of them, or
approves their join request, today's flows always create a **new** `User`, so the person ends up twice in Admin →
People (e.g. "Yosi", inactive, with the sheet history, and "Yosiananda", active, with the login).

This feature:

1. **Prevents** new duplicates: an invite or an approval can be **linked to an existing person**, and the login is
   attached to that record instead of creating a new one.
2. **Repairs** existing duplicates: Admin → People gets **Merge into…**, which folds one person into another and
   deletes the duplicate.

**Success:**
- Inviting or approving someone who is already on the roster leaves exactly one record, with the history and the login.
- Today's Yosi duplicate can be fixed from the UI in one action, without a script.
- No login, history row or admin access is lost silently.

## Decisions

| Topic | Decision |
|---|---|
| Which record survives a merge | The one the admin picks as the target ("Merge *this* into *that*"). For roster duplicates that is the old record. |
| Both records have a login email | Merge is refused; the admin clears one login first. |
| Roles, name, title, department after merge | The survivor keeps its own. The duplicate's `name` and `fullName` are added to the survivor's aliases. |
| Login after merge | If the survivor has no login, it takes the duplicate's email, password hash and avatar; `passwordVersion` is bumped and the survivor becomes active. |
| `KpiTarget` clash (same user + month) | Survivor's row wins; the duplicate's row is deleted. |
| `ChatRead` clash (same user + request) | The row with the later `lastReadAt` wins. |
| Who can be linked | People in the actor's workspace with **no login email** (active or inactive). |
| Roles on a linked invite/approval | The admin's chosen roles are applied (the form pre-fills the person's current roles). |
| Name on a linked invite/approval | The roster `name`/`fullName` is kept; the invite page asks only for a password. |
| Session after a linked approval | The applicant's session ends (its id no longer exists); they sign in once more with the same email and password. |
| Undo | None. Merge is permanent, so it shows a summary and asks for confirmation. |
| Out of scope | Automatic duplicate suggestions, merge undo, cross-workspace merges. |

## Data model

`Invite` gains an optional link to the person it is for:

```prisma
model Invite {
  // …existing fields…
  invitedById String
  invitedBy   User    @relation("InviteSentBy", fields: [invitedById], references: [id])
  userId      String?
  user        User?   @relation("InviteFor", fields: [userId], references: [id], onDelete: SetNull)
}

model User {
  // …
  invitesSent Invite[] @relation("InviteSentBy")
  invitesFor  Invite[] @relation("InviteFor")
}
```

One migration adds the column, the foreign key and an index on `userId`. Existing invites keep `userId = null` and
behave as today.

## Merge: `mergeUsers(db, actor, fromId, intoId)`

New module `src/lib/mergeUsers.ts`. One transaction, under `lockRoster(tx)`.

**Guards** (all `AdminError`, nothing written when one fails):
- `assertAdmin(actor)`.
- `fromId !== intoId`; both exist and are in `actor.workspaceId` (NOT_FOUND otherwise).
- `fromId !== actor.id`: you can't merge away your own account (VALIDATION).
- Both have a login email → CONFLICT "Both people have a login. Clear one login email first."
- After the merge there must still be an active admin who can sign in (`countSignInCapableAdmins`), else LAST_ADMIN.

**Re-pointing** (`updateMany … where <fk> = fromId → intoId`):
`Request.requesterId`, `Request.assigneeId`, `StatusEvent.actorId`, `DeadlineEvent.actorId`, `Comment.authorId`,
`Attachment.uploaderId`, `Notification.userId`, `Project.ownerId`, `ProjectTask.ownerId`, `LibraryItem.createdById`,
`LibraryItem.updatedById`, `Invite.invitedById`, `Invite.userId`.

**Clashes:**
- `KpiTarget`: delete the duplicate's rows whose `month` the survivor already has, then re-point the rest.
- `ChatRead`: for each request both have read, keep the later `lastReadAt` on the survivor's row and delete the
  duplicate's; then re-point the rest.

**Survivor update:**
- `aliases` = survivor's aliases + the duplicate's `name` and `fullName` (and its aliases), de-duplicated by
  `normalizeName` and excluding the survivor's own `name`/`fullName`. Collisions with *other* people's names are
  dropped, not raised (the merge must not fail on an alias).
- If the survivor has no `email`: copy `email`, `passwordHash`, `mustChangePassword`, avatar fields; bump
  `passwordVersion`; reset `failedLogins`/`lockedUntil`; set `active = true`.

**Delete** the duplicate `User`. Its sessions end on their next request (`refreshJwt` finds no user).

Any foreign key added to `User` later must be added here; a test asserts the re-point list covers every
`User` relation in the Prisma DMMF, so a new relation fails the test until it is handled.

`mergePreview(db, actor, fromId, intoId)` returns the same guards' verdict plus counts per relation, for the
confirmation summary. It writes nothing.

## Linked invite

- `createInvite(…, { email, appRole, jobRole, userId? })`: when `userId` is given it must be a person in the actor's
  workspace with no login email (VALIDATION otherwise). Stored on the invite. Re-inviting the same email updates
  `userId` along with the roles.
- `describeInvite` also returns the linked person's display name, so the invite page can say "You'll join as **Yosi**"
  and hide the name field.
- `acceptInvite`, when `inv.userId` is set: inside the existing transaction, after the claim and the email checks,
  re-read the person under `lockRoster`. If it is gone, in another workspace, or now has a login email → NOT_FOUND
  "This invite no longer matches a person. Ask your admin for a new one." Otherwise update it with `email`,
  `passwordHash` (typed password, or the applicant's), the invite's roles, `active = true`, bumped `passwordVersion`;
  delete applicant rows for the email (as today). Returns that person's id.

## Linked approval

`approveApplicant(…, roles, baseUrl, linkUserId?)`: when set, same eligibility check as above. Instead of
`user.create`, update that person with the applicant's `email` and `passwordHash`, the chosen roles,
`active = true`, bumped `passwordVersion`. Deleting the applicant, closing open invites and the approval email are
unchanged.

## UI

- **Admin → Members → Invite form** ([UserForms.tsx](../../../src/app/(app)/admin/users/UserForms.tsx)): optional
  select "Existing person (optional)" listing people without a login, sorted by name. Picking one pre-fills the role
  selects. Hidden field `userId` → `inviteMember`.
- **Join request card** ([RequestsList.tsx](../../../src/app/(app)/admin/users/RequestsList.tsx)): optional select
  "This is…" with the same list. Field `linkUserId` → `approveRequest`. Success copy for a linked approval:
  "Approved as Yosi. They sign in once more to continue."
- **Invited list**: a linked invite shows "for Yosi" next to the email.
- **Invite page** ([InviteView.tsx](../../../src/app/join/invite/[token]/InviteView.tsx)): linked → heading
  "Join as Yosi", password only.
- **Edit person → Merge into…**: a select of the other people in the workspace, then a "Review merge" step that
  calls `mergePreview` and shows e.g. "Yosiananda will be removed. Their login, 3 requests and 2 comments move to
  Yosi. Yosi becomes active." with a destructive "Merge" button. On success, redirect to People with a notice naming
  the survivor. Refusals show the guard message.

New server actions in `src/app/(app)/admin/users/actions.ts`: `previewMerge`, `mergePerson`; `inviteMember` and
`approveRequest` read the new optional fields.

## Error handling

All failures are `AdminError` with fixed copy, surfaced through the existing `adminResult` form state. The merge and
both link paths run in one transaction each, so a failure leaves nothing half-done.

## Testing

- `mergeUsers`: every relation re-pointed (seed one row of each); KPI and ChatRead clash rules; login copy only when
  the survivor has none; aliases merge; each guard (self, same id, other workspace, both have logins, last admin);
  DMMF coverage test for `User` relations.
- `mergePreview`: counts and verdict, writes nothing.
- Linked invite: create with a valid/invalid `userId`; accept as anonymous and as applicant; stale target (got an
  email, merged away, other workspace) → NOT_FOUND; unlinked invite unchanged.
- Linked approval: attaches login to the person, applicant deleted, invites closed; stale target refused; unlinked
  approval unchanged.
- Components: invite and approval pickers list only people without a login; invite page linked copy; merge
  review summary and confirm.
