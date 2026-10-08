# Creative Request Tracker: Design (V1, revised after master spreadsheet review)

## Context
The creative team and other teams need one place to submit, track, and deliver creative requests (banner, video, carousel, PDP, ads, etc.), in a monday.com/Trello style. The same request data feeds each person's KPI dashboard. The app replaces the team's master Google Sheet (tabs: Request List All Clogent, SocMed Tracker, KPI_Config, Team, Project Tracker, Redesign Project, Directory, Dimas Tracker, and others), and the existing rows are imported.

**Agreed:**
- Under 30 users, one company, Google/Microsoft login. Sign-in is allowed if the email is on `clogent.co.id` **or** is on an admin-managed allow-list (most of the creative team have no company email and use Gmail, per the Directory tab and the ID-card roster).
- **Initial access:** Wira is the only admin and only login-capable user at launch. Employee Gmail addresses are **not** pre-loaded (several are not permanent staff); Wira adds them through the admin page when ready, and can promote more admins.
- **Phase 1 scope: Creative and Social Media teams only** (plus the requesters who send them work). Other employees (from the "List ID Card" roster, 40 people) are added later by an admin with no code change.
- KPI is for internal motivation and visibility, not formal appraisal.
- KPI counts **tasks** (one request = one task) against a **monthly target per person**, as in the sheet's `KPI_Config`. `Jumlah Output` (number of outputs) is shown as an extra stat, not counted toward the target.
- Projects module (long projects with owner, stage, dates, timeline) is **in V1**.
- Approach A: custom web app, simple stack.
- Working directory is empty (not a git repo).

## Stack
- Next.js (App Router) + TypeScript, Tailwind + shadcn/ui.
- Postgres (hosted, e.g. Supabase/Neon) with Prisma.
- Auth.js with Google and Microsoft providers; access = company domain OR allow-list of individual emails.
- S3-compatible file storage (design folders remain external links, as in the sheet).
- dnd-kit (board), Recharts (charts), Resend (email, V1 only channel).

## Team roster (from "List ID Card", Phase 1)
Users carry `fullName`, `title`, `shortName` (the name used in the request sheets), `aliases`, `department`, `jobRole`, `appRole`.

| Short name | Full name | Title | Job role | Suggested app role |
|---|---|---|---|---|
| Wira | Wira Budi Prasetyo | Creative Director | Designer | ADMIN (the only admin at launch; more can be added later) |
| Irsyad | Irsyad Ahnaf Fauzian | Senior Graphic Design Staff | Designer | CREATIVE |
| Fadli | Muhamad Fadli | Junior Graphic Design Staff | Designer | CREATIVE |
| Emilia | Emilia Putri Salsa | Packaging Designer Staff | Designer | CREATIVE |
| Dimas Pandu | Dimas Pandu Wicaksono | Video Editor Staff | Designer | CREATIVE |
| Idzni | Idzni Adzhani | Social Media Manager | Social Media | LEAD |
| Fafa | Fahfil Fauzah | Social Media Specialist | Social Media | REQUESTER |
| Syahda | Syahda Niswah | Social Media Specialist | Social Media | REQUESTER |

Requesters outside the two teams that appear in the sheet: Yosi (Yosiananda Kurnia Perdana, Paid Ads Specialist), Rahmat (Syavia Rahmat, Ecommerce Manager). **Other people in the sheets (confirmed by Wira):**
- **Rio = Robertino.** Was on the Social Media team (Sep 2026 target 25), then moved to the Affiliate team. Still an active employee, so he stays as a user with his old requests and September KPI intact, but is not part of Phase 1 teams going forward.
- **Rifqy** replaced Rio on Social Media (Oct 2026 target 87). The sheet also spells him "Rifky"; both map to Rifqy.
- **Daus** has resigned. Kept as an **inactive** user: cannot sign in, hidden from assignee pickers, but his past requests and monthly KPI stay visible in history.
- Full names/emails for Robertino and Rifqy are not in the ID-card roster yet; admin fills them in.

## Vocabulary taken from the sheet
- **Brands:** Clogent, Bubble Wash (admin-managed list; Clenvo, Nuvie, SKC appear in other tabs).
- **Divisions:** Creative, Digital Ads, Social Media, Ecommerce, Brand (admin-managed list).
- **Job roles (Team tab):** Designer, Social Media. Separate from app roles.
- **Request statuses (Progress column):** `REQUESTED`, `ON_PROGRESS`, `FIRST_LOOK`, `DONE`, plus `CANCELLED`. `FIRST_LOOK` = first preview sent to the requester; feedback sends it back to `ON_PROGRESS`.
- **Project statuses:** `NOT_STARTED`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `ON_HOLD`.
- **Social media content types:** Campaign, Daily, Story, Urgent. **Platforms:** TikTok, Instagram.

