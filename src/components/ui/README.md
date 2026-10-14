# UI layer: shadcn first

Every screen is built from two folders, in this order of preference:

1. **`src/components/shadcn/`**: shadcn/ui components (Radix underneath), restyled with our tokens. **Default for
   every generic element**: buttons, fields, dialogs, menus, popovers, tabs, badges, cards, alerts, skeletons, tables…
2. **`src/components/ui/`** (this folder): our own kit, **only** for what shadcn does not have: domain components
   (`StatusChip`, `DeadlineChip`, `KpiTile`, `PageHeader`, `BrandArt`…) and small helpers (`cn`, `focusRing`,
   `darkMode`). A kit component that needs a generic part composes the shadcn one (e.g. `StatusChip` renders a
   shadcn `Badge`) instead of re-creating it.
3. **Neither has it?** Add it to the kit (documented in the table below), never inline in a page. Before writing one,
   check the shadcn catalogue (https://ui.shadcn.com/docs/components): it is larger than it looks (`Empty`, `Field`,
   `Native Select`, `Input OTP`, `Input Group`, `Spinner`, `Kbd`, `Item`, `Toggle Group`, `Sheet`, `Combobox`…).

The same order applies to **tokens**: use the shadcn token names first, our extension tokens only for roles shadcn has
no name for (see [Tokens](#tokens-globalscss)).

Migration to this order is in progress (plan and audit:
`docs/superpowers/specs/2026-10-14-shadcn-first-design.md`). Until a kit component is marked **Migrated** in
[Component map](#component-map), existing code may still use it, but **new code uses the shadcn component**.

## Adding a shadcn component

```bash
npx shadcn@latest add <name>      # e.g. dialog, dropdown-menu, badge
```

`components.json` sends the files to `@/components/shadcn` (kebab-case file names, as the CLI writes them) and
rewrites the `cn` import to `@/components/ui/cn`. Then, in the generated file:

- Replace any literal colour or Tailwind palette class with our tokens; keep only shadcn token names
  (`bg-primary`, `text-muted-foreground`, `border-input`…).
- Match our sizes and shape: controls 36px high (`h-9`), `size="sm"` 32px; controls `rounded-lg`, cards `rounded-xl`,
  badges `rounded-md`; overlays use `shadow-raised`, cards `shadow-card`; transitions 150 ms.
- Keep Radix's roles, focus handling and keyboard support; don't strip `data-slot` attributes.
- Always pass an explicit `variant` to `Button` (`default` is the primary look; use `outline` for a plain button);
  `tests/buttonUsage.test.ts` enforces it. Icon-only buttons: `size="icon"` / `"icon-sm"` with `aria-label` and a
  matching `title`. A link that looks like a button: `<Button asChild variant="…"><Link …/></Button>`.
- Add our extra variants/props to the shadcn file itself (it is our code now), e.g. `Button` gets `loading` and
  `icon`. Don't wrap it in a second component just to add a prop.
- Import from the file: `import { Button } from "@/components/shadcn/button"`.

Run `npm run typecheck` and the tests that cover the screens you touched.

## Tokens (globals.css)

**shadcn tokens (use these first):**

| Use | Class |
|---|---|
| Page canvas | `bg-background` |
| Card / popover surface | `bg-card text-card-foreground` / `bg-popover text-popover-foreground` |
| Hover fill, quiet surface | `bg-muted` (also `bg-secondary` for secondary buttons) |
| Text: body / secondary | `text-foreground` / `text-muted-foreground` |
| Hairline / field outline | `border-border` / `border-input` |
| Primary action | `bg-primary text-primary-foreground` |
| Destructive fill | `bg-destructive text-destructive-foreground` |
| Selected / Aqua tint | `bg-accent text-accent-foreground` |
| Focus | automatic (`:focus-visible` 2px `--ring` + 2px offset); `focusRing` from `./cn` when you need it explicitly |
| Sidebar | `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `ring-sidebar-ring` … |
| Charts | `chart-*` (`chart-cat-1…5`, `chart-done`, `chart-target`, `chart-grid`) |

**Extension tokens (only where shadcn has no role):**

| Use | Class |
|---|---|
| Page and card titles | `text-heading` (Deep Blue light, near-white dark; every `<h1>` gets it by default) |
| Links | `text-link` (Aqua strong, AA on white) |
| Error **text** | `text-danger` (text-safe red; `destructive` is the fill) |
| Placeholders | `placeholder:text-placeholder` (AA) |
| Non-text only (decorative icons) | `text-foreground-muted` (3:1, never for text) |
| Button border | `border-border-strong` |
| Primary / destructive hover | `hover:bg-primary-hover` / `hover:bg-destructive-hover` |
| Depth | `shadow-card` (resting), `shadow-raised` (dragging, dialogs, menus, drawer) |
| Status colours | `data-tone="<tone>"` + `bg-tone-tint text-tone-text border-tone-accent` |
| Brand | `brand-*` (landing, auth and emails only) |

The old aliases `bg-surface`, `bg-surface-muted` and `text-foreground-secondary` were removed; use `bg-card` (or
`bg-popover` in overlays), `bg-muted` and `text-muted-foreground`. `tests/tokenNames.test.ts` fails if one comes back.

Tones (`src/lib/palette.ts`): `requested`, `in-progress`, `first-look`, `done`, `cancelled`, `needs-motion`, `due-soon`,
`overdue`, `tag-clogent`, `tag-bubble-wash`, `tag-neutral`. Example (board column top bar):
`<section data-tone="in-progress" className="border-t-4 border-tone-accent">`. Statuses map with
`REQUEST_STATUS_TONE` / `PROJECT_STATUS_TONE`; brands with `brandTone(name)`.

Shape: 8px controls (`rounded-lg`), 12px cards and dialogs (`rounded-xl`), 6px badges (`rounded-md`), pills/avatars
`rounded-full`. Plain `rounded` (4px) only for tiny handles inside media tiles.

Type: base 14px; page title 22px/600 (PageHeader); dialog title 16px/600; section/card title 16px/600 (`CardTitle`);
table 13px; badges and meta text 12px/500. Nothing smaller than 12px. Use `tabular-nums` for counts, dates and KPI
values. Spacing on the 4px grid; card padding 16px.

Layout: page padding comes from AppFrame only (never add it in a page). Page width is set on the shell, never with
`mx-auto max-w-*` in a page (that would pull the PageHeader top bar away from the pinned bell/profile menu): default
1440px; `data-page-width="medium"` (72rem: two-column details and forms, help articles); `data-page-width="narrow"`
(48rem: single-column forms and lists); `data-page-wide` (no cap: board, table, calendar, timeline). PageHeader owns
the header spacing (don't put it in a `gap-*`/`space-y-*` parent). Sections below it are 20px apart (`space-y-5`,
`mt-5`/`mb-5`); a toolbar sits 16px above its content (`mb-4`); full-page error/denied panels use `mx-auto mt-6 max-w-xl`.

## Component map

Generic elements and where they come from. **Status**: *In use* = shadcn file exists and is the one to use;
*Planned* = not added yet (add it with the CLI the first time you need it, then use it); *Migrated* = the old kit
component is gone.

| Need | Use (shadcn) | Replaces (kit / hand-rolled) | Status |
|---|---|---|---|
| Action button, icon-only button, link styled as button | `Button` (`size="icon"` for icon-only, `asChild` for `<Link>`) | `ui/Button`, `buttonClass()`, `ui/IconButton`, local `iconBtn`/`yearBtn` classes | Migrated |
| Text field, textarea, label, hint, error | `Input`, `Textarea`, `Label` (`labelClassName` for a `<legend>`/`<span>`), `FieldDescription`, `FieldError` | `fieldClass()`, `labelClass`, `hintClass`, kit `FieldError`. Error look comes from `aria-invalid`. | Migrated |
| Select in a form | `NativeSelect` (native picker on phones; `className` = wrapper width, `selectClassName` = the select) | `<select className={fieldClass(...)}>`, `selectControl` | Migrated |
| Custom dropdown list (icons, rich rows) | `Select` | – | In use |
| Search-as-you-type picker | `Combobox` | – | Planned |
| Verification code | `Input OTP` | `/verify` code field | Planned |
| Dialog / confirm | `Dialog`, `Alert Dialog` | `ui/Modal`, `calendar/DayDialog`, `library/LibraryDialog`, `briefs/BriefDayDialog`, `DoneDialog` | Planned |
| Side panel / mobile drawer | `Sheet` | `Modal side="right"`, AppFrame drawer | Planned |
| Menu of actions | `Dropdown Menu` | Radix `DropdownMenu` used directly (profile, bell), `role="menu"` in `LibraryRow` | Planned |
| Floating panel (filters, month picker, info) | `Popover` | `<details>` popovers in `FilterBar`, `MonthPicker` | In use |
| Hint on hover/focus | `Tooltip` | `title=""` on icon buttons | Planned |
| Tabs / view switch | `Tabs` or `Toggle Group` | `ui/SegmentedControl`, Library category pills | Planned |
| Card | `Card` | `ui/Card`, inline `rounded-xl border bg-card` blocks | Planned |
| Tag, count, label pill | `Badge` | `ui/Chip`, `BrandTag`, `CountPill` | Planned |
| Inline message | `Alert` | `ui/Alert` | Planned |
| Empty list / no results / error page | `Empty` | `ui/EmptyState`, ad-hoc "No … yet" paragraphs | Planned |
| Loading placeholder / spinner | `Skeleton`, `Spinner` | `ui/Skeleton`, `LoaderCircle` spinners | Planned |
| Person | `Avatar` | `ui/Avatar` | Planned |
| On/off, choice | `Switch`, `Checkbox`, `Radio Group` | `ui/Switch`, `ui/RadioCards`, bare `accent-primary` checkboxes | Planned |
| Progress | `Progress` | `ui/ProgressBar`, `kpi/ProgressBar` | Planned |
| Collapsible block | `Collapsible` / `Accordion` | `<details>` in `CollapsibleSection`, admin lists | Planned |
| Table | `Table` | `tableClass()` | Planned |
| Separator | `Separator` | `ui/Divider` | Planned |
| Date picking | `Calendar` + `Popover` (our `DatePicker`) | – | In use |
| Toast | `Toast` (Sonner) | inline `role="status"` messages after actions | Planned (decide per flow) |

## Kit components (this folder)

Domain components stay here; when a row's generic part moves to shadcn, the component keeps its API and renders the
shadcn part inside.

| Component | File | Props (summary) | Use for |
|---|---|---|---|
| `PageHeader` | PageHeader.tsx | `title`, `count`, `description`, `switcher`, `actions` | Top of every page (renders the `<h1>`). |
| `StatusChip` | StatusChip.tsx | `status: RequestStatus \| ProjectStatus`, `kind?: "request" \| "project"` (pass `project` for project statuses: Canceled vs Cancelled) | Status anywhere (icon + label + tint). Old name `StatusBadge` still exported by `components/status`. |
| `StatusIcon` | StatusIcon.tsx | `status` | Bare shape icon (column headers). |
| `DeadlineChip` | DeadlineChip.tsx | `daysLeft: number \| null` | Open requests only: overdue / due soon (≤ 2 days) / on track / no deadline. |
| `NeedsMotionChip` | NeedsMotionChip.tsx | – | Needs-motion flag (old name `NeedsMotionBadge`). |
| `KpiTile` | KpiTile.tsx | `icon`, `label`, `value`, `sub`, `tone` | KPI rows. |
| `DatePicker` | DatePicker.tsx | shadcn `Calendar` + `Popover` | Date fields. |
| `PasswordInput` | PasswordInput.tsx | input + show/hide toggle | Password fields. |
| `SubmitButton` | SubmitButton.tsx | pending state from the form | Submit in server-action forms. |
| `FileLocationLink` | FileLocationLink.tsx | server path + copy | Design-folder paths. |
| `CountUp` | CountUp.tsx | animated number | KPI values. |
| `BrandArt`, `LogoMark` | BrandArt.tsx, LogoMark.tsx | `size` | Brand illustrations and mark (decorative). |
| `cn`, `focusRing` | cn.ts | – | Class merging (`tailwind-merge`: the LAST class wins on a conflict). |
| `darkMode` helpers | darkMode.ts | – | Client-only theme helpers. |

Still here until migrated (see Component map, don't use in new code): `Card`,
`Chip`, `Alert`, `EmptyState`, `Skeleton`, `Avatar`, `Switch`, `RadioCards`, `SegmentedControl`, `ProgressBar`,
`CollapsibleSection`, `Modal`, `Divider`, `table.ts`. Their props are documented in the files themselves.

## Do

- Reach for shadcn first, then the kit, then build (and document) a new kit component.
- Use tokens only, shadcn names first; status meaning always as icon + text, never colour alone.
- Keep one `PageHeader` per page and one primary button per view.
- Give long tables a max height so the header sticks.
- Keep every existing accessible name, role and `aria-*` a test relies on when restyling or migrating.
- Check new colour pairs in `tests/theme.test.ts` (add them there if you introduce one).

## Don't

- No hand-rolled dialogs, menus or popovers (`<dialog>` copies, `role="menu"` by hand, `<details>` used as a
  popover): use `Dialog`, `Dropdown Menu`, `Popover`.
- No card, field or button rebuilt from raw classes in a page (`rounded-xl border bg-card…`, local `iconBtn`
  constants): use the component.
- No arbitrary font sizes (`text-[11px]`…) outside the type scale above.
- No hex, `text-white`, `bg-black` or Tailwind palette colours (`red-600`…) in components. Tokens already switch with
  the theme, so `dark:` is rarely needed (if you must, it follows `data-theme`, not the OS).
- No gradients, glass, heavy shadows (`shadow-lg`/`shadow-xl`) or animation beyond 120–180 ms hover/focus
  transitions.
- Do not render another `<main>`: the shell owns `<main id="main">`; pages render a `<div>`.
- Do not add per-user data reads to the shell or layouts outside a `<Suspense>` boundary (cacheComponents).
- Hydration: in a client component, never derive props or markup from `window`, `localStorage`, `matchMedia`,
  `<html data-*>` or `Date.now()` during render through context/state that can differ from the server. Use
  `useSyncExternalStore` with a server snapshot (React uses it while hydrating), or render unconditionally and let CSS
  (`[data-sidebar]`, `[data-theme]`) decide. Late-hydrating Suspense boundaries see the client value otherwise
  (tests/shellHydration.test.tsx).
- Touch targets: `size="sm"` buttons are 32px visually with a 36px hit area (`::after`); keep at least 36px for
  anything else you make clickable.
