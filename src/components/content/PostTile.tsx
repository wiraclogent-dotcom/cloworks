import Link from "next/link";
import type { ContentStatus } from "@prisma/client";
import { Images, Play, TriangleAlert } from "lucide-react";
import type { Tone } from "@/lib/palette";
import { planHref, type ContentTab } from "@/lib/content/params";
import type { TileView } from "@/lib/content/view";
import { cn, focusRing } from "@/components/ui/cn";

export const STATUS_LABEL: Record<ContentStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  IN_PRODUCTION: "In production",
  DONE: "Done",
};

export const STATUS_TONE: Record<ContentStatus, Tone> = {
  IDEA: "tag-neutral",
  DRAFT: "requested",
  SUBMITTED: "first-look",
  CHANGES_REQUESTED: "overdue",
  APPROVED: "done",
  IN_PRODUCTION: "in-progress",
  DONE: "done",
};

/** Tile shape per tab: feed 3:4, reels and stories 9:16. */
export const TILE_ASPECT: Record<ContentTab, string> = { feed: "aspect-[3/4]", reels: "aspect-[9/16]", stories: "aspect-[9/16]" };

/** Placeholder for a tile with no media yet. */
export const STRIPES = "bg-[repeating-linear-gradient(45deg,var(--surface-muted)_0_6px,var(--border)_6px_12px)]";

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "2026-10-24" → "24 Oct". */
export const shortDay = (ymd: string) => DAY_FMT.format(new Date(`${ymd}T00:00:00Z`));

/**
 * One grid tile: cover (or stripes), status badge, planned date, carousel/video icon and the ⚠ badge when its date
 * is out of order. Published tiles are faded and carry no status. Links to `?post=<id>`, keeping channel and tab.
 */
export function PostTile({ tile, channelId, tab, published = false, selected = false }: {
  tile: TileView; channelId: string; tab: ContentTab; published?: boolean; selected?: boolean;
}) {
  const label = [published ? "Posted" : STATUS_LABEL[tile.status], tile.plannedAt && !published ? shortDay(tile.plannedAt) : null,
    tile.format === "CAROUSEL" ? "Carousel" : tile.format === "VIDEO" ? "Video" : null].filter(Boolean).join(" · ");
  return (
    <Link href={planHref({ channel: channelId, tab, post: tile.id })} aria-label={label} aria-current={selected ? "true" : undefined}
      className={cn("relative block overflow-hidden bg-surface-muted", TILE_ASPECT[tab], focusRing,
        !tile.coverUrl && STRIPES, published && "opacity-50 hover:opacity-80",
        selected && "outline-3 -outline-offset-3 outline-primary")}>
      {tile.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sizes and formats the image
        <img src={tile.coverUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : null}
      {!published ? (
        <span data-badge="" data-tone={STATUS_TONE[tile.status]}
          className="absolute top-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-tone-tint px-1 py-px text-[10px] leading-3.5 font-semibold text-tone-text">
          {STATUS_LABEL[tile.status]}
        </span>
      ) : null}
      {tile.warn ? (
        <span aria-label="Date out of order" title="Date out of order" data-tone="due-soon"
          className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded bg-tone-tint text-tone-text [&_svg]:size-3">
          <TriangleAlert aria-hidden="true" />
        </span>
      ) : null}
      <span className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 text-[10px] leading-3.5 font-medium">
        {tile.plannedAt && !published ? (
          <span aria-hidden="true" className="rounded bg-background/85 px-1 text-foreground tabular-nums">{shortDay(tile.plannedAt)}</span>
        ) : <span />}
        {tile.format !== "SINGLE" ? (
          <span aria-hidden="true" className="flex size-4.5 items-center justify-center rounded bg-background/85 text-foreground [&_svg]:size-3">
            {tile.format === "CAROUSEL" ? <Images /> : <Play />}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
