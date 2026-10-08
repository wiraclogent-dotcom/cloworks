# Board scroll, server-side limits and whole-card drag (2026-10-08)

Branch `feat/creative-request-tracker`, based on 0ad737a. Nothing here touched the live database (all DB tests use `createTestDb()`).

## Problem 1: tall board and table

**Layout.** Each column (`.board-column`, `src/app/globals.css`) is capped at `max(20rem, calc(100dvh - 16rem))`. The header, the drop label and the footer sit outside the scroll box; the body (`[data-column-body]`) is `overflow-y-auto overscroll-contain`. The page height no longer depends on the card count. The grid is unchanged (`minmax(13rem, 1fr)` columns, so 4 columns at 1024px; horizontal scroll on narrow screens). Columns stretch to the same height (grid default).

**Server limits** (`src/lib/requests.ts`, `src/lib/paging.ts`)
- `listBoardColumns(db, filter, { limit?, byStatus? })` returns `{ status, total, rows }` per column: one `groupBy` count plus one bounded `findMany` per non-empty column. Active columns: deadline asc nulls last, requestedAt desc. DONE (and CANCELLED, my choice): requestedAt desc, then id. Default limit 25, hard cap 500. CANCELLED gets a fifth column only when the status filter is Cancelled. A status filter keeps four columns and empties the non-matching ones (same as before).
- `?more=DONE:50` (repeatable or comma separated) is parsed by `parseMore`: whitelisted statuses, digits only, clamped to 25..500. Footer: "Showing X of Y", a plain-link "Show N more" (N = min(25, remaining), hidden at the 500 cap) and "Open all in table" (`/requests?view=table&status=<S>` plus the other filters). Header shows the TOTAL.
- Table: `listRequestsPage` (50 per page, `?page=N` via `parsePage`/`pageWindow`, clamped), `Pagination` component (Previous/Next links, "Showing 1–50 of 553"). `hrefWith` never carries `page`/`more` forward, so changing filter, sort or view resets them; page links preserve every other param.
- Sorting moved server-side before paging. `deadline`, `requested`, `status` sort in SQL (nulls last both ways, ties keep the default order, id last). The text keys (title, brand, division, requester, assignee) keep the exact `sortRows` JS ordering: only narrow sort columns of the matching rows are read, sorted with `sortRows` (now generic), then the page's full rows are fetched by id. This avoids Postgres collation differing from the old JS comparison. `sortRows` itself and its tests are unchanged. `listRequests` only gained an `id` tiebreak.
- Optimistic move: the card goes to the TOP of the destination (even if beyond its loaded rows); totals shift source -1 / destination +1; failure restores card position and totals; `router.refresh()` replaces state with server data.

## Problem 2: grab the card

- `BoardCard`: dnd-kit `listeners` are on the `<li>` root for movers only (`data-draggable="true"`); read-only users get no listeners and no handle. The "Move to…" select is gone (not hidden). The small handle button remains for keyboard/screen readers (`setActivatorNodeRef`, `attributes`, label `Drag “<title>”`); dnd-kit only starts a keyboard drag when the key event target is the activator, so Enter on the title link still follows the link. Title link has `draggable={false}`. The original dims (`opacity-40`) while dragging.
- `Board`: `DragOverlay` renders the dragged copy (aria-hidden, no links). Sensors: `MouseSensor` (6px), `TouchSensor` (250ms hold, 5px tolerance), `KeyboardSensor` with the existing column-jump coordinate getter. Card root `touch-manipulation`, handle `touch-none`.
- Drop targets while dragging: legal columns get a dashed ring and the text "Drop to move to <Status>" (solid ring when hovered); illegal ones are dimmed with "Not a valid move"; the card's own column shows nothing.
- `src/lib/boardDrop.ts`: pure `decideDrop({ from, to, hasAssignee, canMove })` -> `noop | illegal | needs-assignee | needs-done-details | move`, called from `requestMove` (the single path for pointer, touch and keyboard drops). Illegal still goes to the server so its human message is shown; needs-assignee shows the inline message; DONE opens `DoneDialog`.

