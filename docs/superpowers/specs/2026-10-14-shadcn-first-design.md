# shadcn first: UI consolidation

Date: 2026-10-14 · Branch: `feat/shadcn-first` (from `feat/project-page`)

## Goal

Every generic element comes from shadcn/ui (`src/components/shadcn/`), restyled with our tokens; our kit
(`src/components/ui/`) keeps only domain components. Token names follow shadcn first. The screens should look the
same as today (or more consistent), not like a new design. Rules live in `src/components/ui/README.md`.

## Audit (2026-10-14, static code scan)

Consistency score 28/40 (Good). Tokens, forms (`fieldClass`), tables and `PageHeader` are already consistent. Drift:

| Sev | Drift | Where |
|---|---|---|
| P1 | 5 dialog implementations, 3 title styles (22px / 16px / 14px muted) | `ui/Modal`, `calendar/DayDialog`, `library/LibraryDialog`, `briefs/BriefDayDialog` (native `<dialog>` copies), `DoneDialog` (`div role="dialog"`) |
| P1 | 4 ways to build a popover/menu | Radix `DropdownMenu` direct (`shell/ProfileMenuView`, `shell/NotificationBellView`), shadcn `Popover` (`DatePicker`, `DateEdit`, `MeasureInfo`), `<details>` popovers (`FilterBar`, `kpi/MonthPicker`), hand-made `role="menu"` (`library/LibraryRow`) |
| P1 | Section title in 6 styles (spec: 16px/600) | `text-sm`, `text-[15px]` (`ProjectTable`, `CollapsibleSection`), `text-base`, `text-xl font-display` (`kpi/KpiSection`), `text-2xl` (`TodayOverview`) |
| P1 | ~20 cards rebuilt inline (`rounded-xl border bg-card`) vs 18 files using `Card` | `admin/users/RequestsList`, `TodayOverview`, `kpi/project/ProjectKpiPanel`, `NotificationsContent`, timeline, KPI sections… |
| P2 | ~10 ad-hoc empty states | `requests/[id]/RequestDetailView`, `Board`, `NotificationsContent`, `MilestoneList`, `LibraryView`… |
| P2 | Text below 12px (`text-[11px]`, `[10px]`, `[9px]`) | `CalendarCard`, `briefs/BriefCalendar`, chat, `content/PostTile`, nav |
| P2 | Icon buttons rebuilt | `content/MediaStrip` (`iconBtn`), `kpi/MonthPicker` (`yearBtn`), chat send, AppFrame menu buttons |
| P3 | Disabled opacity 40/50/55/60/70; stray `shadow-lg`/`shadow-xl`; `rounded` 4px; `HelpSearch` input styled by hand | various |

Token aliases in use instead of shadcn names (same values): `text-foreground-secondary` 287×
(= `text-muted-foreground`, 0×), `bg-surface` 148× (= `bg-card`), `bg-surface-muted` 97× (= `bg-muted`, 0×).

## Decisions

- shadcn components are restyled to match today's kit (36px controls, `rounded-lg`, our variants), and gain our
  extra props in their own file (`Button`: `loading`, `icon`, `iconRight`; variants primary/secondary/ghost/danger).
  Migrating a call site is then mostly an import swap.
- Form selects use shadcn `Native Select` (native picker on phones, works in plain server-action forms); Radix
  `Select` only for rich custom lists.
- `text-danger` stays as an extension token (text-safe red); `destructive` is the fill.
- Domain components (`StatusChip`, `DeadlineChip`, `KpiTile`, `PageHeader`…) stay in the kit and compose shadcn parts.
- Accessible names, roles and `aria-*` that tests rely on are kept; tests that assert on native `<dialog>` DOM are
  updated to the Radix structure, not deleted.

## Plan

Each step ends with `npm run typecheck`, the affected tests and, for UI steps, a browser check (light, dark, phone).
`npm run build` before pushing.

1. **Docs** (this file, `ui/README.md`, root README, `AGENTS.md`).
2. **Tokens**: rename the three aliases to shadcn names across `src/`; keep the alias variables in `globals.css`
   until nothing uses them, then remove them. Add the 13px table size to the type scale; remove sub-12px sizes.
3. **Base components**: add and restyle `button`, `input`, `textarea`, `label`, `field`, `native-select`, `card`,
   `badge`, `alert`, `skeleton`, `spinner`, `avatar`, `switch`, `checkbox`, `radio-group`, `progress`, `separator`,
   `table`, `toggle-group`, `empty`. (`tooltip`, `combobox`, `input-otp`, `toast` are added only when a screen
   needs them.)
4. **Migrate call sites** component by component (Button → Field → Card → Badge → Alert → Empty → rest); kit files
   are deleted once unused and the README map marks them *Migrated*.
5. **Overlays**: `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`; move the 5 dialogs, the request side panel,
   the mobile drawer, profile/bell/library menus and the `<details>` popovers.
6. **Polish**: section titles, dialog titles, disabled opacity, shadows/radius leftovers.
7. **QA**: every page in light/dark and at phone width; `npm run build`.

Estimate: 3–4 working days. Task-by-task plan: `docs/superpowers/plans/2026-10-14-shadcn-first.md`.

## Safety

- Base commit tagged `pre-shadcn-migration` (`7e10e74`, also `origin/feat/project-page`); all work on
  `feat/shadcn-first`, nothing merged without the user's review of a preview deploy.
- Every task is its own commit(s) and can be reverted alone; guard tests keep migrated patterns from returning.
