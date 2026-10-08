# UI redesign, Phase B1 (requests board, table, new request, detail) report

Date: 2026-10-08. Branch `feat/creative-request-tracker`, on top of `bd20fb7` (Phase A).
Spec: `docs/superpowers/specs/2026-10-08-ui-redesign-design.md`. Kit: `src/components/ui/README.md`.

Scope: restyle only. Routes, params, server actions, permissions, data and aria wiring are unchanged.

## What changed

| Area | Files |
|---|---|
| Board | `src/components/Board.tsx`, `src/components/BoardCard.tsx` |
| Filters | `src/components/FilterBar.tsx` |
| Done dialog | `src/components/DoneDialog.tsx` |
| Table + pagination | `src/components/RequestTable.tsx` (new `footer` prop), `src/components/Pagination.tsx` |
| Requests page | `src/app/(app)/requests/page.tsx` (table inside one card with the pagination footer, EmptyState for "no match", view-aware skeleton fallback) |
| Skeletons (new) | `src/components/RequestSkeletons.tsx` (`BoardSkeleton`, `TableSkeleton`, `DetailSkeleton`) |
| New request | `src/app/(app)/requests/new/NewRequestForm.tsx`, `src/app/(app)/requests/new/page.tsx` |
| Detail | `src/app/(app)/requests/[id]/page.tsx` (data loading only), `RequestDetailView.tsx` (new, presentational), `DetailForms.tsx` |
| Kit | `src/components/ui/RadioCards.tsx` (radios named by card title, described by card text, new `hint`/`hintId`), `src/components/ui/Switch.tsx` (new), `src/components/ui/README.md` |
| Tests | new: `tests/boardRedesign.test.tsx`, `tests/requestTableRedesign.test.tsx`, `tests/newRequestFormRedesign.test.tsx`, `tests/requestDetailView.test.tsx`; changed: see below |

## Design decisions

### Board
- Column: rounded 12px, `bg-surface-muted` fill, `data-tone` from `REQUEST_STATUS_TONE`. Header strip = `h2` with a 3px
  `border-tone-accent` top bar on the status tint (`bg-tone-tint text-tone-text`, the AA-tested chip pair), status shape
  icon, name, and a white count pill (`bg-surface`). The count stays inside the `h2` (tests read "Done 523").
- Drop target: unchanged logic. Visuals moved from a 2px border to an outline (no layout shift): valid = dashed Aqua
  ring outline, hovered valid = solid ring + Aqua tint fill, invalid = 60% opacity. The text hints stay ("Drop to move
  to X" / "Not a valid move") and gained icons. A `data-drop` attribute (valid/over/invalid) documents the state.
- Card: white, 12px radius, hairline, `shadow-card`; hover lifts 1px and darkens the border (no lift under reduced
  motion). Title 14px/500 `line-clamp-2`. Chips row: BrandTag, division as small secondary text, DeadlineChip (open
  requests only, as before), NeedsMotionChip only when `needsMotion`. Footer: tiny requester avatar + name (secondary;
  "Requester: " is `sr-only`, the row has `title="Requester: <name>"`), assignee Avatar or UnassignedAvatar on the
  right wrapped in `role="img"` with `aria-label`/`title` "Assignee: <name>" ("Assignee: Unassigned").
- The division used to be on the card ("Brand · Division"); kept as small text next to the brand tag so no information is lost.
- Drag handle: lucide `GripVertical`, moved to the top-right of the card; `opacity-0` until the card is hovered or has
  focus inside (`group-focus-within`, `focus-visible`), always visible on `(hover: none)` devices. It is still the only
  keyboard activator; the whole card is still the pointer/touch drag surface; the title link is still the only other
  interactive element.
- After a move, focus returns to the card's drag handle first (was "first button or link"; the handle used to be
  first in DOM order, now the title is). Same element as before for movers; the link for read-only users.
- DragOverlay: same card face, Aqua border, `shadow-raised`, `rotate-2` (`motion-reduce:rotate-0`).
- Column footer: "Showing X of Y" (tabular), "Show N more" and "Open all in table" as quiet Aqua text links with icons.
- Empty column: dashed placeholder with an inbox icon and "No requests here".
- Error message: kit `Alert` (danger, `role="alert"`) with a ghost "Dismiss" button.

