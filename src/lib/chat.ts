import { Prisma, type PrismaClient, type RequestStatus } from "@prisma/client";
import type { CollabFail } from "@/lib/collab";

type Db = Pick<PrismaClient, "request" | "chatRead" | "comment" | "$queryRaw">;

export const PREVIEW_LEN = 120;
export const CHAT_PAGE = 20;
export const MESSAGE_PAGE = 30;
/**
 * How far before the `after` cursor a poll looks again. A comment can commit after a later one was already polled
 * (its `createdAt` is set before the commit), so the overlap re-reads that window; the client de-dups by id.
 */
export const AFTER_OVERLAP_MS = 30_000;

export type ChatMessage = { id: string; body: string; createdAt: Date; author: { id: string; name: string } };
export type ChatSummary = {
  requestId: string;
  title: string;
  status: RequestStatus;
  lastMessage: { body: string; authorId: string; authorName: string; createdAt: Date };
  unread: number;
};

/** Requests whose chat `userId` belongs to: requester, assignee, any comment author, or anyone mentioned in a comment. */
export function participantWhere(userId: string): Prisma.RequestWhereInput {
  return {
    OR: [
      { requesterId: userId },
      { assigneeId: userId },
      { comments: { some: { authorId: userId } } },
      { comments: { some: { mentions: { has: userId } } } },
    ],
  };
}

/** "missing" means no such request in the caller's workspace; "no" means it exists but the user is not in its chat. */
export async function isParticipantWith(db: Db, userId: string, requestId: string): Promise<"yes" | "no" | "missing"> {
  // The common case (a participant) costs one query; only a miss checks whether the request exists.
  const hit = await db.request.findFirst({ where: { AND: [{ id: requestId }, participantWhere(userId)] }, select: { id: true } });
  if (hit) return "yes";
  const row = await db.request.findFirst({ where: { id: requestId }, select: { id: true } });
  return row ? "no" : "missing";
}

