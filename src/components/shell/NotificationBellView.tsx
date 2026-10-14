"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { InboxItem } from "@/lib/inbox";
import { notificationHref } from "@/lib/notificationLinks";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";
import { NotificationItem, unreadRow } from "../notifications/NotificationItem";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn, focusRing } from "../ui/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";

type Ok = { ok: true };
type Fail = { ok: false };
export type BellActions = {
  list: () => Promise<({ ok: true; items: InboxItem[]; unread: number }) | Fail>;
  markRead: (id: string) => Promise<Ok | Fail>;
  markAll: () => Promise<Ok | Fail>;
};
const serverActions: BellActions = { list: listNotifications, markRead: markNotificationRead, markAll: markAllNotificationsRead };

/** A notification row: NotificationItem brings its own padding and layout. */
const rowClass = "block p-0";

/**
 * Top-bar bell: unread badge, and a dropdown of the newest notifications. Opening it fetches the list; selecting one
 * marks it read (optimistically, reverted if the server says no) and opens its request. `actions` defaults to the
 * server actions and is injectable for tests.
 */
export function NotificationBellView({ unread, actions = serverActions }: { unread: number; actions?: BellActions }) {
  const router = useRouter();
  const [count, setCount] = useState(unread);
  // The bell lives in the layout: a refresh or navigation re-renders it with a fresh server count, so follow it.
  const [seen, setSeen] = useState(unread);
  if (unread !== seen) { setSeen(unread); setCount(unread); }
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  async function load() {
    setNow(new Date());
    // A failed load keeps any list from an earlier open; with none, it says so (not a skeleton, not "all caught up").
    const r = await actions.list().catch(() => ({ ok: false as const }));
    if (r.ok) { setItems(r.items); setCount(r.unread); setLoadFailed(false); } else setLoadFailed(true);
  }

  const setRead = (id: string, readAt: Date | null) => setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, readAt } : n)) ?? cur);

  async function select(n: InboxItem) {
    const wasUnread = n.readAt === null;
    if (wasUnread) { setRead(n.id, new Date()); setCount((c) => Math.max(0, c - 1)); }
    const href = notificationHref(n);
    if (href) router.push(href);
    const r = await actions.markRead(n.id).catch(() => ({ ok: false as const }));
    if (!r.ok && wasUnread) { setRead(n.id, null); setCount((c) => c + 1); }
  }

  async function markAll() {
    const before = { items, count };
    setItems((cur) => cur?.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })) ?? cur);
    setCount(0);
    const r = await actions.markAll().catch(() => ({ ok: false as const }));
    if (!r.ok) { setItems(before.items); setCount(before.count); }
  }

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <DropdownMenu modal={false} onOpenChange={(o) => { if (o) void load(); }}>
      <DropdownMenuTrigger aria-label={label} title="Notifications"
        className={cn("relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", focusRing)}>
        <Bell aria-hidden="true" strokeWidth={1.75} className="size-5" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-xs leading-none font-semibold text-destructive-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <p className="text-sm font-semibold">Notifications</p>
          <DropdownMenuItem disabled={count === 0} onSelect={(e) => { e.preventDefault(); void markAll(); }}
            className="w-auto px-2 py-1 text-xs font-medium text-link">
            Mark all as read
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items === null && loadFailed ? (
            <p role="alert" className="px-2.5 py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load notifications. Close and open again to retry.</p>
          ) : items === null ? (
            <div role="status" aria-busy="true" className="grid gap-2 p-2.5">
              <span className="sr-only">Loading…</span>
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2.5 py-6 text-center text-sm text-muted-foreground">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground [&_svg]:size-5"><Bell /></span>
              You&apos;re all caught up.
            </div>
          ) : (
            items.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => void select(n)} className={cn(rowClass, n.readAt === null && unreadRow)}>
                <NotificationItem item={n} now={now} />
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="h-9 justify-center font-medium text-link">
          <Link href="/notifications">See all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
