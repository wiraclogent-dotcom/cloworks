"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Bell } from "lucide-react";
import type { InboxItem } from "@/lib/inbox";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";
import { NotificationItem, unreadRow } from "../notifications/NotificationItem";
import { Skeleton } from "../ui/Skeleton";
import { cn, focusRing } from "../ui/cn";

type Ok = { ok: true };
type Fail = { ok: false };
export type BellActions = {
  list: () => Promise<({ ok: true; items: InboxItem[]; unread: number }) | Fail>;
  markRead: (id: string) => Promise<Ok | Fail>;
  markAll: () => Promise<Ok | Fail>;
};
const serverActions: BellActions = { list: listNotifications, markRead: markNotificationRead, markAll: markAllNotificationsRead };

const rowClass = "block w-full cursor-default rounded-md outline-none select-none data-[highlighted]:bg-surface-muted";
const linkClass = "flex h-9 w-full cursor-default items-center justify-center rounded-md px-2.5 text-sm font-medium text-link outline-none select-none data-[highlighted]:bg-surface-muted";

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
  const [now, setNow] = useState(() => new Date());

  async function load() {
    setNow(new Date());
    const r = await actions.list();
    if (r.ok) { setItems(r.items); setCount(r.unread); } else setItems((cur) => cur ?? []);
  }

  const setRead = (id: string, readAt: Date | null) => setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, readAt } : n)) ?? cur);

  async function select(n: InboxItem) {
    const wasUnread = n.readAt === null;
    if (wasUnread) { setRead(n.id, new Date()); setCount((c) => Math.max(0, c - 1)); }
    if (n.requestId) router.push(`/requests/${encodeURIComponent(n.requestId)}`);
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
    <DropdownMenu.Root modal={false} onOpenChange={(o) => { if (o) void load(); }}>
      <DropdownMenu.Trigger aria-label={label} title="Notifications"
        className={cn("relative inline-flex size-9 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-surface-muted hover:text-foreground", focusRing)}>
        <Bell aria-hidden="true" strokeWidth={1.75} className="size-5" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-semibold text-destructive-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-1.5 text-foreground shadow-raised">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <p className="text-sm font-semibold">Notifications</p>
            <DropdownMenu.Item disabled={count === 0} onSelect={(e) => { e.preventDefault(); void markAll(); }}
              className="cursor-default rounded-md px-2 py-1 text-xs font-medium text-link outline-none select-none data-[disabled]:text-foreground-muted data-[highlighted]:bg-surface-muted">
              Mark all as read
            </DropdownMenu.Item>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <div role="status" aria-busy="true" className="grid gap-2 p-2.5">
                <span className="sr-only">Loading…</span>
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-foreground-secondary">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <DropdownMenu.Item key={n.id} onSelect={() => void select(n)} className={cn(rowClass, n.readAt === null && unreadRow)}>
                  <NotificationItem item={n} now={now} />
                </DropdownMenu.Item>
              ))
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={linkClass}>
            <Link href="/notifications">See all notifications</Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
