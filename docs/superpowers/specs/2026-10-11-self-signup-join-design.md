# Self sign-up and joining a workspace — design

Date: 2026-10-11 · Status: approved in conversation, awaiting written-spec review

## Goal

Today an admin creates every account by hand (user row, password, `AllowedEmail` entry). Replace that with the
joining model people know from Slack, Notion and Linear: anyone can create their own account, and they get into the
Clogent workspace by an **email invite**, a shareable **invite link**, or their **company email domain** — with the
admin approving everyone who did not come through a direct invite.

Success looks like:

- A new teammate (company email or Gmail) gets in without the admin setting a password for them.
- Nobody reaches workspace data before an admin has invited or approved them.
- Existing members notice nothing: same sign-in, same password, same role.

Not in scope: personal workspaces, one person in several workspaces, billing, a "why I want to join" note,
invite history, more than one join link per workspace.

## Decisions taken

| Decision | Choice |
|---|---|
| Where not-yet-members live | Separate `Applicant` table, not a status on `User` (option A). `User` keeps its invariant: always in a workspace. |
| Company email (`@clogent.co.id`) | Becomes a **join request** needing approval. This changes today's behaviour, where a domain Google sign-in auto-creates a Requester. |
| Direct email invite | No approval: the invite is the approval. Role chosen when inviting. |
| Invite link | Every join through it needs approval. |
| Sign-up without any invite | Lands in a lobby; nothing to see until invited. |
| `AllowedEmail` | Retired. An active `User` row is what grants access. |
| Email | Existing Resend mailer (`src/lib/mailer.ts`); configured on production. |

## 1. User flows

**A. Email invite (main path).** Admin → Members → Invite: email + app role + job role. They receive "Wira invited
you to join Clogent on Cloworks" with a link valid 7 days → `/join/invite/<token>`. New person: set name + password, or
Continue with Google. Already signed in as that email: Accept. A `User` is created with the chosen roles and they land
on `/requests`. The invite only works for the exact email it was sent to; a Google account with another address sees
"This invite is for a***@gmail.com".

**B. Invite link.** Admin copies `/join/<code>` (can reset the code or switch the link off) and shares it, e.g. in
WhatsApp. The person signs up (or signs in as an existing applicant), verifies their email with a 6-digit code (Google
counts as verified), and a join request is created → lobby "Request sent". Admins are notified. Approve (pick roles) →
"You're in" email. Reject → no email.

**C. Company domain.** Signing up with an email on a workspace's `emailDomain` creates the join request automatically
after verification, as if they had used that workspace's link (even when the link is switched off).

**D. No invite.** Sign up → verify → lobby: "You're not in a workspace yet — ask your admin for an invite link, or paste
it here."

**E. Existing members.** Unchanged.

**Edge cases**

- Expired or revoked invite → "This invite has expired — ask Wira for a new one." Admin can Resend.
- An email that belongs to a deactivated `User` cannot sign up or accept: "Contact your admin." No request is created;
  the admin reactivates the user instead.
- Inviting an email that already has a pending applicant: accepting the invite converts that applicant immediately with
  the invite's roles (and the pending request disappears from Requests).
- Inviting an email that already has an active `User` in the workspace: refused in the form ("already a member").
- Unverified applicants are deleted after 7 days (opportunistic cleanup on sign-up, no cron).
- A rejected applicant cannot request the same workspace again; Undo in the admin Rejected list clears it back to
  pending.

## 2. Data model

**New `Applicant`** (global — not workspace-scoped; excluded from the scoped client in `src/lib/db.ts`):

| Field | Notes |
|---|---|
| `id` | cuid; reused as the `User.id` on approval |
| `email` | unique, stored lowercase |
| `name` | display name from the form or Google |
| `passwordHash?` | null for Google-only |
| `emailVerifiedAt?` | set by the code or by a trusted OAuth identity |
| `codeHash?`, `codeExpiresAt?`, `codeAttempts` | 6-digit code, hashed, 15 min, 5 attempts |
| `codeSentAt?`, `codesSentInWindow` | resend limits (60 s between, 5 per hour) |
| `failedLogins`, `lockedUntil?` | same lockout as `User` |
| `requestedWorkspaceId?`, `requestedAt?`, `requestSource?` (`LINK` \| `DOMAIN`) | set = join request; null = lobby |
| `rejectedAt?` | rejected by an admin of the requested workspace |
| `createdAt` | for the 7-day cleanup of unverified rows |

**New `Invite`** (workspace-scoped):

| Field | Notes |
|---|---|
| `email`, `appRole`, `jobRole` | target and roles granted |
| `tokenHash` | unique; SHA-256 of a 32-byte random token. The raw token only lives in the email link. |
| `invitedById`, `expiresAt` (7 days), `acceptedAt?`, `revokedAt?`, `createdAt` | Resend issues a new token and expiry on the same row |

At most one open (not accepted, not revoked) invite per `(workspaceId, email)`; inviting again resends.

**`Workspace` additions:** `emailDomain String? @unique` (replaces the `ALLOWED_EMAIL_DOMAIN` env var),
`joinCode String? @unique` (random, URL-safe), `joinLinkEnabled Boolean @default(true)`.

**Approval** runs in one transaction: create `User` with `id = applicant.id`, name/email/passwordHash copied,
`passwordVersion 0`, chosen roles, the applicant's workspace; delete the `Applicant`. `name` (the @mention short name)
uses the same collision fallback the OAuth first sign-in uses today in `resolveSignIn`.

