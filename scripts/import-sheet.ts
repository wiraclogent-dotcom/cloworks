import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseArgs } from "../src/lib/import/cliArgs";
import { readCsv } from "../src/lib/import/csv";
import { applyImport } from "../src/lib/import/applyImport";
import { DONE_CAVEAT, parseRequestRows, type ImportRecord, type ParseReport, type ImportSource } from "../src/lib/import/parseRequests";

// Dry-run by default; --apply writes. Never fetches URLs; reads local CSV exports only.
function printReport(rep: ParseReport, already?: number) {
  console.log(`\n== ${rep.source} ==`);
  console.log(`rows read:   ${rep.rowsRead}`);
  console.log(`importable:  ${rep.importable}`);
  console.log(`template:    ${rep.template}`);
  console.log(`skipped:     ${rep.skipped.length}`);
  const reasons = new Map<string, number>();
  for (const s of rep.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  for (const [r, n] of reasons) console.log(`  - ${r}: ${n}`);
  console.log(`warnings:    ${rep.warnings.length}`);
  for (const w of rep.warnings.slice(0, 20)) console.log(`  - row ${w.row}: ${w.message}`);
  if (rep.warnings.length > 20) console.log(`  ... and ${rep.warnings.length - 20} more`);
  const un = new Map<string, number>();
  for (const u of rep.unmapped) un.set(`${u.field}: "${u.value}"`, (un.get(`${u.field}: "${u.value}"`) ?? 0) + 1);
  console.log(`unmapped names: ${un.size}`);
  for (const [k, n] of [...un].sort((a, b) => b[1] - a[1])) console.log(`  - ${k} x${n}`);
  console.log("months (by request date, Jakarta):");
  for (const m of Object.keys(rep.months).sort()) console.log(`  ${m}: ${rep.months[m]}`);
  if (already !== undefined) console.log(`already imported: ${already}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    const [users, brands, divisions] = await Promise.all([db.user.findMany(), db.brand.findMany(), db.division.findMany()]);
    const ctx = { users, brands, divisions };
    const inputs: [ImportSource, string][] = [["requests", args.requestsPath]];
    if (args.socmedPath) inputs.push(["socmed", args.socmedPath]);

    const reports: ParseReport[] = [];
    const records: ImportRecord[] = [];
    for (const [source, file] of inputs) {
      if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
      const { headers, rows } = readCsv(fs.readFileSync(file, "utf8"));
      const parsed = parseRequestRows(source, rows, ctx, headers);
      reports.push(parsed.report);
      records.push(...parsed.records);
    }

    console.log(args.apply ? "MODE: APPLY (writing to DB after this report)" : "MODE: DRY-RUN (nothing is written; pass --apply to import)");
    // Idempotency preview: how many are already in the DB.
    const keys = new Set((await db.$queryRaw<{ k: string }[]>`SELECT fields->>'importKey' AS k FROM "Request" WHERE fields->>'importKey' IS NOT NULL`).map((r) => r.k));
    for (const rep of reports) printReport(rep, records.filter((r) => r.source === rep.source && keys.has(r.fields.importKey)).length);
    console.log(`\nNOTE: ${DONE_CAVEAT}`);

    if (!args.apply) return;
    const res = await applyImport(db, records);
    console.log(`\nApplied: inserted ${res.inserted}, already imported ${JSON.stringify(res.alreadyImported)}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
