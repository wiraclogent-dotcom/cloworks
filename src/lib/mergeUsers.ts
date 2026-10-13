import type { AppRole, JobRole, Prisma, PrismaClient, User } from "@prisma/client";
import { AdminError, assertAdmin, countSignInCapableAdmins, lockRoster, MAX_ALIAS_LEN, MAX_ALIASES, type Actor } from "./admin";
import { normalizeName } from "./import/aliases";

type Tx = Prisma.TransactionClient;

export type MergeCounts = Record<
  | "requested" | "assigned" | "statusEvents" | "deadlineEvents" | "comments" | "attachments" | "kpiTargets"
  | "notifications" | "chatReads" | "ownedProjects" | "projectTasks" | "libraryItems" | "invites"
  | "contentPosts" | "contentComments" | "media",
  number
>;

export type MergePreview = {
  from: { id: string; name: string; email: string | null; appRole: AppRole; jobRole: JobRole };
  into: { id: string; name: string; email: string | null; active: boolean; appRole: AppRole; jobRole: JobRole };
  counts: MergeCounts;
  movesLogin: boolean;
};

/**
 * One `updateMany` per foreign key to User, moving rows from the duplicate to the survivor. KpiTarget, ProjectKpiTarget
 * and ChatRead clashes (their `@@unique([userId, …])`) are resolved before these run. A new User relation must be added here:
 * a test compares this list with the Prisma DMMF.
 */
const REPOINT: Record<string, (tx: Tx, from: string, into: string) => Promise<unknown>> = {
  "Request.requesterId": (tx, from, into) => tx.request.updateMany({ where: { requesterId: from }, data: { requesterId: into } }),
  "Request.assigneeId": (tx, from, into) => tx.request.updateMany({ where: { assigneeId: from }, data: { assigneeId: into } }),
  "StatusEvent.actorId": (tx, from, into) => tx.statusEvent.updateMany({ where: { actorId: from }, data: { actorId: into } }),
  "DeadlineEvent.actorId": (tx, from, into) => tx.deadlineEvent.updateMany({ where: { actorId: from }, data: { actorId: into } }),
  "Comment.authorId": (tx, from, into) => tx.comment.updateMany({ where: { authorId: from }, data: { authorId: into } }),
  "Attachment.uploaderId": (tx, from, into) => tx.attachment.updateMany({ where: { uploaderId: from }, data: { uploaderId: into } }),
  "KpiTarget.userId": (tx, from, into) => tx.kpiTarget.updateMany({ where: { userId: from }, data: { userId: into } }),
  "Notification.userId": (tx, from, into) => tx.notification.updateMany({ where: { userId: from }, data: { userId: into } }),
  "ChatRead.userId": (tx, from, into) => tx.chatRead.updateMany({ where: { userId: from }, data: { userId: into } }),
  "Project.ownerId": (tx, from, into) => tx.project.updateMany({ where: { ownerId: from }, data: { ownerId: into } }),
  "ProjectTask.ownerId": (tx, from, into) => tx.projectTask.updateMany({ where: { ownerId: from }, data: { ownerId: into } }),
  "ProjectTaskEvent.actorId": (tx, from, into) => tx.projectTaskEvent.updateMany({ where: { actorId: from }, data: { actorId: into } }),
  "ProjectKpiTarget.userId": (tx, from, into) => tx.projectKpiTarget.updateMany({ where: { userId: from }, data: { userId: into } }),
  "ProjectKpiTarget.createdById": (tx, from, into) => tx.projectKpiTarget.updateMany({ where: { createdById: from }, data: { createdById: into } }),
  "LibraryItem.createdById": (tx, from, into) => tx.libraryItem.updateMany({ where: { createdById: from }, data: { createdById: into } }),
  "LibraryItem.updatedById": (tx, from, into) => tx.libraryItem.updateMany({ where: { updatedById: from }, data: { updatedById: into } }),
  "Invite.invitedById": (tx, from, into) => tx.invite.updateMany({ where: { invitedById: from }, data: { invitedById: into } }),
  "Invite.userId": (tx, from, into) => tx.invite.updateMany({ where: { userId: from }, data: { userId: into } }),
  "ContentPost.authorId": (tx, from, into) => tx.contentPost.updateMany({ where: { authorId: from }, data: { authorId: into } }),
  "ContentPost.approvedById": (tx, from, into) => tx.contentPost.updateMany({ where: { approvedById: from }, data: { approvedById: into } }),
  "ContentComment.authorId": (tx, from, into) => tx.contentComment.updateMany({ where: { authorId: from }, data: { authorId: into } }),
  "Media.uploadedById": (tx, from, into) => tx.media.updateMany({ where: { uploadedById: from }, data: { uploadedById: into } }),
};

