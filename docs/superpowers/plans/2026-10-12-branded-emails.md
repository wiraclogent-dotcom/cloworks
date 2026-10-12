# Branded HTML Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Cloworks email goes out as a branded HTML email (design B) with a matching plain-text part.

**Architecture:** One pure function `renderEmail` in `src/lib/emailLayout.ts` builds `{ html, text }` from structured
content. The `Mailer` gains an optional `html` field forwarded to Resend. The five templates in `joinEmails.ts`, the
request notifications in `notify.ts` and the join-request alert in `joinRequests.ts` switch to `renderEmail`.

**Tech Stack:** TypeScript, Next.js app, Vitest, Resend HTTP API (no SDK). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-branded-emails-design.md`

## Global Constraints

- No new npm dependencies; no hosted Resend templates.
- English copy only; subjects unchanged.
- Colours: header `#09426d`, button `#11aa9f` with white text, page `#f5f3ee`, card `#ffffff`, body text `#17181c`, secondary `#62656d`, muted `#7d8088`.
- HTML: table layout, inline styles only, 600px max-width, system font stack, no `<style>` dependence for layout, no JS, no images except the logo.
- Every string placed into HTML is escaped (`&`, `<`, `>`, `"`, `'`).
- Buttons and the logo only for absolute `http(s)` URLs.
- Footer in both parts: `Need help? Contact your workspace admin.`
- Sender stays `noreply@`; no Reply-To header.

## Review Focus

1. A request title or person name containing `<`, `&`, quotes or `"><img onerror=…>` must appear as literal text in the HTML, never as markup — test in Task 2 and Task 4 (notification with a hostile title).
2. Production without `APP_BASE_URL` (or a non-http value): no logo `<img>`, no button, fallback sentence kept, email still sends — test in Task 2 and Task 3 (`resetEmail({ url: "" })`).
3. Very long titles (300+ chars) must not break the subject (still capped by `cleanLine`) and must not be dropped from the body — test in Task 4.
4. The sign-up code must be copyable as plain digits in both parts (no spaces or markup inside the digits) — test in Task 3.
5. A mailer that only receives `text` (older callers, tests) must keep sending exactly the old JSON body without an `html` key — test in Task 1.

---

### Task 1: Mailer forwards optional HTML

**Files:**
- Modify: `src/lib/mailer.ts`
- Test: `tests/notify.test.ts` (`createMailerFromEnv` describe block, ~line 172)

**Interfaces:**
- Produces: `Mailer.send(msg: { to: string; subject: string; text: string; html?: string }): Promise<void>`