### Filters
One wrapping row of 32px pill fields (`rounded-full`, `--input` outline, focus ring); every label is still a visible
`<label>` above its field. Active filters (a non-empty select) get the Aqua tint. Search has a leading search icon.
Apply = primary `sm` button, My requests = pill link (Aqua tint + check icon when on, `aria-current="true"`), Clear
filters = ghost link. All names, hidden inputs (view, mine, sort, dir) and the GET form are unchanged.

### Table
- One card: scroll container `max-h-[calc(100dvh-15rem)] overflow-auto` so the header sticks; table `min-w-[64rem]`
  so it only scrolls sideways when the card is narrower than that. Pagination is the card's footer.
- Header: kit `tableClass` (12px semibold secondary on the muted strip). Every sortable header keeps its link, `aria-sort`
  and sr-only text, plus a sort icon (ArrowUp/ArrowDown for the active column, faint ArrowUpDown otherwise).
- Rows 44px (`h-11`) with hover. Cells: Request (title link, NeedsMotionChip under it), Brand (BrandTag), Division
  (secondary text), Requester (avatar + name), Assignee (avatar + name, or muted italic "Unassigned"), Status
  (StatusChip), Requested (date), Deadline (date + DeadlineChip for open requests).
- **Deviation from the brief:** the brief puts brand/division as small text under the title. Brand and Division are
  separately sortable today, so to keep that behaviour they stay as their own sortable columns (brand as a tag chip)
  instead of being folded into the Request cell.
- The separate non-sortable "Days left" column is gone; its text now lives in the DeadlineChip in the Deadline column.
- No Outputs column (the table has none today).
- Pagination: "Showing 1–50 of 552" left, "Page X of Y" centre, Previous / Next ghost buttons with chevrons right
  (disabled ones stay `aria-disabled` spans); on narrow screens the page text wraps under the row. Links and params
  unchanged.

### New request
- `PageHeader` "New request" + description (the old h1 was "New creative request").
- Desktop: `lg:grid-cols-[minmax(0,1fr)_20rem]`; left = the `<form>` with Card "Request details" (Title, Brief link,
  Notes, Brand + Division side by side from `sm`, Deadline at half width) and Card "Motion" (RadioCards: "No" — "Design
  only", "Yes, needs motion" — "A motion/video editor will also work on this", with icons; the existing helper text is
  kept inside the fieldset as the RadioCards `hint`, which the group's `aria-describedby` points to as before:
  `needsMotion-help`). Right = `<aside aria-label="What happens next">` with a sticky help Card, 3 steps. Step 3 says
  "Notifications are by email only: we email you when its status changes, including when it is marked Done" —
  matches `transition.ts` (requester + assignee are notified on every status change; notify.ts sends email when mail
  is configured). Mobile: one column.
- Fields use `fieldClass` (invalid → `border-danger`), errors use `FieldError` (icon + text, same `${id}-error` ids),
  form-level banner is `Alert tone="danger"` (`role="alert"`). Primary button "Create request" ("Creating…" while
  pending, `loading` spinner + disabled), ghost "Cancel" link to `/requests`.
- Unchanged: field names, `key={nonce}` remount + `defaultValue` echo, `defaultChecked` restore of the motion radio,
  focus-first-invalid effect, the persistent `role="status"` live summary.
- The "not allowed" message on the page became an `Alert` (still `role="alert"`).

### Detail
- `page.tsx` keeps the exact Prisma query, permission checks, inactive-assignee handling and type-field filtering; it
  now renders `RequestDetailView` (pure, testable in jsdom).
- Header: breadcrumb nav ("Requests" with a chevron, replaces "← Back to requests"), PageHeader h1 = title, chips row:
  StatusChip, NeedsMotionChip (only when true), and "Counts toward KPI" (done tone + target icon) or "Not counted
  toward KPI" (neutral + slash icon).
