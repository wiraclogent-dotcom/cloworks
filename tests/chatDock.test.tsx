// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import type { ChatMessage, ChatSummary } from "@/lib/chat";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/requests" }));
vi.mock("@/app/(app)/chat/actions", () => ({
  chatUnreadCount: vi.fn(), listChats: vi.fn(), listMessages: vi.fn(), markChatRead: vi.fn(), sendChatMessage: vi.fn(),
}));

import { ChatDockView, type ChatActions } from "@/components/chat/ChatDockView";

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
    unreadCount: vi.fn(async () => ({ ok: true as const, unread: 0 })),
    listChats: vi.fn(async () => ({ ok: true as const, chats })),
    listMessages: vi.fn(async (): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | Fail> => ({ ok: true, messages, hasOlder: false })),
    markRead: vi.fn(async () => ({ ok: true as const })),
    send: vi.fn(async (_id: string, body: string): Promise<{ ok: true; message: ChatMessage } | Fail> => ({
      ok: true, message: msg({ id: "m2", body, createdAt: at("2026-10-10T04:00:00Z"), author: { id: "me", name: "Wira" } }),
    })),
  } satisfies ChatActions;
}

const launcher = () => screen.getByRole("button", { name: /^Messages/ });
const badge = () => launcher().querySelector("[data-badge]");
/** usePoll runs right away when the tab becomes visible: the way to fire a poll without waiting for its timer. */
const firePoll = () => act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

async function openConversation(a: ReturnType<typeof fakeActions>, unread = 3) {
  render(<ChatDockView unread={unread} userId="me" actions={a} />);
  fireEvent.click(launcher());
  fireEvent.click(await screen.findByRole("button", { name: /Poster/ }));
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
    expect(await screen.findByText("Poster")).toBeTruthy();
    expect(screen.getByText("Banner")).toBeTruthy();
    expect(screen.getByText(/Poster draft is up/)).toBeTruthy();
    expect(screen.getByText(/Need the logo/)).toBeTruthy();
    expect(screen.getByText("Pick a chat to start messaging.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Poster/ }));
    expect(a.listMessages).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(a.markRead).toHaveBeenCalledWith("r1"));
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
    expect(a.markRead).toHaveBeenCalledWith("r1");
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
