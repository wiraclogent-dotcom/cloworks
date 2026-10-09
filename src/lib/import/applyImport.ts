import type { PrismaClient } from "@prisma/client";
import { statusChain, type ImportRecord } from "./parseRequests";

export type ApplyResult = { inserted: number; alreadyImported: Record<string, number> };

/**
 * Writes parsed records into `workspaceId` (the raw query below is not scoped by the client, so it filters by it). Idempotent via fields.importKey. One transaction per batch (<=100); a failing
 * batch aborts the run (earlier batches stay committed and are skipped on re-run).
 * See DONE_CAVEAT in parseRequests.ts: synthetic DONE events are placed at the deadline.
 */
export async function applyImport(db: PrismaClient, workspaceId: string, records: ImportRecord[], opts: { batchSize?: number } = {}): Promise<ApplyResult> {
  const batchSize = Math.min(opts.batchSize ?? 100, 100);

  // Verify every needed lookup row exists BEFORE writing anything.
  const typeNames = [...new Set(records.map((r) => r.typeName))];
  const types = await db.requestType.findMany({ where: { name: { in: typeNames } }, select: { id: true, name: true } });
  const missingTypes = typeNames.filter((n) => !types.some((t) => t.name === n));
  if (missingTypes.length) throw new Error(`Request type(s) missing in DB: ${missingTypes.join(", ")}. Nothing was written.`);
  const brandIds = [...new Set(records.map((r) => r.brandId))];
  const divIds = [...new Set(records.map((r) => r.divisionId))];
  const [bs, ds] = await Promise.all([
    db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true } }),
    db.division.findMany({ where: { id: { in: divIds } }, select: { id: true } }),
  ]);
  if (bs.length !== brandIds.length) throw new Error("A brand referenced by the import no longer exists in DB. Nothing was written.");
  if (ds.length !== divIds.length) throw new Error("A division referenced by the import no longer exists in DB. Nothing was written.");
  const typeId = new Map(types.map((t) => [t.name, t.id]));

  const existing = new Set(
    (await db.$queryRaw<{ k: string }[]>`SELECT fields->>'importKey' AS k FROM "Request" WHERE fields->>'importKey' IS NOT NULL AND "workspaceId" = ${workspaceId}`).map((r) => r.k),
  );
  const alreadyImported: Record<string, number> = {};
  const fresh: ImportRecord[] = [];
  for (const r of records) {
    if (existing.has(r.fields.importKey)) alreadyImported[r.source] = (alreadyImported[r.source] ?? 0) + 1;
    else fresh.push(r);
  }

  let inserted = 0;
  for (let i = 0, b = 1; i < fresh.length; i += batchSize, b++) {
    const batch = fresh.slice(i, i + batchSize);
    try {
      await db.$transaction(
        async (tx) => {
          for (const r of batch) {
            const created = await tx.request.create({
              data: {
                title: r.title, briefUrl: r.briefUrl, notes: r.notes, brandId: r.brandId, divisionId: r.divisionId,
                typeId: typeId.get(r.typeName)!, requesterId: r.requesterId, assigneeId: r.assigneeId,
                requestedAt: r.requestedAt, deadline: r.deadline, status: r.status, outputCount: r.outputCount,
                includeKpi: r.includeKpi, designFolderUrl: r.designFolderUrl, fields: r.fields as object,
              },
              select: { id: true },
            });
            await tx.statusEvent.createMany({ data: statusChain(r).map((e) => ({ ...e, requestId: created.id })) });
          }
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n").filter(Boolean).slice(-1)[0] : String(e);
      throw new Error(`Import failed in batch ${b}; ${inserted} request(s) from earlier batches were committed and will be skipped on re-run. Cause: ${msg}`);
    }
    inserted += batch.length;
  }
  return { inserted, alreadyImported };
}
