# Workspaces and forced password change: design

Date: 2026-10-09. Status: approved in chat, awaiting spec review.

## Why

Cloworks is Clogent's internal tracker today, but it may later open to other companies once the infrastructure
is stronger (it runs on Vercel Hobby + Neon Free now). The data model should be ready for that now, so opening
up later does not mean restructuring every table. For now there is exactly one workspace, **Clogent**. Other
companies' workspaces would start empty.

Sign-up stays closed. The Clogent admin (Wira) creates every account with an email and a **temporary password**.
On first sign-in, and after any admin reset, the person must change that password before using the app.

## Decisions (from the brainstorm)

- **Tenancy model:** one person belongs to exactly one workspace (like Trello or Notion for a company). No
  switching between workspaces.
- **Scope now:** foundation only. Clogent is the only workspace. No public sign-up, invitations, workspace
  switcher, subdomains, row-level security or billing.
- **Accounts:** the admin creates people with an email and a temporary password. There are no invitations.
- **Isolation approach:** a `workspaceId` column on every data table, and one scoped Prisma client that adds the
  workspace filter automatically. PostgreSQL row-level security can be layered on later without a data change.
- **Keep it simple:** this is still a trial phase.

## 1. Data model

New model:

```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
}
```

Every data model gets `workspaceId String` plus a relation to `Workspace` and an index on `workspaceId`:
User, AllowedEmail, Brand, Division, RequestType, Request, StatusEvent, DeadlineEvent, Comment, Attachment,
KpiTarget, Notification, Project, ProjectTask, ProjectMilestone.

Child rows (status events, comments, tasks and so on) carry the column too, even though their parent already
does. That keeps the rule "every row knows its workspace" true everywhere. Two things depend on that rule: the
scoped client can filter every model the same way, and row-level security can be added later.

**Uniqueness per workspace.** These constraints change from global to per workspace:

| Model | Before | After |
|---|---|---|
| Brand | `name` unique | `@@unique([workspaceId, name])` |
| Division | `name` unique | `@@unique([workspaceId, name])` |
| RequestType | `name` unique | `@@unique([workspaceId, name])` |
| Project | `code` unique | `@@unique([workspaceId, code])` |
| AllowedEmail | `email` unique | `@@unique([workspaceId, email])` |
| KpiTarget | `[userId, month]` unique | unchanged (a user is in one workspace) |

`User.email` stays **globally** unique. Under the one-workspace-per-person model, the email alone decides
which workspace a sign-in belongs to.

**Migration of existing data.** A single migration:

1. Creates `Workspace` and inserts Clogent with a fixed id (`clogent`), name "Clogent" and slug `clogent`.
2. Adds `workspaceId` to every data table with a temporary default of `'clogent'`, so existing rows are
   backfilled.
3. Drops that default, so new rows must say which workspace they belong to.
4. Adds the foreign keys and indexes, and swaps the unique constraints in the table above.

This applies to the local database and to Neon in the same way.

## 2. Isolation

**Session.** The JWT carries `wid` (the user's workspaceId), set at sign-in. `loadActiveUser` re-reads the user
on every request (as it does today) and returns `workspaceId`. A user whose workspace no longer matches the
token is signed out. `SessionUser` becomes `{ id, appRole, jobRole, workspaceId }`.

**Scoped client.** `src/lib/db.ts` exports:

- `prisma`: the raw client. It is used only by sign-in (finding a user by email across workspaces), the
  password authenticator, seed and import scripts, and test helpers.
- `scopedDb(workspaceId)`: `prisma.$extends(...)` with a query extension for every model listed in section 1:
  - Reads, updates, deletes, `count`, `aggregate`, `groupBy`, `findUnique` and `findUniqueOrThrow` get
    `workspaceId` ANDed into `where`. Prisma 6 accepts extra filters in `findUnique`.
  - `create` and `createMany` get `workspaceId` set in `data`; `upsert` gets it in both `where` and `create`.
  - A `data.workspaceId` that differs from the scoped one throws, so a write can never land in another
    workspace.
  - Nested writes inside `data` (for example `request.create({ data: { statusEvents: { create: ... } } })`)
    must set `workspaceId` explicitly. The extension does not walk nested writes. Today's code is checked for
    them and they are rewritten as needed.
  - `$queryRaw` and `$executeRaw` are not scoped. Any raw SQL in app code must filter by workspace by hand.
    There is none today except the roster lock in admin.ts, which is reviewed.

**Where each client is used.** Pages and server actions build the scoped client from the signed-in user. A
helper `requireScope()` returns `{ user, db }`. The library functions keep their `db` parameter, so callers
pass the scoped client and tests can pass either.

**Workspace name in the shell.** The sidebar shows the workspace name, read through the scoped client.

**URLs** stay the same. Subdomains can come later without changing the data model.

## 3. Accounts and the forced password change

- `User.mustChangePassword Boolean @default(false)`.
- `setUserPassword` (admin create or reset) sets it to `true`. `changeOwnPassword` sets it to `false`.
- **Add person** in Admin > People takes an optional login email and a temporary password in the same form.
  Both are needed for someone to sign in; without them it is a roster-only record, as today.
- **Enforcement** is server-side and authoritative:
  - `requireUserOrRedirect()` sends anyone with the flag set to `/change-password`. That page is itself exempt.
  - `requireUser()` and server actions refuse with a "Change your password first" result. The only exception is
    the change-password action.
  - The edge proxy does not need to know about the flag.
- **`/change-password`** is a standalone page in the sign-in style. It has three fields: temporary (current)
  password, new password and confirm. It explains why the change is needed and offers a sign-out link. On
  success it ends the session through the existing password-version check and returns to `/signin?changed=1`.
- **Existing users:** Wira's current password is not temporary, so their flag is `false`. Everyone else has no
  password yet.

## 4. Testing

- **Isolation suite** (`tests/workspaces.test.ts`, embedded Postgres): two workspaces with a full set of rows
  each. For every model in section 1, the scoped client for A must not see B's rows through `findMany`,
  `findFirst`, `findUnique`, `count`, `aggregate` or `groupBy`. It must not change or delete them through
  `update`, `updateMany`, `delete`, `deleteMany` or `upsert`. Creates must land in A, and a create that names B
  must throw. Per-workspace uniqueness is also tested: both workspaces can have a brand called "Main".
- **Test helper:** `createTestDb()` creates a default workspace. It returns `prisma` as the scoped client for
  that workspace, `raw` as the unscoped client, and `workspaceId`. Existing tests therefore keep working with
  small fixture changes.
- **Forced change:** tests for the flag being set and cleared, the page redirect, actions being refused, the
  change-password page, and the Add person form with a temporary password.
- Typecheck, lint, the full suite, and a browser check of first sign-in, forced change and normal use.

## 5. Out of scope (later)

Public sign-up, invitations and email delivery, workspace switching or multi-membership, subdomains,
PostgreSQL row-level security, per-workspace settings and billing, and a super-admin panel. The model above
leaves room for each without restructuring the data.

## 6. Rollout

1. Merge on the feature branch after review.
2. Run `prisma migrate deploy` locally and on Neon. On Neon the migration runs after the local-to-Neon data
   copy, if that is done first, so the copied rows are backfilled into Clogent.
3. Deploy to Vercel using the git-less export.
4. Wira signs in (no forced change), then creates the team's accounts with temporary passwords.
