// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const setTarget = vi.fn();
vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: (...a: unknown[]) => setTarget(...a) }));

import { ProgressBar } from "@/components/kpi/ProgressBar";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { TrendChart } from "@/components/kpi/TrendChart";

beforeEach(() => setTarget.mockReset());
afterEach(cleanup);

describe("ProgressBar", () => {
  it("exposes aria values and text", () => {
    render(<ProgressBar done={3} target={50} progress={0.06} label="Tasks" />);
    const bar = screen.getByRole("progressbar", { name: "Tasks" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(screen.getByText("3 of 50 tasks (6%)")).toBeTruthy();
  });
  it("clamps the visual bar at 100% but reports the real percent", () => {
    render(<ProgressBar done={60} target={50} progress={1.2} label="Tasks" />);
    const bar = screen.getByRole("progressbar");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(screen.getByText("60 of 50 tasks (120%)")).toBeTruthy();
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("60 of 50 tasks (120%)");
  });
  it("without a target shows plain text, no bar", () => {
    render(<ProgressBar done={2} target={null} progress={null} label="Tasks" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/No target set/)).toBeTruthy();
  });
});

const kpi = { tasksDone: 3, target: 50, progress: 0.06, onTimeRate: 0.5, avgTurnaroundDays: 1.5, revisionRounds: 0, totalOutputs: 6, activeWorkload: 2 };
const rows: TeamRow[] = [{ userId: "u1", name: "Fadli", role: "DESIGNER", kpi }];

describe("TeamTable editor", () => {
  it("links names to the personal dashboard for the month", () => {
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    expect(screen.getByRole("link", { name: "Fadli" }).getAttribute("href")).toBe("/dashboard?user=u1&month=2026-10");
  });
  it("keeps typed input and shows the message after a failed save", async () => {
    setTarget.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can set KPI targets." });
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    const input = screen.getByLabelText("Target tasks for Fadli") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByText(/Only leads and admins/)).closest("[aria-live]")).toBeTruthy();
    expect((screen.getByLabelText("Target tasks for Fadli") as HTMLInputElement).value).toBe("30");
    expect(setTarget).toHaveBeenCalledWith("u1", "2026-10", "DESIGNER", 30);
  });
  it("shows Saved on success", async () => {
    setTarget.mockResolvedValue({ ok: true });
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    fireEvent.change(screen.getByLabelText("Target tasks for Fadli"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });
  it("rejects non-integers client-side without calling the server", async () => {
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    fireEvent.change(screen.getByLabelText("Target tasks for Fadli"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a whole number.")).toBeTruthy();
    expect(setTarget).not.toHaveBeenCalled();
  });
  it("hides editors when canEdit is false", () => {
    render(<TeamTable rows={rows} month="2026-10" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("TrendChart", () => {
  it("offers the data as an accessible table", () => {
    const points = [
      { month: "2026-09", label: "September 2026", tasksDone: 4, target: 50 },
      { month: "2026-10", label: "October 2026", tasksDone: 7, target: null },
    ];
    render(<TrendChart points={points} />);
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getByRole("columnheader", { name: "Tasks done", hidden: true })).toBeTruthy();
    const cells = within(table).getAllByRole("row", { hidden: true }).map((r) => r.textContent);
    expect(cells).toContain("September 2026450");
    expect(cells).toContain("October 20267—");
    expect(screen.getByText("View as table")).toBeTruthy();
  });
});
