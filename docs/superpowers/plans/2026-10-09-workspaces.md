# Workspaces and Forced Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every row belongs to a workspace (Clogent first), the app only ever reads or writes the signed-in
user's workspace, and people given a temporary password must change it before using the app.

**Architecture:** A `workspaceId` column is added to all 15 data models, with migrated rows backfilled into the
fixed workspace id `clogent`. `scopedDb(workspaceId)` is a Prisma query extension that ANDs the workspace into
every `where` and stamps it on every create. Pages and actions get it from the session; only sign-in, seed,
scripts and test helpers use the raw client. `mustChangePassword` is enforced in `requireUser()` and
`requireUserOrRedirect()`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 6 / PostgreSQL, Auth.js v5 JWT, Vitest with
embedded Postgres.

**Spec:** `docs/superpowers/specs/2026-10-09-workspaces-design.md`

## Global Constraints

- The Clogent workspace has id `clogent`, name `Clogent` and slug `clogent`. It is inserted by the migration.
- Scoped models (exact list): User, AllowedEmail, Brand, Division, RequestType, Request, StatusEvent,
  DeadlineEvent, Comment, Attachment, KpiTarget, Notification, Project, ProjectTask, ProjectMilestone.
  `Workspace` itself is not scoped.
- Per-workspace uniques: `[workspaceId, name]` on Brand, Division and RequestType; `[workspaceId, code]` on
  Project; `[workspaceId, email]` on AllowedEmail. `User.email` stays globally unique, and KpiTarget keeps
  `[userId, month]`.
- The raw `prisma` client is used only in sign-in and authentication (`signin.ts`, `passwordAuth.ts`,
  `session-core.ts`, `session.ts`, `auth.ts`), seed, `scripts/*` and test helpers. App pages and actions never
  import `prisma`.
- `mustChangePassword` is set to true by `setUserPassword` and set to false by `changeOwnPassword`.
- The commands `npm run typecheck`, `npm run lint` and `npm test` must all pass at the end of every task.

## Review Focus

1. **`findUnique` by id across workspaces:** looking up a row id from workspace B through A's scoped client
   returns null, and updating or deleting it throws "not found". Test in Task 1.
2. **A create that names another workspace:** `scopedDb(A).brand.create({ data: { name, workspaceId: B } })`
   throws. It must not silently write into B or rewrite the value to A. Test in Task 1.
3. **Same brand name in two workspaces:** both creates succeed, and the admin "rename brand" duplicate check
   only looks inside the actor's workspace. Tests in Tasks 1 and 3.
4. **Someone with a temporary password following a deep link** (for example `/requests/123`): they land on
   `/change-password`, not on the page and not in a redirect loop. `/change-password` itself renders. Test in
   Task 5.
5. **Interactive transactions on the scoped client** (`db.$transaction(async (tx) => …)` in admin.ts): `tx`
   stays scoped, so the roster collision check inside `updateUser` cannot see another workspace's people.
   Test in Task 1.

---

### Task 1: Workspace schema, migration, scoped client, test helper, isolation suite

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261009180000_workspaces/migration.sql`
- Modify: `src/lib/db.ts`
- Modify: `tests/helpers/testDb.ts`
- Create: `tests/workspaces.test.ts`

**Interfaces:**
- Produces:
  - `CLOGENT_WORKSPACE_ID = "clogent"` (exported from `src/lib/db.ts`).
  - `scopedDb(workspaceId: string): ScopedDb`, memoised per id.
  - `type ScopedDb = ReturnType<typeof makeScoped>`. It is assignable to `PrismaClient`; this was checked with
    `tsc` against Prisma 6.
  - `TestDb` becomes `{ url; prisma: ScopedDb /* scoped to "clogent" */; raw: PrismaClient; workspaceId: "clogent"; stop() }`.
  - Schema: `Workspace { id, name, slug @unique, createdAt }`; `workspaceId String` plus the relation and
    `@@index([workspaceId])` on the 15 scoped models; `User.mustChangePassword Boolean @default(false)`.

- [ ] **Step 1: Edit the schema.** Add `Workspace` with back-relation lists. Add `workspaceId` and the relation
  to the 15 models. Swap the uniques per Global Constraints. Add `mustChangePassword`.
- [ ] **Step 2: Create the migration** with `npx prisma migrate dev --create-only --name workspaces` (local db
  running), then rename its folder to `20261009180000_workspaces`. Hand-edit the SQL so it runs in this order:
  1. `CREATE TABLE "Workspace"`.
  2. `INSERT INTO "Workspace" (id,name,slug) VALUES ('clogent','Clogent','clogent')`.
  3. For each table, `ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent'` followed by
     `ALTER COLUMN "workspaceId" DROP DEFAULT`.
  4. Drop the old unique indexes and create the composite ones.
  5. Add the foreign keys (`ON DELETE RESTRICT`) and the indexes.
  6. Add `"mustChangePassword" BOOLEAN NOT NULL DEFAULT false`.
