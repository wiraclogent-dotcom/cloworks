# In-app Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/help` section inside the app: an index with search and an article page, both filtered by the signed-in user's role, with about 11 Markdown guides written in the repo.

**Architecture:** Guides are Markdown files in `content/help/`, parsed once at build time by a pure content module. Pure functions handle role filtering, search, and table-of-contents extraction, so they test without a database or session. Server pages call the session helper and render; one small client component handles search. The sidebar's existing disabled "Help center" item becomes a live link.

**Tech Stack:** Next.js 16 App Router (server components, `notFound()`), React 19, TypeScript, Vitest + Testing Library (jsdom), `react-markdown` 10.1.0 (new dependency).

**Spec:** [docs/superpowers/specs/2026-10-09-help-center-design.md](../specs/2026-10-09-help-center-design.md)

## Global Constraints

- Next.js 16.4.0 differs from older versions. Before writing any page or route code, read the relevant guide under `node_modules/next/dist/docs/` (see `AGENTS.md`). Route `params` are a Promise; follow the existing `PageProps<"/route">` pattern in `src/app/(app)/requests/[id]/page.tsx`.
- Guides are English only. Version 1 has no images, no screenshots, and no translation.
- Guide files live in `content/help/<slug>.md`. The filename is the URL slug.
- Frontmatter keys: `title`, `section`, `order` (required); `requiresPermission` (optional). `section` must be one of `SECTIONS`. `requiresPermission` must be one of the `Action` keys in `src/lib/permissions.ts`.
- Use `react-markdown` pinned to exactly `10.1.0`. Do not add `rehype-raw`; raw HTML in guide bodies must render as escaped text.
- Hidden articles (role lacks `requiresPermission`) return the same 404 as an unknown slug. Their titles must not appear in index, search, neighbour links, metadata, or the page title.
- No new Prisma models, no new API routes, no new test tooling.
- The sidebar "Help" link is not role-gated.
- Test files go flat in `tests/` with the `help-` prefix, matching the existing `tests/*.test.ts(x)` convention.
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A guide body containing raw HTML such as `<script>` or `<img onerror>` renders as visible text, never as markup. (Owned by Task 3.)
2. A search query containing regex metacharacters such as `(`, `[`, or `*` matches literally and does not throw. (Owned by Task 3.)
3. A signed-in user who types the URL of an admin-only guide gets a 404, and the guide's title does not appear in the page title, neighbour links, or search. (Owned by Task 5.)
4. A section with no guides visible to the user is omitted from the index, not rendered as an empty heading. (Owned by Task 4.)
5. A guide saved with Windows line endings (CRLF) or a UTF-8 byte-order mark still parses its frontmatter correctly. (Owned by Task 1.)

---

### Task 1: Content module (parse, validate, load)

**Files:**
- Create: `src/lib/help/content.ts`
- Create: `content/help/.gitkeep` (directory placeholder; real guides arrive in Tasks 7 and 8)
- Test: `tests/help-content.test.ts`

**Interfaces:**
- Consumes: `Action` type from `src/lib/permissions.ts`.
- Produces:
  - `export const SECTIONS = ["Getting started", "Requests", "Projects", "KPI", "Admin"] as const;`
  - `export type Section = (typeof SECTIONS)[number];`
  - `export type Article = { slug: string; title: string; section: Section; order: number; requiresPermission?: Action; body: string };`
  - `export class HelpContentError extends Error` — message always includes the file name.
  - `export function parseArticle(slug: string, source: string): Article` — throws `HelpContentError` on problems.
  - `export function loadArticles(dir: string): Article[]` — reads every `*.md` in `dir`, returns articles sorted by `SECTIONS` index, then `order`, then `title`.

- [ ] **Step 1: Write the failing tests**

Create `tests/help-content.test.ts` with these cases (use `describe("parseArticle")` and `describe("loadArticles")`):

