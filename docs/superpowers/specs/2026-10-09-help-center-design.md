# In-app Help Center — design

Date: 2026-10-09 · Owner: Wira · Status: approved in chat, awaiting spec review

## Goal

Add a Help Center inside the app at `/help` so everyone on the team can learn how to use Cloworks without
asking someone. Guides are written in the repo, rendered by the app, and shown only for features the signed-in
user can use.

Decisions made in brainstorming:

| Question | Decision |
|---|---|
| Audience | Everyone on the team (all roles) |
| Location | In the app at `/help`, linked from the sidebar |
| Language | English (matches the UI labels) |
| Content storage | Markdown files in the repo, built at build time |
| Editing | Developers edit files and deploy; no in-app editor |
| Access | Same sign-in as the rest of the app |

## 1. Navigation

- A **Help** link sits at the bottom of the sidebar, below the existing groups. It is visible to every role.
- `/help` is the index: grouped sections, a search box, and a list of articles the user can see.
- `/help/[slug]` is one article: title, body, a table of contents from its headings, and previous/next links
  within its section.
- Both routes live under the authenticated `(app)` layout, so the shell and sign-in behave as elsewhere.

## 2. Content

### File layout

- One file per article in `content/help/`, named `<slug>.md`. The filename is the URL slug.
- Frontmatter:

```yaml
---
title: Creating a request
section: Requests
order: 2
requiresPermission: request.create   # optional
---
```

- `title`, `section`, and `order` are required. `section` must match one of the section names listed in
  the content index (section list lives in code, see §4). `order` sorts articles within a section.
- `requiresPermission` is optional and must be one of the existing `Action` keys in `src/lib/permissions.ts`
  (`request.create`, `request.assign`, `request.transition`, `dashboard.team`, `dashboard.self`,
  `project.manage`, `admin.manage`). Omit it for articles every role can read.

### Body

- Standard Markdown: headings (`##`, `###`), numbered steps, bullet lists, bold for UI labels, links.
- Headings drive the on-page table of contents. Use `##` for the main sections of an article.
- No images or screenshots in version 1.
- UI labels are written exactly as they appear on screen (e.g. "New request", "Today's overview").

### First set of articles (about 11)

| Section | Article | Slug | Permission |
|---|---|---|---|
| Getting started | Getting started | `getting-started` | — |
| Getting started | Signing in and roles | `signing-in-and-roles` | — |
| Requests | Requests: board, table, and calendar | `requests-views` | — |
| Requests | Creating a request | `creating-a-request` | `request.create` |
| Requests | Request details and statuses | `request-details-and-statuses` | — |
| Requests | Today's overview, search, and filters | `todays-overview-search-filters` | — |
| Projects | Projects | `projects` | `project.manage` |
| KPI | My KPI | `my-kpi` | `dashboard.self` |
| KPI | Team KPI | `team-kpi` | `dashboard.team` |
| Admin | Managing users | `admin-users` | `admin.manage` |
| Admin | Managing lists | `admin-lists` | `admin.manage` |

Content is written from the current app's behaviour. The implementation plan includes a step to check each
article against the running app.

## 3. Access rules

- An article with no `requiresPermission` is shown to every signed-in user.
- An article with `requiresPermission` is shown only when `can(user.appRole, permission)` is true.
- The index, search results, and previous/next links use the same filter, so a hidden article never leaks
  through a link, a search hit, or a neighbour.
- Visiting a hidden article's URL directly returns the same 404 as an unknown slug. The article is not
  revealed to users who lack the permission.
- The sidebar Help link is not role-gated.

## 4. Components and modules

- `src/lib/help/content.ts` — the content module. Reads `content/help/*.md` at build time, parses frontmatter,
  validates required fields, and returns articles sorted by section and order. Owns the section list
  (`SECTIONS`) and its display order. Throws on an unknown `section` or an invalid `requiresPermission` so
  mistakes fail the build.
- `src/lib/help/access.ts` — pure function `visibleArticles(articles, appRole)` that applies §3. Used by the
  index, search, neighbour links, and the slug lookup.
- `src/lib/help/search.ts` — pure function `searchArticles(articles, query)`: case-insensitive match on title
  and body text, title matches ranked first. No external search library.
- `src/lib/help/toc.ts` — pure function that extracts `##`/`###` headings from a body and returns anchors.
- `src/app/(app)/help/page.tsx` — index page. Server component; passes visible articles to a client search box.
- `src/app/(app)/help/[slug]/page.tsx` — article page. Server component. Calls `notFound()` for an unknown or
  hidden slug.
- `src/components/help/HelpSearch.tsx` — client component with the search input and result list.
- `src/components/help/ArticleBody.tsx` — renders Markdown to React elements. Uses an existing Markdown library if
  one is already a dependency; otherwise adds `react-markdown` with an exact pinned version.
- Sidebar: one new `NavItem` at the bottom of `AppShell.tsx`.

Each unit has one job and can be tested without the others. The access and search functions take plain data,
so they need no database or session.

## 5. Data flow

1. Build time: `content.ts` reads and validates all articles once.
2. Request time: the page gets the signed-in user's `appRole` from the existing session helper.
3. `access.ts` filters the list for that role.
4. The index renders sections; the client search filters the already-visible list in memory.
5. The article page finds the slug in the visible list, renders its body and TOC, and computes neighbours from
   the same list.

No database reads, no new API routes, no new Prisma models.

## 6. Error handling

- Unknown slug, hidden slug: `notFound()` (standard 404 page).
- Invalid frontmatter or unknown section/permission: fails at build time with the file name in the message.
- Empty section (all articles hidden for a role): the section heading is omitted, not shown empty.
- Search with no results: a plain "No guides match ‘…’" message.

## 7. Testing

- Unit: `content.ts` parsing and validation (valid file, missing field, unknown section, unknown permission).
- Unit: `access.ts` for each role against articles with and without `requiresPermission`.
- Unit: `search.ts` ranking and case-insensitive matching; empty query returns all visible articles.
- Unit: `toc.ts` anchors and heading levels.
- Render: index page shows only visible sections for a REQUESTER and for an ADMIN.
- Render: article page returns 404 for a hidden slug and for an unknown slug.
- Render: sidebar shows the Help link for every role.
- Existing Vitest setup; no new test tooling.

## 8. Out of scope (version 1)

- Screenshots, videos, and annotated images.
- Translation to Bahasa Indonesia.
- In-app editing, versioning, or comments on guides.
- Analytics on which guides are read.
- Full-text search service or indexing beyond the in-memory filter.
- Contextual "?" help buttons on individual pages.

## 9. Open items for the implementation plan

- Confirm whether a Markdown library is already a dependency before adding one.
- Verify each article's steps against the running app (done in the plan, not here).