## V1 Features
1. **Intake form.** Requester, brand, division, task title, brief link, notes, deadline (request date is automatic), attachments or links. Request types add fields: the Social Media type adds platform, content type, shooting/editing/upload checkboxes, and published link.
2. **Views.** Board (Kanban by status), table (sort/filter/search), "my requests".
3. **Workflow.** `REQUESTED → ON_PROGRESS → FIRST_LOOK → DONE`; `FIRST_LOOK → ON_PROGRESS` (revision); `DONE → ON_PROGRESS` (reopen); any non-final → `CANCELLED`. Every change is logged as a `StatusEvent`. Designer sets design folder link and `outputCount` (default 1) when completing.
4. **Collaboration.** Assignee (designer), comments with @mentions, attachments, email notifications on assignment, comment, and status change.
5. **Projects.** Project list and simple week-based timeline: title, sub title, brand, owner, status, start date, due date, file link.
6. **KPI dashboard.** Personal and team views, month filter, trend chart, target progress bars.
7. **Import.** One-time import of "Request List All Clogent" and "SocMed Tracker" rows from CSV, with name alias mapping.
8. **Roles and admin.** App roles `REQUESTER`, `CREATIVE`, `LEAD`, `ADMIN`. Leads/Admins see the team dashboard; Creatives see their own KPI; Admins manage users, brands, divisions, request types.

## KPI definitions (all derived from status history and request fields)
- **Primary:** tasks done vs monthly target. A request counts when it has `includeKpi = true`, is not `CANCELLED`, and reached `DONE`.
- **Who a task belongs to (`kpiBasis`):** decided by the **role stored on that month's target row** (as in `KPI_Config`'s Role column), because people change teams (Rio/Robertino was Social Media in Sep, Affiliate afterwards). Role Designer → the assignee; role Social Media → the requester (their monthly target of ~87 counts the content they plan). With no target row for that month, the user's current job role is used. Unassigned requests do not count for designers.
- **Inactive users** (resigned or moved away) keep their history and past months' KPI; they are excluded from team dashboards for months with no target row and from assignee pickers.
- **Which month:** the month of the request date, matching the sheet's `Month_Key`.
- **Secondary:** on-time rate (done on/before deadline; requests with no deadline skipped), average turnaround in working days (request date → done), revision rounds (`FIRST_LOOK → ON_PROGRESS` count), total outputs (sum of `outputCount`), active workload (open assigned requests).
- Targets live in `KpiTarget(userId, month 'YYYY-MM', role, targetTasks, note)`.

## Data model (core)
User (jobRole, aliases[], appRole), Brand, Division, RequestType (fieldSchema), Request (brand, division, requester, assignee, deadline, requestedAt, status, outputCount, includeKpi, designFolderUrl, briefUrl, notes, fields), StatusEvent, Comment, Attachment, KpiTarget, Notification, Project.

## Visual identity (from SKC Brand Guidelines 2026, parent company PT Sen Karya Cemerlang)
The app follows the parent brand so it feels like part of the same family.
- **Palette:** Deep Blue `#09426D` (strength, reliability: primary text, sidebar, headings), Aqua `#11AA9F` (fresh, clean: primary buttons, active states, accents), Space Grey `#CCCCCC` (borders, dividers, disabled), White `#FFFFFF` (surfaces). Used as design tokens, with tints derived from them for hover, backgrounds and chart series.
- **Typography:** Inter (Regular, Bold; Thin only for large display text), loaded via Google Fonts. Clean, direct, no decorative type.
- **Tone:** "Trust, cleanliness, functional clarity": generous white space, structured layout, no clutter.
- **Signature elements:** the guidelines' website mockup uses an Aqua hero with a Deep Blue and white interlocking S/K pattern panel. Use a subtle version of that pattern on the sign-in page and empty states only. Never behind data.
- **Gradient:** Aqua to Deep Blue diagonal (as on the guideline cover) for the sign-in screen and page headers only.
- **Logo:** SKC / Sen Karya Cemerlang logo files are not in the PDF as separate assets, so the app uses a text wordmark until the logo files are supplied.
- **Accessibility:** white text on Aqua is about 2.9:1, which fails WCAG AA for body text, so Aqua buttons use Deep Blue or white bold text at 16px+ only, or a darker Aqua tint for small text. Status colors (done, late, in review) must also differ by label or icon, not hue alone.

## Not in V1
Approval gating, image pin-comments, calendar view, Slack/WhatsApp, recurring requests, Figma/Drive integrations, AI help, the Directory/Packaging/Competitor/MasterBox/Talent Pool tabs (not yet reviewed).

## Verification
- Unit tests for KPI calculation with fixtures, including the sheet's real cases (e.g. Fadli target 50 in 2026-10).
- Import test: sample sheet rows map to correct brand, designer (aliases like Irshyad → Irsyad), status and month.
- End-to-end: requester submits → designer moves to First Look → Done → dashboard shows tasks done vs target.
- Manual check: domain-restricted login, role visibility, board drag-and-drop persists.
