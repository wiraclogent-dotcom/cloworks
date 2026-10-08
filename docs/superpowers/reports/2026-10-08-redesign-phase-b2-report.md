# UI redesign, Phase B2 (hydration fix, Phase A review fixes, KPI, projects, admin, extras) report

Date: 2026-10-08. Branch `feat/creative-request-tracker`, on top of `1bb4e76` (Phase B1).
Spec: `docs/superpowers/specs/2026-10-08-ui-redesign-design.md`. Kit: `src/components/ui/README.md`.

Scope: restyle only. Routes, params, server actions, permissions, data and aria wiring are unchanged (exceptions are
listed under "Accessible-name changes").

Commits:
1. `1efc104` fix(shell): hydration-safe sidebar links; Phase A review fixes
2. `7f18622` feat(kpi): My KPI and Team KPI with KPI tiles, threshold progress bars and chart card
3. `f8815ab` feat(projects): grouped table card, status chips, timeline card, card forms
4. admin + extras + this report (see `git log`)

## Part 1: hydration bug

### Root cause
`NavLinkView` (src/components/shell/NavItem.tsx) rendered `title={collapsed ? label : undefined}`, where `collapsed`
came from a React context that `AppFrame` filled from `useSyncExternalStore(<html data-sidebar>)`. The server always
renders "expanded" (`title` absent). In the browser the boot script has already set `data-sidebar="collapsed"`.
`useSyncExternalStore` itself is hydration-safe (React uses the server snapshot while hydrating), but the frame then
re-renders with the client value and updates the context **before** Suspense boundaries that stream in later hydrate.
The role-gated links (Team KPI inside `<Suspense>` in `AppShell`, the Admin group inside another) hydrate after that,
read `collapsed = true` on their first render and produce `title="Admin"` against server HTML without it:
"A tree hydrated but some attributes of the server rendered HTML didn't match the client properties".

### Fix
- `NavLinkView` always renders `title={label}`; the rail's visual state is CSS only (`[data-sidebar] .sb-label`).
  The context (`src/components/shell/SidebarContext.ts`) had no other consumer and was removed.
- `AppFrame` keeps `useSyncExternalStore` for its own collapse button (`aria-expanded`/label): it is at the root of the
  client tree and React hydrates it with the server snapshot.
- The user chip markup moved to `src/components/shell/UserChipView.tsx` (pure, testable); its `title` is the name or
  absent (never `""`).

### Regression test
`tests/shellHydration.test.tsx`: `renderToString` of the frame + nav (Requests at the root, Team KPI and Admin in
Suspense like `AppShell`, user chip and ThemeSwitch in Suspense too), then the stored prefs are written to
`localStorage` and the real boot script runs, then `hydrateRoot` in jsdom. A `Streamed` wrapper suspends the boundaries
on the client until after the root has committed (what streaming does in Next). `console.error` is spied and
`onRecoverableError` collected; both must stay empty. Cases: rail collapsed; rail collapsed + dark theme; defaults.
Verified red before the fix (2 hydration errors: Team KPI and Admin) and green after.

### Same-class audit (client components)
Checked every `"use client"` file for render-time reads of `window`, `localStorage`, `matchMedia`, `<html data-*>`,
`Date.now()`/`new Date()`, `Math.random()`, locale formatting: AppFrame (uSES with server snapshot + effects only),
ThemeSwitch (uSES with server snapshot "light"; effects apply the theme), NavItem (fixed), Board/BoardCard/DoneDialog
(`daysLeft` is computed on the server and passed in), DetailForms, NewRequestForm, ProjectForm, AdminForm, UserForms,
ListForms, TargetEditor, TrendChart, error.tsx: none found. A rule was added to the kit README.

## Part 1: Phase A review fixes

