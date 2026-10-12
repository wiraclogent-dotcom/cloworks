# Content Plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar's disabled "Integrations" item with Content Plan: an Instagram-style phone preview per brand channel where creative/social staff draft posts (media, brief, caption, date), leads approve, and approval creates a normal Request.

**Architecture:** Pure rule modules in `src/lib/content/` (permissions, workflow, order, approve defaults) with `…With(db, user, …)` cores like `src/lib/library.ts`, thin server actions in `src/app/(app)/content/actions.ts`, and a new shared Cloudinary layer in `src/lib/media/` that is the only code talking to Cloudinary (plain `fetch` + `node:crypto`, no SDK). Request status changes keep the linked post in step from inside `transitionRequestWith`'s transaction.

**Tech Stack:** Next.js 16 (server actions, `after()`), Prisma 6 + Postgres, Vitest + embedded-postgres (`tests/helpers/testDb.ts`), `@dnd-kit/core`, Cloudinary REST (upload + Admin API), Resend via `src/lib/mailer.ts`.

**Spec:** `docs/superpowers/specs/2026-10-12-content-plan-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (AGENTS.md).
- Every new model is workspace-scoped: `workspaceId String @default(dbgenerated())`, relation to `Workspace`, `@@index([workspaceId])`; always query through `dbFor(user)` / `ScopedDb`.
- Server actions return result objects (`{ ok: true, … } | { ok: false, code, message, fieldErrors? }`), never throw to the client; wrap with `withUser(requireUser, …, unauthResult)` like `src/app/(app)/library/actions.ts`.
- Drafters: `appRole ∈ {CREATIVE, LEAD, ADMIN}` or `jobRole === "SOCIAL_MEDIA"`. Approvers and channel managers: `appRole ∈ {LEAD, ADMIN}`. Viewers: any signed-in member.
- Editable statuses: `IDEA`, `DRAFT`, `CHANGES_REQUESTED`. Locked: `SUBMITTED`, `APPROVED`, `IN_PRODUCTION`, `DONE`. Comments allowed in every status. Delete only before `APPROVED`.
- Submit requires a non-empty brief and `plannedAt`. Send back requires a non-empty feedback note.
- Cloudinary folder: `clowork/<workspaceId>/<purpose>/`; allowed formats `jpg,png,webp,heic,mp4,mov`; video incoming transformation `c_limit,w_1280,h_1280,q_auto`; limits image ≤ 10 MB, video ≤ 100 MB and ≤ 90 s.
- URL presets (fixed set, all with `f_auto,q_auto`): `avatar-64` `c_fill,w_64,h_64`; `grid-3x4` `c_fill,ar_3:4,w_360`; `reel-9x16` `c_fill,ar_9:16,w_360`; `story-9x16` `c_fill,ar_9:16,w_540`; `panel` `c_limit,w_900`; `full` `c_limit,w_2048`; `poster` = video first frame as `jpg` with `c_fill,ar_3:4,w_360`.
- Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — missing = warning in `validateEnv`, uploads disabled in the UI.
- Approve defaults: deadline = `plannedAt` − 3 days (Jakarta date), never before today; outputs = MOCKUP image count for CAROUSEL else 1; needsMotion = `format === "VIDEO" || surface === "REEL"`; title `<Brand> · <Feed|Reel|Story> · <first brief line ≤ 80 chars>`; requester = post author.
- Copy is English. Sidebar label "Content Plan", icon lucide `LayoutGrid`, route `/content`.

## Review Focus

1. **Double approve** (two leads, or double-click) → exactly one Request; the second gets CONFLICT. Test in Task 8.
2. **A user editing a post another tab already submitted** → the save is rejected with a "locked" message, not silently applied. Test in Task 6.
3. **Forged media registration** (a `publicId` outside the caller's workspace folder, or an oversized file whose client-reported size is small) → rejected; sizes come from the Admin API. Test in Task 4.
4. **Request cancelled after approval** → post returns to DRAFT with `requestId` cleared and can be resubmitted and approved again into a fresh request. Test in Task 9.
5. **Tiles without dates or with equal dates** → no false ⚠ badges; undated tiles are never "out of order". Test in Task 3.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261012120000_content_plan/migration.sql` (generated)
- Test: `tests/contentSchema.test.ts`

