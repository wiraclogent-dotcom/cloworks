import type { InboxItem } from "@/lib/inbox";
import { relativeTime } from "@/lib/relativeTime";
import { cn } from "../ui/cn";

/**
 * One notification row, shared by the bell dropdown and the notifications page. Presentational only: the caller wraps it
 * in a menu item or a button, and paints the row (`unreadRow` on unread ones) so its hover/keyboard highlight still wins.
 * Unread rows get a dot, announced as "Unread".
 */
export const unreadRow = "bg-unread";

export function NotificationItem({ item, now }: { item: InboxItem; now: Date }) {
  const unread = item.readAt === null;
  return (
    <span className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left">
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-unread-dot" : "bg-transparent")} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">Unread: </span>}
        <span className={cn("line-clamp-2 break-words text-sm", unread ? "font-medium text-foreground" : "text-foreground-secondary")}>{item.message}</span>
        <span className="mt-0.5 block text-xs text-foreground-muted">{relativeTime(new Date(item.createdAt), now)}</span>
      </span>
    </span>
  );
}
