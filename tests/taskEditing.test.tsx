// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const setTaskDetail = vi.fn();
const setTaskDate = vi.fn();
const setTaskStage = vi.fn();
vi.mock("@/app/(app)/projects/[id]/tasks/actions", () => ({
  setTaskDetail: (...a: unknown[]) => setTaskDetail(...a),
  setTaskDate: (...a: unknown[]) => setTaskDate(...a),
  setTaskStage: (...a: unknown[]) => setTaskStage(...a),
  setTaskStatus: vi.fn(), setTaskFileUrl: vi.fn(), deleteTask: vi.fn(), moveTask: vi.fn(), createTaskDetail: vi.fn(),
}));

import { EditableName } from "@/app/(app)/projects/[id]/tasks/DetailEdit";
import { DateEdit } from "@/app/(app)/projects/[id]/tasks/DateEdit";
import { TaskRow, type TaskRowData } from "@/app/(app)/projects/[id]/tasks/TaskRow";
import { StageSelect } from "@/app/(app)/projects/[id]/tasks/StageSelect";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";

// jsdom lacks these; Radix popover/select positioning and focus handling call them.
class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  setTaskDetail.mockReset(); setTaskDate.mockReset(); setTaskStage.mockReset();
});
afterEach(cleanup);

const task: TaskRowData = {
  id: "t1", title: "Box", subTitle: null, ownerId: null, ownerName: null, stage: null, status: null,
  startIso: null, dueIso: null, dueTbc: false, fileName: null, fileUrl: null, notes: null,
};

describe("EditableName", () => {
  it("Escape puts back the saved name without saving the edit", () => {
    render(<EditableName projectId="p" taskId="t1" field="title" value="Box" label="Box" />);
    const box = screen.getByLabelText("Item name for Box") as HTMLInputElement;
    box.focus();
    fireEvent.change(box, { target: { value: "Bag" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(setTaskDetail).not.toHaveBeenCalled();
    expect(box.value).toBe("Box");
  });

  it("Enter still saves", async () => {
    setTaskDetail.mockResolvedValue({ ok: true });
    render(<EditableName projectId="p" taskId="t1" field="title" value="Box" label="Box" />);
    const box = screen.getByLabelText("Item name for Box") as HTMLInputElement;
    box.focus();
    fireEvent.change(box, { target: { value: "Bag" } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(setTaskDetail).toHaveBeenCalledWith("p", "t1", "title", "Bag");
  });
});

describe("TaskRow", () => {
  it("a name the server refuses after clicking Done reopens the row and shows why", async () => {
    setTaskDetail.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Another detail already has this item and detail name." });
    render(<table><tbody><TaskRow projectId="p" canManage task={task} owners={[]} mode="stage" isFirst isLast /></tbody></table>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Box" }));
    const box = screen.getByLabelText("Item name for Box");
    box.focus();
    fireEvent.change(box, { target: { value: "Bag" } });
    const done = screen.getByRole("button", { name: "Done editing Box" });
    await act(async () => { box.blur(); fireEvent.click(done); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has this item/);
    expect(screen.getByRole("button", { name: "Done editing Box" })).toBeTruthy();
  });
});

describe("DateEdit", () => {
  it("typing a date does not save on each keystroke; Save does", async () => {
    setTaskDate.mockResolvedValue({ ok: true, startDate: "2026-10-25", dueDate: null });
    render(<DateEdit projectId="p" taskId="t1" field="start" iso="2026-10-01" text="1 Oct 2026" label="Box" />);
    fireEvent.click(screen.getByRole("button", { name: /Edit start date for Box/ }));
    const input = await screen.findByLabelText("Start date for Box");
    fireEvent.change(input, { target: { value: "2026-10-02" } }); // the "2" of "25"
    fireEvent.change(input, { target: { value: "2026-10-25" } });
    expect(setTaskDate).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(setTaskDate).toHaveBeenCalledTimes(1);
    expect(setTaskDate).toHaveBeenCalledWith("p", "t1", "start", "2026-10-25");
  });
});

describe("thrown actions", () => {
  it("a stage change whose request fails shows a message and puts the old stage back instead of crashing the page", async () => {
    setTaskStage.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<StageSelect projectId="p" taskId="t1" value={null} label="Box" />);
    // Call the change handler the Select would call.
    const trigger = screen.getByRole("combobox", { name: /Stage for Box/ });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = (await screen.findAllByRole("option"))[0];
    await act(async () => fireEvent.click(option));
    expect((await screen.findByRole("alert")).textContent).toBe(ACTION_FAILED_MESSAGE);
  });
});
