"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { planHref, type ContentTab } from "@/lib/content/params";
import type { ChannelSummary } from "@/lib/content/view";
import { Avatar } from "@/components/ui/Avatar";
import { CountPill } from "@/components/ui/Chip";
import { fieldClass, labelClass } from "@/components/ui/Field";
import { cn, focusRing } from "@/components/ui/cn";
import { AddChannelButton, type BrandOption } from "./ChannelForm";

/** Channels in list order, grouped by brand id (a brand's group sits where its first channel is). */
function byBrand(channels: ChannelSummary[]): ChannelSummary[][] {
  const groups = new Map<string, ChannelSummary[]>();
  for (const c of channels) groups.set(c.brandId, [...(groups.get(c.brandId) ?? []), c]);
  return [...groups.values()];
}

/**
 * Left column: channels grouped by brand with their "awaiting approval" counts. Below 1024px it collapses to a
 * <select>. Switching channel keeps the tab and closes any open post.
 */
export function ChannelList({ channels, currentId, tab, canManage, brands }: {
  channels: ChannelSummary[]; currentId: string | null; tab: ContentTab; canManage: boolean; brands: BrandOption[];
}) {
  const router = useRouter();
  const add = canManage ? <AddChannelButton brands={brands} variant="ghost" size="sm" icon={<Plus />}>Channel</AddChannelButton> : null;
  return (
    <>
      <div className="flex items-end gap-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <label htmlFor="content-channel" className={labelClass}>Channel</label>
          <select id="content-channel" value={currentId ?? ""} className={fieldClass({ kind: "select" })}
            onChange={(e) => router.push(planHref({ channel: e.target.value, tab }))}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{`${c.brandName} · @${c.handle}${c.awaiting ? ` (${c.awaiting} awaiting)` : ""}`}</option>
            ))}
          </select>
        </div>
        {add}
      </div>
      <nav aria-label="Channels" className="hidden lg:block">
        <p className="mb-2 px-2 text-xs font-medium tracking-wide text-foreground-secondary uppercase">Channels</p>
        <div className="space-y-4">
          {byBrand(channels).map((list) => (
            <section key={list[0].brandId}>
              <h3 className="mb-1 truncate px-2 text-xs font-semibold text-foreground-secondary">{list[0].brandName}</h3>
              <ul className="space-y-0.5">
                {list.map((c) => {
                  const on = c.id === currentId;
                  return (
                    <li key={c.id}>
                      <Link href={planHref({ channel: c.id, tab })} aria-current={on ? "page" : undefined}
                        className={cn("flex h-10 items-center gap-2 rounded-lg px-2 text-sm transition-colors duration-150 ease-out", focusRing,
                          on ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-surface-muted")}>
                        <Avatar name={c.displayName} src={c.avatarUrl ?? undefined} size="sm" decorative />
                        <span className="min-w-0 flex-1 truncate">@{c.handle}</span>
                        {c.awaiting ? <CountPill value={c.awaiting} aria-label={`${c.awaiting} awaiting approval`} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {add ? <div className="mt-3">{add}</div> : null}
      </nav>
    </>
  );
}
