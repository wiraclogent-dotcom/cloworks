// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const actions = vi.hoisted(() => ({ createChannel: vi.fn(), updateChannel: vi.fn(), moveChannel: vi.fn(), deleteChannel: vi.fn() }));
vi.mock("@/app/(app)/content/actions", () => Object.fromEntries(
  Object.keys(actions).map((k) => [k, (...a: unknown[]) => actions[k as keyof typeof actions](...a)]),
));
// The real uploader talks to Cloudinary; here it just reports one uploaded image when clicked.
vi.mock("@/components/media/MediaUpload", () => ({
  MediaUpload: (p: { purpose: string; accept: string; onUploaded: (m: { id: string; url: string; type: "IMAGE" }) => void }) => (
    <button type="button" data-purpose={p.purpose} data-accept={p.accept} onClick={() => p.onUploaded({ id: "m9", url: "https://img/new.jpg", type: "IMAGE" })}>
      Upload avatar
    </button>
  ),
}));

import { ChannelList } from "@/components/content/ChannelList";
import type { ChannelSummary } from "@/lib/content/view";

// jsdom has no showModal on <dialog>.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

const ch = (o: Partial<ChannelSummary> & { id: string }): ChannelSummary => ({
  brandId: "b1", brandName: "Clogent", handle: o.id, displayName: o.id, bio: null, avatarMediaId: null, avatarUrl: null, awaiting: 0, ...o,
});
// List order (top first): c1, c2, c3. c1 and c3 share a brand, so they are one group and c2 is alone.
const channels = [
  ch({ id: "c1", handle: "clogent.id", displayName: "Clogent", bio: "Clean homes", avatarMediaId: "m1", avatarUrl: "https://img/old.jpg" }),
  ch({ id: "c2", brandId: "b2", brandName: "Bubble Wash", handle: "bubblewash", displayName: "Bubble Wash" }),
  ch({ id: "c3", handle: "clogent.promo", displayName: "Clogent Promo" }),
];
const brands = [{ id: "b1", name: "Clogent" }, { id: "b2", name: "Bubble Wash" }];
const show = (canManage = true) => render(<ChannelList channels={channels} currentId="c1" tab="feed" canManage={canManage} brands={brands} />);
const nav = () => within(screen.getByRole("navigation", { name: "Channels" }));
const open = (handle: string) => fireEvent.click(nav().getByRole("button", { name: `Manage @${handle}` }));

describe("channel management", () => {
  it("shows no manage controls to anyone who cannot manage channels", () => {
    show(false);
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();
  });

  it("Edit opens the form pre-filled (brand, handle, name, bio) and saves with updateChannel", async () => {
    actions.updateChannel.mockResolvedValue({ ok: true });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit channel" });
    expect((within(dialog).getByLabelText("Brand") as HTMLSelectElement).value).toBe("b1");
    expect((within(dialog).getByLabelText("Instagram handle") as HTMLInputElement).value).toBe("clogent.id");
    expect((within(dialog).getByLabelText("Display name") as HTMLInputElement).value).toBe("Clogent");
    expect((within(dialog).getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Clean homes");
    fireEvent.change(within(dialog).getByLabelText("Display name"), { target: { value: "Clogent ID" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    // Untouched avatar keeps its media id (the action would clear it if omitted).
    await waitFor(() => expect(actions.updateChannel).toHaveBeenCalledWith("c1", { brandId: "b1", handle: "clogent.id", displayName: "Clogent ID", bio: "Clean homes", avatarMediaId: "m1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("the avatar picker (images only, content purpose) replaces the avatar", async () => {
    actions.updateChannel.mockResolvedValue({ ok: true });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit channel" });
    const picker = within(dialog).getByRole("button", { name: "Upload avatar" });
    expect(picker.getAttribute("data-purpose")).toBe("content");
    expect(picker.getAttribute("data-accept")).toBe("image");
    fireEvent.click(picker);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.updateChannel).toHaveBeenLastCalledWith("c1", expect.objectContaining({ avatarMediaId: "m9" })));
  });

  it("Remove avatar saves a null avatar", async () => {
    actions.updateChannel.mockResolvedValue({ ok: true });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit channel" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove avatar" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.updateChannel).toHaveBeenCalledWith("c1", expect.objectContaining({ avatarMediaId: null })));
  });

  it("shows field errors from updateChannel and stays open", async () => {
    actions.updateChannel.mockResolvedValue({ ok: false, code: "INVALID", message: "That handle is already used.", fieldErrors: { handle: "That handle is already used" } });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Edit" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That handle is already used")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("the create form has the avatar picker and sends the uploaded media id", async () => {
    actions.createChannel.mockResolvedValue({ ok: true, id: "new" });
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "Channel" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add channel" });
    fireEvent.change(within(dialog).getByLabelText("Instagram handle"), { target: { value: "@fresh" } });
    fireEvent.change(within(dialog).getByLabelText("Display name"), { target: { value: "Fresh" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload avatar" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(actions.createChannel).toHaveBeenCalledWith({ brandId: "b1", handle: "@fresh", displayName: "Fresh", bio: "", avatarMediaId: "m9" }));
  });

  it("Move up / Move down call moveChannel with the neighbours the move lands between", async () => {
    actions.moveChannel.mockResolvedValue({ ok: true });
    show();
    // c3 moves above its brand-mate c1, which is the top of the list.
    open("clogent.promo");
    fireEvent.click(nav().getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(actions.moveChannel).toHaveBeenCalledWith("c3", null, "c1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // c1 moves below c3 (its brand-mate), which is the bottom of the list.
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Move down" }));
    await waitFor(() => expect(actions.moveChannel).toHaveBeenLastCalledWith("c1", "c3", null));
  });

  it("disables Move up at the top of a brand group and Move down at the bottom", () => {
    show();
    open("clogent.id");
    expect((nav().getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((nav().getByRole("button", { name: "Move down" }) as HTMLButtonElement).disabled).toBe(false);
    open("bubblewash"); // a one-channel brand group: nowhere to go either way
    expect((nav().getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((nav().getByRole("button", { name: "Move down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Delete asks first, then calls deleteChannel and refreshes", async () => {
    actions.deleteChannel.mockResolvedValue({ ok: true });
    show();
    open("clogent.promo");
    fireEvent.click(nav().getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete @clogent.promo?" });
    expect(actions.deleteChannel).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(actions.deleteChannel).toHaveBeenCalledWith("c3"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the server's message when delete is blocked, and keeps the dialog open", async () => {
    actions.deleteChannel.mockResolvedValue({ ok: false, code: "INVALID", message: "This channel has approved posts and cannot be deleted." });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This channel has approved posts and cannot be deleted.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("deleting the open channel goes back to the default channel", async () => {
    actions.deleteChannel.mockResolvedValue({ ok: true });
    show();
    open("clogent.id");
    fireEvent.click(nav().getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/content"));
  });
});
