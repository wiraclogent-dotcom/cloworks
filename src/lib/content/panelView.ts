import type { ContentFormat, ContentKind, ContentStatus, ContentSurface, MediaType, RequestStatus } from "@prisma/client";
import type { ScopedDb } from "../db";
import { jakartaDate } from "../createRequest";
import { cloudinaryConfig } from "../media/config";
import { mediaUrl } from "../media/url";
import { canApproveContent, canDraftContent, type ContentActor } from "./permissions";
import { canDelete, isEditable } from "./workflow";
import { outOfOrder, suggestDate } from "./order";

/** One media thumbnail in the panel: images at the panel preset, videos as their first-frame poster. */
export type PanelMedia = { mediaId: string; type: MediaType; url: string | null; order: number };

export type PanelComment = { id: string; authorName: string; body: string; isFeedback: boolean; createdAt: string };

/** Everything the post side panel shows. Days are Jakarta YYYY-MM-DD; instants are ISO strings. */
export type PostPanelView = {
  post: {
    id: string; channelId: string; status: ContentStatus; kind: ContentKind; surface: ContentSurface; format: ContentFormat;
    plannedAt: string | null; publishedAt: string | null; brief: string; caption: string; typeId: string | null;
    author: { id: string; name: string }; submittedAt: string | null;
    request: { id: string; status: RequestStatus } | null;
  };
  mockups: PanelMedia[];
  finals: PanelMedia[];
  comments: PanelComment[];
  types: { id: string; name: string }[];
  can: { edit: boolean; submit: boolean; approve: boolean; comment: boolean; delete: boolean; addFinal: boolean };
  /** The date that would put this tile back in order when it is out of order, else null. */
  warnDate: string | null;
  mediaReady: boolean;
};

/** The open post for the side panel, or null when it is not visible in this workspace. */
export async function loadPostPanel(
  db: ScopedDb, user: ContentActor, postId: string,
  cloudName: string | null = cloudinaryConfig()?.cloudName ?? null,
): Promise<PostPanelView | null> {
  const post = await db.contentPost.findFirst({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true } },
      request: { select: { id: true, status: true, assignees: { where: { userId: user.id }, select: { userId: true } } } },
      media: { orderBy: { order: "asc" }, select: { role: true, order: true, media: { select: { id: true, publicId: true, type: true } } } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, isFeedback: true, createdAt: true, author: { select: { name: true } } } },
    },
  });
  if (!post) return null;

  const [types, tab] = await Promise.all([
    db.requestType.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    post.kind === "PLANNED"
      ? db.contentPost.findMany({
        where: { channelId: post.channelId, surface: post.surface, kind: "PLANNED" }, orderBy: { position: "desc" }, select: { id: true, plannedAt: true },
      })
      : Promise.resolve([]),
  ]);

  const media = (role: "MOCKUP" | "FINAL"): PanelMedia[] => post.media.filter((l) => l.role === role).map((l) => ({
    mediaId: l.media.id, type: l.media.type, order: l.order,
    url: cloudName ? mediaUrl(l.media, l.media.type === "VIDEO" ? "poster" : "panel", cloudName) : null,
  }));

  const drafter = canDraftContent(user);
  const edit = drafter && isEditable(post.status);
  const inProduction = post.status === "IN_PRODUCTION" || post.status === "DONE";
  return {
    post: {
      id: post.id, channelId: post.channelId, status: post.status, kind: post.kind, surface: post.surface, format: post.format,
      plannedAt: post.plannedAt ? jakartaDate(post.plannedAt) : null,
      publishedAt: post.publishedAt ? jakartaDate(post.publishedAt) : null,
      brief: post.brief ?? "", caption: post.caption ?? "", typeId: post.typeId,
      author: post.author, submittedAt: post.submittedAt?.toISOString() ?? null,
      request: post.request ? { id: post.request.id, status: post.request.status } : null,
    },
    mockups: media("MOCKUP"),
    finals: media("FINAL"),
    comments: post.comments.map((c) => ({ id: c.id, authorName: c.author.name, body: c.body, isFeedback: c.isFeedback, createdAt: c.createdAt.toISOString() })),
    types,
    can: {
      edit,
      submit: edit && post.kind === "PLANNED",
      approve: canApproveContent(user) && post.kind === "PLANNED" && post.status === "SUBMITTED" && !post.requestId,
      comment: true,
      delete: (post.authorId === user.id || canApproveContent(user)) && canDelete(post.status),
      // Same rule as setPostMediaWith's FINAL branch: drafters, or any assignee of the request.
      addFinal: inProduction && (drafter || (!!post.request && post.request.assignees.length > 0)),
    },
    warnDate: outOfOrder(tab).has(post.id) ? suggestDate(tab, post.id) : null,
    mediaReady: cloudName !== null,
  };
}