- Left column (2/3): Brief (secondary-button "Open brief" external link + the URL in small text, Notes with
  `whitespace-pre-wrap`, type-specific fields as a definition list), Attachments (icon tile, name link, "added by …",
  ghost Remove button with the same aria-label; add-link form in one row on desktop), Comments (avatar, name, WIB time,
  body in a muted bubble, mentions kept as `<strong>` with the Aqua tint; Textarea + primary Post comment), Activity
  (former "Status history": vertical line + 11px dot per event in the destination status accent, "From → **To**",
  actor · WIB time).
- Right column (1/3, sticky on `lg`): Details (Requester and Assignee with avatars, Brand tag, Division, Type,
  Requested, Deadline + DeadlineChip for open requests, Outputs when Done, Design folder link) and Manage (only when
  `request.assign` or `request.transition`, same as before): assignee picker (hidden when cancelled, as before), Move
  to… (with a hint; it is the existing way to cancel: "Choose Cancelled to cancel this request."), then the two
  switches. There is no separate Cancel button — adding one would be a behaviour change.
- The read-only "Needs motion" / "Counts toward KPI" rows of the old Details list are replaced by the header chips
  (same information, as text).
- Toggles use the new kit `Switch` (real checkbox with `role="switch"`, whole row is the label, track `--input` off /
  `--primary` on, focus ring on the track via `peer-focus-visible`).
- Errors in DetailForms: icon + `text-danger`, still `role="alert"` with the same ids.

### Dialog
DoneDialog: 12px card, `shadow-raised`, `--backdrop`, Done-tone icon tile, 16px title, `aria-describedby` on the
description, kit `fieldClass`/`labelClass`/`FieldError`, ghost Cancel + primary "Mark as done". Focus trap, Escape,
initial focus and focus restore unchanged.

### Loading
- Requests: the Suspense fallback is view-aware: a nested Suspense renders `BoardSkeleton` until `searchParams`
  resolves, then `BoardSkeleton` or `TableSkeleton` (8 rows). Both include a header/filter skeleton; the board one is
  `data-page-wide` like the board.
- Detail: `DetailSkeleton` (header + 3 cards / details card). New request: a small form skeleton.
- Each fallback is `role="status" aria-busy="true"` with sr-only "Loading requests…" / "Loading request…" / "Loading…".

## Existing test assertions changed (each intentional)

| Test | Before | After | Why |
|---|---|---|---|
| `tests/board.test.tsx` "shows plain-language empty states" | `getAllByText(/nothing here yet/i)` ×4 | `getAllByText("No requests here")` ×4 | Brief's empty-column wording. |
| `tests/boardCard.test.tsx` "the whole card is the pointer drag surface…" and "read-only users get no drag surface…" | mouse-down on `getByText(/Requester: Rina/)` | mouse-down on `getByTitle("Requester: Rina")` | The requester line is now avatar + name ("Requester: " is sr-only text), so the visible text no longer contains "Requester: Rina". Drag behaviour assertions unchanged. |
| `tests/filterBar.test.tsx` "uses aria-current… on the My requests link" | `link.textContent` contains "✓" | link contains `svg[data-icon="check"]` | The text check mark became a check icon; the state is still announced via `aria-current="true"` (asserted unchanged). |
| `tests/newRequestForm.test.tsx` (3 tests) | submit button found by `name: /submit/i` | `name: /create request/i` | Button text "Submit request" → "Create request" (brief). |
| `tests/theme.test.ts` contrast lists | – | added pairs (below) | New colour pairs. |

No other existing test changed. `tests/needsMotionBadge.test.tsx`, `tests/detailForms.test.tsx` and the rest of
`board.test.tsx` pass untouched (labels, roles, alerts, dialog, focus return, announcements, totals).

## New tests (+50 in the suite, 803 → 853: 44 new jsdom tests + 6 new contrast cases)