- [ ] **Step 3: Write the failing isolation suite** `tests/workspaces.test.ts`. It uses
  `createTestDb()`, inserts workspace `other` through `raw`, and builds a full row set in each workspace (user,
  brand, division, request type, request with status event, deadline event, comment, attachment and
  notification, KPI target, allowed email, project with task and milestone). Tests:
  - `it("scoped reads never see another workspace", …)`: for every scoped model,
    `scopedDb("clogent")[m].findMany()` returns only rows with `workspaceId === "clogent"`. Also
    `findFirst({ where: { id: otherId } })` and `findUnique({ where: { id: otherId } })` are null. `count()`,
    `aggregate({ _count: true })` and `groupBy` count only clogent rows.
  - `it("scoped writes cannot touch another workspace", …)`: `update({ where: { id: otherId } })` and
    `delete` reject. `updateMany({})` and `deleteMany({ where: { id: otherId } })` return `{ count: 0 }`. The
    `other` rows are unchanged when read back via `raw`.
  - `it("creates are stamped and a foreign workspaceId throws", …)`: `brand.create({ data: { name: "X" } })`
    gets `workspaceId: "clogent"`. `createMany` stamps every row. `brand.create({ data: { name: "Y",
    workspaceId: "other" } })` rejects with `/workspace/i`.
  - `it("names are unique per workspace", …)`: brand `Main` exists in both workspaces. A second `Main` in clogent
    rejects with a unique violation.
  - `it("interactive transactions stay scoped", …)`: inside `scopedDb("clogent").$transaction(async (tx) =>
    tx.user.findMany())`, only clogent users are returned.
- [ ] **Step 4: Run** `npx vitest run tests/workspaces.test.ts`. Expected: FAIL, because `scopedDb` is not
  exported.
