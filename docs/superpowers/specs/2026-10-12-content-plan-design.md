# Content Plan — design

**Date:** 2026-10-12
**Status:** Draft for review

## Goal

Replace the disabled **Integrations** placeholder in the sidebar ([AppShell.tsx](../../../src/components/AppShell.tsx))
with **Content Plan**: a visual planner that shows each brand's Instagram profile the way followers will see it —
profile header, Feed / Reels / Stories tabs, and a grid of upcoming posts on top of what is already published.

Clicking a tile opens a side panel where creative and social media staff upload mock-ups or references, write the
brief and caption, and set the format and post date. A lead approves the brief, and approval creates a normal
`Request`, so planning flows straight into the existing production workflow.

**Success:**
- Anyone in the workspace can open a brand's channel and see what is planned, in what order, and how far each post is.
- A drafter can go from idea to "submitted for approval" without leaving the panel.
- A lead approves in one short, pre-filled form and the work lands in Requests with the brief and images attached.
- When the request is done, the tile shows the final design, so the plan converges with reality.

This is sub-project **#1** of three. It also introduces the **shared media layer** (Cloudinary) that the later
sub-projects reuse:

1. **Media foundation + Content Plan v1** — this spec.
2. Profile photos move from `User.avatar` bytes to Cloudinary (separate spec).
3. Optional image uploads for request attachments and library covers (separate spec).

## Decisions

| Topic | Decision |
|---|---|
| Who drafts | `appRole` CREATIVE, LEAD or ADMIN, **or** `jobRole` SOCIAL_MEDIA (covers social staff whose account is REQUESTER). |
| Who approves | LEAD and ADMIN only. |
| Who views | Every active member of the workspace (read-only for non-drafters). |
| Platforms (v1) | Instagram only, with Feed, Reels and Stories tabs. TikTok later on the same model. |
| Channels | A brand has one or more channels (platform + handle + avatar + bio). Each channel has its own grid. |
| Published posts | Staff upload "already posted" tiles by hand (media + date only). Shown faded below the plan. No platform API. |
| Order vs date | Order is manual (drag). A tile whose date disagrees with its position shows a ⚠ badge; one click fixes the date. |
| Approval | Opens a pre-filled confirm form; the lead can change any field, then "Approve & create request". |
| Requester of the created request | The post's author (not the approving lead). |
| Media storage | Cloudinary, signed uploads only, one folder per workspace, `publicId` stored. |
| Media rule | Cloudinary is for media shown in the app. Working files (PSD, AI, raw footage, ZIP) stay as Drive links. |
| Layout | Phone preview in the middle: channel list left, phone frame centre, side panel right. |
| Editing lock | A post is read-only from SUBMITTED onward. Only "Send back" (lead) reopens it. |

