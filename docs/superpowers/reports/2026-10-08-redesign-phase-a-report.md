# UI redesign, Phase A (foundation) report

Date: 2026-10-08. Branch `feat/creative-request-tracker`, on top of `584b77d`.
Spec: `docs/superpowers/specs/2026-10-08-ui-redesign-design.md`.

## What was built

| Area | Files |
|---|---|
| Tokens (light default, dark via attribute) | `src/app/globals.css` |
| Palette (status, tags, avatars, initials) | `src/lib/palette.ts` |
| Theme / sidebar preference + boot script | `src/lib/theme.ts`, `src/app/layout.tsx` (inline `<script>` in `<head>`, `LucideProvider strokeWidth=1.75`) |
| Labels / deadline helpers (pure, client-safe) | `src/lib/statusLabels.ts` (+ `PROJECT_STATUS_LABEL`, re-exported by `src/lib/projects.ts`), `src/lib/deadline.ts` |
| Active route rule | `src/lib/nav.ts` (`activeNavHref`: longest matching segment prefix) |
| Sidebar shell | `src/components/AppShell.tsx` (server: `requireUserOrRedirect` + `can()` checks, each per-user read in Suspense), `src/components/shell/AppFrame.tsx` (client: collapse, drawer, skip link, `<main id="main">`), `src/components/shell/NavItem.tsx`, `SidebarContext.ts`, `classes.ts` |
| UI kit | `src/components/ui/*` (+ `README.md`) |
| Sign-in / error / not-found | `src/app/signin/page.tsx`, `src/app/(app)/error.tsx`, `src/app/not-found.tsx` |
| Pages fitted into the shell | every `src/app/(app)/**/page.tsx` (own `<main>` + padding removed), `requests/page.tsx` (PageHeader + SegmentedControl + New request button), `admin/AdminTabs.tsx` (SegmentedControl), `Board.tsx` (`data-page-wide`), `DoneDialog.tsx` (theme-safe backdrop, 12px radius), `kpi/ProgressBar.tsx` (Aqua fill), `kpi/TargetEditor.tsx` (`text-danger` instead of `text-red-700 dark:text-red-300`) |
| Docs | `README.md` "Design system" section, `src/components/ui/README.md` |
| Tests (new) | `tests/palette.test.ts`, `tests/nav.test.ts`, `tests/themeSwitch.test.tsx`, `tests/appFrame.test.tsx`, `tests/uiKit.test.tsx`; `tests/theme.test.ts` rewritten/extended |
| Dependency | `lucide-react` 1.53.0 (exact pin; named imports only) |

## Theme mechanics

- `:root` = light (no `prefers-color-scheme` anywhere in the CSS); `:root[data-theme="dark"]` overrides.
- `<html data-theme="light" suppressHydrationWarning>` is the server default. `THEME_INIT_SCRIPT` (ES5, try/catch) runs
  blocking in `<head>`: reads `localStorage["ct-theme"]` (light | dark | system, default light), resolves `system`
  with `matchMedia`, sets `data-theme` to `light` or `dark` and `color-scheme`; also restores
  `data-sidebar="collapsed"` from `ct-sidebar`. So the attribute is always light/dark at paint time.
- `ThemeSwitch` (sidebar footer) writes `ct-theme` (try/catch) and applies immediately; while "System" is chosen it
  follows OS changes live; other tabs sync via the `storage` event.
- `dark:` Tailwind variant re-pointed to the attribute (`@custom-variant dark`), so it can never follow the OS.
- Sidebar collapse is CSS-driven by `<html data-sidebar>` (no flash); `.sb-label` becomes visually hidden (still the
  accessible name), `NavItem` adds a `title` tooltip when collapsed.

## Token table (as implemented)