/** "Model.field" for every foreign key to User that mergeUsers re-points. */
export const USER_FK_HANDLED: ReadonlyArray<string> = Object.freeze(Object.keys(REPOINT));

/**
 * Loads both people from the actor's workspace and runs every guard that can be decided before writing. Throws
 * `AdminError`; `movesLogin` says whether the duplicate's login will move to the survivor.
 */
async function loadAndGuard(tx: Tx, actor: Actor, fromId: string, intoId: string): Promise<{ from: User; into: User; movesLogin: boolean }> {
  assertAdmin(actor);
  if (fromId === intoId) throw new AdminError("VALIDATION", "Pick two different people to merge.");
  if (fromId === actor.id) throw new AdminError("VALIDATION", "You can't merge away your own account.");
  const from = await tx.user.findFirst({ where: { id: fromId, workspaceId: actor.workspaceId } });
  const into = await tx.user.findFirst({ where: { id: intoId, workspaceId: actor.workspaceId } });
  if (!from || !into) throw new AdminError("NOT_FOUND", "User not found");
  if (from.email && into.email) throw new AdminError("CONFLICT", "Both people have a login. Clear one login email first.");
  const movesLogin = into.email === null && from.email !== null;
  // Afterwards the duplicate is gone and the survivor keeps its role. Unless the survivor is an admin who gains the
  // login (and becomes active), the admins who can sign in are exactly today's minus the duplicate.
  if (!(movesLogin && into.appRole === "ADMIN") && (await countSignInCapableAdmins(tx, from.id)) === 0)
    throw new AdminError("LAST_ADMIN", "That would leave no active admin who can sign in");
  return { from, into, movesLogin };
}

async function countsFor(tx: Tx, id: string): Promise<MergeCounts> {
  return {
    requested: await tx.request.count({ where: { requesterId: id } }),
    assigned: await tx.request.count({ where: { assigneeId: id } }),
    statusEvents: await tx.statusEvent.count({ where: { actorId: id } }),
    deadlineEvents: await tx.deadlineEvent.count({ where: { actorId: id } }),
    comments: await tx.comment.count({ where: { authorId: id } }),
    attachments: await tx.attachment.count({ where: { uploaderId: id } }),
    kpiTargets: await tx.kpiTarget.count({ where: { userId: id } }),
    notifications: await tx.notification.count({ where: { userId: id } }),
    chatReads: await tx.chatRead.count({ where: { userId: id } }),
    ownedProjects: await tx.project.count({ where: { ownerId: id } }),
    projectTasks: await tx.projectTask.count({ where: { ownerId: id } }),
    libraryItems: await tx.libraryItem.count({ where: { OR: [{ createdById: id }, { updatedById: id }] } }),
    invites: await tx.invite.count({ where: { OR: [{ invitedById: id }, { userId: id }] } }),
    contentPosts: await tx.contentPost.count({ where: { OR: [{ authorId: id }, { approvedById: id }] } }),
    contentComments: await tx.contentComment.count({ where: { authorId: id } }),
    media: await tx.media.count({ where: { uploadedById: id } }),
  };
}

/** What merging `fromId` into `intoId` would move, for the confirmation summary. Same guards as mergeUsers; writes nothing. */
export async function mergePreview(db: PrismaClient, actor: Actor, fromId: string, intoId: string): Promise<MergePreview> {
  const { from, into, movesLogin } = await loadAndGuard(db, actor, fromId, intoId);
  return {
    from: { id: from.id, name: from.name, email: from.email, appRole: from.appRole, jobRole: from.jobRole },
    into: { id: into.id, name: into.name, email: into.email, active: into.active, appRole: into.appRole, jobRole: into.jobRole },
    counts: await countsFor(db, from.id),
    movesLogin,
  };
}

/**
 * Survivor's aliases plus the duplicate's name, fullName and aliases, de-duplicated by normalizeName. Drops any that
 * match the survivor's own names or a third person's name/fullName/alias (an alias must never make the merge fail),
 * any too long to be an alias, and anything past MAX_ALIASES.
 */