```ts
import { describe, it, expect } from "vitest";
import { parseArticle, loadArticles, HelpContentError } from "@/lib/help/content";

const ok = "---\ntitle: Creating a request\nsection: Requests\norder: 2\nrequiresPermission: request.create\n---\n\n## Steps\n\n1. Open **New request**.\n";

it("parses frontmatter and body", () => {
  const a = parseArticle("creating-a-request", ok);
  expect(a).toMatchObject({ slug: "creating-a-request", title: "Creating a request", section: "Requests", order: 2, requiresPermission: "request.create" });
  expect(a.body).toContain("## Steps");
});

it("accepts CRLF line endings and a UTF-8 BOM", () => {
  const a = parseArticle("x", "﻿" + ok.replace(/\n/g, "\r\n"));
  expect(a.title).toBe("Creating a request");
  expect(a.body).not.toContain("\r");
});

it("leaves requiresPermission undefined when omitted", () => {
  const a = parseArticle("x", "---\ntitle: T\nsection: Getting started\norder: 1\n---\nbody");
  expect(a.requiresPermission).toBeUndefined();
});

it.each([
  ["missing title", "---\nsection: Requests\norder: 1\n---\nb"],
  ["unknown section", "---\ntitle: T\nsection: Nope\norder: 1\n---\nb"],
  ["unknown permission", "---\ntitle: T\nsection: Requests\norder: 1\nrequiresPermission: nope\n---\nb"],
  ["non-integer order", "---\ntitle: T\nsection: Requests\norder: first\n---\nb"],
  ["no frontmatter", "just text"],
])("throws HelpContentError naming the file for %s", (_, src) => {
  expect(() => parseArticle("bad-file", src)).toThrow(HelpContentError);
  expect(() => parseArticle("bad-file", src)).toThrow(/bad-file/);
});

it("loadArticles returns the real guides sorted by section order, then order", () => {
  // Implemented once guides exist; Task 8 adds the count assertion.
  expect(loadArticles(`${process.cwd()}/content/help`)).toEqual([]);
});
```

Also add a `loadArticles` test using a temp directory (`fs.mkdtempSync` under `os.tmpdir()`): two files, one in `Requests` order 2 and one in `Getting started` order 1, and assert the returned order is `Getting started` first. Keep the real-directory assertion above only as a smoke test that the directory exists and returns an array; Task 8 tightens it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-content.test.ts`
Expected: FAIL with "Cannot find module '@/lib/help/content'".

- [ ] **Step 3: Implement `src/lib/help/content.ts`**

Parse frontmatter with a small hand-written reader, not a YAML library:
- Strip a leading BOM (`﻿`) and normalise `\r\n` to `\n` before anything else.
- The source must start with a `---` line, followed by `key: value` lines, closed by another `---` line. Otherwise throw `HelpContentError` ("missing frontmatter").
- Trim values. Ignore blank lines. Unknown keys are ignored.
- Validate `title` (non-empty), `section` (in `SECTIONS`), `order` (integer, `/^\d+$/`), and `requiresPermission` (when present, in the `Action` list). Each failure throws `HelpContentError` whose message starts with the slug.
- `body` is everything after the closing `---`, trimmed of leading newlines.
- `loadArticles` reads `*.md` files with `fs.readdirSync` and `fs.readFileSync`, derives the slug from the filename without `.md`, and sorts.

Define the `Action` list by importing `type Action` and building a runtime constant from the same literal values in `permissions.ts`. If the `Action` union is not exported as a value, add a small exported `ACTIONS` const array in `src/lib/permissions.ts` and derive `Action` from it. Keep behaviour of `can()` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/content.ts src/lib/permissions.ts content/help/.gitkeep tests/help-content.test.ts
git commit -m "feat(help): parse and validate help guide frontmatter

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Role filtering and prev/next lookup

**Files:**
- Create: `src/lib/help/access.ts`
- Test: `tests/help-access.test.ts`

**Interfaces:**
- Consumes: `Article` from Task 1; `can()` and `AppRole` from `src/lib/permissions.ts` and `@prisma/client`.
- Produces:
  - `export function visibleArticles(articles: Article[], role: AppRole): Article[]` — keeps articles with no `requiresPermission`, or where `can(role, requiresPermission)` is true. Preserves input order.
  - `export function findVisible(articles: Article[], role: AppRole, slug: string): { article: Article; prev: Article | null; next: Article | null } | null` — looks up `slug` in `visibleArticles`; `prev`/`next` are neighbours within the same section in the visible list only. Returns `null` when the slug is unknown or hidden. Matching is exact and case-sensitive.

- [ ] **Step 1: Write the failing tests**

Build a fixture list in the test with four articles: `open` (no permission, Getting started, 1), `req` (`request.create`, Requests, 1), `req2` (no permission, Requests, 2), `admin` (`admin.manage`, Admin, 1). Assert:

```ts
expect(visibleArticles(fixtures, "REQUESTER").map(a => a.slug)).toEqual(["open", "req", "req2"]);
expect(visibleArticles(fixtures, "ADMIN").map(a => a.slug)).toEqual(["open", "req", "req2", "admin"]);
expect(findVisible(fixtures, "REQUESTER", "admin")).toBeNull();
expect(findVisible(fixtures, "REQUESTER", "ADMIN")).toBeNull(); // case-sensitive
expect(findVisible(fixtures, "REQUESTER", "req")).toMatchObject({ prev: null, next: { slug: "req2" } });
```

Also assert that a hidden neighbour is skipped: for `REQUESTER`, `findVisible(fixtures, "REQUESTER", "req2")` returns `prev: { slug: "req" }` and `next: null`. Add one case where the admin article is in the same section as a visible one, and assert it is not returned as a neighbour for `REQUESTER`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-access.test.ts`
Expected: FAIL with "Cannot find module '@/lib/help/access'".

