# shadcn first: UI consolidation

Date: 2026-10-14 · Branch: `feat/shadcn-first` (from `feat/project-page`) · **Status: done** (2026-10-14, 16 tasks;
final audit and score below)

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

## Final audit (2026-10-14, after Task 16)

Re-ran the audit greps on `src/` (outside `components/landing/`): `<dialog`/`role="dialog"`, `<details`/`role="menu"`,
`radix-ui` imports outside `shadcn/`, inline `rounded-xl border bg-card` (`tests/cardUsage`), `text-[Npx]` below 12px and
arbitrary sizes ≥ 12px, `shadow-lg`/`shadow-xl`, disabled opacities other than 55/70, raw `<button>` with hand-made
classes, the three token aliases, plain `rounded`, and "No … yet" paragraphs. Browser QA (light, dark, 375px) on every
page group the local session reaches.

**Consistency score: 34/40** (was 28/40; the first audit gave one overall figure, so only the new score is split up).

| Dimension (5 each) | Score | Evidence | Still open |
|---|---|---|---|
| Tokens and colour | 5 | Aliases 0 uses (guard `tokenNames`); shadcn folder has no hex, palette or `dark:` (guard `shadcnFolder`) | – |
| Typography | 4 | Nothing below 12px outside the allowlist; arbitrary sizes ≥ 12px only in the display places the README lists (guard `typeScale`); dialog and card titles one style (16px/600) | A few card headers still 14px (`BriefCalendar` weekly table, `PostPanel`, `CalendarAgenda` day groups); greeting in `TodayOverview` stays 24px as a hero line |
| Spacing and layout | 4 | Page widths, header spacing and section gaps per README; no page scrolls sideways at 375px | Pre-existing: request calendar at 375px clips card contents; project timeline header labels collide ("28 Sep 2026" / "5 Oct", "Today" flag covers a week label) |
| Shape and depth | 4 | No `shadow-lg`/`shadow-xl`; overlays `shadow-raised`, cards `shadow-card`, controls `rounded-lg` | Hand-made 4px chips: `CalendarCard` "Overdue", `PostPanel` status, `PostTile` tags (could be `Badge`) |
| Components (buttons, fields, cards) | 4 | Every `<Button>` has a variant (guard); fields on `Input`/`NativeSelect`/`Textarea`; cards on `Card` (guard, 4 justified exceptions) | Raw buttons left are rows, drag handles and inline text links; chat "Load older messages" pill and `FileLocationLink` copy button are still hand-styled |
| Overlays (dialogs, menus, popovers, disclosures) | 5 | 0 native `<dialog>`, `<details>` or hand-made `role="menu"`; no direct `radix-ui` imports outside `shadcn/`; one allowed `role="dialog"` (non-modal chat dock) (guard `overlayUsage`) | – |
| States (empty, loading, feedback) | 4 | Empty states on `EmptyState` (inline variant for one-liners), loading on `Skeleton`/`Spinner`, messages on `Alert` | `ChatList` empty keeps its own centred icon layout; `Toast` not adopted (inline `role="status"` messages) |
| Interaction (focus, disabled, motion, touch) | 4 | One focus ring; disabled 55% (controls) / 70% (fields) everywhere; overlays use `animate-pop-in/out`; 36px hit areas on `sm` buttons and menu rows | Radix controls need JS (documented in README); chat "Load older" pill is 24px high; auth pages in dark mode: `text-brand-deep-blue` links are low contrast (pre-existing) |

P1 items from the first audit: **all closed** (dialogs, popovers/menus, section titles, inline cards). P2: empty
states closed except `ChatList`; text below 12px closed; rebuilt icon buttons closed (`MediaStrip`, `MonthPicker`, chat
send and the AppFrame drawer buttons are `Button`; the sidebar Collapse row stays a nav-styled row). P3: disabled opacity, `shadow-lg`/`shadow-xl` and `HelpSearch` closed;
plain `rounded` remains on the tiny chips listed above.

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
