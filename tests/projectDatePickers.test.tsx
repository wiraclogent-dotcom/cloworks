// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const createTaskDetail = vi.fn();
vi.mock("@/app/(app)/projects/[id]/tasks/actions", () => ({
  createTaskDetail: (...a: unknown[]) => createTaskDetail(...a),
}));
const createMilestone = vi.fn();
const updateMilestone = vi.fn();
vi.mock("@/app/(app)/projects/[id]/actions", () => ({
  createMilestone: (...a: unknown[]) => createMilestone(...a),
  updateMilestone: (...a: unknown[]) => updateMilestone(...a),
  deleteMilestone: vi.fn(),
}));

import { AddDetailForm } from "@/app/(app)/projects/[id]/tasks/AddDetailForm";
import { MilestoneList } from "@/app/(app)/projects/[id]/MilestoneList";

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  createTaskDetail.mockReset(); createMilestone.mockReset(); updateMilestone.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T03:00:00Z")); // the calendar opens on today's month
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function pickDay(trigger: HTMLElement, day: number) {
  fireEvent.click(trigger);
  const cell = screen.getAllByRole("gridcell").filter((c) => !c.hasAttribute("data-outside")).find((c) => c.textContent === String(day))!;
  fireEvent.click(cell.querySelector("button")!);
}

describe("AddDetailForm dates", () => {
  it("has no native date inputs; Start and Due are calendar pickers that submit YYYY-MM-DD", async () => {
    createTaskDetail.mockResolvedValue({ ok: true });
    const { container } = render(<AddDetailForm projectId="p" mode="status" owners={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add detail/ }));
    expect(container.querySelector('input[type="date"]')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("e.g. Shoe Foam"), { target: { value: "Box" } });
    pickDay(screen.getByRole("button", { name: /^Start/ }), 5);
    pickDay(screen.getByRole("button", { name: /^Due/ }), 20);
    expect(screen.getByRole("button", { name: /^Start/ }).textContent).toContain("5 Oct 2026");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add detail" })));
    expect(createTaskDetail).toHaveBeenCalledWith("p", expect.objectContaining({ title: "Box", startDate: "2026-10-05", dueDate: "2026-10-20" }));
  });

  it("a picked date can be cleared again", () => {
    render(<AddDetailForm projectId="p" mode="stage" owners={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add detail/ }));
    pickDay(screen.getByRole("button", { name: /^Due/ }), 20);
    fireEvent.click(screen.getByRole("button", { name: /^Clear Due/ }));
    expect(screen.getByRole("button", { name: /^Due/ }).textContent).toContain("Select date");
  });
});

describe("AddDetailForm ids", () => {
  it("do not collide when two forms exist", () => {
    render(<><AddDetailForm projectId="p" mode="status" owners={[]} /><AddDetailForm projectId="q" mode="status" owners={[]} /></>);
    for (const b of screen.getAllByRole("button", { name: /Add detail/ })) fireEvent.click(b);
    const ids = [...document.querySelectorAll("button[id]")].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((i) => i === "new-detail-start")).toBe(false);
  });
});

describe("MilestoneList date", () => {
  it("adding a milestone picks the date with the calendar and sends YYYY-MM-DD", async () => {
    createMilestone.mockResolvedValue({ ok: true });
    const { container } = render(<MilestoneList projectId="p" milestones={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: /Add milestone/ }));
    expect(container.querySelector('input[type="date"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Name for new milestone"), { target: { value: "Client review" } });
    pickDay(screen.getByRole("button", { name: /Date for new milestone/ }), 22);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Add$/ })));
    expect(createMilestone).toHaveBeenCalledWith("p", { title: "Client review", date: "2026-10-22", done: false });
  });

  it("Add stays disabled until a date is picked", async () => {
    createMilestone.mockResolvedValue({ ok: true });
    render(<MilestoneList projectId="p" milestones={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: /Add milestone/ }));
    fireEvent.change(screen.getByLabelText("Name for new milestone"), { target: { value: "Client review" } });
    const add = screen.getByRole("button", { name: /^Add$/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    pickDay(screen.getByRole("button", { name: /Date for new milestone/ }), 22);
    expect(add.disabled).toBe(false);
  });

  it("editing starts from the saved date", () => {
    render(<MilestoneList projectId="p" milestones={[{ id: "m1", title: "Kickoff", dateIso: "2026-11-03", done: false }]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Kickoff" }));
    expect(screen.getByRole("button", { name: /Date for Kickoff/ }).textContent).toContain("3 Nov 2026");
  });
});
