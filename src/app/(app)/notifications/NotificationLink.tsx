"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/lib/inbox";
import { notificationHref } from "@/lib/notificationLinks";
import { NotificationItem, unreadRow } from "@/components/notifications/NotificationItem";
import { cn, focusRing } from "@/components/ui/cn";
import { markNotificationRead } from "./actions";

/** A row on the notifications page: opens its request (if any) and marks it read, reverting if the server refuses. */
export function NotificationLink({ item, now }: { item: InboxItem; now: Date }) {
  const router = useRouter();
  // Optimistic override on top of the server value, so a refresh (e.g. after "Mark all as read") still shows through.
  const [override, setOverride] = useState<Date | null | undefined>(undefined);
  const readAt = override !== undefined ? override : item.readAt;
  async function open() {
    const wasUnread = readAt === null;
    if (wasUnread) setOverride(new Date());
    const href = notificationHref(item);
    if (href) router.push(href);
    const r = await markNotificationRead(item.id).catch(() => ({ ok: false as const }));
    if (!r.ok && wasUnread) setOverride(undefined);
  }
  return (
    <button type="button" onClick={() => void open()} className={cn("block w-full rounded-md hover:bg-surface-muted", readAt === null && unreadRow, focusRing)}>
      <NotificationItem item={{ ...item, readAt }} now={now} />
    </button>
  );
}
