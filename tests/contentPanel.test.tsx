// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const actions = vi.hoisted(() => ({
  updatePost: vi.fn(), setPostMedia: vi.fn(), submitPost: vi.fn(), sendBackPost: vi.fn(), deletePost: vi.fn(),
  addContentComment: vi.fn(), loadApprove: vi.fn(), approvePost: vi.fn(), requestUploadSignature: vi.fn(), registerUpload: vi.fn(),
}));
vi.mock("@/app/(app)/content/actions", () => Object.fromEntries(
  Object.keys(actions).map((k) => [k, (...a: unknown[]) => actions[k as keyof typeof actions](...a)]),
));

import { PostPanel } from "@/components/content/PostPanel";
import type { PostPanelView } from "@/lib/content/panelView";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const NO = { edit: false, submit: false, approve: false, comment: true, delete: false, addFinal: false };
const panel = (o: Omit<Partial<PostPanelView>, "post"> & { post?: Partial<PostPanelView["post"]> } = {}): PostPanelView => ({
  mockups: [], finals: [], comments: [], types: [{ id: "t1", name: "Social media post" }], warnDate: null, mediaReady: true,
  can: NO,
  ...o,
  post: {
    id: "p1", channelId: "c1", status: "DRAFT", kind: "PLANNED", surface: "FEED", format: "SINGLE", plannedAt: "2026-10-24", publishedAt: null,
    brief: "Promo", caption: "", typeId: null, author: { id: "u1", name: "Dina" }, submittedAt: null, request: null,
    ...o.post,
  },
});
const show = (v: PostPanelView) => render(<PostPanel view={v} closeHref="/content?channel=c1" />);

