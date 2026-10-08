import type { PrismaClient, RequestStatus } from "@prisma/client";
import type { SessionUser } from "./session-core";
import { can } from "./permissions";
import { isRealDate, jakartaDate } from "./createRequest";
import { MONTHS } from "./timeline";
import { bestEffort, buildMessage, notifierFor, type Notifier } from "./notify";

export type RescheduleResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CLOSED" | "INVALID_DATE" | "ERROR"; message: string };

const OPEN: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"];

export function isOpenStatus(s: RequestStatus): boolean {
  return OPEN.includes(s);
}

class Fail extends Error {
  constructor(public code: Exclude<Extract<RescheduleResult, { ok: false }>["code"], "UNAUTHENTICATED" | "ERROR">, message: string) {
    super(message);
  }
}

const closedMessage = (s: RequestStatus) => `This request is already ${s === "DONE" ? "done" : "cancelled"}.`;

/** "2026-10-14" -> "14 Oct" (from a stored Date, in Jakarta time). */
function shortLabel(d: Date | null): string {
  if (!d) return "";
  const day = jakartaDate(d);
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** Moves an open request's deadline to a Jakarta day (YYYY-MM-DD), recording history and notifying after commit. */
export async function rescheduleRequestWith(
  getUser: () => Promise<SessionUser>,
  db: PrismaClient,
  requestId: string,
  day: string,
  notifier: Notifier = notifierFor(db),
): Promise<RescheduleResult> {
  try {
    const user = await getUser();
    if (!can(user.appRole, "request.transition")) return { ok: false, code: "FORBIDDEN", message: "Forbidden: not allowed to change the deadline" };

    const change = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({
        where: { id: requestId },
        select: { status: true, deadline: true, originalDeadline: true, requestedAt: true, assigneeId: true, requesterId: true, title: true },
      });
      if (!req) throw new Fail("NOT_FOUND", "Request not found");
      if (!isOpenStatus(req.status)) throw new Fail("CLOSED", closedMessage(req.status));
      if (!isRealDate(day)) throw new Fail("INVALID_DATE", "Pick a real date.");
      if (day < jakartaDate(req.requestedAt)) throw new Fail("INVALID_DATE", "The deadline cannot be before the request date.");
      if (req.deadline && jakartaDate(req.deadline) === day) return null;

      const to = new Date(`${day}T00:00:00+07:00`);
      const data: { deadline: Date; originalDeadline?: Date } = { deadline: to };
      if (req.originalDeadline === null && req.deadline !== null) data.originalDeadline = req.deadline;
      // Compare-and-set on open status: a concurrent close makes this match 0 rows.
      const res = await tx.request.updateMany({ where: { id: requestId, status: { in: OPEN } }, data });
      if (res.count !== 1) {
        const now = await tx.request.findUnique({ where: { id: requestId }, select: { status: true } });
        if (!now) throw new Fail("NOT_FOUND", "Request not found");
        throw new Fail("CLOSED", closedMessage(now.status));
      }
      await tx.deadlineEvent.create({ data: { requestId, from: req.deadline, to, actorId: user.id, at: new Date() } });
      return { from: req.deadline, to, assigneeId: req.assigneeId, requesterId: req.requesterId, title: req.title };
    });

    if (change) {
      await bestEffort(async () => {
        const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
        const message = buildMessage("DEADLINE", actor?.name ?? "Someone", change.title, { from: shortLabel(change.from), to: shortLabel(change.to) });
        const userIds = [...new Set([change.requesterId, change.assigneeId])].filter((id): id is string => !!id && id !== user.id);
        await notifier({ actorId: user.id, userIds, requestId, type: "DEADLINE", message });
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, code: e.code, message: e.message };
    if (e instanceof Error && e.message === "Unauthenticated") return { ok: false, code: "UNAUTHENTICATED", message: "Your session has expired. Sign in again." };
    console.error("rescheduleRequest failed", e);
    return { ok: false, code: "ERROR", message: "Something went wrong. Please try again." };
  }
}