/** Moves the user's read position forward to `at`, never back. Non-participants get no row. */
export async function markChatReadWith(db: Db, userId: string, requestId: string, at: Date = new Date()): Promise<void> {
  if ((await isParticipantWith(db, userId, requestId)) !== "yes") return;
  const { count } = await db.chatRead.updateMany({ where: { userId, requestId, lastReadAt: { lt: at } }, data: { lastReadAt: at } });
  if (count > 0) return;
  if (await db.chatRead.findFirst({ where: { userId, requestId }, select: { id: true } })) return;
  try {
    await db.chatRead.create({ data: { userId, requestId, lastReadAt: at } });
  } catch (e) {
    // A concurrent create won the race; that row is as good as ours.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

/**
 * FROM/WHERE for messages from others, in chats I belong to, newer than my read position. Without a ChatRead row the
 * read position is the workspace's `chatSince` ("start fresh": comments from before chat launched count as read).
 * Raw SQL is not workspace-scoped, so the workspace is filtered explicitly on both tables.
 * Aliases: `c` comment, `r` request, `w` workspace.
 */
function unreadFrom(me: { id: string; workspaceId: string }): Prisma.Sql {
  return Prisma.sql`
    FROM "Comment" c
    JOIN "Request" r ON r.id = c."requestId"
    JOIN "Workspace" w ON w.id = ${me.workspaceId}
    LEFT JOIN "ChatRead" cr ON cr."requestId" = c."requestId" AND cr."userId" = ${me.id}
    WHERE c."workspaceId" = ${me.workspaceId} AND r."workspaceId" = ${me.workspaceId}
      AND c."authorId" <> ${me.id}
      AND c."createdAt" > COALESCE(cr."lastReadAt", w."chatSince")
      AND (r."requesterId" = ${me.id} OR r."assigneeId" = ${me.id}
           OR EXISTS (SELECT 1 FROM "Comment" c2 WHERE c2."requestId" = r.id
                      AND (c2."authorId" = ${me.id} OR ${me.id} = ANY(c2.mentions))))`;
}

/** How many unread messages I have across my chats. */
export async function chatUnreadCountWith(db: Db, me: { id: string; workspaceId: string }): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n ${unreadFrom(me)}`;
  return rows[0]?.n ?? 0;
}

/** The request of my newest unread message (one query), or null when everything is read. */
export async function latestUnreadChatWith(db: Db, me: { id: string; workspaceId: string }): Promise<{ requestId: string; title: string } | null> {
  const rows = await db.$queryRaw<{ requestId: string; title: string }[]>`
    SELECT r.id AS "requestId", r.title ${unreadFrom(me)}
    ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1`;
  return rows[0] ? { requestId: rows[0].requestId, title: rows[0].title } : null;
}

/** The workspace's chat launch moment (one primary-key lookup; `Workspace` is not a scoped model, hence raw SQL). */
async function chatSinceWith(db: Db, workspaceId: string): Promise<Date> {
  const rows = await db.$queryRaw<{ chatSince: Date }[]>`SELECT "chatSince" FROM "Workspace" WHERE id = ${workspaceId}`;
  return rows[0]?.chatSince ?? new Date(0);
}

/** The user's chats, most recently active first. Six small queries, all bounded by the page size. */
export async function listChatsWith(
  db: Db,
  me: { id: string; workspaceId: string },
  opts: { limit?: number; offset?: number } = {},
): Promise<ChatSummary[]> {
  const userId = me.id;
  const groups = await db.comment.groupBy({
    by: ["requestId"],
    where: { request: participantWhere(userId) },
    _max: { createdAt: true },
    orderBy: [{ _max: { createdAt: "desc" } }, { requestId: "asc" }],
    take: opts.limit ?? CHAT_PAGE,
    skip: opts.offset ?? 0,
  });
  if (groups.length === 0) return [];
  const ids = groups.map((g) => g.requestId);

  const [requests, lastRows, reads, since] = await Promise.all([
    db.request.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, status: true } }),
    db.comment.findMany({
      where: { OR: groups.map((g) => ({ requestId: g.requestId, createdAt: g._max.createdAt! })) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { author: { select: { id: true, name: true } } },
    }),
    db.chatRead.findMany({ where: { userId, requestId: { in: ids } }, select: { requestId: true, lastReadAt: true } }),
    chatSinceWith(db, me.workspaceId),
  ]);
  const readAt = new Map(reads.map((r) => [r.requestId, r.lastReadAt]));
  const unreadRows = await db.comment.groupBy({
    by: ["requestId"],
    where: {
      authorId: { not: userId },
      OR: ids.map((id) => ({ requestId: id, createdAt: { gt: readAt.get(id) ?? since } })),
    },
    _count: { _all: true },
  });
  const unread = new Map(unreadRows.map((r) => [r.requestId, r._count._all]));
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const last = new Map<string, (typeof lastRows)[number]>();
  for (const c of lastRows) if (!last.has(c.requestId)) last.set(c.requestId, c);

  const out: ChatSummary[] = [];
  for (const id of ids) {
    const r = reqById.get(id);
    const c = last.get(id);
    if (!r || !c) continue;
    out.push({
      requestId: id,
      title: r.title,
      status: r.status,
      lastMessage: { body: c.body.slice(0, PREVIEW_LEN), authorId: c.authorId, authorName: c.author.name, createdAt: c.createdAt },
      unread: unread.get(id) ?? 0,
    });
  }
  return out;
}

/**
 * Messages of one chat, ascending. Default: the newest page. `before`: the page older than that time.
 * `after`: everything newer than `after.at - AFTER_OVERLAP_MS` (capped at 100), so a comment that committed late with an
 * earlier timestamp is still picked up; rows the client already has come back too and are de-duplicated by id there.
 * `hasOlder` is always false in this mode (the client keeps its own value).
 * The `before` cursor is a compound `(createdAt, id)` position so comments sharing a timestamp are never dropped or repeated.
 */
export async function listMessagesWith(
  db: Db,
  userId: string,
  requestId: string,
  opts: { after?: { at: Date; id: string }; before?: { at: Date; id: string }; limit?: number } = {},
): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | CollabFail> {
  const part = await isParticipantWith(db, userId, requestId);
  if (part === "missing") return { ok: false, code: "NOT_FOUND", message: "Request not found." };
  if (part === "no") return { ok: false, code: "FORBIDDEN", message: "You are not part of this chat." };

  const select = { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } } as const;
  if (opts.after) {
    const rows = await db.comment.findMany({
      where: { requestId, createdAt: { gt: new Date(opts.after.at.getTime() - AFTER_OVERLAP_MS) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select,
    });
    return { ok: true, messages: rows, hasOlder: false };
  }
  const limit = opts.limit ?? MESSAGE_PAGE;
  const rows = await db.comment.findMany({
    where: {
      requestId,
      ...(opts.before ? { OR: [{ createdAt: { lt: opts.before.at } }, { createdAt: opts.before.at, id: { lt: opts.before.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select,
  });
  const hasOlder = rows.length > limit;
  return { ok: true, messages: rows.slice(0, limit).reverse(), hasOlder };
}
