// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import type { ChatMessage, ChatSummary } from "@/lib/chat";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/requests" }));
vi.mock("@/app/(app)/chat/actions", () => ({
  chatUnreadCount: vi.fn(), listChats: vi.fn(), listMessages: vi.fn(), markChatRead: vi.fn(), sendChatMessage: vi.fn(),
}));

import { ACTIVE_WINDOW_MS, ChatDockView, IDLE_STOP_MS, SLOW_CONVERSATION_MS, type ChatActions } from "@/components/chat/ChatDockView";

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(cleanup);

const at = (iso: string) => new Date(iso);
const msg = (o: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1", body: "Poster draft is up", createdAt: at("2026-10-10T03:00:00Z"), author: { id: "u2", name: "Dimas" }, ...o,
});
const chat = (o: Partial<ChatSummary> = {}): ChatSummary => ({
  requestId: "r1", title: "Poster", status: "ON_PROGRESS",
  lastMessage: { body: "Poster draft is up", authorId: "u2", authorName: "Dimas", createdAt: at("2026-10-10T03:00:00Z") },
  unread: 2, ...o,
});

type Fail = { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNAUTHENTICATED"; message: string };
function fakeActions(chats: ChatSummary[], messages: ChatMessage[] = [msg()]) {
  return {
    unreadCount: vi.fn(async (): Promise<{ ok: true; unread: number; latestUnread: { requestId: string; title: string } | null } | Fail> => ({ ok: true, unread: 0, latestUnread: null })),
    listChats: vi.fn(async () => ({ ok: true as const, chats })),
    listMessages: vi.fn(async (): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | Fail> => ({ ok: true, messages, hasOlder: false })),
    markRead: vi.fn(async () => ({ ok: true as const })),
    send: vi.fn(async (_id: string, body: string): Promise<{ ok: true; message: ChatMessage } | Fail> => ({
      ok: true, message: msg({ id: "m2", body, createdAt: at("2026-10-10T04:00:00Z"), author: { id: "me", name: "Wira" } }),
    })),
  } satisfies ChatActions;
}

const launcher = () => screen.getByRole("button", { name: /^Messages/ });
/** The chat list inside the open dock (the launcher can show a request title too). */
const chatList = async () => within(await screen.findByRole("region", { name: "Chats" }));
const badge = () => launcher().querySelector("[data-badge]");
/** usePoll runs right away when the tab becomes visible: the way to fire a poll without waiting for its timer. */
const firePoll = () => act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

async function openConversation(a: ReturnType<typeof fakeActions>, unread = 3) {
  render(<ChatDockView unread={unread} userId="me" actions={a} />);
  fireEvent.click(launcher());
  fireEvent.click(await (await chatList()).findByRole("button", { name: /Poster/ }));
  await screen.findByText("Poster draft is up", { selector: "p" });
  return screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
}

describe("ChatDockView", () => {
  it("shows no badge at zero", () => {
    render(<ChatDockView unread={0} userId="me" actions={fakeActions([])} />);
    expect(launcher().getAttribute("aria-label")).toBe("Messages");
    expect(badge()).toBeNull();
  });
  it("labels and badges the unread count", () => {
    render(<ChatDockView unread={3} userId="me" actions={fakeActions([])} />);
    expect(launcher().getAttribute("aria-label")).toBe("Messages, 3 unread");
    expect(badge()?.textContent).toBe("3");
  });
  it("caps the badge at 9+", () => {
    render(<ChatDockView unread={12} userId="me" actions={fakeActions([])} />);
    expect(badge()?.textContent).toBe("9+");
  });

  it("pill reads Chat when nothing is unread", () => {
    render(<ChatDockView unread={0} latestUnread={null} userId="me" actions={fakeActions([])} />);
    expect(launcher().querySelector("[data-pill-text]")?.textContent).toBe("Chat");
  });
  it("pill shows the latest unread request title and names it in the label", () => {
    render(<ChatDockView unread={2} latestUnread={{ requestId: "r1", title: "POSTER | TWINDATE 10.10" }} userId="me" actions={fakeActions([])} />);
    expect(launcher().querySelector("[data-pill-text]")?.textContent).toBe("POSTER | TWINDATE 10.10");
    expect(launcher().getAttribute("aria-label")).toBe("Messages, 2 unread, latest: POSTER | TWINDATE 10.10");
    expect(launcher().getAttribute("title")).toBe("POSTER | TWINDATE 10.10");
  });
  it("the pill text box has a fixed width", () => {
    render(<ChatDockView unread={0} latestUnread={null} userId="me" actions={fakeActions([])} />);
    expect(launcher().querySelector("[data-pill-box]")?.className).toContain("w-40");
  });
  it("clicking the pill opens straight into the latest unread chat", async () => {
    const a = fakeActions([chat()]);
    render(<ChatDockView unread={2} latestUnread={{ requestId: "r1", title: "POSTER | TWINDATE 10.10" }} userId="me" actions={a} />);
    fireEvent.click(launcher());
    expect(await screen.findByRole("dialog", { name: "Messages" })).toBeTruthy();
    await waitFor(() => expect(a.listMessages).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Poster draft is up", { selector: "p" })).toBeTruthy();
    // The list (loaded for the header) still counts r1 as unread, but it is the chat being read.
    await waitFor(() => expect(a.listChats).toHaveBeenCalled());
    await waitFor(() => expect(badge()).toBeNull());
    expect(launcher().querySelector("[data-pill-text]")?.textContent).toBe("Chat");
  });
  it("a closed poll updates the pill title", async () => {
    const a = fakeActions([]);
    a.unreadCount.mockResolvedValueOnce({ ok: true, unread: 1, latestUnread: { requestId: "r9", title: "Banner" } });
    render(<ChatDockView unread={0} latestUnread={null} userId="me" actions={a} />);
    await firePoll();
    await waitFor(() => expect(launcher().querySelector("[data-pill-text]")?.textContent).toBe("Banner"));
  });

  it("opening with no chats shows the empty state", async () => {
    const a = fakeActions([]);
    render(<ChatDockView unread={0} userId="me" actions={a} />);
    fireEvent.click(launcher());
    expect(await screen.findByText("No chats yet. Comment on a request to start one.")).toBeTruthy();
    expect(a.listChats).toHaveBeenCalledTimes(1);
  });

  it("lists chats; opening one loads its messages, marks it read and drops the badge", async () => {
    const a = fakeActions([
      chat(),
      chat({ requestId: "r2", title: "Banner", unread: 1, lastMessage: { body: "Need the logo", authorId: "u3", authorName: "Sari", createdAt: at("2026-10-09T03:00:00Z") } }),
    ]);
    render(<ChatDockView unread={3} userId="me" actions={a} />);
    fireEvent.click(launcher());
    const list = await chatList();
    expect(await list.findByText("Poster")).toBeTruthy();
    expect(list.getByText("Banner")).toBeTruthy();
    expect(screen.getByText(/Poster draft is up/)).toBeTruthy();
    expect(screen.getByText(/Need the logo/)).toBeTruthy();
    expect(screen.getByText("Pick a chat to start messaging.")).toBeTruthy();

    fireEvent.click(list.getByRole("button", { name: /Poster/ }));
    expect(a.listMessages).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(a.markRead).toHaveBeenCalledWith("r1", msg().createdAt));
    expect(await screen.findByText("Poster draft is up", { selector: "p" })).toBeTruthy();
    expect(badge()?.textContent).toBe("1");
    expect(screen.getByRole("link", { name: "Open request" }).getAttribute("href")).toBe("/requests/r1");
  });

  it("sending appends one bubble and clears the box; a poll with the same id does not duplicate it", async () => {
    const a = fakeActions([chat()]);
    const box = await openConversation(a);
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(a.send).toHaveBeenCalledWith("r1", "hi"));
    expect(await screen.findByText("hi", { selector: "p" })).toBeTruthy();
    await waitFor(() => expect(box.value).toBe(""));

    const sent = msg({ id: "m2", body: "hi", createdAt: at("2026-10-10T04:00:00Z"), author: { id: "me", name: "Wira" } });
    a.listMessages.mockResolvedValueOnce({ ok: true, messages: [sent], hasOlder: false });
    await firePoll();
    await waitFor(() => expect(a.listMessages).toHaveBeenLastCalledWith("r1", { after: { at: sent.createdAt, id: "m2" } }));
    expect(screen.getAllByText("hi", { selector: "p" })).toHaveLength(1);
  });

  it("a poll with new messages appends them and marks the chat read", async () => {
    const a = fakeActions([chat()]);
    await openConversation(a);
    a.markRead.mockClear();
    a.listMessages.mockResolvedValueOnce({ ok: true, messages: [msg({ id: "m3", body: "New one", createdAt: at("2026-10-10T05:00:00Z") })], hasOlder: false });
    await firePoll();
    expect(await screen.findByText("New one", { selector: "p" })).toBeTruthy();
    expect(a.markRead).toHaveBeenCalledWith("r1", at("2026-10-10T05:00:00Z"));
  });

  it("a poll that only repeats known messages (the overlap window) does not mark read again", async () => {
    const a = fakeActions([chat()]);
    await openConversation(a);
    a.markRead.mockClear();
    await firePoll();
    await waitFor(() => expect(a.listMessages).toHaveBeenLastCalledWith("r1", { after: { at: msg().createdAt, id: "m1" } }));
    expect(a.markRead).not.toHaveBeenCalled();
    expect(screen.getAllByText("Poster draft is up", { selector: "p" })).toHaveLength(1);
  });

  it("a poll result for a chat no longer selected is not marked read", async () => {
    const a = fakeActions([chat()]);
    await openConversation(a);
    a.markRead.mockClear();
    let answer!: (v: { ok: true; messages: ChatMessage[]; hasOlder: boolean }) => void;
    a.listMessages.mockImplementationOnce(() => new Promise((res) => { answer = res; }));
    await firePoll();
    fireEvent.click(screen.getByRole("button", { name: "Back to chats" }));
    await act(async () => { answer({ ok: true, messages: [msg({ id: "m3", body: "Late", createdAt: at("2026-10-10T05:00:00Z") })], hasOlder: false }); });
    expect(a.markRead).not.toHaveBeenCalledWith("r1", expect.anything());
  });

  it("reopening the dock on a conversation refreshes the chat list", async () => {
    const a = fakeActions([chat()]);
    await openConversation(a, 0);
    const before = a.listChats.mock.calls.length;
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(launcher());
    await waitFor(() => expect(a.listChats.mock.calls.length).toBe(before + 1));
  });

  it("a failed first list load shows an alert with Retry instead of the empty state", async () => {
    const a = fakeActions([chat()]);
    a.listChats.mockResolvedValueOnce({ ok: false, code: "INVALID", message: "Couldn't load chats." } as never);
    render(<ChatDockView unread={0} userId="me" actions={a} />);
    fireEvent.click(launcher());
    const list = await chatList();
    expect((await list.findByRole("alert")).textContent).toContain("Couldn't load chats.");
    expect(screen.queryByText("No chats yet. Comment on a request to start one.")).toBeNull();
    fireEvent.click(list.getByRole("button", { name: "Retry" }));
    expect(await list.findByRole("button", { name: /Poster/ })).toBeTruthy();
    expect(list.queryByRole("alert")).toBeNull();
  });

  it("a failed send keeps the text and shows the error in an alert", async () => {
    const a = fakeActions([chat()]);
    a.send.mockResolvedValueOnce({ ok: false, code: "INVALID", message: "Message is too long." });
    const box = await openConversation(a);
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Message is too long.");
    expect(box.value).toBe("hi");
  });

  it("Shift+Enter does not send, and Send is disabled while blank", async () => {
    const a = fakeActions([chat()]);
    const box = await openConversation(a);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(a.send).not.toHaveBeenCalled();
  });

  it("a poll answering NOT_FOUND replaces the conversation with its message", async () => {
    const a = fakeActions([chat()]);
    await openConversation(a);
    a.listMessages.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Request not found." });
    await firePoll();
    expect((await screen.findByRole("alert")).textContent).toBe("Request not found.");
    expect(screen.queryByText("Poster draft is up", { selector: "p" })).toBeNull();
  });

  it("bubbles wrap long text", async () => {
    await openConversation(fakeActions([chat()]));
    const bubble = screen.getByText("Poster draft is up", { selector: "p" });
    expect(bubble.className).toContain("whitespace-pre-wrap");
    expect(bubble.className).toContain("break-words");
  });

  it("load older prepends with a before cursor", async () => {
    const a = fakeActions([chat()]);
    a.listMessages.mockResolvedValueOnce({ ok: true, messages: [msg()], hasOlder: true });
    await openConversation(a);
    a.listMessages.mockResolvedValueOnce({ ok: true, messages: [msg({ id: "m0", body: "Earlier", createdAt: at("2026-10-10T02:00:00Z") })], hasOlder: false });
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(await screen.findByText("Earlier", { selector: "p" })).toBeTruthy();
    expect(a.listMessages).toHaveBeenLastCalledWith("r1", { before: { at: msg().createdAt, id: "m1" } });
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  });

  it("Escape closes the popup and the open state persists in sessionStorage", async () => {
    render(<ChatDockView unread={0} userId="me" actions={fakeActions([])} />);
    fireEvent.click(launcher());
    expect(await screen.findByRole("dialog", { name: "Messages" })).toBeTruthy();
    expect(JSON.parse(window.sessionStorage.getItem("chat-dock") ?? "{}").open).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(window.sessionStorage.getItem("chat-dock") ?? "{}").open).toBe(false);
  });
});