- [ ] **Step 1: Write the failing tests** next to "posts to Resend with auth and JSON body":
  - `"includes html in the Resend body when given"`: `send({ to: "a@b.c", subject: "s", text: "t", html: "<p>h</p>" })` → body `toEqual({ from: "T <n@x.com>", to: ["a@b.c"], subject: "s", text: "t", html: "<p>h</p>" })`.
  - The existing text-only test stays and must keep `toEqual` without an `html` key (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run tests/notify.test.ts -t "createMailerFromEnv"` — expect the new test to FAIL (no `html` in body).
- [ ] **Step 3: Implement** in `createMailerFromEnv`: add `html?` to the interface; spread `...(html ? { html } : {})` into the JSON body.
- [ ] **Step 4: Run** the same command — PASS. Run `npx tsc --noEmit -p . 2>&1 | grep -v "scripts/.*\.local\."` — no output.
- [ ] **Step 5: Commit** `feat(mailer): forward optional html part to Resend`

---

### Task 2: `renderEmail` layout and logo asset

**Files:**
- Create: `src/lib/emailLayout.ts`
- Create: `public/email/logo.png` (56×56): `mkdir -p public/email && sips -z 56 56 src/app/apple-icon.png --out public/email/logo.png`
- Test: `tests/emailLayout.test.ts`

**Interfaces:**
- Consumes: `safeBaseUrl(raw: string | undefined): string | null` from `src/lib/notify.ts`.
  If importing `notify.ts` pulls `next/server` into tests awkwardly, move `safeBaseUrl` to `emailLayout.ts` and re-export it from `notify.ts` (keep the `notify.ts` export name).
- Produces:
  ```ts
  export type EmailContent = { preheader: string; heading: string; lines: string[]; code?: string; button?: { label: string; url: string }; note?: string };
  export type RenderedEmail = { html: string; text: string };
  export function renderEmail(c: EmailContent, opts?: { baseUrl?: string }): RenderedEmail;
  export function escapeHtml(s: string): string;
  ```
  `opts.baseUrl` absent (key not present) → use `process.env.APP_BASE_URL`; present but `undefined`/invalid → no base.

- [ ] **Step 1: Write failing tests** in `tests/emailLayout.test.ts` (always pass `baseUrl` explicitly):
  - `escapes every field`: heading `<b>H</b>`, lines `["a & b"]`, note `"q\"uote'"`, code `"<1>"`, button label `<i>`, preheader `<p>` → html contains `&lt;b&gt;H&lt;/b&gt;`, `a &amp; b`, `&quot;`, `&#39;`, `&lt;1&gt;`, `&lt;i&gt;`, and does not contain `<b>H` or `<i>`.
  - `renders the button only for http(s) urls`: for `https://x.test/r?a=1&b=2` html contains `href="https://x.test/r?a=1&amp;b=2"` and the label; for `""`, `"/signin"`, `"javascript:alert(1)"` html has no `href=` and text has no label line.
  - `logo only with a safe base url`: `baseUrl: "https://clowork.my.id"` → html contains `src="https://clowork.my.id/email/logo.png"` and `alt="Cloworks"`; `baseUrl: undefined` and `"ftp://x"` → no `<img`; both cases contain the wordmark text `Cloworks` inside the header.
  - `brand colours`: html contains `#09426d` and `#11aa9f` (with a button) and `#f5f3ee`.
  - `text part`: starts with the heading; contains each line, the code, `Set new password: https://x.test/r`, the note, and ends with a footer block containing `Need help? Contact your workspace admin.`; contains no `<`.
  - `footer in html`: contains `Need help? Contact your workspace admin.` and, with baseUrl `https://clowork.my.id`, `clowork.my.id`.
  - `preheader is hidden`: html contains the preheader inside an element styled `display:none`.
  - `long content is kept`: a 400-char line appears in full in both parts.
- [ ] **Step 2: Run** `npx vitest run tests/emailLayout.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `escapeHtml` and `renderEmail` per the spec's Architecture section and Global Constraints. Structure: hidden preheader div → outer table (bg `#f5f3ee`) → 600px card table with header row (bg `#09426d`, `bgcolor` attribute too, logo img 28×28 if base, white bold "Cloworks") → body cell (heading 20px, lines 15px/1.6 `#17181c`, code in a 28px letter-spaced monospace block, bulletproof table button bg `#11aa9f`, note 13px `#7d8088`) → footer below the card (12px `#7d8088`). Text part: heading, blank line, lines joined by blank lines, code, `{label}: {url}`, note, then `--` and the footer lines.
- [ ] **Step 4: Run** the test file — PASS. Add the logo with the `sips` command above and check `sips -g pixelWidth public/email/logo.png` prints `56`.
- [ ] **Step 5: Commit** `feat(email): branded layout renderer and logo asset`

---

### Task 3: Account emails use the layout

**Files:**
- Modify: `src/lib/joinEmails.ts`
- Test: `tests/joinEmails.test.ts`; update text assertions that break in `tests/applicants.test.ts`, `tests/invites.test.ts`, `tests/passwordReset.test.ts`, `tests/joinRequests.test.ts`, `tests/signupE2E.test.ts`

**Interfaces:**
- Consumes: `renderEmail`, `EmailContent` (Task 2).
- Produces: `export type Mail = { subject: string; text: string; html: string }`; same five function signatures as today.

- [ ] **Step 1: Write failing tests** in `tests/joinEmails.test.ts` (set `process.env.APP_BASE_URL = "https://clowork.my.id"` in `beforeEach`, restore after):
  - Each of the five returns `html` and `text`, heading and button per the spec's content table, with the exact copy below.
  - `codeEmail("482913")`: html and text both contain `482913` as one unbroken token; no button (`href=` absent).
  - `inviteEmail({ inviter: "Lia", workspace: "Clogent", role: "Designer", url: "https://clowork.my.id/join/abc", expires: new Date("2026-11-01T00:00:00Z") })`: heading `Join Clogent on Cloworks`, line `Lia invited you to join Clogent as Designer.`, button `Accept invite` → the url, note `This invite expires on 1 November 2026.`
  - `resetEmail({ url: "" })`: no button; text contains `The reset link could not be created. Ask your admin for help.`
  - Subjects equal today's subjects (copy them from the current file before editing).
- [ ] **Step 2: Run** `npx vitest run tests/joinEmails.test.ts` — FAIL.
- [ ] **Step 3: Implement** each template as `{ subject, ...renderEmail(content) }`. Exact copy:

  | fn | preheader | heading | lines | button | note |
  |---|---|---|---|---|---|
  | codeEmail | `Your code expires in 15 minutes` | `Your sign-up code` | `Enter this code to finish signing up. It expires in 15 minutes.` + `code` | — | `Didn't ask for it? Ignore this email.` |
  | inviteEmail | `{inviter} invited you to {workspace}` | `Join {workspace} on Cloworks` | `{inviter} invited you to join {workspace} as {role}.` (no link: append line `Ask {inviter} for the invite link.`) | `Accept invite` | `This invite expires on {date}.` |
  | approvedEmail | `{workspace} approved your request` | `You're in` | `{workspace} approved your request to join.` (no link: add `Sign in to Cloworks to get started.`) | `Sign in` | — |
  | alreadyHaveAccountEmail | `Sign in with your existing account` | `You already have an account` | `This email already has a Cloworks account.` (no link: add `Sign in to Cloworks with this email.`) | `Sign in` | `Can't sign in? Contact your admin. Not you? Ignore this email.` |
  | resetEmail | `The link works for one hour` | `Reset your password` | `Someone asked to reset the password for this email. The link works for one hour.` (no link: replace with `The reset link could not be created. Ask your admin for help.`) | `Set new password` | `Didn't ask for this? Ignore this email. Your password stays the same.` |

  Keep `linkOf` as the gate for the button url.
- [ ] **Step 4: Run** `npx vitest run` — fix only assertions in the listed test files that checked old wording, changing them to the new copy (do not loosen them to `toBeDefined`). All pass.
- [ ] **Step 5: Commit** `feat(email): account emails use the branded layout`

---

### Task 4: Notification and join-request emails use the layout

**Files:**
- Modify: `src/lib/notify.ts` (inside `notifyWith`, where `subject`/`text` are built, ~line 80-95)
- Modify: `src/lib/joinRequests.ts` (`notifyJoinRequest`, ~line 167-195)
- Test: `tests/notify.test.ts`, `tests/joinRequests.test.ts`

**Interfaces:**
- Consumes: `renderEmail` (Task 2), `Mailer.send` with `html` (Task 1).

- [ ] **Step 1: Write failing tests:**
  - notify: `"emails a branded html part with an Open request button"` → with `baseUrl: "https://t.example.com"`, `sent[0].html` contains heading `Assigned to you`, the message, `Open request`, `href="https://t.example.com/requests/{reqId}"`; `sent[0].text` still contains the request link.
  - notify: headings `You were mentioned` (MENTION) and `Design ready for review` (DESIGN_SENT).
  - notify: hostile title — notification for `evilId` (title `Hi\r\nBcc: …`) and a message containing `"><img src=x onerror=alert(1)>` → html contains `&lt;img` and not `<img src=x`.
  - notify: a 300-char title still yields subject length ≤ 160 (existing test) and the html contains the full message as passed.
  - joinRequests: admin email html contains heading `New request to join`, `Review request`, `href="{base}/admin/users?tab=requests"`.
  - Update the recorder type in `tests/notify.test.ts` to `{ to; subject; text; html? }`.
- [ ] **Step 2: Run** `npx vitest run tests/notify.test.ts tests/joinRequests.test.ts` — FAIL.
- [ ] **Step 3: Implement:** in `notifyWith` build `const mail = renderEmail({ preheader: message, heading: HEADINGS[input.type], lines: [message], button: base ? { label: "Open request", url: `${base}/requests/${encodeURIComponent(input.requestId)}` } : undefined }, { baseUrl: base ?? undefined })` and send `{ to, subject, ...mail }`. Add `const HEADINGS: Partial<Record<NotificationType, string>> = { ASSIGNED: "Assigned to you", MENTION: "You were mentioned", DESIGN_SENT: "Design ready for review" }`, falling back to `SUBJECTS[type]`. Same pattern in `notifyJoinRequest`: preheader `{who} asked to join {ws.name}`, heading `New request to join`, line = existing `message` reworded to `{who} ({email}) asked to join {ws.name}.`, button `Review request`.
- [ ] **Step 4: Run** `npx vitest run` — all pass; `npx eslint src/lib` — clean.
- [ ] **Step 5: Commit** `feat(email): notification and join-request emails use the branded layout`

---

### Task 5: Preview script and real-inbox check

**Files:**
- Create: `scripts/preview-emails.local.mts` (untracked, like other `.local` scripts)

- [ ] **Step 1: Write the script:** sets `APP_BASE_URL=https://clowork.my.id`, renders all seven emails with sample data (Lia / Clogent / "Ramadan poster" / code 482913), writes `<name>.html` and `<name>.txt` into a directory given as argv[2] (default: the session scratchpad), prints the paths.
- [ ] **Step 2: Run** `npx tsx scripts/preview-emails.local.mts <scratchpad>/emails` — seven `.html` files listed. Open each in the browser pane; screenshot reset and invite for the user.
- [ ] **Step 3: Real send:** with local `.env`, send the rendered reset email to `wira.budi@clogent.co.id` via `createMailerFromEnv().send(...)`; expect HTTP 200 / no throw. Ask the user to check Gmail desktop and phone. For mail-tester.com, the user opens the site and pastes the one-off test address it shows; send the same rendered reset email to that address (a test address, not an account, so "Forgot password" can't be used). Target ≥ 9/10.
- [ ] **Step 4: Full verification:** `npx vitest run` (all pass), `npx tsc --noEmit -p . 2>&1 | grep -v "\.local\."` (empty), `npx eslint src tests` (clean).
- [ ] **Step 5:** Hand the user `bash scripts/deploy-prod.local.sh` to deploy. No commit needed for the untracked script.
