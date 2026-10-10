"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ChevronDown, MessagesSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ChatMessage, ChatSummary } from "@/lib/chat";
import type { CollabFail } from "@/lib/collab";
import { chatUnreadCount, listChats, listMessages, markChatRead, sendChatMessage } from "@/app/(app)/chat/actions";
import { usePoll } from "@/lib/usePoll";
import { ChatList } from "./ChatList";
import { ChatConversation, type ConversationState } from "./ChatConversation";
import { IconButton } from "../ui/IconButton";
import { cn, focusRing } from "../ui/cn";

type Cursor = { at: Date; id: string };
export type LatestUnread = { requestId: string; title: string };
export type ChatActions = {
  unreadCount: () => Promise<{ ok: true; unread: number; latestUnread: LatestUnread | null } | CollabFail>;
  listChats: (offset?: number) => Promise<{ ok: true; chats: ChatSummary[] } | CollabFail>;
  listMessages: (requestId: string, opts?: { after?: Cursor; before?: Cursor }) => Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | CollabFail>;
  markRead: (requestId: string, at?: Date) => Promise<{ ok: true } | CollabFail>;
  send: (requestId: string, body: string) => Promise<{ ok: true; message: ChatMessage } | CollabFail>;
};
const serverActions: ChatActions = {
  unreadCount: chatUnreadCount, listChats, listMessages, markRead: markChatRead, send: sendChatMessage,
};

// ---- `open` and `selectedId`, persisted per tab in sessionStorage `chat-dock` ----
// A store (not state) so hydration uses the closed server snapshot and the saved value applies right after.
const KEY = "chat-dock";
const CHANGE = "chat-dock-change";
type DockState = { open: boolean; selectedId: string | null; collapsed: boolean };
let memory: string | null = null; // used when sessionStorage is unavailable
function readRaw(): string | null {
  try { return window.sessionStorage.getItem(KEY); } catch { return memory; }
}
function writeDock(s: DockState) {
  memory = JSON.stringify(s);
  try { window.sessionStorage.setItem(KEY, memory); } catch { /* storage blocked: memory only */ }
  window.dispatchEvent(new Event(CHANGE));
}
function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}
function parseDock(raw: string | null): DockState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<DockState>) : null;
    return { open: v?.open === true, selectedId: typeof v?.selectedId === "string" && v.selectedId ? v.selectedId : null, collapsed: v?.collapsed === true };
  } catch { return { open: false, selectedId: null, collapsed: false }; }
}

const failed = (message: string): CollabFail => ({ ok: false, code: "INVALID", message });
const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Adds `incoming` to `cur`, skipping ids already there, in (createdAt, id) order. */
function merge(cur: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(cur.map((m) => m.id));
  const add = incoming.filter((m) => !seen.has(m.id));
  return add.length ? [...cur, ...add].sort(byTime) : cur;
}
const cursorOf = (m: ChatMessage): Cursor => ({ at: m.createdAt, id: m.id });
const latestKey = (l: LatestUnread | null) => (l ? `${l.requestId}\u0000${l.title}` : "");

/** Conversation poll while someone is around, and after `ACTIVE_WINDOW_MS` without activity. */
const CONVERSATION_MS = 5_000;
export const SLOW_CONVERSATION_MS = 30_000;
/** Activity (pointer, key, send, new messages) within this window keeps the conversation poll fast. */
export const ACTIVE_WINDOW_MS = 120_000;
/** After this long without activity every poll stops; the next activity restarts them with an immediate call. */
export const IDLE_STOP_MS = 900_000;
/** Activity updates state at most this often; the idle clock re-evaluates on this coarse tick. */
const ACTIVITY_THROTTLE_MS = 10_000;
const IDLE_CLOCK_MS = 30_000;
/** While a conversation is open the chat list is refreshed on every Nth conversation poll. */
const LIST_EVERY_N_TICKS = 6;

/** Running-text speed, and the share of each loop spent moving (the rest is the pause at both ends). */
const MARQUEE_PX_PER_S = 40;
const MARQUEE_MOVING = 0.7;

/**
 * The launcher's fixed-width label. A label wider than its box scrolls back and forth (`.chat-marquee` in
 * globals.css); with reduced motion it is truncated with an ellipsis instead.
 */
