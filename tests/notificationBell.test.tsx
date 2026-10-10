// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { InboxItem } from "@/lib/inbox";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/(app)/notifications/actions", () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

import { NotificationBellView } from "@/components/shell/NotificationBellView";

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  push.mockReset();
});
afterEach(cleanup);

const item = (o: Partial<InboxItem> = {}): InboxItem => ({ id: "n1", type: "COMMENT", message: "Dimas commented on “Poster”", requestId: "r1", readAt: null, createdAt: new Date(), ...o });
const fakeActions = (items: InboxItem[], over: Partial<{ markRead: (id: string) => Promise<{ ok: boolean }> }> = {}) => ({
  list: vi.fn(async () => ({ ok: true as const, items, unread: items.filter((i) => !i.readAt).length })),
  markRead: vi.fn((over.markRead ?? (async () => ({ ok: true }))) as (id: string) => Promise<{ ok: true } | { ok: false }>),
  markAll: vi.fn(async () => ({ ok: true as const })),
});
const bell = () => screen.getByRole("button", { name: /^Notifications/ });
const open = async () => { fireEvent.keyDown(bell(), { key: "Enter" }); return screen.findByRole("menu"); };

describe("NotificationBellView", () => {
  it("labels the unread count and shows a badge", () => {
    render(<NotificationBellView unread={3} actions={fakeActions([])} />);
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 3 unread");
    expect(bell().textContent).toBe("3");
  });
  it("caps the badge at 9+", () => {
    render(<NotificationBellView unread={12} actions={fakeActions([])} />);
    expect(bell().textContent).toBe("9+");
  });
  it("hides the badge at zero", () => {
    render(<NotificationBellView unread={0} actions={fakeActions([])} />);
    expect(bell().getAttribute("aria-label")).toBe("Notifications");
    expect(bell().textContent).toBe("");
  });
  it("opening loads the list; empty shows the caught-up line and disables mark all", async () => {
    const a = fakeActions([]);
    render(<NotificationBellView unread={0} actions={a} />);
    await open();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(a.list).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menuitem", { name: "Mark all as read" }).getAttribute("aria-disabled")).toBe("true");
  });
  it("selecting an item marks it read, opens the request and drops the badge", async () => {
    const a = fakeActions([item()]);
    render(<NotificationBellView unread={1} actions={a} />);
    await open();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Dimas commented/ }));
    expect(a.markRead).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/requests/r1");
    await waitFor(() => expect(bell().textContent).toBe(""));
  });
  it("a failed mark-read restores the badge", async () => {
    const a = fakeActions([item()], { markRead: async () => ({ ok: false, code: "INVALID", message: "x" }) });
    render(<NotificationBellView unread={1} actions={a} />);
    await open();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Dimas commented/ }));
    await waitFor(() => expect(bell().textContent).toBe("1"));
  });
  it("an item without a request only marks read", async () => {
    const a = fakeActions([item({ requestId: null })]);
    render(<NotificationBellView unread={1} actions={a} />);
    await open();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Dimas commented/ }));
    expect(a.markRead).toHaveBeenCalledWith("n1");
    expect(push).not.toHaveBeenCalled();
  });
  it("mark all as read clears the badge", async () => {
    const a = fakeActions([item(), item({ id: "n2" })]);
    render(<NotificationBellView unread={2} actions={a} />);
    await open();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark all as read" }));
    expect(a.markAll).toHaveBeenCalled();
    await waitFor(() => expect(bell().textContent).toBe(""));
  });
  it("long messages wrap inside the dropdown", async () => {
    render(<NotificationBellView unread={1} actions={fakeActions([item({ message: "x".repeat(400) })])} />);
    await open();
    const msg = await screen.findByText("x".repeat(400));
    expect(msg.className).toContain("line-clamp-2");
    expect(msg.className).toContain("break-words");
  });
  it("the footer links to the notifications page", async () => {
    render(<NotificationBellView unread={0} actions={fakeActions([])} />);
    await open();
    expect(screen.getByRole("menuitem", { name: "See all notifications" }).getAttribute("href")).toBe("/notifications");
  });
});
