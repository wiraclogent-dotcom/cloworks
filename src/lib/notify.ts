import { after } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { STATUS_LABEL } from "./statusLabels";
import { createMailerFromEnv, type Mailer } from "./mailer";
import { renderEmail, safeBaseUrl } from "./emailLayout";

export type { Mailer } from "./mailer";
export { safeBaseUrl } from "./emailLayout";
export type NotificationType = "ASSIGNED" | "COMMENT" | "MENTION" | "STATUS" | "DEADLINE" | "DESIGN_SENT" | "ATTACHMENT";
/** `email: false` stores the in-app row only (default: email it too when the type is in EMAILED_TYPES and a mailer is configured). */
export type NotifyInput = { actorId: string; userIds: string[]; requestId: string; type: NotificationType; message: string; email?: boolean };
export type Notifier = (input: NotifyInput) => Promise<void>;


/**
 * Types that are also emailed: the ones that need someone to act. Everything else only lands in the bell, so routine
 * traffic cannot use up the provider's daily cap that password resets and invites share.
 */
const EMAILED_TYPES: ReadonlySet<NotificationType> = new Set(["ASSIGNED", "MENTION", "DESIGN_SENT"]);

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

/** Email headings for the emailed types; anything else falls back to its subject label. */
const HEADINGS: Partial<Record<NotificationType, string>> = {
  ASSIGNED: "Assigned to you",
  MENTION: "You were mentioned",
  DESIGN_SENT: "Design ready for review",
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

/** Best-effort: never throws. Stores a notification row for every recipient (the in-app bell) and emails those with an address when email is configured and the type is in EMAILED_TYPES, unless `email: false`. */
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
    const mail = renderEmail(
      {
        preheader: message,
        heading: HEADINGS[input.type] ?? SUBJECTS[input.type],
        lines: [message],
        button: base ? { label: "Open request", url: `${base}/requests/${encodeURIComponent(input.requestId)}` } : undefined,
      },
      { baseUrl: base ?? undefined },
    );
    const work = Promise.allSettled(
      users.map(async (u) => {
        try {
          const n = await db.notification.create({ data: { userId: u.id, requestId: input.requestId, type: input.type, message } });
          if (!u.email || input.email === false || !EMAILED_TYPES.has(input.type)) return;
          await mailer.send({ to: u.email, subject, ...mail });
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
export const realMailer = () => (mailer ??= createMailerFromEnv());

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
