# Merge and Link Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate people when roster members are invited or approved (link to an existing person), and let admins merge existing duplicates.

**Architecture:** One new optional column `Invite.userId`. A small `src/lib/linkPerson.ts` holds the shared "attach a login to an existing person" step used by `acceptInvite` and `approveApplicant`. `src/lib/mergeUsers.ts` holds `mergePreview` and `mergeUsers`, one transaction under `lockRoster`. Server actions and the Admin → Members UI call these.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routes/actions — see AGENTS.md), Prisma + Postgres, Vitest with `tests/helpers/testDb.ts` (real Postgres per test file), React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-merge-and-link-members-design.md`

## Global Constraints

- "Linkable" person = a `User` in the actor's workspace with `email = null` (active or inactive).
- Merge refuses when both people have a login email: CONFLICT `"Both people have a login. Clear one login email first."`
- Stale link on accept/approve: NOT_FOUND `"This invite no longer matches a person. Ask your admin for a new one."` (approval uses the same text with "request" for "invite": `"This request no longer matches a person. Refresh and try again."`)
- Attaching a login sets `email`, `passwordHash`, roles, `active = true`, `passwordVersion + 1`, `failedLogins = 0`, `lockedUntil = null`.
- Merge: survivor keeps its own name, fullName, title, department, roles. KPI clash → survivor's row wins. ChatRead clash → later `lastReadAt` wins.
- All errors are `AdminError` from `src/lib/admin.ts`; all writes for one operation in one `$transaction` with `lockRoster(tx)` first.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the files of the task (the tree has unrelated uncommitted work).

## Review Focus

1. A duplicate being merged away is the `userId` of an open invite → the invite must end up pointing at the survivor (Task 2 test).
2. Email case: an invite to `Yosi@Clogent.co.id` linked to a person, accepted → stored lowercase, and a later merge's "both have a login" check is case-insensitive (Task 3 test).
3. A Google-only applicant (no `passwordHash`) accepts a linked invite → person gets `passwordHash = null`, and Google sign-in then resolves them as a member by email (Task 3 test via `resolveSignIn`).
4. Alias from the duplicate collides with a third person's name → merge still succeeds and that alias is dropped (Task 2 test).
5. Survivor already has an avatar → duplicate's avatar is not copied over it (Task 2 test).

---

### Task 1: `Invite.userId` column

**Files:**
- Modify: `prisma/schema.prisma` (models `Invite`, `User`)
- Create: `prisma/migrations/20261012120000_invite_link_user/migration.sql`
- Test: `tests/invites.test.ts`

**Interfaces:**
- Produces: `Invite.userId: string | null`, relation `Invite.user` (`"InviteFor"`, `onDelete: SetNull`), `User.invitesFor`. Existing relation renamed `"InviteSentBy"` on both sides (`Invite.invitedBy`, `User.invitesSent`) — field names unchanged.

- [ ] **Step 1: Failing test** in `tests/invites.test.ts`, `describe("invite link column")`:
  `it("stores userId and clears it when the person is deleted")` — create a roster user (no email), `db.prisma.invite.create({ data: { email, appRole: "REQUESTER", jobRole: "OTHER", tokenHash: hashToken("t"+uniq("")), invitedById: admin.id, expiresAt: new Date(Date.now()+DAY), userId: u.id } })`; expect `userId === u.id`; `db.prisma.user.delete({ where: { id: u.id } })`; re-read invite → `userId === null`.
- [ ] **Step 2:** `npx vitest run tests/invites.test.ts -t "invite link column"` → FAIL (unknown field `userId`).
- [ ] **Step 3:** Edit the schema as in the spec's "Data model"; add `@@index([userId])`. Write the migration SQL by hand in the repo's style (see `20261011160000_profile_photo`): `ALTER TABLE "Invite" ADD COLUMN "userId" TEXT;` + `CREATE INDEX "Invite_userId_idx"` + FK `Invite_userId_fkey … ON DELETE SET NULL ON UPDATE CASCADE`. Run `npx prisma generate`. Check with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <dev db url>` that the diff is empty (or skip if no shadow db and rely on Step 4).
- [ ] **Step 4:** Same vitest command → PASS. `npm run typecheck` → no errors.
- [ ] **Step 5: Commit** `feat(db): invites can point at an existing person`