| Item | Change |
|---|---|
| (a) sidebar secondary text | `--sidebar-foreground-secondary` `#9DB7CF` → `#BCD0E2` (both themes). Light: bar 6.59, hover pill 5.29, active pill 4.76; dark: 8.67 / 7.04 / 5.89. Test asserts secondary text on hover AND active pill ≥ 4.5 in both themes. ThemeSwitch keeps the secondary colour for inactive options (now AA). |
| (b) placeholders | New `--placeholder` (= `--foreground-secondary`), class `placeholder:text-placeholder` in `fieldClass` and the filter search. Light 5.45 on white / 4.94 on a disabled field; dark 7.80 / 6.68. Tested at 4.5. `--foreground-muted` is now documented as non-text only (3.26 white / 3.01 canvas, tested ≥ 3). |
| (c) `cn` | `tailwind-merge` 3.6.0 (exact pin, `--ignore-scripts`, private npm cache). Supports Tailwind v4 names; verified on the conflicts we rely on (h/size/px, token bg/text/border colours, shadow, rounded, arbitrary text size, variants). Tests in `tests/kitReviewFixes.test.tsx`. |
| (d) blocked storage | `src/lib/theme.ts` keeps an in-memory `memoryPref` when `setItem` throws; `readThemePref` returns it first, a successful write clears it. Test: aria-pressed follows the applied theme. |
| (e) role-gated nav | `TeamKpiItem`/`AdminGroup` exported; `tests/shellNavGating.test.tsx` with mocked session: REQUESTER/CREATIVE see neither, LEAD sees Team KPI only, ADMIN sees both. |
| (f) minor | `Avatar` with an empty name is `aria-hidden` (no `role="img"`, no `aria-label=""`, no title). ThemeSwitch options 28 → 36px. `size="sm"` Button / IconButton keep the 32px look with a transparent `::after` that makes the hit area 36px. Unused tokens removed: `--popover`, `--popover-foreground`, `--secondary-foreground` (+ their `--color-*`). Brand tokens kept (palette). |

## Part 2: what changed (files)

| Area | Files |
|---|---|
| KPI helpers (new, pure) | `src/lib/kpi/presentation.ts` (`PROGRESS_THRESHOLDS`, `progressLevel`, `myKpiTiles`, `teamSummary`) |
| My KPI | `src/app/(app)/dashboard/page.tsx`, `src/components/kpi/{ProgressBar,MonthPicker,TrendChart}.tsx`; `StatCard.tsx` removed (unused) |
| Team KPI | `src/app/(app)/dashboard/team/page.tsx`, `src/components/kpi/{TeamTable,TargetEditor}.tsx` |
| Projects | `src/app/(app)/projects/{page,ProjectForm}.tsx`, `projects/new/page.tsx`, `projects/[id]/edit/page.tsx`, `src/components/{ProjectTable,ProjectTimeline}.tsx` |
| Admin | `src/app/(app)/admin/{AdminTabs,AdminDenied}.tsx`, `admin/users/{page,UsersContent,UserForms}.tsx`, `admin/lists/{page,ListsContent,ListForms}.tsx`, `src/components/admin/AdminForm.tsx`, `src/lib/adminChips.ts` (new) |
| Extras | `src/components/AccessDenied.tsx`, `src/components/NotFoundPanel.tsx`, `src/components/PageSkeletons.tsx` (new); `src/app/(app)/error.tsx`, `src/app/not-found.tsx`, `src/app/(app)/not-found.tsx` (new, in-shell) |
| Kit | `EmptyState` (`titleAs`, `role`, children), `Alert` (`id`), `Button` (`ref` prop type), README; `RequestSkeletons` exports `Busy` |
| Tokens | `globals.css`: `--placeholder`, `--progress-low/mid/complete`, `--color-chart-grid` |

