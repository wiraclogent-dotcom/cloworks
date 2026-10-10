"use client";

import { MessagesSquare } from "lucide-react";
import type { ChatSummary } from "@/lib/chat";
import { relativeTime } from "@/lib/relativeTime";
import { Skeleton } from "../ui/Skeleton";
import { cn, focusRing } from "../ui/cn";

/** "You: …" for your own last message, otherwise "Name: …". */
function preview(c: ChatSummary, userId: string): string {
  return `${c.lastMessage.authorId === userId ? "You" : c.lastMessage.authorName}: ${c.lastMessage.body}`;
}

/** The dock's chat list: one row per request chat, newest first (server order), or the empty and loading states. */
export function ChatList({ chats, selectedId, userId, now, onSelect }: {
  chats: ChatSummary[] | null; selectedId: string | null; userId: string; now: Date; onSelect: (id: string) => void;
}) {
  if (chats === null) {
    return (
      <div role="status" aria-busy="true" className="grid gap-3 p-3">
        <span className="sr-only">Loading chats…</span>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (chats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-foreground-secondary">
          <MessagesSquare className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-sm text-foreground-secondary">No chats yet. Comment on a request to start one.</p>
      </div>
    );
  }
  return (
    <ul aria-label="Chats" className="p-1.5">
      {chats.map((c) => {
        const selected = c.requestId === selectedId;
        return (
          <li key={c.requestId}>
            <button type="button" onClick={() => onSelect(c.requestId)} aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-muted",
                selected && "bg-surface-muted", focusRing,
              )}>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground")}>{c.title}</span>
                  <span className="shrink-0 text-[11px] text-foreground-secondary">{relativeTime(c.lastMessage.createdAt, now)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", c.unread > 0 ? "text-foreground" : "text-foreground-secondary")}>{preview(c, userId)}</span>
                  {c.unread > 0 && (
                    <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-semibold text-destructive-foreground">
                      <span className="sr-only">, </span>{c.unread > 9 ? "9+" : c.unread}<span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
