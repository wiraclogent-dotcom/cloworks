// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
const movePost = vi.fn();
vi.mock("@/app/(app)/content/actions", () => ({
  movePost: (...a: unknown[]) => movePost(...a), createPost: vi.fn(),
}));

import { PhonePreview } from "@/components/content/PhonePreview";
import type { ChannelView, TileView } from "@/lib/content/view";

beforeEach(() => { movePost.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

const channel: ChannelView = { id: "c1", brandId: "b1", brandName: "Clogent", handle: "clogent.id", displayName: "Clogent", bio: null, avatarUrl: null, plannedCount: 5, awaiting: 0 };
const tile = (o: Partial<TileView> & { id: string }): TileView => ({ status: "DRAFT", plannedAt: null, format: "SINGLE", coverUrl: null, warn: false, ...o });
const planned = [
  tile({ id: "p1", status: "IDEA" }),
  tile({ id: "p2", status: "DRAFT", plannedAt: "2026-10-24" }),
  tile({ id: "p3", status: "SUBMITTED", plannedAt: "2026-10-25" }),
  tile({ id: "p4", status: "CHANGES_REQUESTED" }),
  tile({ id: "p5", status: "APPROVED" }),
];
const show = (canDraft = true) =>
  render(<PhonePreview channel={channel} tab="feed" planned={planned} published={[]} canDraft={canDraft} selectedId={null} />);
const order = () => [...document.querySelectorAll("[data-tile]")].map((e) => e.getAttribute("data-tile"));
const cell = (id: string) => document.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
const handleOf = (id: string) => cell(id).querySelector<HTMLElement>("button[aria-roledescription]")!;

/** Keyboard drag the way a user does it: Space on the handle, the arrow keys, Space (or Escape) to finish. */
async function keyboardMove(id: string, keys: string[], drop = "Space") {
  const handle = handleOf(id);
  handle.focus();
  act(() => { fireEvent.keyDown(handle, { code: "Space", key: " " }); });
  // dnd-kit attaches its document keydown listener on the next tick.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  for (const code of keys) act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { code, key: code }); });
  act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { code: drop, key: drop === "Space" ? " " : drop }); });
}

describe("planned tile reordering", () => {
  it("only editable planned tiles have a drag handle, and only for drafters", () => {
    show();
    expect(handleOf("p1")).toBeTruthy();
    expect(handleOf("p2")).toBeTruthy();
    expect(handleOf("p4")).toBeTruthy();
    expect(cell("p3").querySelector("button")).toBeNull(); // SUBMITTED
    expect(cell("p5").querySelector("button")).toBeNull(); // APPROVED
    cleanup();
    show(false);
    expect(document.querySelectorAll("button[aria-roledescription]").length).toBe(0);
  });

  it("Space, ArrowDown, Space moves the tile one row down and calls movePost with the new neighbours", async () => {
    movePost.mockResolvedValue({ ok: true });
    show();
    await keyboardMove("p1", ["ArrowDown"]);
    await waitFor(() => expect(movePost).toHaveBeenCalledWith("p1", "p4", "p5"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(order()).toEqual(["p2", "p3", "p4", "p1", "p5"]);
  });

  it("moving to the very top sends a null above neighbour", async () => {
    movePost.mockResolvedValue({ ok: true });
    show();
    await keyboardMove("p4", ["ArrowUp"]);
    await waitFor(() => expect(movePost).toHaveBeenCalledWith("p4", null, "p1"));
  });

  it("Escape cancels without calling movePost", async () => {
    show();
    await keyboardMove("p1", ["ArrowRight"], "Escape");
    expect(movePost).not.toHaveBeenCalled();
    expect(order()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("rolls the order back and shows the server's message when the move fails", async () => {
    movePost.mockResolvedValue({ ok: false, code: "CONFLICT", message: "This post changed in the meantime." });
    show();
    await keyboardMove("p1", ["ArrowRight"]);
    expect((await screen.findByRole("alert")).textContent).toContain("This post changed in the meantime.");
    expect(order()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(refresh).not.toHaveBeenCalled();
  });
});
