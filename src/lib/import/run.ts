import fs from "node:fs";
import type { PrismaClient } from "@prisma/client";
import type { CliArgs } from "./cliArgs";
import { readCsv } from "./csv";
import { applyImport } from "./applyImport";
import { DONE_CAVEAT, parseRequestRows, type ImportRecord, type ParseReport } from "./parseRequests";

export const DUPLICATE_NOTE =
  "Re-run caveat: correcting a requester name in the sheet after import and re-running will create a duplicate of that row (the import key includes the requester text). The dry-run only reads from the database (read-only).";

export function formatReport(rep: ParseReport, already?: number): string[] {
  const out: string[] = [`\n== ${rep.source} ==`];
  out.push(`rows read:   ${rep.rowsRead}`, `importable:  ${rep.importable}`, `template:    ${rep.template}`, `skipped:     ${rep.skipped.length}`);
  const reasons = new Map<string, number>();
  for (const s of rep.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  for (const [r, n] of reasons) out.push(`  - ${r}: ${n}`);
  out.push(`links:       brief ${rep.links.brief}, folder ${rep.links.folder}, published ${rep.links.published}`);
  if (rep.brandInferred !== undefined) out.push(`brand inferred: ${rep.brandInferred} (Brand is not recorded in Dimas Tracker)`);
  out.push(`warnings:    ${rep.warnings.length}`);
  for (const w of rep.warnings.slice(0, 20)) out.push(`  - line ${w.row}: ${w.message}`);
  if (rep.warnings.length > 20) out.push(`  ... and ${rep.warnings.length - 20} more`);
  const un = new Map<string, number>();
  for (const u of rep.unmapped) un.set(`${u.field}: "${u.value}"`, (un.get(`${u.field}: "${u.value}"`) ?? 0) + 1);
  out.push(`unmapped names: ${un.size}`);
  for (const [k, n] of [...un].sort((a, b) => b[1] - a[1])) out.push(`  - ${k} x${n}`);
  if (rep.samples.length) {
    out.push(`first ${rep.samples.length} parsed dates (assumed ${rep.dateFormat === "dmy" ? "day/month/year" : "month/day/year"}; check they read correctly before --apply):`);
    for (const x of rep.samples)
      out.push(`  line ${x.row}: requested ${x.requestRaw} \u2192 ${x.requestIso}` + (x.deadlineRaw ? `; deadline ${x.deadlineRaw} \u2192 ${x.deadlineIso ?? "invalid, left empty"}` : "; no deadline"));
  }
  out.push("months (by request date, Jakarta):");
  for (const m of Object.keys(rep.months).sort()) out.push(`  ${m}: ${rep.months[m]}`);
  if (already !== undefined) out.push(`already imported: ${already}`);
  return out;
}

export type RunDeps = {
  apply?: typeof applyImport;
  readFile?: (p: string) => string;
  exists?: (p: string) => boolean;
  log?: (line: string) => void;
};

/** Parses everything first (any header/format problem throws here, before any write), prints the report, then applies only with --apply. */
export async function runImport(db: PrismaClient, args: CliArgs, deps: RunDeps = {}) {
  const apply = deps.apply ?? applyImport;
  const readFile = deps.readFile ?? ((p: string) => fs.readFileSync(p, "utf8"));
  const exists = deps.exists ?? fs.existsSync;
  const log = deps.log ?? console.log;

  const [users, brands, divisions] = await Promise.all([db.user.findMany(), db.brand.findMany(), db.division.findMany()]);
  const ctx = { users, brands, divisions };
  const inputs: ["requests" | "socmed", string][] = [["requests", args.requestsPath]];
  if (args.socmedPath) inputs.push(["socmed", args.socmedPath]);

  const reports: ParseReport[] = [];
  const records: ImportRecord[] = [];
  for (const [source, file] of inputs) {
    if (!exists(file)) throw new Error(`File not found: ${file}`);
    const { headers, rows, lines } = readCsv(readFile(file));
    const parsed = parseRequestRows(source, rows, ctx, headers, lines);
    reports.push(parsed.report);
    records.push(...parsed.records);
  }

  log(args.apply ? "MODE: APPLY (writing to DB after this report)" : "MODE: DRY-RUN (nothing is written; pass --apply to import)");
  const keys = new Set((await db.$queryRaw<{ k: string }[]>`SELECT fields->>'importKey' AS k FROM "Request" WHERE fields->>'importKey' IS NOT NULL`).map((r) => r.k));
  for (const rep of reports) {
    for (const l of formatReport(rep, records.filter((r) => r.source === rep.source && keys.has(r.fields.importKey)).length)) log(l);
  }
  log(`\nNOTE: ${DONE_CAVEAT}`);
  log(`NOTE: ${DUPLICATE_NOTE}`);

  if (!args.apply) return null;
  const res = await apply(db, records);
  log(`\nApplied: inserted ${res.inserted}, already imported ${JSON.stringify(res.alreadyImported)}`);
  return res;
}
