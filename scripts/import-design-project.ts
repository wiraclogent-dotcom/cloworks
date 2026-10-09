import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseTasks, planTaskSync, type Row } from "@/lib/designProjectSheet";

// Imports one design-project sheet tab (columns A-H only) into Project + ProjectTask.
// Dry-run by default; --apply writes in one transaction. Re-running with --apply syncs this project's tasks, matched
// by product + variant name: new rows are created with the sheet's stage, existing rows get the sheet's other fields
// but keep the stage set in the app, and rows no longer in the sheet are left alone (reported only). The Project row
// (matched by `code`) keeps its owner and status; its title, brand and start/due dates follow the sheet.
//
// Usage: npm run import:design-project -- "<tab>.csv" --code REDESIGN --title "Redesign Project" [--links-xlsx "<workbook>.xlsx" --tab "Redesign Project"] [--apply]
// CSV exports drop cell hyperlinks, so pass the .xlsx export of the same workbook to keep the File Document links.

const XML_NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m?.[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Reads the hyperlinks in column H of one tab in an .xlsx (unzip only, no extra dependencies). Returns sheet row -> URL. */
function readFileLinks(xlsx: string, tab: string): Map<number, string> {
  const part = (name: string) => execFileSync("unzip", ["-p", xlsx, name], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const wb = part("xl/workbook.xml");
  const sheetTag = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]).find((t) => attr(t, "name") === tab);
  if (!sheetTag) throw new Error(`Tab "${tab}" not found in ${xlsx}`);
  const rid = attr(sheetTag, "r:id") ?? sheetTag.match(new RegExp(`${XML_NS_REL.split("/").pop()}:id="([^"]*)"`))?.[1];
  const rels = part("xl/_rels/workbook.xml.rels");
  const relTag = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map((m) => m[0]).find((t) => attr(t, "Id") === rid);
  if (!relTag) throw new Error(`No relationship for tab "${tab}"`);
  const sheetPath = "xl/" + attr(relTag, "Target")!.replace(/^\/?(xl\/)?/, "");
  const sheetXml = part(sheetPath);
  const relsPath = sheetPath.replace(/worksheets\//, "worksheets/_rels/") + ".rels";
  const sheetRels = new Map<string, string>();
  for (const m of part(relsPath).matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = attr(m[0], "Id"); const target = attr(m[0], "Target");
    if (id && target) sheetRels.set(id, target);
  }
  const out = new Map<number, string>();
  for (const m of sheetXml.matchAll(/<hyperlink\b[^>]*\/>/g)) {
    const ref = attr(m[0], "ref") ?? "";
    const col = ref.replace(/\d+$/, ""); const row = Number(ref.replace(/^[A-Z]+/, ""));
    const target = sheetRels.get(attr(m[0], "r:id") ?? "");
    if (col === "H" && target && /^https?:\/\//.test(target)) out.set(row, target);
  }
  return out;
}

const SECTION_OWNER_BRAND = "Clogent";
const PROJECT_OWNER = "Wira";

// Print dates as the Jakarta calendar day they were entered as (the stored instant is Jakarta midnight, UTC-17:00 prior day).
const jk = (d: Date | null) => (d ? d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }) : null);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const path = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--") );
  const code = arg("--code");
  const title = arg("--title");
  const apply = process.argv.includes("--apply");
  if (!path || !code || !title) throw new Error('Usage: import:design-project -- "<tab>.csv" --code <CODE> --title "<Title>" [--apply]');

  const linksXlsx = arg("--links-xlsx");
  const linksTab = arg("--tab") ?? title;
  const links = linksXlsx ? readFileLinks(linksXlsx, linksTab) : new Map<number, string>();
  const rows = parseTasks(readFileSync(path, "utf8"), links);
  console.log(`File links from ${linksXlsx ?? "(none)"}: ${links.size}`);
  const db = new PrismaClient();
  try {
    const brand = await db.brand.findUnique({ where: { name: SECTION_OWNER_BRAND } });
    const projectOwner = await db.user.findFirst({ where: { name: PROJECT_OWNER, active: true } });
    if (!brand) throw new Error(`Brand "${SECTION_OWNER_BRAND}" is missing. Run npm run db:seed first.`);
    if (!projectOwner) throw new Error(`User "${PROJECT_OWNER}" is missing. Run npm run db:seed first.`);

    const names = [...new Set(rows.map((r) => r.ownerName).filter((n): n is string => !!n))];
    const people = await db.user.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
    const byName = new Map(people.map((p) => [p.name, p.id]));
    const ambiguous = names.filter((n) => people.filter((p) => p.name === n).length > 1);
    if (ambiguous.length) throw new Error(`Several users share these names, so task owners are ambiguous: ${ambiguous.join(", ")}. Make the names unique first.`);
    const unmapped = names.filter((n) => !byName.has(n));
    if (unmapped.length) throw new Error(`Task owners not in the roster: ${unmapped.join(", ")}. Add them or fix the sheet.`);

    const starts = rows.map((r) => r.startDate).filter((d): d is Date => !!d);
    const dues = rows.map((r) => r.dueDate).filter((d): d is Date => !!d);
    const earliestStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
    const latestDue = dues.length ? new Date(Math.max(...dues.map((d) => d.getTime()))) : null;
    const products = new Set(rows.map((r) => r.title));
    const stages = rows.reduce<Record<string, number>>((acc, r) => { const k = r.stage ?? "none"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    const owners = rows.reduce<Record<string, number>>((acc, r) => { const k = r.ownerName ?? "none"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

    console.log(`Source: ${path}`);
    console.log(`Project: code=${code} "${title}" brand=${brand.name} owner=${projectOwner.name}`);
    console.log(`Tasks: ${rows.length} rows, ${products.size} products`);
    console.log(`Stages: ${JSON.stringify(stages)}`);
    console.log(`Owners: ${JSON.stringify(owners)}`);
    console.log(`Due TBC: ${rows.filter((r) => r.dueTbc).length} rows`);
    console.log(`No file: ${rows.filter((r) => !r.fileName).length} rows`);
    console.log(`Project dates: start ${jk(earliestStart) ?? "none"}, due ${jk(latestDue) ?? "none"}`);
    console.log("First 3 rows:");
    for (const r of rows.slice(0, 3)) console.log("  ", JSON.stringify({ ...r, startDate: jk(r.startDate), dueDate: jk(r.dueDate) }));

    // Match sheet rows to variants already in the database (by product + sub title). Stages set in the app are kept.
    const existingProject = await db.project.findUnique({ where: { code }, select: { id: true } });
    const existing = existingProject
      ? await db.projectTask.findMany({ where: { projectId: existingProject.id }, select: { id: true, title: true, subTitle: true } })
      : [];
    const plan = planTaskSync(existing, rows);
    console.log(`Sync: ${plan.create.length} to create, ${plan.update.length} to update (stage kept), ${plan.missing.length} in the database but not in the sheet`);
    for (const m of plan.missing) console.log(`   not in sheet (left alone): ${m.title} / ${m.subTitle ?? "-"}`);

    if (!apply) {
      console.log("\nDry run: nothing written. Re-run with --apply to write.");
      return;
    }

    const fieldsOf = (r: Row) => ({
      position: r.position,
      title: r.title,
      subTitle: r.subTitle,
      ownerId: r.ownerName ? byName.get(r.ownerName) ?? null : null,
      startDate: r.startDate,
      dueDate: r.dueDate,
      dueTbc: r.dueTbc,
      fileName: r.fileName,
      fileUrl: r.fileUrl,
      notes: r.notes,
    });
    const project = await db.$transaction(async (tx) => {
      const p = await tx.project.upsert({
        where: { code },
        create: {
          code,
          title,
          brandId: brand.id,
          ownerId: projectOwner.id,
          status: "IN_PROGRESS",
          startDate: earliestStart,
          dueDate: latestDue,
        },
        update: { title, brandId: brand.id, startDate: earliestStart, dueDate: latestDue },
      });
      if (plan.create.length) {
        // New variants take their stage from the sheet; existing ones keep whatever the app has set.
        await tx.projectTask.createMany({ data: plan.create.map((r) => ({ projectId: p.id, stage: r.stage, ...fieldsOf(r) })) });
      }
      for (const u of plan.update) {
        await tx.projectTask.update({ where: { id: u.id }, data: fieldsOf(u.row) });
      }
      return p;
    });
    console.log(`\nApplied: project ${project.id} (${project.code}): ${plan.create.length} created, ${plan.update.length} updated.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
