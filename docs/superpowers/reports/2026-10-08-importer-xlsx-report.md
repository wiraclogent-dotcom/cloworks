# Importer: master .xlsx workbook + Dimas Tracker (2026-10-08)

## What changed
- `package.json` / lock: `exceljs` 4.4.0 (exact pin, devDependency). Installed with a private npm cache (`~/.npm` is root-owned).
- `src/lib/import/readWorkbook.ts` (new): `readMasterWorkbook(path)` returns `{requests, socmed, dimas}` as `{headers, rows, lines}`.
  Tabs matched case/whitespace-insensitively (error lists found tabs); header row found in the first 5 rows; reading stops at the
  last row with a Task / `Nam File` value (verified: SocMed has 50,510 formatted rows, only lines 3..134 are returned);
  dates from the real date with UTC getters (`dd/mm/yyyy` requests, `m/d/yyyy` socmed + dimas); booleans `TRUE`/`FALSE`;
  integral numbers as integer strings; `{text,hyperlink}` -> label in the column plus `<Header> URL` (only http/https without
  spaces; mailto:, javascript:, `#gid=` dropped); `{text:{richText}}`, `{richText}`, formula/sharedFormula -> cached result;
  error values -> empty. Dimas reads only the first contiguous headed block (A..F), so the H..N side table is never touched.
  Sanity checks: Request List must not have Platform/Include_KPI, SocMed must have both.
