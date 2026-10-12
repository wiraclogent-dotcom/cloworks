// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const createPost = vi.fn();
vi.mock("@/app/(app)/content/actions", () => ({ createPost: (...a: unknown[]) => createPost(...a), createChannel: vi.fn() }));

import { ContentPlanLayout } from "@/components/content/ContentPlanLayout";
import type { ContentPlanView, TileView } from "@/lib/content/view";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const tile = (o: Partial<TileView> & { id: string }): TileView => ({
  status: "IDEA", plannedAt: null, format: "SINGLE", coverUrl: null, warn: false, ...o,
});
const channels = [
  { id: "c1", brandName: "Clogent", handle: "clogent.id", displayName: "Clogent", avatarUrl: null, awaiting: 2 },
  { id: "c2", brandName: "Bubble Wash", handle: "bubblewash", displayName: "Bubble Wash", avatarUrl: null, awaiting: 0 },
];
const can = { draft: true, approve: true, manageChannels: true };
const view = (o: Partial<ContentPlanView> = {}): ContentPlanView => ({
  channels,
  channel: { ...channels[0], bio: "Clean homes", plannedCount: 7, awaiting: 2 },
  planned: [
    tile({ id: "p1", status: "IDEA" }),
    tile({ id: "p2", status: "DRAFT", plannedAt: "2026-10-24", format: "CAROUSEL" }),
    tile({ id: "p3", status: "SUBMITTED", plannedAt: "2026-10-22", warn: true }),
    tile({ id: "p4", status: "CHANGES_REQUESTED" }),
    tile({ id: "p5", status: "APPROVED" }),
    tile({ id: "p6", status: "IN_PRODUCTION", format: "VIDEO" }),
    tile({ id: "p7", status: "DONE" }),
  ],
  published: [tile({ id: "x1" })],
  can,
  mediaReady: true,
  ...o,
});
const show = (v: ContentPlanView, tab: "feed" | "reels" | "stories" = "feed") =>
  render(<ContentPlanLayout view={v} tab={tab} postId={null} brands={[{ id: "b1", name: "Clogent" }]} />);

describe("Content Plan page", () => {
  it("shows the channel list grouped by brand with awaiting counts", () => {
    show(view());
    const list = screen.getByRole("navigation", { name: "Channels" });
    const link = within(list).getByRole("link", { name: /@clogent\.id/ });
    expect(link.getAttribute("href")).toBe("/content?channel=c1");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(within(list).getByText("Bubble Wash", { selector: "h3" })).toBeTruthy();
    expect(within(link).getByText("2")).toBeTruthy();
  });

  it("shows the profile header and three tabs", () => {
    show(view());
    expect(screen.getByRole("heading", { name: "@clogent.id" })).toBeTruthy();
    expect(screen.getByText("Clean homes")).toBeTruthy();
    expect(screen.getByText("7 planned · 2 awaiting approval")).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: "Surface" })).getAllByRole("link");
    expect(tabs.map((t) => t.textContent)).toEqual(["Feed", "Reels", "Stories"]);
    expect(tabs[0].getAttribute("aria-current")).toBe("page");
    expect(tabs[1].getAttribute("href")).toBe("/content?channel=c1&tab=reels");
  });

  it("shows a badge per status, the warning, and the already-posted divider", () => {
    show(view());
    for (const label of ["Idea", "Draft", "Submitted", "Changes requested", "Approved", "In production", "Done"]) {
      expect(screen.getByText(label, { selector: "[data-badge]" })).toBeTruthy();
    }
    expect(screen.getAllByLabelText("Date out of order")).toHaveLength(1);
    expect(screen.getByText("Already posted", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("24 Oct")).toBeTruthy();
  });

  it("tiles link to the post and keep the channel and tab", () => {
    show(view(), "reels");
    const a = screen.getAllByRole("link").find((l) => l.getAttribute("href")?.includes("post=p2"))!;
    expect(a.getAttribute("href")).toBe("/content?channel=c1&tab=reels&post=p2");
  });

  it("drafters get the + tile, which creates a post and opens it", async () => {
    createPost.mockResolvedValue({ ok: true, id: "new1" });
    show(view(), "stories");
    fireEvent.click(screen.getByRole("button", { name: "New post" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/content?channel=c1&tab=stories&post=new1"));
    expect(createPost).toHaveBeenCalledWith({ channelId: "c1", surface: "STORY", kind: "PLANNED" });
    expect(screen.getByRole("button", { name: /Already posted/ })).toBeTruthy();
  });

  it("a requester gets no + tile and no already-posted button", () => {
    show(view({ can: { draft: false, approve: false, manageChannels: false } }));
    expect(screen.queryByRole("button", { name: "New post" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Already posted/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Channel/ })).toBeNull();
  });

  it("empty state invites leads to add a channel", () => {
    show(view({ channels: [], channel: null, planned: [], published: [] }));
    expect(screen.getByText("Add your first channel")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add channel/ })).toBeTruthy();
  });

  it("empty state for everyone else", () => {
    show(view({ channels: [], channel: null, planned: [], published: [], can: { draft: true, approve: false, manageChannels: false } }));
    expect(screen.getByText("No channels yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add channel/ })).toBeNull();
  });
});