- [ ] **Step 3: Implement `src/lib/help/access.ts`**

Two short functions as described under Interfaces. Use `can` from `@/lib/permissions`. Do not read the database.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/access.ts tests/help-access.test.ts
git commit -m "feat(help): filter guides by role and find prev/next neighbours

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Search, table of contents, and safe Markdown rendering

**Files:**
- Create: `src/lib/help/search.ts`
- Create: `src/lib/help/toc.ts`
- Create: `src/components/help/ArticleBody.tsx`
- Modify: `package.json` (add `"react-markdown": "10.1.0"` to `dependencies`)
- Test: `tests/help-search.test.ts`, `tests/help-toc.test.ts`, `tests/help-article-body.test.tsx`

**Interfaces:**
- Consumes: `Article` from Task 1.
- Produces:
  - `export function searchArticles(articles: Article[], query: string): Article[]` — trims the query; an empty query returns all input articles in input order. Otherwise a case-insensitive substring match against title and body, using `String.prototype.includes`, never a RegExp. Title matches come first, then body-only matches, each group in input order.
  - `export function slugifyHeading(text: string): string` — lowercase, trim, replace runs of non-alphanumeric characters with `-`, strip leading and trailing `-`.
  - `export type TocEntry = { level: 2 | 3; text: string; id: string };`
  - `export function extractToc(body: string): TocEntry[]` — only `##` and `###` lines (outside fenced code blocks), `id` from `slugifyHeading`.
  - `export function ArticleBody({ body }: { body: string }): React.ReactElement` — renders with `react-markdown`. Gives `h2` and `h3` the `id` from `slugifyHeading`. Does not enable raw HTML.

- [ ] **Step 1: Write the failing tests**

`tests/help-search.test.ts`:
- Empty and whitespace-only query returns all articles in input order.
- Title match ranks before a body-only match regardless of input order.
- Query `(` and query `[a` and `.*` return without throwing and match only literal text. Assert `searchArticles(fixtures, "(").length === 0` when no title or body contains `(`.
- Matching is case-insensitive: `"REQUEST"` finds a title containing `request`.

`tests/help-toc.test.ts`:
- Extracts `##` and `###` headings with correct levels and ids (`## Steps for ops` → `{ level: 2, text: "Steps for ops", id: "steps-for-ops" }`).
- Ignores `#` headings and `##` lines inside a fenced code block.