async function mergedAliases(tx: Tx, actor: Actor, from: User, into: User): Promise<string[]> {
  const others = await tx.user.findMany({
    where: { workspaceId: actor.workspaceId, id: { notIn: [from.id, into.id] } },
    select: { name: true, fullName: true, aliases: true },
  });
  const taken = new Set(others.flatMap((o) => [o.name, o.fullName, ...o.aliases]).map(normalizeName));
  const seen = new Set([into.name, into.fullName, ...into.aliases].map(normalizeName));
  const out = [...into.aliases];
  for (const raw of [from.name, from.fullName, ...from.aliases]) {
    const alias = raw.trim().replace(/\s+/g, " ");
    const key = normalizeName(alias);
    if (!key || alias.length > MAX_ALIAS_LEN || seen.has(key) || taken.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out.slice(0, MAX_ALIASES);
}

/**
 * Folds the duplicate `fromId` into `intoId` and deletes the duplicate, in one transaction under the roster lock.
 * The survivor keeps its own name, fullName, title, department and roles; it takes the duplicate's login when it
 * has none, and its avatar when it has none.
 */
export async function mergeUsers(db: PrismaClient, actor: Actor, fromId: string, intoId: string): Promise<{ intoId: string; intoName: string }> {
  return db.$transaction(async (tx) => {
    await lockRoster(tx);
    const { from, into, movesLogin } = await loadAndGuard(tx, actor, fromId, intoId);

    // KPI clash: the survivor's target for a month wins.
    const intoMonths = await tx.kpiTarget.findMany({ where: { userId: into.id }, select: { month: true } });
    await tx.kpiTarget.deleteMany({ where: { userId: from.id, month: { in: intoMonths.map((k) => k.month) } } });

    // Project KPI clash: an item both people hold stays on the survivor; the duplicate's copy is dropped.
    const intoItems = await tx.projectKpiTarget.findMany({ where: { userId: into.id }, select: { year: true, projectId: true, itemTitle: true } });
    if (intoItems.length > 0) await tx.projectKpiTarget.deleteMany({ where: { userId: from.id, OR: intoItems } });

    // ChatRead clash: the later lastReadAt wins, on the survivor's row.
    const fromReads = await tx.chatRead.findMany({ where: { userId: from.id } });
    const intoReads = await tx.chatRead.findMany({ where: { userId: into.id, requestId: { in: fromReads.map((r) => r.requestId) } } });
    for (const mine of intoReads) {
      const theirs = fromReads.find((r) => r.requestId === mine.requestId)!;
      if (theirs.lastReadAt > mine.lastReadAt) await tx.chatRead.update({ where: { id: mine.id }, data: { lastReadAt: theirs.lastReadAt } });
      await tx.chatRead.delete({ where: { id: theirs.id } });
    }

    for (const repoint of Object.values(REPOINT)) await repoint(tx, from.id, into.id);

    // Comment.mentions holds user ids without a foreign key: swap the duplicate for the survivor, keeping the first
    // occurrence's position so a comment that mentioned both lists the survivor once.
    await tx.$executeRaw`
      UPDATE "Comment" SET mentions = ARRAY(
        SELECT m FROM unnest(array_replace(mentions, ${from.id}, ${into.id})) WITH ORDINALITY AS t(m, i)
        GROUP BY m ORDER BY min(i))
      WHERE "workspaceId" = ${actor.workspaceId} AND ${from.id} = ANY(mentions)`;

    const aliases = await mergedAliases(tx, actor, from, into);

    // Delete first: the survivor may take the duplicate's (unique) email.
    await tx.user.delete({ where: { id: from.id } });
    const data: Prisma.UserUpdateInput = { aliases };
    if (movesLogin) {
      Object.assign(data, {
        email: from.email,
        passwordHash: from.passwordHash,
        mustChangePassword: from.mustChangePassword,
        active: true,
        passwordVersion: { increment: 1 },
        failedLogins: 0,
        lockedUntil: null,
      } satisfies Prisma.UserUpdateInput);
    }
    if (into.avatar === null && from.avatar !== null)
      Object.assign(data, { avatar: from.avatar, avatarType: from.avatarType, avatarUpdatedAt: from.avatarUpdatedAt } satisfies Prisma.UserUpdateInput);
    await tx.user.update({ where: { id: into.id }, data });

    if ((await countSignInCapableAdmins(tx)) === 0)
      throw new AdminError("LAST_ADMIN", "That would leave no active admin who can sign in");
    return { intoId: into.id, intoName: into.name };
  });
}
