// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const addComment = vi.fn();
const setIncludeKpi = vi.fn();
vi.mock("@/app/(app)/requests/[id]/actions", () => ({
  addComment: (...a: unknown[]) => addComment(...a),
  addAttachment: vi.fn(), assignRequest: vi.fn(), removeAttachment: vi.fn(), setIncludeKpi: (...a: unknown[]) => setIncludeKpi(...a),
}));
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CommentForm, AssigneePicker, MoveControl, IncludeKpiToggle } from "@/app/(app)/requests/[id]/DetailForms";
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
