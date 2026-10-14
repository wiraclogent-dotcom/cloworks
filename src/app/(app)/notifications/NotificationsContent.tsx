import { BellOff } from "lucide-react";
import { requireScope } from "@/lib/session";
import { countNotificationsWith, listNotificationsWith, unreadCountWith } from "@/lib/inbox";
import { pageWindow, parsePage, rangeText, TABLE_PAGE_SIZE } from "@/lib/paging";
import { Pagination } from "@/components/Pagination";
import { Card } from "@/components/shadcn/card";
import { MarkAllButton } from "./MarkAllButton";
import { NotificationLink } from "./NotificationLink";
import { EmptyState } from "@/components/ui/EmptyState";

/** The signed-in person's notifications, newest first, 50 a page (`?page=N`, clamped). */
export async function NotificationsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ user, db }, params] = await Promise.all([requireScope(), searchParams]);
  const [total, unread] = await Promise.all([countNotificationsWith(db, user.id), unreadCountWith(db, user.id)]);
  const w = pageWindow(total, parsePage(params.page), TABLE_PAGE_SIZE);
  const items = await listNotificationsWith(db, user.id, { limit: TABLE_PAGE_SIZE, offset: w.skip });
  const now = new Date();
  return (
    <Card asChild className="overflow-hidden p-0"><section aria-label="All notifications">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "All read"}</p>
        <MarkAllButton disabled={unread === 0} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<BellOff />} title="No notifications yet."
          description="You'll hear here when someone comments, mentions you, assigns you, or sends a design on your requests."
          className="rounded-none border-0 bg-transparent px-4 py-12" />
      ) : (
        <ul className="divide-y divide-border p-1.5">
          {items.map((n) => <li key={n.id} className="py-0.5"><NotificationLink item={n} now={now} /></li>)}
        </ul>
      )}
      <Pagination text={rangeText(w, total)} page={w.page} pageCount={w.pageCount}
        hrefFor={(p) => (p === 1 ? "/notifications" : `/notifications?page=${p}`)} />
    </section></Card>
  );
}
