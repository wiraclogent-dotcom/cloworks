"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/lib/inbox";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { cn, focusRing } from "@/components/ui/cn";
import { markNotificationRead } from "./actions";

/** A row on the notifications page: opens its request (if any) and marks it read, reverting if the server refuses. */
export function NotificationLink({ item, now }: { item: InboxItem; now: Date }) {
  const router = useRouter();
  const [readAt, setReadAt] = useState(item.readAt);
  async function open() {
    const wasUnread = readAt === null;
    if (wasUnread) setReadAt(new Date());
    if (item.requestId) router.push(`/requests/${encodeURIComponent(item.requestId)}`);
    const r = await markNotificationRead(item.id).catch(() => ({ ok: false as const }));
    if (!r.ok && wasUnread) setReadAt(null);
  }
  return (
    <button type="button" onClick={() => void open()} className={cn("block w-full rounded-md hover:bg-surface-muted", focusRing)}>
      <NotificationItem item={{ ...item, readAt }} now={now} />
    </button>
  );
}
