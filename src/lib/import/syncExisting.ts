import type { Prisma, PrismaClient, RequestStatus } from "@prisma/client";
import type { ImportRecord } from "./parseRequests";

/*
 * Brings requests that were imported earlier up to date with a newer export of the sheet (Request List and SocMed
 * only; Dimas rows are a done-log and never change). People also work in the app, so the sheet does not simply win:
 * - status only moves forward (Requested > On Progress > First Look > Done), never back, never out of Cancelled;
 * - the designer is filled in only when the app has nobody assigned;
 * - links, deadline, output count, Include KPI and the SocMed flags/platform/published link take the sheet's value
 *   when the sheet has one and it differs. Notes, title, requester, brand and division are never touched.
 */

const CHAIN: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"];
const SYNCED_FIELDS = ["platform", "contentType", "shooting", "upload", "editing", "publishedUrl"] as const;

type Existing = {
  id: string; title: string; status: RequestStatus; assigneeId: string | null; requesterId: string; deadline: Date | null;
  originalDeadline: Date | null; outputCount: number; includeKpi: boolean; briefUrl: string | null; designFolderUrl: string | null;
  fields: unknown;
};

export type RequestUpdate = {
  id: string;
  source: ImportRecord["source"];
  row: number;
  title: string;
  /** Human-readable "field: old -> new" lines for the report. */
  changes: string[];
  data: {
    status?: RequestStatus; assigneeId?: string; deadline?: Date | null; originalDeadline?: Date | null; outputCount?: number;
    includeKpi?: boolean; briefUrl?: string; designFolderUrl?: string; fields?: Record<string, unknown>;
  };
  /** Status steps to record, in order (e.g. REQUESTED > ON_PROGRESS > FIRST_LOOK). */
  steps: { from: RequestStatus; to: RequestStatus }[];
  /** Deadline change to record as a DeadlineEvent. */
  deadlineMove?: { from: Date | null; to: Date };
  actorId: string;
};

export type SyncPlan = { updates: RequestUpdate[]; unchanged: number; statusKept: { row: number; source: string; title: string; app: RequestStatus; sheet: RequestStatus }[] };

const day = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : "none");
const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Read-only: compares parsed sheet records with the requests they were imported as (matched by importKey). */
export async function planSync(db: PrismaClient, workspaceId: string, records: ImportRecord[], names: Map<string, string>): Promise<SyncPlan> {
  const candidates = records.filter((r) => r.source !== "dimas");
  const keys = candidates.map((r) => r.fields.importKey);
  const found = keys.length
    ? await db.$queryRaw<{ id: string; k: string }[]>`SELECT id, fields->>'importKey' AS k FROM "Request" WHERE "workspaceId" = ${workspaceId} AND fields->>'importKey' = ANY(${keys})`
    : [];
  const idByKey = new Map(found.map((f) => [f.k, f.id]));
  const rows: Existing[] = found.length
    ? await db.request.findMany({
        where: { id: { in: found.map((f) => f.id) } },
        select: { id: true, title: true, status: true, assigneeId: true, requesterId: true, deadline: true, originalDeadline: true, outputCount: true, includeKpi: true, briefUrl: true, designFolderUrl: true, fields: true },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const who = (id: string | null) => (id ? names.get(id) ?? id : "nobody");

  const plan: SyncPlan = { updates: [], unchanged: 0, statusKept: [] };
  for (const r of candidates) {
    const cur = byId.get(idByKey.get(r.fields.importKey) ?? "");
    if (!cur) continue; // not imported yet: the insert step handles it
    const changes: string[] = [];
    const data: RequestUpdate["data"] = {};
    let steps: RequestUpdate["steps"] = [];
    let deadlineMove: RequestUpdate["deadlineMove"];

    const assignee = cur.assigneeId ?? r.assigneeId;
    if (!cur.assigneeId && r.assigneeId) {
      data.assigneeId = r.assigneeId;
      changes.push(`designer: nobody -> ${who(r.assigneeId)}`);
    }

    const at = CHAIN.indexOf(cur.status), to = CHAIN.indexOf(r.status);
    if (at >= 0 && to > at) {
      data.status = r.status;
      steps = CHAIN.slice(at, to).map((from, i) => ({ from, to: CHAIN[at + i + 1] }));
      changes.push(`status: ${cur.status} -> ${r.status}`);
    } else if (to !== at) plan.statusKept.push({ row: r.row, source: r.source, title: r.title, app: cur.status, sheet: r.status });

    if (r.deadline && !same(cur.deadline, r.deadline)) {
      data.deadline = r.deadline;
      if (!cur.originalDeadline && cur.deadline) data.originalDeadline = cur.deadline;
      deadlineMove = { from: cur.deadline, to: r.deadline };
      changes.push(`deadline: ${day(cur.deadline)} -> ${day(r.deadline)}`);
    }
    if (r.outputSet && r.outputCount !== cur.outputCount) {
      data.outputCount = r.outputCount;
      changes.push(`outputs: ${cur.outputCount} -> ${r.outputCount}`);
    }
    if (r.source === "socmed" && r.includeKpi !== cur.includeKpi) {
      data.includeKpi = r.includeKpi;
      changes.push(`include KPI: ${cur.includeKpi} -> ${r.includeKpi}`);
    }
    if (r.briefUrl && r.briefUrl !== cur.briefUrl) {
      data.briefUrl = r.briefUrl;
      changes.push(`brief link: ${cur.briefUrl ?? "none"} -> ${r.briefUrl}`);
    }
    if (r.designFolderUrl && r.designFolderUrl !== cur.designFolderUrl) {
      data.designFolderUrl = r.designFolderUrl;
      changes.push(`design folder: ${cur.designFolderUrl ?? "none"} -> ${r.designFolderUrl}`);
    }
    if (r.source === "socmed") {
      const old = (cur.fields && typeof cur.fields === "object" ? cur.fields : {}) as Record<string, unknown>;
      const next = { ...old };
      for (const k of SYNCED_FIELDS) {
        const v = r.fields[k];
        if (v === undefined || v === old[k]) continue; // platform/contentType/publishedUrl only when the sheet has one
        next[k] = v;
        changes.push(`${k}: ${old[k] ?? "none"} -> ${v}`);
      }
      if (changes.some((c) => SYNCED_FIELDS.some((k) => c.startsWith(`${k}:`)))) data.fields = next;
    }

    if (!changes.length) { plan.unchanged++; continue; }
    plan.updates.push({ id: cur.id, source: r.source, row: r.row, title: cur.title, changes, data, steps, deadlineMove, actorId: assignee ?? cur.requesterId });
  }
  return plan;
}

/** Writes the plan in one transaction. Status steps and deadline moves are recorded as events at the time of the sync. */
export async function applySync(db: PrismaClient, plan: SyncPlan): Promise<number> {
  if (!plan.updates.length) return 0;
  const now = new Date();
  await db.$transaction(
    async (tx) => {
      for (const u of plan.updates) {
        await tx.request.update({ where: { id: u.id }, data: { ...u.data, fields: u.data.fields as Prisma.InputJsonObject | undefined } });
        if (u.steps.length) await tx.statusEvent.createMany({ data: u.steps.map((s) => ({ requestId: u.id, ...s, actorId: u.actorId, at: now })) });
        if (u.deadlineMove) await tx.deadlineEvent.create({ data: { requestId: u.id, ...u.deadlineMove, actorId: u.actorId, at: now } });
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  return plan.updates.length;
}