---

### Task 2: `mergePreview` and `mergeUsers`

**Files:**
- Create: `src/lib/mergeUsers.ts`
- Test: `tests/mergeUsers.test.ts`

**Interfaces:**
- Consumes: `lockRoster`, `countSignInCapableAdmins`, `AdminError`, `Actor`, `normalizeName` from `src/lib/import/aliases.ts`.
- Produces:
  ```ts
  export type MergeCounts = Record<"requested" | "assigned" | "statusEvents" | "deadlineEvents" | "comments" | "attachments" | "kpiTargets" | "notifications" | "chatReads" | "ownedProjects" | "projectTasks" | "libraryItems" | "invites", number>;
  export type MergePreview = { from: { id: string; name: string; email: string | null }; into: { id: string; name: string; email: string | null; active: boolean }; counts: MergeCounts; movesLogin: boolean };
  export async function mergePreview(db: PrismaClient, actor: Actor, fromId: string, intoId: string): Promise<MergePreview>; // throws the same guard errors as mergeUsers, writes nothing
  export async function mergeUsers(db: PrismaClient, actor: Actor, fromId: string, intoId: string): Promise<{ intoId: string; intoName: string }>;
  export const USER_FK_HANDLED: ReadonlyArray<string>; // "Model.field" for every FK to User that mergeUsers re-points
  ```
  `libraryItems` counts rows where createdBy OR updatedBy is `from`; `invites` counts invitedBy OR userId.