| Token | Light | Dark | Tailwind class |
|---|---|---|---|
| `--background` | `#f4f6fa` | `#0e1b29` | `bg-background` |
| `--surface` (= `--card`, `--popover`) | `#ffffff` | `#14263a` | `bg-surface`, `bg-card` |
| `--surface-muted` (= `--muted`, `--secondary`) | `#f1f4f8` | `#1b3249` | `bg-surface-muted`, `bg-muted` |
| `--border` | `#e4e8ef` | `#243b52` | `border-border` |
| `--border-strong` | `#d0d7e2` | `#34506b` | `border-border-strong` |
| `--input` (field outline) | `#8493a7` | `#5f7a96` | `border-input` |
| `--foreground` (= `--card-foreground`, `--secondary-foreground`) | `#1b2a3a` | `#e8eef5` | `text-foreground` |
| `--foreground-secondary` (= `--muted-foreground`) | `#5b6b7f` | `#a9bbcd` | `text-foreground-secondary`, `text-muted-foreground` |
| `--foreground-muted` | `#8190a3` | `#7d93a9` | `text-foreground-muted` (hints only) |
| `--heading` | `#09426d` | `#e8eef5` | `text-heading` (base style for every `h1`) |
| `--link` | `#0b756d` | `#4fd1c5` | `text-link` |
| `--primary` / `--primary-foreground` | `#09426d` / `#ffffff` | `#11aa9f` / `#062b47` | `bg-primary text-primary-foreground` |
| `--primary-hover` | `#0b3a60` | `#3cc9be` | `hover:bg-primary-hover` |
| `--accent` / `--accent-foreground` (Aqua tint) | `#ddf4f1` / `#085041` | `#134350` / `#9fe1cb` | `bg-accent text-accent-foreground` |
| `--destructive` / fg / hover | `#c2342f` / `#ffffff` / `#a82b27` | same | `bg-destructive` |
| `--danger-text` | `#c2342f` | `#f27a79` | `text-danger` |
| `--ring` | `#0e9a90` | `#11aa9f` | `outline-ring` (base `:focus-visible`: 2px + 2px offset) |
| `--sidebar` | `#09426d` | `#0a2f4e` | `bg-sidebar` |
| `--sidebar-foreground` / secondary | `#e6eef6` / `#9db7cf` | same | `text-sidebar-foreground(-secondary)` |
| `--sidebar-hover` / `--sidebar-active` | `rgba(255,255,255,.08)` / `rgba(17,170,159,.24)` | `.07` / `.24` | `bg-sidebar-hover`, `bg-sidebar-active` |
| `--sidebar-accent`, `--sidebar-ring` | `#4fd1c5` | `#4fd1c5` | active icon, focus in sidebar |
| `--sidebar-border` | `rgba(255,255,255,.12)` | `.10` | |
| `--chart-done` / `--chart-target` / `--chart-grid` | `#0b756d` / `#09426d` / border | `#11aa9f` / `#a9bbcd` / border | `bg-chart-done` |
| `--elevation-card` / `--elevation-raised` | `0 1px 2px rgba(16,24,40,.06)` / `0 8px 24px rgba(16,24,40,.14)` | darker alpha | `shadow-card`, `shadow-raised` |
| `--backdrop` | `rgba(16,24,40,.45)` | `rgba(4,10,18,.6)` | dialogs, drawer |
| Brand (unchanged) | `#09426d`, `#11aa9f`, `#cccccc`, `#ffffff`, `#0b756d`, `#062b47` | same | `bg-brand-*` |
| Status/tag | `--status-<tone>-accent/tint/text` (11 tones) | dark set | `data-tone="<tone>"` + `bg-tone-tint text-tone-text border-tone-accent` |
| Avatars | `--avatar-1..8-tint/text` | dark set | via `avatarColor()` |

Status → tone: REQUESTED requested, ON_PROGRESS in-progress, FIRST_LOOK first-look, DONE done, CANCELLED cancelled;
projects NOT_STARTED requested, IN_PROGRESS in-progress, IN_REVIEW first-look, DONE done, ON_HOLD due-soon.
Brands: "Clogent" → tag-clogent, "Bubble Wash" → tag-bubble-wash, anything else tag-neutral.

## Contrast results (all asserted in `tests/theme.test.ts`)

Semi-transparent sidebar pills are flattened over `--sidebar` before measuring.

