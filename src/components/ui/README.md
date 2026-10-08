# UI kit (Phase A foundation)

Small, typed, server-safe components (only `ThemeSwitch` is a client component). Every component takes `className`
(merged with `cn()` from `./cn`). Import each from its own file: `import { Button } from "@/components/ui/Button"`.
Spec: `docs/superpowers/specs/2026-10-08-ui-redesign-design.md`.

## Tokens (globals.css)

| Use | Class |
|---|---|
| Page canvas / card / hover fill | `bg-background` / `bg-card` (= `bg-surface`) / `bg-surface-muted` |
| Text: body / secondary / hint only | `text-foreground` / `text-foreground-secondary` (= `text-muted-foreground`) / `text-foreground-muted` |
| Page and card titles | `text-heading` (Deep Blue light, near-white dark; every `<h1>` gets it by default) |
| Links | `text-link` (Aqua strong, AA on white) |
| Hairline / button border / field outline | `border-border` / `border-border-strong` / `border-input` |
| Primary action | `bg-primary text-primary-foreground hover:bg-primary-hover` (prefer `buttonClass`) |
| Error text / destructive | `text-danger` / `bg-destructive` |
| Selected / Aqua tint | `bg-accent text-accent-foreground` |
| Focus | automatic (`:focus-visible` 2px `--ring` + 2px offset); `focusRing` from `./cn` when you need it explicitly |
| Depth | `shadow-card` (resting), `shadow-raised` (dragging, dialogs, drawer) |
| Status colours | `data-tone="<tone>"` + `bg-tone-tint text-tone-text border-tone-accent` |

Tones (`src/lib/palette.ts`): `requested`, `in-progress`, `first-look`, `done`, `cancelled`, `needs-motion`, `due-soon`,
`overdue`, `tag-clogent`, `tag-bubble-wash`, `tag-neutral`. Example (board column top bar):
`<section data-tone="in-progress" className="border-t-4 border-tone-accent">`. Statuses map with
`REQUEST_STATUS_TONE` / `PROJECT_STATUS_TONE`; brands with `brandTone(name)`.

Shape: 8px controls (`rounded-lg`), 12px cards (`rounded-xl`), 6px chips (`rounded-md`), pills/avatars `rounded-full`.
Type: base 14px; page title 22px/600 (PageHeader); section 16px/600 (CardTitle); table 13px; chips 12px/500. Use
`tabular-nums` for counts, dates and KPI values. Spacing on the 4px grid; card padding 16px.

## Components

| Component | File | Props (summary) | Use for |
|---|---|---|---|
| `Button`, `buttonClass()` | Button.tsx | `variant` primary/secondary/ghost/danger, `size` sm/md, `block`, `loading`, `icon`, `iconRight` | Actions. `buttonClass({variant,size})` styles `<Link>`/`<a>` the same way. One primary per view. |
| `IconButton` | IconButton.tsx | `aria-label` (required), `icon`, `size`, `variant` ghost/secondary | Icon-only actions (title = label). |
| `Card`, `CardHeader`, `CardTitle` | Card.tsx | `padded`; `actions`; `as` h2/h3/h4 | Every content block. |
| `PageHeader` | PageHeader.tsx | `title`, `count`, `description`, `switcher`, `actions` | Top of every page (renders the `<h1>`). |
| `SegmentedControl` | SegmentedControl.tsx | `label`, `value`, `items: {value,label,icon?,href?,onSelect?}[]` | Board/Table switch, tabs. Links → `aria-current`; buttons → `aria-pressed`. |
| `Chip`, `BrandTag`, `CountPill` | Chip.tsx | `tone`, `icon`; `name`; `value` | Tags and counts. |
| `StatusChip` | StatusChip.tsx | `status: RequestStatus \| ProjectStatus` | Status anywhere (icon + label + tint). Old name `StatusBadge` still exported by `components/status`. |
| `StatusIcon` | StatusIcon.tsx | `status` | Bare shape icon (column headers). |
| `DeadlineChip` | DeadlineChip.tsx | `daysLeft: number \| null` | Open requests only: overdue / due soon (≤ 2 days) / on track / no deadline. |
| `NeedsMotionChip` | NeedsMotionChip.tsx | – | Needs-motion flag (old name `NeedsMotionBadge`). |
| `Avatar`, `UnassignedAvatar`, `AvatarStack` | Avatar.tsx | `name`, `size` sm/md/lg, `ring`, `decorative`; `names`, `max`, `label` | People. Set `decorative` when the name is printed next to it. |
| `fieldClass()`, `labelClass`, `hintClass`, `FieldError` | Field.tsx | `kind` input/select/textarea, `invalid`, `size`; `FieldError id` | Forms: 36px fields, error = `invalid` + `aria-invalid` + `aria-describedby` → `FieldError`. |
| `RadioCards` | RadioCards.tsx | `name`, `legend`, `options {value,title,description?,icon?}`, `value`/`defaultValue`, `onChange`, `invalid`, `describedBy` | Few, important choices ("Does this task need motion?"). Real radios, works in plain forms. |
| `ProgressBar` | ProgressBar.tsx | `value`, `max`, `label`, `hideLabel`, `valueText` | Targets. ≥ 100% shows a check; bar clamps, text does not. |
| `KpiTile` | KpiTile.tsx | `icon`, `label`, `value`, `sub`, `tone` | KPI rows. |
| `EmptyState` | EmptyState.tsx | `icon`, `title`, `description`, `action` | Empty lists / no results. |
| `Alert` | Alert.tsx | `tone` info/success/warning/danger, `title`, `action`, `role` (null = silent) | Inline messages and form-level errors. |
| `Skeleton` | Skeleton.tsx | `rounded` | Suspense fallbacks (pair with visible "Loading…" text or `aria-busy`). |
| `tableClass()` | table.ts | `compact`, `minWidth` → `{wrapper, table, th, tr, td, rowHeader, numeric}` | Every table: sticky header, row hover, no zebra. |
| `Divider` | Divider.tsx | `label` | Separators. |
| `LogoMark` | LogoMark.tsx | `size` | Brand mark (decorative). |
| `ThemeSwitch` | ThemeSwitch.tsx (client) | `tone` surface/sidebar | Already in the sidebar footer; do not add another. |

## Do

- Use tokens only; status meaning always as icon + text, never colour alone.
- Keep one `PageHeader` per page and one primary button per view.
- Put tables inside `tableClass().wrapper`; give long tables a max height so the header sticks.
- Keep every existing accessible name, role and `aria-*` a test relies on when restyling.
- Check new colour pairs in `tests/theme.test.ts` (add them there if you introduce one).

## Don't

- No hex, `text-white`, `bg-black` or Tailwind palette colours (`red-600`…) in components. Tokens already switch with
  the theme, so `dark:` is rarely needed (if you must, it follows `data-theme`, not the OS).
- No gradients, glass, heavy shadows or animation beyond 120–180 ms hover/focus transitions.
- Do not render another `<main>`: the shell owns `<main id="main">`; pages render a `<div>`.
- Do not add per-user data reads to the shell or layouts outside a `<Suspense>` boundary (cacheComponents).