describe("PostPanel", () => {
  it("autosaves a drafter's edits once after the debounce, submits and shows field errors", async () => {
    vi.useFakeTimers();
    actions.updatePost.mockResolvedValue({ ok: true, status: "DRAFT" });
    show(panel({ can: { ...NO, edit: true, submit: true } }));
    const brief = screen.getByLabelText("Brief") as HTMLTextAreaElement;
    expect(brief.readOnly).toBe(false);
    fireEvent.change(brief, { target: { value: "Promo 11.11" } });
    fireEvent.change(brief, { target: { value: "Promo 11.11, 3 slides" } });
    await act(async () => { vi.advanceTimersByTime(799); });
    expect(actions.updatePost).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(actions.updatePost).toHaveBeenCalledTimes(1);
    expect(actions.updatePost).toHaveBeenCalledWith("p1", { brief: "Promo 11.11, 3 slides" });
    expect(screen.getByText("Saved")).toBeTruthy();
    vi.useRealTimers();

    actions.submitPost.mockResolvedValue({
      ok: false, code: "INVALID", message: "Write a brief before submitting",
      fieldErrors: { brief: "Write a brief before submitting", plannedAt: "Pick a planned date before submitting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(actions.submitPost).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("Write a brief before submitting")).toBeTruthy();
    expect(screen.getByText("Pick a planned date before submitting")).toBeTruthy();
    expect(brief.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears Saved on a new edit and keeps fields read-only while submitting", async () => {
    vi.useFakeTimers();
    actions.updatePost.mockResolvedValue({ ok: true, status: "DRAFT" });
    show(panel({ can: { ...NO, edit: true, submit: true } }));
    const brief = screen.getByLabelText("Brief") as HTMLTextAreaElement;
    fireEvent.change(brief, { target: { value: "A" } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(screen.getByText("Saved")).toBeTruthy();
    fireEvent.change(brief, { target: { value: "AB" } });
    expect(screen.queryByText("Saved")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(800); });
    vi.useRealTimers();

    let finish!: (v: unknown) => void;
    actions.submitPost.mockReturnValue(new Promise((r) => { finish = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(actions.submitPost).toHaveBeenCalled());
    expect(brief.readOnly).toBe(true);
    expect((screen.getByLabelText("Format") as HTMLSelectElement).disabled).toBe(true);
    await act(async () => { finish({ ok: true }); });
    expect(brief.readOnly).toBe(false);
  });

  it("holds media moves during an upload and saves the latest list with the new file", async () => {
    let complete!: () => void;
    class PendingXhr {
      upload = { onprogress: null };
      status = 200;
      responseText = JSON.stringify({ secure_url: "https://x/v.mp4" });
      onload: null | (() => void) = null;
      onerror = null;
      open() {}
      send() { complete = () => this.onload?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", PendingXhr);
    actions.requestUploadSignature.mockResolvedValue({ ok: true, upload: { uploadUrl: "u", publicId: "p", params: {} } });
    actions.registerUpload.mockResolvedValue({ ok: true, mediaId: "m3" });
    actions.setPostMedia.mockResolvedValue({ ok: true });
    const media = (id: string) => ({ mediaId: id, type: "IMAGE" as const, url: null, order: 0 });
    const v = panel({ can: { ...NO, edit: true }, mockups: [media("m1"), media("m2")] });
    const { rerender } = show(v);
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Add media"), { target: { files: [file] } });
    await waitFor(() => expect(complete).toBeTypeOf("function"));
    expect((screen.getByRole("button", { name: "Remove 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move 1 later" }) as HTMLButtonElement).disabled).toBe(true);

    // The server list changes meanwhile (e.g. another tab removed m1).
    rerender(<PostPanel view={{ ...v, mockups: [media("m2")] }} closeHref="/content?channel=c1" />);
    await act(async () => { complete(); });
    await waitFor(() => expect(actions.setPostMedia).toHaveBeenCalledWith("p1", [
      { mediaId: "m2", role: "MOCKUP" }, { mediaId: "m3", role: "MOCKUP" },
    ]));
    expect(actions.registerUpload).toHaveBeenCalledWith("p", "VIDEO");
    vi.unstubAllGlobals();
  });

  it("refreshes when an autosave finds the post locked", async () => {
    vi.useFakeTimers();
    actions.updatePost.mockResolvedValue({ ok: false, code: "LOCKED", message: "This post can no longer be edited." });
    show(panel({ can: { ...NO, edit: true, submit: true } }));
    fireEvent.change(screen.getByLabelText("Caption draft"), { target: { value: "Hi" } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(screen.getByText("This post can no longer be edited.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("offers to fix an out-of-order date", async () => {
    actions.updatePost.mockResolvedValue({ ok: true, status: "DRAFT" });
    show(panel({ can: { ...NO, edit: true }, warnDate: "2026-11-09" }));
    fireEvent.click(screen.getByRole("button", { name: "Set to 9 Nov" }));
    await waitFor(() => expect(actions.updatePost).toHaveBeenCalledWith("p1", { plannedAt: "2026-11-09" }));
    expect((screen.getByLabelText("Post date") as HTMLInputElement).value).toBe("2026-11-09");
  });

  it("is read-only and locked for a creative on a submitted post", () => {
    show(panel({ post: { status: "SUBMITTED", submittedAt: new Date().toISOString() }, can: { ...NO, delete: true } }));
    expect((screen.getByLabelText("Brief") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText(/🔒 Locked/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
  });

  it("lets a lead send back with a note and open the pre-filled approve form", async () => {
    actions.loadApprove.mockResolvedValue({
      ok: true,
      form: {
        postId: "p1", brandName: "Brand X",
        defaults: { title: "Brand X · Feed · Promo", deadline: "2026-10-21", outputCount: 3, needsMotion: false, typeId: "t1" },
        divisionId: "d1", divisions: [{ id: "d1", name: "Marketing" }],
        types: [{ id: "t1", name: "Social media post", fieldSchema: [{ key: "size", label: "Size", type: "text", required: true }] }],
        team: [{ id: "a1", name: "Ari" }],
      },
    });
    show(panel({ post: { status: "SUBMITTED" }, can: { ...NO, approve: true, delete: true } }));

    fireEvent.click(screen.getByRole("button", { name: "Send back…" }));
    const note = screen.getByLabelText("Feedback note");
    const send = screen.getByRole("button", { name: "Send back" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(note, { target: { value: "Use the new price" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
    const form = await screen.findByRole("form", { name: "Approve & create request" });
    expect(actions.loadApprove).toHaveBeenCalledWith("p1");
    expect((within(form).getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Brand X · Feed · Promo");
    expect((within(form).getByLabelText("Deadline") as HTMLInputElement).value).toBe("2026-10-21");
    expect((within(form).getByLabelText("Outputs") as HTMLInputElement).value).toBe("3");
    expect(within(form).getByLabelText(/Size/)).toBeTruthy();

    actions.approvePost.mockResolvedValue({ ok: false, code: "INVALID", message: "x", fieldErrors: { "fields.size": "Size is required" } });
    fireEvent.click(within(form).getByRole("button", { name: "Approve & create" }));
    expect(await within(form).findByText("Size is required")).toBeTruthy();
    expect(actions.approvePost).toHaveBeenCalledWith("p1", expect.objectContaining({
      title: "Brand X · Feed · Promo", divisionId: "d1", typeId: "t1", deadline: "2026-10-21", outputCount: 3, needsMotion: false, fields: {},
    }));

    actions.approvePost.mockResolvedValue({ ok: true, requestId: "r9" });
    fireEvent.click(within(form).getByRole("button", { name: "Approve & create" }));
    const link = await screen.findByRole("link", { name: /View request/ });
    expect(link.getAttribute("href")).toBe("/requests/r9");
    expect(refresh).toHaveBeenCalled();
  });

  it("preselects the first type when the form has no default type", async () => {
    actions.loadApprove.mockResolvedValue({
      ok: true,
      form: {
        postId: "p1", brandName: "B", defaults: { title: "T", deadline: null, outputCount: 1, needsMotion: false, typeId: null },
        divisionId: "d1", divisions: [{ id: "d1", name: "Marketing" }], team: [],
        types: [{ id: "t1", name: "Alpha", fieldSchema: [] }, { id: "t2", name: "Beta", fieldSchema: [] }],
      },
    });
    actions.approvePost.mockResolvedValue({ ok: true, requestId: "r1" });
    show(panel({ post: { status: "SUBMITTED" }, can: { ...NO, approve: true } }));
    fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
    const form = await screen.findByRole("form", { name: "Approve & create request" });
    expect((within(form).getByLabelText("Type") as HTMLSelectElement).value).toBe("t1");
    fireEvent.click(within(form).getByRole("button", { name: "Approve & create" }));
    await waitFor(() => expect(actions.approvePost).toHaveBeenCalledWith("p1", expect.objectContaining({ typeId: "t1" })));
  });

  it("links an approved post to its request", () => {
    show(panel({ post: { status: "APPROVED", request: { id: "r1", status: "REQUESTED", assigneeId: null } } }));
    expect(screen.getByRole("link", { name: /View request/ }).getAttribute("href")).toBe("/requests/r1");
  });

  it("is a full-screen sheet below xl and a card from xl", () => {
    show(panel());
    const cls = screen.getByRole("complementary", { name: "Post details" }).className;
    expect(cls).toContain("max-xl:fixed");
    expect(cls).toContain("max-xl:inset-0");
    expect(cls).toContain("xl:rounded-xl");
    expect(cls).not.toMatch(/(^|\s)(max-)?lg:/);
  });

  it("closes with a link that drops the post", () => {
    show(panel());
    expect(screen.getByRole("link", { name: "Close" }).getAttribute("href")).toBe("/content?channel=c1");
  });

  it("highlights feedback comments and posts a new comment", async () => {
    actions.addContentComment.mockResolvedValue({ ok: true, commentId: "k2" });
    show(panel({ comments: [{ id: "k1", authorName: "Lead", body: "Fix the price", isFeedback: true, createdAt: new Date().toISOString() }] }));
    expect(screen.getByText("Fix the price").closest("[data-feedback]")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "On it" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(actions.addContentComment).toHaveBeenCalledWith("p1", "On it"));
    expect(refresh).toHaveBeenCalled();
  });
});
