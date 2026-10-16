import { Prisma } from "@prisma/client";
import type { ScopedDb } from "../db";
import { canManageChannels, type ContentActor } from "./permissions";
import { needsRenumber, positionBetween, renumber } from "./order";
import { ContentError } from "./errors";

export type ChannelInput = { brandId: string; handle: string; displayName: string; bio?: string; avatarMediaId?: string | null };

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

function assertManager(user: ContentActor) {
  if (!canManageChannels(user)) throw new ContentError("FORBIDDEN", "You are not allowed to manage channels.");
}

/** Trim, strip a leading "@", lowercase. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

const handleTaken = () => new ContentError("INVALID", "That handle is already used.", { handle: "That handle is already used" });

/** The handle's unique index catches a duplicate that slipped past the pre-check (two saves at once). */
async function guardHandle<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target).includes("handle")) throw handleTaken();
    throw e;
  }
}

/** Validates the input and checks that the brand and avatar belong to this workspace (the scoped db confines the lookups). */
async function resolve(db: ScopedDb, input: ChannelInput, selfId?: string) {
  const fieldErrors: Record<string, string> = {};
  const handle = normalizeHandle(input.handle);
  if (!HANDLE_RE.test(handle)) fieldErrors.handle = "Use 1 to 30 letters, numbers, dots or underscores";
  const displayName = input.displayName.trim();
  if (!displayName) fieldErrors.displayName = "Name is required";
  else if (displayName.length > 60) fieldErrors.displayName = "Name must be at most 60 characters";
  const bio = input.bio?.trim() || null;
  if (bio && bio.length > 150) fieldErrors.bio = "Bio must be at most 150 characters";
  if (Object.keys(fieldErrors).length) throw new ContentError("INVALID", Object.values(fieldErrors)[0], fieldErrors);

  if (!(await db.brand.findFirst({ where: { id: input.brandId }, select: { id: true } }))) throw new ContentError("NOT_FOUND", "Brand not found.");
  if (input.avatarMediaId && !(await db.media.findFirst({ where: { id: input.avatarMediaId }, select: { id: true } }))) {
    throw new ContentError("NOT_FOUND", "Avatar image not found.");
  }
  const dup = await db.socialChannel.findFirst({
    where: { platform: "INSTAGRAM", handle, ...(selfId ? { id: { not: selfId } } : {}) }, select: { id: true },
  });
  if (dup) throw handleTaken();
  return { brandId: input.brandId, handle, displayName, bio, avatarMediaId: input.avatarMediaId ?? null };
}

export async function createChannelWith(db: ScopedDb, user: ContentActor, input: ChannelInput): Promise<{ id: string }> {
  assertManager(user);
  const data = await resolve(db, input);
  // New channels join the end of the list (top of the list has the highest position).
  const last = await db.socialChannel.findFirst({ orderBy: { position: "asc" }, select: { position: true } });
  const position = positionBetween(last?.position ?? null, null);
  const created = await guardHandle(db.socialChannel.create({ data: { ...data, platform: "INSTAGRAM", position }, select: { id: true } }));
  return { id: created.id };
}

export async function updateChannelWith(db: ScopedDb, user: ContentActor, id: string, input: ChannelInput): Promise<void> {
  assertManager(user);
  if (!(await db.socialChannel.findFirst({ where: { id }, select: { id: true } }))) throw new ContentError("NOT_FOUND", "Channel not found.");
  const data = await resolve(db, input, id);
  await guardHandle(db.socialChannel.update({ where: { id }, data }));
}

/** Drops the channel between two neighbours (either may be null at the ends of the list). */
export async function moveChannelWith(db: ScopedDb, user: ContentActor, id: string, aboveId: string | null, belowId: string | null): Promise<void> {
  assertManager(user);
  const all = await db.socialChannel.findMany({ orderBy: { position: "desc" }, select: { id: true, position: true } });
  if (!all.some((c) => c.id === id)) throw new ContentError("NOT_FOUND", "Channel not found.");
  const pos = (nid: string | null) => {
    if (nid === null) return null;
    const c = all.find((x) => x.id === nid);
    if (!c || nid === id) throw new ContentError("NOT_FOUND", "Channel not found.");
    return c.position;
  };
  const above = pos(aboveId);
  const below = pos(belowId);
  if (needsRenumber(above, below)) {
    const ids = all.map((c) => c.id).filter((x) => x !== id);
    ids.splice(aboveId ? ids.indexOf(aboveId) + 1 : 0, 0, id);
    for (const r of renumber(ids)) await db.socialChannel.update({ where: { id: r.id }, data: { position: r.position } });
    return;
  }
  await db.socialChannel.update({ where: { id }, data: { position: positionBetween(above, below) } });
}

export async function deleteChannelWith(db: ScopedDb, user: ContentActor, id: string): Promise<void> {
  assertManager(user);
  if (!(await db.socialChannel.findFirst({ where: { id }, select: { id: true } }))) throw new ContentError("NOT_FOUND", "Channel not found.");
  const locked = await db.contentPost.count({ where: { channelId: id, status: { in: ["APPROVED", "IN_PRODUCTION", "DONE"] } } });
  if (locked) throw new ContentError("INVALID", "This channel has approved posts and cannot be deleted.");
  await db.socialChannel.delete({ where: { id } });
}