- [ ] **Step 1: Failing tests** (`tests/mergeUsers.test.ts`, setup like `tests/invites.test.ts`: admin actor in `"clogent"`, `uniq`, `code()` helper returning `AdminError.code`). Seed helper `seedEverything(userId)` creating one row of each relation for a user (request as requester and assignee — copy the request seeding from `tests/collab.test.ts`; status/deadline event; comment; attachment; KPI target month `"2026-10"`; notification; chat read; project as owner; project task as owner; library item created+updated; invite sent; invite with `userId`).
  - `it("moves every relation to the survivor and deletes the duplicate")` — seed on `from`; merge; every count for `from` is 0, for `into` equals the seeded count; `user.findUnique(from)` is null.
  - `it("keeps the survivor's KPI target for a clashing month")` — both have `"2026-10"` with targetTasks 5 (into) / 9 (from) → into's row has 5, only one row for that month.
  - `it("keeps the later chat read for a clashing request")` — into read at T1, from at T2 > T1 → into's `lastReadAt === T2`; reverse case keeps into's.
  - `it("moves the login when the survivor has none")` — from has email, passwordHash, avatar, active; into has no email, inactive, passwordVersion 0 → into has from's email and hash, `active`, `passwordVersion === 1`; from deleted before into updated (unique email). Return value `{ intoId, intoName }`.
  - `it("does not overwrite the survivor's avatar")` (Review Focus 5).
  - `it("adds the duplicate's names to aliases, skipping ones that collide")` — from name "Yosiananda", fullName "Yosiananda Kurnia"; a third user named "Kurnia Two" irrelevant; another user whose alias is "Yosiananda Kurnia" → into.aliases contains "Yosiananda", not "Yosiananda Kurnia" (Review Focus 4).
  - `it("repoints an open invite linked to the duplicate")` (Review Focus 1).
  - Guards, each expecting the code and that nothing changed: same id → VALIDATION; `fromId === actor.id` → VALIDATION; unknown id → NOT_FOUND; both have emails (one upper-case) → CONFLICT with the exact copy; non-admin actor → FORBIDDEN; LAST_ADMIN: in a separate workspace created via `db.raw` (so the main test admin doesn't count), `from` = the only ADMIN with a login and password, `into` = REQUESTER without login, actor = an admin of that workspace with no login (an `Actor` object only needs id/role/workspace) → LAST_ADMIN, because the login moves to a non-admin survivor.
  - `it("preview reports counts and writes nothing")` — counts match seed; `movesLogin` true; all rows still on `from`.
  - `it("handles every User foreign key")` — from `Prisma.dmmf.datamodel.models`, collect `Model.field` for each relation field whose `type === "User"` and that has `relationFromFields.length` (skip `User` itself); expect sorted list to equal sorted `USER_FK_HANDLED`.
- [ ] **Step 2:** `npx vitest run tests/mergeUsers.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** in `src/lib/mergeUsers.ts`. Order inside the transaction: `lockRoster` → load both (`findFirst` with `workspaceId: actor.workspaceId`) → guards → KPI/ChatRead clash deletes (ChatRead: for each clashing requestId, set into's `lastReadAt` to the max, delete from's) → `updateMany` re-points per `USER_FK_HANDLED` → compute aliases (survivor + from.name/fullName/aliases, de-duplicated with `normalizeName`, excluding survivor's own name/fullName and any name/fullName/alias of a third user, capped at the existing `MAX_ALIASES` = 20) → `user.delete(from)` → `user.update(into)` (login fields only when `into.email === null && from.email`; avatar only when `into.avatar === null`) → last-admin check with `countSignInCapableAdmins(tx)` > 0 else LAST_ADMIN. `mergePreview` shares the load+guard function and does counts with `count` queries, no transaction writes.
- [ ] **Step 4:** `npx vitest run tests/mergeUsers.test.ts` → PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(admin): merge one person into another`

---

### Task 3: Linked invites (`linkPerson.ts`, `createInvite`, `describeInvite`, `acceptInvite`)

**Files:**
- Create: `src/lib/linkPerson.ts`
- Modify: `src/lib/invites.ts` (`createInvite`, `issue`, `describeInvite`, `InviteView`, `acceptInvite`)
- Modify: `src/lib/joinDeps.ts` only if `loadInvite`/`acceptInviteBy` types need the new fields
- Test: `tests/invites.test.ts`, new `tests/linkPerson.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // linkPerson.ts
  export type LinkablePerson = { id: string; name: string; fullName: string; appRole: AppRole; jobRole: JobRole; active: boolean };
  export async function listLinkablePeople(db: PrismaClient | ScopedDb): Promise<LinkablePerson[]>; // email null, ordered by name
  export async function assertLinkable(tx: Prisma.TransactionClient, workspaceId: string, userId: string, stale: () => AdminError): Promise<{ id: string; name: string }>;
  export async function attachLogin(tx: Prisma.TransactionClient, userId: string, login: { email: string; passwordHash: string | null; appRole: AppRole; jobRole: JobRole }): Promise<void>;
  ```
  `createInvite` input gains `userId?: string`; `InviteView` gains `linkedName: string | null`; `acceptInvite` return gains `linked: boolean`.

- [ ] **Step 1: Failing tests.**
  - `tests/linkPerson.test.ts`: `listLinkablePeople` returns only email-less people of the workspace, inactive included, sorted by name; `assertLinkable` throws the given error for a person with an email, a missing id, another workspace's person (create via `db.raw` in a second workspace); `attachLogin` sets the Global Constraints fields.
  - `tests/invites.test.ts` `describe("linked invites")`:
    - `createInvite` with `userId` of a linkable person stores it; with a person who has an email → VALIDATION; re-inviting the same email with another `userId` updates it.
    - `describeInvite` → `linkedName` is the person's `name`; unlinked → null.
    - accept with `{ name, password }` → returns the person's id, `linked: true`; person has lowercase email, a hash that `verifyPassword(PASSWORD)` accepts, invite roles, active; no new User row (count unchanged); roster `name`/`fullName` unchanged (typed name ignored).
    - accept as applicant (seed applicant with `passwordHash: null`, Google-style) → person `passwordHash === null`, applicant deleted, and `resolveSignIn(db.raw, { email })` returns `{ ok: true, kind: "user" }` with the person's id (Review Focus 3).
    - Invite to `Mixed@Case.test` linked and accepted → stored lowercase (Review Focus 2).
    - stale: person gets an email after invite, or is deleted, before accept → NOT_FOUND with the exact Global Constraints copy, and the invite is not consumed (`acceptedAt` still null).
    - unlinked invite behaviour unchanged (existing tests stay green).
- [ ] **Step 2:** `npx vitest run tests/linkPerson.test.ts tests/invites.test.ts` → new tests FAIL.
- [ ] **Step 3: Implement.** `createInvite`: when `userId`, check with `listLinkable`-equivalent query (person in actor workspace, `email: null`) else VALIDATION `"That person already has a login or no longer exists."`; pass `userId` through `issue`'s roles/data so a resend keeps it. `acceptInvite`: when `inv.userId`, after the existing claim and email checks call `lockRoster`, `assertLinkable(tx, inv.workspaceId, inv.userId, gone-with-stale-copy)`, delete applicant rows for the email, `attachLogin(...)`, return `{ userId: inv.userId, email, linked: true }`. A thrown stale error rolls back the claim (same transaction). For the `{ name, password }` path, validate the password up front as today, but validate `name` only after reading the invite and only when it is not linked (the linked invite page sends no name).
- [ ] **Step 4:** Same command → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(invites): an invite can attach the login to an existing person`

---

### Task 4: Linked approvals

**Files:**
- Modify: `src/lib/joinRequests.ts` (`approveApplicant`), `src/lib/joinDeps.ts` (`approveFor`)
- Test: `tests/joinRequests.test.ts`

**Interfaces:**
- Consumes: `assertLinkable`, `attachLogin` (Task 3).
- Produces: `approveApplicant(db, actor, mailer, applicantId, roles, baseUrl, linkUserId?: string): Promise<{ userId: string; linked: boolean }>`; `approveFor(actor, mailer, applicantId, roles, baseUrl, linkUserId?)`.

- [ ] **Step 1: Failing tests** `describe("linked approval")`: approving with `linkUserId` attaches the applicant's email and hash and the chosen roles to the person, deletes the applicant, closes an open invite for the email, sends the approval email, creates no new User, returns `{ userId: person.id, linked: true }`; person with an email → NOT_FOUND with `"This request no longer matches a person. Refresh and try again."` and the applicant still exists; unlinked approval unchanged.
- [ ] **Step 2:** `npx vitest run tests/joinRequests.test.ts` → FAIL.
- [ ] **Step 3: Implement**: inside the existing transaction, when `linkUserId`, call `assertLinkable` before deleting the applicant, then `attachLogin` instead of `user.create`. Keep the clash check and invite closing as they are.
- [ ] **Step 4:** PASS; typecheck.
- [ ] **Step 5: Commit** `feat(join): approve a request as an existing person`

---

### Task 5: Server actions

**Files:**
- Modify: `src/app/(app)/admin/users/actions.ts`, `src/app/join/invite/[token]/actions.ts`
- Test: `tests/adminMembers.test.tsx` (or the file that already tests `inviteMember`/`approveRequest`; follow `tests/addPersonAction.test.ts` for mocking the session)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `inviteMember` reads optional `userId`; `approveRequest` reads optional `linkUserId` (empty string = none). Linked approval success copy: `` `Approved as ${name}. They sign in once more to continue.` ``
  - `previewMerge(prev: MergeFormState, fd: FormData): Promise<MergeFormState>` with `fromId`, `intoId`; `type MergeFormState = null | { ok: false; error: string } | { ok: true; preview: MergePreview }`.
  - `mergePerson(prev: AdminFormState, fd: FormData): Promise<AdminFormState>` → success message `` `Merged into ${intoName}.` ``, revalidates `/admin/users`.
  - `acceptInviteAction`: for `mode=applicant` when `linked`, `redirect("/signin?linked=1")` instead of `ENTER_PATH` (the applicant session no longer matches a user); for `mode=password` unchanged (signs in with the email).
- [ ] **Step 1: Failing tests**: each action calls its core with the parsed fields (mock the cores like the existing action tests do); non-admin gets the existing unauth result; `previewMerge` maps `AdminError` to `{ ok: false, error: message }`.
- [ ] **Step 2:** run that test file → FAIL.
- [ ] **Step 3: Implement**, reusing `withUser`, `adminResult`, `done`, `s()`.
- [ ] **Step 4:** PASS; typecheck.
- [ ] **Step 5: Commit** `feat(admin): actions for linking and merging people`

---

### Task 6: UI

**Files:**
- Modify: `src/app/(app)/admin/users/UsersContent.tsx` (load `listLinkablePeople` once; pass to `InvitedList`, `RequestsList`, and the people list for merge targets; `loadInvites` selects `user: { select: { name: true } }`)
- Modify: `src/app/(app)/admin/users/InvitedList.tsx` (picker + "for {name}"), `RequestsList.tsx` (picker), `UserForms.tsx` (new `MergeForm`)
- Modify: `src/app/join/invite/[token]/InviteView.tsx` (linked copy), `src/app/signin/page.tsx` (`?linked=1` notice)
- Test: `tests/adminMembers.test.tsx`, `tests/joinPages.test.tsx`, `tests/signinPage.test.tsx`

**Interfaces:**
- Consumes: `LinkablePerson`, `MergePreview`, actions from Task 5.
- Produces: `InviteRow` gains `linkedName: string | null`; `RequestsList` and `InvitedList` props gain `linkable: LinkablePerson[]`; `MergeForm({ u, others }: { u: UserRowData; others: { id: string; name: string }[] })`.

Copy (exact):
- Invite picker label `Existing person (optional)`, empty option `New person`. Choosing a person sets the role selects to that person's roles (controlled selects, client component).
- Invited row suffix: `for {name}`.
- Approval picker label `This is…`, empty option `A new person`.
- Invite page, linked: heading `{inviter} invited you to join {workspace} as {name}`; password-mode form has no name field; applicant mode unchanged button.
- Sign-in notice for `?linked=1`: `You're in. Sign in again to continue.` (info tone).
- Merge section (inside Edit, after `ActiveToggle`): label `Merge into…`, button `Review merge`; preview text `{from} will be removed. {list} move to {into}.` where list is the non-zero counts as `3 requests, 2 comments` plus `their login` first when `movesLogin`, and `{into} becomes active.` when `movesLogin && !into.active`; then a destructive `Merge` button (use `ConfirmAction` with `question` = that text, `confirmLabel` `Merge`).

- [ ] **Step 1: Failing tests**: pickers list only `linkable` people; picking a person in the invite form changes the role selects; invited row shows `for Yosi`; invite page linked shows the heading and no `Your name` field; sign-in page shows the linked notice; merge form renders the preview text from a stubbed `previewMerge` result and the `Merge` confirm.
- [ ] **Step 2:** run the three test files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(admin): link pickers and merge UI`

---

### Task 7: End-to-end check

- [ ] **Step 1:** `npm test` → all green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 2:** Start `db` and `app` from `.claude/launch.json` (preview tools), apply migrations, seed. As admin: create a roster person "Yosi" with no login; invite `yosi-test@clogent.co.id` linked to Yosi; open the invite link in a fresh tab, set a password; confirm Admin → People shows one Yosi with the login. Then create a duplicate (unlinked invite + accept), use Merge into… Yosi, confirm the summary and the single row afterwards. Screenshot both.
- [ ] **Step 3:** Report results; production rollout (migration + deploy via `scripts/deploy-prod.local.sh`) is for Wira to run.