| Pair (fg on bg) | Min | Light | Dark |
|---|---|---|---|
| `--foreground` on `--background` | 4.5 | 13.49 | 14.89 |
| `--foreground` on `--surface` | 4.5 | 14.59 | 13.14 |
| `--foreground` on `--surface-muted` | 4.5 | 13.23 | 11.24 |
| `--foreground-secondary` on `--surface` | 4.5 | 5.45 | 7.80 |
| `--foreground-secondary` on `--background` | 4.5 | 5.04 | 8.84 |
| `--foreground-secondary` on `--surface-muted` | 4.5 | 4.94 | 6.68 |
| `--heading` on `--surface` | 4.5 | 10.44 | 13.14 |
| `--heading` on `--background` | 4.5 | 9.65 | 14.89 |
| `--link` on `--surface` | 4.5 | 5.56 | 8.23 |
| `--link` on `--background` | 4.5 | 5.14 | 9.32 |
| `--primary-foreground` on `--primary` | 4.5 | 10.44 | 5.04 |
| `--primary-foreground` on `--primary-hover` | 4.5 | 11.74 | 7.12 |
| `--destructive-foreground` on `--destructive` | 4.5 | 5.49 | 5.49 |
| `--destructive-foreground` on `--destructive-hover` | 4.5 | 6.91 | 6.91 |
| `--danger-text` on `--surface` | 4.5 | 5.49 | 5.73 |
| `--accent-foreground` on `--accent` | 4.5 | 8.18 | 7.25 |
| `--foreground` on `--accent` | 4.5 | 12.71 | 9.24 |
| `--foreground-secondary` on `--accent` | 4.5 | 4.74 | 5.49 |
| `--sidebar-foreground` on `--sidebar` | 4.5 | 8.91 | 11.72 |
| `--sidebar-foreground-secondary` on `--sidebar` | 4.5 | 5.02 | 6.61 |
| `--sidebar-foreground` on hover pill | 4.5 | 7.15 | 9.52 |
| `--sidebar-foreground` on active pill | 4.5 | 6.43 | 7.97 |
| `--sidebar-accent` (icon) on active pill | 3 | 4.04 | 5.00 |
| `--sidebar-ring` on `--sidebar` | 3 | 5.60 | 7.36 |
| `--ring` against `--surface` | 3 | 3.47 | 5.32 |
| `--ring` against `--background` | 3 | 3.21 | 6.02 |
| `--ring` against `--surface-muted` | 3 | 3.15 | 4.55 |
| `--ring` against `--accent` | 3 | 3.03 | 3.74 |
| `--input` against `--surface` | 3 | 3.13 | 3.44 |
| `--foreground-muted` against `--surface` | 3 | 3.26 | 4.84 |
| `--chart-done` against `--card` | 3 | 5.56 | 5.32 |
| `--chart-target` against `--card` | 3 | 10.44 | 7.80 |
| `--brand-aqua-strong` on white | 4.5 | 5.56 | – |

| Chip tone | Light text/tint | Ratio | Dark text/tint | Ratio |
|---|---|---|---|---|
| requested | #2b3a4d / #eaeff5 | 10.01 | #d3dce8 / #2a3c52 | 8.13 |
| in-progress | #0c447c / #e3eef9 | 8.37 | #b5d4f4 / #1a3a58 | 7.65 |
| first-look | #3c3489 / #eeedfe | 8.89 | #cecbf6 / #2c385e | 7.36 |
| done | #085041 / #ddf4f1 | 8.18 | #9fe1cb / #134350 | 7.25 |
| cancelled | #791f1f / #fcebeb | 8.98 | #f7c1c1 / #412e3e | 7.92 |
| needs-motion | #712b13 / #faece7 | 8.86 | #f5c4b3 / #3f3138 | 7.86 |
| due-soon | #633806 / #faeeda | 8.72 | #fac775 / #393732 | 7.64 |
| overdue | #791f1f / #fcebeb | 8.98 | #f7c1c1 / #412e3e | 7.92 |
| tag-clogent | #0c447c / #e6f1fb | 8.60 | #b5d4f4 / #1c3c5e | 7.37 |
| tag-bubble-wash | #085041 / #e1f5ee | 8.28 | #9fe1cb / #164047 | 7.59 |
| tag-neutral | #3a4a5e / #f1f4f8 | 8.20 | #d3dce8 / #2c3d51 | 8.01 |

