import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { CircleDashed, Clapperboard, Grid3x3 } from "lucide-react";
import { planHref, type ContentTab } from "@/lib/content/params";
import type { ChannelView, TileView } from "@/lib/content/view";
import { Avatar } from "@/components/ui/Avatar";
import { cn, focusRing } from "@/components/ui/cn";
import { PostTile } from "./PostTile";
import { AlreadyPostedButton, NewPostTile } from "./NewPostButtons";

const TABS: { value: ContentTab; label: string; icon: ReactNode }[] = [
  { value: "feed", label: "Feed", icon: <Grid3x3 aria-hidden="true" /> },
  { value: "reels", label: "Reels", icon: <Clapperboard aria-hidden="true" /> },
  { value: "stories", label: "Stories", icon: <CircleDashed aria-hidden="true" /> },
];

/** Feed and Reels: 3 columns. Stories: one horizontal row of cards. */
function TileRow({ tab, children }: { tab: ContentTab; children: ReactNode }) {
  if (tab !== "stories") return <div className="grid grid-cols-3 gap-0.5">{children}</div>;
  return (
    <div className="flex gap-1 overflow-x-auto px-1 pb-1">
      {Children.toArray(children).map((c, i) => <div key={isValidElement(c) ? (c.key ?? i) : i} className="w-28 shrink-0">{c}</div>)}
    </div>
  );
}

/**
 * Centre column: an Instagram profile in a phone frame (~390px): header, Feed/Reels/Stories tabs, then the planned
 * posts (top of the plan first), an "Already posted" divider and the posted ones, faded.
 */
export function PhonePreview({ channel, tab, planned, published, canDraft, selectedId }: {
  channel: ChannelView; tab: ContentTab; planned: TileView[]; published: TileView[]; canDraft: boolean; selectedId: string | null;
}) {
  const tileProps = { channelId: channel.id, tab };
  return (
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2.25rem] border-[10px] border-foreground bg-background shadow-raised">
      <div className="mx-auto mt-1.5 h-1.5 w-20 rounded-full bg-surface-muted" aria-hidden="true" />
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <Avatar name={channel.displayName} src={channel.avatarUrl ?? undefined} size="lg" decorative className="size-16 text-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">@{channel.handle}</h2>
          <p className="truncate text-sm font-medium text-foreground">{channel.displayName}</p>
          {channel.bio ? <p className="mt-0.5 text-[13px] whitespace-pre-line text-foreground-secondary">{channel.bio}</p> : null}
          <p className="mt-1.5 text-xs text-foreground-secondary tabular-nums">
            {`${channel.plannedCount} planned · ${channel.awaiting} awaiting approval`}
          </p>
        </div>
      </header>
      <nav aria-label="Surface" className="flex border-y border-border">
        {TABS.map((t) => (
          <Link key={t.value} href={planHref({ channel: channel.id, tab: t.value })} aria-current={t.value === tab ? "page" : undefined}
            className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 border-b-2 text-xs font-medium transition-colors duration-150 ease-out [&_svg]:size-4", focusRing,
              t.value === tab ? "border-foreground text-foreground" : "border-transparent text-foreground-secondary hover:text-foreground")}>
            {t.icon}{t.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-64 pt-0.5 pb-4">
        <TileRow tab={tab}>
          {canDraft ? <NewPostTile {...tileProps} /> : null}
          {planned.map((t) => <PostTile key={t.id} tile={t} {...tileProps} selected={t.id === selectedId} />)}
        </TileRow>
        <div className="my-2 flex flex-col items-center gap-1 px-3">
          <div className="flex w-full items-center gap-2 text-xs text-foreground-secondary">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span>Already posted</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          {canDraft ? <AlreadyPostedButton {...tileProps} /> : null}
        </div>
        {published.length ? (
          <TileRow tab={tab}>
            {published.map((t) => <PostTile key={t.id} tile={t} {...tileProps} published selected={t.id === selectedId} />)}
          </TileRow>
        ) : null}
        {!planned.length && !published.length && !canDraft ? (
          <p className="px-4 py-8 text-center text-sm text-foreground-secondary">Nothing planned here yet.</p>
        ) : null}
      </div>
    </div>
  );
}
