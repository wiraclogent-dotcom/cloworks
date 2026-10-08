# QA re-check (HEAD a9c4271), dev server, built-in browser pane

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Hydration | PASS | ~8 loads of /requests (Fadli, Wira) with console open: no hydration/DndDescribedBy error after my session start. DOM `aria-describedby="request-board"` (stable). Old errors (DndDescribedBy-2..9) in the pane buffer are from the previous QA run. |
| 2 | Session revoked | PASS | Fadli loaded /requests (board). Deactivated in DB. Reload /requests -> lands on /signin; /dashboard -> /signin; client-side click on "KPI" nav link from the open board -> /signin. Sequence /requests -> /signin (single hop, no loop, no ERR_TOO_MANY_REDIRECTS, no "Application error"). Server log: `GET /requests 200` then `GET /signin 200` (redirect happens inside a 200 stream). Fadli reactivated afterwards. |
| 3 | Denied message | PASS | AccessDenied: "This account is not allowed to sign in yet. Ask Wira to add your email."; ?error=Foo and ?error=<script>x</script>: "Sign-in failed. Try again, or ask Wira for help." (no raw echo); no error param: no message. |
| 4 | Include-KPI toggle | PASS | Wira: checkbox "Counts toward KPI" on detail; off -> row text "No", persisted after reload; on -> "Yes". /dashboard/team Fadli tasks done 2 -> 1 (20%) when off, back to 2 (40%) when on. Fafa: no checkbox (0 inputs), read-only row "Counts toward KPI  Yes". ("No" state for Fafa not viewed.) |
| 5 | DONE on unassigned | PASS | FIRST_LOOK card with no assignee, Move -> Done: no dialog; alert "Assign someone before marking this request Done." (with Dismiss). Server strings in src/lib/transition.ts use STATUS_LABEL ("Cannot move request from <label> to <label>", "...before it can be marked Done"). Raw-enum illegal-move text not triggerable via UI (Move menu offers only legal targets). |
| 6 | Focus + announcements | PASS | Move select -> Done dialog -> Escape: activeElement = SELECT aria-label "Move “RT assigned firstlook A” to…" (not body). Keyboard drag (handle, Space, ArrowRight, Space) -> dialog -> Escape: activeElement = BUTTON aria-label "Drag “RT assigned firstlook B”". Live region (aria-live=assertive) texts: "“RT assigned firstlook B” is over Done." / "“RT assigned firstlook B” moved to Done." (title + labels, no ids/enums). Instructions text via aria-describedby is plain language. |
| 7 | 1024px / 375px | PASS | 1024x768: columns x=24-256, 272-504, 520-752, 768-1000, all 4 visible; documentElement.scrollWidth 1024 = innerWidth, board scrollWidth 976 = clientWidth. 375 mobile: docSW = innerWidth (398 incl. emulation), no page-level horizontal scroll (board scrolls internally). Reset to desktop. |
| 8 | Staged validation | PASS | /requests/new (title empty, past deadline 2026-09-01, notes filled): first submit shows "Title is required" AND "Deadline cannot be in the past"; notes/brand/division/type/deadline kept. /projects/new (title empty, start 2026-11-10, due 2026-11-01): "Title is required" AND "Due date cannot be before the start date", values kept. |
| 9 | KPI note | PASS | Team row has Note field. Saved target 5 + "Recheck note A" -> after reload shown. Changed target to 6 without touching note -> note preserved ("6|Recheck note A"). Cleared note, saved -> reload shows empty; DB kpiTarget.note = null, target 6. |
| 10 | Sanity | PASS | Visited /requests (board+table), detail, /dashboard, /dashboard/team, /projects, /admin/users, /admin/lists: no console errors/warnings after my start, no failed requests; dev server log has no 4xx/5xx and no errors. |

## New / remaining defects
None found in the re-checked items.

Observations (not defects):
- Test-driver limits: pane key presses via `computer key` do not set `event.code`, so the custom ArrowLeft/Right keyboard getter (Board.tsx, uses `event.code`) did nothing; synthetic KeyboardEvent with code=ArrowRight/Space worked. Real keyboards set `code`, so no app defect expected.
- Stale cookie behaviour: after a deactivated-user redirect to /signin the old session cookie remains (no Sign out available on /signin); harmless (loops avoided, proxy/layout redirect each time) but the cookie is not cleared.
- Redirect for revoked sessions is delivered as HTTP 200 stream with a client redirect, not a 307 (fine UX-wise).
- A "[Fast Refresh] rebuilding" console line appeared once mid-run with no local source changes by me (git status clean); likely dev cache, ignore.

## Test data added to local DB
3 FIRST_LOOK requests ("RT unassigned firstlook", "RT assigned firstlook A/B"; B moved status to DONE only if dialog submitted: it was not), Fadli KPI target now 6 with no note, Fadli active. No source changes.

## Cleanup
next dev and db:dev stopped; ports 3000 and 54329 confirmed free (lsof empty).