## Decisions where the brief was silent
- `Board` props changed from `requests` + `showCancelled` to `columns: BoardColumnView[]` (server data plus `moreHref`/`tableHref`). `PointerSensor` replaced by `MouseSensor` + `TouchSensor` (PointerSensor would claim touch pointers and fight page scrolling).
- No new DB index/migration (would touch the real DB's migration state; 553 rows). A `(status, requestedAt)` index is the next step if the table grows by orders of magnitude.
- Cancelling is no longer possible from the board (no CANCELLED drop target unless filtered, no dropdown); it stays on the detail page.
- Header allowance is 16rem (title row, filters, padding); adjust the `.board-column` rule if the header grows.

## Tests
RED first: after writing the tests and before any implementation, `npx vitest run` on the 6 new/rewritten files gave `Test Files 6 failed (6) | Tests 42 failed | 2 passed (44)` (missing `@/lib/boardDrop`, `@/lib/paging`, `listBoardColumns`, `listRequestsPage`; Board without `columns`). GREEN after implementation: `Test Files 53 passed (53), Tests 580 passed (580)`; `npx eslint` clean (0 problems); `npx tsc --noEmit` clean; `npm run build` OK.

New: `tests/boardDrop.test.ts` (exhaustive from/to/assignee/canMove table), `tests/paging.test.ts` (parseMore whitelist/cap/garbage, parsePage, pageWindow clamping, range text, params + hrefWith), `tests/boardColumns.test.ts` (limits, totals, DONE newest first, active ordering, filters, CANCELLED, empty board, row shape equals `listRequests`, table paging, every sort key x dir across both pages equals `sortRows`, nulls last), `tests/boardColumnsPerf.test.ts` (600 requests: <= limit rows per column with exact totals, table page 3 of 12; counts only, no timings), `tests/boardCard.test.tsx` (no select; real mouse drag from the card body starts only after 6px; read-only has no drag surface; keyboard Space on the handle starts a drag, Enter on the link does not; dimming).

### Existing assertions changed (intentional behavior change)
`tests/board.test.tsx` was rewritten around `columns` props. Specifically:
- Every `fireEvent.change(getByLabelText(/Move “X”/), ...)` that drove a move or the Done dialog now calls the captured `DndContext.onDragEnd` (via a `vi.mock` wrapper around `DndContext`), because the select no longer exists: optimistic move, Done dialog submit, dialog validation + Escape, over-cap output count, server failure message, revert, focus return after Escape and after move, unassigned-on-Done message. Same expectations otherwise.
- "offers only legal next statuses in the Move to… menu" was replaced: the select options assertion is gone; legality is now covered by the `decideDrop` exhaustive table and an illegal-drop component test; the handle-button assertion stays ("keeps a labelled keyboard drag handle").
- "is read-only for a requester" now also asserts no `data-draggable` cards.
- "reverts an optimistic move" additionally asserts totals revert. "moves a card optimistically" additionally asserts both header totals.
- The header-count regex in the first test is unchanged (header shows total).
No test files other than `board.test.tsx` changed; `requestsQuery.test.ts` (including `sortRows`) passes untouched.

## NOT verified in a real browser (drag behavior needs one)
jsdom has no layout or real pointer/touch/scroll, so these are unverified: dragging with the mouse across columns (collision detection with `DragOverlay`), dnd-kit auto-scroll of a column body while dragging near its edge, 250ms touch press-and-hold vs page scroll on a phone, the drag overlay not being clipped, the dashed outline/label look and dark mode, the column heights at 1024px and 375px, and that clicking the title link navigates after the 6px threshold. The mouse-activation distance and keyboard activation are exercised in jsdom with real events, and onDragEnd is exercised through a captured prop.
