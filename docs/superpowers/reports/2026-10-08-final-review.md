# Final whole-branch review: Creative Request Tracker (fee8d13..c326620)

Scope: all 28 commits on `feat/creative-request-tracker`, read as the current working tree at HEAD plus the per-task ledger, QA report and final-fix report. Read-only: no files other than this report were written; `npm run lint` was run once (clean, 0/0).

### Strengths (specific)

- **Identity is decided server-side, in one place, every request.** `src/lib/session-core.ts:13-29` re-reads the user by primary key, denies inactive users, users with no email, users whose email is no longer permitted (domain or `AllowedEmail`), and tokens whose `loginEmail` claim no longer matches `User.email`. Every server action and every page/RSC component goes through `requireUser()` (grep: 30 call sites, none bypass it); the edge `proxy.ts` is explicitly not a security boundary and the code treats it that way.
- **OAuth identity is not blindly trusted.** `signin.ts:22-33` fails closed: Google needs `email_verified === true`, Entra needs `tid` equal to the configured tenant and a company-domain email (no allow-list via Entra). First-login linking is by exact normalised email only; the alias/name heuristics that would have allowed privilege escalation were removed. Verified against `@auth/core` internals that the raw OIDC profile (with `tid`/`email_verified`) is what reaches the `signIn` callback.
- **Every core is framework-free and injected** (`db`, `notifier`, `getUser`, `now`), so the 435 tests exercise the real code paths against a real embedded Postgres with real migrations, including `tests/lifecycle.test.ts` which walks the exact spec end-to-end case (submit → assign → First look → Done → KPI numbers) plus permission denials.
- **Workflow writes are atomic.** `transition.ts:42-59`: compare-and-set on the validated `from` status and the `StatusEvent` insert are in one transaction; a lost race returns `CONFLICT`. Assignment uses `updateMany ... status != CANCELLED` (`collab.ts:120`). Admin roster mutations that can change who the admins are run under one advisory lock (`admin.ts:71`), and the "last sign-in-capable admin" guard counts only admins who can actually log in.
- **KPI is computed by exactly one function** (`kpi/metrics.ts:computeKpi`) used by the personal page, the team page, the trend chart and the lifecycle test; there is no second implementation that could drift. All calendar logic (month bucketing, working days, on-time, date-only inputs) uses a fixed Asia/Jakarta offset consistently; `monthBounds` (query) and `monthOf` (compute) agree.
- **Import is dry-run by default, idempotent, and refuses swapped files.** Header fingerprinting per source (`parseRequests.ts:91-97`), `importKey` dedupe (`applyImport.ts:29-37`), lookups verified before any write, and the DONE-date caveat printed in every run.
- **Notifications cannot stall a user action**: parallel sends, per-recipient try/catch, 5 s overall deadline, no PII in logs (`notify.ts:55-94`); the Resend mailer has an 8 s timeout and is a no-op when unconfigured.
- Client-provided URLs are validated as http(s) at every entry (brief, attachments, design folder, project file link, custom `url` fields) and re-checked at render (`requests/[id]/page.tsx:17`), so `javascript:` can neither be stored nor rendered as a link. Query params are whitelisted/capped (`requests/params.ts`, `dashboard/params.ts`).
- `.env` is untracked, `.env.example` holds placeholders only, no secrets anywhere in the tree, `dev-session` refuses production/non-localhost/weak secrets and never echoes secrets.

### Issues

#### Critical (Must Fix before the owner uses it)

None. I found no authentication bypass, IDOR, injection, data-loss path or wrong KPI arithmetic.

#### Important (Should Fix)

