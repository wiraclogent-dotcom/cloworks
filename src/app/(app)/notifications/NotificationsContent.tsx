import { requireScope } from "@/lib/session";
import { countNotificationsWith, listNotificationsWith, unreadCountWith } from "@/lib/inbox";
import { pageWindow, parsePage, rangeText, TABLE_PAGE_SIZE } from "@/lib/paging";
import { Pagination } from "@/components/Pagination";
import { MarkAllButton } from "./MarkAllButton";
import { NotificationLink } from "./NotificationLink";

/** The signed-in person's notifications, newest first, 50 a page (`?page=N`, clamped). */
export async function NotificationsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ user, db }, params] = await Promise.all([requireScope(), searchParams]);
  const [total, unread] = await Promise.all([countNotificationsWith(db, user.id), unreadCountWith(db, user.id)]);
  const w = pageWindow(total, parsePage(params.page), TABLE_PAGE_SIZE);
  const items = await listNotificationsWith(db, user.id, { limit: TABLE_PAGE_SIZE, offset: w.skip });
  const now = new Date();
  return (
    <section aria-label="All notifications" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-sm text-foreground-secondary">{unread > 0 ? `${unread} unread` : "All read"}</p>
        <MarkAllButton disabled={unread === 0} />
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium">No notifications yet.</p>
          <p className="mt-1 text-sm text-foreground-secondary">You&apos;ll hear here when someone comments, mentions you, assigns you, or sends a design on your requests.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border p-1.5">
          {items.map((n) => <li key={n.id} className="py-0.5"><NotificationLink item={n} now={now} /></li>)}
        </ul>
      )}
      <Pagination text={rangeText(w, total)} page={w.page} pageCount={w.pageCount}
        hrefFor={(p) => (p === 1 ? "/notifications" : `/notifications?page=${p}`)} />
    </section>
  );
}
