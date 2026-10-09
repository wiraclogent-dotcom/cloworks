import { describe, it, expect } from "vitest";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { finalShare, isTaskDone, productSummaries, statusCounts, taskMode } from "@/lib/projectProgress";

const row = (title: string, stage: ProjectStage | null, status: ProjectStatus | null) =>
  ({ title, stage, status, startDate: null, dueDate: null, dueTbc: false });

describe("taskMode", () => {
  it("is status mode only when rows carry a status and no stage", () => {
    expect(taskMode([])).toBe("stage");
    expect(taskMode([row("A", "MANUSCRIPT", null)])).toBe("stage");
    expect(taskMode([row("A", null, "IN_PROGRESS")])).toBe("status");
    expect(taskMode([row("A", null, null), row("B", null, "DONE")])).toBe("status");
  });
});

describe("tracker (status) progress", () => {
  const tracker = [
    row("Launch", null, "DONE"),
    row("Launch", null, "IN_PROGRESS"),
    row("Retail", null, "DONE"),
    row("Retail", null, "DONE"),
    row("Retail", null, null),
  ];

  it("counts Done rows towards the completed share", () => {
    expect(finalShare(tracker)).toEqual({ done: 3, total: 5, percent: 60 });
  });

  it("counts rows per status and keeps unset ones separate", () => {
    expect(statusCounts(tracker)).toEqual({ NOT_STARTED: 0, IN_PROGRESS: 1, IN_REVIEW: 0, ON_HOLD: 0, DONE: 3, none: 1 });
  });

  it("summarises products by their Done rows", () => {
    expect(productSummaries(tracker).map((p) => [p.title, p.finalCount, p.variants])).toEqual([["Launch", 1, 2], ["Retail", 2, 3]]);
  });

  it("isTaskDone follows the mode", () => {
    expect(isTaskDone(row("A", "FINAL_ARTWORK", "IN_PROGRESS"), "stage")).toBe(true);
    expect(isTaskDone(row("A", "FINAL_ARTWORK", "IN_PROGRESS"), "status")).toBe(false);
    expect(isTaskDone(row("A", null, "DONE"), "status")).toBe(true);
  });
});
