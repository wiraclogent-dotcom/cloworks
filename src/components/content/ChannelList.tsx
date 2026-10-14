"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { planHref, type ContentTab } from "@/lib/content/params";
import type { ChannelSummary } from "@/lib/content/view";
import { Avatar } from "@/components/ui/Avatar";
import { CountPill } from "@/components/ui/Chip";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Label } from "@/components/shadcn/label";
import { cn, focusRing } from "@/components/ui/cn";
import { ChannelActions, type ChannelMove } from "./ChannelActions";
import { AddChannelButton, type BrandOption } from "./ChannelForm";
import { Button } from "@/components/shadcn/button";

/** Channels in list order, grouped by brand id (a brand's group sits where its first channel is). */
function byBrand(channels: ChannelSummary[]): ChannelSummary[][] {
  const groups = new Map<string, ChannelSummary[]>();
  for (const c of channels) groups.set(c.brandId, [...(groups.get(c.brandId) ?? []), c]);
  return [...groups.values()];
}

/**
 * The moves that shift a channel one place within its brand group (the group is how the list is shown), as the
 * channel to move and the neighbours it lands between in the full list order. Null at the group's ends. Moving down
 * moves the next channel of the group into this one's slot, so the group never jumps past another brand.
 */
function movesOf(channels: ChannelSummary[], c: ChannelSummary): { up: ChannelMove | null; down: ChannelMove | null } {
  const group = channels.filter((x) => x.brandId === c.brandId);
  const i = group.indexOf(c);
  const prev = group[i - 1];
  const next = group[i + 1];
  const at = (x: ChannelSummary, d: number) => channels[channels.indexOf(x) + d]?.id ?? null;
  return {
    up: prev ? { id: c.id, aboveId: at(prev, -1), belowId: prev.id } : null,
    down: next ? { id: next.id, aboveId: at(c, -1), belowId: c.id } : null,
  };
}

/**
 * Left column: channels grouped by brand with their "awaiting approval" counts. Below 1024px it collapses to a
 * <NativeSelect>. Switching channel keeps the tab and closes any open post. Channel managers also get Edit, Move and
 * Delete per channel (behind a "Manage" toggle, so the list stays quiet).
 */
export function ChannelList({ channels, currentId, tab, canManage, brands }: {
  channels: ChannelSummary[]; currentId: string | null; tab: ContentTab; canManage: boolean; brands: BrandOption[];
}) {
  const router = useRouter();
  const [managing, setManaging] = useState<string | null>(null);
  const [managingSelected, setManagingSelected] = useState(false);
  const selected = channels.find((c) => c.id === currentId);
  const actions = (c: ChannelSummary) => (
    <ChannelActions channel={c} {...movesOf(channels, c)} current={c.id === currentId} tab={tab} brands={brands} />
  );
  const add = canManage ? <AddChannelButton brands={brands} variant="ghost" size="sm" icon={<Plus />}>Channel</AddChannelButton> : null;
  return (
    <>
      <div className="flex items-end gap-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <Label htmlFor="content-channel">Channel</Label>
          <NativeSelect id="content-channel" value={currentId ?? ""}
            onChange={(e) => router.push(planHref({ channel: e.target.value, tab }))}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{`${c.brandName} · @${c.handle}${c.awaiting ? ` (${c.awaiting} awaiting)` : ""}`}</option>
            ))}
          </NativeSelect>
        </div>
        {canManage && selected ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Manage selected channel"
            aria-expanded={managingSelected}
            onClick={() => setManagingSelected((v) => !v)}
            title="Manage selected channel"
          >
            <Settings2 />
          </Button>
        ) : null}
        {add}
      </div>
      {canManage && selected && managingSelected ? <div className="lg:hidden">{actions(selected)}</div> : null}
      <nav aria-label="Channels" className="hidden lg:block">
        <p className="mb-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Channels</p>
        <div className="space-y-4">
          {byBrand(channels).map((list) => (
            <section key={list[0].brandId}>
              <h3 className="mb-1 truncate px-2 text-xs font-semibold text-muted-foreground">{list[0].brandName}</h3>
              <ul className="space-y-0.5">
                {list.map((c) => {
                  const on = c.id === currentId;
                  const open = managing === c.id;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center gap-0.5">
                        <Link href={planHref({ channel: c.id, tab })} aria-current={on ? "page" : undefined}
                          className={cn("flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm transition-colors duration-150 ease-out", focusRing,
                            on ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted")}>
                          <Avatar name={c.displayName} src={c.avatarUrl} size="sm" decorative />
                          <span className="min-w-0 flex-1 truncate">@{c.handle}</span>
                          {c.awaiting ? <CountPill value={c.awaiting} aria-label={`${c.awaiting} awaiting approval`} /> : null}
                        </Link>
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Manage @${c.handle}`}
                            aria-expanded={open}
                            onClick={() => setManaging(open ? null : c.id)}
                            title={`Manage @${c.handle}`}
                          >
                            <Settings2 />
                          </Button>
                        ) : null}
                      </div>
                      {canManage && open ? actions(c) : null}
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
