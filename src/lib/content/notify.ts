import type { PrismaClient } from "@prisma/client";
import { renderEmail, safeBaseUrl } from "../emailLayout";
import type { Mailer } from "../mailer";
import { cleanLine } from "../notify";
import { CONTENT_NOTIFICATION } from "../notificationLinks";

export { CONTENT_NOTIFICATION };

export type ContentNotice = {
  kind: "submitted" | "sentBack" | "approved" | "cancelled" | "comment";
  postId: string;
  actorId: string;
  /** Recipients for "comment" (the caller works out author, earlier commenters and mentions). */
  userIds?: string[];
  /** The feedback note for "sentBack". */
  note?: string;
};

const MAX_TITLE = 80;
const MAX_NOTE = 120;
/** Only the events that need the author to act are emailed; the rest stay in the bell. */
const EMAIL_HEADING = { sentBack: "Post sent back", approved: "Post approved" } as const;

type Db = Pick<PrismaClient, "user" | "contentPost" | "contentComment" | "notification">;

/** First non-empty line of the brief, cleaned and capped. */
function postTitle(brief: string | null): string {
  const line = (brief ?? "").trim().split(/\r?\n/).find((l) => l.trim()) ?? "";
  return cleanLine(line, MAX_TITLE) || "Untitled post";
}

function buildMessage(n: ContentNotice, actor: string, title: string): string {
  switch (n.kind) {
    case "submitted": return `${actor} submitted “${title}” for approval`;
    case "sentBack": return `${actor} sent back “${title}”: ${cleanLine(n.note ?? "", MAX_NOTE)}`;
    case "approved": return `${actor} approved “${title}” — request created`;
    case "cancelled": return `The request for “${title}” was cancelled; the post is back in draft`;
    case "comment": return `${actor} commented on “${title}”`;
  }
}

/** Who hears about a new comment: the post author, everyone who commented on it, and the mentioned users, minus the commenter. */
export async function commentRecipients(db: Db, postId: string, actorId: string, mentionedUserIds: string[]): Promise<string[]> {
  const [post, comments] = await Promise.all([
    db.contentPost.findFirst({ where: { id: postId }, select: { authorId: true } }),
    db.contentComment.findMany({ where: { postId }, select: { authorId: true }, distinct: ["authorId"] }),
  ]);
  const ids = new Set([...(post ? [post.authorId] : []), ...comments.map((c) => c.authorId), ...mentionedUserIds]);
  ids.delete(actorId);
  return [...ids];
}

/** Best-effort: never throws. Bell rows for the recipients of a Content Plan event, plus an email for "sentBack" and "approved". */
export async function notifyContentWith(db: Db, mailer: Mailer, n: ContentNotice, opts: { baseUrl?: string | undefined } = {}): Promise<void> {
  try {
    const [post, actor] = await Promise.all([
      db.contentPost.findFirst({ where: { id: n.postId }, select: { brief: true, authorId: true } }),
      db.user.findUnique({ where: { id: n.actorId }, select: { name: true } }),
    ]);
    if (!post) return;
    let ids: string[];
    if (n.kind === "submitted") {
      ids = (await db.user.findMany({ where: { active: true, appRole: { in: ["LEAD", "ADMIN"] } }, select: { id: true } })).map((u) => u.id);
    } else if (n.kind === "comment") {
      ids = n.userIds ?? [];
    } else {
      ids = [post.authorId];
    }
    ids = [...new Set(ids)].filter((id) => id !== n.actorId);
    if (ids.length === 0) return;
    const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, email: true } });

    const title = postTitle(post.brief);
    const message = cleanLine(buildMessage(n, cleanLine(actor?.name ?? "Someone", 80), title), 500);
    const heading = n.kind === "sentBack" || n.kind === "approved" ? EMAIL_HEADING[n.kind] : null;
    const base = safeBaseUrl("baseUrl" in opts ? opts.baseUrl : process.env.APP_BASE_URL);
    const mail = heading
      ? renderEmail(
          {
            preheader: message,
            heading,
            lines: [message],
            button: base ? { label: "Open post", url: `${base}/content?post=${encodeURIComponent(n.postId)}` } : undefined,
          },
          { baseUrl: base ?? undefined },
        )
      : null;

    await Promise.allSettled(
      users.map(async (u) => {
        try {
          const row = await db.notification.create({
            data: { userId: u.id, type: CONTENT_NOTIFICATION, contentPostId: n.postId, requestId: null, message },
          });
          if (!mail || !heading || !u.email) return;
          await mailer.send({ to: u.email, subject: `${heading}: ${title}`, ...mail });
          await db.notification.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
        } catch (e) {
          console.error("[notify] content notice failed for a recipient:", e instanceof Error ? e.message : "unknown error");
        }
      }),
    );
  } catch (e) {
    console.error("[notify] content notice failed:", e instanceof Error ? e.message : "unknown error");
  }
}
