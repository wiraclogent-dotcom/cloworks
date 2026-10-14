import type { AppRole, PrismaClient, RequestStatus } from "@prisma/client";
import { can } from "./permissions";
import { FILE_LOCATION_HINT, isFileLocation } from "./fileLocation";
import { canTransition } from "./workflow";
import { STATUS_LABEL } from "./statusLabels";
import { syncContentPostForRequest } from "./content/sync";
import { bestEffort, buildMessage, notifierFor, realMailer, type Notifier } from "./notify";
import { notifyContentWith } from "./content/notify";

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
  if (opts.designFolderUrl !== undefined && !isFileLocation(opts.designFolderUrl))
    throw new TransitionError("INVALID", `Design folder: ${FILE_LOCATION_HINT.toLowerCase()}`);

  const change = await db.$transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId }, select: { status: true, requesterId: true, title: true, assignees: { select: { userId: true } } } });
    if (!req) throw new TransitionError("NOT_FOUND", "Request not found");
    const from = req.status;
    if (!canTransition(from, to)) throw new TransitionError("INVALID", `Cannot move request from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`);

    const data: { status: RequestStatus; outputCount?: number; designFolderUrl?: string } = { status: to };
    if (to === "DONE") {
      if (opts.outputCount !== undefined) data.outputCount = opts.outputCount;
      if (opts.designFolderUrl !== undefined) data.designFolderUrl = opts.designFolderUrl.trim();
    }
    // Compare-and-set on the status we validated against: a concurrent transition makes this match 0 rows.
    const res = await tx.request.updateMany({ where: { id: requestId, status: from }, data });
    if (res.count !== 1) throw new TransitionError("CONFLICT", "Request status changed concurrently; reload and retry");
    // A DONE request must have an owner. Counting after the CAS has locked the row: setAssigneesWith takes the same row
    // lock, so a concurrent unassign either finished before this count (we see 0 and roll back) or waits until we commit.
    if (to === "DONE" && (await tx.requestAssignee.count({ where: { requestId } })) === 0) throw new TransitionError("INVALID", NEEDS_ASSIGNEE);
    const at = new Date();
    await tx.statusEvent.create({ data: { requestId, from, to, actorId: user.id, at } });
    // A linked Content Plan post follows the request; `post` is kept for notifying its author after commit.
    const post = await syncContentPostForRequest(tx, requestId, from, to, at);
    return { from, to, assigneeIds: req.assignees.map((a) => a.userId), requesterId: req.requesterId, title: req.title, post };
  });

  await bestEffort(async () => {
    const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    // Moving to First Look is the designer sending the design for review; it gets its own wording.
    const type = change.to === "FIRST_LOOK" ? "DESIGN_SENT" : "STATUS";
    const message = buildMessage(type, actor?.name ?? "Someone", change.title, { from: change.from, to: change.to });
    const userIds = [...new Set([change.requesterId, ...change.assigneeIds])].filter((id) => id !== user.id);
    await notifier({ actorId: user.id, userIds, requestId, type, message });
  });

  // The post's author hears that the request behind it was cancelled (the actor is excluded by the notice itself).
  const cancelled = change.post;
  if (cancelled?.cancelled) {
    await bestEffort(() => notifyContentWith(db, realMailer(), { kind: "cancelled", postId: cancelled.postId, actorId: user.id }));
  }
}
