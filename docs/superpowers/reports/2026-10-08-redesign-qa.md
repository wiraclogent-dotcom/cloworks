# Redesign QA report (2026-10-08) - read-only pass on real data

Method: built-in browser pane, signed in as Wira (ADMIN). 375x812 emulation measured correctly (note: `innerWidth` reports a bogus 824 while emulating; `documentElement.clientWidth` = 375 is right, so I used clientWidth + a scrollTo(2000,0) test). Nothing was created, edited, moved or saved. Only an empty /requests/new form was submitted (validation errors shown). A drag was started and cancelled with Escape (counts 27/1/1/523 unchanged, card back in Requested, live region said "Move cancelled").

## Summary table
| Page | Console clean | Light | Dark | 375px | Issues |
|---|---|---|---|---|---|
| /requests (board) | yes (no new errors) | good, but page scrolls | good | FAIL (title overlap) | 3 (D1, D2, D6) |
| /requests?view=table | yes | good | good | FAIL (title overlap) | 2 (D2, D8) |
| /requests/new (+empty submit) | yes | good | good | ok | 1 (D9) |
| /requests/<id> detail | yes | good | good | ok | 1 (D8) |
| /dashboard (My KPI) | yes | good | good | ok | 0 |
| /dashboard/team?month=2026-09 | yes | good | good | ok (table scrolls inside card) | 1 (D4) |
| /projects, /projects/new | yes | good (nice empty state) | good | ok | 0 |
| /admin/users, /admin/lists | yes | good | good | header cramped | 1 (D7) |
| /signin | yes | plain | good | ok | 1 (D10) |
| 404 /requests/does-not-exist | yes | good | good | ok | 1 (D5) |

Console: after ~25 fresh loads (light, dark, collapsed and expanded sidebar) no new errors or warnings. The buffer holds 18 older hydration-mismatch errors (sidebar `title` on NavLink: server `title="Admin"` vs client `null`), a stale "Can't resolve '@/lib/theme'" build error, and a "script tag in React component" error, all from before this session. A cold load with `ct-sidebar=collapsed` (the case that used to mismatch) now adds none. The Next dev badge shows no issue count. Only HMR WebSocket noise otherwise.

## Defects
1. **Major - /requests board (any width, document scroll).** Repro: open /requests, `document.documentElement.scrollHeight` = 4187-4249 vs viewport 800-964; `scrollTo(0,5000)` reaches scrollY 3223. Expected: about the viewport height (Done has 523 cards). Actual: page scrolls ~3200px of empty canvas and the sidebar scrolls away with it (seen after clicking Expand sidebar: page jumped 345px, sidebar half off-screen). Cause: `<span class="sr-only">Requester: </span>` in card (position:absolute, no positioned ancestor) escapes the column scroller's clipping; lowest sr-only bottom = 4187 = scrollHeight. Fix: add `relative` to the card `li` / the `overflow-y-auto` scroller (or `contain: paint`). File: src/components/BoardCard.tsx:46 (and Board.tsx scroller). Re-verify the "no page growth" requirement after the fix.
2. **Major - PageHeader at 375px (/requests board and table).** Repro: 375 width, open /requests. Expected: "Requests" heading readable. Actual: heading wrapper `min-w-0 flex-1` collapses to 8px wide, so the h1 (x16-115) is covered by the Board/Table switcher (x40-210); screenshot shows "Re" then the pill. Fix: give the title block a basis, e.g. `min-w-[10rem] flex-1` or `basis-full sm:basis-0`. File: src/components/ui/PageHeader.tsx:13. Other pages with actions (/projects) survive only because their title is short; /admin/users shows the same squeeze (D7).
3. (merged into D1 - sidebar scrolling away is a symptom of the document scroll.)
4. **Major/Minor - /dashboard/team at <= ~1280 wide.** The "Set target" Save button sits at x=1206 inside a 1024px-wide table in a 923px scroll container; at 1205 wide the Note input is already clipped and Save is invisible, with no scroll hint. Expected: admins can find Save. Suggest a sticky last column, a compact target/note layout, or an edge shadow. (Not clicked.)
5. **Minor - 404 status.** `fetch('/requests/does-not-exist')` returns HTTP 200 (streamed after the loading boundary). Page content is right ("Page not found"). Probably a dev/streaming artifact; verify on a production build.
6. **Minor - board at 1024/1205 wide.** With the 232px sidebar the 4th column (Done) is cut at the right edge and the board scrolls sideways with no cue. 1280 shows all four. Suggest auto-collapsing the sidebar below ~1100px or a fade edge.
7. **Cosmetic - /admin/users and /admin/lists at 375.** Title wraps in a narrow column beside the Users/Lists switcher; description squeezed to 150px (same PageHeader root cause as D2).
8. **Minor - small tap targets.** Table sort header links 20px tall (74x20), team name links 16px, detail "Requests" breadcrumb and "Open folder" 20px, board drag handle 24x24, avatar initials 9-11px. Desktop is fine; on touch the headers and links are small.
9. **Cosmetic - empty-form errors have no `role="alert"`/`aria-live`** (inputs do get `aria-invalid` + `aria-describedby`, good). Screen readers will not announce errors on submit. Also, the empty-submit takes about 2s to show errors in dev (shows "Creating..." spinner meanwhile).
10. **Cosmetic - /signin** is a plain white card on a grey canvas, with no Deep Blue/Aqua presence beyond the logo. It does not redirect signed-in users (stays on /signin); fine, noted.
11. **Cosmetic - every page `<title>` is "Creative Request Tracker"** (no per-page titles; weak for tabs/history).
12. **Dev-only:** the Next "N" badge overlaps "Sign out" in the sidebar bottom-left and the mobile drawer. Not a product defect.

