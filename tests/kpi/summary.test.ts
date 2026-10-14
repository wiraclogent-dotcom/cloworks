import { describe, it, expect } from "vitest";
import { projectTotals, shortMonthLabel, teamSummaryCells, personSummaryCells } from "@/lib/kpi/summary";
import type { PersonProjectKpi } from "@/lib/kpi/projectQueries";

const q = (done: number, items: number, onTimeCount: number, lateCount: number) =>
  ({ score: { score: 80, parts: {}, usedParts: [], items, done, onTimeCount, lateCount }, items: [] });
const none = () => q(0, 0, 0, 0);
const kpi = (userId: string, quarters: [ReturnType<typeof q>, ReturnType<typeof q>, ReturnType<typeof q>, ReturnType<typeof q>]): PersonProjectKpi =>
  ({ userId, year: 2026, quarters: { 1: quarters[0], 2: quarters[1], 3: quarters[2], 4: quarters[3] }, unscheduled: [], excluded: [], otherWork: [], yearScore: null }) as unknown as PersonProjectKpi;
const req = (userId: string, tasksDone: number, progress: number | null) => ({ userId, kpi: { tasksDone, progress } });
const cell = (cells: { key: string; label: string; value: string; hint?: string }[], key: string) => cells.find((c) => c.key === key)!;

describe("shortMonthLabel", () => {
  it("is Mon YYYY", () => {
    expect(shortMonthLabel("2026-10")).toBe("Oct 2026");
    expect(shortMonthLabel("2026-01")).toBe("Jan 2026");
  });
});

describe("projectTotals", () => {
  it("sums done, items, on time and late over every roster quarter", () => {
    const t = projectTotals([kpi("a", [q(1, 2, 1, 0), q(2, 3, 1, 1), none(), none()]), kpi("b", [none(), none(), none(), q(1, 1, 0, 1)])]);
    expect(t).toEqual({ done: 4, items: 6, onTime: 2, late: 2 });
  });
});

describe("teamSummaryCells", () => {
  const rows = [req("a", 3, 0.5), req("b", 4, null), req("c", 0, 1)];
  const projects = [kpi("a", [q(1, 2, 1, 0), q(2, 3, 1, 1), none(), none()]), kpi("d", [none(), none(), none(), q(1, 1, 0, 1)])];
  const cells = teamSummaryCells({ month: "2026-10", year: 2026, requestRows: rows, projectKpis: projects });

  it("has the five cards in order with period labels", () => {
    expect(cells.map((c) => c.key)).toEqual(["people", "reqDone", "reqProgress", "projDone", "projOnTime"]);
    expect(cells.map((c) => c.label)).toEqual(["People", "Request tasks done · Oct 2026", "Request target progress · Oct 2026", "Project items done · 2026", "Project on time · 2026"]);
  });
  it("People is the union of both rosters, with the split in the sub-line", () => {
    expect(cell(cells, "people").value).toBe("4");
    expect(cell(cells, "people").hint).toBe("3 requests · 2 projects");
  });
  it("sums request tasks and averages target progress as before", () => {
    expect(cell(cells, "reqDone").value).toBe("7");
    expect(cell(cells, "reqProgress").value).toBe("75%");
    expect(cell(cells, "reqProgress").hint).toBe("Across 2 people with a target.");
  });
  it("project done is Σ done / Σ items and on time is Σ onTime / (onTime+late)", () => {
    expect(cell(cells, "projDone").value).toBe("4/6");
    expect(cell(cells, "projOnTime").value).toBe("50%");
  });
  it("shows — with the old hint when nobody has a target, and — for on time with no judged items", () => {
    const empty = teamSummaryCells({ month: "2026-10", year: 2026, requestRows: [req("a", 0, null)], projectKpis: [kpi("a", [q(0, 1, 0, 0), none(), none(), none()])] });
    expect(cell(empty, "reqProgress").value).toBe("—");
    expect(cell(empty, "reqProgress").hint).toBe("Nobody has a target this month.");
    expect(cell(empty, "projOnTime").value).toBe("—");
    expect(cell(empty, "projDone").value).toBe("0/1");
  });
});

describe("personSummaryCells", () => {
  const base = { month: "2026-10", year: 2026 };
  it("has four cards (no People)", () => {
    const cells = personSummaryCells({ ...base, request: { tasksDone: 5, target: 10, progress: 0.5 }, project: kpi("a", [q(1, 2, 1, 1), none(), none(), none()]) });
    expect(cells.map((c) => c.key)).toEqual(["reqDone", "reqProgress", "projDone", "projOnTime"]);
    expect(cells.map((c) => c.value)).toEqual(["5", "50%", "1/2", "50%"]);
    expect(cell(cells, "reqProgress").hint).toBe("5 of 10 tasks");
  });
  it("uses — when a section is empty", () => {
    const cells = personSummaryCells({ ...base, request: null, project: kpi("a", [none(), none(), none(), none()]) });
    expect(cells.map((c) => c.value)).toEqual(["—", "—", "—", "—"]);
    expect(cell(cells, "reqProgress").hint).toBe("No target this month.");
  });
  it("target progress is — with a hint when there is activity but no target", () => {
    const cells = personSummaryCells({ ...base, request: { tasksDone: 2, target: null, progress: null }, project: null });
    expect(cell(cells, "reqDone").value).toBe("2");
    expect(cell(cells, "reqProgress").value).toBe("—");
    expect(cell(cells, "projDone").value).toBe("—");
  });
});
