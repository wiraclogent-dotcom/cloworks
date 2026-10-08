import type { AppRole, PrismaClient, RequestStatus } from "@prisma/client";
import { can } from "./permissions";
import { canTransition } from "./workflow";

export class TransitionError extends Error {
  constructor(
    public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

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
): Promise<void> {
  if (!can(user.appRole, "request.transition")) throw new TransitionError("FORBIDDEN", "Forbidden: not allowed to change request status");
  if (opts.outputCount !== undefined && (!Number.isInteger(opts.outputCount) || opts.outputCount < 1))
    throw new TransitionError("INVALID", "outputCount must be an integer >= 1");
  if (opts.designFolderUrl !== undefined && !isHttpUrl(opts.designFolderUrl))
    throw new TransitionError("INVALID", "designFolderUrl must be an http(s) URL");

  await db.$transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId }, select: { status: true, assigneeId: true } });
    if (!req) throw new TransitionError("NOT_FOUND", "Request not found");
    const from = req.status;
    if (!canTransition(from, to)) throw new TransitionError("INVALID", `Cannot move request from ${from} to ${to}`);
    if (to === "DONE" && !req.assigneeId) throw new TransitionError("INVALID", "Request needs an assignee before it can be marked DONE");

    const data: { status: RequestStatus; outputCount?: number; designFolderUrl?: string } = { status: to };
    if (to === "DONE") {
      if (opts.outputCount !== undefined) data.outputCount = opts.outputCount;
      if (opts.designFolderUrl !== undefined) data.designFolderUrl = opts.designFolderUrl;
    }
    // Compare-and-set on the status we validated against: a concurrent transition makes this match 0 rows.
    const res = await tx.request.updateMany({ where: { id: requestId, status: from }, data });
    if (res.count !== 1) throw new TransitionError("CONFLICT", "Request status changed concurrently; reload and retry");
    await tx.statusEvent.create({ data: { requestId, from, to, actorId: user.id, at: new Date() } });
  });
}
