import { Prisma, type PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "request" | "chatRead" | "$queryRaw">;

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
  const row = await db.request.findFirst({ where: { id: requestId }, select: { id: true } });
  if (!row) return "missing";
  const hit = await db.request.findFirst({ where: { AND: [{ id: requestId }, participantWhere(userId)] }, select: { id: true } });
  return hit ? "yes" : "no";
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
 * Messages from others, in chats I belong to, newer than my read position. Raw SQL is not workspace-scoped,
 * so the workspace is filtered explicitly.
 */
export async function chatUnreadCountWith(db: Db, me: { id: string; workspaceId: string }): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Comment" c
    JOIN "Request" r ON r.id = c."requestId"
    LEFT JOIN "ChatRead" cr ON cr."requestId" = c."requestId" AND cr."userId" = ${me.id}
    WHERE c."workspaceId" = ${me.workspaceId} AND r."workspaceId" = ${me.workspaceId}
      AND c."authorId" <> ${me.id}
      AND (cr."lastReadAt" IS NULL OR c."createdAt" > cr."lastReadAt")
      AND (r."requesterId" = ${me.id} OR r."assigneeId" = ${me.id}
           OR EXISTS (SELECT 1 FROM "Comment" c2 WHERE c2."requestId" = r.id
                      AND (c2."authorId" = ${me.id} OR ${me.id} = ANY(c2.mentions))))`;
  return rows[0]?.n ?? 0;
}