`tests/help-article-body.test.tsx` (use `// @vitest-environment jsdom` and `@testing-library/react`):
- Renders `## Steps` as an `h2` with `id="steps"`.
- Renders a body containing `<script>alert(1)</script>` with no `script` element in the DOM, and the text `<script>` visible as text.
- Renders a bold `**New request**` as `<strong>`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-search.test.ts tests/help-toc.test.ts tests/help-article-body.test.tsx`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

- Install the dependency with `npm install react-markdown@10.1.0 --save-exact`. Check that `package.json` shows `"react-markdown": "10.1.0"` with no caret.
- `search.ts`, `toc.ts`: plain string logic as in Interfaces. `extractToc` tracks an in-fence flag toggled by lines starting with three backticks.
- `ArticleBody.tsx`: `ReactMarkdown` with a `components` map for `h2` and `h3` that adds `id={slugifyHeading(children as string)}`. Do not pass `rehypePlugins` or `remarkPlugins` beyond the defaults. Add a comment above the component stating raw HTML is intentionally not rendered.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-search.test.ts tests/help-toc.test.ts tests/help-article-body.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/help/search.ts src/lib/help/toc.ts src/components/help/ArticleBody.tsx tests/help-search.test.ts tests/help-toc.test.ts tests/help-article-body.test.tsx
git commit -m "feat(help): add search, table of contents, and safe guide rendering

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Help index page with search

**Files:**
- Create: `src/app/(app)/help/page.tsx`
- Create: `src/app/(app)/help/help-data.ts` (cached loader: `loadArticles(path.join(process.cwd(), "content/help"))`)
- Create: `src/components/help/HelpSearch.tsx` (client component)
- Test: `tests/help-index.test.tsx`

**Interfaces:**
- Consumes: `loadArticles`, `SECTIONS` (Task 1); `visibleArticles` (Task 2); `searchArticles` (Task 3); `requireUserOrRedirect` from `@/lib/session`; `PageHeader` and `Card` from `@/components/ui`.
- Produces:
  - `export const metadata = { title: "Help" }` on the page.
  - `HelpSearch` props: `{ sections: { section: Section; articles: { slug: string; title: string; body: string }[] }[] }` (already role-filtered on the server). Renders a search input (`aria-label="Search help"`) and the grouped list. Empty results show `No guides match ‘<query>’`.
  - Sections with no visible articles are not passed in and so do not render.

- [ ] **Step 1: Write the failing tests**

`tests/help-index.test.tsx`:
- Mock `@/lib/session` so `requireUserOrRedirect` resolves `{ id: "u1", appRole: "REQUESTER", jobRole: "CREATIVE" }`. Render the page component as an async function result (`const el = await HelpPage()`) inside `render`.
- For REQUESTER: the "Admin" section heading is absent; "Getting started" is present; a link to `/help/getting-started` exists.
- For ADMIN (second test, mock resolves appRole `ADMIN`): the "Admin" heading and `/help/admin-users` link are present.
- A section whose only article is admin-only is absent for REQUESTER. Use a fixture-driven render by exporting a pure helper `buildIndexSections(articles, role)` from `help-data.ts` and testing it directly for this case with an in-test article list.
- Search: typing `zzz` into `Search help` shows `No guides match ‘zzz’`. Typing `request` filters the list (use `fireEvent.change`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-index.test.tsx`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

- `help-data.ts`: `export const getArticles = cache(() => loadArticles(...))` (use React `cache` if the rest of `src/lib` does, otherwise a module-level variable). Export `buildIndexSections(articles, role)`: visible articles grouped by `section` in `SECTIONS` order, dropping empty groups.
- `page.tsx`: `await requireUserOrRedirect()`, build sections, render `PageHeader` with title "Help" and a short subtitle, then `<HelpSearch sections={...} />`.
- `HelpSearch.tsx` (`"use client"`): holds the query in `useState`, filters by calling `searchArticles` on a flattened list, regroups by section for display, and links each article to `/help/<slug>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/help/page.tsx" "src/app/(app)/help/help-data.ts" src/components/help/HelpSearch.tsx tests/help-index.test.tsx
git commit -m "feat(help): add role-filtered help index with search

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Article page

**Files:**
- Create: `src/app/(app)/help/[slug]/page.tsx`
- Create: `src/components/help/ArticleToc.tsx` (renders `TocEntry[]` as anchor links; may be inline if small)
- Test: `tests/help-article.test.tsx`

**Interfaces:**
- Consumes: `findVisible` (Task 2); `extractToc` and `ArticleBody` (Task 3); `getArticles` from `help-data.ts` (Task 4); `requireUserOrRedirect`; `notFound` from `next/navigation`.
- Produces:
  - `export async function generateMetadata({ params })` — returns `{ title: article.title }` for a visible article, and `{ title: "Help" }` otherwise. Uses the same visibility check as the page, so a hidden title never reaches metadata.
  - Page: `notFound()` when `findVisible` returns `null`. Otherwise renders the title, section label, `ArticleBody`, a table of contents from `extractToc`, and previous/next links (omitted when `null`).

- [ ] **Step 1: Write the failing tests**

`tests/help-article.test.tsx`: mock `@/lib/session` as in Task 4, and mock `next/navigation` so `notFound` throws a sentinel `Error("NOT_FOUND")` that the test catches. Mock `help-data` to return fixture articles (one visible `open` article, and one `admin` article with `requiresPermission: "admin.manage"`).

- REQUESTER visiting `admin` → `notFound` is called (assert the thrown sentinel).
- REQUESTER visiting `unknown-slug` → same sentinel.
- REQUESTER visiting `open` → renders the title and body text.
- `generateMetadata` for REQUESTER with `admin` returns `{ title: "Help" }`, not `"Managing users"`.
- The `open` article's prev/next: with `req` (visible, Requests 1) and `req2` (visible, Requests 2), the page for `req` shows a link to `/help/req2` as next and no previous link.
- Slug with uppercase (`Open`) or an encoded value (`%2e%2e`) → `notFound`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-article.test.tsx`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