## Verified OK
- Theme: default is Light with no stored choice even when the OS prefers dark (`prefers-color-scheme: dark` = true, theme = light); Dark persists across reloads via `ct-theme`; Light/Dark/System switch with `aria-pressed`. Dark contrast scan (WCAG text ratio) on all pages: 0 failures; card borders about 1.5:1 vs canvas (subtle but visible), input borders 3.9:1.
- Keyboard: first stop is "Skip to content" (visible ring), then sidebar links in order, collapse button, theme buttons, Sign out, then page controls. Every stop has a 2px outline (Aqua on light, pale on dark sidebar). Mobile hamburger opens a 280px drawer; Escape closes it and returns focus to "Open navigation"; the closed drawer is `visibility:hidden` (no hidden tab stops). Focus does not move into the drawer when it opens (Minor).
- Drag: overlay card follows the pointer, source ghosted, On progress gets dashed outline plus "Drop to move to On progress", First look and Done show "Not a valid move", live region announces moves.
- Data: board counts 27/1/1/523 with "Showing 25 of 27" / "Showing 25 of 523" plus "Show N more" and "Open all in table"; table "Showing 1-50 of 552", "Page 1 of 12", sortable headers (Deadline arrow shown). Team KPI 2026-09: Dimas 111, Fadli 66, Fafa 54, Syahda 59, Irsyad 20, Rifqy 2 = 312; People 9; progress shows "—" with "Nobody has a target this month." My KPI (Wira) shows zeros, dashes with explanatory sub-text and a 6-month chart: a good empty state. Projects: "No projects yet." empty state.
- A11y: exactly one h1 per page, landmarks (header, aside "Sidebar", nav "Main", main), no unnamed buttons/links, no unlabeled inputs (team target inputs have per-person aria-labels), radio fieldset with legend "Does this task need motion?".

## What looks great
- Cohesive Deep Blue sidebar with Aqua active state, tidy WORK/INSIGHTS/ADMIN grouping, expanded and icon-only states both polished; Light/Dark/System segmented control.
- Board: tinted column header bars, status/brand chips, initials avatars, overdue/"1 day left" pills; drag overlay and drop hints are excellent.
- /requests/new: clear two-column layout, "What happens next" side card, motion radio cards, inline validation with icons and focus on first error.
- Detail page: well-organised Brief/Attachments/Comments/Activity left, Details/Manage right; KPI cards with tinted icons; friendly empty/404 panels. Dark theme is clean throughout.

## Design polish suggestions
1. Make the table default sort smarter (open/active and nearest deadlines first); it currently opens on May 2026 completed work, oldest deadline first.
2. Auto-collapse the sidebar at <1100px and add a right-edge fade on the horizontally scrolling board.
3. Collapse filters on mobile into a "Filters" disclosure; they take about half the first screen at 375px before any data.
4. Team KPI: sticky Save/target column or a per-row "Set target" popover; show a "no target" hint above the table.
5. Give /signin a Deep Blue panel/brand header and Aqua button accent so it matches the app.
6. Add per-page `<title>`s ("Requests | Creative Tracker").
7. Raise avatar initials to >= 10px and enlarge sort/breadcrumb hit areas with padding (`py-1.5`) without changing the visuals.
8. Admin > Lists: replace the raw "Field schema (JSON array)" textarea with a helper or collapse it under "Advanced".

Final state: viewport reset to desktop preset, theme Light (`ct-theme=light`), sidebar left collapsed as found, temporary localStorage helper keys removed.
