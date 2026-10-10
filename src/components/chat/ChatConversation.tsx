"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LoaderCircle, SendHorizontal } from "lucide-react";
import type { RequestStatus } from "@prisma/client";
import type { ChatMessage } from "@/lib/chat";
import { splitMentions } from "@/lib/mentions";
import { StatusChip } from "../ui/StatusChip";
import { Skeleton } from "../ui/Skeleton";
import { IconButton } from "../ui/IconButton";
import { cn, focusRing } from "../ui/cn";

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const NEAR_BOTTOM = 80;

/** "Today", "Yesterday" or "Fri, 3 Oct", in the viewer's local time zone. */
function dayLabel(d: Date, now: Date): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : dayFmt.format(d);
}

export type ConversationState = {
  id: string; messages: ChatMessage[]; hasOlder: boolean; loading: boolean; loadingOlder: boolean; error: string | null;
};

/**
 * One request's group chat: header (back on small screens, title, status, "Open request"), the messages with day
 * dividers and "Load older", and the composer (Enter sends, Shift+Enter is a new line). `onSend` resolves to an error
 * message, or null when sent. Mount it keyed by request id so the draft and scroll state reset per chat.
 */
export function ChatConversation({ conv, title, status, userId, now, onBack, onLoadOlder, onSend }: {
  conv: ConversationState; title: string | null; status: RequestStatus | null; userId: string; now: Date;
  onBack: () => void; onLoadOlder: () => void; onSend: (body: string) => Promise<string | null>;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prev = useRef<{ first?: string; last?: string; height: number }>({ height: 0 });

  useEffect(() => { boxRef.current?.focus(); }, []);

  // Scroll: to the bottom on first load and on new messages when already near it (always for your own);
  // keep the reading position when older messages are prepended.
  const { messages } = conv;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = messages[0]?.id;
    const last = messages.at(-1);
    const p = prev.current;
    if (first !== p.first && last?.id === p.last && p.last) el.scrollTop += el.scrollHeight - p.height;
    else if (last && last.id !== p.last && (!p.last || nearBottom.current || last.author.id === userId)) el.scrollTop = el.scrollHeight;
    prev.current = { first, last: last?.id, height: el.scrollHeight };
  }, [messages, userId]);

  async function submit() {
    const text = body;
    if (!text.trim() || pending) return;
    setPending(true);
    setError(null);
    const err = await onSend(text);
    setPending(false);
    if (err) setError(err);
    else setBody("");
  }

  const rows = Math.min(5, Math.max(1, body.split("\n").length));
  const blank = !body.trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <IconButton aria-label="Back to chats" size="sm" icon={<ArrowLeft />} onClick={onBack} className="md:hidden" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title ?? "Chat"}</p>
          {status && <StatusChip status={status} className="mt-0.5" />}
        </div>
        <Link href={`/requests/${encodeURIComponent(conv.id)}`}
          className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-link hover:bg-surface-muted", focusRing)}>
          Open request<ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {conv.error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p role="alert" className="text-sm text-foreground-secondary">{conv.error}</p>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
          }} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {conv.loading ? (
              <div role="status" aria-busy="true" className="grid gap-3">
                <span className="sr-only">Loading messages…</span>
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="ml-auto h-10 w-1/2" />
                <Skeleton className="h-14 w-3/4" />
              </div>
            ) : (
              <>
                {conv.hasOlder && (
                  <div className="mb-3 flex justify-center">
                    <button type="button" onClick={onLoadOlder} disabled={conv.loadingOlder}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-secondary hover:bg-surface-muted disabled:opacity-55", focusRing)}>
                      {conv.loadingOlder && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />}
                      Load older messages
                    </button>
                  </div>
                )}
                <ol aria-label="Message history" className="flex flex-col gap-1.5">
                  {messages.map((m, i) => {
                    const mine = m.author.id === userId;
                    const prior = messages[i - 1];
                    const newDay = !prior || prior.createdAt.toDateString() !== m.createdAt.toDateString();
                    const showName = !mine && (newDay || prior?.author.id !== m.author.id);
                    return (
                      <Fragment key={m.id}>
                        {newDay && (
                          <li role="separator" className="my-2 flex items-center gap-3 text-[11px] font-medium text-foreground-secondary">
                            <span aria-hidden="true" className="h-px flex-1 bg-border" />{dayLabel(m.createdAt, now)}<span aria-hidden="true" className="h-px flex-1 bg-border" />
                          </li>
                        )}
                        <li className={cn("flex max-w-[80%] flex-col", mine ? "ml-auto items-end" : "items-start", showName && "mt-1.5")}>
                          {showName && <span className="mb-0.5 px-1 text-[11px] font-medium text-foreground-secondary">{m.author.name}</span>}
                          <div className={cn(
                            "rounded-2xl px-3 py-1.5",
                            mine ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md bg-surface-muted text-foreground",
                          )}>
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {splitMentions(m.body).map((s, j) => s.mention
                                ? <strong key={j} className="font-semibold underline decoration-dotted">{s.text}</strong>
                                : <Fragment key={j}>{s.text}</Fragment>)}
                            </p>
                          </div>
                          <time dateTime={m.createdAt.toISOString()} className="mt-0.5 px-1 text-[10px] text-foreground-secondary">{timeFmt.format(m.createdAt)}</time>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </>
            )}
          </div>

          <form className="border-t border-border p-2.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {error && <p role="alert" className="mb-1.5 px-1 text-xs text-danger">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea ref={boxRef} aria-label="Message" placeholder="Write a message…" rows={rows} value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
                }}
                className="min-h-9 flex-1 resize-none rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring" />
              <button type="submit" aria-label="Send" title="Send" disabled={blank || pending}
                className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-55", focusRing)}>
                {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <SendHorizontal aria-hidden="true" className="size-4" />}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