| Avatar | Light text/tint | Ratio | Dark text/tint | Ratio |
|---|---|---|---|---|
| 1 | #0c447c / #e6f1fb | 8.60 | #b5d4f4 / #1e4268 | 6.73 |
| 2 | #085041 / #ddf4f1 | 8.18 | #9fe1cb / #134b56 | 6.51 |
| 3 | #3c3489 / #eeedfe | 8.89 | #cecbf6 / #323d68 | 6.74 |
| 4 | #712b13 / #faece7 | 8.86 | #f5c4b3 / #4b3537 | 7.21 |
| 5 | #633806 / #faeeda | 8.72 | #fac775 / #423c30 | 7.02 |
| 6 | #72243e / #fbeaf0 | 8.90 | #f4c0d1 / #4a334d | 7.11 |
| 7 | #27500a / #eaf3de | 8.21 | #c0dd97 / #2a4633 | 6.94 |
| 8 | #2b3a4d / #eaeff5 | 10.01 | #d3dce8 / #314358 | 7.31 |

Not asserted (by design): chip/column **accent** colours against white (e.g. Done `#11AA9F` 2.89:1, Requested 3.43:1).
Accents are decoration only (column top bar, dots); status is always icon + label on the AA tint. `--border` and
`--border-strong` hairlines are also decorative (cards/buttons are identified by text and fill).

## Adjustments to the spec's values

1. **Focus ring (light)**: spec `--ring #11AA9F` is 2.89:1 on white and 2.67:1 on the canvas (< 3:1). Implemented
   `#0E9A90` (same hue, one step darker): 3.47 on white, 3.21 on canvas, 3.03 on the Aqua tint. Dark keeps `#11AA9F`.
   `--brand-aqua` itself is unchanged.
2. **Active sidebar icon**: brand Aqua on the active pill (`rgba(17,170,159,.24)` over Deep Blue) is 2.61:1. Added
   `--sidebar-accent #4FD1C5` (lighter Aqua, same hue): 4.04:1 (light) / 5.00:1 (dark). Also used as `--sidebar-ring`.
3. **Field outline**: spec says inputs use `--border-strong #D0D7E2` (1.45:1 vs white). The spec's own definition of
   done requires 3:1 for UI boundaries, so fields use a separate `--input #8493A7` (3.13:1); dark `#5F7A96` (3.44:1).
   `--border-strong` stays as specified for buttons/dashed outlines.
4. **`--muted-foreground`** is mapped to `--foreground-secondary #5B6B7F` (AA), not `--foreground-muted #8190A3`
   (3.26:1), because existing pages use `text-muted-foreground` for real content. `--foreground-muted` is for hints.
5. **Dark chip/avatar tints**: spec "accent at 22% alpha over the surface" implemented as opaque hexes (accent at 22%
   over `#14263A`; avatars 28%) so they can be measured; text uses the 100/200 stop of the hue. All ≥ 7.25:1.
6. **Not in the spec, added**: `--heading`, `--link`, `--primary-hover`, `--destructive*`/`--danger-text` (`#C2342F`,
   same hue as the Cancelled accent, 5.49:1 with white), `--backdrop`, `--chart-grid`, neutral tag tone, 8 avatar pairs.
7. **Label text**: STATUS_LABEL keeps "On progress" (spec table says "In progress"; data/labels are out of scope).

## Existing test assertions changed

- `tests/theme.test.ts` "semantic tokens map to the brand": asserted `--foreground = #09426d` and
  `--border = #cccccc` (old dark-blue-text theme). The spec makes body text `#1B2A3A` and hairlines `#E4E8EF`, so the
  test now asserts the new mapping (and that brand hexes are unchanged). The `token()` helper now reads the light
  (`:root`) and dark (`:root[data-theme="dark"]`) rules separately. All other original assertions kept.
- No other existing test needed changes (board, boardCard, needsMotionBadge, signinPage, filterBar etc. pass unchanged:
  `StatusBadge`/`NeedsMotionBadge` keep their names and roles; the sign-in error is still `role="alert"` with exactly
  the message as text).

## UI kit (src/components/ui)

