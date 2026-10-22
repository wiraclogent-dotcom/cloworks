import type { Prisma, RequestStatus } from "@prisma/client";
import { isEditable, nextStatus, type ContentEvent } from "./workflow";

// What a request moving from -> to means for its linked post; null = no effect (REQUESTED, FIRST_LOOK).
function eventFor(from: RequestStatus, to: RequestStatus): ContentEvent | null {
  if (to === "ON_PROGRESS") return from === "DONE" ? "requestReopened" : "requestStarted";
  if (to === "DONE") return "requestDone";
  if (to === "CANCELLED") return "requestCancelled";
  return null;
}

/**
 * Keeps the post linked to a request in step with the request's status. Runs inside the transition's transaction.
 * A move the post's workflow does not allow (e.g. already IN_PRODUCTION) leaves it unchanged; this never throws for that.
 * Returns the affected post, or null when nothing changed.
 */
export async function syncContentPostForRequest(
  tx: Prisma.TransactionClient, requestId: string, from: RequestStatus, to: RequestStatus, now: Date,
): Promise<{ postId: string; authorId: string; cancelled: boolean } | null> {
  if (from === "CANCELLED" && to === "REQUESTED") return relinkRestored(tx, requestId);
  const ev = eventFor(from, to);
  if (!ev) return null;
  const post = await tx.contentPost.findFirst({ where: { requestId }, select: { id: true, status: true, authorId: true } });
  if (!post) return null;
  const status = nextStatus(post.status, ev);
  if (!status) return null;

  const cancelled = ev === "requestCancelled";
  const data: Prisma.ContentPostUncheckedUpdateManyInput = { status };
  if (ev === "requestDone") data.doneAt = now;
  if (ev === "requestReopened") data.doneAt = null;
  if (cancelled) Object.assign(data, { requestId: null, cancelledRequestId: requestId, approvedById: null, approvedAt: null, doneAt: null });
  // Pin the status we validated against so a concurrent change to the post is not overwritten.
  const res = await tx.contentPost.updateMany({ where: { id: post.id, status: post.status }, data });
  return res.count === 1 ? { postId: post.id, authorId: post.authorId, cancelled } : null;
}

/**
 * A cancelled request was restored: relink the post the cancel unlinked, unless it has moved on since (resubmitted,
 * or approved into a new request, which clears `cancelledRequestId`).
 */
async function relinkRestored(tx: Prisma.TransactionClient, requestId: string) {
  const post = await tx.contentPost.findFirst({ where: { cancelledRequestId: requestId }, select: { id: true, status: true, authorId: true, requestId: true } });
  if (!post || post.requestId || !isEditable(post.status)) return null;
  const res = await tx.contentPost.updateMany({
    where: { id: post.id, status: post.status, requestId: null },
    // Cancel cleared approvedAt; stamp it again so the post counts in the social media KPI (no approver: a restore is not one).
    data: { status: "APPROVED", requestId, cancelledRequestId: null, approvedAt: new Date() },
  });
  return res.count === 1 ? { postId: post.id, authorId: post.authorId, cancelled: false } : null;
}