describe("ChatDockView idle backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.setItem("chat-dock", JSON.stringify({ open: true, selectedId: "r1" }));
  });
  afterEach(() => { vi.useRealTimers(); });

  /** Advances fake time in act, in steps no longer than the idle clock so each re-evaluation renders. */
  const tick = async (ms: number) => {
    for (let left = ms; left > 0; left -= 30_000)
      await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(left, 30_000)); });
  };
  const mountOpenConversation = async () => {
    const a = fakeActions([chat()]);
    render(<ChatDockView unread={0} userId="me" actions={a} />);
    await tick(0.001);
    expect(screen.getByText("Poster draft is up", { selector: "p" })).toBeTruthy();
    return a;
  };

  it("polls the open conversation every 5 s while active, every 30 s after 2 minutes idle", async () => {
    const a = await mountOpenConversation();
    a.listMessages.mockClear();
    await tick(10_000);
    expect(a.listMessages).toHaveBeenCalledTimes(2);
    await tick(ACTIVE_WINDOW_MS - 10_000);
    a.listMessages.mockClear();
    await tick(SLOW_CONVERSATION_MS - 1_000);
    expect(a.listMessages).not.toHaveBeenCalled();
    await tick(1_000);
    expect(a.listMessages).toHaveBeenCalledTimes(1);
  });

  it("stops every poll after 15 minutes idle; a keydown resumes with an immediate call", async () => {
    const a = await mountOpenConversation();
    await tick(IDLE_STOP_MS);
    a.listMessages.mockClear(); a.listChats.mockClear(); a.unreadCount.mockClear();
    await tick(600_000);
    expect(a.listMessages).not.toHaveBeenCalled();
    expect(a.listChats).not.toHaveBeenCalled();
    expect(a.unreadCount).not.toHaveBeenCalled();

    await act(async () => { fireEvent.keyDown(window, { key: "a" }); });
    expect(a.listMessages).toHaveBeenCalledTimes(1);
    await tick(5_000);
    expect(a.listMessages).toHaveBeenCalledTimes(2);
  });

  it("activity keeps the conversation poll fast", async () => {
    const a = await mountOpenConversation();
    await tick(90_000);
    fireEvent.pointerDown(window);
    await tick(60_000); // 150 s since mount, 60 s since activity
    a.listMessages.mockClear();
    await tick(10_000);
    expect(a.listMessages).toHaveBeenCalledTimes(2);
  });

  it("refreshes the chat list on every 6th conversation poll", async () => {
    const a = await mountOpenConversation();
    a.listChats.mockClear();
    await tick(25_000);
    expect(a.listChats).not.toHaveBeenCalled();
    await tick(5_000);
    expect(a.listChats).toHaveBeenCalledTimes(1);
  });
});
