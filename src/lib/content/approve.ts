import { Prisma } from "@prisma/client";
import { divisionOptions } from "../lists";
import type { ContentFormat, ContentSurface } from "@prisma/client";
import type { ScopedDb } from "../db";
import {
  CreateRequestError, DEFAULT_TYPE_NAME, insertRequestTx, jakartaDate, validateRequestInput, type CreateRequestInput,
} from "../createRequest";
import { MAX_OUTPUT_COUNT } from "../transition";
import { cloudinaryConfig } from "../media/config";
import { mediaUrl } from "../media/url";
import { CREATIVE_TEAM } from "../team";
import { canApproveContent, type ContentActor } from "./permissions";
import { nextStatus } from "./workflow";
import { ContentError } from "./errors";

const SURFACE_LABEL: Record<ContentSurface, string> = { FEED: "Feed", REEL: "Reel", STORY: "Story" };
const MAX_TITLE_LINE = 80;
const DEADLINE_LEAD_DAYS = 3;
const MAX_NOTES = 5000; // the request notes limit (see createRequest)
const CAPTION_HEADER = "\n\nCaption draft:\n";

export type ApproveDefaults = { title: string; deadline: string | null; outputCount: number; needsMotion: boolean; typeId: string | null };

/** Pre-filled values of the approve form (pure; the lead can change every one of them). */
export function approveDefaults(
  post: { surface: ContentSurface; format: ContentFormat; brief: string | null; plannedAt: Date | null; mockupImageCount: number; typeId: string | null },
  brandName: string,
  now: Date,
): ApproveDefaults {
  const firstLine = (post.brief ?? "").trim().split(/\r?\n/).map((l) => l.trim()).find((l) => l) ?? "";
  const line = firstLine.length > MAX_TITLE_LINE ? `${firstLine.slice(0, MAX_TITLE_LINE - 1)}…` : firstLine;
  const title = [brandName, SURFACE_LABEL[post.surface], line].filter(Boolean).join(" · ");

  let deadline: string | null = null;
  if (post.plannedAt) {
    const d = new Date(`${jakartaDate(post.plannedAt)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - DEADLINE_LEAD_DAYS);
    const minus = d.toISOString().slice(0, 10);
    const today = jakartaDate(now);
    deadline = minus < today ? today : minus;
  }
  return {
    title,
    deadline,
    outputCount: post.format === "CAROUSEL" ? Math.max(1, post.mockupImageCount) : 1,
    needsMotion: post.format === "VIDEO" || post.surface === "REEL",
    typeId: post.typeId,
  };
}

export type ApproveFormData = {
  postId: string;
  brandName: string;
  defaults: ApproveDefaults;
  divisionId: string | null;
  divisions: { id: string; name: string }[];
  types: { id: string; name: string; fieldSchema: unknown }[];
  team: { id: string; name: string }[];
};

export type ApproveInput = Omit<CreateRequestInput, "brandId" | "briefUrl" | "notes"> & { outputCount: number };

function assertApprover(user: ContentActor) {
  if (!canApproveContent(user)) throw new ContentError("FORBIDDEN", "Only a lead can approve a post.");
}

const STALE = "This post changed in the meantime. Reload and try again.";
const NOT_WAITING = "This post is no longer waiting for review.";

export async function loadApproveForm(db: ScopedDb, user: ContentActor, postId: string): Promise<ApproveFormData> {
  assertApprover(user);
  const post = await db.contentPost.findFirst({
    where: { id: postId },
    include: {
      channel: { include: { brand: { select: { name: true } } } },
      media: { where: { role: "MOCKUP" }, select: { media: { select: { type: true } } } },
    },
  });
  if (!post) throw new ContentError("NOT_FOUND", "Post not found.");
  if (!nextStatus(post.status, "approve") || post.requestId) throw new ContentError("CONFLICT", NOT_WAITING);

  const brandName = post.channel.brand.name;
  const defaults = approveDefaults(
    { ...post, mockupImageCount: post.media.filter((m) => m.media.type === "IMAGE").length },
    brandName,
    new Date(),
  );
  const [divisions, types, team, latest] = await Promise.all([
    divisionOptions(db),
    db.requestType.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, fieldSchema: true } }),
    db.user.findMany({ where: CREATIVE_TEAM, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.request.findFirst({ where: { requesterId: post.authorId }, orderBy: { requestedAt: "desc" }, select: { divisionId: true } }),
  ]);
  // No suggested type on the post, or one that is no longer active: preselect the workspace default.
  if (defaults.typeId && !types.some((t) => t.id === defaults.typeId)) defaults.typeId = null;
  if (!defaults.typeId) defaults.typeId = types.find((t) => t.name === DEFAULT_TYPE_NAME)?.id ?? null;
  return { postId, brandName, defaults, divisionId: latest?.divisionId ?? divisions[0]?.id ?? null, divisions, types, team };
}

/** Brief plus caption draft, clamped to the notes limit: the brief stays whole, the caption is cut with "…". */
function composeNotes(brief: string, caption: string): string {
  if (!caption) return brief;
  const head = brief ? brief + CAPTION_HEADER : CAPTION_HEADER.trimStart();
  const room = MAX_NOTES - head.length;
  if (caption.length <= room) return head + caption;
  return room < 2 ? brief : `${head}${caption.slice(0, room - 1)}…`;
}

/**
 * Approves a SUBMITTED post: one transaction creates the request (requester = the post's author) with the mock-ups as
 * attachments and marks the post APPROVED. The final compare-and-set update is the real guard against a double
 * approval; `requestId @unique` is the backstop.
 */
export async function approveContentPostWith(
  db: ScopedDb, user: ContentActor, postId: string, input: ApproveInput, now = new Date(),
): Promise<{ requestId: string }> {
  assertApprover(user);
  try {
    return await db.$transaction(async (tx) => {
      const post = await tx.contentPost.findFirst({
        where: { id: postId },
        include: {
          channel: { select: { brandId: true } },
          media: { where: { role: "MOCKUP" }, orderBy: { order: "asc" }, include: { media: true } },
        },
      });
      if (!post) throw new ContentError("NOT_FOUND", "Post not found.");
      if (!nextStatus(post.status, "approve") || post.requestId) throw new ContentError("CONFLICT", NOT_WAITING);

      const { outputCount } = input;
      if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > MAX_OUTPUT_COUNT) {
        const msg = `Enter a whole number from 1 to ${MAX_OUTPUT_COUNT}`;
        throw new CreateRequestError("VALIDATION", msg, { outputCount: msg });
      }
      const cfg = post.media.length ? cloudinaryConfig() : null;
      if (post.media.length && !cfg) throw new ContentError("INVALID", "Media storage is not configured");

      const brief = post.brief?.trim() ?? "";
      const caption = post.caption?.trim() ?? "";
      const notes = composeNotes(brief, caption);
      const v = await validateRequestInput(tx, { ...input, brandId: post.channel.brandId, notes: notes || undefined }, now, { keepBrandId: post.channel.brandId });
      const req = await insertRequestTx(tx, v, { requesterId: post.authorId, actorId: user.id, outputCount, now });

      if (cfg) {
        await tx.attachment.createMany({
          data: post.media.map((l, i) => ({
            requestId: req.id,
            uploaderId: post.authorId,
            name: `mockup-${i + 1}.${l.media.type === "VIDEO" ? "mp4" : "jpg"}`,
            url: mediaUrl(l.media, "full", cfg.cloudName),
            mimeType: l.media.type === "VIDEO" ? "video/mp4" : "image/jpeg",
            sizeBytes: l.media.bytes,
          })),
        });
      }

      const r = await tx.contentPost.updateMany({
        where: { id: postId, status: "SUBMITTED", requestId: null },
        data: { status: "APPROVED", requestId: req.id, cancelledRequestId: null, approvedById: user.id, approvedAt: now },
      });
      if (r.count !== 1) throw new ContentError("CONFLICT", STALE);
      return { requestId: req.id };
    });
  } catch (e) {
    // requestId @unique tripping means a concurrent approval won.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target).includes("requestId")) throw new ContentError("CONFLICT", STALE);
    throw e;
  }
}
