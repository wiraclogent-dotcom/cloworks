# UI redesign: ClickUp / monday.com style in SKC colors

Status: approved by Wira on 2026-10-08 (direction preview shown in chat; choices: light theme by default, Deep Blue sidebar, redesign every page together).

## Why
After loading real data the app looks heavy: everything is dark navy (the theme follows the computer's dark-mode setting), cards and tables are low-contrast, and the top navigation bar feels like a prototype. Wira wants a professional work-management look like ClickUp or monday.com, still in our brand colors (SKC Deep Blue and Aqua).

## Principles
1. **Light, airy, scannable.** Light grey-blue canvas, white cards, soft borders, generous spacing. Color is used for meaning (status, deadline, motion), not decoration.
2. **Status is visible at a glance** with colored, labelled chips (icon + text, never color alone).
3. **People are visible**: round initials avatars for requester/assignee.
4. **Same pattern everywhere**: one page header, one card style, one table style, one form style.
5. **Brand**: Deep Blue `#09426D` (sidebar, titles, primary button), Aqua `#11AA9F` (active nav item, links, focus ring, progress, Done), Space Grey `#CCCCCC`, White. Inter font.
6. **Accessible**: WCAG AA text contrast on every chip/button, visible focus ring, status never by color only, reduced-motion respected, usable at 375px.
7. **No new features** in this pass (no inbox, no new fields). Behavior, routes, permissions and data stay exactly as they are.

## Theme
- **Default: light.** A dark theme exists, selected by the user with a switch (Light / Dark / System) in the sidebar footer; stored in `localStorage` (try/catch) and applied through `data-theme` on `<html>` by a tiny blocking inline script in the root layout so there is no flash. Without a stored choice the theme is LIGHT (not the OS setting).
- Both themes are defined as CSS variables in `src/app/globals.css`; components only use tokens (Tailwind theme classes), never hard-coded hex.

### Light tokens
| Token | Value | Use |
|---|---|---|
| `--background` | `#F4F6FA` | page canvas |
| `--surface` / card | `#FFFFFF` | cards, table, top bar, inputs |
| `--surface-muted` | `#F1F4F8` | segmented controls, hover rows, input fills |
| `--border` | `#E4E8EF` | hairlines |
| `--border-strong` | `#D0D7E2` | inputs, buttons |
| `--foreground` | `#1B2A3A` | body text |
| `--foreground-secondary` | `#5B6B7F` | secondary text |
| `--foreground-muted` | `#8190A3` | placeholders, hints (use only for non-essential text) |
| `--brand-deep-blue` | `#09426D` | titles, sidebar, primary button |
| `--brand-aqua` | `#11AA9F` | accent, active indicator, progress |
| `--brand-aqua-strong` | `#0B756D` | aqua text/links on white (AA) |
| `--sidebar` | `#09426D` | sidebar background |
| `--sidebar-hover` | `rgba(255,255,255,0.08)` | |
| `--sidebar-active` | `rgba(17,170,159,0.24)` | active item background |
| `--sidebar-foreground` | `#E6EEF6` / secondary `#9DB7CF` | |
| `--ring` | `#11AA9F` | focus ring (2px + 2px offset) |

### Dark tokens (optional theme)
Canvas `#0E1B29`, surface `#14263A`, surface-muted `#1B3249`, border `#243B52`, foreground `#E8EEF5`, secondary `#A9BBCD`, muted `#7D93A9`, sidebar `#0A2F4E`, primary button `#11AA9F` with `#062B47` text (contrast ≥ 4.5), tints derived as dark-mode counterparts (below).

### Status and tag palette (light | dark text on tint; each is a chip: tint background + dark text + icon + label)
| Meaning | Accent (borders, dots, column top bar) | Chip tint | Chip text |
|---|---|---|---|
| Requested | `#7A8CA5` | `#EAEFF5` | `#2B3A4D` |
| In progress | `#2F7FC1` | `#E3EEF9` | `#0C447C` |
| First look | `#7F77DD` | `#EEEDFE` | `#3C3489` |
| Done | `#11AA9F` | `#DDF4F1` | `#085041` |
| Cancelled | `#E24B4A` | `#FCEBEB` | `#791F1F` |
| Needs motion | `#D85A30` | `#FAECE7` | `#712B13` |
| Due soon (≤ 2 days) | `#BA7517` | `#FAEEDA` | `#633806` |
| Overdue | `#E24B4A` | `#FCEBEB` | `#791F1F` |
| Brand tag (Clogent) | `#378ADD` | `#E6F1FB` | `#0C447C` |
| Brand tag (Bubble Wash) | `#1D9E75` | `#E1F5EE` | `#085041` |
Dark theme: chips use the accent at 22% alpha over the surface with the 100/200 text stops of the same hue (text ≥ 4.5:1 on that background; add a unit test for every pair).
Avatars: 8 tint/text pairs chosen deterministically from a hash of the person's short name (same person = same color everywhere); initials = first letters of the first two words of the short name; unassigned = dashed circle with a `user-plus` icon.

### Shape, depth, type
- Radius: 8px controls, 12px cards, 999px chips/pills/avatars.
- Shadows: cards `0 1px 2px rgba(16,24,40,.06)`, raised/dragging `0 8px 24px rgba(16,24,40,.14)`; no heavy shadows.
- Font Inter. Base 14px/1.5. Page title 22px/600 Deep Blue; section titles 16px/600; table text 13px; chips 12px/500. Tabular numbers for counts, KPI values and dates.
- Spacing on a 4px grid; page padding 24px (16px on mobile); card padding 16px.
- Motion: 120–180ms ease-out for hover/focus/expand; nothing animates under `prefers-reduced-motion`.

## Layout
- **Sidebar (left, 232px, Deep Blue)** replaces the top navigation bar: logo mark + "Creative Tracker"; groups "Work" (Requests, New request, Projects), "Insights" (My KPI, Team KPI — Team KPI only for users with `dashboard.team`), "Admin" (Admin — only `admin.manage`); active item = Aqua-tinted pill + Aqua icon; footer = user chip (avatar, name, role), theme switch, sign out. Collapses to a 64px icon rail (button; state remembered in `localStorage`); below 768px it becomes an off-canvas drawer opened by a hamburger in a slim top bar. Keyboard accessible (skip link to main content, `aria-current="page"`).
- **Page header** on every page: title (+ optional count), optional segmented view switcher (Board / Table), primary action on the right ("New request" button, Deep Blue).
- **Content** on the light canvas: filters row of pill-style dropdowns, then the page body in white cards.
- Sign-in page: centered white card on the light canvas with the logo mark, short tagline, and the two provider buttons (kept), plus the existing error line.

## Components (build once, reuse)
Button (primary Deep Blue / secondary white+border / ghost / danger; sizes sm, md; icon support), IconButton, Chip/Badge, StatusChip, Avatar + AvatarStack, Card, PageHeader, Segmented control, Tabs, Input/Select/Textarea (36px, Aqua focus ring, clear error state with icon + text), RadioCards (used for "Does this task need motion?"), Checkbox/Switch, Table (sticky header, zebra none, row hover, status chip cells, avatar cells, compact density), EmptyState (icon, headline, one line, action), Alert/Toast, ProgressBar (rounded 8px track; Aqua fill; ≥100% shows a check), KPI tile (tinted icon tile, big number, label, small delta/ratio), Modal/Dialog (existing DoneDialog restyled), Skeleton (loading).

## Pages
1. **Requests board**: columns with a colored top bar (status accent), icon + name + count pill, white cards (title 14px/500 max 2 lines, brand tag, deadline chip, Needs-motion chip, requester name, assignee avatar), drag handle on hover/focus, drop-target highlight keeps the dashed outline + text, column footer "Showing X of Y / Show more / Open in table". Keep all existing behavior (drag and drop, limits, counts, a11y announcements).
2. **Requests table**: monday-style: sticky header, row hover, Status as chip, Requester/Assignee with avatar + name, Deadline with due chip, Needs motion chip next to the title, pagination bar styled as a footer.
3. **New request**: two-column card layout on desktop (form left, short "What happens next" help card right), single column on mobile; "Does this task need motion?" as two RadioCards (No / Yes, needs motion) with icons; inline errors; primary "Create request" button.
4. **Request detail**: header with title, status chip, Needs-motion and KPI chips; left column (brief, notes, links, comments), right column "Details" card (requester, assignee, brand, division, dates, outputs), status timeline restyled, manage panel (assign, move, toggles) in a card.
5. **My KPI / Team KPI**: KPI tiles (tasks done, target, progress, on-time, outputs, workload), rounded progress bars, restyled trend chart (Aqua for done, Deep Blue for target, tokens only), team table with avatars and inline progress.
6. **Projects**: table + timeline restyled with the status chips; project statuses mapped to the same chip palette.
7. **Admin**: users/lists pages as cards and tables with the same inputs/buttons; destructive actions use the danger button + confirm step.
8. **Sign-in, error, not-found** pages restyled.

## Verification (definition of done)
- Lint, types, build and the full test suite pass; contrast unit tests cover every text/background pair in light and dark (≥ 4.5:1 body and chip text, ≥ 3:1 for large text and UI boundaries).
- Existing behavior unchanged (all current tests keep passing; only class names/markup that tests assert may change, and each such change is listed).
- Real-browser check with the real data at 1280, 1024 and 375 px, in light and dark: board, table, new request, detail, My KPI, Team KPI, projects, admin, sign-in; no horizontal page scroll, no clipped text, focus ring visible, keyboard path through sidebar and board works.
- No hard-coded colors outside `globals.css` and the avatar/status palette modules.