### My KPI
PageHeader ("My KPI" / "KPI: name", month as description; actions = "Back to team" ghost link when viewing someone
else + the month picker as a pill (calendar icon, `type="month"` field, small "Show" button; same GET form, id, name,
pattern and hidden `user`). Eight KpiTiles in a list under an sr-only h2 "Key numbers": Tasks done, Target, Progress,
On-time rate, Avg turnaround, Revision rounds, Total outputs, Active workload. The brief listed six; turnaround and
revision rounds were on the page before, so they stay (no information lost). Values/hints come from the same
formatters (null → "—", workload only for designers). "Monthly target" card (h2) with the bar ("X of Y tasks (Z%)",
same aria) and the target note. "Last N months" chart card: Aqua bars (`--chart-done`, rounded tops), Deep Blue dashed
target line, `--chart-grid` grid, tooltip in card style, HTML text legend, "View as table" `<details>` with the kit
table (caption kept). Empty: EmptyState with the same sentence. Fallback: `KpiSkeleton`.

### Progress thresholds (documented in `presentation.ts`)
< 50 % = `low` (amber `--progress-low`), 50–99 % = `mid` (Aqua `--progress-mid`), ≥ 100 % = `complete` (green
`--progress-complete` + check icon). The % is always printed; the compact team bar also has sr-only words ("below half
of target", "on the way", "target reached"); the monthly bar shows the words visibly.

### Team KPI
PageHeader + month picker; summary tiles (People, Tasks done, Average progress = rounded mean of each person's whole %
over people with a target, "—" when nobody has one); table in the kit table card: Name (decorative avatar, link, job
role chip), Tasks done, Target, Progress (compact threshold bar), On-time, Turnaround, Workload, Set target (number +
note fields from `fieldClass` sm, primary sm "Save" with `loading`; all labels and names unchanged).

### Projects
PageHeader (count, description, primary "New project" with icon). One card; each brand group is a section with a
header strip (brand tone accent bar, h2 brand name, count pill) and a fixed-layout table so groups line up. Owner avatar
+ name, StatusChip (project tones), Start, Due = date + DeadlineChip for non-Done projects (the separate "Days left"
column is folded in, like B1), "Open file" link with icon, ghost "Edit" link. Timeline card (h2 "Timeline"): bars
filled with the status tone's text colour (solid, ≥ 9:1 on the card), status in the bar title and sr-only text,
red "Today" marker, week header in the table-header style, and a status legend of StatusChips (so the bar colour is
never the only signal). New/edit: PageHeader + two cards ("Project", "Schedule and file") with kit fields, FieldError,
Alert for form-level errors, primary submit + ghost Cancel; the "not allowed" text is an Alert (still `role="alert"`).

### Admin
PageHeader with the secondary nav as SegmentedControl links ("Users" | "Lists", nav "Admin sections"). Users: the kit
table card (Name cell = avatar + name + full name · title, Job role chip, App role chip, Login email or "No login",
Active/Inactive chip, Manage `<details>` "Edit name" with the three forms in a muted panel); "Add person" and
"Allowed emails" cards side by side on large screens; remove/deactivate triggers are danger-text ghost buttons, the
confirm step is a cancelled-tone box with the kit **danger** confirm button and a Cancel button (same names, same
two-step behaviour). Lists: Brands and Divisions cards (rename rows: field + secondary "Rename"), Request types card
(`<details>` per type with an Active/Inactive chip; the JSON textarea; outcomes as Alert). AdminForm outcomes are
Alerts with the same id (aria-describedby), role, text and detail list.

### Extras
- 403 panels (My KPI no-access, Team KPI, Admin) → `AccessDenied` = EmptyState `role="alert"`, h1 "403 · Access
  denied", lock icon, link back (Requests; My KPI for Team KPI). "Person not found." → EmptyState alert + Back to team.
- `(app)/error.tsx` → EmptyState alert (h1, Try again primary, Back to requests, Sign in again). New
  `(app)/not-found.tsx` renders `notFound()` inside the shell; the root `not-found.tsx` (unknown URLs) uses the same
  `NotFoundPanel` in its own `<main>`.
- Suspense fallbacks: `KpiSkeleton`, `TeamKpiSkeleton`, `ProjectsSkeleton`, `AdminSkeleton`, `FormSkeleton`
  (`role="status"`, `aria-busy`, sr-only "Loading …").

## Contrast (all asserted in `tests/theme.test.ts`)

| Pair | Min | Light | Dark |
|---|---|---|---|
| `--sidebar-foreground-secondary` on `--sidebar` / hover pill / active pill | 4.5 | 6.59 / 5.29 / 4.76 | 8.67 / 7.04 / 5.89 |
| `--placeholder` on `--surface` / `--surface-muted` | 4.5 | 5.45 / 4.94 | 7.80 / 6.68 |
| `--danger-text` on `--surface-muted` (danger ghost hover) | 4.5 | 4.98 | 4.90 |
| `--foreground-muted` against `--background` (non-text) | 3 | 3.01 | 5.48 |
| `--progress-low` against `--card` / `--surface-muted` | 3 | 3.72 / 3.37 | 7.06 / 6.04 |
| `--progress-mid` against `--card` / `--surface-muted` | 3 | 5.56 / 5.04 | 5.32 / 4.55 |
| `--progress-complete` against `--card` / `--surface-muted` | 3 | 5.27 / 4.77 | 7.57 / 6.48 |
| `--chart-done` / `--chart-target` against `--surface-muted` (tooltip cursor band) | 3 | 5.04 / 9.46 | 4.55 / 6.68 |
| Timeline bars `--status-{requested,in-progress,first-look,done,due-soon}-text` against `--surface` | 3 | 9.40–11.57 | 9.86–11.09 |

Light `--progress-low` is `#BA7517` (the due-soon accent), dark `#EF9F27`; `--progress-complete` light `#3B7A1E`, dark
`#97C459`; `--progress-mid` = `--chart-done`. Text on the new surfaces reuses already-tested pairs (chip text on tint,
secondary on surface/muted, destructive foreground on destructive, link on surface). `grep` for hex / `rgb(` /
`text-white` / Tailwind palette colours in `src/**/*.tsx|ts` (outside palette.ts) finds nothing.

## Existing test assertions changed

| Test | Old | New | Why |
|---|---|---|---|
| `tests/appFrame.test.tsx` "collapses to the icon rail…" | expanded rail: link `title` is `null` | expanded rail: `title` is "Projects" (collapsed assertion unchanged) | The hydration fix makes the tooltip unconditional; a state-dependent title is exactly the bug. |
| `tests/themeSwitch.test.tsx` `beforeEach` | clears localStorage | also calls `resetThemeMemory()` | Setup only: the new in-memory fallback is module state and the "localStorage throws" test would leak "dark" into the next test. No assertion changed. |
| `tests/theme.test.ts` contrast lists | – | added pairs above | New colour pairs. |

No other existing assertion changed: `kpiUi`, `projectsUi`, `adminUi`, `errorPages`, `uiKit`, `nav`, B1 tests pass
untouched.

### Accessible-name / markup changes worth knowing (no test relied on them)
- Brand/division "Rename" buttons are now named "Rename <name>" and request-type "Save type" is "Save type <name>"
  (they repeated per row; the brief requires unique names). Visible text unchanged.
- Admin section nav label "Admin" → "Admin sections", items "People and access" / "Brands, divisions, types" →
  "Users" / "Lists" (brief). Page h1s unchanged.
- Users table: "Full name" and "Title" columns folded into the Name cell (with sr-only "Full name:"/"Title:"); Team
  table: "Role" column folded into the Name cell as a chip; Projects: "Days left" column folded into Due.
- My KPI no-access and Team KPI / Admin 403: now EmptyState panels (still `role="alert"` with the same sentence; the
  My KPI one gained the "403 · Access denied" h1). TargetEditor Save is the kit Button (`aria-busy` while saving).

## New tests (+95 over B1: 853 → 883 after commit 1 → 948; contrast cases: +16 KPI, +10 timeline, +2 admin)

- Commit 1 (+30 over 853): `tests/shellHydration.test.tsx` (3), `tests/shellNavGating.test.tsx` (6),
  `tests/kitReviewFixes.test.tsx` (16), contrast cases.
- `tests/kpiRedesign.test.tsx` (19): tile values/formatting, null → "—" + hints, workload only for designers;
  thresholds 0/49/50/99/100/140 and constants; monthly bar fill + words + check; compact bar colours, % text, sr-only
  level, clamped aria; team summary math (incl. no targets / no rows); team table person cell, headers, caption,
  unique Save/target names; chart card heading/figcaption/details/table; month picker GET form; KPI skeletons;
  AccessDenied.
- `tests/projectsRedesign.test.tsx` (8): one card, group header order/tone/count; project status chip tones + icon;
  owner avatar, deadline chip only for open projects, no Days left column; unique Edit links; empty state; timeline
  bar tone/status text/today marker/legend; form cards, kit fields, buttons; skeletons.
- `tests/adminRedesign.test.tsx` (10): chip helpers; Users h1/switcher/h2s; table cells and chips, unique Edit
  summaries and buttons; allowed-emails rows; confirm step danger button; Lists cards, unique Rename/Save type, type
  chip; 403 EmptyState with no queries; admin skeleton; error page; in-shell not-found has no `<main>`.

## Checks

Each commit: `npm run lint` 0/0, `npx tsc --noEmit` clean, `npm run build` passes (all app routes still partial
prerender), `npx vitest run` green (final: 70 files / 948 tests). No DB, dev server, `.pgdata` or `.next/dev` was
touched; `npm install tailwind-merge@3.6.0 --save-exact --ignore-scripts` used a private cache in the session scratchpad.

## Not verified without a browser

- The hydration fix is proven in jsdom with a simulated streamed boundary; confirm the console is clean on a real
  page load with the rail collapsed (and in dark mode).
- Native tooltips: every sidebar link now has a `title`, so hovering an expanded link also shows its (redundant)
  tooltip. If that is unwanted, a CSS-only tooltip for the rail is the follow-up (the nav scroll container would clip
  it, which is why it was not done here).
- Recharts: rounded bars, tooltip card and cursor band, legend layout at 375 px; the `type="month"` pill in Safari
  (no native month picker there; it falls back to a text field with the same pattern, as before).
- Timeline: the "Today" label sits at the top of the week header; check it does not hide a week label you need.
- Admin `<details>` panels inside the users table (min 18rem) and the 60rem table at 1024/375 px; the confirm box
  inside the allowed-emails rows.
- The `::after` hit-area extension on small buttons next to other controls (it overlaps neighbours by 2px vertically).
