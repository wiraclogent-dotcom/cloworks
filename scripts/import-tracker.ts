import { readFileSync } from "node:fs";
import { PrismaClient, type ProjectStatus } from "@prisma/client";
import { parseCsv, planTaskSync, type SyncPlan } from "@/lib/designProjectSheet";
import { jakartaDay } from "@/lib/projectTasks";

// Imports the normalized Project Tracker CSV: one Project per item (by code) and one ProjectTask per sub-row.
// Dry-run by default; --apply writes. Missing brands are created on --apply. Re-running syncs the tasks of the
// projects in the file, matched by task title: new titles are created with the file's status, existing ones get
// the file's owner, dates, file and order but keep the status set in the app, and tasks no longer in the file are
// left alone (reported only). Projects not in the file are untouched.
//
// Usage: npm run import:tracker -- "<normalized>.csv" [--apply]

const STATUSES: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "DONE", "ON_HOLD"];

/** One file line keyed for matching (tracker tasks have no sub title), with its order in the project. */
type Keyed = { title: string; subTitle: null; position: number; line: Line };

type Line = {
  project_code: string; project_title: string; brand: string; project_owner: string; project_status: string;
  project_start: string; project_due: string; task_title: string; task_owner: string; task_status: string;
  start_date: string; due_date: string; file_name: string; file_url: string;
};

async function main() {
  const path = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!path) throw new Error('Usage: import:tracker -- "<normalized>.csv" [--apply]');

  const [header, ...body] = parseCsv(readFileSync(path, "utf8"));
  const lines: Line[] = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])) as unknown as Line);
  const byCode = new Map<string, Line[]>();
  for (const l of lines) byCode.set(l.project_code, [...(byCode.get(l.project_code) ?? []), l]);
  for (const l of lines) if (!STATUSES.includes(l.project_status as ProjectStatus) || (l.task_status && !STATUSES.includes(l.task_status as ProjectStatus)))
    throw new Error(`Unknown status on ${l.project_code} "${l.task_title}"`);

  const db = new PrismaClient();
  try {
    const brandNames = [...new Set(lines.map((l) => l.brand))];
    const brands = await db.brand.findMany({ where: { name: { in: brandNames } }, select: { id: true, name: true } });
    const brandId = new Map(brands.map((b) => [b.name, b.id]));
    const missingBrands = brandNames.filter((n) => !brandId.has(n));

    const ownerNames = [...new Set(lines.flatMap((l) => [l.project_owner, l.task_owner]).filter(Boolean))];
    const people = await db.user.findMany({ where: { name: { in: ownerNames }, active: true }, select: { id: true, name: true } });
    const personId = new Map(people.map((p) => [p.name, p.id]));
    const unknownOwners = ownerNames.filter((n) => !personId.has(n));
    if (unknownOwners.length) throw new Error(`Owners not in the roster: ${unknownOwners.join(", ")}`);

    console.log(`Source: ${path}`);
    console.log(`Projects: ${byCode.size}, tasks: ${lines.length}`);
    console.log(`Brands to create: ${missingBrands.length ? missingBrands.join(", ") : "none"}`);

    // Match file lines to tasks already in the database (by title). Statuses set in the app are kept.
    const existingProjects = await db.project.findMany({
      where: { code: { in: [...byCode.keys()] } },
      select: { code: true, tasks: { select: { id: true, title: true, subTitle: true } } },
    });
    const existingByCode = new Map(existingProjects.map((p) => [p.code!, p.tasks]));
    const plans = new Map<string, SyncPlan<Keyed>>();
    for (const [code, ls] of byCode) {
      const keyed = ls.map((l, i) => ({ title: l.task_title, subTitle: null, position: i + 1, line: l }));
      const plan = planTaskSync(existingByCode.get(code) ?? [], keyed);
      plans.set(code, plan);
      console.log(`  ${code}  [${ls[0].brand}] ${ls[0].project_title}  status=${ls[0].project_status}  tasks=${ls.length}  ` +
        `(${plan.create.length} to create, ${plan.update.length} to update with status kept, ${plan.missing.length} not in file)`);
      for (const m of plan.missing) console.log(`     not in file (left alone): ${m.title}`);
    }

    if (!apply) {
      console.log("\nDry run: nothing written. Re-run with --apply to write.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const name of missingBrands) {
        const b = await tx.brand.create({ data: { name } });
        brandId.set(name, b.id);
      }
      for (const [code, ls] of byCode) {
        const first = ls[0];
        const starts = ls.map((l) => l.project_start).filter(Boolean).sort();
        const dues = ls.map((l) => l.project_due).filter(Boolean).sort();
        const fields = {
          title: first.project_title,
          brandId: brandId.get(first.brand)!,
          ownerId: personId.get(first.project_owner)!,
          status: first.project_status as ProjectStatus,
          startDate: starts.length ? jakartaDay(starts[0]) : null,
          dueDate: dues.length ? jakartaDay(dues[dues.length - 1]) : null,
        };
        // Codes are unique per workspace, so find-then-update/create rather than upsert by code.
        const found = await tx.project.findFirst({ where: { code }, select: { id: true } });
        const project = found
          ? await tx.project.update({ where: { id: found.id }, data: fields })
          : await tx.project.create({ data: { code, ...fields } });
        const plan = plans.get(code)!;
        const fieldsOf = ({ line: l, position }: Keyed) => ({
          position,
          title: l.task_title,
          ownerId: l.task_owner ? personId.get(l.task_owner) ?? null : null,
          startDate: l.start_date ? jakartaDay(l.start_date) : null,
          dueDate: l.due_date ? jakartaDay(l.due_date) : null,
          fileName: l.file_name || null,
          fileUrl: l.file_url || null,
        });
        if (plan.create.length) {
          // New tasks take their status from the file; existing ones keep whatever the app has set.
          await tx.projectTask.createMany({
            data: plan.create.map((k) => ({ projectId: project.id, status: (k.line.task_status || null) as ProjectStatus | null, ...fieldsOf(k) })),
          });
        }
        for (const u of plan.update) await tx.projectTask.update({ where: { id: u.id }, data: fieldsOf(u.row) });
      }
    });
    const created = [...plans.values()].reduce((n, p) => n + p.create.length, 0);
    const updated = [...plans.values()].reduce((n, p) => n + p.update.length, 0);
    console.log(`\nApplied: ${byCode.size} projects, ${created} tasks created, ${updated} updated, ${missingBrands.length} brands created.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
