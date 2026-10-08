import type { AppRole, PrismaClient, RequestStatus } from "@prisma/client";
import { can } from "./permissions";
import { canTransition } from "./workflow";
import { STATUS_LABEL } from "./statusLabels";
import { bestEffort, buildMessage, notifierFor, type Notifier } from "./notify";

export class TransitionError extends Error {
  constructor(
    public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

export const MAX_OUTPUT_COUNT = 1000;
const NEEDS_ASSIGNEE = "Request needs an assignee before it can be marked Done";

export type TransitionOpts = { outputCount?: number; designFolderUrl?: string };

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function transitionRequestWith(
  db: PrismaClient,
  user: { id: string; appRole: AppRole },
  requestId: string,
  to: RequestStatus,
  opts: TransitionOpts = {},
  notifier: Notifier = notifierFor(db),
): Promise<void> {
  if (!can(user.appRole, "request.transition")) throw new TransitionError("FORBIDDEN", "Forbidden: not allowed to change request status");
  if (opts.outputCount !== undefined && (!Number.isInteger(opts.outputCount) || opts.outputCount < 1 || opts.outputCount > MAX_OUTPUT_COUNT))
    throw new TransitionError("INVALID", `Number of outputs must be a whole number from 1 to ${MAX_OUTPUT_COUNT}`);
  if (opts.designFolderUrl !== undefined && !isHttpUrl(opts.designFolderUrl))
    throw new TransitionError("INVALID", "designFolderUrl must be an http(s) URL");

  const change = await db.$transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId }, select: { status: true, assigneeId: true, requesterId: true, title: true } });
    if (!req) throw new TransitionError("NOT_FOUND", "Request not found");
    const from = req.status;
    if (!canTransition(from, to)) throw new TransitionError("INVALID", `Cannot move request from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`);
    if (to === "DONE" && !req.assigneeId) throw new TransitionError("INVALID", NEEDS_ASSIGNEE);

    const data: { status: RequestStatus; outputCount?: number; designFolderUrl?: string } = { status: to };
    if (to === "DONE") {
      if (opts.outputCount !== undefined) data.outputCount = opts.outputCount;
      if (opts.designFolderUrl !== undefined) data.designFolderUrl = opts.designFolderUrl;
    }
    // Compare-and-set on the status we validated against: a concurrent transition makes this match 0 rows.
    // For DONE the assignee is pinned too: a concurrent unassign must not produce a DONE request nobody owns.
    const res = await tx.request.updateMany({ where: { id: requestId, status: from, ...(to === "DONE" ? { assigneeId: { not: null } } : {}) }, data });
    if (res.count !== 1) {
      const now = await tx.request.findUnique({ where: { id: requestId }, select: { status: true, assigneeId: true } });
      if (to === "DONE" && now && now.status === from && !now.assigneeId) throw new TransitionError("INVALID", NEEDS_ASSIGNEE);
      throw new TransitionError("CONFLICT", "Request status changed concurrently; reload and retry");
    }
    await tx.statusEvent.create({ data: { requestId, from, to, actorId: user.id, at: new Date() } });
    return { from, to, assigneeId: req.assigneeId, requesterId: req.requesterId, title: req.title };
  });

  await bestEffort(async () => {
    const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const message = buildMessage("STATUS", actor?.name ?? "Someone", change.title, { from: change.from, to: change.to });
    const userIds = [...new Set([change.requesterId, change.assigneeId])].filter((id): id is string => !!id && id !== user.id);
    await notifier({ actorId: user.id, userIds, requestId, type: "STATUS", message });
  });
}
