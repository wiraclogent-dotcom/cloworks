// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { InboxItem } from "@/lib/inbox";

const push = vi.fn(), refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/session", () => ({ requireScope: async () => ({ user: { id: "u1", appRole: "REQUESTER", workspaceId: "clogent" }, db: {} }) }));
const markNotificationRead = vi.fn<(id: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
const markAllNotificationsRead = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/(app)/notifications/actions", () => ({ markNotificationRead: (id: string) => markNotificationRead(id), markAllNotificationsRead: () => markAllNotificationsRead(), listNotifications: vi.fn() }));

let total = 0, unread = 0;
const list = vi.fn();
vi.mock("@/lib/inbox", () => ({
  countNotificationsWith: async () => total,
  unreadCountWith: async () => unread,
  listNotificationsWith: (...a: unknown[]) => list(...a),
}));

import { NotificationsContent } from "@/app/(app)/notifications/NotificationsContent";

const rows = (n: number, from = 0): InboxItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `n${from + i}`, type: "COMMENT", message: `Message ${from + i}`, requestId: `r${from + i}`, readAt: null, createdAt: new Date() }));
const page = async (q: Record<string, string> = {}) => render(await NotificationsContent({ searchParams: Promise.resolve(q) }));

beforeEach(() => {
  list.mockImplementation(async (_db: unknown, _u: string, o: { limit: number; offset: number }) => rows(Math.max(0, Math.min(o.limit, total - o.offset)), o.offset));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("notifications page", () => {
  it("shows the first 50 with the range text", async () => {
    total = 60; unread = 60;
    await page();
    expect(list).toHaveBeenCalledWith({}, "u1", { limit: 50, offset: 0 });
    expect(screen.getByText("Showing 1–50 of 60")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Message/ })).toHaveLength(50);
  });
  it("clamps an out-of-range page to the last one", async () => {
    total = 60; unread = 0;
    await page({ page: "999" });
    expect(screen.getByText("Showing 51–60 of 60")).toBeTruthy();
  });
  it("treats a junk page as page 1", async () => {
    total = 60; unread = 0;
    await page({ page: "abc" });
    expect(screen.getByText("Showing 1–50 of 60")).toBeTruthy();
  });
  it("shows the empty state and disables mark all", async () => {
    total = 0; unread = 0;
    await page();
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Mark all as read" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("selecting a row marks it read and opens the request", async () => {
    total = 1; unread = 1;
    await page();
    fireEvent.click(screen.getByRole("button", { name: /Message 0/ }));
    expect(push).toHaveBeenCalledWith("/requests/r0");
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("n0"));
  });
  it("mark all as read calls the action and refreshes", async () => {
    total = 2; unread = 2;
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(markAllNotificationsRead).toHaveBeenCalled();
  });
});