- [ ] **Step 5: Implement `scopedDb`** in `src/lib/db.ts` as `prisma.$extends({ query: { [model]: {
  $allOperations } } })` over the 15 model names (Prisma's model keys, camelCase). Rules per operation:
  - `where`-ANDed: `findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `count`,
    `aggregate`, `groupBy`, `update`, `updateMany`, `updateManyAndReturn`, `delete`, `deleteMany`.
  - Stamped: `create` and `createMany`/`createManyAndReturn`, per row.
  - `upsert`: both of the above.
  - Throw `Error("Cross-workspace write blocked")` when `data.workspaceId` is present and differs.
  - Memoise clients in a `Map<string, ScopedDb>`.
- [ ] **Step 6: Update `tests/helpers/testDb.ts`** to return
  `{ url, prisma: scopedDb-equivalent built on this test client, raw, workspaceId: "clogent", stop }`. Factor the
  extension into `makeScoped(base: PrismaClient, workspaceId)` so the helper can scope its own client.
- [ ] **Step 7: Run the suite and the whole test run.** Run `npx vitest run tests/workspaces.test.ts`
  (expected: PASS), then `npm test`. Fix fixtures that broke: tests that used `raw` behaviour (for example
  global unique lookups by brand name) switch to `findFirst`. Expected: all green.
- [ ] **Step 8: Commit** with message `feat(workspaces): workspace column on every table and the scoped client`.

### Task 2: Session carries workspace and the password-change flag

**Files:**
- Modify: `src/lib/session-core.ts`, `src/lib/session.ts`
- Test: `tests/admin.test.ts` (session section) and `tests/requireUserOrRedirect.test.ts`

**Interfaces:**
- Consumes: `scopedDb` from Task 1.
- Produces:
  - `SessionUser = { id; appRole; jobRole; workspaceId: string; mustChangePassword: boolean }`.
  - `class PasswordChangeRequiredError extends UnauthenticatedError`.
  - `requireUser(): Promise<SessionUser>`, which throws `PasswordChangeRequiredError` when the flag is set.
  - `requireUserForPasswordChange(): Promise<SessionUser>`, which does not throw for the flag.
  - `requireUserOrRedirect()`, which redirects to `/change-password` for that error and to `/signin` for others.
  - `requireScope(): Promise<{ user: SessionUser; db: ScopedDb }>`, cached per request; it redirects like
    `requireUserOrRedirect`.
  - `dbFor(user: SessionUser): ScopedDb`.

- [ ] **Step 1: Write the failing tests.**
  - `loadActiveUser` returns `workspaceId` and `mustChangePassword`.
  - `requireUserOrRedirect` redirects to `/change-password` when `mustChangePassword: true` (mock row).
  - `requireUserForPasswordChange` returns that user.
  - `withUser(requireUser, …)` returns the unauth result for a flagged user.
- [ ] **Step 2: Run** `npx vitest run tests/requireUserOrRedirect.test.ts tests/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Select `workspaceId` and `mustChangePassword` in `loadActiveUser`. Add the
  error class and the helpers listed above.
- [ ] **Step 4: Run** the same tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(workspaces): session user carries workspace and password-change flag`.

### Task 3: Every page and action uses the scoped client

**Files:**
- Modify the 22 importers of `@/lib/db` under `src/app` and `src/components/AppShell.tsx`. Find them with
  `grep -rl 'from "@/lib/db"' src`.
- Modify `src/lib/createRequest.ts:99`: default type lookup becomes `findFirst({ where: { name } })`.
- Modify `src/lib/admin.ts:287`: the `allowedEmail` upsert where becomes
  `{ workspaceId_email: { workspaceId, email } }`. `addAllowedEmail` and `setUserLoginEmail` take the
  workspace from `actor.workspaceId`. The `Actor` type gains `workspaceId`.
- Test: `tests/adminUi.test.tsx`, `tests/admin.test.ts` and one new case in `tests/workspaces.test.ts`.

**Interfaces:**
- Consumes: `requireScope` and `dbFor` from Task 2. `Actor = { id; appRole; workspaceId }`.

- [ ] **Step 1: Write the failing test.** In `tests/workspaces.test.ts`, check that `renameBrand` (admin core)
  with a clogent actor and the scoped client accepts the name `Main` while workspace `other` already has a
  brand `Main`. Also check that `addAllowedEmail` for clogent then lists only clogent rows.
- [ ] **Step 2: Run it.** Expected: FAIL (the Actor type error, or the upsert unique key).
- [ ] **Step 3: Swap the importers.**
  - Pages and server components use `const { user, db } = await requireScope()` in place of
    `requireUserOrRedirect()` plus `prisma`.
  - Actions use `withUser(requireUser, async (actor) => { const db = dbFor(actor); … })`.
  - `AppShell` reads the workspace name with the raw client, since `Workspace` is unscoped: `prisma.workspace.findUnique({
    where: { id: user.workspaceId }, select: { name: true } })` and shows the name under the logo in the
    sidebar.
  - Then run `grep -rn 'from "@/lib/db"' src/app src/components`. Expected: no `prisma` imports remain, only
    `dbFor`/`requireScope` via session, plus AppShell's workspace-name read.
- [ ] **Step 4: Check for nested writes** with `grep -rnE "(create|createMany|connectOrCreate)\s*:" src`.
  Every hit inside a `data` object must set `workspaceId` explicitly. Expected today: none besides the upserts
  already listed.
- [ ] **Step 5: Run** `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 6: Commit** with message `feat(workspaces): pages and actions read and write through the scoped client`.

### Task 4: Seed and scripts are workspace-aware

**Files:**
- Modify: `prisma/seedCore.ts` and `prisma/seed.ts`
- Modify: `scripts/import-sheet.ts`, `scripts/import-design-project.ts`, `scripts/import-tracker.ts` and
  `scripts/set-password.ts`
- Modify: `src/lib/import/run.ts:92` and `src/lib/import/applyImport.ts:30` (raw SQL)
- Test: the existing seed and import tests

**Interfaces:**
- Consumes: `scopedDb` and `CLOGENT_WORKSPACE_ID`.
- Produces: `seed(db: PrismaClient)` expects a scoped client. Scripts accept `--workspace <slug>` (default
  `clogent`), resolve the id via the raw `prisma.workspace.findUnique({ where: { slug } })`, and use
  `scopedDb(id)`.

- [ ] **Step 1: Write the failing test.** Seeding twice into the scoped test client is idempotent, and every
  seeded row has `workspaceId: "clogent"`.
- [ ] **Step 2: Run it.** Expected: FAIL, because `upsert where { name }` is no longer a unique key.
- [ ] **Step 3: Implement.**
  - Seed upserts become find-or-create via `findFirst`.
  - The two raw `SELECT … FROM "Request"` queries add `AND "workspaceId" = ${workspaceId}`, with the
    `workspaceId` passed in as a parameter.
  - `set-password` looks the user up by email with the raw client, which is global.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Also run `npx tsx scripts/import-tracker.ts --help` (or a dry
  run) locally. Expected: no crash.
- [ ] **Step 5: Commit** with message `feat(workspaces): seed and import scripts write into a chosen workspace`.

### Task 5: Forced password change

**Files:**
- Modify: `src/lib/admin.ts` (`setUserPassword` sets the flag to true, `changeOwnPassword` sets it to false)
- Create: `src/app/change-password/page.tsx`, `src/app/change-password/actions.ts` and
  `src/app/change-password/ChangePasswordPageForm.tsx`
- Modify: `src/app/(app)/admin/users/actions.ts` and `UserForms.tsx` (Add person gains `email` and
  `password`)
- Modify: `src/lib/signinError.ts` if a new message is needed
- Test: `tests/password.test.ts`, `tests/changePasswordPage.test.tsx` (new) and `tests/adminUi.test.tsx`

**Interfaces:**
- Consumes: `requireUserForPasswordChange` (Task 2) and `changeOwnPassword(db, userId, current, next)`.
- Produces: the route `/change-password`; `addPerson` FormData keys `email` and `password` (both optional,
  but a password needs an email).

- [ ] **Step 1: Write the failing tests.**
  - `setUserPassword` leads to `mustChangePassword === true`, and `changeOwnPassword` leads to `false`.
  - The page renders three password fields (labels "Temporary password", "New password (at least 10
    characters)", "Confirm new password") and a "Sign out" button.
  - The page action on success calls `signOut({ redirectTo: "/signin?changed=1" })`.
  - Add person with email and password creates the user with the flag true. A password without an email gives
    a VALIDATION error, and nothing is created.
  - Review Focus 4: a flagged user's `requireUserOrRedirect` on a deep page redirects to `/change-password`,
    and `requireUserForPasswordChange` (used by the page) does not redirect.
- [ ] **Step 2: Run** the new and changed tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page lives outside `(app)` in the sign-in card style. Its intro copy: "Choose your own password before
    you continue. The one you were given is temporary."
  - The action reuses `changeOwnPassword` and the same mismatch check as Settings.
  - `addPerson` validates the password (`checkNewPassword`) before creating anything, then runs
    `createUser`, `setUserLoginEmail` and `setUserPassword`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(auth): temporary passwords must be changed at first sign-in`.

### Task 6: Help, verification, browser check

**Files:**
- Modify: `content/help/admin-users.md` (Add person with a temporary password; the forced change) and
  `content/help/signing-in-and-roles.md` (first sign-in asks for a new password)

- [ ] **Step 1: Update both guides.**
- [ ] **Step 2: Run** `npx prisma migrate deploy` (local), `npm run typecheck`, `npm run lint` and `npm test`.
  Expected: all clean.
- [ ] **Step 3: Check in the browser** (dev server `app`):
  1. As Wira, the sidebar shows "Clogent" and requests are listed.
  2. Add a person with an email and a temporary password.
  3. Sign in as that person. They land on `/change-password`, and `/requests` also redirects there.
  4. Change the password. They return to sign-in and sign in with the new password, which lands on
     `/requests`.
- [ ] **Step 4: Commit** with message `docs(help): temporary passwords and the first sign-in change`.
