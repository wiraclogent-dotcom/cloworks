import { describe, it, expect } from "vitest";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, isClosedProject, splitProjects } from "@/lib/projects";
import { PROJECT_STATUS_TONE } from "@/lib/palette";
import { TASK_STATUS_ORDER } from "@/lib/projectTasks";

const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const p = (id: string, status: "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "ON_HOLD" | "CANCELLED", due: string | null, title = id) =>
  ({ id, title, status, dueDate: due ? d(due) : null });

describe("project lifecycle helpers", () => {
  it("Canceled is a project status (listed after Done), labelled like the stage and toned 'cancelled'", () => {
    expect(PROJECT_STATUSES).toContain("CANCELLED");
    expect(PROJECT_STATUSES.indexOf("CANCELLED")).toBeGreaterThan(PROJECT_STATUSES.indexOf("DONE"));
    expect(PROJECT_STATUS_LABEL.CANCELLED).toBe("Canceled");
    expect(PROJECT_STATUS_TONE.CANCELLED).toBe("cancelled");
  });
  it("is NOT a task status", () => {
    expect(TASK_STATUS_ORDER).not.toContain("CANCELLED");
  });
  it("isClosedProject: Done and Canceled only", () => {
    expect(isClosedProject("DONE")).toBe(true);
    expect(isClosedProject("CANCELLED")).toBe(true);
    for (const s of ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD"] as const) expect(isClosedProject(s)).toBe(false);
  });
});

describe("splitProjects", () => {
  const rows = [
    p("act1", "IN_PROGRESS", "2026-10-20"),
    p("done-old", "DONE", "2026-08-01"),
    p("done-new", "DONE", "2026-10-01"),
    p("done-none", "DONE", null),
    p("cx-b", "CANCELLED", "2026-09-01", "B title"),
    p("cx-a", "CANCELLED", "2026-09-01", "A title"),
    p("hold", "ON_HOLD", null),
  ];
  it("active = not closed (input order kept); completed and canceled are separate", () => {
    const s = splitProjects(rows);
    expect(s.active.map((r) => r.id)).toEqual(["act1", "hold"]);
    expect(s.completed).toHaveLength(3);
    expect(s.canceled).toHaveLength(2);
  });
  it("closed lists sort by due date DESC, no date last, then title", () => {
    const s = splitProjects(rows);
    expect(s.completed.map((r) => r.id)).toEqual(["done-new", "done-old", "done-none"]);
    expect(s.canceled.map((r) => r.id)).toEqual(["cx-a", "cx-b"]);
  });
  it("empty input gives three empty lists", () => {
    expect(splitProjects([])).toEqual({ active: [], completed: [], canceled: [] });
  });
});