1. **A revoked or stale session crashes every page for up to 24 h instead of sending the person to sign-in.**
   `src/lib/session-core.ts:51,53` throws `Error("Unauthenticated")`; every page and all three `AppShell` fragments (`src/components/AppShell.tsx:12,18,23`) call it during render, and there is no `error.tsx`/`global-error.tsx` anywhere under `src/app`. The proxy (`src/proxy.ts`) uses the DB-free config, so it still sees a valid cookie.
   Scenario: Wira deactivates "Tester QA" (or changes/clears Fadli's login email) while that person is signed in. Their next click on any page renders Next's default "Application error: a server-side exception has occurred" page with no shell, no Sign-out button and no explanation; this repeats on every page until the cookie expires (24 h) or they clear cookies by hand. The same happens to anyone holding a token minted before the `loginEmail` claim existed.
   Why it matters: deactivation and email rebinding are advertised admin features; the resulting experience looks like an outage and will generate support calls to Wira.
   Fix (bounded): add `src/app/(app)/error.tsx` (client component) that shows "Your session ended. Sign in again." with a link to `/signin`; or, in `requireUser()` for page contexts, catch and `redirect("/signin")`. Also add a `src/app/not-found.tsx` so `notFound()` on `/requests/[id]` renders inside the brand rather than the bare default page.

2. **A denied sign-in shows no message.** `src/lib/auth.config.ts:24` routes Auth.js errors to `/signin`, but `src/app/signin/page.tsx` never reads `searchParams.error`.
   Scenario: a colleague with a Gmail address that Wira has not allow-listed yet clicks "Continue with Google", authenticates, and lands back on the identical sign-in page. Nothing says why. Same for an inactive user, an unverified Google account, or an Entra account outside the tenant / without an `email` claim.
   Why it matters: this is the first thing every non-company-email user will hit at launch (most of the creative team use Gmail, per the spec); they will assume the app is broken.
   Fix: read `searchParams.error` in the sign-in page and render one neutral line for `AccessDenied` ("This account is not allowed to sign in yet. Ask Wira to add your email.") and a generic line for other codes. No data leak: the code is already in the URL.

3. **There is no way to exclude a request from KPI (`includeKpi`).** The column exists, the KPI rule depends on it (spec, "KPI definitions"), the SocMed sheet has an `Include_KPI` column that the team actively uses and the importer honours (`parseRequests.ts:213`), but in the app it is only ever written as `true` (`src/lib/createRequest.ts:124`) and no page or action can change it (grep over `src/` finds no other writer).
   Scenario: after import, Idzni creates a test request or a non-counting "Story" post; it counts toward Fafa's monthly target forever, and cancelling it is the only workaround (which also hides it from the board).
   Fix: a lead/admin toggle on the request detail "Manage" panel (one small core `setIncludeKpiWith(db, user, requestId, value)` gated by `request.assign`, plus a line on the detail page). Not security-relevant.

#### Minor

4. `src/lib/transition.ts:47,55`: the DONE guard "needs an assignee" is checked on the read but the compare-and-set `where` only pins `status`. A concurrent unassign (`assignRequest(..., null)`) between the read and the update yields a DONE request with `assigneeId = null`, which then counts for nobody. Fix: when `to === "DONE"` add `assigneeId: { not: null }` to the `updateMany` where (and map `count !== 1` to the existing INVALID message when the re-read shows no assignee).

5. `src/lib/transition.ts:37` accepts any integer `outputCount >= 1`; `src/components/DoneDialog.tsx:49-50` only checks `/^\d+$/`. Entering `99999999999999999999` passes both, overflows Postgres `INTEGER` in Prisma and surfaces as the generic "Something went wrong". Fix: cap at a sane maximum (e.g. 1000) in `transition.ts` and mirror it in the dialog (ledger T6 "huge-number guard" is still open).

6. Expired-session handling is inconsistent across actions. `src/app/(app)/requests/[id]/actions.ts:9-17` converts `Unauthenticated` to a result object, `moveRequestWith` does too, but `submitRequest` (`requests/actions.ts:37`), `setTarget`, every admin action and every project action let it throw, so the client sees Next's redacted "An error occurred in the Server Components render". Fix: one shared `withUser()` wrapper returning `{ ok:false, code:"UNAUTHENTICATED", message }` used by all form actions.

7. `src/app/(app)/requests/actions.ts:28-31` `createRequest` (throwing variant) and `src/lib/createRequest.ts:18` `CreateRequestResult` have no callers (grep); the plain `transitionRequest` action (`requests/actions.ts:11-17`) likewise has no UI caller. Dead exports of throwing actions are a trap for future UI work (production redacts their errors). Remove them.

8. `.gitignore:4-5` ignores only `.env` and `.env.local`; `.env.production`, `.env.development.local` etc. would be committed. Fix: `.env*` plus the existing `!.env.example`.

9. No start-up environment validation. A missing/placeholder `AUTH_SECRET` or `DATABASE_URL` only fails at the first request as a 500 (Auth.js `MissingSecret`), with no hint in the start log. A tiny `src/lib/env.ts` asserting the required variables when `NODE_ENV === "production"` (imported from `src/lib/db.ts`) would make a bad deploy fail at boot.

10. Each page render performs four `requireUser()` calls (three `AppShell` fragments + the page), each running the Auth.js `jwt` callback (`refreshJwt` DB read) and then `loadActiveUser` again, i.e. about eight queries per page for identity alone. Fine for 30 users; wrapping `requireUser` in React `cache()` removes the redundancy for free.

11. Duplicated helpers: `JAKARTA_OFFSET_MS` is defined three times (`createRequest.ts:31`, `kpi/workingDays.ts:4`, inline in `import/parseRequests.ts:122`); `isHttpUrl` three times (`fieldSchema.ts:20`, `transition.ts:19`, `DoneDialog.tsx:9`); Jakarta month-of-instant three times (`kpi/months.ts:10`, `kpi/metrics.ts:32`, `parseRequests.ts:121`). One `src/lib/jakarta.ts` would end the drift risk the ledger flagged in T6.

12. `src/lib/signin.ts:73-75`: an unknown company-domain user is auto-created with `name` = the OAuth display name (usually a full name). `name` is the "short name" used for @mentions, admin collision checks and import resolution, so "Wira Budi Prasetyo" signing in from a second company account would create a user whose `name` equals Wira's `fullName`, making imports ambiguous for "Wira". Fix: when the display name collides with any existing name/fullName/alias (reuse `normalizeName`), fall back to the email local part.

13. `src/lib/devSession.ts:1` imports `@auth/core/jwt`, which is not a declared dependency (transitive via `next-auth`). Works with npm hoisting today; add `@auth/core` to devDependencies or import the `encode` re-export from `next-auth/jwt`.

14. Timing-sensitive assertions in `tests/notify.test.ts:122,141` (`< 500 ms` for a 50 ms deadline, `< 280 ms` for three parallel 100 ms sends) may flake on a slow CI runner. Loosen to generous bounds or assert ordering rather than wall-clock.

15. `src/lib/import/parseRequests.ts:135` hard-codes the date format per source (Request List = d/m/y, SocMed = m/d/y) with no override flag. If an export differs, `3/4/2026` silently becomes 3 April instead of 4 March and whole months shift; the dry-run month table is the only safeguard. A `--dates=requests:dmy,socmed:mdy` option (or printing the first three parsed dates next to their raw text) would make the check explicit.

16. `src/lib/fieldSchema.ts:4` accepts any non-empty `key` (spaces, `__proto__`); harmless today (`validateFields` uses `hasOwn`/`defineProperty`, the setter is a no-op) and admin-only, but a key regex `^[A-Za-z][A-Za-z0-9_]*$` in `fieldDefSchema` costs one line.

17. Requesters cannot cancel a request they submitted (`request.transition` is CREATIVE+, `permissions.ts:12-14`), so a mistaken submission must be cancelled by a creative. Allowing `REQUESTED → CANCELLED` by the requester themself is a small, reasonable extension of the workflow (controller may rule otherwise).

18. The `Notification` table grows without a reader or retention (email-only V1). Not a defect; note for later.

### Ledger triage

| Item | Status in HEAD |
|---|---|
| T1 .gitignore only `.env`/`.env.local` | **Still open (minor #8)** |
| T1 no indexes on brandId/divisionId/typeId/requesterId | Acceptable (<30 users; `status`, `assigneeId`, `requestedAt` indexed) |
| T1 theme test light-only; testDb swallows onError; AGENTS.md + public svg noise | Acceptable (AGENTS.md is the Next 16 scaffold note; harmless) |
| T2 test for targetTasks 0 → progress null | Fixed (`tests/kpi/metrics.test.ts:170-171`, `metrics.ts:115`) |
| T3 P2002 first-login race | Still open, acceptable (second simultaneous first login retries) |
| T3 double `resolveSignIn` on first login | Still open, acceptable (one extra read on first login only) |
| T3 case-sensitive `User.email` unique at DB | Still open, acceptable (every writer lowercases: signin, admin, seed) |
| T3 proxy matcher excludes paths with `.` | Acceptable (all pages/actions call `requireUser`; verified by grep) |
| T3 signin page ignores callbackUrl | Acceptable; but the sibling gap (ignores `error`) is **Important #2** |
| T3 untested jwt/session callbacks | Fixed (`tests/auth.test.ts:151-214`, `tests/authConfig.test.ts`) |
| T4 reopen keeps outputCount/folder; outputCount optional on DONE | Acceptable (both DONE entry points always open `DoneDialog`, which always sends `outputCount`) |
| T4 redundant `can()` in wrapper; bare `toThrow()`; test gaps | Acceptable |
| T5 `CreateRequestResult` unused; `createRequest` throws | **Still open (minor #7)** |
| T5 seed create-only; `"on"` echo literal; role/live-region; focus first invalid | Acceptable / fixed in final wave G |
| T6 optimistic state vs `router.refresh` | Acceptable |
| T6 dnd announcements raw ids | Fixed (`src/lib/boardA11y.ts`) |
| T6 DoneDialog huge-number guard | **Still open (minor #5)** |
| T6 q/id param caps | Fixed (`requests/params.ts:15-21,29`) |
| T6 FilterBar aria-pressed / GET drops sort,dir | Fixed (final wave M) |
| T6 shared jakartaDate util | **Still open (minor #11)** |
| T7 (a) assign vs cancel atomic, (b) removeAttachment bound to request, (c) url cap 2048 | Fixed (`collab.ts:120-124`, `:154-156`, `:14,144`) |
| T7 mention apostrophe/dot; test gaps; aria gaps; bold unresolved @tokens | Acceptable |
| T8 stale assignee in addComment; subject length loose | Acceptable |
| T8 deadline timer after lookups; timing-tight tests; late emailedAt | Timer: acceptable. Timing-tight tests: **still open (minor #14)**. Late emailedAt: acceptable |
| T9 team forbidden = 200 inline | Acceptable (Ruling D7) |
| T9 personal page loads 6 months of all users | Acceptable at this scale |
| T9 browser check of Recharts/dark mode | Done in QA pass (area D, A) |
| T10 today-marker constant; omitted-by-cap count; forbidden 200; MONTHS duplicate; non-atomic update | MONTHS: fixed (`projects.ts:6` imports from `timeline.ts`). Others acceptable |
| T11 importKey includes raw requester text | Documented (`run.ts:8-9`, README); acceptable |
| T11 no unique DB index on importKey | Acceptable for a one-off import run by one person; do not run two `--apply` at once |
| T11 CRLF line drift; time part unchecked; test hygiene | Acceptable |
| T12 admin.ts size; saveUser full-row overwrite; aria-invalid; schema size | Acceptable |
| T12 MUST-FIX seed alias "irsyad" + changed-fields-only collision check | Fixed (`prisma/seedCore.ts:17`, `admin.ts:49-62,172-182`) |
| T13 lint error AdminForm.tsx:111 + 2 warnings | Fixed (`npm run lint` clean, re-run by me) |
| T13 dev-session min secret length 16 | Fixed (`devSession.ts:11,59`) |
| T13 dev-session DATABASE_URL local-host guard | Fixed (`devSession.ts:28-45`, `scripts/dev-session.ts:11`) |
| T13 lifecycle event-order tiebreaker | Fixed (`tests/lifecycle.test.ts:107`) |
| T13 README node version claim | Fixed ("22+ (developed on 24.21.0)") |
| QA D1 in-app inbox | Ruled email-only; README wording fixed |
| QA D2 hydration id | Fixed (`Board.tsx` stable `id`); not re-observed in a browser |
| QA D3-D6, D8-D10 | Fixed per final-fix report; focus/announcement/1024 px not re-verified in a browser |
| QA D7 403 as 200 | Ruled skip; acceptable |

### Rulings re-judged

- **Embedded Postgres for tests/dev** — Agree. Production still needs a hosted Postgres; the README says so.
- **Import bypasses `transitionRequest`; unassigned DONE rows kept** — Agree; history matters more than the invariant, and the report lists them.
- **T12 extra admin actions (allow-list, create roster user, active)** — Agree; without them the spec's "Wira adds Gmails from the admin page" is impossible.
- **All calendar logic fixed UTC+7** — Agree. Risk accepted: constant, not configurable.
- **Deadline is a calendar date; done any time that day is on time** — Agree; matches the sheet.
- **Date-only inputs stored as Jakarta midnight** — Agree; verified in `createRequest.ts:121`, `projects.ts:45`, `parseRequests.ts:113`.
- **Link by exact email only; Wira sets emails first** — Agree (removed a real escalation path). Consequence: README "First login" steps are mandatory, not optional.
- **Google needs `email_verified`; Entra needs `tid` + company domain** — Agree. One caveat for the owner: Entra v2 id-tokens omit `email` for some accounts; such users will be denied with no message (Important #2 makes it visible).
- **JWT re-reads DB every call; `requireUser()` the only identity source** — Agree on security. The unhandled consequence (crash instead of redirect, Important #1) should be fixed.
- **Shared DB-free `session` callback for edge** — Agree.
- **Attachments are links, not uploads** — Agree; spec itself says design folders stay external links.
- **Notifications: parallel + 5 s deadline, no `after()`** — Agree; the trade (user may wait up to 5 s, abandoned sends leave `emailedAt` null) is sound and tested.
- **`dashboard.self` for every role** — Agree; social media staff are REQUESTERs with targets.
- **Project owner must exist; active only on create/change** — Agree.
- **Synthetic DONE at the deadline for imports** — Agree with the stated caveat; note a DONE row whose deadline is in the future gets a future-dated event (harmless for KPI, odd in the history list).
- **Import dry-run default, `--apply`, importKey, no downloads** — Agree.
- **Blank/unresolvable requester → Wira** — Agree, with one note: if Wira ever gets a SOCIAL_MEDIA-basis target month, those fallback rows would count for him. The report lists them, so he can fix them by hand.
- **Per-source distinguishing headers** — Agree.
- **setUserLoginEmail also manages AllowedEmail; refreshJwt denies non-permitted email** — Agree; this is what makes revocation immediate.
- **Sign-in-capable admin definition + LAST_ADMIN under one lock** — Agree.
- **`loginEmail` claim; pre-change tokens forced to re-login** — Agree (pre-release).
- **Admin collision rules reuse `normalizeName`** — Agree.
- **No test-auth bypass in app code; no Playwright; `dev:session` script instead** — Agree. The script's guards are adequate; keep it out of any deploy image anyway (it is a dev script, not bundled).
- **D1: email-only V1** — Agree, but the owner must understand the practical consequence: with `RESEND_API_KEY` unset nobody gets notified about anything. Decide before launch (see Recommendations).
- **D7: 403 rendered as 200** — Agree.

### Declined to judge

- Editing a request after submission (title, brief, deadline, custom fields): not in the V1 feature list; a reasonable expectation, so recommend as the first post-launch addition.
- Approval gating, image pin-comments, calendar view, chat integrations, recurring requests: explicitly "Not in V1" in the spec.
- In-app notification inbox/bell: ruled email-only by the controller (D1); listed above only as a launch-readiness decision.
- File uploads / S3 storage: ruled links-only (Task 7 ruling).
- Rate limiting / brute-force protection: internal OAuth-only app with no password forms.
- Audit log of admin changes (who changed a role/email and when): not in spec; would be a sensible V2 item.
- Mobile layout polish beyond "no horizontal scroll at 375 px": QA pass covered the spec's requirement.
- Localisation (UI is English; team works in Indonesian): spec is silent and the sheet vocabulary is mixed.

### Recommendations (before launch)

1. **Fix Important #1-#3** (an `error.tsx` + redirect, the sign-in error line, an `includeKpi` toggle). Each is under an hour.
2. **Hosting and secrets.** Provision a managed Postgres (Supabase/Neon per spec); set `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL` (public https URL; this also satisfies Auth.js `trustHost`), `ALLOWED_EMAIL_DOMAIN` only if not `clogent.co.id`. Never reuse the local `.env` values in production.
3. **OAuth registration.** Google Cloud: OAuth client (web), redirect `https://<host>/api/auth/callback/google`; Entra: app registration with redirect `https://<host>/api/auth/callback/microsoft-entra-id`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0` and `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<tenant-id>` (Entra sign-in is denied without it). Test one Entra login early to confirm the `email` claim is present for company accounts.
4. **Decide on email now.** Either set `RESEND_API_KEY` + `EMAIL_FROM` + `APP_BASE_URL` (verify a sending domain in Resend) or accept that V1 has no notifications at all.
5. **First run order:** `npm ci` → `npx prisma migrate deploy` → `npm run db:seed` → `npm run build` → `npm start` → Wira signs in with `wira.budi@clogent.co.id` → Admin > Users: set each person's login email (Gmail addresses are allow-listed automatically) and confirm roles → promote a second admin so Wira is not the single point of failure.
6. **Import:** export the two tabs as CSV, run the dry run, and check the "months" table and the unmapped-names list against the sheet before `--apply`. Confirm the date formats (Request List d/m/y, SocMed m/d/y) match the exports by eyeballing three rows. Run `--apply` once, from one terminal. Then set monthly targets on Team KPI for the imported months you want to see (Fadli 50 in 2026-10, Rifqy 87, etc.). Remember on-time/turnaround are meaningless for imported months.
7. **Manual checks after deploy:** Gmail user not yet allow-listed is refused (and, after #2, sees why); a deactivated user is bounced to sign-in (after #1); drag-and-drop persists after reload; a REQUESTER sees no Manage panel; Team KPI numbers for one person match the personal page for the same month.
8. Keep `scripts/dev-session.ts` out of the production image or at least never set `AUTH_URL` to localhost there; the guards make misuse hard, not impossible.

### Assessment: **Ready to merge/use? With fixes**

The security model is sound end to end (verified identity, DB-authoritative sessions with immediate revocation, every action gated in its core, atomic workflow writes, validated URLs) and the KPI arithmetic is single-sourced and tested against the spec's own case. What stands between this branch and a good launch is not a defect in what was built but three small gaps in what a new user meets: a revoked session crashes instead of redirecting, a refused login explains nothing, and `includeKpi` cannot be set from the UI. Fix those three (plus the trivial minors #4-#8 if time allows), complete the environment/OAuth/email setup above, and it is ready for the team.
