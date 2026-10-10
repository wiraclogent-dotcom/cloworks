import { after } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { STATUS_LABEL } from "./statusLabels";
import { createMailerFromEnv, type Mailer } from "./mailer";

export type { Mailer } from "./mailer";
export type NotificationType = "ASSIGNED" | "COMMENT" | "MENTION" | "STATUS" | "DEADLINE" | "DESIGN_SENT" | "ATTACHMENT";
/** `email: false` stores the in-app row only (default: email it too when a mailer is configured). */
export type NotifyInput = { actorId: string; userIds: string[]; requestId: string; type: NotificationType; message: string; email?: boolean };
export type Notifier = (input: NotifyInput) => Promise<void>;


/** Overall cap on one notifyWith call so a hung mail provider cannot freeze the user action. */
export const NOTIFY_DEADLINE_MS = 5000;

const SUBJECTS: Record<NotificationType, string> = {
  ASSIGNED: "Assigned to you",
  COMMENT: "New comment",
  MENTION: "You were mentioned",
  STATUS: "Status changed",
  DEADLINE: "Deadline changed",
  DESIGN_SENT: "Design sent for review",
  ATTACHMENT: "New design link",
};

/** Strips control characters (incl. CR/LF), collapses whitespace, caps length. */
export function cleanLine(s: string, max: number): string {
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function buildMessage(
  type: NotificationType,
  actorName: string,
  title: string,
  change?: { from: string; to: string },
  extra?: { name?: string },
): string {
  const a = cleanLine(actorName, 80);
  const t = cleanLine(title, 120);
  switch (type) {
    case "ASSIGNED": return `${a} assigned you to “${t}”`;
    case "COMMENT": return `${a} commented on “${t}”`;
    case "MENTION": return `${a} mentioned you in “${t}”`;
    case "DESIGN_SENT": return `${a} sent the design for “${t}” for review`;
    case "ATTACHMENT": return `${a} added a design link “${cleanLine(extra?.name ?? "", 80)}” to “${t}”`;
    case "DEADLINE": return change?.from
      ? `${a} moved the deadline of “${t}” from ${cleanLine(change.from, 40)} to ${cleanLine(change.to, 40)}`
      : `${a} set the deadline of “${t}” to ${cleanLine(change?.to ?? "", 40)}`;
    case "STATUS": return `${a} moved “${t}” from ${(STATUS_LABEL as Record<string, string>)[change?.from ?? ""] ?? change?.from} to ${(STATUS_LABEL as Record<string, string>)[change?.to ?? ""] ?? change?.to}`;
  }
}

function safeBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Best-effort: never throws. Stores a notification row for every recipient (the in-app bell) and emails those with an address when email is configured, unless `email: false`. */
export async function notifyWith(
  db: PrismaClient,
  mailer: Mailer,
  input: NotifyInput,
  opts: { baseUrl?: string | undefined; deadlineMs?: number } = {},
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ids = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
    if (ids.length === 0) return;
    const [users, req] = await Promise.all([
      db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, email: true } }),
      db.request.findUnique({ where: { id: input.requestId }, select: { title: true } }),
    ]);
    const base = safeBaseUrl("baseUrl" in opts ? opts.baseUrl : process.env.APP_BASE_URL);
    const subject = `${SUBJECTS[input.type]}: ${cleanLine(req?.title ?? "", 120)}`.replace(/: $/, "");
    const message = cleanLine(input.message, 500);
    const text = base ? `${message}\n\n${base}/requests/${encodeURIComponent(input.requestId)}\n` : `${message}\n`;
    const work = Promise.allSettled(
      users.map(async (u) => {
        try {
          const n = await db.notification.create({ data: { userId: u.id, requestId: input.requestId, type: input.type, message } });
          if (!u.email || input.email === false) return;
          await mailer.send({ to: u.email, subject, text });
          await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
        } catch (e) {
          console.error("[notify] failed for a recipient:", e instanceof Error ? e.message : "unknown error");
        }
      }),
    );
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), opts.deadlineMs ?? NOTIFY_DEADLINE_MS);
    });
    if ((await Promise.race([work, deadline])) === "timeout") console.error("[notify] deadline reached; abandoning unfinished sends");
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : "unknown error");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let mailer: Mailer | undefined;
const realMailer = () => (mailer ??= createMailerFromEnv());

/**
 * Default notifier for a given db handle, using the env-configured mailer. Inside a request it runs after the
 * response (`after()`), so a status change or comment never waits on the bell rows or the email send; outside a
 * request (scripts, tests) `after()` throws and it runs inline instead.
 */
export function notifierFor(db: PrismaClient): Notifier {
  return async (input) => {
    const run = () => notifyWith(db, realMailer(), input);
    try {
      after(run);
    } catch {
      await run();
    }
  };
}

/** Runs a post-commit notification step; any failure is logged and swallowed. */
export async function bestEffort(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error("[notify] skipped:", e instanceof Error ? e.message : "unknown error");
  }
}
