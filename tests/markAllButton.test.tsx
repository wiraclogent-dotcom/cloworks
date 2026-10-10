// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const markAll = vi.fn();
vi.mock("@/app/(app)/notifications/actions", () => ({ markAllNotificationsRead: (...a: unknown[]) => markAll(...a) }));

import { MarkAllButton } from "@/app/(app)/notifications/MarkAllButton";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";

beforeEach(() => { refresh.mockReset(); markAll.mockReset(); });
afterEach(cleanup);

describe("MarkAllButton", () => {
  it("refreshes the list after marking everything read", async () => {
    markAll.mockResolvedValue({ ok: true });
    render(<MarkAllButton disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Regression: a refused result was ignored and a thrown one crashed the page to the error screen.
  it("says why when the server refuses", async () => {
    markAll.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", message: "Your session has ended. Sign in again." });
    render(<MarkAllButton disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/session has ended/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when the request fails, instead of crashing the page", async () => {
    markAll.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<MarkAllButton disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect((await screen.findByRole("alert")).textContent).toBe(ACTION_FAILED_MESSAGE);
  });
});
