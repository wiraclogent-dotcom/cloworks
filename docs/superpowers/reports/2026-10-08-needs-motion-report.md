# Needs-motion flag and simplified New request form (2026-10-08)

## What changed
- Schema/migration: `Request.needsMotion Boolean @default(false)`; migration folder `prisma/migrations/20261008120000_request_needs_motion/migration.sql`
  (`ALTER TABLE "Request" ADD COLUMN "needsMotion" BOOLEAN NOT NULL DEFAULT false;`). `npx prisma generate` run. NOT applied to the live DB (controller does that).
- `src/lib/createRequest.ts`: `typeId?`, `fields?`, `needsMotion?` (default false). Omitted typeId = type named "General Design" (looked up by name);
  missing or inactive gives VALIDATION, key `form`, message "The default request type 'General Design' is missing". An explicit typeId behaves as before.
- `src/lib/submitRequest.ts`: echoed values are now title, briefUrl, notes, brandId, divisionId, deadline, needsMotion (boolean; only the radio value "yes" is true). typeId and `f_*` fields are no longer read.
- `src/app/(app)/requests/new/NewRequestForm.tsx` and `page.tsx`: no type select, no Details fieldset, no `types` prop/query; fieldset "Does this task need motion?" with radios No (default) / Yes, needs motion, and the helper text; choice restored from the echoed values via the existing nonce-keyed remount.
- `src/lib/collab.ts` `setNeedsMotionWith` (copy of includeKpi: FORBIDDEN before DB, INVALID non-boolean, NOT_FOUND on 0 rows); `[id]/actions.ts` `setNeedsMotion` (revalidates `/requests`).
- `src/components/status.tsx` `NeedsMotionBadge` (svg + text, `border-primary`/`text-primary` tokens); used in `BoardCard` (own line under the title), `RequestTable` (under the title in the row header cell, no new column), detail page row "Needs motion: Yes/No".
- `[id]/DetailForms.tsx` `NeedsMotionToggle({requestId, initial, canEdit})`: labelled checkbox "Needs motion" in the Manage section, renders nothing when `canEdit` is false (page passes `canAssign`); optimistic, reverts with the server message.
- Filter: `RequestFilter.needsMotion?: boolean`, applied in `filterClauses` (so `listRequests`, `listBoardColumns` incl. grouped totals, `listRequestsPage`); `RequestRow.needsMotion`; `params.ts` `motion` ("yes"|"no" whitelist), `toFilter`, `hrefWith` carries it (so pagination/more/table/sort links keep it), "Clear filters" and the "no match" check include it; FilterBar "Motion" select.
- README updated (intake description, badge, filter).

## Decisions where the brief was silent
- Table: badge under the title, not a column (keeps the 8 sortable columns).
- Default-type error key is `form`, so the form shows it in the banner.
- Radio values are "no"/"yes"; any other posted value counts as No.
- `RequestRow.needsMotion` is required (three test fixtures updated with `needsMotion: false`).
- The Admin "request types" page, importer and seed are untouched; Motion Support rows stay false via the column default (importer tests pass).
- The untracked `docs/superpowers/specs/2026-10-08-ui-redesign-design.md` was not mine and is not committed.

## Test evidence
- RED first: with tests written and no implementation, `vitest run` of the 6 affected files gave 24 failed tests (needsMotion.test.ts 7 failed + 6 skipped/failed suites, needsMotionBadge 4, newRequestForm 5, submitRequest 3, detailForms 3, requestParams 2).
- GREEN: `npx vitest run` 55 files / 609 tests passed; `npx tsc --noEmit` clean; `npx eslint .` 0 errors 0 warnings. `npm run build` NOT run (dev server uses .next).
- New: `tests/needsMotion.test.ts` (default type, stored true/false, non-boolean, explicit typeId, missing and inactive default, setNeedsMotionWith, filters for yes/no/any incl. column totals and table page, migration file + column default + replay on a pre-populated scratch table + insert-without-column), `tests/needsMotionBadge.test.tsx` (card, table, FilterBar), additions to `tests/detailForms.test.tsx` and `tests/requestParams.test.ts`.

## Existing assertions that changed
- `tests/newRequestForm.test.tsx` rewritten: dropped the `types` prop, the "Request type" select change/assert, the "Shooting" checkbox click/assert, and the "2 problems ... Platform is required" live-region text (now "1 problem: Brief link: ..."), because those controls no longer exist; added the radio, no-type, default-No and keep-"Yes" assertions. The "banner for errors with no rendered field" test is kept, its values object lost `typeId`/`fields` and gained `needsMotion`.
- `tests/submitRequest.test.ts`: the echo test no longer posts typeId/`f_*` and expects `needsMotion` in the echoed values instead of `typeId`/`fields`; the success test now posts the radio and checks the default type. Two tests added.
- `tests/board.test.tsx`, `tests/boardCard.test.tsx`, `tests/requestsQuery.test.ts`: fixture rows got `needsMotion: false` (type requirement only).
- `tests/lifecycle.test.ts` and `tests/createRequest.test.ts` are unchanged: they pass explicit typeId/fields, which `createRequestWith` still supports.

## Unverified
Not checked in a real browser: the radio restoring after a server round-trip with the real server action, badge look in light/dark, and the detail toggle against the live server action (all covered only by jsdom/DB tests).
