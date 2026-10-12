# Branded HTML emails

Date: 2026-10-12 · Status: approved in chat, awaiting spec review

## Goal

Cloworks emails should look trustworthy and professional so people open them and spam filters don't flag them,
ready before the November 2026 launch. Today every email is one or two plain-text sentences with a bare link.

Sending is already authenticated (Resend, `noreply@mail.clowork.my.id`, DKIM + SPF + DMARC on `mail.clowork.my.id`),
so this work is about presentation and content, not delivery setup.

## Decisions

- **Look: "branded header" (option B).** Deep-blue (`#09426d`) header band with the logo and the word "Cloworks",
  white card on a warm grey page (`#f5f3ee`), aqua (`#11aa9f`) button, small grey footer. The header uses a solid
  background colour (no image background) so dark-mode inverting clients keep it legible.
- **Sender stays no-reply.** No Reply-To. Every email's footer says "Need help? Contact your workspace admin."
- **English only.**
- **No new dependencies, no hosted templates.** One hand-written layout function; table layout with inline styles.
- **Every email is multipart:** HTML plus a plain-text version built from the same content.
- **No decorative or generated images.** The only image is the logo.

## Architecture

### `src/lib/emailLayout.ts` (new)

```ts
type EmailContent = {
  preheader: string;          // hidden inbox preview line
  heading: string;
  lines: string[];            // 1-3 short paragraphs
  code?: string;              // large, copyable code (sign-up code email)
  button?: { label: string; url: string };
  note?: string;              // small grey line under the button
};
function renderEmail(c: EmailContent, opts?: { baseUrl?: string }): { html: string; text: string };
```

- Escapes every string placed in HTML (`& < > " '`). Request titles, names and workspace names are user content.
- The button renders only for an absolute `http(s)` URL; anything else (empty, relative, `javascript:`) drops it.
- `baseUrl` defaults to `process.env.APP_BASE_URL` (as `notifyWith` does), so the `joinEmails.ts` templates need no
  new parameter; tests pass it explicitly.
- The logo is `<img src="{baseUrl}/email/logo.png" alt="Cloworks" width="28" height="28">`, only when `baseUrl` is a
  safe http(s) origin (reuses `safeBaseUrl`); the white "Cloworks" wordmark text sits beside it either way, so a
  blocked or missing image still reads correctly.
- Footer, in both versions: "Need help? Contact your workspace admin." and "Cloworks · clowork.my.id" (host taken
  from `baseUrl` when set, omitted otherwise).
- Plain text: heading, blank line, lines, code, `{button label}: {url}`, note, then a `--` footer block.
- Layout: 600px max-width centred table, system font stack, no external CSS, no web fonts, no JavaScript.

### Mailer

`Mailer.send` gains an optional `html` field: `send({ to, subject, text, html? })`. `createMailerFromEnv` includes
`html` in the Resend JSON body only when present. Text-only callers keep working.

### Logo asset

`public/email/logo.png`: 56×56 PNG (2× for a 28px display) rendered from `src/app/icon.svg`. Gmail does not render SVG.

## Content per email

Subjects are unchanged. When a link can't be built, the button is dropped and today's fallback sentence is kept.

| Email (source) | Preheader | Heading | Lines | Button | Note |
|---|---|---|---|---|---|
| Sign-up code (`codeEmail`) | Your code expires in 15 minutes | Your sign-up code | "Enter this code to finish signing up. It expires in 15 minutes." + code block | none | Didn't ask for it? Ignore this email. |
| Invite (`inviteEmail`) | {inviter} invited you to {workspace} | Join {workspace} on Cloworks | "{inviter} invited you to join {workspace} as {role}." | Accept invite | This invite expires on {date}. |
| Approved (`approvedEmail`) | {workspace} approved your request | You're in | "{workspace} approved your request to join." | Sign in | — |
| Already have account (`alreadyHaveAccountEmail`) | Sign in with your existing account | You already have an account | "This email already has a Cloworks account." | Sign in | Can't sign in? Contact your admin. Not you? Ignore this email. |
| Password reset (`resetEmail`) | The link works for one hour | Reset your password | "Someone asked to reset the password for this email. The link works for one hour." | Set new password | Didn't ask for this? Ignore this email. Your password stays the same. |
| Notification (`notifyWith`; ASSIGNED, MENTION, DESIGN_SENT) | the message | Assigned to you / You were mentioned / Design ready for review | the existing message | Open request | — |
| Join request (`notifyJoinRequest` in `joinRequests.ts`) | {name} asked to join {workspace} | New request to join | "{name} ({email}) asked to join {workspace}." | Review request | — |

`joinEmails.ts`'s `Mail` type becomes `{ subject; text; html }`. Call sites spread it into `mailer.send` as today.
Notification headings for types that are not emailed (COMMENT, STATUS, DEADLINE, ATTACHMENT) are not needed.

## Testing

- `emailLayout`: escaping of every field; button only for http(s); no logo `<img>` without a safe base URL; text
  version contains heading, lines, code, full link and footer; footer present in HTML.
- Each template: heading, button label and link present in both versions; fallback without a link has no button.
- Mailer: `html` forwarded to Resend when set, absent otherwise.
- Existing tests asserting email text are updated to the new wording.
- Manual: `scripts/preview-emails.local.mts` writes all seven emails as HTML files to the scratch/tmp folder for a
  browser look; one real reset email to the owner's inbox (Gmail desktop and phone); a mail-tester.com run, target
  9/10 or better.

## Rollout

Commit, then the user runs `bash scripts/deploy-prod.local.sh`. No migrations, no new env vars.

## Out of scope

Per-user email preferences, digest emails, Indonesian translations, changes to which events are emailed.