function RunningText({ text }: { text: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const box = boxRef.current, inner = textRef.current;
    if (!box || !inner) return;
    const measure = () => setOverflow(Math.max(0, Math.ceil(inner.scrollWidth - box.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);
  const style = overflow > 0
    ? ({ "--marquee-distance": `-${overflow}px`, "--marquee-duration": `${(overflow / MARQUEE_PX_PER_S / MARQUEE_MOVING).toFixed(2)}s` } as CSSProperties)
    : undefined;
  return (
    <span ref={boxRef} data-pill-box="" className="block w-40 overflow-hidden text-left text-sm font-semibold text-link">
      <span ref={textRef} data-pill-text="" style={style}
        className={cn("inline-block whitespace-nowrap", overflow > 0 && "chat-marquee motion-reduce:block motion-reduce:truncate")}>
        {text}
      </span>
    </span>
  );
}

/**
 * Bottom-right chat dock: a pill launcher (unread badge, newest unread request title as running text; a click opens
 * straight into that chat), and a popup with the chat list beside the open conversation (one or the other below `md`).
 * Near-live through polling, one poll at a time: the unread count every 60 s while closed, the list every 30 s while
 * open on it (and on every open), the open conversation every 5 s (30 s after 2 minutes without activity, with the list
 * refreshed every 6th tick). After 15 minutes without activity every poll stops until the next pointer or key press.
 * `actions` defaults to the server actions and is injectable for tests.
 */
export function ChatDockView({ unread, latestUnread = null, userId, actions = serverActions }: {
  unread: number; latestUnread?: LatestUnread | null; userId: string; actions?: ChatActions;
}) {
  const { open, selectedId, collapsed } = parseDock(useSyncExternalStore(subscribe, readRaw, () => null));
  const [count, setCount] = useState(unread);
  const [latest, setLatest] = useState<LatestUnread | null>(latestUnread);
  // Follow fresh server values after a refresh or navigation (same as the bell).
  const [seen, setSeen] = useState(unread);
  if (unread !== seen) { setSeen(unread); setCount(unread); }
  const [seenLatest, setSeenLatest] = useState(latestKey(latestUnread));
  if (latestKey(latestUnread) !== seenLatest) { setSeenLatest(latestKey(latestUnread)); setLatest(latestUnread); }
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [conv, setConv] = useState<ConversationState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const launcherRef = useRef<HTMLButtonElement>(null);
  const minimizeRef = useRef<() => void>(() => {});

  const convRef = useRef(conv);
  const selectedRef = useRef(selectedId);
  useEffect(() => { convRef.current = conv; selectedRef.current = selectedId; });

  // ---- Idle backoff: `lastActivity` (throttled) against a coarse clock decides how fast, or whether, to poll ----
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const activityRef = useRef(lastActivity);
  const idleFor = Math.max(0, clock - lastActivity);
  const stopped = idleFor >= IDLE_STOP_MS;
  const conversationMs = idleFor >= ACTIVE_WINDOW_MS ? SLOW_CONVERSATION_MS : CONVERSATION_MS;
  const stoppedRef = useRef(stopped);
  const resumeRef = useRef<() => void>(() => {});
  useEffect(() => { stoppedRef.current = stopped; });

  /** Records activity; when the polls had stopped, restarts them with an immediate call. */
  function noteActivity() {
    const t = Date.now();
    if (t - activityRef.current < ACTIVITY_THROTTLE_MS && !stoppedRef.current) return;
    activityRef.current = t;
    setLastActivity(t);
    if (stoppedRef.current) {
      stoppedRef.current = false;
      resumeRef.current();
    }
  }
  const noteActivityRef = useRef(noteActivity);
  useEffect(() => { noteActivityRef.current = noteActivity; });

  useEffect(() => {
    const onActivity = () => noteActivityRef.current();
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", onActivity, opts);
    window.addEventListener("keydown", onActivity, opts);
    const onVisible = () => { if (document.visibilityState === "visible") onActivity(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => setClock(Date.now()), IDLE_CLOCK_MS);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
  const listTicks = useRef(0);

  /** Applies `fn` to the conversation only if it is still the one for `id` (results can land after a switch). */
  const patchConv = (id: string, fn: (c: ConversationState) => ConversationState) =>
    setConv((c) => (c && c.id === id ? fn(c) : c));

  /** Moves a chat's preview to `m` (and the chat to the top) after a send or new messages. */
  const bumpChat = (id: string, m: ChatMessage) =>
    setChats((cur) => {
      const c = cur?.find((x) => x.requestId === id);
      if (!cur || !c) return cur;
      const next = { ...c, unread: 0, lastMessage: { body: m.body, authorId: m.author.id, authorName: m.author.name, createdAt: m.createdAt } };
      return [next, ...cur.filter((x) => x.requestId !== id)];
    });

  async function refreshChats() {
    const r = await actions.listChats().catch(() => failed("Couldn't load chats."));
    setNow(new Date());
    if (r.ok) {
      // The open conversation is being read (and marked read) right now, even if the list answered first.
      const list = r.chats.map((c) => (c.requestId === selectedId && c.unread > 0 ? { ...c, unread: 0 } : c));
      setChats(list);
      setListError(null);
      setCount(list.reduce((n, c) => n + c.unread, 0));
      const first = list.find((c) => c.unread > 0); // the list is newest first
      setLatest(first ? { requestId: first.requestId, title: first.title } : null);
    } else setListError(r.message); // shown only while nothing has loaded yet
  }

  async function pollUnread() {
    const r = await actions.unreadCount();
    if (r.ok) { setCount(r.unread); setLatest(r.latestUnread); }
  }

  async function pollConversation() {
    const c = convRef.current;
    if (!c || c.id !== selectedRef.current || c.loading || c.error) return;
    if (++listTicks.current % LIST_EVERY_N_TICKS === 0) void refreshChats();
    const newest = c.messages.at(-1);
    const r = await actions.listMessages(c.id, newest ? { after: cursorOf(newest) } : undefined);
    setNow(new Date());
    if (!r.ok) {
      if (r.code === "FORBIDDEN" || r.code === "NOT_FOUND") patchConv(c.id, (x) => ({ ...x, error: r.message }));
      return;
    }
    // The after-window overlaps what we already have (late commits); only unseen ids are news.
    const have = new Set(c.messages.map((m) => m.id));
    if (!r.messages.some((m) => !have.has(m.id))) return;
    if (selectedRef.current !== c.id) return; // switched away meanwhile: nothing here is shown or read
    const last = r.messages.at(-1)!;
    patchConv(c.id, (x) => ({ ...x, messages: merge(x.messages, r.messages), hasOlder: newest ? x.hasOlder : r.hasOlder }));
    bumpChat(c.id, last);
    noteActivityRef.current();
    void actions.markRead(c.id, last.createdAt).catch(() => undefined);
  }

  // Polls: exactly one is enabled at a time, and none while idle.
  usePoll(pollUnread, 60_000, { enabled: !open && !stopped });
  usePoll(refreshChats, 30_000, { enabled: open && !selectedId && !stopped, immediate: true });
  usePoll(pollConversation, conversationMs, { enabled: open && !!selectedId && !conv?.error && !stopped });
  // Coming back from idle: the list poll runs immediately on its own; the other two need a nudge.
  useEffect(() => {
    resumeRef.current = () => {
      if (!open) void pollUnread().catch(() => undefined);
      else if (selectedId) void pollConversation().catch(() => undefined);
    };
  });

  // Refresh the list every time the dock opens onto a conversation (the list poll covers opening onto the list).
  useEffect(() => {
    if (open && selectedId) void (async () => { await refreshChats(); })(); // async: state is set after the fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  // Load the selected conversation whenever it is (re)shown: a click, or a restored sessionStorage selection.
  useEffect(() => {
    if (!open || !selectedId) return;
    let cancelled = false;
    const id = selectedId;
    void (async () => {
      setConv((c) => (c && c.id === id
        ? { ...c, error: null }
        : { id, messages: [], hasOlder: false, loading: true, loadingOlder: false, error: null }));
      const r = await actions.listMessages(id).catch(() => failed("Couldn't load messages."));
      if (cancelled) return;
      setNow(new Date());
      if (!r.ok) { patchConv(id, (x) => ({ ...x, loading: false, error: r.message })); return; }
      patchConv(id, (x) => ({ ...x, loading: false, messages: r.messages, hasOlder: r.hasOlder }));
      void actions.markRead(id, r.messages.at(-1)?.createdAt).catch(() => undefined);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the dock opens or the selection changes
  }, [open, selectedId]);

  // Escape closes the popup and returns focus to the launcher.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      minimizeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    if (!open) setNow(new Date());
    writeDock({ open: !open, selectedId, collapsed });
  }

  /** Hides the popup (back to the launcher pill) and returns focus to the launcher. */
  function minimize() {
    writeDock({ open: false, selectedId, collapsed });
    launcherRef.current?.focus();
  }

  useEffect(() => { minimizeRef.current = minimize; });

  /** Opens straight into the newest unread chat when there is one; otherwise opens or closes the dock. */
  function launch() {
    if (open || count === 0 || !latest) { toggle(); return; }
    setNow(new Date());
    select(latest.requestId);
  }

  function select(id: string | null) {
    if (id && id === latest?.requestId) setLatest(null);
    if (id) {
      const n = chats?.find((c) => c.requestId === id)?.unread ?? 0;
      if (n > 0) {
        setChats((cur) => cur?.map((c) => (c.requestId === id ? { ...c, unread: 0 } : c)) ?? cur);
        setCount((c) => Math.max(0, c - n));
      }
    }
    writeDock({ open: true, selectedId: id, collapsed: id ? false : collapsed });
  }

  async function loadOlder() {
    const c = conv;
    const oldest = c?.messages[0];
    if (!c || !oldest || c.loadingOlder) return;
    patchConv(c.id, (x) => ({ ...x, loadingOlder: true }));
    const r = await actions.listMessages(c.id, { before: cursorOf(oldest) }).catch(() => failed("Couldn't load messages."));
    patchConv(c.id, (x) => (r.ok
      ? { ...x, loadingOlder: false, messages: merge(x.messages, r.messages), hasOlder: r.hasOlder }
      : { ...x, loadingOlder: false }));
  }

  async function send(body: string): Promise<string | null> {
    const id = conv?.id;
    if (!id) return "Choose a chat first.";
    const r = await actions.send(id, body).catch(() => failed("Couldn't send. Check your connection and try again."));
    if (!r.ok) return r.message;
    noteActivity();
    patchConv(id, (x) => ({ ...x, messages: merge(x.messages, [r.message]) }));
    bumpChat(id, r.message);
    return null;
  }

  /** Collapsing also clears the selection (one write): the collapsed view is "open, list showing", with no conversation poll or read marking. */
  const setCollapsed = (c: boolean) => writeDock({ open, selectedId: c ? null : selectedId, collapsed: c });
  const selected = chats?.find((c) => c.requestId === selectedId) ?? null;
  const pillTitle = count > 0 && latest ? latest.title : null;
  const label = count > 0 ? `Messages, ${count} unread${pillTitle ? `, latest: ${pillTitle}` : ""}` : "Messages";

  return (
    <>
      <button ref={launcherRef} type="button" aria-label={label} title={pillTitle ?? "Messages"} aria-expanded={open} aria-controls={open ? "chat-dock" : undefined}
        onClick={launch}
        className={cn(
          "fixed right-4 bottom-4 z-40 inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 shadow-raised transition-colors hover:bg-surface-muted",
          focusRing,
        )}>
        <span className="relative inline-flex shrink-0 text-link">
          <MessagesSquare aria-hidden="true" strokeWidth={1.75} className="size-5.5" />
          {count > 0 && (
            <span data-badge="" aria-hidden="true" className="absolute -top-2 -right-2 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-semibold text-destructive-foreground ring-2 ring-surface">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
        <RunningText text={pillTitle ?? "Chat"} />
      </button>

      {open && (
        <div id="chat-dock" role="dialog" aria-label="Messages"
          className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface text-foreground md:inset-auto md:right-4 md:bottom-20 md:h-[520px] md:max-h-[calc(100vh-6rem)] md:max-w-[calc(100vw-2rem)] md:rounded-xl md:border md:border-border md:shadow-raised md:transition-[width] md:duration-200 motion-reduce:transition-none",
            collapsed ? "md:w-[300px]" : "md:w-[720px]")}>
          <div className="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-4">
            <p className="text-sm font-semibold">Messages</p>
            <div className="flex items-center gap-1">
              <IconButton aria-label={collapsed ? "Expand messages" : "Collapse to chat list"} size="sm" className="hidden md:inline-flex"
                icon={collapsed ? <PanelRightOpen /> : <PanelRightClose />} onClick={() => setCollapsed(!collapsed)} />
              <IconButton aria-label="Minimize messages" size="sm" icon={<ChevronDown />} onClick={minimize} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <section aria-label="Chats"
              className={cn("min-h-0 w-full flex-col overflow-y-auto border-border bg-background md:flex md:shrink-0 md:border-r", collapsed ? "md:w-full md:border-r-0" : "md:w-64", selectedId ? "hidden" : "flex")}>
              <ChatList chats={chats} error={listError} onRetry={() => { setListError(null); void refreshChats(); }}
                selectedId={selectedId} userId={userId} now={now} onSelect={select} />
            </section>
            <section aria-label="Conversation" className={cn("min-h-0 min-w-0 flex-1 flex-col", collapsed ? "md:hidden" : "md:flex", selectedId ? "flex" : "hidden")}>
              {selectedId && conv && conv.id === selectedId ? (
                <div className="min-h-0 flex-1">
                  <ChatConversation key={conv.id} conv={conv} title={selected?.title ?? null} status={selected?.status ?? null}
                    userId={userId} now={now} onBack={() => select(null)} onLoadOlder={() => void loadOlder()} onSend={send} />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-foreground-secondary">
                  Pick a chat to start messaging.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
