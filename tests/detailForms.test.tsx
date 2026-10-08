// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const addComment = vi.fn();
const setIncludeKpi = vi.fn();
const setNeedsMotion = vi.fn();
vi.mock("@/app/(app)/requests/[id]/actions", () => ({
  addComment: (...a: unknown[]) => addComment(...a),
  addAttachment: vi.fn(), assignRequest: vi.fn(), removeAttachment: vi.fn(), setIncludeKpi: (...a: unknown[]) => setIncludeKpi(...a), setNeedsMotion: (...a: unknown[]) => setNeedsMotion(...a),
}));
const rescheduleRequest = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn(), rescheduleRequest: (...a: unknown[]) => rescheduleRequest(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CommentForm, AssigneePicker, MoveControl, DeadlineControl, IncludeKpiToggle, NeedsMotionToggle } from "@/app/(app)/requests/[id]/DetailForms";
import { splitMentions } from "@/lib/collab";

beforeEach(() => { addComment.mockReset(); refresh.mockReset(); });
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

describe("pickers", () => {
  it("assignee picker lists the options with Unassigned first", () => {
    render(<AssigneePicker requestId="r1" current="u2" options={[{ id: "u1", name: "Ana" }, { id: "u2", name: "Bima" }]} />);
    const sel = screen.getByLabelText("Assignee") as HTMLSelectElement;
    expect(sel.value).toBe("u2");
    expect(Array.from(sel.options).map((o) => o.text)).toEqual(["Unassigned", "Ana", "Bima"]);
  });
  it("move control offers only legal statuses and hides when none", () => {
    const { unmount } = render(<MoveControl requestId="r1" title="T" status="REQUESTED" />);
    const sel = screen.getByLabelText("Move to…") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.text)).not.toContain("Requested");
    unmount();
    const { container } = render(<MoveControl requestId="r1" title="T" status="CANCELLED" />);
    expect(container.textContent).toBe("");
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
    const i = screen.getByLabelText("Deadline") as HTMLInputElement;
    expect(i.type).toBe("date");
    expect(i.min).toBe("2026-10-01");
    expect(i.value).toBe("2026-10-14");
  });
  it("saves the picked day and refreshes", async () => {
    rescheduleRequest.mockResolvedValue({ ok: true });
    render(<DeadlineControl requestId="r1" current={null} minDay="2026-10-01" />);
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(rescheduleRequest).toHaveBeenCalledWith("r1", "2026-10-20");
  });
  it("shows the server message in an alert on failure", async () => {
    rescheduleRequest.mockResolvedValue({ ok: false, code: "CLOSED", message: "This request is already done." });
    render(<DeadlineControl requestId="r1" current="2026-10-14" minDay="2026-10-01" />);
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already done/);
    expect(refresh).not.toHaveBeenCalled();
  });
});
