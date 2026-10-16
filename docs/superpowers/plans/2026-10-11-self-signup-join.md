# Self sign-up and joining a workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can create a Cloworks account and get into the Clogent workspace by email invite, invite link or company domain, with admin approval for everyone not directly invited.

**Architecture:** Not-yet-members are `Applicant` rows (global, unscoped); a `User` is created only on approval or invite acceptance, reusing the applicant's id so the Auth.js JWT upgrades in place. Applicant JWTs carry `aid` and no `appRole`; the proxy confines them to `/lobby`, `/verify`, `/join/*`, and `requireUser()` rejects them because no `User` row exists. `AllowedEmail` and the domain check are retired: an active `User` is what grants access.

**Tech Stack:** Next.js 16 (`proxy.ts`, server actions), Auth.js v5 beta (JWT), Prisma 6 + Postgres, Vitest + embedded-postgres (`tests/helpers/testDb.ts`), Resend via `src/lib/mailer.ts`.

**Spec:** `docs/superpowers/specs/2026-10-11-self-signup-join-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (AGENTS.md); middleware is `src/proxy.ts`.
- Emails are stored and compared lowercase + trimmed (`normalizeEmail` in `src/lib/admin.ts`).
- Verification code: 6 digits, valid **15 minutes**, **5** attempts; resend at most once per **60 s** and **5 per hour**.
- Invite: token 32 random bytes (base64url), stored only as SHA-256 hex; valid **7 days**; only for the exact invited email.
- Unverified applicants deleted after **7 days** (opportunistic, on sign-up).
- Lockout for applicants identical to users: `LOCK_AFTER = 5`, `LOCK_MINUTES = 15` (`src/lib/passwordAuth.ts`).
- Passwords: `checkNewPassword` / `MIN_PASSWORD_LENGTH = 10` (`src/lib/password.ts`).
- Lobby polls every **15 s**.
- Approve defaults: app role `REQUESTER`, job role `OTHER`.
- Every admin mutation is `ADMIN`-only (`can(role, "admin.manage")`), goes through `withUser` + `dbFor(actor)` like `src/app/(app)/admin/users/actions.ts`, and throws `AdminError` codes.
- Copy is English, matching the spec's wording; rejection sends no email.
- Code pepper comes from `AUTH_SECRET`; no new env variables. `ALLOWED_EMAIL_DOMAIN` is removed (domain lives on `Workspace.emailDomain`).

## Review Focus

1. **Email variants** — `" Andi@Gmail.COM "` at sign-up, invite, Google, and password sign-in must all hit the same row; owned by Tasks 3, 4, 7 (test in each).
2. **Double approval / approve vs. invite race** — two admins approving the same applicant, or an invite accepted while a request is pending: exactly one `User`, the second action gets `NOT_FOUND`, never a 500; Task 5.
3. **Open redirect through `next`** — `/signup?next=https://evil.com` or `//evil.com` must fall back to `/lobby`; Task 2 (`safeNext`).
4. **Stale link after reset** — someone opening an old `/join/<code>` after Reset, or while the link is off, sees "This link no longer works", no request created; Task 3.
5. **Applicant row gone while signed in** (cleanup, or admin converts it) — the next request either upgrades to member (User exists with that id) or ends the session cleanly at `/signin`, never loops between `/lobby` and `/signin`; Task 7.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261011120000_self_signup/` | Applicant, Invite, Workspace fields (additive) |
| `prisma/migrations/20261011130000_retire_allowed_email/` | AllowedEmail → Invite, drop table |
| `src/lib/joinTokens.ts` | Pure: tokens, codes, hashing, masking, `safeNext` |
| `src/lib/joinEmails.ts` | Pure: the five email bodies |
| `src/lib/applicants.ts` | Sign-up, verify, resend, join-by-link/domain, OAuth applicant, cleanup |
| `src/lib/invites.ts` | Create / resend / revoke / describe / accept invite |
| `src/lib/joinRequests.ts` | Approve / reject / undo, list requests, join-link reset/toggle, admin notification |
| `src/lib/shortName.ts` | `pickShortName` extracted from `signin.ts` (used by approval + invite accept) |
| `src/lib/signin.ts`, `passwordAuth.ts`, `session-core.ts`, `auth.ts`, `auth.config.ts`, `session.ts` | Access check without allow-list, applicant tokens, routing, upgrade |
| `src/app/signup`, `src/app/verify`, `src/app/lobby`, `src/app/join/[code]`, `src/app/join/invite/[token]` | Public / applicant pages + actions |
| `src/app/(app)/admin/users/*`, `AdminTabs.tsx` | Members / Invited / Requests tabs, invite-link card |
| `src/lib/notificationLinks.ts` | `JOIN_REQUEST` link |

---

### Task 1: Schema for applicants, invites and join links

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261011120000_self_signup/migration.sql`
- Modify: `src/lib/db.ts` (add `"Invite"` to `SCOPED_MODELS`; `Applicant` stays unscoped)
- Test: `tests/schema.test.ts`, `tests/db.test.ts`

**Interfaces:**
- Produces: Prisma models `Applicant`, `Invite`, enum `JoinSource { LINK DOMAIN }`, `Workspace.emailDomain`, `Workspace.joinCode`, `Workspace.joinLinkEnabled`, `Workspace.invites`, `Workspace.applicants` (relation via `requestedWorkspaceId`), `User.invitesSent`.

Fields exactly as spec §2, plus: `Applicant.requestSource JoinSource?`; `Invite` has `@@index([workspaceId])`, `@@index([email])`, `tokenHash @unique`. One open invite per `(workspaceId, email)` is enforced in code (Task 4), not by a constraint (accepted/revoked rows remain).

- [ ] **Step 1: Write failing tests** — `tests/schema.test.ts`: `it("Clogent has emailDomain clogent.co.id and a join code")` asserting `ws.emailDomain === "clogent.co.id"`, `ws.joinCode` matches `/^[A-Za-z0-9_-]{16,}$/`, `ws.joinLinkEnabled === true`. `tests/db.test.ts`: `it("scopes Invite but not Applicant")` — a scoped client for another workspace cannot `findFirst` a Clogent invite; `applicant.findFirst` works from any scoped client.
- [ ] **Step 2: Run** `npx vitest run tests/schema.test.ts tests/db.test.ts` — Expected: FAIL (unknown fields/models).
- [ ] **Step 3: Edit schema, write migration SQL** — migration also runs `UPDATE "Workspace" SET "emailDomain"='clogent.co.id', "joinCode"=<22-char base64url from md5(random()::text||clock_timestamp()::text)> WHERE id='clogent'`. Run `npx prisma migrate dev --create-only` to generate, then hand-add the UPDATE.
- [ ] **Step 4: Run** the two test files plus `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): schema for applicants, invites and join links`

---

### Task 2: Join primitives — tokens, codes, masking, redirects, email bodies

**Files:**
- Create: `src/lib/joinTokens.ts`, `src/lib/joinEmails.ts`
- Test: `tests/joinTokens.test.ts`, `tests/joinEmails.test.ts`

**Interfaces (Produces):**
```ts
// joinTokens.ts
export const CODE_TTL_MS = 15 * 60_000, CODE_MAX_ATTEMPTS = 5, RESEND_GAP_MS = 60_000, RESENDS_PER_HOUR = 5;
export const INVITE_TTL_MS = 7 * 24 * 3_600_000, UNVERIFIED_TTL_MS = 7 * 24 * 3_600_000;
export function newToken(): string;                       // 32 random bytes, base64url
export function hashToken(token: string): string;         // sha256 hex
export function newCode(): string;                         // "000000"–"999999", crypto.randomInt
export function hashCode(code: string, secret: string): string; // HMAC-SHA256(secret, code) hex
export function codeMatches(code: string, hash: string, secret: string): boolean; // timingSafeEqual
export function newJoinCode(): string;                     // 16 random bytes, base64url
export function maskEmail(email: string): string;          // "andi@gmail.com" -> "a***@gmail.com"
export function safeNext(raw: string | null | undefined, fallback?: string): string; // only "/join/..." or "/lobby"; else fallback "/lobby"
export function codeSecret(env?: Record<string, string | undefined>): string; // AUTH_SECRET, throws if missing
// joinEmails.ts — each returns { subject: string; text: string }
export function codeEmail(code: string): Mail;
export function inviteEmail(p: { inviter: string; workspace: string; role: string; url: string; expires: Date }): Mail;
export function approvedEmail(p: { workspace: string; url: string }): Mail;
export function alreadyHaveAccountEmail(p: { signinUrl: string }): Mail;
```

- [ ] **Step 1: Write failing tests** — `joinTokens.test.ts`:
  - `newToken` length 43 and two calls differ; `hashToken(t)` is 64 hex and stable.
  - `newCode` always `/^\d{6}$/` over 200 calls.
  - `codeMatches("482913", hashCode("482913","s"),"s") === true`; wrong code, wrong secret → `false`; different-length hash → `false` (no throw).
  - `maskEmail("andi@gmail.com") === "a***@gmail.com"`, `maskEmail("a@x.co") === "a***@x.co"`.
  - `safeNext` — `"/join/abc"` → same; `"/lobby"` → same; `"https://evil.com"`, `"//evil.com"`, `"/\\evil.com"`, `"/requests"`, `undefined` → `"/lobby"`.
  - `codeSecret({})` throws; `codeSecret({AUTH_SECRET:"x"}) === "x"`.
  - `joinEmails.test.ts`: `codeEmail("482913").text` contains `"Your Cloworks code is 482913. It expires in 15 minutes."`; `inviteEmail` subject `"Wira invited you to join Clogent on Cloworks"` and text contains the url and role; `approvedEmail` text starts `"You're in. Clogent approved your request."`.
- [ ] **Step 2: Run** `npx vitest run tests/joinTokens.test.ts tests/joinEmails.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** both files with `node:crypto` (`randomBytes`, `randomInt`, `createHash`, `createHmac`, `timingSafeEqual`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): token, code and email helpers`

---

### Task 3: Applicant core — sign-up, verify, resend, join by link or domain

**Files:**
- Create: `src/lib/applicants.ts`
- Test: `tests/applicants.test.ts` (embedded Postgres via `createTestDb`, `db.raw` as the client)

**Interfaces:**
- Consumes: Task 2 helpers; `hashPassword`, `checkNewPassword`; `Mailer`.
- Produces:
```ts
export class JoinError extends Error { code: "VALIDATION" | "LINK_INVALID" | "CODE_INVALID" | "CODE_EXPIRED" | "TOO_MANY" | "RATE_LIMITED" | "REJECTED" | "INACTIVE_MEMBER" }
type Deps = { db: PrismaClient; mailer: Mailer; secret: string; now?: Date; baseUrl: string };
export async function signUp(d: Deps, input: { name: string; email: string; password: string; joinCode?: string }): Promise<{ applicantId: string | null }>;
export async function verifyCode(d: Deps, applicantId: string, code: string): Promise<{ joined: boolean }>;
export async function resendCode(d: Deps, applicantId: string): Promise<void>;
export async function requestJoinByCode(d: Deps, applicantId: string, joinCode: string): Promise<void>;
export async function oauthApplicant(d: Omit<Deps,"mailer"|"secret">, profile: { email: string; name: string }): Promise<Applicant>;
export async function describeJoinCode(db: PrismaClient, joinCode: string): Promise<{ workspaceName: string } | null>;
export type LobbyState = { kind: "unverified" } | { kind: "waiting"; workspaceName: string } | { kind: "none" } | { kind: "rejected"; workspaceName: string };
export async function lobbyState(db: PrismaClient, applicantId: string): Promise<LobbyState | null>; // null = row gone
```
Behaviour pins: `signUp` deletes unverified applicants older than `UNVERIFIED_TTL_MS` first. If the email belongs to an existing `User` (any state) or verified `Applicant`, it sends `alreadyHaveAccountEmail`, creates nothing and returns `{ applicantId: null }` (the page shows the same "We sent a code" screen). An unverified existing applicant is overwritten (new name/password/code). `verifyCode` marks verified, clears the code, then: a stored `joinCode` intent (saved on the row as `pendingJoinCode` — add this nullable column in this task's migration `20261011121000_applicant_join_intent`) → request that workspace with source `LINK`; else a workspace whose `emailDomain` equals the email domain → request with source `DOMAIN`. A request notifies admins via `notifyJoinRequest` (Task 5 — until then, inject as `Deps.onRequest?: (applicantId) => Promise<void>`). A link whose code is unknown or `joinLinkEnabled = false` → `LINK_INVALID`. Requesting a workspace where `rejectedAt` is set for that same workspace → `REJECTED`. Email of a deactivated `User` → `INACTIVE_MEMBER`.

- [ ] **Step 1: Write failing tests** (`describe("applicants")`):
  - `"sign-up stores lowercase email, hashed code, sends one code email"` — input `" Andi@Gmail.COM "`; row email `"andi@gmail.com"`, `codeHash` ≠ code, mailer got 1 message whose text matches `/\d{6}/`.
  - `"sign-up with a member's email creates nothing and sends already-have-account"`.
  - `"wrong code 5 times → TOO_MANY, then even the right code fails"`.
  - `"code older than 15 minutes → CODE_EXPIRED"` (pass `now`).
  - `"resend within 60 s → RATE_LIMITED; 6th resend in an hour → RATE_LIMITED"`.
  - `"verified @clogent.co.id → request to clogent with source DOMAIN, onRequest called"`.
  - `"domain request still created when joinLinkEnabled = false"`.
  - `"verified gmail with no code → lobby state none"`.
  - `"sign-up via join code → request with source LINK"`; `"after reset the old code → LINK_INVALID, no request"`; `"link off → LINK_INVALID"`.
  - `"rejected applicant re-requesting → REJECTED"`.
  - `"deactivated member's email → INACTIVE_MEMBER on requestJoinByCode/verify"`.
  - `"unverified applicant older than 7 days is removed on next sign-up"`.
  - `"oauthApplicant creates a verified applicant and requests domain workspace"`.
- [ ] **Step 2: Run** `npx vitest run tests/applicants.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/applicants.ts` and the small migration.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): applicant sign-up, verification and join requests`

---

### Task 4: Invite core

**Files:**
- Create: `src/lib/invites.ts`, `src/lib/shortName.ts`
- Modify: `src/lib/signin.ts` (use `pickShortName` instead of the inline collision loop)
- Test: `tests/invites.test.ts`, `tests/auth.test.ts` (existing short-name cases keep passing)

**Interfaces:**
- Consumes: Task 2, Task 1 models, `Actor`/`AdminError`/`normalizeEmail` from `src/lib/admin.ts`, `can()`.
- Produces:
```ts
// shortName.ts
export async function pickShortName(db: PrismaClient, workspaceId: string, display: string, email: string): Promise<string>;
// invites.ts
export async function createInvite(db: ScopedDb, actor: Actor, mailer: Mailer, input: { email: string; appRole: AppRole; jobRole: JobRole }, baseUrl: string): Promise<{ id: string }>;
export async function resendInvite(db: ScopedDb, actor: Actor, mailer: Mailer, inviteId: string, baseUrl: string): Promise<void>;
export async function revokeInvite(db: ScopedDb, actor: Actor, inviteId: string): Promise<void>;
export type InviteView = { status: "open" | "expired" | "used"; workspaceName: string; inviterName: string; appRole: AppRole; jobRole: JobRole; maskedEmail: string; email: string };
export async function describeInvite(db: PrismaClient, token: string, now?: Date): Promise<InviteView | null>;
export async function acceptInvite(db: PrismaClient, token: string, who: { applicantId: string } | { name: string; password: string }, now?: Date): Promise<{ userId: string; email: string }>;
```
Behaviour pins: `createInvite` refuses an email that is an active `User` in the workspace (`CONFLICT`, "already a member"); an existing open invite for that email is resent instead of duplicated. `acceptInvite` runs in one `$transaction`: invite must be open and unexpired (else `AdminError("NOT_FOUND")`); with `applicantId` the applicant's email must equal the invite email (`VALIDATION`, "This invite is for a***@…"); with `{name,password}` an existing applicant for that email is converted (password replaced — the token proves the inbox); `User.id` = applicant id when one exists; `emailVerifiedAt` not required. Marks `acceptedAt`. An email belonging to an inactive `User` → `FORBIDDEN` "Contact your admin".

- [ ] **Step 1: Write failing tests**:
  - `"non-admin cannot create/resend/revoke"` → `FORBIDDEN` for REQUESTER/CREATIVE/LEAD.
  - `"create sends one invite email with a /join/invite/ link; DB holds only the hash"`.
  - `"inviting a member → CONFLICT"`; `"inviting twice resends the same row (one open invite)"`.
  - `"resend replaces the token: the old link is NOT_FOUND"`; `"revoke → describe status used/expired, accept NOT_FOUND"`.
  - `"accept with name+password creates the User with invite roles, email lowercased"` (invite created for `"Sari@Gmail.com"`).
  - `"accept by a pending applicant keeps the applicant id as User.id and deletes the applicant"`.
  - `"accept by an applicant with another email → VALIDATION mentioning the masked email"`.
  - `"expired invite (now + 8 days) → NOT_FOUND"`; `"accepting twice → second NOT_FOUND"`.
  - `"pickShortName falls back to local part then numeric suffix on collision"`.
- [ ] **Step 2: Run** `npx vitest run tests/invites.test.ts tests/auth.test.ts` — Expected: invites FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): email invites`

---

### Task 5: Join requests — approve, reject, undo, join link, admin notification

**Files:**
- Create: `src/lib/joinRequests.ts`
- Modify: `src/lib/notificationLinks.ts` (`JOIN_REQUEST_NOTIFICATION = "JOIN_REQUEST"` → `/admin/users?tab=requests`), `src/lib/applicants.ts` (default `onRequest` = `notifyJoinRequest`)
- Test: `tests/joinRequests.test.ts`, `tests/notificationShell.test.tsx` (href case)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
```ts
export type JoinRequestRow = { applicantId: string; name: string; email: string; source: JoinSource; requestedAt: Date; rejectedAt: Date | null };
export async function listJoinRequests(db: PrismaClient, actor: Actor): Promise<{ pending: JoinRequestRow[]; rejected: JoinRequestRow[] }>;
export async function approveApplicant(db: PrismaClient, actor: Actor, mailer: Mailer, applicantId: string, roles: { appRole: AppRole; jobRole: JobRole }, baseUrl: string): Promise<{ userId: string }>;
export async function rejectApplicant(db: PrismaClient, actor: Actor, applicantId: string): Promise<void>;
export async function undoReject(db: PrismaClient, actor: Actor, applicantId: string): Promise<void>;
export async function resetJoinLink(db: PrismaClient, actor: Actor): Promise<string>;   // returns new code
export async function setJoinLinkEnabled(db: PrismaClient, actor: Actor, enabled: boolean): Promise<void>;
export async function notifyJoinRequest(db: PrismaClient, mailer: Mailer, applicantId: string): Promise<void>;
```
Takes the raw client because `Applicant` is global; every query filters `requestedWorkspaceId = actor.workspaceId`. Approval transaction: `deleteMany({ where: { id, requestedWorkspaceId: actor.workspaceId, rejectedAt: null, emailVerifiedAt: { not: null } } })` must return `count === 1` (else `NOT_FOUND`) — this is the race guard — then `user.create` with `id = applicantId`, `pickShortName`, copied `passwordHash`, chosen roles. Approved email after commit via `bestEffort`. `notifyJoinRequest` writes one `Notification` per active ADMIN (`type: "JOIN_REQUEST"`, `message: "Andi (andi@gmail.com) asked to join"`, `requestId: null`) and emails them through the mailer, best-effort.

- [ ] **Step 1: Write failing tests**:
  - `"non-admin → FORBIDDEN on every function"`.
  - `"admin of another workspace sees no requests and cannot approve (NOT_FOUND)"` (create a second workspace with `db.raw`).
  - `"approve creates User with same id, roles, password hash; applicant gone; approved email sent"`.
  - `"approving twice in parallel → one User, one NOT_FOUND"` (`Promise.allSettled`).
  - `"reject → listed under rejected; undo → pending again"`; `"approve a rejected applicant → NOT_FOUND"`.
  - `"resetJoinLink returns a new code; old code describeJoinCode → null"`; `"setJoinLinkEnabled(false) → describeJoinCode null"`.
  - `"notifyJoinRequest notifies every active admin only"`.
  - `notificationShell`: `notificationHref({ type: "JOIN_REQUEST", requestId: null }) === "/admin/users?tab=requests"`.
- [ ] **Step 2: Run** `npx vitest run tests/joinRequests.test.ts tests/notificationShell.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): approve, reject and invite-link controls`

---

### Task 6: Retire AllowedEmail and the domain check

**Files:**
- Create: `prisma/migrations/20261011130000_retire_allowed_email/migration.sql`
- Modify: `prisma/schema.prisma` (remove `AllowedEmail`), `src/lib/db.ts` (`SCOPED_MODELS`), `src/lib/signin.ts` (remove `isAllowedEmail`, `DEFAULT_ALLOWED_DOMAIN`), `src/lib/session-core.ts` (`loadActiveUser` without domain/allow-list; `Db` type drops `allowedEmail`), `src/lib/passwordAuth.ts`, `src/lib/admin.ts` (remove `addAllowedEmail`, `removeAllowedEmail`, `companyDomain`; `setUserLoginEmail` stops writing AllowedEmail; `countSignInCapableAdmins` = active ADMINs with an email), `src/app/(app)/admin/users/actions.ts` + `UsersContent.tsx` (drop the Allowed emails section and its actions)
- Test: update `tests/admin.test.ts`, `tests/auth.test.ts`, `tests/password.test.ts`, `tests/requireUserOrRedirect.test.ts`, `tests/seed.test.ts`, `tests/signinE2E.test.ts`, `tests/workspaces.test.ts`, `tests/adminUi.test.tsx`, `tests/adminRedesign.test.tsx`; new `tests/retireAllowedEmail.test.ts`

Migration: `INSERT INTO "Invite"` one row per `AllowedEmail` with no `User` of the same lower(email) in the same workspace — `appRole 'REQUESTER'`, `jobRole 'OTHER'`, `invitedById` = the oldest active ADMIN of that workspace, `tokenHash = 'migrated:' || id` (never matches a SHA-256 hex, so the admin must Resend), `expiresAt = now() + interval '7 days'`; then `DROP TABLE "AllowedEmail"`.

- [ ] **Step 1: Write failing tests** — `retireAllowedEmail.test.ts`: apply migrations up to `20261011121000`, insert an AllowedEmail for `"free@gmail.com"` (no user) and one for an existing user's email, apply the rest; expect one `Invite` for `free@gmail.com` with `tokenHash` starting `"migrated:"` and none for the user. `auth.test.ts`: `"an active gmail User with a password signs in without any allow-list row"`; `"loadActiveUser accepts any active user with matching claims"`. (If `createTestDb` can't stop mid-migration, add an `upTo?: string` option to it in this step.)
- [ ] **Step 2: Run** `npx vitest run tests/retireAllowedEmail.test.ts tests/auth.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**, then delete/adjust the old allow-list tests in the files listed above (their behaviour is intentionally gone).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` — Expected: all PASS.
- [ ] **Step 5: Commit** `refactor(auth): an active User grants access; AllowedEmail becomes invites`

---

### Task 7: Applicant sessions and sign-in routing

**Files:**
- Modify: `src/lib/auth.config.ts` (JWT/Session types gain `aid?: string`; `authorized()` rules; `session()` exposes `session.user.applicantId`), `src/lib/session-core.ts`, `src/lib/signin.ts`, `src/lib/passwordAuth.ts`, `src/lib/auth.ts`, `src/lib/session.ts`
- Test: `tests/authConfig.test.ts`, `tests/auth.test.ts`, `tests/password.test.ts`, new `tests/signupE2E.test.ts` (pattern of `tests/signinE2E.test.ts`)

**Interfaces:**
- Consumes: Task 3 `oauthApplicant`, `lobbyState`.
- Produces:
```ts
// passwordAuth.ts
export type PasswordIdentity = { kind: "user"; user: User } | { kind: "applicant"; applicant: Applicant };
export async function authenticateWithPassword(db, rawEmail, password, now?): Promise<PasswordIdentity | null>;
// signin.ts
export type SignInResult = { ok: true; kind: "user"; user: User } | { ok: true; kind: "applicant"; applicant: Applicant } | { ok: false; reason: "no-email" | "inactive" | "untrusted" };
export async function decideSignIn(db, provider, profile, env): Promise<SignInResult>; // unknown trusted email → oauthApplicant
// session-core.ts
export function bindApplicantToken<T>(token: T, a: { id: string; email: string }): T; // sets aid, loginEmail; clears uid/appRole/jobRole/pwv
export async function refreshJwt(...)  // token.aid: User with that id active → bindSignInToken; else Applicant exists → token; else null
export type SessionApplicant = { id: string; email: string; name: string };
// session.ts
export async function requireApplicantOrRedirect(): Promise<SessionApplicant>; // member → /requests, none → /signin
```
`authorized()` rules: public = `/`, `/signin`, `/signup`, `/join/**`. Applicant token (`aid`, no `appRole`) → only `/lobby`, `/verify`, `/join/**`, else redirect `/lobby`. Member on `/lobby` or `/verify` → `/requests`. Anonymous on `/lobby` or `/verify` → false (sign-in). Credentials `authorize()` returns `{ id, email, name }` for either kind; the `jwt` callback re-resolves by email: User first, then Applicant. Password lockout applies to whichever row matched.

- [ ] **Step 1: Write failing tests**:
  - `authConfig.test.ts` table test over `{ anonymous, applicant, member } × { "/", "/signup", "/join/x", "/join/invite/y", "/lobby", "/verify", "/requests", "/admin/users" }` with the expected allow/redirect target for each.
  - `auth.test.ts`: `"refreshJwt upgrades an aid token once a User with that id exists"`; `"refreshJwt returns null when neither row exists"`; `"decideSignIn: trusted unknown gmail → applicant; inactive user → inactive; unverified Google → untrusted"`; `"decideSignIn: Andi@Gmail.com matches applicant andi@gmail.com"`.
  - `password.test.ts`: `"applicant password sign-in returns kind applicant; 5 wrong → locked 15 min"`.
  - `signupE2E.test.ts` through the real handlers: sign up via core → verify → sign in with credentials → `/api/auth/session` shows `applicantId`, no `appRole` → admin approves → next session call shows `appRole: "REQUESTER"` with the same id.
- [ ] **Step 2: Run** `npx vitest run tests/authConfig.test.ts tests/auth.test.ts tests/password.test.ts tests/signupE2E.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same plus `npm test` — Expected: PASS (existing `signinE2E` unchanged).
- [ ] **Step 5: Commit** `feat(auth): applicant sessions that upgrade on approval`

---

### Task 8: Public and applicant pages

**Files:**
- Create: `src/app/signup/page.tsx`, `src/app/signup/actions.ts`, `src/app/verify/page.tsx`, `src/app/verify/actions.ts`, `src/app/lobby/page.tsx`, `src/app/lobby/LobbyPoll.tsx`, `src/app/lobby/actions.ts`, `src/app/join/[code]/page.tsx`, `src/app/join/invite/[token]/page.tsx`, `src/app/join/invite/[token]/actions.ts`, `src/components/auth/AuthShell.tsx` (layout + display font + work strip extracted from `src/app/signin/page.tsx`, which then uses it)
- Modify: `src/app/signin/page.tsx` ("New here? Create an account" → `/signup`, preserving `next`)
- Test: `tests/joinPages.test.tsx` (React Testing Library, actions mocked like `tests/changePasswordPage.test.tsx`)

**Interfaces:**
- Consumes: Tasks 2–5, 7. Actions build `Deps` with `prisma`, `createMailerFromEnv()`, `codeSecret()`, `baseUrl` from `new URL(headers())` origin (read Next docs for `headers()` in v16).
- Produces server actions: `signUpAction(fd)` → after `signUp`, `signIn("credentials", { redirectTo: "/verify?next=…" })`; `verifyAction(fd)`, `resendAction()`; `joinWithCodeAction(fd)` (lobby paste — accepts a full URL or bare code); `acceptInviteAction(fd)` (password path: `acceptInvite` then `signIn("credentials")` to `/requests`; signed-in applicant: `acceptInvite({ applicantId })` then `redirect("/requests")` — the JWT refresh upgrades). Google buttons use `signIn("google", { redirectTo: safeNext(...) })`.

Page states (copy from spec §4): `/join/[code]` unknown/off → "This link no longer works. Ask your admin for a new one." `/join/invite/[token]` expired/used → "This invite has expired — ask {inviter} for a new one." Lobby: waiting / none / rejected / unverified → redirect `/verify`; `LobbyPoll` calls `router.refresh()` every 15 000 ms only in the waiting state.

- [ ] **Step 1: Write failing tests** — render each page server component with mocked loaders: signup shows name/email/password fields and the Google button only when `oauthProviderIds()` includes google; join page shows "Join Clogent on Cloworks" and the dead-link copy; invite page shows "Wira invited you to Clogent as Designer" and `a***@gmail.com`; lobby renders the three states and mounts `LobbyPoll` only when waiting; signin page links to `/signup`.
- [ ] **Step 2: Run** `npx vitest run tests/joinPages.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** (reuse `fieldClass`, `labelClass`, `SubmitButton`, `Alert`).
- [ ] **Step 4: Run** test + `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(join): sign-up, verify, lobby and join pages`

---

### Task 9: Admin Members — Invited, Requests and invite-link card

**Files:**
- Modify: `src/app/(app)/admin/AdminTabs.tsx` (label "Members"), `src/app/(app)/admin/users/page.tsx`, `UsersContent.tsx`, `actions.ts`
- Create: `src/app/(app)/admin/users/MemberTabs.tsx`, `InvitedList.tsx`, `RequestsList.tsx`, `InviteLinkCard.tsx`
- Test: `tests/adminMembers.test.tsx`

**Interfaces:**
- Consumes: Tasks 4, 5. New actions in `actions.ts`, all `withUser(requireUser, …)` + `adminResult`: `inviteMember`, `resendMemberInvite`, `revokeMemberInvite`, `approveRequest`, `rejectRequest`, `undoRejectRequest`, `resetInviteLink`, `toggleInviteLink`. `revalidatePath("/admin/users")` on success.
- Tab is chosen by `?tab=members|invited|requests` (default members); Requests label shows the pending count.

- [ ] **Step 1: Write failing tests**: tabs render with `"Requests 3"`; Approve form has app role (default REQUESTER) and job role (default OTHER) selects; Reject asks for confirmation; rejected list collapsed with Undo; Invited rows show expiry and Resend/Revoke; link card shows the URL, Copy, Reset link, the on/off switch, and "People with @clogent.co.id can request to join"; non-admin sees `AdminDenied`.
- [ ] **Step 2: Run** `npx vitest run tests/adminMembers.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): members tabs for invites and join requests`

---

### Task 10: End-to-end browser check

**Files:** none new (fixes only if something fails).

- [ ] **Step 1:** `preview_start` the dev server (`.claude/launch.json`; create a `dev` entry with `npm run dev`, port 3000 if missing). Mailer without keys logs only — read the code from the dev DB with a one-off `npx tsx` query in the scratchpad, never from production.
- [ ] **Step 2:** As anonymous: `/signup` with a fresh `@gmail.com` test address → `/verify` → enter code → lobby "none". Paste `/join/<code>` → lobby "waiting".
- [ ] **Step 3:** As the seeded admin: bell shows the join request → Members → Requests → Approve as Designer. Back in the applicant tab, within 15 s the lobby lands on `/requests`.
- [ ] **Step 4:** Invite a second test address → open the `/join/invite/<token>` link from the dev log → set password → board. Reset the join link → old `/join/<code>` shows the dead-link copy.
- [ ] **Step 5:** `read_console_messages` clean; screenshot lobby, Requests tab, invite page for the PR.
- [ ] **Step 6: Commit** any fixes; push; note in the PR that production needs `npx prisma migrate deploy` (two migrations, one drops `AllowedEmail` — the open allow-list emails become invites the admin must Resend).
