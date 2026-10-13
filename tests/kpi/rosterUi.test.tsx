// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

const setKpiRoster = vi.fn();
vi.mock("@/app/(app)/dashboard/team/actions", () => ({ setKpiRoster: (...a: unknown[]) => setKpiRoster(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh }) }));

import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { ProjectTeamTable, projectTeamRows, type ProjectTeamRow } from "@/components/kpi/project/ProjectTeamTable";
import type { PersonProjectKpi } from "@/lib/kpi/projectQueries";

// jsdom has no showModal on <dialog>.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  setKpiRoster.mockReset(); refresh.mockReset();
});
afterEach(cleanup);

const people = [{ id: "a", name: "Ana" }, { id: "b", name: "Budi" }, { id: "c", name: "Cara" }];
const open = (props: Partial<Parameters<typeof ManagePeopleDialog>[0]> = {}) => {
  render(<ManagePeopleDialog kind="REQUESTS" candidates={people} selected={["a", "c"]} month="2026-10" {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Manage people" }));
};

describe("ManagePeopleDialog", () => {
  it("opens a dialog titled for the kind, listing every candidate with the shown people ticked", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Manage people · Requests KPI" })).toBeTruthy();
    const boxes = within(dialog).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => [b.closest("label")!.textContent, b.checked])).toEqual([["Ana", true], ["Budi", false], ["Cara", true]]);
  });

  it("is titled Projects KPI for the projects kind", () => {
    open({ kind: "PROJECTS", month: undefined, year: 2026 });
    expect(screen.getByRole("heading", { name: "Manage people · Projects KPI" })).toBeTruthy();
  });

  it("does not tick selected ids that are not candidates", () => {
    open({ selected: ["a", "ghost"] });
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).filter((b) => b.checked)).toHaveLength(1);
  });

  it("saves the ticked ids with the month, then closes and refreshes", async () => {
    setKpiRoster.mockResolvedValue({ ok: true });
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ana" })); // untick
    fireEvent.click(screen.getByRole("checkbox", { name: "Budi" })); // tick
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(setKpiRoster).toHaveBeenCalledWith({ kind: "REQUESTS", userIds: ["b", "c"], month: "2026-10" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("sends the year for the projects kind", async () => {
    setKpiRoster.mockResolvedValue({ ok: true });
    open({ kind: "PROJECTS", month: undefined, year: 2026, selected: [] });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cara" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(setKpiRoster).toHaveBeenCalledWith({ kind: "PROJECTS", userIds: ["c"], year: 2026 }));
  });

  it("shows a failure in an Alert and keeps the dialog open with the ticks", async () => {
    setKpiRoster.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can manage the team." });
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Budi" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Only leads and admins can manage the team.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Budi" }) as HTMLInputElement).checked).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows an Alert when the action throws", async () => {
    setKpiRoster.mockRejectedValue(new Error("boom"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save. Please try again.")).toBeTruthy();
  });
});

describe("ProjectTeamTable with a person who has no targets", () => {
  const row = (over: Partial<ProjectTeamRow> = {}): ProjectTeamRow =>
    ({ userId: "n", name: "Nia", quarters: [null, null, null, null], year: null, done: 0, items: 0, onTimePct: null, hasTargets: false, ...over });

  it("shows dashes, Done 0/0 and a Set targets link to their page", () => {
    render(<ProjectTeamTable rows={[row()]} year={2026} canOpen />);
    const tr = screen.getByText("Nia").closest("tr")!;
    expect(tr.textContent).toContain("0/0");
    expect(within(tr).getAllByText("—").length).toBe(6); // Q1..Q4, Year, On time
    expect(within(tr).getByRole("link", { name: "Set targets" }).getAttribute("href")).toBe("/dashboard/projects/n?year=2026");
  });

  it("has no Set targets link without canOpen", () => {
    render(<ProjectTeamTable rows={[row()]} year={2026} canOpen={false} />);
    expect(screen.getByText("Nia")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not show Set targets for someone who has targets", () => {
    render(<ProjectTeamTable rows={[row({ hasTargets: true, year: 70, quarters: [null, null, null, 70], items: 2, done: 1 })]} year={2026} canOpen />);
    expect(screen.queryByRole("link", { name: "Set targets" })).toBeNull();
  });
});

describe("projectTeamRows", () => {
  const emptyScore = { score: null, parts: { onTime: null, completion: null, speed: null, revisions: null, slips: null }, usedParts: [], items: 0, done: 0, onTimeCount: 0, lateCount: 0 } as const;
  const emptyQ = () => ({ score: { ...emptyScore, usedParts: [] as never[] }, items: [] });
  const kpi = (over: Partial<PersonProjectKpi> = {}) => ({
    userId: "n", year: 2026, name: "Nia", quarters: { 1: emptyQ(), 2: emptyQ(), 3: emptyQ(), 4: emptyQ() },
    unscheduled: [], excluded: [], otherWork: [], yearScore: null, ...over,
  }) as PersonProjectKpi & { name: string };

  it("keeps a person with no targets, flagged hasTargets false", () => {
    expect(projectTeamRows([kpi()])).toEqual([
      { userId: "n", name: "Nia", quarters: [null, null, null, null], year: null, done: 0, items: 0, onTimePct: null, hasTargets: false },
    ]);
  });
});