- `src/lib/import/parseRequests.ts`: optional canonical headers `Brief Link URL`, `Design Folder URL`, `Link Upload URL`
  (URL column wins, label kept as `Brief: ...` / `Folder: ...` unless it equals the URL; label-only cells behave as before);
  unresolved non-blank requester -> Wira + `Requester (as typed): <raw>` in notes + still in `unmapped`; new `parseDimasRows`
  and `ImportSource = ... | "dimas"`; `ParseReport.links` and `.brandInferred`; notes capped at 5000 with the annotations preserved
  (the sheet's own note text is shortened first).
- `src/lib/import/inferBrands.ts` (new, pure): `inferBrands(dimasRecords, otherRecords, brands) -> {records, inferred}`.
- `src/lib/import/parseMaster.ts` (new): parses the 3 tables, infers Dimas brands.
- `src/lib/import/cliArgs.ts`, `run.ts`, `scripts/import-sheet.ts`: `-- <master.xlsx> [--apply]` (mode by first arg extension,
  case-insensitive); CSV mode unchanged. Workbook mode checks that "General Design", "Social Media", "Motion Support" exist
  (also in dry-run) and aborts before any write naming the missing one. Report prints per source incl. dimas, `links:` and
  `brand inferred:` lines. `applyImport.ts` needed no change (idempotency, <=100 batches, batch-named errors apply to dimas).
- `prisma/seedCore.ts`: request type "Motion Support" (empty fieldSchema, active), idempotent. Existing DBs: re-run `npm run db:seed`.
- README import section rewritten for the xlsx workflow.

## Decisions where the brief was silent
- `inferBrands` takes a third argument (`brands`) because notes need the brand name; it returns `{records, inferred}` and does not mutate inputs.
- Dimas rows whose requester is not inferred use Wira's own records for brand inference literally as specified ("same resolved requester"),
  so these rows get Wira's most common brand (tie/none -> Clogent).
- The Dimas "Requester (as typed)" rule can never apply (the first word is never treated as a typed name); not implemented there.
- Link Upload label is not appended to notes (only Brief/Folder labels, as specified).
- Importing a DONE Dimas row uses Jakarta midnight of Tanggal for all four events (no deadline).
- Dimas rows are skipped with a reason if "Clogent" / "Social Media" / "Dimas Pandu" is not in the DB.
- URL header columns are added to `headers` only for the three link columns; rows with no hyperlink have `""`.

## Existing tests
No existing assertion changed except `tests/seed.test.ts`: request type count 2 -> 3 (new "Motion Support" seed), plus an added assertion for it.

## Test evidence
- RED (before implementation): `npx vitest run tests/import tests/seed.test.ts` -> `Test Files 4 failed | 4 passed`, `Tests 7 failed | 50 passed (57)`
  (`Cannot find package '@/lib/import/readWorkbook'`, `File not found: undefined` for workbookPath args, seed type count 2 vs 3).
- GREEN: new files `readWorkbook.test.ts`, `parseWorkbook.test.ts` (incl. `inferBrands` unit tests), `dimasDb.test.ts` (real embedded Postgres:
  counts per source, Motion Support type, event chains, idempotent re-run inserts 0, missing type aborts before any write, KPI proof
  that Dimas Pandu's DONE tasks for 2026-09 == 6 September log rows, CLI args and dry-run default / `--apply`).
- Final: `npm run lint` clean, `npx tsc --noEmit` clean, `npm run build` OK, `npx vitest run` -> 48 files, 528 tests passed (was 47 files / 507 tests).

## Smoke test on the real export (throwaway embedded Postgres, temporary uncommitted test, deleted afterwards)
Dry-run, 0.6 s read+parse:
| source | rows read | importable | skipped | template | links (brief/folder/published) |
|---|---|---|---|---|---|
| requests | 354 (lines 2..355) | 353 | 0 | 1 | 343 / 252 / 0 |
| socmed | 132 (lines 3..134) | 97 | 35 (34 "Blank task", 1 invalid request date) | 0 | 94 / 51 / 35 |
| dimas | 103 (lines 2..104) | 103 | 0 | 0 | n/a |
- Unmapped requesters (requests): Yoel x4, Iyok x2, Reno, Ibnu, Felix (all 9 got `Requester (as typed)` notes) + 1 blank requester -> Wira. Socmed: 0. Dimas: 0 (16 "requester not recorded" warnings -> Wira).
- Dimas requesters: Fafa 33, Syahda 34, Robertino 20, Wira 16. Inferred brands: Clogent 83, Bubble Wash 20 (all 103 noted).
- Months: requests 2026-05..10 = 27/105/63/60/89/9; socmed 05:1, 09:14, 10:82; dimas 09:95, 10:8.
- Dates read correctly (e.g. `25/05/2026 -> 2026-05-25`, `9/30/2026 -> 2026-09-30`). Max notes length 219.
- A real `--apply` into the throwaway DB inserted 553 (353+97+103) and a second run inserted 0. No `--apply` was run against anything real.

## Observations / concerns
- SocMed line 3 (`ISI DENGAN JUDUL COVER/CONTENT`, Requester Wira, 2026-05-22) is the SocMed tab's example row and is imported as a real
  Social Media request; `isTemplateTask` only knows the Request List template text. Suggest adding it to the template check (not done: not in the brief).
- SocMed line 70 (`SHORT VIDEO | ...` with no Request Date) is skipped as "Invalid request date" - a real row the owner may want to fix in the sheet.
- 34 SocMed rows below the data have values (ghost checkbox booleans etc.) but no Task: skipped as "Blank task".
- Re-run caveat remains: the Dimas key uses file name + date, so renaming a file in the sheet and re-running duplicates it.
- Unverified: files exported by the live Google Sheets UI other than the one provided; exceljs cannot read `HYPERLINK()` formula targets (label only).

## Fix round 1
- A: `isTemplateTask` also matches the prefix `isi dengan ` (SocMed example row); "Isi konten promo" is kept.
- B: Dimas rows with an unrecorded requester (`requesterRecorded: false` on the record) skip brand inference and default to Clogent (note still says inferred).
- C: workbook mode (dry-run too) aborts before parsing/writing listing every missing lookup: brands Clogent / Bubble Wash, division Social Media, users Dimas Pandu / Wira (plus the type check).
- D: Dimas fallback rows get `Requester not recorded in Dimas Tracker; Wira used.` in notes; the console warning quotes the file name.
- E: first token split on `/[\s_\-.]+/`, whole-token match. Note: `FAFAYOEL` DOES match, because the seeded Fafa alias is "Fafa & Yoel" (normalizes to fafayoel); the negative tests use FAFAYO and RIOT.
- F: Dimas Tanggal / Nam File outside the first contiguous header block gives a named error.
- G: README reworded (requester rule, abort conditions).
- H: new `src/lib/import/urls.ts` `isSafeHttpUrl` (http/https, <= 2048 chars, no whitespace/control chars, no credentials), used by the parser (URL columns and label cells, brief/folder/published, CSV and workbook mode) and by the reader.
- I: workbook fixtures use example.com links and neutral names (only the template texts needed by the tests remain).
- Evidence: RED `Tests 9 failed | 85 passed` before the code; then GREEN.
- Smoke on the real export (throwaway DB, temp test deleted), dry-run: requests 353 importable / 1 template; socmed 96 importable (was 97) / 1 template / 35 skipped; dimas 103 importable, brands Clogent 83 / Bubble Wash 20 (unchanged: Wira's own majority was Clogent anyway); throwaway apply inserted 552, re-run 0; 16 Dimas rows use the Wira fallback.
