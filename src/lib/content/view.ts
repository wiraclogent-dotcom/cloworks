import type { ContentFormat, ContentStatus, ContentSurface, MediaType } from "@prisma/client";
import type { ScopedDb } from "../db";
import { jakartaDate } from "../createRequest";
import { cloudinaryConfig } from "../media/config";
import { mediaUrl, type MediaPreset } from "../media/url";
import { canApproveContent, canDraftContent, canManageChannels, type ContentActor } from "./permissions";
import { outOfOrder } from "./order";
import { TAB_SURFACE, type ContentTab } from "./params";

const SURFACE_TAB: Record<ContentSurface, ContentTab> = { FEED: "feed", REEL: "reels", STORY: "stories" };

const TAB_PRESET: Record<ContentTab, MediaPreset> = { feed: "grid-3x4", reels: "reel-9x16", stories: "story-9x16" };

export type ChannelSummary = { id: string; brandId: string; brandName: string; handle: string; displayName: string; bio: string | null; avatarMediaId: string | null; avatarUrl: string | null; awaiting: number };

export type ChannelView = {
  id: string; brandId: string; brandName: string; handle: string; displayName: string; bio: string | null; avatarUrl: string | null;
  plannedCount: number; awaiting: number;
};

/** One grid tile. `plannedAt` is a Jakarta YYYY-MM-DD day. */
export type TileView = { id: string; status: ContentStatus; plannedAt: string | null; format: ContentFormat; coverUrl: string | null; warn: boolean };

export type ContentPlanView = {
  channels: ChannelSummary[];
  channel: ChannelView | null;
  /** The tab shown: the open post's surface when there is one, else the requested tab (default feed). */
  tab: ContentTab;
  /** The open post (`?post=`), or null when absent or not visible in this workspace. */
  postId: string | null;
  planned: TileView[];
  published: TileView[];
  can: { draft: boolean; approve: boolean; manageChannels: boolean };
  mediaReady: boolean;
};

type CoverMedia = { role: "MOCKUP" | "FINAL"; media: { publicId: string; type: MediaType } };

/**
 * Everything the Content Plan page shows for one channel and tab. A `postId` (notification links are just
 * `?post=<id>`) selects that post's channel and tab over the requested ones; an unknown post is ignored.
 * `cloudName` is null when media storage is not configured; no URLs are built then.
 */
export async function loadContentPlan(
  db: ScopedDb, user: ContentActor, q: { channelId?: string; tab?: ContentTab; postId?: string },
  cloudName: string | null = cloudinaryConfig()?.cloudName ?? null,
): Promise<ContentPlanView> {
  const can = { draft: canDraftContent(user), approve: canApproveContent(user), manageChannels: canManageChannels(user) };
  const [rows, submitted] = await Promise.all([
    db.socialChannel.findMany({
      orderBy: { position: "desc" },
      select: {
        id: true, brandId: true, handle: true, displayName: true, bio: true, avatarMediaId: true,
        brand: { select: { name: true } }, avatarMedia: { select: { publicId: true, type: true } },
      },
    }),
    db.contentPost.groupBy({ by: ["channelId"], where: { kind: "PLANNED", status: "SUBMITTED" }, _count: { _all: true } }),
  ]);
  const post = q.postId
    ? await db.contentPost.findFirst({ where: { id: q.postId }, select: { id: true, channelId: true, surface: true } })
    : null;
  const tab = post ? SURFACE_TAB[post.surface] : q.tab ?? "feed";
  const postId = post?.id ?? null;
  const awaitingOf = new Map(submitted.map((g) => [g.channelId, g._count._all]));
  const url = (m: { publicId: string; type: MediaType } | null | undefined, preset: MediaPreset) =>
    m && cloudName ? mediaUrl(m, preset, cloudName) : null;

  const channels: ChannelSummary[] = rows.map((c) => ({
    id: c.id, brandId: c.brandId, brandName: c.brand.name, handle: c.handle, displayName: c.displayName,
    bio: c.bio, avatarMediaId: c.avatarMediaId, avatarUrl: url(c.avatarMedia, "avatar-64"), awaiting: awaitingOf.get(c.id) ?? 0,
  }));
  const current = rows.find((c) => c.id === (post?.channelId ?? q.channelId)) ?? rows[0];
  if (!current) return { channels, channel: null, tab, postId, planned: [], published: [], can, mediaReady: cloudName !== null };

  const surface = TAB_SURFACE[tab];
  const coverSelect = {
    where: { role: { in: ["FINAL", "MOCKUP"] as ("FINAL" | "MOCKUP")[] } },
    orderBy: { order: "asc" as const },
    select: { role: true, media: { select: { publicId: true, type: true } } },
  };
  const tileSelect = { id: true, status: true, plannedAt: true, format: true, media: coverSelect } as const;
  const [plannedRows, publishedRows, plannedCount] = await Promise.all([
    db.contentPost.findMany({ where: { channelId: current.id, surface, kind: "PLANNED" }, orderBy: { position: "desc" }, select: tileSelect }),
    db.contentPost.findMany({ where: { channelId: current.id, surface, kind: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: tileSelect }),
    db.contentPost.count({ where: { channelId: current.id, kind: "PLANNED" } }),
  ]);

  // Cover: first FINAL, else first MOCKUP. Videos show their first frame in every tab.
  const cover = (media: CoverMedia[]) => {
    const m = (media.find((x) => x.role === "FINAL") ?? media.find((x) => x.role === "MOCKUP"))?.media;
    return url(m, m?.type === "VIDEO" ? "poster" : TAB_PRESET[tab]);
  };
  const warn = outOfOrder(plannedRows);
  const tile = (p: (typeof plannedRows)[number]): TileView => ({
    id: p.id, status: p.status, plannedAt: p.plannedAt ? jakartaDate(p.plannedAt) : null, format: p.format,
    coverUrl: cover(p.media), warn: warn.has(p.id),
  });

  return {
    channels,
    channel: {
      id: current.id, brandId: current.brandId, brandName: current.brand.name, handle: current.handle, displayName: current.displayName, bio: current.bio,
      avatarUrl: url(current.avatarMedia, "avatar-64"), plannedCount, awaiting: awaitingOf.get(current.id) ?? 0,
    },
    tab,
    postId,
    planned: plannedRows.map(tile),
    published: publishedRows.map(tile),
    can,
    mediaReady: cloudName !== null,
  };
}
