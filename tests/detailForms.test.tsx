// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const addComment = vi.fn();
const setAssignees = vi.fn();
const setIncludeKpi = vi.fn();
const setNeedsMotion = vi.fn();
vi.mock("@/app/(app)/requests/[id]/actions", () => ({
  addComment: (...a: unknown[]) => addComment(...a),
  addAttachment: vi.fn(), setAssignees: (...a: unknown[]) => setAssignees(...a), removeAttachment: vi.fn(), setIncludeKpi: (...a: unknown[]) => setIncludeKpi(...a), setNeedsMotion: (...a: unknown[]) => setNeedsMotion(...a),
}));
const rescheduleRequest = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn(), rescheduleRequest: (...a: unknown[]) => rescheduleRequest(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CommentForm, AssigneesPicker, MoveControl, DeadlineControl, IncludeKpiToggle, NeedsMotionToggle } from "@/app/(app)/requests/[id]/DetailForms";
import { splitMentions } from "@/lib/collab";

beforeEach(() => { addComment.mockReset(); setAssignees.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

describe("CommentForm", () => {
  it("keeps the typed text and shows the message after a failed submit", async () => {
    addComment.mockResolvedValue({ ok: false, code: "INVALID", message: "Comments can be at most 5000 characters." });
    render(<CommentForm requestId="r1" />);
    const box = screen.getByLabelText("Add a comment") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello @irsyad" } });
    fireEvent.click(screen.getByRole("button", { name: /post comment/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/at most 5000/);
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe("hello @irsyad");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("clears and refreshes after success", async () => {
    addComment.mockResolvedValue({ ok: true, mentionedUserIds: [] });
    render(<CommentForm requestId="r1" />);
    fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /post comment/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe("");
    expect(addComment).toHaveBeenCalledWith("r1", "hi");
  });
});

const OPTIONS = [{ id: "u1", name: "Ana" }, { id: "u2", name: "Fafa" }, { id: "u3", name: "Bima" }];
const addSelect = () => screen.getByRole("combobox", { name: "Add assignee" }) as HTMLSelectElement;

describe("AssigneesPicker", () => {
  it("renders one chip per current assignee, each with a Remove button", () => {
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }, { id: "u3", name: "Bima" }]} options={OPTIONS} />);
    expect(screen.getByRole("group", { name: "Assignees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Fafa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Bima" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
  });
  it("+ Add person lists only options that are not already chosen", () => {
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    expect(Array.from(addSelect().options).map((o) => o.text)).toEqual(["+ Add person", "Ana", "Bima"]);
  });
  it("choosing someone sends just that addition, then refreshes", async () => {
    setAssignees.mockResolvedValue({ ok: true });
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    fireEvent.change(addSelect(), { target: { value: "u1" } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setAssignees).toHaveBeenCalledWith("r1", { add: ["u1"] });
    expect(screen.getByRole("button", { name: "Remove Ana" })).toBeTruthy();
  });
  it("removing someone sends just that removal", async () => {
    setAssignees.mockResolvedValue({ ok: true });
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }, { id: "u3", name: "Bima" }]} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Fafa" }));
    await waitFor(() => expect(setAssignees).toHaveBeenCalledWith("r1", { remove: ["u2"] }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Remove Fafa" })).toBeNull();
  });
  it("reverts and shows the server message in an alert when the change fails", async () => {
    setAssignees.mockResolvedValue({ ok: false, code: "INVALID", message: "Ana is not on the creative team." });
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    fireEvent.change(addSelect(), { target: { value: "u1" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Ana is not on the creative team/);
    expect(screen.queryByRole("button", { name: "Remove Ana" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Fafa" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("reverts with a generic message when the action throws", async () => {
    setAssignees.mockRejectedValue(new Error("network"));
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Fafa" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not change the assignees. Try again.");
    expect(screen.getByRole("button", { name: "Remove Fafa" })).toBeTruthy();
  });
  it("moves focus to the add select after an add and after a remove", async () => {
    setAssignees.mockResolvedValue({ ok: true });
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    fireEvent.change(addSelect(), { target: { value: "u1" } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(addSelect());
    const remove = screen.getByRole("button", { name: "Remove Ana" });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(document.activeElement).toBe(addSelect());
  });
  it("falls back to the group when nobody is left to add", async () => {
    setAssignees.mockResolvedValue({ ok: true });
    const two = OPTIONS.slice(0, 2);
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={two} />);
    fireEvent.change(addSelect(), { target: { value: "u1" } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(addSelect().disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Assignees" }));
  });
  it("stays mounted and re-syncs when the server list changes, keeping a failed-change error", async () => {
    setAssignees.mockResolvedValue({ ok: false, code: "INVALID", message: "Nope." });
    const { rerender } = render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    const select = addSelect();
    fireEvent.change(select, { target: { value: "u1" } });
    await screen.findByRole("alert");
    rerender(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }, { id: "u3", name: "Bima" }]} options={OPTIONS} />);
    expect(addSelect()).toBe(select);
    expect(screen.getByRole("button", { name: "Remove Bima" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Nope/);
  });
  it("ignores further changes while one is in flight, and keeps focus on the control", async () => {
    let resolve!: (v: { ok: true }) => void;
    setAssignees.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AssigneesPicker requestId="r1" current={[{ id: "u2", name: "Fafa" }]} options={OPTIONS} />);
    fireEvent.change(addSelect(), { target: { value: "u1" } });
    expect(addSelect().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(addSelect());
    fireEvent.change(addSelect(), { target: { value: "u3" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Fafa" }));
    expect(setAssignees).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    fireEvent.change(addSelect(), { target: { value: "u3" } });
    expect(setAssignees).toHaveBeenCalledTimes(2);
  });
  it("never offers an off-team person once they are removed (adding them back would be refused)", async () => {
    setAssignees.mockResolvedValue({ ok: true });
    const opts = [{ id: "u9", name: "Daus (inactive)", offTeam: true as const }, ...OPTIONS];
    render(<AssigneesPicker requestId="r1" current={[{ id: "u9", name: "Daus" }, { id: "u2", name: "Fafa" }]} options={opts} />);
    expect(Array.from(addSelect().options).map((o) => o.text)).toEqual(["+ Add person", "Ana", "Bima"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Daus" }));
    await waitFor(() => expect(setAssignees).toHaveBeenCalledWith("r1", { remove: ["u9"] }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(Array.from(addSelect().options).map((o) => o.text)).toEqual(["+ Add person", "Ana", "Bima"]);
    // A team member who is removed is offered again at once.
    fireEvent.click(screen.getByRole("button", { name: "Remove Fafa" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(Array.from(addSelect().options).map((o) => o.text)).toEqual(["+ Add person", "Ana", "Fafa", "Bima"]);
  });
  it("with nobody assigned it still offers the add control", () => {
    render(<AssigneesPicker requestId="r1" current={[]} options={OPTIONS} />);
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toHaveLength(0);
    expect(addSelect().options).toHaveLength(4);
  });
});

describe("pickers", () => {
  it("move control offers only legal statuses; a cancelled request can only be restored to Requested", () => {
    const { unmount } = render(<MoveControl requestId="r1" title="T" status="REQUESTED" />);
    const sel = screen.getByLabelText("Move to…") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.text)).not.toContain("Requested");
    unmount();
    render(<MoveControl requestId="r1" title="T" status="CANCELLED" />);
    const restore = screen.getByLabelText("Move to…") as HTMLSelectElement;
    expect(Array.from(restore.options).map((o) => o.text)).toEqual(["Choose a status", "Requested"]);
    expect(screen.getByText("Choose Requested to restore this request.")).toBeTruthy();
  });
});

describe("mention text", () => {
  it("stays readable as text", () => {
    expect(splitMentions("ping @Irsyad now").map((s) => s.text).join("")).toBe("ping @Irsyad now");
  });
});

describe("IncludeKpiToggle", () => {
  it("is a labelled checkbox that saves the new value and refreshes", async () => {
    setIncludeKpi.mockResolvedValue({ ok: true });
    render(<IncludeKpiToggle requestId="r1" initial={true} />);
    const box = screen.getByLabelText("Counts toward KPI") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(setIncludeKpi).toHaveBeenCalledWith("r1", false));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("reverts and shows the server message on failure", async () => {
    setIncludeKpi.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can change whether a request counts toward KPI." });
    render(<IncludeKpiToggle requestId="r1" initial={true} />);
    fireEvent.click(screen.getByLabelText("Counts toward KPI"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Only leads and admins/);
    expect((screen.getByLabelText("Counts toward KPI") as HTMLInputElement).checked).toBe(true);
  });
});

describe("NeedsMotionToggle", () => {
  it("renders nothing for people without request.assign", () => {
    render(<NeedsMotionToggle requestId="r1" initial={false} canEdit={false} />);
    expect(screen.queryByLabelText("Needs motion")).toBeNull();
  });
  it("is a labelled checkbox for editors that saves the new value and refreshes", async () => {
    setNeedsMotion.mockResolvedValue({ ok: true });
    render(<NeedsMotionToggle requestId="r1" initial={false} canEdit />);
    const box = screen.getByLabelText("Needs motion") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(setNeedsMotion).toHaveBeenCalledWith("r1", true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("reverts and shows the server message on failure", async () => {
    setNeedsMotion.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can change whether a task needs motion." });
    render(<NeedsMotionToggle requestId="r1" initial={true} canEdit />);
    fireEvent.click(screen.getByLabelText("Needs motion"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Only leads and admins/);
    expect((screen.getByLabelText("Needs motion") as HTMLInputElement).checked).toBe(true);
  });
});

describe("DeadlineControl", () => {
  beforeEach(() => rescheduleRequest.mockReset());
  it("renders a date input with min and the current value", () => {
    render(<DeadlineControl requestId="r1" current="2026-10-14" minDay="2026-10-01" />);
    const i = screen.getByLabelText("Change deadline") as HTMLInputElement;
    expect(i.type).toBe("date");
    expect(i.min).toBe("2026-10-01");
    expect(i.value).toBe("2026-10-14");
  });
  it("saves the picked day and refreshes", async () => {
    rescheduleRequest.mockResolvedValue({ ok: true });
    render(<DeadlineControl requestId="r1" current={null} minDay="2026-10-01" />);
    fireEvent.change(screen.getByLabelText("Change deadline"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(rescheduleRequest).toHaveBeenCalledWith("r1", "2026-10-20");
  });
  it("shows the server message in an alert on failure", async () => {
    rescheduleRequest.mockResolvedValue({ ok: false, code: "CLOSED", message: "This request is already done." });
    render(<DeadlineControl requestId="r1" current="2026-10-14" minDay="2026-10-01" />);
    fireEvent.change(screen.getByLabelText("Change deadline"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already done/);
    expect(refresh).not.toHaveBeenCalled();
  });
});