| Component | Props summary |
|---|---|
| `cn()`, `focusRing` | class join; the standard focus classes |
| `Button`, `buttonClass()` | `variant` primary/secondary/ghost/danger, `size` sm(32px)/md(36px), `block`, `loading` (spinner + aria-busy + disabled), `icon`, `iconRight`; `type` defaults to button |
| `IconButton` | `aria-label` (required, also title), `icon`, `size`, `variant` |
| `Card`, `CardHeader`, `CardTitle` | `padded`; `actions`; `as` h2/h3/h4 |
| `PageHeader` | `title`, `count`, `description`, `switcher`, `actions` (renders the `<h1>`) |
| `SegmentedControl` | `label`, `value`, `items[{value,label,icon,href|onSelect}]` (links → aria-current, buttons → aria-pressed) |
| `Chip`, `BrandTag`, `CountPill` | `tone`, `icon`; `name`; `value` |
| `StatusIcon`, `StatusChip` | `status: RequestStatus | ProjectStatus` |
| `DeadlineChip` | `daysLeft` (overdue / due soon ≤ 2 / on track / none; text from `deadlineText`) |
| `NeedsMotionChip` | – (clapperboard + "Needs motion") |
| `Avatar`, `UnassignedAvatar`, `AvatarStack` | `name`, `size` sm/md/lg, `ring`, `decorative`; `names`, `max`, `label` |
| `fieldClass()`, `labelClass`, `hintClass`, `FieldError` | `kind`, `invalid`, `size`; `id` |
| `RadioCards` | `name`, `legend`, `options`, `value`/`defaultValue`, `onChange`, `required`, `invalid`, `describedBy`, `columns` |
| `ProgressBar` | `value`, `max`, `label`, `hideLabel`, `valueText` (clamped bar, check at ≥ 100%) |
| `KpiTile` | `icon`, `label`, `value`, `sub`, `tone` |
| `EmptyState` | `icon`, `title`, `description`, `action` |
| `Alert` | `tone` info/success/warning/danger, `title`, `action`, `role` (null = silent) |
| `Skeleton` | `rounded` |
| `tableClass()` | `compact`, `minWidth` → `wrapper/table/th/tr/td/rowHeader/numeric` |
| `Divider` | `label` |
| `LogoMark` | `size` |
| `ThemeSwitch` (client) | `tone` surface/sidebar |

## Shell notes

- Groups: Work (Requests, New request, Projects), Insights (My KPI, Team KPI only with `dashboard.team`), Admin (only
  `admin.manage`). The checks are the same `requireUserOrRedirect()` + `can()` calls as before, each in its own
  Suspense; sign-out is the same inline server action (`signOut({ redirectTo: "/signin" })`).
- The nav label "KPI" became "My KPI" (spec wording).
- Active state: `usePathname()` is request data under cacheComponents, so each `NavItem` streams its active state in a
  Suspense boundary (fallback = same link, not highlighted). AppFrame itself does not read the pathname; following a
  link from the mobile drawer closes it.
- Mobile drawer: hamburger `aria-expanded/aria-controls`, focus moves to the drawer's close button, Escape / backdrop /
  close button close it and return focus to the hamburger, `<main>` and the top bar are `inert` while open, body scroll
  is not locked, resizing past 768px closes it.
- Content: 24px padding (16px < 768px), `max-width: 1440px` centred; the board opts out with `data-page-wide`
  (`.app-content:has([data-page-wide])`) so it keeps the full width.

## Checks

`npm run lint` 0 errors / 0 warnings; `npx tsc --noEmit` clean; `npm run build` passes (all app routes partial
prerender as before); `npx vitest run` 60 files / 797 tests green (609 before; +188 new).

## Not verified without a browser

- Real rendering of both themes, the 64px rail, the drawer animation, and focus-ring visibility on every surface.
- No flash on load (script order is right and the attribute is set before paint, but only a browser proves it).
- Hydration: `<html>` attributes differ from the server HTML on purpose (`suppressHydrationWarning`); check the
  console for warnings about the inline `<script>` in dev.
- Sticky table headers only stick inside a height-limited wrapper (documented in the kit README).
- Pages are not redesigned (Phase B): they inherit the new tokens (light canvas, white cards, Deep Blue primary
  buttons, Aqua focus) but still use their old layouts, `rounded-md` controls and plain-text status in some places
  (e.g. board cards, ProjectTable icons).
- Commit trailer: commits use `Co-Authored-By: Claude Opus 5.5` (the session's configured attribution), not the
  "Sonnet 5.5" line in the brief.