**Interfaces:**
- Produces: models `Media`, `SocialChannel`, `ContentPost`, `ContentPostMedia`, `ContentComment`; enums `MediaType`, `SocialPlatform`, `ContentSurface`, `ContentKind`, `ContentFormat`, `ContentStatus`, `ContentMediaRole`; `Notification.contentPostId String?` (Cascade). Exactly as in the spec's "Data model" section, plus back-relations on `User`, `Brand`, `RequestType`, `Request` (`contentPost ContentPost?`), `Workspace`.

- [ ] **Step 1: Write the failing test** — `tests/contentSchema.test.ts` with `createTestDb()`:
  - `it("stamps the workspace on channel, post, media")` → each created row's `workspaceId === db.workspaceId`.
  - `it("allows only one post per request")` → second post with the same `requestId` rejects (`P2002`).
  - `it("clears requestId when the request is deleted")` → `requestId` becomes `null`, post remains.
  - `it("deletes post media links and comments with the post")`.
- [ ] **Step 2: Run** `npx vitest run tests/contentSchema.test.ts` → FAIL (unknown model).
- [ ] **Step 3: Edit the schema and generate the migration** with `npx prisma migrate dev --name content_plan --create-only`, review the SQL (no default on `workspaceId`, matching earlier migrations), then `npx prisma generate`.
- [ ] **Step 4: Run** the test → PASS; `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `feat(content): schema for channels, posts, media`.

### Task 2: Permissions and workflow rules (pure)

**Files:**
- Create: `src/lib/content/permissions.ts`, `src/lib/content/workflow.ts`
- Test: `tests/contentRules.test.ts`

**Interfaces:**
- Produces:
  - `type ContentActor = { id: string; appRole: AppRole; jobRole: JobRole }`
  - `canDraftContent(u: ContentActor): boolean`, `canApproveContent(u): boolean`, `canManageChannels(u): boolean`
  - `isEditable(s: ContentStatus): boolean`, `canDelete(s: ContentStatus): boolean`
  - `type ContentEvent = "save" | "submit" | "sendBack" | "approve" | "requestStarted" | "requestDone" | "requestReopened" | "requestCancelled"`
  - `nextStatus(from: ContentStatus, ev: ContentEvent, opts?: { hasContent?: boolean }): ContentStatus | null` (null = not allowed)

- [ ] **Step 1: Write the failing tests:**
  - Table test over all 4 appRoles × 3 jobRoles: draft true for CREATIVE/LEAD/ADMIN any job, and REQUESTER only with SOCIAL_MEDIA; approve true only LEAD/ADMIN.
  - `nextStatus("IDEA","save",{hasContent:true})==="DRAFT"`, `nextStatus("IDEA","save",{hasContent:false})==="IDEA"`, `nextStatus("DRAFT","submit")==="SUBMITTED"`, `nextStatus("CHANGES_REQUESTED","submit")==="SUBMITTED"`, `nextStatus("SUBMITTED","sendBack")==="CHANGES_REQUESTED"`, `nextStatus("SUBMITTED","approve")==="APPROVED"`, `nextStatus("APPROVED","requestStarted")==="IN_PRODUCTION"`, `nextStatus("APPROVED","requestDone")==="DONE"`, `nextStatus("IN_PRODUCTION","requestDone")==="DONE"`, `nextStatus("DONE","requestReopened")==="IN_PRODUCTION"`, `nextStatus("IN_PRODUCTION","requestCancelled")==="DRAFT"`.
  - Rejections: `nextStatus("DRAFT","approve")===null`, `nextStatus("SUBMITTED","save")===null`, `nextStatus("IDEA","submit")===null`.
  - `isEditable` true exactly for IDEA/DRAFT/CHANGES_REQUESTED; `canDelete` true for IDEA/DRAFT/CHANGES_REQUESTED/SUBMITTED.
- [ ] **Step 2: Run** `npx vitest run tests/contentRules.test.ts` → FAIL.
- [ ] **Step 3: Implement** as an edge table like `src/lib/workflow.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): permission and status rules`.

### Task 3: Ordering and date check (pure)

**Files:**
- Create: `src/lib/content/order.ts`
- Test: `tests/contentOrder.test.ts`

**Interfaces:**
- Produces:
  - `positionBetween(above: number | null, below: number | null): number` — top of list = highest position; `(null,null)→0`, `(null,b)→b+1`, `(a,null)→a-1`, else midpoint.
  - `needsRenumber(above: number | null, below: number | null): boolean` — true when both set and `|above-below| < 1e-6`.
  - `renumber(ids: string[]): { id: string; position: number }[]` — top→bottom gets `n-1 … 0`.
  - `outOfOrder(tiles: { id: string; plannedAt: Date | null }[]): Set<string>` — input top→bottom; a dated tile is flagged when its date is **later** than the nearest dated tile above it (equal dates are fine; undated never flagged).
  - `suggestDate(tiles, id): string | null` — Jakarta `YYYY-MM-DD`: midpoint day between nearest dated neighbours (rounded down); only a tile above → that date − 1 day; only below → that date + 1 day; none → null.

- [ ] **Step 1: Write the failing tests** for each case listed above, including Review Focus #5: `[{a,null},{b,"2026-10-20"},{c,"2026-10-20"},{d,null},{e,"2026-10-18"}]` → flagged set is empty; `[{a,"2026-10-18"},{b,"2026-10-20"}]` → `{b}`; `suggestDate` for b in `[{a,"2026-10-24"},{b,"2026-10-30"},{c,"2026-10-20"}]` → `"2026-10-22"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `jakartaDate` from `src/lib/createRequest.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): manual order and out-of-order date check`.