**Migration**

1. Create `Applicant`, `Invite`; add the `Workspace` fields; set Clogent's `emailDomain = 'clogent.co.id'` and a random
   `joinCode`.
2. Every `AllowedEmail` whose email has no `User` becomes an `Invite` (Requester / Other, invited by the first admin,
   expires in 7 days, no email sent — the admin uses Resend).
3. Drop `AllowedEmail`, remove `ALLOWED_EMAIL_DOMAIN` reads.

## 3. Sessions and security

**Two token kinds in the same Auth.js JWT cookie.** Member: `uid`, `appRole`, `jobRole`, `loginEmail`, `pwv` — as today.
Applicant: `aid` and `loginEmail`, no `appRole`.

- `proxy.ts` `authorized()`: public routes are `/`, `/signin`, `/signup`, `/join/*`. An applicant token may reach only
  `/lobby`, `/verify`, `/join/*`; anything else redirects to `/lobby`. A member token hitting `/lobby` or `/verify`
  goes to `/requests`.
- Server side, a new `requireApplicant()` loads the `Applicant` for `aid`. `requireUser()` is unchanged and rejects
  applicant tokens (no `User` row), so a proxy mistake still cannot reach workspace data.
- **Upgrade after approval:** because `User.id = Applicant.id`, the jwt refresh for an `aid` token checks for a `User`
  with that id; if present and active it rebinds the token as a member (`bindSignInToken`). The lobby polls and
  redirects to `/requests`.

**Access check.** `loadActiveUser` drops the domain/allow-list test: active `User` with an email, matching
`loginEmail` and `pwv` claims. `resolveSignIn`'s auto-create is removed; OAuth sign-in for an unknown email goes to the
applicant path.

**Sign-in routing**

- Password: look up `User` by email first, then `Applicant`. Same timing-safe dummy-hash path for unknown emails, same
  lockout (5 wrong → 15 min) on whichever row matched.
- Google (`email_verified === true`) / Microsoft Entra (tenant match): existing `User` → member. Otherwise find or create
  a verified `Applicant`; a matching `emailDomain` creates the join request.

**Protections**

- No account enumeration: sign-up with an email that already belongs to a `User` or an `Applicant` shows the same "We
  sent you a code" screen; the owner instead gets an "You already have an account" email.
- Codes hashed (SHA-256 with a server pepper from `AUTH_SECRET`), compared in constant time, 15 min, 5 attempts, then a
  new code is required.
- Invite tokens and join codes compared via their hashes / unique lookups; resetting the join code invalidates the old
  link at once.
- Invite, revoke, resend, approve, reject, undo, link reset/toggle: `ADMIN` only, through `withUser` and the scoped
  db, like the current admin actions.
- Admins see only requests addressed to their own workspace.
- Invite and join pages shown to anonymous visitors reveal only the workspace name, inviter name, role, and the masked
  invited email.

## 4. Screens and emails

**Admin → Users becomes Admin → Members** with tabs:

- **Members** — the existing list and forms.
- **Invited** — email, roles, invited by, expiry; Resend, Revoke; "Invite" button (email, app role, job role).
- **Requests (n)** — name, email, source (link / company email), time; Approve with app role + job role selects
  (default Requester / Other); Reject with confirm; collapsed "Rejected" list with Undo.
- **Invite link card** on top: the URL with Copy, Reset link, on/off switch, and "People with @clogent.co.id can request
  to join".

**Notification:** new `JOIN_REQUEST` type to every active admin, bell + email (through `notifyWith`'s mailer path, best-effort), message
"Andi (andi@gmail.com) asked to join", linking to Members → Requests. `requestId` null, as library notifications do.

**Public pages** (same visual language as `/signin`):

- `/signup` — name, email, password (`MIN_PASSWORD_LENGTH`, 10), or Continue with Google. `/signin` gains "New here?
  Create an account". Arriving from a join link or invite carries that context through (`?next=`, same-origin
  `/join/...` paths only).
- `/verify` — six-digit code input, "Resend code" with countdown.
- `/join/<code>` — "Join **Clogent** on Cloworks" → sign up / sign in → request created → lobby.
- `/join/invite/<token>` — "Wira invited you to **Clogent** as **Designer**" → set password or Google → board.
- `/lobby` — Waiting (polls every 15 s, redirects on approval), No workspace (paste link), Rejected; Sign out.

**Emails** (plain text via the mailer):

1. Verification code — "Your Cloworks code is 482913. It expires in 15 minutes."
2. Invite — inviter, workspace, role, link, expiry date.
3. Approved — "You're in. Clogent approved your request." + sign-in link.
4. Already have an account — sent instead of a code on duplicate sign-up.
5. Join request to admins — through the notification mailer.

Rejection sends nothing.

## 5. Testing

- Vitest unit: code generation/hash/attempts/expiry, resend limits, invite token issue and check, masked email,
  `authorized()` route rules for anonymous / applicant / member, sign-in routing (user vs applicant vs unknown),
  `next` sanitising.
- Integration on embedded Postgres: sign-up → verify → domain request → approve → member session; invite → accept;
  invite to an existing applicant; deactivated email refused; reject and undo; migration of `AllowedEmail` rows.
- Browser check on localhost of `/signup`, `/verify`, `/join/<code>`, `/join/invite/<token>`, `/lobby`, and the
  Members tabs.