Read the Next.js guide for dynamic routes in `node_modules/next/dist/docs/` first, as required by `AGENTS.md`, and confirm `params` is awaited. Follow the `PageProps<"/help/[slug]">` pattern used in `src/app/(app)/requests/[id]/page.tsx`. Render with the same primitives as the index page (`PageHeader`, `Card`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-article.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/help/[slug]/page.tsx" src/components/help/ArticleToc.tsx tests/help-article.test.tsx
git commit -m "feat(help): add article page with contents and neighbour links

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sidebar Help link

**Files:**
- Modify: `src/components/AppShell.tsx` (footer, around the `DisabledNavItem label="Help center"` line)
- Test: `tests/help-nav.test.tsx` (new), and update any existing test that asserts "Help center" is disabled (search `tests/` for `Help center` first)

**Interfaces:**
- Consumes: `NavItem` (already imported in `AppShell.tsx`).
- Produces: a `NavItem` with `href="/help"`, `label="Help center"`, `icon={<CircleHelp aria-hidden="true" />}` in the footer list, in the same wrapper element as the neighbouring Settings item.

- [ ] **Step 1: Write the failing test**

Search first: `grep -rn "Help center" tests/`. For any existing assertion that the item is disabled or `aria-disabled`, update it to expect a link. Then add `tests/help-nav.test.tsx` that renders the shell (follow `tests/appFrame.test.tsx` for mocks) and asserts `getByRole("link", { name: "Help center" })` has `href="/help"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/help-nav.test.tsx`
Expected: FAIL (no link found).

- [ ] **Step 3: Implement**

Replace the `DisabledNavItem` line for "Help center" with `NavItem`. Remove `DisabledNavItem` from the import only if it is no longer used anywhere in the file (it still is, for Settings and the Work group).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-nav.test.tsx tests/appFrame.test.tsx tests/shellHydration.test.tsx`
Expected: PASS. The hydration test matters here because the nav item sits in the footer and must render identically on server and client.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx tests/help-nav.test.tsx
git commit -m "feat(help): link the sidebar Help center to /help

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Guides, part 1 — Getting started and Requests (5 guides)

**Files:**
- Create: `content/help/getting-started.md`
- Create: `content/help/signing-in-and-roles.md`
- Create: `content/help/requests-views.md`
- Create: `content/help/creating-a-request.md`
- Create: `content/help/request-details-and-statuses.md`
- Create: `content/help/todays-overview-search-filters.md`

**Interfaces:**
- Consumes: frontmatter rules from Task 1. Permission keys from `src/lib/permissions.ts`.
- Produces: six guide files. Slugs and frontmatter exactly as in the spec table, §2.

- [ ] **Step 1: Verify the steps against the running app**

Start from the already-running dev server at `http://localhost:3000` (see the preview tab). For each guide, open the matching page and check the labels, status names, and buttons. Do not copy from the spec alone. Read statuses from `src/lib/statusLabels.ts` and the transition rules from `src/lib/workflow.ts`. Read view tab names from `src/app/(app)/requests/page.tsx` and its client components.

- [ ] **Step 2: Write each guide**

Each file: frontmatter per spec §2, then a body of 1 to 2 short `##` sections with numbered steps. Use UI labels exactly as they appear on screen. Keep each guide under about 250 words. Example for `creating-a-request.md`:

```markdown
---
title: Creating a request
section: Requests
order: 2
requiresPermission: request.create
---

## Before you start

You need a project to attach the request to. See [Projects](/help/projects).

## Steps

1. Select **New request** on the Requests page.
2. Fill in the title, project, and deadline.
3. Select **Create** to submit.
```

Verify the actual field names and button text on the form before writing. The example above is a shape, not the final text.

- [ ] **Step 3: Check that the content loads**

Run: `npx vitest run tests/help-content.test.ts`
Expected: PASS. The smoke test in Task 1 should still pass with six articles present.

Then run `npx tsx -e 'import { loadArticles } from "./src/lib/help/content"; console.log(loadArticles("content/help").map(a => a.slug))'` and confirm the six slugs are printed in section order.

- [ ] **Step 4: Commit**

```bash
git add content/help
git commit -m "docs(help): add getting started and requests guides

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Guides, part 2 — Projects, KPI, Admin (5 guides) and content integrity test

**Files:**
- Create: `content/help/projects.md`
- Create: `content/help/my-kpi.md`
- Create: `content/help/team-kpi.md`
- Create: `content/help/admin-users.md`
- Create: `content/help/admin-lists.md`
- Modify: `tests/help-content.test.ts` (replace the Task 1 smoke test with the assertions below)

**Interfaces:**
- Consumes: the same as Task 7.
- Produces: five guide files, and a test that locks the full set.

- [ ] **Step 1: Verify the steps against the running app**

Check `src/app/(app)/projects/`, `src/app/(app)/dashboard/`, `src/app/(app)/dashboard/team/`, and `src/app/(app)/admin/` against the live pages. Check the Admin lists page for the names of the lists it manages. Check the KPI metric labels in `src/lib/kpi/presentation.ts`.

- [ ] **Step 2: Write each guide**

Same frontmatter and length rules as Task 7. Set `requiresPermission` as in the spec table: `project.manage` for Projects, `dashboard.self` for My KPI, `dashboard.team` for Team KPI, and `admin.manage` for both Admin guides.

- [ ] **Step 3: Tighten the content integrity test**

Replace the Task 1 smoke test with:

```ts
it("loads all eleven guides from the real directory with the expected slugs and order", () => {
  const articles = loadArticles(`${process.cwd()}/content/help`);
  expect(articles.map(a => a.slug)).toEqual([
    "getting-started", "signing-in-and-roles",
    "requests-views", "creating-a-request", "request-details-and-statuses", "todays-overview-search-filters",
    "projects", "my-kpi", "team-kpi",
    "admin-users", "admin-lists",
  ]);
});

it("every real guide has a body and a valid section", () => {
  for (const a of loadArticles(`${process.cwd()}/content/help`)) {
    expect(a.body.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/help-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/help tests/help-content.test.ts
git commit -m "docs(help): add projects, KPI, and admin guides; lock guide set in tests

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass. The baseline before this work was 79 files and 1,029 tests, all passing. New totals should be higher, with no failures.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit with 0.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds. Confirms that `/help` and `/help/[slug]` compile and that `content.ts` accepts every real guide.

- [ ] **Step 4: Check in the browser**

Start or reuse the app preview (`app` server, port 3000). Sign in as an admin and as a requester. Check:
- `/help` lists the sections the role should see; a requester sees no "Admin" section.
- A requester opening `/help/admin-users` gets the 404 page.
- Searching "board" finds the Requests views guide.
- The sidebar Help center link opens `/help`.

Take one screenshot of `/help` as proof.

- [ ] **Step 5: Commit any fixes**

Commit only if Steps 1 to 4 required changes.

---

## Self-Review Notes

- Spec coverage: §1 navigation → Tasks 4, 5, 6. §2 content → Tasks 1, 7, 8. §3 access → Tasks 2, 4, 5. §4 units → Tasks 1 to 5. §5 data flow → Tasks 4, 5. §6 errors → Tasks 1, 4, 5. §7 testing → each task plus Task 9. §8 out of scope → nothing built. §9 open items: Markdown library resolved as `react-markdown` 10.1.0 (latest published on npm, March 2025); the spec's "verify steps against the app" is Tasks 7 and 8 step 1.
- Discovered in planning: the sidebar already contains a disabled "Help center" item (`AppShell.tsx` footer). Task 6 converts it rather than adding a second item.
- Type consistency: `Article`, `Section`, `SECTIONS`, `visibleArticles`, `findVisible`, `searchArticles`, `extractToc`, `slugifyHeading`, `buildIndexSections`, and `getArticles` are defined once and referenced by these names throughout.