### Task 4: Cloudinary media layer

**Files:**
- Create: `src/lib/media/config.ts`, `src/lib/media/url.ts`, `src/lib/media/sign.ts`, `src/lib/media/client.ts`, `src/lib/media/register.ts`, `src/lib/media/destroy.ts`
- Modify: `src/lib/env.ts` (warning when any `CLOUDINARY_*` is missing), `.env.example`
- Test: `tests/media.test.ts`, extend `tests/env.test.ts`

**Interfaces:**
- Produces:
  - `type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string }`; `cloudinaryConfig(env = process.env): CloudinaryConfig | null`
  - `type MediaPreset = "avatar-64" | "grid-3x4" | "reel-9x16" | "story-9x16" | "panel" | "full" | "poster"`
  - `mediaUrl(m: { publicId: string; type: MediaType }, preset: MediaPreset, cloudName: string): string` → `https://res.cloudinary.com/<cloud>/<image|video>/upload/<transform>/<publicId>` (`poster` → `video/upload/<t>/so_0/<publicId>.jpg`)
  - `type MediaPurpose = "content" | "avatar"`
  - `signUpload(cfg, workspaceId: string, purpose: MediaPurpose, kind: "image" | "video", now = Date.now()): { cloudName; apiKey; timestamp; signature; folder; publicId; uploadUrl; params: Record<string,string> }` — signature = SHA-1 hex of the alphabetically sorted `k=v&…` of signed params + secret (Cloudinary's scheme); `publicId` = fresh cuid-like id.
  - `interface CloudinaryClient { getResource(publicId: string, type: MediaType): Promise<{ bytes: number; width: number; height: number; duration?: number; format: string } | null>; destroy(publicId: string, type: MediaType): Promise<void> }`; `cloudinaryClient(cfg): CloudinaryClient` (Admin API via `fetch` with basic auth).
  - `class MediaError extends Error { code: "NOT_CONFIGURED" | "INVALID" | "TOO_LARGE" | "NOT_FOUND" }`
  - `registerMediaWith(db: ScopedDb, client: CloudinaryClient, user: { id: string; workspaceId: string }, input: { publicId: string; type: MediaType }): Promise<Media>`
  - `destroyMediaWith(db: ScopedDb, client: CloudinaryClient, mediaId: string): Promise<void>` — best effort on the Cloudinary call (log, still delete the row).

- [ ] **Step 1: Write the failing tests** (fake `CloudinaryClient` object, no network):
  - `mediaUrl` exact strings for `grid-3x4` image and `poster` video.
  - `signUpload` with fixed secret/timestamp equals a precomputed SHA-1; `params.folder === "clowork/<ws>/content"`; video params include `eager`/incoming transformation string from Global Constraints.
  - `registerMediaWith`: rejects `publicId` not starting with `clowork/<user.workspaceId>/` (INVALID) — Review Focus #3; rejects when fake reports image `bytes = 10*1024*1024+1` (TOO_LARGE) even if input claims small; rejects video `duration = 91`; NOT_FOUND when fake returns null; happy path stores width/height/bytes from the fake.
  - `destroyMediaWith` deletes the row even when the fake `destroy` throws.
  - `validateEnv` reports a warning (not error) when `CLOUDINARY_API_SECRET` is missing.
- [ ] **Step 2: Run** `npx vitest run tests/media.test.ts tests/env.test.ts` → FAIL.
- [ ] **Step 3: Implement** the modules.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(media): Cloudinary signing, registration, urls`.

### Task 5: Channels

**Files:**
- Create: `src/lib/content/channels.ts`, `src/app/(app)/content/actions.ts` (channel actions + `requestUploadSignature`, `registerUpload`)
- Test: `tests/contentChannels.test.ts`

**Interfaces:**
- Consumes: `canManageChannels`, `canDraftContent` (Task 2); `positionBetween` (Task 3); `signUpload`, `registerMediaWith` (Task 4).
- Produces:
  - `class ContentError extends Error { code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "LOCKED" | "CONFLICT"; fieldErrors?: Record<string,string> }` (used by all content cores)
  - `type ChannelInput = { brandId: string; handle: string; displayName: string; bio?: string; avatarMediaId?: string | null }`
  - `createChannelWith(db, user: ContentActor, input): Promise<{ id: string }>`; `updateChannelWith(db, user, id, input)`; `moveChannelWith(db, user, id, aboveId: string | null, belowId: string | null)`; `deleteChannelWith(db, user, id)` — INVALID when any post has status APPROVED or later.
  - Handle normalised: trim, strip leading `@`, lowercase; must match `/^[a-z0-9._]{1,30}$/`.
  - Actions: `createChannel`, `updateChannel`, `moveChannel`, `deleteChannel`, `requestUploadSignature(purpose, kind)` (drafters for `content`; the user themselves for `avatar` is out of scope — allow only `content` now), `registerUpload(publicId, type)`.

- [ ] **Step 1: Write the failing tests:** CREATIVE creating a channel → FORBIDDEN; LEAD creates `@BrandX ` → stored handle `brandx`; duplicate handle → INVALID with `fieldErrors.handle`; delete blocked when a post is APPROVED; brand from another workspace (create via `db.raw`) → NOT_FOUND.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the core and the actions (actions revalidate `/content`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): channels`.

### Task 6: Posts — drafting, ordering, submit, send back, comments

**Files:**
- Create: `src/lib/content/posts.ts`
- Modify: `src/app/(app)/content/actions.ts`
- Test: `tests/contentPosts.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `createPostWith(db, user, input: { channelId: string; surface: ContentSurface; kind: ContentKind; publishedAt?: string }): Promise<{ id: string }>` — PLANNED goes to the top of its tab (`positionBetween(null, topPosition)`), status IDEA; PUBLISHED requires `publishedAt`.
  - `type PostPatch = Partial<{ format: ContentFormat; plannedAt: string | null; typeId: string | null; brief: string; caption: string }>`
  - `updatePostWith(db, user, id, patch): Promise<{ status: ContentStatus }>` — LOCKED if `!isEditable`; applies `nextStatus(…,"save",{hasContent})` where hasContent = brief non-empty or ≥ 1 media.
  - `setPostMediaWith(db, user, id, media: { mediaId: string; role: ContentMediaRole }[])` — replaces MOCKUP list in order (LOCKED if not editable); FINAL media may be added when status is IN_PRODUCTION or DONE. Removed media → `destroyMediaWith` via `after()`.
  - `movePostWith(db, user, id, aboveId: string | null, belowId: string | null)` — only editable PLANNED posts, same tab; renumbers when `needsRenumber`.
  - `deletePostWith(db, user, id)` — author or approver; only when `canDelete`.
  - `submitPostWith(db, user, id)` — INVALID with `fieldErrors.brief` / `fieldErrors.plannedAt` when missing; sets `submittedAt`. Compare-and-set on status (`updateMany where status in editable`) so a stale tab cannot submit twice.
  - `sendBackPostWith(db, user, id, note: string)` — approver only; creates `ContentComment { isFeedback: true }`.
  - `addContentCommentWith(db, user, id, body: string): Promise<{ id: string; mentionedUserIds: string[] }>` — any member; mentions via `src/lib/mentions.ts`.
  - Actions for each, same result shape as the library actions.

- [ ] **Step 1: Write the failing tests:** REQUESTER (jobRole OTHER) create → FORBIDDEN, REQUESTER + SOCIAL_MEDIA → ok; first save with brief turns IDEA→DRAFT; submit without date → INVALID `plannedAt`; **update after submit → LOCKED (Review Focus #2)**; CREATIVE send back → FORBIDDEN; LEAD send back with empty note → INVALID, with note → CHANGES_REQUESTED + feedback comment, then update works again; move puts post between two others (position strictly between); move of a SUBMITTED post → LOCKED; delete of an APPROVED post → INVALID.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): drafting, ordering, submit and send back`.

### Task 7: Reusable request insert

**Files:**
- Modify: `src/lib/createRequest.ts`
- Test: `tests/createRequest.test.ts` (existing must stay green; add cases)

**Interfaces:**
- Produces:
  - `validateRequestInput(db: PrismaClient | Prisma.TransactionClient, input: CreateRequestInput, now: Date): Promise<ValidRequest>` — everything `createRequestWith` checks today except the permission check; throws `CreateRequestError("VALIDATION")`.
  - `type ValidRequest` — the validated values `createRequestWith` currently inserts (title, briefUrl, notes, brandId, divisionId, typeId, assigneeId, deadline Date|null, needsMotion, fields).
  - `insertRequestTx(tx: Prisma.TransactionClient, v: ValidRequest, opts: { requesterId: string; actorId: string; outputCount?: number; now: Date }): Promise<{ id: string }>` — request + first `StatusEvent` (actor = `actorId`).
  - `createRequestWith` keeps its signature and behaviour, now composed of the two.

- [ ] **Step 1: Add failing tests:** `insertRequestTx` with `requesterId` ≠ `actorId` stores the requester and the StatusEvent actor separately; `outputCount: 3` stored.
- [ ] **Step 2: Run** `npx vitest run tests/createRequest.test.ts` → new cases FAIL, old PASS.
- [ ] **Step 3: Refactor.**
- [ ] **Step 4: Run** → all PASS.
- [ ] **Step 5: Commit** `refactor(requests): reusable validation and insert`.

### Task 8: Approve → Request

**Files:**
- Create: `src/lib/content/approve.ts`
- Modify: `src/app/(app)/content/actions.ts`
- Test: `tests/contentApprove.test.ts`

**Interfaces:**
- Consumes: Task 7; `mediaUrl` (Task 4); `nextStatus` (Task 2).
- Produces:
  - `approveDefaults(post: { surface; format; brief: string | null; plannedAt: Date | null; mockupImageCount: number; typeId: string | null }, brandName: string, now: Date): { title: string; deadline: string | null; outputCount: number; needsMotion: boolean; typeId: string | null }` (pure; values in Global Constraints).
  - `loadApproveForm(db, user, postId): Promise<ApproveFormData>` — defaults + division (author's most recent request's division, else first by name) + type `fieldSchema` + creative team list.
  - `type ApproveInput = Omit<CreateRequestInput, "brandId" | "briefUrl" | "notes"> & { outputCount: number }`
  - `approveContentPostWith(db, user, postId, input: ApproveInput, now = new Date()): Promise<{ requestId: string }>` — one `$transaction`: re-read post (CONFLICT unless SUBMITTED and `requestId` null); `validateRequestInput` with brand from the channel and notes = brief + `\n\nCaption draft:\n` + caption when present; `insertRequestTx` with `requesterId = post.authorId`, `actorId = user.id`; one `Attachment` per MOCKUP media in order (`name: mockup-<n>.<jpg|mp4>`, `url: mediaUrl(m,"full")` for images / original video url, `uploaderId: authorId`); update post via `updateMany where { id, status: "SUBMITTED", requestId: null }` and CONFLICT if count ≠ 1.

- [ ] **Step 1: Write the failing tests:** `approveDefaults` — deadline `2026-10-21` for plannedAt `2026-10-24`, clamps to today when plannedAt is in 2 days, outputs 3 for a 3-image carousel, needsMotion true for REEL, title truncation at 80 chars; integration — LEAD approves: request exists, `requesterId === author`, 2 attachments for 2 mock-ups, post APPROVED with `requestId`; **`Promise.all` of two approvals → one success, one CONFLICT, exactly one request (Review Focus #1)**; CREATIVE approve → FORBIDDEN; invalid division → VALIDATION with field errors and nothing written.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; the action notifies (Task 10 hook point — call `notifyContent` once Task 10 lands; until then leave the `after()` call out).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): approve creates the request`.

### Task 9: Keep post in step with its request

**Files:**
- Create: `src/lib/content/sync.ts`
- Modify: `src/lib/transition.ts` (call inside the existing `$transaction`, after the `statusEvent.create`)
- Test: `tests/contentSync.test.ts`

**Interfaces:**
- Produces: `syncContentPostForRequest(tx: Prisma.TransactionClient, requestId: string, to: RequestStatus, now: Date): Promise<{ postId: string; authorId: string; cancelled: boolean } | null>` — maps ON_PROGRESS→`requestStarted` (and DONE→ON_PROGRESS → `requestReopened`), DONE→`requestDone` (sets `doneAt`), CANCELLED→`requestCancelled` (clears `requestId`, `approvedById`, `approvedAt`); REQUESTED and FIRST_LOOK change nothing. `transitionRequestWith` returns unchanged; when `cancelled`, it notifies the author (Task 10).

- [ ] **Step 1: Write the failing tests** using an approved post from Task 8's helper: ON_PROGRESS → IN_PRODUCTION; FIRST_LOOK → unchanged; DONE → DONE with `doneAt`; DONE→ON_PROGRESS → IN_PRODUCTION; **CANCELLED → DRAFT, `requestId` null, then submit + approve again creates a second, different request (Review Focus #4)**; a request with no post → unaffected and existing `tests/lifecycle.test.ts` stays green.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/contentSync.test.ts tests/lifecycle.test.ts tests/transition*.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(content): request status drives the post`.

### Task 10: Notifications

**Files:**
- Create: `src/lib/content/notify.ts`
- Modify: `src/lib/notificationLinks.ts`, `src/app/(app)/content/actions.ts`, `src/lib/transition.ts`, wherever the bell reads notifications (pass `contentPostId` through to `notificationHref`)
- Test: `tests/contentNotify.test.ts`, extend `tests/notificationLinks*.test.ts` (or the file that covers `notificationHref`)

**Interfaces:**
- Produces:
  - `CONTENT_NOTIFICATION = "CONTENT"`
  - `type ContentNotice = { kind: "submitted" | "sentBack" | "approved" | "cancelled" | "comment"; postId: string; actorId: string; userIds?: string[] }`
  - `notifyContentWith(db: ScopedDb, mailer: Mailer, n: ContentNotice, opts?: { baseUrl?: string }): Promise<void>` — never throws. Recipients: submitted → active LEAD/ADMIN except actor; sentBack/approved/cancelled → author; comment → `userIds`. Email only for sentBack and approved, rendered with `renderEmail` (`src/lib/emailLayout.ts`), button "Open post" → `<base>/content?post=<id>`. Messages: `"<actor> submitted “<title>” for approval"`, `"<actor> sent back “<title>”: <note ≤ 120>"`, `"<actor> approved “<title>” — request created"`, `"The request for “<title>” was cancelled; the post is back in draft"`. `<title>` = first brief line ≤ 80 chars or `"Untitled post"`.
  - `notificationHref(n: { type: string; requestId: string | null; contentPostId?: string | null })` → `/content?post=<id>` when `contentPostId` is set and `requestId` is null.

- [ ] **Step 1: Write the failing tests** with a fake mailer: submitted → bell rows for both leads, no email; approved → one row and one email to the author with the "Open post" link; actor never notified; `notificationHref` for a content row.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, then wire calls via `after(() => bestEffort(...))` in the submit, send back, approve and comment actions and in `transitionRequestWith`'s post-commit block when `cancelled`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): notifications`.

### Task 11: Page — channel list and phone preview

**Files:**
- Create: `src/lib/content/view.ts` (loader), `src/app/(app)/content/page.tsx`, `src/components/content/ChannelList.tsx`, `src/components/content/PhonePreview.tsx`, `src/components/content/PostTile.tsx`, `src/components/content/ChannelForm.tsx`
- Modify: `src/components/AppShell.tsx` (replace the Integrations `DisabledNavItem` with `<NavItem href="/content" label="Content Plan" icon={<LayoutGrid aria-hidden="true" />} />`), `src/lib/nav.ts` (`"/content"` in `NAV_HREFS`)
- Test: `tests/contentView.test.ts`, `tests/contentPage.test.tsx`, extend `tests/nav.test.ts`

**Interfaces:**
- Consumes: `outOfOrder` (Task 3), `mediaUrl` (Task 4), permissions (Task 2).
- Produces:
  - `loadContentPlan(db, user, q: { channelId?: string; tab: "feed" | "reels" | "stories" }): Promise<ContentPlanView>` where `ContentPlanView = { channels: { id; brandName; handle; displayName; avatarUrl: string | null; awaiting: number }[]; channel: … | null; planned: TileView[]; published: TileView[]; can: { draft: boolean; approve: boolean; manageChannels: boolean }; mediaReady: boolean }` and `TileView = { id; status; plannedAt: string | null; format; coverUrl: string | null; warn: boolean }`. Planned sorted by `position` desc; published by `publishedAt` desc; cover = first FINAL, else first MOCKUP, else null; `coverUrl` preset by tab (`grid-3x4` / `reel-9x16` / `story-9x16`, `poster` for video).
  - URL params `channel`, `tab`, `post` (read in `page.tsx`; read the Next 16 docs for `searchParams` being async).

- [ ] **Step 1: Write the failing tests:** loader ordering and cover choice, `warn` set from `outOfOrder`, `awaiting` counts SUBMITTED only, REQUESTER sees `can.draft === false`; render test: page shows the channel list, profile header with `@handle`, three tabs, the "already posted" divider, badge text per status, and no "+" tile for a REQUESTER; empty state copy "Add your first channel" (LEAD) / "No channels yet" (others); nav test: `/content` active for `/content?channel=x`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Layout per approved mock-up B: left channel list (collapses to a `<select>` below 1024px), centre phone frame ~390px with 3-column grid (Stories: horizontal row), tiles link to `?post=<id>` keeping other params.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): Content Plan page with phone preview`.

### Task 12: Side panel, uploads and drag reorder

**Files:**
- Create: `src/components/media/MediaUpload.tsx`, `src/components/content/PostPanel.tsx`, `src/components/content/ApproveForm.tsx`, `src/components/content/useGridDnd.ts`
- Modify: `src/components/content/PhonePreview.tsx`
- Test: `tests/contentPanel.test.tsx`, `tests/mediaUpload.test.tsx`

**Interfaces:**
- Consumes: actions from Tasks 5, 6, 8, 10; `loadApproveForm` (Task 8).
- Produces: `<MediaUpload purpose="content" accept="image|video|both" onUploaded={(media: { id: string; url: string }) => void} disabled?: boolean />` — client size/type check with the Global Constraints limits, POST to Cloudinary `uploadUrl` with the signed params via `XMLHttpRequest` (progress), then `registerUpload`; shows retry on failure.

- [ ] **Step 1: Write the failing tests** (Testing Library, actions mocked):
  - Drafter on a DRAFT post: fields editable, typing calls `updatePost` once after the debounce (fake timers, 800 ms) and shows "Saved"; "Submit for approval" calls `submitPost`; field errors from the result render under the brief/date.
  - SUBMITTED post as CREATIVE: inputs read-only, "🔒 Locked" line, no Approve button; as LEAD: "Send back…" opens a note box (submit disabled while empty) and "Approve…" opens `ApproveForm` with the pre-filled title, deadline and outputs.
  - APPROVED post shows a link to `/requests/<id>`.
  - `MediaUpload` rejects an 11 MB image before any network call with "Images must be 10 MB or smaller".
  - Keyboard reorder: focusing a draggable tile and pressing Space, ArrowDown, Space calls `movePost` with the new neighbours (same pattern as `tests/boardA11y.test.ts`); SUBMITTED tiles have no drag handle.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Panel is a right column on ≥ 1024px and a full-screen sheet below; ⚠ badge button calls `updatePost({ plannedAt: suggestDate(...) })`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(content): post panel, uploads, drag reorder`.

### Task 13: End-to-end check and docs

**Files:**
- Modify: `.env.example`, `src/lib/help/` (one short "Content Plan" article if help articles list sidebar features — follow the existing article format)
- Test: full suite

- [ ] **Step 1: Run** `npm run typecheck && npm run lint && npm test` → all green.
- [ ] **Step 2: Manual run** with `preview_start` on the dev server and real Cloudinary test credentials in `.env.local`: create a channel, add an "already posted" tile, draft a carousel with 2 images, submit, approve as a lead, open the created request (2 attachments, author as requester), move it to On progress and Done → tile badge follows. Screenshot the phone preview.
- [ ] **Step 3: Commit** `docs(content): env and help`.