**Out of scope (v1):** TikTok and other platforms, a calendar view, content-pillar tags, hashtags field, reading
real posts from the Instagram API, scheduling/auto-publishing, the 60-day media cleanup job (model supports it; ship
right after launch), moving avatars/attachments to Cloudinary (#2, #3), drafting by requesters.

## Data model (Prisma)

All models are workspace-scoped like every other model (`workspaceId String @default(dbgenerated())`, stamped by the
scoped client in `src/lib/db.ts`, `@@index([workspaceId])`).

```prisma
enum MediaType {
  IMAGE
  VIDEO
}

/// One file in Cloudinary. Shared by every feature that shows media (Content Plan now; avatars and attachments later).
model Media {
  id           String    @id @default(cuid())
  publicId     String    // Cloudinary public_id, e.g. clowork/<workspaceId>/content/<cuid>
  type         MediaType
  width        Int
  height       Int
  bytes        Int
  durationSec  Float?    // videos only
  uploadedById String
  createdAt    DateTime  @default(now())

  uploadedBy User @relation(fields: [uploadedById], references: [id])
  postLinks  ContentPostMedia[]
  channels   SocialChannel[]

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([workspaceId, publicId])
  @@index([workspaceId])
}

enum SocialPlatform {
  INSTAGRAM
}

model SocialChannel {
  id            String         @id @default(cuid())
  brandId       String
  platform      SocialPlatform
  handle        String         // without the "@"
  displayName   String
  bio           String?
  avatarMediaId String?
  position      Float          @default(0)
  createdAt     DateTime       @default(now())

  brand       Brand         @relation(fields: [brandId], references: [id])
  avatarMedia Media?        @relation(fields: [avatarMediaId], references: [id], onDelete: SetNull)
  posts       ContentPost[]

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([workspaceId, platform, handle])
  @@index([workspaceId])
}

enum ContentSurface {
  FEED
  REEL
  STORY
}

enum ContentKind {
  PLANNED
  PUBLISHED
}

enum ContentFormat {
  SINGLE
  CAROUSEL
  VIDEO
}

enum ContentStatus {
  IDEA
  DRAFT
  SUBMITTED
  CHANGES_REQUESTED
  APPROVED
  IN_PRODUCTION
  DONE
}

model ContentPost {
  id           String         @id @default(cuid())
  channelId    String
  surface      ContentSurface
  kind         ContentKind    @default(PLANNED)
  status       ContentStatus  @default(IDEA)   // ignored for PUBLISHED
  position     Float                           // manual order within (channel, surface, kind); higher = nearer the top
  plannedAt    DateTime?
  publishedAt  DateTime?                       // PUBLISHED only
  format       ContentFormat  @default(SINGLE)
  caption      String?
  brief        String?
  typeId       String?                         // suggested request type
  authorId     String
  submittedAt  DateTime?
  approvedById String?
  approvedAt   DateTime?
  doneAt       DateTime?                       // used by the later cleanup job
  requestId    String?        @unique
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  channel    SocialChannel      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  type       RequestType?       @relation(fields: [typeId], references: [id])
  author     User               @relation("ContentPostAuthor", fields: [authorId], references: [id])
  approvedBy User?              @relation("ContentPostApprover", fields: [approvedById], references: [id])
  request    Request?           @relation(fields: [requestId], references: [id], onDelete: SetNull)
  media      ContentPostMedia[]
  comments   ContentComment[]

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([channelId, surface, kind, position])
  @@index([status])
  @@index([workspaceId])
}

enum ContentMediaRole {
  MOCKUP
  FINAL
}

model ContentPostMedia {
  id      String           @id @default(cuid())
  postId  String
  mediaId String
  role    ContentMediaRole @default(MOCKUP)
  order   Int              @default(0)

  post  ContentPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  media Media       @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([postId, mediaId])
  @@index([postId, role, order])
  @@index([workspaceId])
}

model ContentComment {
  id         String   @id @default(cuid())
  postId     String
  authorId   String
  body       String
  isFeedback Boolean  @default(false)   // true = the lead's "Send back" note
  createdAt  DateTime @default(now())

  post   ContentPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User        @relation(fields: [authorId], references: [id])

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([postId, createdAt])
  @@index([workspaceId])
}
```

Back-relations are added on `User` (authored/approved posts, comments, uploaded media), `Brand` (channels),
`RequestType`, `Request` (`contentPost ContentPost?`) and `Workspace`.

`Notification` gains an optional `contentPostId String?` (relation `onDelete: Cascade`) so content notifications link
to the post; `notificationHref` in `src/lib/notificationLinks.ts` routes it to `/content?post=<id>`.

## Status workflow

```
IDEA ──► DRAFT ──► SUBMITTED ──► APPROVED ──► IN_PRODUCTION ──► DONE
  ▲        ▲          │              (request created)     ▲       │
  │        └── CHANGES_REQUESTED ◄───┘ (send back)         └───────┘ (request reopened)
```

| From → To | Who | How |
|---|---|---|
| IDEA → DRAFT | drafter | automatic on first save that has a brief or media |
| DRAFT / CHANGES_REQUESTED → SUBMITTED | drafter | "Submit for approval" (needs brief and planned date) |
| SUBMITTED → CHANGES_REQUESTED | LEAD/ADMIN | "Send back…" with a required feedback note (`ContentComment.isFeedback`) |
| SUBMITTED → APPROVED | LEAD/ADMIN | "Approve & create request" (one transaction) |
| APPROVED → IN_PRODUCTION | system | linked request moves to ON_PROGRESS |
| IN_PRODUCTION / APPROVED → DONE | system | linked request moves to DONE |
| DONE → IN_PRODUCTION | system | linked request reopened (DONE → ON_PROGRESS) |
| any linked → DRAFT | system | linked request CANCELLED: `requestId` cleared, status DRAFT, author notified |

Editable fields are locked in SUBMITTED, APPROVED, IN_PRODUCTION and DONE. Comments stay open in every status.
Deleting a post is allowed only before APPROVED (author or LEAD/ADMIN).

The transition table lives in `src/lib/content/workflow.ts` (pure, like `src/lib/workflow.ts`).

## Permissions

Role checks are pure functions in `src/lib/content/permissions.ts`, enforced in every server action (never only in
the UI):

- `canDraftContent(user)` → `appRole ∈ {CREATIVE, LEAD, ADMIN} || jobRole === SOCIAL_MEDIA`
- `canApproveContent(user)` → `appRole ∈ {LEAD, ADMIN}`
- `canManageChannels(user)` → `appRole ∈ {LEAD, ADMIN}` (create/edit/reorder channels)
- Viewing: any signed-in, active workspace member.

`jobRole` is not part of `can()` today (role-only), so these live beside it rather than as new `ACTIONS`.
`SessionUser` already carries `jobRole` (`src/lib/session-core.ts`).

## Media layer (Cloudinary)

New module `src/lib/media/`. It is the **only** code that talks to Cloudinary.

- `cloudinary.ts` — config from env (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`), added
  to `validateEnv` in `src/lib/env.ts` as a warning when missing (feature shows "media storage not configured").
- `sign.ts` — `signUpload(user, purpose)` returns `{ timestamp, signature, apiKey, cloudName, folder, publicId }`
  for a direct browser upload. Folder: `clowork/<workspaceId>/<purpose>/`. Signed parameters fix the folder,
  `public_id`, allowed formats (`jpg,png,webp,heic,mp4,mov`), and an incoming transformation for video
  (`c_limit,w_1280,h_1280,q_auto` → store ~720p, not the raw file). Signatures expire with Cloudinary's 1-hour rule.
- `register.ts` — `registerMedia(db, user, uploadResult)`: re-fetches the asset by `publicId` from the Admin API
  (never trusts client-sent sizes), checks it is inside the workspace folder and within limits
  (image ≤ 10 MB, video ≤ 100 MB / ≤ 90 s), then creates the `Media` row.
- `url.ts` — `mediaUrl(media, preset)` with a **fixed** preset set so derived assets cache and stop costing credits:
  `avatar-64`, `grid-3x4` (`c_fill,ar_3:4,w_360`), `reel-9x16` (`c_fill,ar_9:16,w_360`), `story-9x16`,
  `panel` (`c_limit,w_900`), `full` (`c_limit,w_2048`, used for request attachments), `poster` / `poster-9x16` (video first frame, 3:4 / 9:16,
  as image), all with `f_auto,q_auto`.
- `destroy.ts` — `destroyMedia(db, mediaId)`: deletes the Cloudinary asset, then the row. Best effort; failures are
  logged and retried by the later cleanup job.
- `<MediaUpload>` client component (`src/components/media/MediaUpload.tsx`): pick/drop files, client-side type and
  size check, signed upload with progress, retry on failure, calls `registerMedia`, returns `Media` ids.

The grid only ever loads still images (`grid-3x4` / `poster`); video plays only in the side panel.

## Page and components

Route: `src/app/(app)/content/` (sidebar item **Content Plan**, replacing the disabled Integrations item;
icon `LayoutGrid` from lucide).

URL state: `/content?channel=<id>&tab=feed|reels|stories&post=<id>` so links from notifications open the right post.

Layout (approved mock-up "B"):

- **Left — channel list.** Channels grouped by brand, with counts of posts awaiting approval. "+ Channel" for
  LEAD/ADMIN opens a small form (brand, handle, display name, bio, avatar via `<MediaUpload>`).
- **Centre — phone preview.** A phone frame (~390px wide) with the IG profile header (avatar, handle, display name,
  bio, "N planned · M awaiting approval"), tabs Feed ▦ / Reels ▶ / Stories ◯, and the grid:
  - Feed: 3 columns, 3:4 tiles. Reels: 3 columns, 9:16 tiles. Stories: a horizontal row of 9:16 cards by date.
  - Order: PLANNED posts by `position` desc, then a "already posted" divider, then PUBLISHED by `publishedAt` desc
    (faded).
  - Each tile: cover image (FINAL media if any, else first MOCKUP, else a striped "Idea" placeholder), status badge,
    planned date, carousel/video icon, ⚠ badge when the date is out of order.
  - "+" tile at the top (drafters) creates an IDEA post in that tab; "+ Already posted" at the divider.
- **Right — side panel** (approved mock-ups 1–3):
  1. *Drafting:* media strip with add/reorder/remove, format, post date, request type, brief, caption, comments.
     Autosaves (debounced) and shows "Saved". Button: **Submit for approval**.
  2. *Reviewing:* everything read-only with "🔒 Locked · submitted by X, 2h ago". LEAD/ADMIN see **Send back…**
     and **Approve…**. Feedback comments are highlighted.
  3. *Approve form:* see below.
  After approval the panel shows a link to the request and its status.

On narrow screens (< 1024px) the channel list collapses to a dropdown and the side panel opens as a full-screen
sheet.

### Drag and reorder

Uses the existing `@dnd-kit/core` setup and keyboard pattern (`src/lib/boardA11y.ts`, `src/components/calendar/dnd.ts`).
Only IDEA, DRAFT and CHANGES_REQUESTED tiles are draggable, only by drafters, only within their tab. A move sets
`position` to the midpoint of its new neighbours (single-row update); if the gap gets too small
(< 1e-6) the tab's positions are renumbered in one transaction.

Date check (`src/lib/content/order.ts`, pure): walking the planned list top to bottom, a dated tile is out of order
when its date is later than the nearest dated tile above it. The ⚠ badge offers "Set to <suggested date>" — the
midpoint day between its dated neighbours, or neighbour ± 1 day at the ends.

## Approve → Request

`approveContentPostWith(db, lead, postId, input)` in `src/lib/content/approve.ts`.

**Pre-filled form fields:**

| Field | Default |
|---|---|
| Title | `<Brand> · <Feed/Reel/Story> · <first line of brief, ≤ 80 chars>` |
| Division | author's most recent request's division, else first division |
| Type | post's `typeId`, else the workspace default (`DEFAULT_TYPE_NAME`) |
| Type fields | rendered from the type's `fieldSchema` like the New Request form |
| Assignee | empty (lead picks) |
| Deadline | `plannedAt` − 3 days (Jakarta date), not before today |
| Outputs | carousel: number of MOCKUP images; otherwise 1 |
| Needs motion | true when format is VIDEO or surface is REEL |

**In one database transaction:**
1. Re-read the post; fail with CONFLICT unless status is SUBMITTED and `requestId` is null (double-click safe;
   `requestId @unique` is the backstop).
2. Create the request through the same validation and insert as `createRequestWith` — refactor
   `src/lib/createRequest.ts` so validation and the insert (`request` + first `StatusEvent`) are reusable inside a
   caller's transaction and accept an explicit `requesterId`. Requester = post author; notes = brief (+ caption
   under a "Caption draft" heading); `outputCount` and `needsMotion` from the form.
3. Create one `Attachment` per MOCKUP media (name = `mockup-<n>.<ext>`, url = `mediaUrl(media, "full")`,
   uploader = author).
4. Update the post: status APPROVED, `requestId`, `approvedById`, `approvedAt`.

After commit (best effort, like `transitionRequestWith`): notify the author (in-app + email), and send the usual
"assigned" notification if an assignee was chosen.

## Keeping post and request in step

`transitionRequestWith` (`src/lib/transition.ts`) gains a step inside its transaction:
`syncContentPostForRequest(tx, requestId, to)` (`src/lib/content/sync.ts`) applies the "system" rows of the
workflow table. Requests without a linked post are untouched (one indexed lookup on `requestId`).

When a request moves to DONE, its post becomes DONE and `doneAt` is set. FINAL media is added by a drafter or the
assignee in the side panel ("Add final design") — v1 does not pull files from the request's design folder.

## Notifications

`src/lib/content/notify.ts`, same style as `libraryNotify.ts`, using `Notification.contentPostId`:

| Event | Who | Channel |
|---|---|---|
| Submitted | all active LEAD/ADMIN except the actor | in-app |
| Sent back | author | in-app + email |
| Approved | author | in-app + email |
| Linked request cancelled (post back to DRAFT) | author | in-app |
| Comment / @mention | author + previous commenters / mentioned users (reuse `src/lib/mentions.ts`) | in-app |

Emails use the branded layout from `src/lib/emailLayout.ts`.

## Errors and edge cases

- Cloudinary not configured → page loads, uploads disabled with a clear message; text drafting still works.
- Upload fails or is abandoned → no `Media` row. Orphaned Cloudinary files (uploaded, never registered) are swept
  by the later cleanup job (by folder + age).
- Removing media from a draft → unlink and `destroyMedia` (best effort).
- Deleting a channel → only when it has no APPROVED-or-later posts; otherwise LEAD/ADMIN must archive (hide) it.
  v1: block delete with a message; archive comes later.
- Brand renamed → titles of already-created requests are not changed.
- Concurrent edits to the same draft → last write wins per field; the panel refetches on focus.
- Server actions return result objects (not thrown errors), matching existing actions, because Next redacts thrown
  errors in production.

## Testing

Unit (Vitest, pure):
- `content/permissions` — every appRole × jobRole combination.
- `content/workflow` — allowed and rejected transitions, lock rules.
- `content/order` — position midpoint, renumber trigger, ⚠ detection and suggested date.
- `content/approve` defaults — title, deadline (Jakarta, not before today), outputs, needs motion.
- `media/url` — each preset string; `media/sign` — folder, params, signature against a known secret.

Integration (test DB, like existing `tests/*Query.test.ts`):
- Approve creates exactly one request with the author as requester and one attachment per mock-up; a second
  approve returns CONFLICT.
- Send back stores a feedback comment and unlocks the post.
- `transitionRequestWith` ON_PROGRESS / DONE / reopen / CANCELLED updates the linked post as in the table.
- A REQUESTER without SOCIAL_MEDIA cannot create, edit, reorder or submit; a CREATIVE cannot approve.
- Workspace isolation: a post, channel or media id from another workspace is NOT_FOUND.

Cloudinary is faked behind the `src/lib/media` interface in tests; nothing real is uploaded.

## Rollout

1. Migration adds the new tables and `Notification.contentPostId`.
2. Add the Cloudinary env vars locally and in Vercel (production + preview).
3. Ship behind the sidebar item; empty state explains "Add your first channel" (LEAD/ADMIN) or "No channels yet"
   (others).
4. Follow-ups, in order: 60-day mock-up video cleanup + orphan sweep; sub-project #2 (avatars); #3 (attachment and
   library uploads); TikTok channels; calendar view.
