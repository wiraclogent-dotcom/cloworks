// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const user = { id: "u1", workspaceId: "w1" };
const chat = vi.hoisted(() => ({
  markChatReadWith: vi.fn(async () => {}),
  listChatsWith: vi.fn(async () => []),
  listMessagesWith: vi.fn(),
}));
const scope = vi.hoisted(() => ({ fail: false }));

vi.mock("@/lib/session", () => ({
  requireUser: async () => user,
  dbFor: () => ({}),
  requireScope: async () => ({ user, db: {} }),
}));
vi.mock("@/lib/chat", () => ({
  ...chat,
  chatUnreadCountWith: vi.fn(async () => { if (scope.fail) throw new Error("db down"); return 4; }),
  latestUnreadChatWith: vi.fn(async () => { if (scope.fail) throw new Error("db down"); return { requestId: "r1", title: "Poster" }; }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/components/chat/ChatDockView", () => ({ ChatDockView: () => null }));

import { listChats, markChatRead } from "@/app/(app)/chat/actions";
import { ChatDock } from "@/components/chat/ChatDock";

beforeEach(() => { vi.clearAllMocks(); scope.fail = false; });

describe("chat actions", () => {
  it("markChatRead passes a valid `at` through", async () => {
    const at = new Date(Date.now() - 60_000);
    await markChatRead("r1", at);
    expect(chat.markChatReadWith).toHaveBeenCalledWith({}, "u1", "r1", at);
  });
  it("markChatRead ignores a missing or invalid `at` (marks up to now)", async () => {
    await markChatRead("r1");
    await markChatRead("r1", new Date("nope"));
    await markChatRead("r1", "2026-10-10" as unknown as Date);
    for (const call of chat.markChatReadWith.mock.calls as unknown[][]) expect(call[3]).toBeUndefined();
  });
  it("markChatRead clamps a future `at` to now", async () => {
    const before = Date.now();
    await markChatRead("r1", new Date(Date.now() + 86_400_000));
    const at = (chat.markChatReadWith.mock.calls[0] as unknown[])[3] as Date;
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });
  it("listChats only accepts a safe positive integer offset", async () => {
    for (const off of [20, 2 ** 60, -5, 1.5, Number.NaN]) await listChats(off);
    expect((chat.listChatsWith.mock.calls as unknown[][]).map((c) => (c[2] as { offset: number }).offset)).toEqual([20, 0, 0, 0, 0]);
  });
});

describe("ChatDock (server)", () => {
  it("passes the unread values through", async () => {
    const el = await ChatDock();
    expect(el.props).toMatchObject({ unread: 4, latestUnread: { requestId: "r1", title: "Poster" }, userId: "u1" });
  });
  it("renders with nothing unread when the queries fail", async () => {
    scope.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = await ChatDock();
    expect(el.props).toMatchObject({ unread: 0, latestUnread: null, userId: "u1" });
    err.mockRestore();
  });
});