- `tests/boardRedesign.test.tsx` (16): brand tag tone; Needs-motion chip only when true; DeadlineChip text + state for
  overdue / due today / 1 day / on track / no deadline; no deadline chip for Done/Cancelled; assignee avatar vs
  unassigned (`role=img` "Assignee: …", title, initials); requester line; only one interactive element for read-only;
  handle hidden-until-hover/focus classes; column header tone/accent bar/tint; drop-target `data-drop` + dashed outline
  + texts; empty placeholder; restyled Done dialog (modal, kit buttons, backdrop token, icon error wired by
  aria-describedby); filter pills (active tint, primary Apply, ghost Clear).
- `tests/requestTableRedesign.test.tsx` (10): header order, aria-sort, sort links and icons, sticky header; row cells
  (44px, title link, motion chip, brand tone, avatars, status tone, dates, deadline chip); Unassigned muted; no chip
  for finished/undated; scroll container + footer in the same card; empty state; pagination texts/links/rel/disabled;
  board (4×3), table (8 rows) and detail (2 columns) skeletons with a loading status.
- `tests/newRequestFormRedesign.test.tsx` (6): card headings + help card (3 steps, email only, outside the form);
  radio names/descriptions/values and No default; hint id wiring; Create request + Cancel link; failed submit →
  icon error, `border-danger`, focus, Yes restored; form-level Alert; RadioCards hint merge.
- `tests/requestDetailView.test.tsx` (12): one h1, breadcrumb, h2 order; chips (motion only when true, KPI both
  wordings); Brief link/new tab/pre-wrap notes; Details avatars, brand tag, deadline chip, outputs only when Done,
  Unassigned, design folder; Comments time (WIB) + mention highlight + Post comment; Activity dots per status tone;
  Remove only for uploader or assigners; Manage per permission (requester none, creative move only, lead
  picker + move + 2 switches, no picker when cancelled); Switch semantics.

## Contrast additions (`tests/theme.test.ts`, both themes)

| Pair | Min | Light | Dark | Where |
|---|---|---|---|---|
| `--link` on `--surface-muted` | 4.5 | 5.04 | 7.04 | column footer links on the column fill |
| `--link` on `--accent` | 4.5 | 4.84 | 5.78 | same links while the column is the hovered drop target |
| `--primary` against `--surface` | 3 | 10.44 | 5.32 | Switch track "on" vs card and vs its knob |

All other pairs used were already asserted in Phase A: status/tag chip text on tint (column header strip, chips),
`--foreground-secondary` on `--surface`/`--surface-muted`/`--accent` (meta text, selected radio card description),
`--accent-foreground` on `--accent` (active filter pill, mention highlight), `--input` vs `--surface` (fields, Switch
track off), `--danger-text` on `--surface` (errors), `--ring` vs surfaces (outlines). Column accent bars and timeline
dots are decorative (status is always icon + label). `grep` for `#hex`/`rgb(`/`text-white`/Tailwind palette colours in
the changed components finds nothing.

## Checks

`npm run lint` 0 errors / 0 warnings; `npx tsc --noEmit` clean; `npm run build` passes (`/requests`,
`/requests/[id]`, `/requests/new` still partial prerender); `npx vitest run` 64 files / 853 tests green.
No DB, dev server or `.next/dev` was touched (the build writes only the production output beside it, as in Phase A).

## Not verified without a browser

- Real look at 1280 / 1024 / 375 px in both themes: column widths (`minmax(15rem,1fr)`, horizontal board scroll on
  narrow screens), the card hover lift, `line-clamp-2`, the 2° overlay tilt, outline-based drop highlight, and the
  sticky table header inside `calc(100dvh - 15rem)`.
- The hidden drag handle: verify it appears on hover and on Tab focus and that touch devices show it
  (`@media (hover: none)`).
- Native `<select>` pills: arrow position with `pr-7` and the Aqua active tint (OS-drawn controls vary), and the
  date input inside the 50%-width Deadline field.
- Switch: the transparent native checkbox covers the track; check click target, focus ring on the track and the
  knob position in both themes.
- Sticky right column on the detail page (`lg:top-6`) inside the shell's scrolling `<main>`.
- The view-aware skeleton fallback (nested Suspense awaiting `searchParams`) builds and renders in tests, but the
  streaming order (board skeleton briefly before the table skeleton) should be eyeballed on `/requests?view=table`.
